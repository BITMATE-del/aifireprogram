"""Private, account-owner-authorized Telegram group bridge.
All outgoing messages require explicit approval in the admin console.
One deployment = one owned Telegram account; no session secrets are logged.
"""
import asyncio
import logging
import os
from aiohttp import ClientSession, ClientTimeout
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.errors import FloodWaitError, RPCError

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"),format="%(asctime)s %(levelname)s %(message)s")
log=logging.getLogger("moment.bridge")

API_ID=int(os.environ["TELEGRAM_API_ID"])
API_HASH=os.environ["TELEGRAM_API_HASH"]
SESSION=os.environ["TELEGRAM_STRING_SESSION"]
ACCOUNT_ID=os.environ["TELEGRAM_ACCOUNT_ID"]
BRIDGE_KEY=os.environ["TELEGRAM_BRIDGE_KEY"]
BASE=os.environ["MOMENT_BASE_URL"].rstrip("/")
CHATS={int(part.strip()) for part in os.environ["TELEGRAM_ALLOWED_CHAT_IDS"].split(",") if part.strip()}
POLL_SECONDS=max(3,int(os.getenv("BRIDGE_POLL_SECONDS","8")))

if len(BRIDGE_KEY)<32:
    raise RuntimeError("TELEGRAM_BRIDGE_KEY needs at least 32 characters")
if not CHATS:
    raise RuntimeError("No allowed chat IDs configured")
if not BASE.startswith("https://"):
    raise RuntimeError("MOMENT_BASE_URL must be HTTPS")

headers={"x-bridge-key":BRIDGE_KEY}
client=TelegramClient(StringSession(SESSION),API_ID,API_HASH,auto_reconnect=True)

async def submit(session, payload):
    async with session.post(BASE+"/api/bridge",json=payload,headers=headers) as res:
        if res.status!=200:
            log.warning("bridge POST failed, status=%s",res.status)
            return None
        return await res.json()

async def pump(session):
    while True:
        for chat_id in CHATS:
            try:
                async with session.get(BASE+"/api/bridge",params={"accountId":ACCOUNT_ID,"chatId":str(chat_id)},headers=headers) as res:
                    if res.status!=200:
                        log.warning("bridge poll failed status=%s",res.status)
                        continue
                    result=await res.json()
                job=result.get("job")
                if not job:
                    continue
                try:
                    sent=await client.send_message(chat_id,str(job["body"]),reply_to=int(job["reply_to_message_id"]))
                    await submit(session,{"type":"ack","accountId":ACCOUNT_ID,"chatId":str(chat_id),"jobId":int(job["id"]),"sent":True,"sentMessageId":sent.id})
                    log.info("approved reply sent, job id=%s",job["id"])
                except FloodWaitError as exc:
                    await submit(session,{"type":"ack","accountId":ACCOUNT_ID,"chatId":str(chat_id),"jobId":int(job["id"]),"sent":False,"error":"Telegram rate-limit, retry not automatic"})
                    log.warning("Telegram rate-limited, sleeping %s seconds",exc.seconds)
                    await asyncio.sleep(exc.seconds)
                except RPCError as exc:
                    await submit(session,{"type":"ack","accountId":ACCOUNT_ID,"chatId":str(chat_id),"jobId":int(job["id"]),"sent":False,"error":type(exc).__name__})
                    log.warning("Telegram API rejected approved reply: %s",type(exc).__name__)
                except Exception as exc:
                    # Fail closed; no retry after uncertain send result to avoid duplicates.
                    await submit(session,{"type":"ack","accountId":ACCOUNT_ID,"chatId":str(chat_id),"jobId":int(job["id"]),"sent":False,"error":type(exc).__name__})
                    log.exception("reply failed")
            except Exception:
                log.exception("bridge polling error")
        await asyncio.sleep(POLL_SECONDS)

async def main():
    await client.connect()
    if not await client.is_user_authorized():
        raise RuntimeError("Telegram session is not authorized; authenticate it locally first")
    self_user=await client.get_me()
    log.info("Authorized Telegram account connected (numeric user id=%s)",self_user.id)
    await client.get_dialogs() # Cache group entities for reply resolution.
    timeout=ClientTimeout(total=20)
    async with ClientSession(timeout=timeout) as session:
        @client.on(events.NewMessage(incoming=True))
        async def on_message(event):
            if event.chat_id not in CHATS or not event.is_group or not event.raw_text:
                return
            if event.sender_id==self_user.id or getattr(event.sender,"bot",False):
                return
            sender_name=""
            try:
                sender=await event.get_sender()
                sender_name=(" ".join(filter(None,[getattr(sender,"first_name",""),getattr(sender,"last_name","")])) or getattr(sender,"username","") or "참여자")[:100]
            except Exception:
                sender_name="참여자"
            await submit(session,{
                "type":"message","accountId":ACCOUNT_ID,"chatId":str(event.chat_id),
                "messageId":int(event.id),"senderId":str(event.sender_id),
                "senderName":sender_name,"text":event.raw_text[:1500]
            })
        await pump(session)

if __name__=="__main__":
    asyncio.run(main())
