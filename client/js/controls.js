// ============================================================================
// Control classes - VirtualJoystick, VirtualTrigger, XboxButton, DPad, KeyboardButton
// Each control manages its own DOM element, touch handling, and state output.
// ============================================================================
HubControl.Controls = {};

let _controlIdCounter = 0;
function nextId() { return 'ctrl_' + (++_controlIdCounter); }

// ============================================================================
// Base Control
// ============================================================================
class BaseControl {
    constructor(type, x, y, w, h, properties = {}) {
        this.id = properties.id || nextId();
        this.type = type;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.properties = { ...this.defaultProperties(), ...properties };
        this.el = null;
        this._selected = false;
    }

    defaultProperties() { return { label: '' }; }

    createElement() {
        this.el = document.createElement('div');
        this.el.className = 'control ' + this.cssClass();
        this.el.dataset.controlId = this.id;
        this.el.dataset.controlType = this.type;
        this._updatePosition();
        this.el.addEventListener('touchstart', e => this._onTouchStart(e), { passive: false });
        this.el.addEventListener('touchmove', e => this._onTouchMove(e), { passive: false });
        this.el.addEventListener('touchend', e => this._onTouchEnd(e));
        this.el.addEventListener('touchcancel', e => this._onTouchEnd(e));
        this.el.addEventListener('mousedown', e => this._onMouseDown(e));
        return this.el;
    }

    cssClass() { return ''; }

    _updatePosition() {
        if (!this.el) return;
        this.el.style.left = this.x + 'px';
        this.el.style.top = this.y + 'px';
        this.el.style.width = this.w + 'px';
        this.el.style.height = this.h + 'px';
    }

    setPosition(x, y) { this.x = x; this.y = y; this._updatePosition(); }
    setSize(w, h) { this.w = w; this.h = h; this._updatePosition(); }

    get selected() { return this._selected; }
    set selected(v) {
        this._selected = v;
        if (this.el) this.el.classList.toggle('selected', v);
    }

    // --- State output for gamepad message ---
    getGamepadState() { return {}; }

    // --- Touch/mouse handlers - override in subclasses ---
    _onTouchStart(e) { e.preventDefault(); }
    _onTouchMove(e) { e.preventDefault(); }
    _onTouchEnd(e) { this._resetState(); }
    _onMouseDown(e) { /* mouse fallback handled by subclass */ }

    _resetState() {}

    // --- Serialization ---
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            x: this.x, y: this.y,
            w: this.w, h: this.h,
            properties: { ...this.properties },
        };
    }

    static fromJSON(json) {
        const typeMap = {
            joystick: VirtualJoystick,
            trigger: VirtualTrigger,
            xboxButton: XboxButton,
            dpad: DPad,
            keyboardButton: KeyboardButton,
            shoulderButton: ShoulderButton,
        };
        const Cls = typeMap[json.type];
        if (!Cls) return null;
        return new Cls(json.x, json.y, json.w, json.h, json.properties);
    }
}

// ============================================================================
// VirtualJoystick - maps to leftStick or rightStick X/Y
// ============================================================================
class VirtualJoystick extends BaseControl {
    constructor(x, y, w, h, props = {}) {
        super('joystick', x, y, w || 150, h || 150, props);
        this._touchId = null;
        this._stateX = 0;
        this._stateY = 0;
        this._deadZone = props.deadZone || 0.12;
        this._stickMapping = props.stickMapping || 'leftStick';
        this._canvas = null;
    }

    defaultProperties() { return { label: 'Joystick', stickMapping: 'leftStick', deadZone: 0.12, visualStyle: 'default' }; }

    cssClass() { return 'joystick'; }

    createElement() {
        super.createElement();
        this._canvas = document.createElement('canvas');
        this._canvas.width = this.w;
        this._canvas.height = this.h;
        this._canvas.style.width = '100%';
        this._canvas.style.height = '100%';
        this.el.appendChild(this._canvas);
        this._draw();
        return this.el;
    }

    _draw() {
        if (!this._canvas) return;
        const ctx = this._canvas.getContext('2d');
        const cx = this._canvas.width / 2;
        const cy = this._canvas.height / 2;
        const r = Math.min(cx, cy) - 8;

        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

        // Outer ring
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Inner ring
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
        ctx.strokeStyle = '#21262d';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Center dot
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#484f58';
        ctx.fill();

        // Position indicator
        const dx = this._stateX * r;
        const dy = this._stateY * r;
        const indicatorR = 16;
        const ix = cx + dx;
        const iy = cy + dy;

        // Glow
        const grad = ctx.createRadialGradient(ix, iy, 0, ix, iy, indicatorR + 6);
        grad.addColorStop(0, 'rgba(88,166,255,0.6)');
        grad.addColorStop(1, 'rgba(88,166,255,0)');
        ctx.beginPath();
        ctx.arc(ix, iy, indicatorR + 6, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Indicator
        ctx.beginPath();
        ctx.arc(ix, iy, indicatorR, 0, Math.PI * 2);
        ctx.fillStyle = this._stateX === 0 && this._stateY === 0 ? '#484f58' : '#58a6ff';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    _updateState(touchX, touchY) {
        const rect = this._canvas.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const r = Math.min(cx, cy) - 8;

        let dx = (touchX - rect.left - cx) / r;
        let dy = (touchY - rect.top - cy) / r;

        // Unit circle clamp
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1) { dx /= dist; dy /= dist; }

        // Dead zone
        if (Math.abs(dx) < this._deadZone) dx = 0;
        if (Math.abs(dy) < this._deadZone) dy = 0;

        if (dx !== this._stateX || dy !== this._stateY) {
            this._stateX = dx;
            this._stateY = dy;
            this._draw();
            return true; // changed
        }
        return false;
    }

    _resetState() {
        this._touchId = null;
        if (this._stateX !== 0 || this._stateY !== 0) {
            this._stateX = 0;
            this._stateY = 0;
            this._draw();
        }
    }

    _onTouchStart(e) {
        e.preventDefault();
        if (this._touchId !== null) return;
        const touch = e.changedTouches[0];
        this._touchId = touch.identifier;
        this._updateState(touch.clientX, touch.clientY);
    }

    _onTouchMove(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier === this._touchId) {
                this._updateState(touch.clientX, touch.clientY);
                return;
            }
        }
    }

    _onMouseDown(e) {
        e.preventDefault();
        this._updateState(e.clientX, e.clientY);
        const onMove = (ev) => { this._updateState(ev.clientX, ev.clientY); };
        const onUp = () => {
            this._resetState();
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    getGamepadState() {
        const stick = this._stickMapping === 'rightStick' ? 'rightStick' : 'leftStick';
        return { [stick]: { x: this._stateX, y: this._stateY } };
    }

    toJSON() {
        const j = super.toJSON();
        j.properties.deadZone = this._deadZone;
        j.properties.stickMapping = this._stickMapping;
        return j;
    }
}

// ============================================================================
// VirtualTrigger - vertical slider mapped to LT or RT (0..1)
// ============================================================================
class VirtualTrigger extends BaseControl {
    constructor(x, y, w, h, props = {}) {
        super('trigger', x, y, w || 60, h || 200, props);
        this._touchId = null;
        this._value = 0;
        this._triggerMapping = props.triggerMapping || 'left';
        this._springReturn = props.springReturn !== false;
        this._fillEl = null;
        this._thumbEl = null;
    }

    defaultProperties() { return { label: 'Trigger', triggerMapping: 'left', springReturn: true }; }

    cssClass() { return 'trigger'; }

    createElement() {
        super.createElement();
        this._fillEl = document.createElement('div');
        this._fillEl.className = 'trigger-fill';
        this.el.appendChild(this._fillEl);
        this._thumbEl = document.createElement('div');
        this._thumbEl.className = 'trigger-thumb';
        this.el.appendChild(this._thumbEl);
        this._updateDisplay();
        return this.el;
    }

    _updateDisplay() {
        if (!this._fillEl) return;
        const pct = this._value * 100;
        this._fillEl.style.height = pct + '%';
        this._thumbEl.style.bottom = pct + '%';
    }

    _updateValue(clientY) {
        const rect = this.el.getBoundingClientRect();
        const relY = rect.bottom - clientY; // distance from bottom
        const val = Math.max(0, Math.min(1, relY / rect.height));
        if (Math.abs(val - this._value) > 0.005) {
            this._value = val;
            this._updateDisplay();
            return true;
        }
        return false;
    }

    _resetState() {
        this._touchId = null;
        if (this._springReturn) {
            this._value = 0;
            this._updateDisplay();
        }
    }

    _onTouchStart(e) {
        e.preventDefault();
        if (this._touchId !== null) return;
        const touch = e.changedTouches[0];
        this._touchId = touch.identifier;
        this._updateValue(touch.clientY);
    }

    _onTouchMove(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier === this._touchId) {
                this._updateValue(touch.clientY);
                return;
            }
        }
    }

    _onMouseDown(e) {
        e.preventDefault();
        this._updateValue(e.clientY);
        const onMove = (ev) => { this._updateValue(ev.clientY); };
        const onUp = () => {
            this._resetState();
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    getGamepadState() {
        const trig = this._triggerMapping === 'right' ? 'right' : 'left';
        return { triggers: { [trig]: this._value } };
    }
}

// ============================================================================
// XboxButton - maps to A/B/X/Y/LB/RB/Start/Back/LS/RS/Guide
// ============================================================================
class XboxButton extends BaseControl {
    constructor(x, y, w, h, props = {}) {
        super('xboxButton', x, y, w || 56, h || 56, props);
        this._pressed = false;
        this._button = props.button || 'A';
    }

    defaultProperties() { return { label: '', button: 'A', alternateKey: '' }; }

    cssClass() { return 'xbox-btn xbox-' + this._button.toLowerCase(); }

    createElement() {
        super.createElement();
        this.el.textContent = this._button;
        return this.el;
    }

    _setPressed(v) {
        if (this._pressed === v) return;
        this._pressed = v;
        this.el.classList.toggle('pressed', v);
    }

    _onTouchStart(e) { e.preventDefault(); this._setPressed(true); }
    _onTouchEnd(e) { this._setPressed(false); }
    _onMouseDown(e) {
        e.preventDefault();
        this._setPressed(true);
        const onUp = () => { this._setPressed(false); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mouseup', onUp);
    }

    getGamepadState() {
        return { buttons: { [this._button]: this._pressed } };
    }
}

// ============================================================================
// ShoulderButton - LB/RB style
// ============================================================================
class ShoulderButton extends BaseControl {
    constructor(x, y, w, h, props = {}) {
        super('shoulderButton', x, y, w || 80, h || 40, props);
        this._pressed = false;
        this._button = props.button || 'LB';
    }

    defaultProperties() { return { label: '', button: 'LB' }; }

    cssClass() { return 'shoulder-btn'; }

    createElement() {
        super.createElement();
        this.el.textContent = this._button;
        return this.el;
    }

    _setPressed(v) { this._pressed = v; this.el.classList.toggle('pressed', v); }
    _onTouchStart(e) { e.preventDefault(); this._setPressed(true); }
    _onTouchEnd(e) { this._setPressed(false); }
    _onMouseDown(e) {
        e.preventDefault();
        this._setPressed(true);
        const onUp = () => { this._setPressed(false); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mouseup', onUp);
    }

    getGamepadState() {
        return { buttons: { [this._button]: this._pressed } };
    }
}

// ============================================================================
// DPad - 4-directional pad
// ============================================================================
class DPad extends BaseControl {
    constructor(x, y, w, h, props = {}) {
        super('dpad', x, y, w || 120, h || 120, props);
        this._pressed = { up: false, down: false, left: false, right: false };
        this._touchMap = new Map();
        this._btnEls = {};
    }

    defaultProperties() { return { label: 'D-Pad' }; }

    cssClass() { return 'dpad'; }

    createElement() {
        super.createElement();
        this.el.style.display = 'grid';
        this.el.style.gridTemplateAreas = '". up ." "left . right" ". down ."';
        this.el.style.gridTemplateColumns = '1fr 1fr 1fr';
        this.el.style.gridTemplateRows = '1fr 1fr 1fr';
        ['up', 'down', 'left', 'right'].forEach(dir => {
            const btn = document.createElement('div');
            btn.className = 'dpad-btn ' + dir;
            btn.textContent = dir === 'up' ? '▲' : dir === 'down' ? '▼' : dir === 'left' ? '◀' : '▶';
            this.el.appendChild(btn);
            this._btnEls[dir] = btn;
        });
        return this.el;
    }

    _dirFromPoint(clientX, clientY) {
        const rect = this.el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = clientX - cx;
        const dy = clientY - cy;
        const third = Math.min(rect.width, rect.height) / 3;

        const dirs = [];
        if (Math.abs(dx) > Math.abs(dy)) {
            if (Math.abs(dx) > third) dirs.push(dx < 0 ? 'left' : 'right');
        } else {
            if (Math.abs(dy) > third) dirs.push(dy < 0 ? 'up' : 'down');
        }
        return dirs;
    }

    _updateFromTouches() {
        const active = { up: false, down: false, left: false, right: false };
        for (const [, { clientX, clientY }] of this._touchMap) {
            for (const d of this._dirFromPoint(clientX, clientY)) {
                active[d] = true;
            }
        }
        for (const d of ['up', 'down', 'left', 'right']) {
            if (active[d] !== this._pressed[d]) {
                this._pressed[d] = active[d];
                this._btnEls[d].classList.toggle('pressed', active[d]);
            }
        }
    }

    _onTouchStart(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            this._touchMap.set(touch.identifier, { clientX: touch.clientX, clientY: touch.clientY });
        }
        this._updateFromTouches();
    }

    _onTouchMove(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (this._touchMap.has(touch.identifier)) {
                this._touchMap.set(touch.identifier, { clientX: touch.clientX, clientY: touch.clientY });
            }
        }
        this._updateFromTouches();
    }

    _onTouchEnd(e) {
        for (const touch of e.changedTouches) {
            this._touchMap.delete(touch.identifier);
        }
        this._updateFromTouches();
    }

    getGamepadState() {
        return { buttons: { ...this._pressed } };
    }

    _resetState() {
        this._touchMap.clear();
        for (const d of ['up', 'down', 'left', 'right']) {
            this._pressed[d] = false;
            if (this._btnEls[d]) this._btnEls[d].classList.remove('pressed');
        }
    }
}

// ============================================================================
// KeyboardButton - sends key/combo via pydirectinput
// ============================================================================
class KeyboardButton extends BaseControl {
    constructor(x, y, w, h, props = {}) {
        super('keyboardButton', x, y, w || 80, h || 80, props);
        this._pressed = false;
    }

    defaultProperties() { return { label: '', key: '', modifiers: [], imageUrl: '' }; }

    cssClass() { return 'key-btn'; }

    createElement() {
        super.createElement();
        const label = this.properties.label || this.properties.key || 'Key';
        this.el.textContent = label;
        if (this.properties.imageUrl) {
            this.el.style.backgroundImage = `url('${this.properties.imageUrl}')`;
            this.el.style.color = '#fff';
            this.el.style.textShadow = '0 1px 3px rgba(0,0,0,0.8)';
        }
        return this.el;
    }

    _setPressed(v) { this._pressed = v; this.el.classList.toggle('pressed', v); }

    _onTouchStart(e) { e.preventDefault(); this._setPressed(true); return true; }
    _onTouchEnd(e) { this._setPressed(false); }
    _onMouseDown(e) {
        e.preventDefault();
        this._setPressed(true);
        const onUp = () => { this._setPressed(false); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mouseup', onUp);
    }

    getKeyMessage(action) {
        return {
            type: 'key',
            action: action || 'press',
            key: this.properties.key,
            modifiers: this.properties.modifiers || [],
        };
    }
}

// ============================================================================
// Register classes
// ============================================================================
HubControl.Controls.BaseControl = BaseControl;
HubControl.Controls.VirtualJoystick = VirtualJoystick;
HubControl.Controls.VirtualTrigger = VirtualTrigger;
HubControl.Controls.XboxButton = XboxButton;
HubControl.Controls.ShoulderButton = ShoulderButton;
HubControl.Controls.DPad = DPad;
HubControl.Controls.KeyboardButton = KeyboardButton;

// Re-export for fromJSON
const _VirtualJoystick = VirtualJoystick;
const _VirtualTrigger = VirtualTrigger;
const _XboxButton = XboxButton;
const _ShoulderButton = ShoulderButton;
const _DPad = DPad;
const _KeyboardButton = KeyboardButton;
