import asyncio
from websockets.server import serve
from pydirectinput import press
import socket
from time import time

print(socket.gethostbyname(socket.gethostname()))

async def main(websocket):
    async for message in websocket:
        print(message)
        press(message)
        if time() - startt > 600:
            connect()
        

async def connect():
    global startt
    startt = time()
    async with serve(main, "0.0.0.0", 8080):
        await asyncio.Future()

asyncio.run(connect())
