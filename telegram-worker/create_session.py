"""Run locally, not on the Railway worker. Never share the session string."""
import asyncio
import os
from telethon import TelegramClient
from telethon.sessions import StringSession

async def main():
    api_id=int(os.environ["TELEGRAM_API_ID"])
    api_hash=os.environ["TELEGRAM_API_HASH"]
    async with TelegramClient(StringSession(),api_id,api_hash) as client:
        session=StringSession.save(client.session)
        print("Store the following in Railway TELEGRAM_STRING_SESSION. Treat it as a password:")
        print(session)

if __name__=="__main__":
    asyncio.run(main())
