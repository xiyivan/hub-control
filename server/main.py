import asyncio
from websockets.server import serve
import pydirectinput as pi

async def main(websocket):
    async for message in websocket:
        print(message)
        pi.press(message)
        

async def connect():
    async with serve(main, "0.0.0.0b", 8080):
        await asyncio.Future()

asyncio.run(connect())
