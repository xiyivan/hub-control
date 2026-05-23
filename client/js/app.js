// ============================================================================
// HubControl App - main controller
// Orchestrates mode switching, control lifecycle, gamepad state sending, and
// coordinates between WebSocket, Editor, Storage, and UI modules.
// ============================================================================
HubControl.App = class App {
    constructor() {
        // Core modules
        this.storage = new HubControl.StorageManager();
        this.settings = this.storage.getSettings();

        // WebSocket
        const wsUrl = `ws://${this.settings.serverIP}:${this.settings.serverPort}/ws`;
        this.ws = new HubControl.WSManager(wsUrl);

        // UI
        this.ui = new HubControl.UI(this);

        // State
        this.mode = 'play'; // 'play' | 'edit'
        this.controls = new Map(); // id -> control instance
        this._sendInterval = null;
        this._sendActive = false;
        this._lastGamepadState = null;

        // Editor (initialized after DOM ready)
        this.editor = null;

        // Setup
        this._setupWS();
        this._setupSendLoop();
        this._setupAutoSave();
        this._initEditorAfterDOM();
    }

    // --- Initialization ---
    _initEditorAfterDOM() {
        // Editor needs the surface elements which exist in the HTML
        this.editor = new HubControl.Editor(this);
        this.editor.gridSize = this.settings.gridSize;
        this.editor.gridSnap = this.settings.gridSnap;
        this.ui.initEditorToolbar();
    }

    // --- WebSocket ---
    _setupWS() {
        this.ws.on('statusChange', (status) => {
            if (status === 'connected') this.ui.toast('Connected to server');
            else if (status === 'disconnected') this.ui.toast('Disconnected from server', 4000);
        });
        this.ws.on('open', () => {
            // Re-register all control event listeners? They persist.
        });
        this.ws.connect();
    }

    _reconnect() {
        this.settings = this.storage.getSettings();
        const wsUrl = `ws://${this.settings.serverIP}:${this.settings.serverPort}/ws`;
        this.ws.disconnect();
        this.ws = new HubControl.WSManager(wsUrl);
        this._setupWS();
        this.ws.connect();
    }

    // --- Mode Switching ---
    toggleMode() {
        this.setMode(this.mode === 'play' ? 'edit' : 'play');
    }

    setMode(mode) {
        this.mode = mode;
        this.ui.updateModeButton(mode);

        // Move control DOM elements between surfaces
        const targetSurface = mode === 'play'
            ? document.getElementById('control-surface')
            : document.getElementById('editor-surface');

        this.controls.forEach(ctrl => {
            if (ctrl.el && ctrl.el.parentElement !== targetSurface) {
                targetSurface.appendChild(ctrl.el);
            }
        });

        // Deselect when leaving edit mode
        if (mode === 'play' && this.editor) {
            this.editor.deselectControl();
        }
    }

    // --- Control Lifecycle ---
    createControl(type, x, y, w, h, properties = {}) {
        const ClsMap = {
            joystick: HubControl.Controls.VirtualJoystick,
            trigger: HubControl.Controls.VirtualTrigger,
            xboxButton: HubControl.Controls.XboxButton,
            dpad: HubControl.Controls.DPad,
            keyboardButton: HubControl.Controls.KeyboardButton,
            shoulderButton: HubControl.Controls.ShoulderButton,
        };
        const Cls = ClsMap[type];
        if (!Cls) return null;

        const ctrl = new Cls(x, y, w, h, properties);
        ctrl.createElement();

        const surface = this.mode === 'play'
            ? document.getElementById('control-surface')
            : document.getElementById('editor-surface');
        surface.appendChild(ctrl.el);

        this.controls.set(ctrl.id, ctrl);

        // Hook touch events to start/stop send loop
        if (type !== 'keyboardButton') {
            const origStart = ctrl._onTouchStart.bind(ctrl);
            ctrl._onTouchStart = (e) => {
                origStart(e);
                this._ensureSending();
            };
            const origEnd = ctrl._onTouchEnd.bind(ctrl);
            ctrl._onTouchEnd = (e) => {
                origEnd(e);
            };
        }

        // Keyboard buttons send on touch
        if (type === 'keyboardButton') {
            const origStart = ctrl._onTouchStart.bind(ctrl);
            ctrl._onTouchStart = (e) => {
                const changed = origStart(e);
                if (changed !== false && this.mode === 'play') {
                    this.ws.send(ctrl.getKeyMessage('keydown'));
                }
                this._ensureSending();
            };
            const origEnd = ctrl._onTouchEnd.bind(ctrl);
            ctrl._onTouchEnd = (e) => {
                origEnd(e);
                if (this.mode === 'play') {
                    this.ws.send(ctrl.getKeyMessage('keyup'));
                }
            };
            // Also add mouse fallback
            const origMouse = ctrl._onMouseDown.bind(ctrl);
            ctrl._onMouseDown = (e) => {
                origMouse(e);
                if (this.mode === 'play') {
                    this.ws.send(ctrl.getKeyMessage('press'));
                }
            };
        }

        return ctrl;
    }

    getControl(id) {
        return this.controls.get(id);
    }

    removeControl(id) {
        const ctrl = this.controls.get(id);
        if (!ctrl) return;
        if (ctrl.el) ctrl.el.remove();
        this.controls.delete(id);
    }

    clearAllControls() {
        this.controls.forEach(ctrl => { if (ctrl.el) ctrl.el.remove(); });
        this.controls.clear();
    }

    // --- Gamepad State Send Loop (60Hz) ---
    _setupSendLoop() {
        this._sendInterval = setInterval(() => this._sendGamepadState(), 16);
    }

    _ensureSending() {
        if (!this._sendActive) {
            this._sendActive = true;
        }
    }

    _sendGamepadState() {
        if (this.mode !== 'play') {
            // Stop sending if no active touches for a while
            // We keep the interval running but don't send
            this._sendActive = false;
            return;
        }

        // Check if any gamepad control is actively being touched
        let anyActive = false;
        const state = { type: 'gamepad', leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, buttons: {} };

        this.controls.forEach(ctrl => {
            if (ctrl.type === 'keyboardButton') return; // handled separately
            const s = ctrl.getGamepadState();
            if (s.leftStick) { state.leftStick = s.leftStick; if (s.leftStick.x !== 0 || s.leftStick.y !== 0) anyActive = true; }
            if (s.rightStick) { state.rightStick = s.rightStick; if (s.rightStick.x !== 0 || s.rightStick.y !== 0) anyActive = true; }
            if (s.triggers) {
                Object.assign(state.triggers, s.triggers);
                if (Object.values(s.triggers).some(v => v > 0.01)) anyActive = true;
            }
            if (s.buttons) {
                Object.assign(state.buttons, s.buttons);
                if (Object.values(s.buttons).some(v => v === true)) anyActive = true;
            }
        });

        // Only send if state changed or active
        const stateStr = JSON.stringify(state);
        if (stateStr === this._lastGamepadState && !anyActive) {
            this._sendActive = false;
            return;
        }

        this._lastGamepadState = stateStr;

        if (anyActive || this._sendActive) {
            this.ws.send(state);
        }

        if (!anyActive) {
            this._sendActive = false;
        }
    }

    // --- Layout Operations ---
    getLayoutData() {
        return {
            version: 2,
            name: 'My Layout',
            gridSize: this.editor ? this.editor.gridSize : 20,
            controls: Array.from(this.controls.values()).map(c => c.toJSON()),
        };
    }

    loadLayoutData(data) {
        this.clearAllControls();
        (data.controls || []).forEach(cData => {
            const ctrl = this.createControl(cData.type, cData.x, cData.y, cData.w, cData.h, cData.properties);
            if (ctrl && cData.id) ctrl.id = cData.id;
        });
        this.setMode('play');
        this.ui.toast(`Loaded "${data.name || 'Layout'}" (${data.controls.length} controls)`);
    }

    newLayout() {
        if (this.controls.size > 0 && !confirm('Clear all controls and start a new layout?')) return;
        this.clearAllControls();
        if (this.editor) this.editor.deselectControl();
        this.setMode('edit');
        this.ui.toast('New layout created');
    }

    exportLayout() {
        const data = this.getLayoutData();
        const name = prompt('Layout name:', data.name || 'My Layout');
        if (!name) return;
        data.name = name;
        this.storage.exportLayout(data, name + '.hublayout');
        this.ui.toast(`Exported "${name}.hublayout"`);
    }

    exportLegacy() {
        const data = this.getLayoutData();
        this.storage.exportLegacy(data.controls.map(c => ({
            ...c,
            properties: c.properties || {},
        })));
        this.ui.toast('Exported legacy buttonConfigs.json');
    }

    importLayout(file) {
        this.storage.importFile(file).then(data => {
            if (confirm(`Import "${data.name}"? (${data.controls.length} controls)\n\nChoose OK to replace current layout, Cancel to abort.`)) {
                this.loadLayoutData(data);
            }
        }).catch(err => {
            this.ui.toast('Import failed: ' + err.message);
        });
    }

    saveCurrentProfile() {
        const name = prompt('Save profile as:', 'Default');
        if (!name) return;
        const data = this.getLayoutData();
        data.name = name;
        this.storage.saveProfile(name, data);
        this.ui.toast(`Profile "${name}" saved`);
    }

    loadProfile(name) {
        const data = this.storage.loadProfile(name);
        if (data) {
            this.loadLayoutData(data);
        } else {
            this.ui.toast('Profile not found');
        }
    }

    // --- Auto Save ---
    _setupAutoSave() {
        setInterval(() => {
            if (this.settings.autoSave && this.controls.size > 0) {
                this.storage.saveProfile('_autosave', this.getLayoutData());
            }
        }, 10000);
    }

    // --- Notify changes (called by Editor) ---
    _notifyControlsChanged() {
        // Could trigger auto-save, update UI, etc.
    }
};
