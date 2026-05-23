# hub-control v2

**Turn your tablet or phone into a virtual Xbox controller for your PC games.**

Create custom on-screen gamepad layouts — joysticks, triggers, buttons, D-pads — that map to a virtual Xbox 360 controller or keyboard shortcuts. Perfect for simulators (Euro Truck Simulator 2, flight sims, racing games) where memorizing keyboard shortcuts is painful.

---

## Quick Start

### Option 1: Pre-built Executable (Windows)

1. Download `hub-control-server.exe` from the [releases page](../../releases)
2. Double-click to run — a status window appears showing your server IP
3. On your tablet/phone, open a browser and go to `http://<IP>:8080/`
4. Start playing!

### Option 2: Run from Source

```bash
# Create virtual environment
python -m venv .venv
.venv\Scripts\activate

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
| 📱 **Mobile-First** | Touch-optimized UI, works on any device with a browser |
| 🔌 **Auto-Reconnect** | Client automatically reconnects if connection drops |

---

## Xbox Controller Support (ViGEmBus)

Virtual Xbox controller emulation requires the **ViGEmBus** driver:

1. Run the following to install:
   ```bash
   pip install vgamepad
   ```
2. This will open the ViGEmBus driver installer — accept the prompts to install
3. Restart the server — the status window will show "XInput ENABLED"

> **Note:** ViGEmBus installation requires administrator privileges and a one-time driver setup. Without it, keyboard shortcuts work fully — only the virtual Xbox controller features (analog sticks, triggers) are disabled.

---

## Building from Source

```bash
# Install build dependencies
pip install pyinstaller

# Build executable (includes client files)
pyinstaller hub-control.spec

# Output: dist/hub-control-server.exe
```

---

## Project Structure

```
hub-control/
├── server/
│   ├── main.py              # Server: HTTP + WebSocket + XInput + keyboard
│   └── requirements.txt     # Python dependencies
├── client/
│   ├── index.html           # Web client shell
│   ├── css/main.css         # Dark theme, control styles
│   ├── js/
│   │   ├── app.js           # Main controller, mode switching
│   │   ├── controls.js      # Joystick, trigger, button, DPad classes
│   │   ├── editor.js        # Visual editor, drag-to-move, undo/redo
│   │   ├── storage.js       # Import/export, localStorage profiles
│   │   ├── ui.js            # Toolbar, menus, toasts
│   │   └── websocket.js     # WebSocket manager with auto-reconnect
│   └── layouts/
│       └── ets2.hublayout   # Euro Truck Simulator 2 template
├── hub-control.spec          # PyInstaller build spec
├── run_server.bat            # One-click launcher for dev
└── PLAN.md                   # Architecture & design document
```

---

## Usage

### Server (PC)

1. Start `hub-control-server.exe`
2. Note the IP address shown in the status window
3. The server runs on port **8080**

### Client (Tablet / Phone)

1. Connect your device to the same network as the server PC
2. Open a browser and navigate to `http://<SERVER_IP>:8080/`
3. **Play Mode** (default) — touch controls to send input
4. Tap the ✏️ button to enter **Edit Mode** — add, move, and configure controls
5. Use the ☰ menu to save/load profiles, import/export layouts

### Pre-built Layouts

Load the included ETS2 template from the menu:
- **Left joystick** → Steering
- **Left trigger** → Brake
- **Right trigger** → Throttle
- **D-Pad** → Menu navigation
- **Xbox buttons** → A/B/X/Y actions
- **Shoulder buttons** → Turn signals
- **Keyboard buttons** → F3-F8, Esc, Enter

---

## License

MIT

