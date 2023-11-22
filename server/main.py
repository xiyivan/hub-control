import asyncio
from websockets.server import serve

async def main(websocket):
    async for message in websocket:
        print(message)
        

async def connect():
    async with serve(main, "localhost", 8080):
        await asyncio.Future()

asyncio.run(connect())
