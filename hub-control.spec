# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for hub-control v2 server.
Build: pyinstaller hub-control.spec
"""

import sys
from pathlib import Path

block_cipher = None

# Project root and client directory
_PROJ = Path(SPECPATH).resolve().parent
_CLIENT = _PROJ / "client"

# Collect all client files as data
client_datas = []
for f in _CLIENT.rglob("*"):
    if f.is_file():
        dest = str(Path("client") / f.relative_to(_CLIENT))
        client_datas.append((str(f), str(dest.parent)))

a = Analysis(
    ["server/main.py"],
    pathex=[str(_PROJ)],
    binaries=[],
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
