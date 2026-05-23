// ============================================================================
// Editor - semi-visual edit mode: drag-to-move, properties panel, add/delete, undo/redo
// ============================================================================
HubControl.Editor = class Editor {
    constructor(app) {
        this.app = app;
        this.selectedControl = null;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragOrigX = 0;
        this.dragOrigY = 0;
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 50;
        this.gridSize = 20;
        this.gridSnap = true;

        this._panelEl = document.getElementById('properties-panel');
        this._surfaceEl = document.getElementById('editor-surface');
        this._setupPanel();
        this._setupSurfaceEvents();
    }

    // --- Surface Events ---
    _setupSurfaceEvents() {
        this._surfaceEl.addEventListener('touchstart', e => this._onSurfaceTouchStart(e), { passive: false });
        this._surfaceEl.addEventListener('touchmove', e => this._onSurfaceTouchMove(e), { passive: false });
        this._surfaceEl.addEventListener('touchend', e => this._onSurfaceTouchEnd(e));
    }

    _onSurfaceTouchStart(e) {
        const target = e.target.closest('.control');
        if (!target) {
            this.deselectControl();
            return;
        }
        const ctrlId = target.dataset.controlId;
        const ctrl = this.app.getControl(ctrlId);
        if (!ctrl) return;

        this.selectControl(ctrl);
        e.preventDefault();

        const touch = e.touches[0];
        this.isDragging = true;
        this.dragStartX = touch.clientX;
        this.dragStartY = touch.clientY;
        this.dragOrigX = ctrl.x;
        this.dragOrigY = ctrl.y;
        // Snapshot for undo
        this._dragSnapshot = { id: ctrl.id, x: ctrl.x, y: ctrl.y };
    }

    _onSurfaceTouchMove(e) {
        if (!this.isDragging || !this.selectedControl) return;
        e.preventDefault();
        const touch = e.touches[0];
        let newX = this.dragOrigX + (touch.clientX - this.dragStartX);
        let newY = this.dragOrigY + (touch.clientY - this.dragStartY);

        if (this.gridSnap && this.gridSize > 0) {
            newX = Math.round(newX / this.gridSize) * this.gridSize;
            newY = Math.round(newY / this.gridSize) * this.gridSize;
        }
        newX = Math.max(0, Math.min(newX, this._surfaceEl.clientWidth - this.selectedControl.w));
        newY = Math.max(0, Math.min(newY, this._surfaceEl.clientHeight - this.selectedControl.h));

        this.selectedControl.setPosition(newX, newY);
        this._updatePanelPosition();
    }

    _onSurfaceTouchEnd(e) {
        if (this.isDragging && this.selectedControl && this._dragSnapshot) {
            const ctrl = this.selectedControl;
            if (ctrl.x !== this._dragSnapshot.x || ctrl.y !== this._dragSnapshot.y) {
                this._pushUndo({
                    type: 'move',
                    controlId: ctrl.id,
                    oldX: this._dragSnapshot.x,
                    oldY: this._dragSnapshot.y,
                    newX: ctrl.x,
                    newY: ctrl.y,
                });
            }
            this._dragSnapshot = null;
        }
        this.isDragging = false;
    }

    // --- Selection ---
    selectControl(ctrl) {
        if (this.selectedControl === ctrl) return;
        if (this.selectedControl) this.selectedControl.selected = false;
        this.selectedControl = ctrl;
        ctrl.selected = true;
        this._openPanel(ctrl);
    }

    deselectControl() {
        if (this.selectedControl) {
            this.selectedControl.selected = false;
            this.selectedControl = null;
            this._closePanel();
        }
    }

    // --- Properties Panel ---
    _setupPanel() {
        this._panelEl.innerHTML = ''; // will be populated dynamically
        document.getElementById('btn-close-panel')?.addEventListener('click', () => this.deselectControl());
        document.getElementById('btn-delete-control')?.addEventListener('click', () => this._deleteSelected());
    }

    _openPanel(ctrl) {
        const panel = this._panelEl;
        panel.innerHTML = this._buildPanelHTML(ctrl);
        panel.classList.add('open');

        // Bind events
        panel.querySelector('.btn-close-panel')?.addEventListener('click', () => this.deselectControl());
        panel.querySelector('.btn-delete-control')?.addEventListener('click', () => this._deleteSelected());
        panel.querySelector('.btn-apply')?.addEventListener('click', () => this._applyProperties());

        // Bind input changes
        panel.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('change', () => this._applyProperties());
            el.addEventListener('input', () => {
                // Live preview for position/size
                this._previewProperties();
            });
        });
    }

    _closePanel() {
        this._panelEl.classList.remove('open');
        this._panelEl.innerHTML = '';
    }

    _updatePanelPosition() {
        if (!this.selectedControl) return;
        const xInput = this._panelEl.querySelector('[data-prop="x"]');
        const yInput = this._panelEl.querySelector('[data-prop="y"]');
        if (xInput) xInput.value = this.selectedControl.x;
        if (yInput) yInput.value = this.selectedControl.y;
    }

    _buildPanelHTML(ctrl) {
        const p = ctrl.properties;
        let html = `<h3>${ctrl.type} Properties</h3>`;

        // Common fields
        html += `<div class="prop-row"><label>Label</label><input data-prop="label" value="${this._esc(p.label || '')}"></div>`;
        html += `<div class="prop-row"><label>X</label><input data-prop="x" type="number" value="${ctrl.x}"></div>`;
        html += `<div class="prop-row"><label>Y</label><input data-prop="y" type="number" value="${ctrl.y}"></div>`;
        html += `<div class="prop-row"><label>Width</label><input data-prop="w" type="number" value="${ctrl.w}"></div>`;
        html += `<div class="prop-row"><label>Height</label><input data-prop="h" type="number" value="${ctrl.h}"></div>`;

        // Type-specific
        switch (ctrl.type) {
            case 'joystick':
                html += `<div class="prop-row"><label>Mapping</label><select data-prop="stickMapping">
                    <option value="leftStick" ${p.stickMapping === 'leftStick' ? 'selected' : ''}>Left Stick</option>
                    <option value="rightStick" ${p.stickMapping === 'rightStick' ? 'selected' : ''}>Right Stick</option>
                </select></div>`;
                html += `<div class="prop-row"><label>Dead Zone</label><input data-prop="deadZone" type="number" step="0.01" min="0" max="0.5" value="${p.deadZone || 0.12}"></div>`;
                break;
            case 'trigger':
                html += `<div class="prop-row"><label>Trigger</label><select data-prop="triggerMapping">
                    <option value="left" ${p.triggerMapping === 'left' ? 'selected' : ''}>Left Trigger (LT)</option>
                    <option value="right" ${p.triggerMapping === 'right' ? 'selected' : ''}>Right Trigger (RT)</option>
                </select></div>`;
                html += `<div class="prop-row"><label>Spring Return</label><select data-prop="springReturn">
                    <option value="true" ${p.springReturn !== false ? 'selected' : ''}>Yes</option>
                    <option value="false" ${p.springReturn === false ? 'selected' : ''}>No</option>
                </select></div>`;
                break;
            case 'xboxButton':
                html += `<div class="prop-row"><label>Button</label><select data-prop="button">
                    ${['A','B','X','Y','LB','RB','back','start','LS','RS'].map(b =>
                        `<option value="${b}" ${p.button === b ? 'selected' : ''}>${b}</option>`
                    ).join('')}
                </select></div>`;
                html += `<div class="prop-row"><label>Alt Key</label><input data-prop="alternateKey" value="${this._esc(p.alternateKey || '')}" placeholder="Optional keyboard fallback"></div>`;
                break;
            case 'shoulderButton':
                html += `<div class="prop-row"><label>Button</label><select data-prop="button">
                    <option value="LB" ${p.button === 'LB' ? 'selected' : ''}>LB</option>
                    <option value="RB" ${p.button === 'RB' ? 'selected' : ''}>RB</option>
                </select></div>`;
                break;
            case 'keyboardButton':
                html += `<div class="prop-row"><label>Key</label><input data-prop="key" value="${this._esc(p.key || '')}" placeholder="e.g. f3, esc, a"></div>`;
                html += `<div class="prop-row"><label>Modifiers</label><input data-prop="modifiers" value="${this._esc((p.modifiers || []).join(', '))}" placeholder="ctrl, shift, alt"></div>`;
                html += `<div class="prop-row"><label>Image URL</label><input data-prop="imageUrl" value="${this._esc(p.imageUrl || '')}" placeholder="https://..."></div>`;
                break;
        }

        html += `<div class="prop-actions">
            <button class="btn-danger btn-delete-control">Delete</button>
            <button class="btn-primary btn-apply">Apply</button>
            <button class="btn-secondary btn-close-panel">Cancel</button>
        </div>`;

        return html;
    }

    _previewProperties() {
        if (!this.selectedControl) return;
        const ctrl = this.selectedControl;
        const panel = this._panelEl;

        const xEl = panel.querySelector('[data-prop="x"]');
        const yEl = panel.querySelector('[data-prop="y"]');
        const wEl = panel.querySelector('[data-prop="w"]');
        const hEl = panel.querySelector('[data-prop="h"]');
        if (xEl && yEl) ctrl.setPosition(parseInt(xEl.value) || 0, parseInt(yEl.value) || 0);
        if (wEl && hEl) ctrl.setSize(parseInt(wEl.value) || 80, parseInt(hEl.value) || 80);
    }

    _applyProperties() {
        if (!this.selectedControl) return;
        const ctrl = this.selectedControl;
        const panel = this._panelEl;
        const oldProps = { x: ctrl.x, y: ctrl.y, w: ctrl.w, h: ctrl.h, properties: { ...ctrl.properties } };

        // Read all data-prop inputs
        panel.querySelectorAll('[data-prop]').forEach(el => {
            const prop = el.dataset.prop;
            let value = el.value;
            if (el.type === 'number') value = el.value === '' ? 0 : parseFloat(el.value);

            if (prop === 'x') ctrl.x = parseInt(value) || 0;
            else if (prop === 'y') ctrl.y = parseInt(value) || 0;
            else if (prop === 'w') { ctrl.w = Math.max(20, parseInt(value) || 80); }
            else if (prop === 'h') { ctrl.h = Math.max(20, parseInt(value) || 80); }
            else if (prop === 'deadZone') { ctrl._deadZone = parseFloat(value) || 0.12; ctrl.properties.deadZone = ctrl._deadZone; }
            else if (prop === 'stickMapping') { ctrl._stickMapping = value; ctrl.properties.stickMapping = value; }
            else if (prop === 'triggerMapping') { ctrl._triggerMapping = value; ctrl.properties.triggerMapping = value; }
            else if (prop === 'springReturn') { ctrl._springReturn = value === 'true'; ctrl.properties.springReturn = ctrl._springReturn; }
            else if (prop === 'button') { ctrl._button = value; ctrl.properties.button = value; }
            else if (prop === 'alternateKey') { ctrl.properties.alternateKey = value; }
            else if (prop === 'modifiers') ctrl.properties.modifiers = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
            else ctrl.properties[prop] = value;
        });

        // Refresh element
        ctrl._updatePosition();
        if (ctrl._draw) ctrl._draw();
        if (ctrl._canvas) { ctrl._canvas.width = ctrl.w; ctrl._canvas.height = ctrl.h; ctrl._draw(); }
        if (ctrl.el && ctrl.type === 'keyboardButton') {
            ctrl.el.textContent = ctrl.properties.label || ctrl.properties.key || 'Key';
            if (ctrl.properties.imageUrl) {
                ctrl.el.style.backgroundImage = `url('${ctrl.properties.imageUrl}')`;
            } else {
                ctrl.el.style.backgroundImage = '';
            }
        }
        if (ctrl.el && (ctrl.type === 'xboxButton' || ctrl.type === 'shoulderButton')) {
            ctrl.el.textContent = ctrl._button || ctrl.properties.button || '';
            ctrl.el.className = ctrl.el.className.replace(/\bxbox-\w+\b/g, '');
            if (ctrl.type === 'xboxButton') {
                ctrl.el.classList.add('xbox-' + (ctrl._button || ctrl.properties.button || 'a').toLowerCase());
            }
        }

        this._pushUndo({
            type: 'properties',
            controlId: ctrl.id,
            old: oldProps,
            new: { x: ctrl.x, y: ctrl.y, w: ctrl.w, h: ctrl.h, properties: { ...ctrl.properties } },
        });

        this.app._notifyControlsChanged();
    }

    _deleteSelected() {
        if (!this.selectedControl) return;
        const ctrl = this.selectedControl;
        const snapshot = ctrl.toJSON();
        this.app.removeControl(ctrl.id);
        this._pushUndo({ type: 'delete', controlId: ctrl.id, snapshot });
        this.deselectControl();
        this.app._notifyControlsChanged();
    }

    // --- Add Control ---
    addControl(type) {
        const surface = this._surfaceEl;
        const cx = Math.min(200, surface.clientWidth / 2 - 60);
        const cy = Math.min(200, surface.clientHeight / 2 - 60);
        const defaults = {
            joystick: [cx, cy, 150, 150],
            trigger: [cx, cy, 60, 200],
            xboxButton: [cx, cy, 56, 56],
            shoulderButton: [cx, cy, 80, 40],
            dpad: [cx, cy, 130, 130],
            keyboardButton: [cx, cy, 80, 80],
        };
        let [x, y, w, h] = defaults[type] || [cx, cy, 80, 80];

        // Offset each new control by 30px so they don't overlap
        const count = this.app.controls.size;
        x += (count % 5) * 30;
        y += (count % 5) * 30;

        const ctrl = this.app.createControl(type, x, y, w, h, {});
        this._pushUndo({ type: 'add', controlId: ctrl.id });
        this.selectControl(ctrl);
        this.app._notifyControlsChanged();
        return ctrl;
    }

    // --- Undo/Redo ---
    _pushUndo(action) {
        this.undoStack.push(action);
        if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
        this.redoStack = [];
        this._updateUndoButtons();
    }

    undo() {
        const action = this.undoStack.pop();
        if (!action) return;
        this.redoStack.push(action);
        this._applyUndoAction(action, true);
        this._updateUndoButtons();
    }

    redo() {
        const action = this.redoStack.pop();
        if (!action) return;
        this.undoStack.push(action);
        this._applyUndoAction(action, false);
        this._updateUndoButtons();
    }

    _applyUndoAction(action, isUndo) {
        switch (action.type) {
            case 'move': {
                const ctrl = this.app.getControl(action.controlId);
                if (ctrl) {
                    ctrl.setPosition(isUndo ? action.oldX : action.newX, isUndo ? action.oldY : action.newY);
                }
                break;
            }
            case 'properties': {
                const ctrl = this.app.getControl(action.controlId);
                if (ctrl) {
                    const p = isUndo ? action.old : action.new;
                    ctrl.x = p.x; ctrl.y = p.y; ctrl.w = p.w; ctrl.h = p.h;
                    Object.assign(ctrl.properties, p.properties);
                    ctrl._updatePosition();
                    if (ctrl._draw) { ctrl._canvas.width = ctrl.w; ctrl._canvas.height = ctrl.h; ctrl._draw(); }
                }
                break;
            }
            case 'add': {
                if (isUndo) this.app.removeControl(action.controlId);
                else {
                    const s = action.snapshot;
                    this.app.createControl(s.type, s.x, s.y, s.w, s.h, s.properties);
                }
                break;
            }
            case 'delete': {
                if (isUndo) {
                    const s = action.snapshot;
                    this.app.createControl(s.type, s.x, s.y, s.w, s.h, s.properties);
                } else {
                    this.app.removeControl(action.controlId);
                }
                break;
            }
        }
        this.app._notifyControlsChanged();
    }

    _updateUndoButtons() {
        const undoBtn = document.getElementById('btn-undo');
        const redoBtn = document.getElementById('btn-redo');
        if (undoBtn) undoBtn.style.opacity = this.undoStack.length ? '1' : '0.4';
        if (redoBtn) redoBtn.style.opacity = this.redoStack.length ? '1' : '0.4';
    }

    _esc(s) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
};
