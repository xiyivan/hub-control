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
    log.info(f"Client connected: {peer}")

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
        log.info(f"Client disconnected: {peer}")
        reset_gamepad()

    return ws


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
    """Start the hub-control server."""
    host = "0.0.0.0"
    port = 8080
    local_ip = get_local_ip()

    print("=" * 50)
    print("  hub-control v2 - Server")
    print("=" * 50)
    print(f"  Local IP:   {local_ip}")
    print(f"  HTTP:       http://{local_ip}:{port}/")
    print(f"  WebSocket:  ws://{local_ip}:{port}/ws")
    print(f"  XInput:     {'enabled' if vg is not None else 'DISABLED (install vgamepad)'}")
    print("=" * 50)

    app = create_app()
    web.run_app(app, host=host, port=port, print=None)


if __name__ == "__main__":
    main()
