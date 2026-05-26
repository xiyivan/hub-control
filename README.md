# hub-control v2

Tired of remembering shortcut? hub-control got you covered.

Create custom on-screen gamepad layouts — joysticks, triggers, buttons, D-pads — that map to a virtual Xbox 360 controller or keyboard shortcuts. Select you own image for each button. Perfect for simulators (Euro Truck Simulator 2, flight sims, racing games) where memorizing keyboard shortcuts is painful.

---

## Quick Start

### Option 1: Pre-built Executable (Windows)

1. Download `hub-control-server.exe` from the [releases page](../../releases)
2. Double-click to run — a status window appears showing your server IP
3. On your tablet/phone, open a browser and go to `http://<IP>:8080/`
4. Start playing!

### Option 2: Run from Source

```bash
# Install dependencies
pip install -r server/requirements.txt

# Run server
python server/main.py
```

---

## Features

| Feature | Description |
|---------|-------------|
| 🕹️ **Virtual Xbox Controller** | On-screen joystick, triggers, face buttons, D-pad, shoulder buttons — all mapped to a virtual Xbox 360 controller via ViGEmBus |
| ⌨️ **Keyboard Shortcuts** | Map buttons to any keyboard key or combo (F3-F8, Esc, Ctrl+Shift, etc.) |
| ✏️ **Visual Editor** | Drag-and-drop controls, snap-to-grid, properties panel — build your layout without coding |
| 💾 **Profiles** | Save/load layouts, import/export `.hublayout` files, share with others |
| 📱 **No Client Required** | Touch-optimized UI, works on any device with a browser |
| 🔌 **Auto-Reconnect** | Client automatically reconnects if connection drops |

---

## Xbox Controller Support (ViGEmBus)

Virtual Xbox controller emulation requires the **ViGEmBus** driver:

1. Download the installer from **[vigembus.us/download](https://vigembus.us/download/)**
2. Run the installer — accept the prompts (requires administrator privileges)
3. Restart the server — the status window will show "XInput ENABLED"

> **Note:** The server automatically detects whether ViGEmBus is installed. Without it, keyboard shortcuts work fully — only the virtual Xbox controller features (analog sticks, triggers) are disabled.

---

## License

MIT

