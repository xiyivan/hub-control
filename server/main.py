import asyncio
from websockets.server import serve
import pydirectinput as pi

async def main(websocket):
    async for message in websocket:
        pi.press(message)
        

async def connect():
    async with serve(main, "localhost", 8080):
        await asyncio.Future()

asyncio.run(connect())
