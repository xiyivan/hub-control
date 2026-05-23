// ============================================================================
// StorageManager - localStorage profiles, import/export .hublayout JSON files
// ============================================================================
HubControl.StorageManager = class StorageManager {
    constructor() {
        this.STORAGE_KEY = 'hubcontrol_profiles';
        this.SETTINGS_KEY = 'hubcontrol_settings';
    }

    // --- Profile CRUD ---
    listProfiles() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
        } catch { return {}; }
    }

    saveProfile(name, layoutData) {
        const profiles = this.listProfiles();
        profiles[name] = {
            name,
            savedAt: new Date().toISOString(),
            layout: layoutData,
        };
        this._write(profiles);
    }

    loadProfile(name) {
        const profiles = this.listProfiles();
        return profiles[name] ? profiles[name].layout : null;
    }

    deleteProfile(name) {
        const profiles = this.listProfiles();
        delete profiles[name];
        this._write(profiles);
    }

    _write(profiles) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(profiles));
    }

    // --- Settings ---
    getSettings() {
        const defaults = {
            serverIP: window.location.hostname || '192.168.0.105',
            serverPort: 8080,
            gridSize: 20,
            gridSnap: true,
            autoSave: true,
        };
        try {
            const saved = JSON.parse(localStorage.getItem(this.SETTINGS_KEY) || '{}');
            return { ...defaults, ...saved };
        } catch { return defaults; }
    }

    saveSettings(settings) {
        localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
    }

    // --- Export Layout ---
    exportLayout(layoutData, filename) {
        const json = JSON.stringify(layoutData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'layout.hublayout';
        a.click();
        URL.revokeObjectURL(url);
    }

    // --- Export Legacy (backward compat) ---
    exportLegacy(controls) {
        const legacy = controls
            .filter(c => c.type === 'keyboardButton')
            .map(c => ({
                x: c.x, y: c.y,
                imageUrl: c.properties.imageUrl || '',
                dataCharacter: c.properties.key || '',
            }));
        const json = JSON.stringify(legacy, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'buttonConfigs.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    // --- Import Layout ---
    importFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(reader.result);
                    resolve(this._normalizeImport(data));
                } catch (e) { reject(new Error('Invalid JSON file: ' + e.message)); }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    _normalizeImport(data) {
        // Legacy format: array of {x, y, imageUrl, dataCharacter}
        if (Array.isArray(data) && data.length > 0 && 'dataCharacter' in data[0]) {
            return {
                version: 1,
                name: 'Imported Legacy Layout',
                gridSize: 20,
                controls: data.map((item, i) => ({
                    id: 'imp_' + i,
                    type: 'keyboardButton',
                    x: item.x || 0, y: item.y || 0,
                    w: 100, h: 100,
                    properties: {
                        label: item.dataCharacter || '',
                        key: item.dataCharacter || '',
                        modifiers: [],
                        imageUrl: item.imageUrl || '',
                    },
                })),
            };
        }
        // New format
        if (!data.controls) data.controls = [];
        data.version = data.version || 2;
        data.name = data.name || 'Imported Layout';
        data.gridSize = data.gridSize || 20;
        return data;
    }
};
