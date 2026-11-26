"""Generate your own Telegram session on your own PC.

This script never sends the session to ChatGPT, GitHub or Railway.
Only enter the resulting secret directly into Railway Variables.
"""
import asyncio
import getpass
import os
from telethon import TelegramClient
from telethon.sessions import StringSession

async def main():
    api_id_raw=os.environ.get("TELEGRAM_API_ID") or input("Telegram API ID (numbers): ").strip()
    api_hash=os.environ.get("TELEGRAM_API_HASH") or getpass.getpass("Telegram API HASH (hidden): ").strip()
    api_id=int(api_id_raw)
    if len(api_hash)<20:
        raise ValueError("Invalid API HASH")
    print("\nYour phone number and login code are entered directly into Telethon.")
    async with TelegramClient(StringSession(),api_id,api_hash) as client:
        user=await client.get_me()
        print(f"Authorized account: {user.id}")
        session=StringSession.save(client.session)
        print("\n===== TELEGRAM_STRING_SESSION (SECRET) =====\n")
        print(session)
        print("\n===== END SECRET =====")
        print("\nCopy the secret to Railway > telegram-worker > Variables.")
        print("Do not send this secret to ChatGPT or anyone else.")

if __name__=="__main__":
    asyncio.run(main())
