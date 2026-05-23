## Plan: Hub Control v2 — Visual Editor, Virtual XInput Gamepad & Enhanced UX

**TL;DR**: Transform the single-file web client into a mobile-first, mode-switched app (Play/Edit) with a semi-visual editor, on-screen virtual Xbox-style gamepad controls (joystick, triggers, face buttons) mapped to **true XInput via ViGEmBus/vgamepad** for analog precision, enhanced import/export with profile management, and upgrade the Python server to serve HTTP and handle both XInput emulation and keyboard shortcuts.

---

### Architecture Decision: ViGEmBus + vgamepad for XInput Emulation

**Why ViGEmBus instead of keyboard mapping for the virtual gamepad:**
- **Analog precision**: Virtual joystick maps to Xbox thumbstick X/Y (-1.0 to 1.0) — smooth steering, not binary WASD
- **Analog triggers**: Virtual sliders map to LT/RT (0.0 to 1.0) — progressive throttle/brake
- **Native game compatibility**: Games see a real Xbox 360 controller, no per-game keybinding needed
- **Hybrid approach**: Xbox controls via vgamepad + keyboard shortcuts via pydirectinput coexist in the same layout

**Tech stack for XInput:**
- **ViGEmBus** (v1.22): Windows kernel driver — creates virtual Xbox 360 controller at OS level
- **`vgamepad`** (Python, pypi): User-mode library wrapping ViGEmBus — clean Pythonic API, auto-installs ViGEmBus driver
- **Message protocol**: JSON with `leftStick`, `rightStick`, `triggers`, `buttons` — sent at 60Hz from client

**How it works end-to-end:**
```
[Tablet touch] → [VirtualJoystick JS] → WebSocket JSON → [Python server]
  → vgamepad.left_joystick_float(x, y) → vgamepad.update() → [ViGEmBus driver]
  → [Virtual Xbox 360 Controller] → [Game sees real controller input]
```

---

### Phase 1: Server Upgrade (Python) — XInput + HTTP + Keyboard Hybrid

**Step 1.1**: Add HTTP file serving alongside WebSocket
- Use `aiohttp` to serve the `client/` directory on port 8080
- Single port: HTTP for client files, WebSocket upgrade at `/ws` for control messages
- Serve `index.html` at `/`, static assets at `/css/`, `/js/`, `/assets/`
- *Dependency*: None (foundation for everything)

**Step 1.2**: Integrate vgamepad for XInput emulation
- Install `vgamepad` (auto-installs ViGEmBus driver on first run)
- Initialize `VX360Gamepad()` singleton — creates virtual Xbox 360 controller
- Message format for gamepad input:
  ```json
  {"type":"gamepad","leftStick":{"x":-0.75,"y":0.5},"rightStick":{"x":0,"y":0},"triggers":{"left":0.6,"right":0.0},"buttons":{"A":true,"B":false,"X":false,"Y":false,"LB":false,"RB":false,"back":false,"start":false,"up":false,"down":false,"left":false,"right":false,"LS":false,"RS":false}}
  ```
- Single `gamepad.update()` call per message for atomic state application
- Reset controller to neutral on client disconnect
- *Depends on*: Step 1.1

**Step 1.3**: Retain pydirectinput for keyboard shortcuts (hybrid mode)
- Legacy plain-text messages still work for keyboard keys
- JSON keyboard messages: `{"type":"key","action":"press","key":"f3"}` or `{"type":"key","action":"keydown","key":"shift"}`
- Support key combinations via modifiers array
- This handles game-specific hotkeys (F3-F8, Esc, etc.) that aren't Xbox-mappable
- *Depends on*: Step 1.1 (parallel with Step 1.2)

**Step 1.4**: Robust connection handling & logging
- Fix broken reconnect logic in current code
- WebSocket ping/pong keepalive
- Auto-reset gamepad state on disconnect
- Structured logging with timestamps
- *Depends on*: Step 1.1

**Files modified**: `server/main.py` — complete rewrite, `server/requirements.txt` — add `vgamepad`, `aiohttp`

---

### Phase 2: Client Core Architecture (Vanilla JS, Mobile-First)

**Step 2.1**: Create modular client structure
- `client/index.html` — Shell with mode container, toolbar, and script includes
- `client/css/main.css` — Mobile-first responsive styles, dark theme, touch-optimized
- `client/js/app.js` — App controller: mode switching, initialization, global state
- `client/js/websocket.js` — WebSocket manager with auto-reconnect, message queue
- `client/js/storage.js` — Profile CRUD via localStorage, import/export JSON files
- `client/js/controls.js` — Control type base classes (Button, HoldButton, Joystick, Slider, DPad)
- `client/js/editor.js` — Semi-visual editor: drag-to-position, property panel, add/delete
- `client/js/ui.js` — Toolbar, modals, notifications, connection status indicator
- *Depends on*: Phase 1 (server must serve these files)
- *Parallel with*: Step 2.2

**Step 2.2**: Implement mode-switching architecture
- Two modes: **Play Mode** (default) and **Edit Mode**
- Play Mode: Full-screen control surface, all interactions send WebSocket messages
- Edit Mode: Toolbar visible, controls are selectable/draggable, properties panel on selection
- Mode toggle button in top toolbar, with confirmation if unsaved changes
- Visual indicator of current mode (color-coded header)
- *Depends on*: Step 2.1

**Files created**: All files under `client/` directory

---

### Phase 3: Virtual XInput Gamepad Controls (Play Mode)

All controls send JSON gamepad-state messages at ~60Hz via WebSocket. The server maps these to vgamepad XInput calls.

**Step 3.1**: Implement VirtualJoystick control → Xbox Left Thumbstick
- Canvas-based circular touch area with visual thumb indicator
- Touch/drag tracking: calculate angle and distance from center
- Output: normalized X/Y (-1.0 to 1.0) mapped to `leftStick.x` / `leftStick.y`
- Dead zone: inner ~12% to prevent drift when finger is near center
- Outer ring: clamp to unit circle (distance ≤ 1.0)
- On touchstart: begin tracking touch ID, start sending gamepad state
- On touchmove: update position, send new state
- On touchend: reset to (0, 0), send neutral state
- Prevent scrolling/zooming on joystick canvas (`touch-action: none`)
- Visual: concentric rings with glowing position indicator
- *Depends on*: Phase 2 mode switching, Phase 1 XInput protocol

**Step 3.2**: Implement VirtualTrigger (Slider) → Xbox LT / RT
- Vertical bar with draggable thumb
- Maps position (0%–100%) to trigger value (0.0–1.0)
- Left slider → `triggers.left`, Right slider → `triggers.right`
- Typical layout: left slider for brake (LT), right slider for throttle (RT)
- Touch handling: track touch ID, update value continuously
- On release: value snaps to 0 (spring-return behavior), sends 0.0
- Visual: bar with fill gradient, thumb indicator
- *Depends on*: Step 3.1 (shared touch tracking patterns)

**Step 3.3**: Implement Xbox Face Buttons → Xbox A/B/X/Y
- 4 buttons arranged in diamond (Xbox layout: Y top, A bottom, X left, B right)
- Touchstart → `buttons.A: true` (keyDown), touchend → `buttons.A: false` (keyUp)
- Visual pressed state (scale + color feedback)
- Each button sends its state as part of the unified gamepad message
- Also supports mapping to keyboard shortcuts for hybrid use
- *Depends on*: Step 3.1

**Step 3.4**: Implement DPad control → Xbox D-Pad
- 4-directional pad (up/down/left/right in cross layout)
- Maps to `buttons.up`, `buttons.down`, `buttons.left`, `buttons.right`
- Supports diagonals (e.g., up+right pressed simultaneously)
- Touch handling with hit-test zones per direction
- *Depends on*: Step 3.1

**Step 3.5**: Implement Shoulder Buttons & Menu Buttons → Xbox LB/RB/Start/Back
- LB/RB as rectangular buttons at top of layout
- Start/Back as smaller buttons in center area
- Same touchstart/touchend pattern as face buttons
- *Depends on*: Step 3.1

**Step 3.6**: Implement hybrid Keyboard Button (tap to press key/combo)
- For game-specific functions not mappable to Xbox (F3-F8, Esc, etc.)
- Sends `{"type":"key","action":"press","key":"f3"}` — server uses pydirectinput
- Visual tap feedback
- Configurable as single key or key combo
- *Depends on*: Phase 1 hybrid protocol, can run parallel with Steps 3.1-3.5

**Step 3.7**: Unified gamepad state sender (60Hz loop)
- Collect state from all active controls into single JSON payload
- Send via WebSocket at 60 FPS using `requestAnimationFrame` or `setInterval(16ms)`
- Only send when state actually changes (dirty-flag optimization)
- If no gamepad controls active, fall back to no-send (idle)
- On any control touchstart, start the send loop; when all controls release, stop after a brief timeout
- *Depends on*: Steps 3.1-3.6

**Files modified/created**: `client/js/controls.js` (all control classes), `client/js/websocket.js` (send loop), `client/css/main.css` (control styling)

---

### Phase 4: Semi-Visual Editor (Edit Mode)

**Step 4.1**: Implement drag-to-reposition
- In Edit Mode, controls get drag handles and selection outlines
- Touch drag moves control to new position
- Snap-to-grid option (configurable grid size, toggle on/off)
- Real-time position display (x, y tooltip)
- Prevent WebSocket messages during editing
- *Depends on*: Step 2.2, Phase 3 controls

**Step 4.2**: Build Properties Panel
- Slide-up panel (mobile-friendly) or side panel (tablet/desktop)
- Shows when a control is selected in Edit Mode
- Editable fields differ by control type:
  - **Joystick**: Label, Size, Dead Zone %, Visual Style, mapped to leftStick or rightStick
  - **Trigger/Slider**: Label, Orientation, Size, mapped to leftTrigger or rightTrigger, spring-return on/off
  - **Face Buttons**: Label, Xbox Button (A/B/X/Y), or keyboard key alternative
  - **DPad**: 4 direction labels, each mappable to Xbox D-pad or keyboard
  - **Shoulder/Menu**: Label, mapped button (LB/RB/Start/Back)
  - **Keyboard Button**: Label, Key Binding (single or combo), Image URL
- Live preview of changes in Play Mode
- *Depends on*: Step 4.1

**Step 4.3**: Add/Delete controls
- "Add Control" button in Edit Mode toolbar
- Control type picker: Button, Hold Button, Joystick, Slider, D-Pad
- New control appears at center of viewport with default properties
- Delete with confirmation (or undo support)
- *Depends on*: Step 4.1

**Step 4.4**: Implement undo/redo
- Command pattern: track all edits (move, resize, property change, add, delete)
- Undo/redo buttons in Edit Mode toolbar
- History capped at 50 entries
- *Depends on*: Step 4.1 (can be added after basic editor works)

**Files modified/created**: `client/js/editor.js`, `client/js/ui.js`, `client/css/main.css`

---

### Phase 5: Import/Export & Profile Management

**Step 5.1**: Enhanced export format
- Export full layout as `.hublayout` JSON including:
  - `version`: 2, `name`, `created`, `gridSize`
  - `controls[]`: array of control objects with `type`, `position` (x, y), `size` (w, h), and type-specific `properties`
  - Control properties by type:
    - `joystick`: `stickMapping` (leftStick/rightStick), `deadZone`, `visualStyle`
    - `trigger`: `triggerMapping` (leftTrigger/rightTrigger), `orientation` (vertical/horizontal), `springReturn`
    - `xboxButton`: `button` (A/B/X/Y/LB/RB/Start/Back/LS/RS), `alternateKey` (optional keyboard fallback)
    - `dpad`: `up`, `down`, `left`, `right` (each: xbox mapping or keyboard key)
    - `keyboardButton`: `key`, `modifiers[]`, `imageUrl`
- Legacy export as `buttonConfigs.json` for backward compatibility (keyboard buttons only)
- *Depends on*: Phase 3 controls (need the data structures)

**Step 5.2**: Enhanced import with preview
- Import `.hublayout` or legacy `.json` files
- Show preview summary: control count by type, layout name, version
- Merge or replace option
- Validation: warn on unknown control types, missing required fields
- *Depends on*: Step 5.1

**Step 5.3**: Profile management (localStorage)
- Save current layout as named profile to localStorage
- Load profile from saved list
- Delete/rename profiles
- Auto-save current layout on changes (with setting toggle)
- Profile list UI in a slide-out drawer
- *Depends on*: Step 5.1

**Files modified/created**: `client/js/storage.js`, `client/js/ui.js`

---

### Phase 6: UI Polish & Mobile Optimization

**Step 6.1**: Toolbar & Navigation
- Top toolbar (persistent, ~48px height): Mode toggle, Connection status indicator, Profile name, Menu (hamburger)
- Menu drawer: Profiles, Import, Export, Settings, About
- Bottom status bar in Edit Mode: control count, grid toggle, undo/redo
- *Depends on*: Phase 2

**Step 6.2**: Connection Status & Settings
- Visual indicator: Connected (green), Disconnected (red), Reconnecting (yellow pulse)
- Tap indicator to show server IP and allow editing
- Settings modal: Server IP:Port, Grid size, Auto-save toggle, Theme (dark only for now)
- Persist settings in localStorage
- *Depends on*: Step 6.1

**Step 6.3**: Mobile viewport & touch optimization
- Meta viewport tag with `user-scalable=no` in Play Mode
- `touch-action: none` on gamepad control areas
- Fullscreen API support (toggle button)
- Prevent iOS bounce/rubber-band effect
- Orientation lock suggestion for consistent layout
- *Depends on*: Phase 3

**Step 6.4**: Visual design system
- Dark theme with accent colors (gaming aesthetic)
- Control styling: subtle shadows, rounded corners, pressed states
- Animations: button press feedback, mode transition, panel slide
- High contrast touch targets (minimum 44×44px)
- Custom icons for toolbar (inline SVG or emoji)
- *Depends on*: Phase 2, runs in parallel with Phase 3-6

**Files modified**: `client/css/main.css`, `client/index.html`

---

### Phase 7: Pre-built Layout Templates

**Step 7.1**: Euro Truck Simulator 2 layout (primary template)
- **Left joystick** (leftStick): Steering (analog X-axis, with slight Y for look if desired)
- **Left trigger slider** (LT, left side): Brake (analog 0.0–1.0)
- **Right trigger slider** (RT, right side): Throttle/Accelerate (analog 0.0–1.0)
- **DPad** (center-bottom): Navigation in menus
- **Face buttons row** (top): A (enter/confirm), B (cancel), X, Y — mapped as appropriate
- **Keyboard buttons row** (top): F3 (GPS), F5 (Route Advisor), F6 (Cargo), F7 (Service), F8 (Info), Esc (menu), Enter
- **Shoulder buttons**: LB (left turn signal), RB (right turn signal)
- Pre-configured for ETS2 default keybindings
- *Depends on*: Phase 3, Phase 5

**Step 7.2**: Generic racing/driving layout
- Left joystick for steering
- Right trigger slider for throttle, left for brake
- Face buttons for common actions (handbrake, camera, reset)
- *Depends on*: Phase 3, Phase 5

**Step 7.3**: Generic action/adventure layout
- Left joystick for movement (leftStick)
- Right joystick for camera (rightStick) — smaller, lower-right
- Face buttons for primary actions
- Shoulder buttons for secondary actions
- *Depends on*: Phase 3, Phase 5

**Files created**: `client/layouts/ets2.hublayout`, `client/layouts/racing.hublayout`, `client/layouts/action.hublayout`

---

### Verification
1. Server starts, serves HTTP, accepts WebSocket
2. Client loads, connects, Play/Edit mode switching works
3. Virtual joystick renders, sends analog X/Y values
4. Triggers, Xbox buttons, DPad, keyboard buttons all work
5. Editor: add, drag, properties panel, undo/redo
6. Import/export: `.hublayout` + legacy `.json`
7. E2E with ETS2: joystick steering, triggers throttle/brake

### Decisions
- **XInput via ViGEmBus + vgamepad**: Virtual Xbox 360 controller at OS level
- **Hybrid**: vgamepad for Xbox controls + pydirectinput for keyboard shortcuts
- **Vanilla JS**: Zero dependencies, works on any mobile browser
- **Mobile-first**: touch events, `touch-action: none`
- **localStorage**: client-side storage only
- **Single port**: HTTP + WebSocket on port 8080
