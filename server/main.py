"""
hub-control v2 - Server
Serves the web client via HTTP and handles control messages via WebSocket.
Supports both XInput virtual controller emulation (vgamepad/ViGEmBus)
and keyboard shortcut simulation (pydirectinput) in a hybrid architecture.
"""

import asyncio
import json
import logging
import socket
import sys
from pathlib import Path

import pydirectinput
from aiohttp import web

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("hub-control")

# ---------------------------------------------------------------------------
# XInput (vgamepad) - optional but recommended
# ---------------------------------------------------------------------------
try:
    import vgamepad as vg

    _VX = vg.VX360Gamepad
    _BTN = vg.XUSB_BUTTON

    # Xbox button name -> vgamepad constant
    XBOX_BUTTON_MAP: dict[str, int] = {
        "A": _BTN.XUSB_GAMEPAD_A,
        "B": _BTN.XUSB_GAMEPAD_B,
        "X": _BTN.XUSB_GAMEPAD_X,
        "Y": _BTN.XUSB_GAMEPAD_Y,
        "LB": _BTN.XUSB_GAMEPAD_LEFT_SHOULDER,
        "RB": _BTN.XUSB_GAMEPAD_RIGHT_SHOULDER,
        "back": _BTN.XUSB_GAMEPAD_BACK,
        "start": _BTN.XUSB_GAMEPAD_START,
        "LS": _BTN.XUSB_GAMEPAD_LEFT_THUMB,
        "RS": _BTN.XUSB_GAMEPAD_RIGHT_THUMB,
        "up": _BTN.XUSB_GAMEPAD_DPAD_UP,
        "down": _BTN.XUSB_GAMEPAD_DPAD_DOWN,
        "left": _BTN.XUSB_GAMEPAD_DPAD_LEFT,
        "right": _BTN.XUSB_GAMEPAD_DPAD_RIGHT,
        "guide": _BTN.XUSB_GAMEPAD_GUIDE,
    }

    gamepad: "vg.VX360Gamepad | None" = None

    def init_gamepad() -> "vg.VX360Gamepad":
        """Create the singleton virtual Xbox 360 controller."""
        g = _VX()
        g.update()  # send neutral state
        log.info("Virtual Xbox 360 controller created via ViGEmBus")
        return g

    def apply_gamepad_state(state: dict) -> None:
        """Apply a full gamepad state dict from the client."""
        global gamepad
        if gamepad is None:
            gamepad = init_gamepad()

        ls = state.get("leftStick", {})
        rs = state.get("rightStick", {})
        tr = state.get("triggers", {})
        btns = state.get("buttons", {})

        # Analog sticks (normalized -1..1 floats)
        gamepad.left_joystick_float(
            x_value_float=float(ls.get("x", 0.0)),
            y_value_float=float(ls.get("y", 0.0)),
        )
        gamepad.right_joystick_float(
            x_value_float=float(rs.get("x", 0.0)),
            y_value_float=float(rs.get("y", 0.0)),
        )

        # Analog triggers (0..1 floats)
        gamepad.left_trigger_float(value_float=float(tr.get("left", 0.0)))
        gamepad.right_trigger_float(value_float=float(tr.get("right", 0.0)))

        # Buttons (boolean dict)
        for name, pressed in btns.items():
            btn_const = XBOX_BUTTON_MAP.get(name)
            if btn_const is None:
                continue
            if pressed:
                gamepad.press_button(button=btn_const)
            else:
                gamepad.release_button(button=btn_const)

        gamepad.update()

    def reset_gamepad() -> None:
        """Reset virtual controller to neutral (called on disconnect)."""
        global gamepad
        if gamepad is not None:
            gamepad.reset()
            gamepad.update()

except ImportError:
    log.warning("vgamepad not installed - XInput emulation disabled")
    vg = None  # type: ignore
    gamepad = None

    def init_gamepad():  # type: ignore
        return None

    def apply_gamepad_state(state):  # type: ignore
        pass

    def reset_gamepad():  # type: ignore
        pass


# ---------------------------------------------------------------------------
# Keyboard shortcuts (pydirectinput) - always available
# ---------------------------------------------------------------------------

# Map common key names that pydirectinput doesn't recognize directly
_KEY_ALIASES: dict[str, str] = {
    "pagedown": "pagedown",
    "pageup": "pageup",
    "scrolllock": "scrolllock",
    "num0": "num0",
    "num1": "num1",
    "num2": "num2",
    "num3": "num3",
    "num4": "num4",
    "num5": "num5",
    "num6": "num6",
    "num7": "num7",
    "num8": "num8",
    "num9": "num9",
}


def _resolve_key(key: str) -> str:
    """Resolve a key name for pydirectinput."""
    return _KEY_ALIASES.get(key.lower(), key)


def handle_key_message(msg: dict) -> None:
    """Handle a keyboard-related message."""
    action = msg.get("action", "press")
    key = msg.get("key", "")
    modifiers = msg.get("modifiers", [])

    if not key:
        return

    resolved = _resolve_key(key)

    # Hold modifiers
    for mod in modifiers:
        pydirectinput.keyDown(_resolve_key(mod))

    try:
        if action == "keydown":
            pydirectinput.keyDown(resolved)
        elif action == "keyup":
            pydirectinput.keyUp(resolved)
        else:  # "press" - default
            pydirectinput.press(resolved)
    finally:
        # Release modifiers
        for mod in modifiers:
            pydirectinput.keyUp(_resolve_key(mod))


# ---------------------------------------------------------------------------
# Legacy plain-text message handling (backward compatibility)
# ---------------------------------------------------------------------------
def handle_legacy_message(message: str) -> None:
    """Handle old-style plain-text key name messages."""
    key = message.strip()
    if key:
        pydirectinput.press(_resolve_key(key))


# ---------------------------------------------------------------------------
# WebSocket handler
# ---------------------------------------------------------------------------
async def ws_handler(request: web.Request) -> web.WebSocketResponse:
    """Handle a WebSocket connection from a client."""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    peer = request.remote
    ui_log(f"Client connected: {peer}")

    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                data = msg.data.strip()
                if not data:
                    continue

                # Try JSON first, fall back to legacy plain text
                try:
                    obj = json.loads(data)
                    msg_type = obj.get("type", "")

                    if msg_type == "gamepad":
                        apply_gamepad_state(obj)
                    elif msg_type == "key":
                        handle_key_message(obj)
                    else:
                        log.warning(f"Unknown JSON message type: {msg_type}")

                except (json.JSONDecodeError, TypeError):
                    # Legacy plain-text message
                    handle_legacy_message(data)
                    log.debug(f"Legacy key: {data}")

            elif msg.type == web.WSMsgType.ERROR:
                log.error(f"WebSocket error: {ws.exception()}")

    except asyncio.CancelledError:
        pass
    finally:
        ui_log(f"Client disconnected: {peer}")
        reset_gamepad()

    return ws


# ---------------------------------------------------------------------------
# Server UI (tkinter status window)
# ---------------------------------------------------------------------------
import threading
import queue as _queue_mod
import tkinter as tk
from tkinter import ttk, scrolledtext
from datetime import datetime

_ui_queue: "_queue_mod.Queue" = _queue_mod.Queue()


class ServerUI:
    """Simple tkinter window showing server info and connection log."""

    def __init__(self, local_ip: str, port: int, xinput_enabled: bool):
        self.root = tk.Tk()
        self.root.title("hub-control v2 — Server")
        self.root.geometry("420x380")
        self.root.resizable(True, True)
        self.root.configure(bg="#0d1117")
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

        # --- Style ---
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("TFrame", background="#0d1117")
        style.configure("TLabel", background="#0d1117", foreground="#e6edf3", font=("Segoe UI", 10))
        style.configure("Title.TLabel", font=("Segoe UI", 18, "bold"), foreground="#58a6ff")
        style.configure("IP.TLabel", font=("Consolas", 20, "bold"), foreground="#3fb950")
        style.configure("Sub.TLabel", font=("Segoe UI", 9), foreground="#8b949e")
        style.configure("Green.TLabel", foreground="#3fb950")
        style.configure("Red.TLabel", foreground="#f85149")
        style.configure("TButton", font=("Segoe UI", 10))

        main_frame = ttk.Frame(self.root, padding=16)
        main_frame.pack(fill=tk.BOTH, expand=True)

        # Title
        ttk.Label(main_frame, text="hub-control v2", style="Title.TLabel").pack(anchor=tk.W)

        # IP address
        ttk.Label(main_frame, text="Server IP", style="Sub.TLabel").pack(anchor=tk.W, pady=(12, 0))
        ttk.Label(main_frame, text=local_ip, style="IP.TLabel").pack(anchor=tk.W)

        # Port & XInput status
        info_frame = ttk.Frame(main_frame)
        info_frame.pack(fill=tk.X, pady=(8, 0))
        ttk.Label(info_frame, text=f"Port: {port}").pack(side=tk.LEFT)
        status_text = "XInput ENABLED" if xinput_enabled else "XInput disabled"
        status_style = "Green.TLabel" if xinput_enabled else "Red.TLabel"
        ttk.Label(info_frame, text=f"  |  {status_text}", style=status_style).pack(side=tk.LEFT)

        # URLs
        url_frame = ttk.Frame(main_frame)
        url_frame.pack(fill=tk.X, pady=(8, 0))
        ttk.Label(url_frame, text=f"HTTP:  http://{local_ip}:{port}/", style="Sub.TLabel").pack(anchor=tk.W)
        ttk.Label(url_frame, text=f"WS:    ws://{local_ip}:{port}/ws", style="Sub.TLabel").pack(anchor=tk.W)

        # Connection log
        ttk.Label(main_frame, text="Connection Log", style="Sub.TLabel").pack(anchor=tk.W, pady=(16, 4))
        self.log_area = scrolledtext.ScrolledText(
            main_frame, height=10, bg="#161b22", fg="#e6edf3",
            font=("Consolas", 9), relief=tk.FLAT, borderwidth=0,
            insertbackground="#e6edf3",
        )
        self.log_area.pack(fill=tk.BOTH, expand=True)
        self.log_area.configure(state=tk.DISABLED)

        # Bottom bar
        bottom = ttk.Frame(main_frame)
        bottom.pack(fill=tk.X, pady=(8, 0))
        self.status_label = ttk.Label(bottom, text="● Running", style="Green.TLabel")
        self.status_label.pack(side=tk.LEFT)
        ttk.Button(bottom, text="Copy IP", command=self._copy_ip).pack(side=tk.RIGHT)

        self._log(f"Server started on {local_ip}:{port}")
        self._poll_queue()

    def _log(self, message: str) -> None:
        ts = datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] {message}\n"
        self.log_area.configure(state=tk.NORMAL)
        self.log_area.insert(tk.END, line)
        self.log_area.see(tk.END)
        self.log_area.configure(state=tk.DISABLED)

    def _copy_ip(self) -> None:
        self.root.clipboard_clear()
        self.root.clipboard_append(get_local_ip())
        self._log("IP copied to clipboard")

    def _poll_queue(self) -> None:
        try:
            while True:
                msg = _ui_queue.get_nowait()
                self._log(msg)
        except _queue_mod.Empty:
            pass
        self.root.after(300, self._poll_queue)

    def _on_close(self) -> None:
        import os
        os._exit(0)

    def run(self) -> None:
        self.root.mainloop()


def ui_log(message: str) -> None:
    """Thread-safe log to the server UI window."""
    _ui_queue.put(message)
    log.info(message)


# ---------------------------------------------------------------------------
# HTTP routes
# ---------------------------------------------------------------------------
CLIENT_DIR = Path(__file__).resolve().parent.parent / "client"


async def index_handler(request: web.Request) -> web.FileResponse:
    """Serve the main client page."""
    return web.FileResponse(CLIENT_DIR / "index.html")


async def static_handler(request: web.Request) -> web.FileResponse | web.Response:
    """Serve static files from the client directory."""
    rel_path = request.match_info.get("path", "")
    file_path = (CLIENT_DIR / rel_path).resolve()

    # Security: ensure path stays within client directory
    if not str(file_path).startswith(str(CLIENT_DIR.resolve())):
        return web.Response(status=403, text="Forbidden")

    if file_path.is_file():
        return web.FileResponse(file_path)
    return web.Response(status=404, text="Not found")


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------
def create_app() -> web.Application:
    """Create and configure the aiohttp application."""
    app = web.Application()

    # Routes
    app.router.add_get("/", index_handler)
    app.router.add_get("/ws", ws_handler)
    app.router.add_get("/{path:.*}", static_handler)

    return app


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def get_local_ip() -> str:
    """Get the local network IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0)
        s.connect(("10.254.254.254", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


def main() -> None:
    """Start the hub-control server with tkinter status window."""
    host = "0.0.0.0"
    port = 8080
    local_ip = get_local_ip()
    xinput_ok = vg is not None

    # Build aiohttp app
    app = create_app()

    # Start aiohttp in a daemon thread
    def run_server():
        web.run_app(app, host=host, port=port, print=None)

    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Run tkinter UI in the main thread (blocks until window closes)
    ui = ServerUI(local_ip, port, xinput_ok)
    ui.run()


if __name__ == "__main__":
    main()
