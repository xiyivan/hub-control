# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for hub-control v2 server.
Build: pyinstaller hub-control.spec
"""

import sys
from pathlib import Path

block_cipher = None

# Project root and client directory
_PROJ = Path(SPECPATH).resolve()
_CLIENT = _PROJ / "client"

# Collect all client files as data
client_datas = []
for f in _CLIENT.rglob("*"):
    if f.is_file():
        dest_path = Path("client") / f.relative_to(_CLIENT)
        client_datas.append((str(f), str(dest_path.parent)))
print(f"Collected {len(client_datas)} client files")

# Collect vgamepad native DLLs (must match path pattern: vgamepad/win/vigem/client/{arch}/)
vg_dlls = []
try:
    import vgamepad as _vg
    _vg_root = Path(_vg.__file__).resolve().parent
    for dll in _vg_root.rglob("ViGEmClient.dll"):
        # Preserve the relative path from vgamepad package root
        rel = dll.parent.relative_to(_vg_root)
        dest = str(Path("vgamepad") / rel)
        vg_dlls.append((str(dll), dest))
    print(f"Found {len(vg_dlls)} vgamepad DLL(s) to bundle")
except ImportError:
    print("vgamepad not found in build env — XInput will be disabled in frozen exe")

a = Analysis(
    ["server/main.py"],
    pathex=[str(_PROJ)],
    binaries=vg_dlls,
    datas=client_datas,
    hiddenimports=[
        "aiohttp",
        "pydirectinput",
        "websockets",
        "tkinter",
        "json",
        "logging",
        "asyncio",
        "socket",
        "pathlib",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="hub-control-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,          # Show console window (needed for tkinter)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
