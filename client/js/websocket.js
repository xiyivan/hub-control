/* globalThis - shared namespace */
window.HubControl = window.HubControl || {};

// ============================================================================
// WSManager - WebSocket connection manager with auto-reconnect
// ============================================================================
HubControl.WSManager = class WSManager {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectDelay = 10000; // 10s max
        this.baseDelay = 1000;
        this.handlers = { open: [], close: [], message: [], statusChange: [] };
        this._pending = [];
        this._intentionalClose = false;
    }

    on(event, fn) { if (this.handlers[event]) this.handlers[event].push(fn); return this; }
    _emit(event, data) { if (this.handlers[event]) this.handlers[event].forEach(fn => fn(data)); }

    connect() {
        this._intentionalClose = false;
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
        this._setStatus('reconnecting');

        try {
            this.ws = new WebSocket(this.url);
        } catch (e) {
            this._scheduleReconnect();
            return;
        }

        this.ws.onopen = () => {
            this.connected = true;
            this.reconnectAttempts = 0;
            this._setStatus('connected');
            this._emit('open');
            // Flush pending messages
            while (this._pending.length) {
                const msg = this._pending.shift();
                this._sendRaw(msg);
            }
        };

        this.ws.onclose = (e) => {
            this.connected = false;
            this._setStatus('disconnected');
            this._emit('close', e);
            if (!this._intentionalClose) this._scheduleReconnect();
        };

        this.ws.onerror = () => {}; // onclose will fire after

        this.ws.onmessage = (e) => {
            this._emit('message', e.data);
        };
    }

    disconnect() {
        this._intentionalClose = true;
        this.reconnectAttempts = 0;
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        this._setStatus('disconnected');
    }

    send(data) {
        const msg = typeof data === 'string' ? data : JSON.stringify(data);
        if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this._sendRaw(msg);
        } else {
            // Queue if not connected (limit queue size)
            if (this._pending.length < 100) this._pending.push(msg);
        }
    }

    _sendRaw(msg) {
        try { this.ws.send(msg); } catch (e) { /* ignore */ }
    }

    _scheduleReconnect() {
        const delay = Math.min(this.baseDelay * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
        this.reconnectAttempts++;
        this._setStatus('reconnecting');
        setTimeout(() => this.connect(), delay);
    }

    _setStatus(status) {
        this.status = status;
        this._emit('statusChange', status);
    }
};
