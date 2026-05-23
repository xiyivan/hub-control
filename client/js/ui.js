// ============================================================================
// UI Manager - toolbar, menu drawer, modals, notifications, connection indicator
// ============================================================================
HubControl.UI = class UIManager {
    constructor(app) {
        this.app = app;
        this._initToolbar();
        this._initMenuDrawer();
        this._initConnectionIndicator();
    }

    // --- Toolbar ---
    _initToolbar() {
        document.getElementById('btn-toggle-mode').addEventListener('click', () => this.app.toggleMode());
        document.getElementById('btn-menu').addEventListener('click', () => this.toggleMenu());
    }

    updateModeButton(mode) {
        const btn = document.getElementById('btn-toggle-mode');
        btn.textContent = mode === 'play' ? '✏️' : '▶️';
        btn.title = mode === 'play' ? 'Switch to Edit Mode' : 'Switch to Play Mode';
        document.body.classList.toggle('edit-mode', mode === 'edit');
    }

    // --- Menu Drawer ---
    _initMenuDrawer() {
        document.getElementById('menu-overlay').addEventListener('click', () => this.closeMenu());

        // Bind menu items
        document.getElementById('menu-new-layout')?.addEventListener('click', () => {
            this.closeMenu();
            this.app.newLayout();
        });
        document.getElementById('menu-export')?.addEventListener('click', () => {
            this.closeMenu();
            this.app.exportLayout();
        });
        document.getElementById('menu-export-legacy')?.addEventListener('click', () => {
            this.closeMenu();
            this.app.exportLegacy();
        });
        document.getElementById('menu-import')?.addEventListener('click', () => {
            this.closeMenu();
            document.getElementById('import-file-input').click();
        });
        document.getElementById('menu-settings')?.addEventListener('click', () => {
            this.closeMenu();
            this._showSettings();
        });

        // Import file input
        document.getElementById('import-file-input').addEventListener('change', (e) => {
            if (e.target.files[0]) this.app.importLayout(e.target.files[0]);
            e.target.value = '';
        });
    }

    toggleMenu() { this._menuOpen ? this.closeMenu() : this.openMenu(); }

    openMenu() {
        this._menuOpen = true;
        document.getElementById('menu-drawer').classList.add('open');
        document.getElementById('menu-overlay').classList.add('open');
        this._refreshProfileList();
    }

    closeMenu() {
        this._menuOpen = false;
        document.getElementById('menu-drawer').classList.remove('open');
        document.getElementById('menu-overlay').classList.remove('open');
    }

    _refreshProfileList() {
        const list = document.getElementById('profile-list');
        if (!list) return;
        const profiles = this.app.storage.listProfiles();
        const names = Object.keys(profiles).sort();
        if (names.length === 0) {
            list.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:13px;">No saved profiles</div>';
            return;
        }
        list.innerHTML = names.map(name => `
            <div class="profile-item">
                <span class="profile-name" title="${name}">${name}</span>
                <span class="profile-actions">
                    <button title="Load" data-action="load" data-name="${name}">📂</button>
                    <button title="Delete" data-action="delete" data-name="${name}">🗑️</button>
                </span>
            </div>
        `).join('');

        list.querySelectorAll('[data-action="load"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const name = btn.dataset.name;
                this.closeMenu();
                this.app.loadProfile(name);
            });
        });
        list.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const name = btn.dataset.name;
                if (confirm(`Delete profile "${name}"?`)) {
                    this.app.storage.deleteProfile(name);
                    this._refreshProfileList();
                    this.toast(`Profile "${name}" deleted`);
                }
            });
        });
    }

    // --- Settings Modal ---
    _showSettings() {
        const settings = this.app.storage.getSettings();
        const html = `
            <div style="padding:16px;">
                <h3 style="margin-bottom:12px;color:var(--accent);">Settings</h3>
                <div class="prop-row"><label>Server IP</label><input id="setting-ip" value="${settings.serverIP}"></div>
                <div class="prop-row"><label>Port</label><input id="setting-port" type="number" value="${settings.serverPort}"></div>
                <div class="prop-row"><label>Grid Size</label><input id="setting-grid" type="number" value="${settings.gridSize}"></div>
                <div class="prop-row"><label>Snap to Grid</label><select id="setting-snap">
                    <option value="true" ${settings.gridSnap ? 'selected' : ''}>On</option>
                    <option value="false" ${!settings.gridSnap ? 'selected' : ''}>Off</option>
                </select></div>
                <div class="prop-row"><label>Auto Save</label><select id="setting-autosave">
                    <option value="true" ${settings.autoSave ? 'selected' : ''}>On</option>
                    <option value="false" ${!settings.autoSave ? 'selected' : ''}>Off</option>
                </select></div>
                <div class="prop-actions">
                    <button class="btn-primary" id="btn-save-settings">Save</button>
                    <button class="btn-secondary" id="btn-close-settings">Cancel</button>
                </div>
            </div>
        `;
        const panel = document.getElementById('properties-panel');
        panel.innerHTML = html;
        panel.classList.add('open');

        document.getElementById('btn-save-settings').addEventListener('click', () => {
            const newSettings = {
                serverIP: document.getElementById('setting-ip').value,
                serverPort: parseInt(document.getElementById('setting-port').value) || 8080,
                gridSize: parseInt(document.getElementById('setting-grid').value) || 20,
                gridSnap: document.getElementById('setting-snap').value === 'true',
                autoSave: document.getElementById('setting-autosave').value === 'true',
            };
            this.app.storage.saveSettings(newSettings);
            this.app.editor.gridSize = newSettings.gridSize;
            this.app.editor.gridSnap = newSettings.gridSnap;
            panel.classList.remove('open');
            this.toast('Settings saved');
            this.app._reconnect();
        });

        document.getElementById('btn-close-settings')?.addEventListener('click', () => {
            panel.classList.remove('open');
        });
    }

    // --- Connection Indicator ---
    _initConnectionIndicator() {
        const indicator = document.getElementById('connection-indicator');
        this.app.ws.on('statusChange', (status) => {
            indicator.className = status; // connected, disconnected, reconnecting
            indicator.title = 'WebSocket: ' + status;
        });
        // Click to show IP
        indicator.addEventListener('click', () => {
            const s = this.app.storage.getSettings();
            this.toast(`Server: ${s.serverIP}:${s.serverPort}`);
        });
    }

    // --- Toast Notifications ---
    toast(message, duration = 2500) {
        const container = document.getElementById('toast-container');
        const el = document.createElement('div');
        el.className = 'toast';
        el.textContent = message;
        container.appendChild(el);
        setTimeout(() => el.remove(), duration + 500);
    }

    // --- Editor toolbar buttons ---
    initEditorToolbar() {
        const addHandlers = {
            'btn-add-joystick': 'joystick',
            'btn-add-trigger': 'trigger',
            'btn-add-xbox': 'xboxButton',
            'btn-add-shoulder': 'shoulderButton',
            'btn-add-dpad': 'dpad',
            'btn-add-key': 'keyboardButton',
        };
        Object.entries(addHandlers).forEach(([id, type]) => {
            document.getElementById(id)?.addEventListener('click', () => this.app.editor.addControl(type));
        });
        document.getElementById('btn-undo')?.addEventListener('click', () => this.app.editor.undo());
        document.getElementById('btn-redo')?.addEventListener('click', () => this.app.editor.redo());
        document.getElementById('btn-grid-toggle')?.addEventListener('click', () => {
            this.app.editor.gridSnap = !this.app.editor.gridSnap;
            const btn = document.getElementById('btn-grid-toggle');
            btn.classList.toggle('active', this.app.editor.gridSnap);
        });
    }
};
