"""Multi-account, opt-in Telegram worker for Moment Studio.

Telegram credentials are configured per account on the admin website.
Secrets never appear in server logs. Automatic replies require administrator start and group disclosure.
"""
import asyncio
import hashlib
import logging
import os
from dataclasses import dataclass, field

from aiohttp import ClientSession, ClientTimeout
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.errors import FloodWaitError, RPCError
from login_flow import poll as poll_logins
from session_file_import import poll as poll_session_files

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")
log=logging.getLogger("moment.bridge")
BASE=os.environ["MOMENT_BASE_URL"].rstrip("/")
BRIDGE_KEY=os.environ["TELEGRAM_BRIDGE_KEY"]
if len(BRIDGE_KEY)<32 or not BASE.startswith("https://"):
    raise RuntimeError("Secure bridge key (32+ characters) and HTTPS base URL are required")
POLL_SECONDS=max(5,int(os.getenv("BRIDGE_POLL_SECONDS","8")))
REFRESH_SECONDS=max(30,int(os.getenv("ACCOUNT_REFRESH_SECONDS","60")))
HEADERS={"x-bridge-key":BRIDGE_KEY}
OWNED_USER_IDS:set[int]=set()


@dataclass
class Connection:
    account_id:str
    fingerprint:str
    client:TelegramClient
    chat_ids:set[int]=field(default_factory=set)
    user_id:int=0


async def bridge_json(session:ClientSession,method:str,path:str,**kwargs):
    try:
        async with session.request(method,BASE+path,headers=HEADERS,**kwargs) as response:
            if response.status!=200:
                log.warning("bridge %s %s returned HTTP %s",method,path,response.status)
                return None
            return await response.json()
    except Exception as exc:
        log.warning("bridge unavailable: %s",type(exc).__name__)
        return None


async def connect_account(session:ClientSession,entry:dict,fingerprint:str):
    account_id=str(entry["accountId"])
    client=TelegramClient(StringSession(entry["telegramSession"]),int(entry["telegramApiId"]),entry["telegramApiHash"],
                          auto_reconnect=True,connection_retries=3,request_retries=2)
    try:
        await client.connect()
        if not await client.is_user_authorized():
            raise RuntimeError("Account session not authorized")
        user=await client.get_me()
        chat_ids=set(int(cid) for cid in entry["chatIds"])
        connection=Connection(account_id,fingerprint,client,chat_ids,user.id)
        dialogs=await client.get_dialogs()
        discovered=[{"id":str(d.id),"title":str(d.name or "그룹")[:120]} for d in dialogs if d.is_group]
        await bridge_json(session,"POST","/api/bridge/groups",json={"accountId":account_id,"groups":discovered[:100]})

        @client.on(events.NewMessage(incoming=True))
        async def on_message(event):
            if event.chat_id not in connection.chat_ids or not event.is_group or not event.raw_text:
                return
            if event.sender_id in OWNED_USER_IDS or event.sender_id==connection.user_id:
                return
            try:
                sender=await event.get_sender()
                if getattr(sender,"bot",False):
                    return
                name=(" ".join(filter(None,[getattr(sender,"first_name",""),getattr(sender,"last_name","")])) or
                      getattr(sender,"username","") or "참여자")[:100]
            except Exception:
                name="참여자"
            await bridge_json(session,"POST","/api/bridge",json={
                "type":"message","accountId":connection.account_id,"chatId":str(event.chat_id),
                "messageId":int(event.id),"senderId":str(event.sender_id),
                "senderName":name,"text":event.raw_text[:1500]
            })
        log.info("Telegram account connected: %s (%s authorized groups)",account_id,len(chat_ids))
        return connection
    except Exception as exc:
        log.warning("Account %s connection failed (%s)",account_id,type(exc).__name__)
        await client.disconnect()
        return None


async def update_accounts(session:ClientSession,connections:dict[str,Connection]):
    payload=await bridge_json(session,"GET","/api/bridge/accounts")
    if payload is None:
        return
    incoming=payload.get("accounts",[])
    if not isinstance(incoming,list):
        return
    valid={}
    for entry in incoming:
        try:
            account_id=str(entry["accountId"])
            if not (entry.get("telegramApiId") and entry.get("telegramApiHash") and entry.get("telegramSession")):
                continue
            fingerprint=hashlib.sha256((entry["telegramApiId"]+"|"+entry["telegramApiHash"]+"|"+entry["telegramSession"]).encode()).hexdigest()
            valid[account_id]=(entry,fingerprint)
        except (KeyError,TypeError):
            continue
    for account_id,connection in list(connections.items()):
        if account_id not in valid or connection.fingerprint!=valid[account_id][1] or not connection.client.is_connected():
            await connection.client.disconnect()
            del connections[account_id]
        else:
            connection.chat_ids=set(int(c) for c in valid[account_id][0]["chatIds"])
    for account_id,(entry,fingerprint) in valid.items():
        if account_id in connections:
            continue
        connection=await connect_account(session,entry,fingerprint)
        if connection:
            connections[account_id]=connection
    OWNED_USER_IDS.clear()
    OWNED_USER_IDS.update(connection.user_id for connection in connections.values())


async def deliver_approved(session:ClientSession,connection:Connection,chat_id:int):
    result=await bridge_json(session,"GET","/api/bridge",params={"accountId":connection.account_id,"chatId":str(chat_id)})
    if not result:
        return
    job=result.get("job")
    if not job:
        return
    job_id=int(job["id"])
    try:
        # Re-check the group state after claiming a send, immediately before Telegram.
        # A stop or new human message may have invalidated this turn.
        confirmation=await bridge_json(session,"GET","/api/bridge",params={
            "accountId":connection.account_id,"chatId":str(chat_id),"verifyJobId":str(job_id)
        })
        if not confirmation or not confirmation.get("canSend"):
            await bridge_json(session,"POST","/api/bridge",json={
                "type":"ack","accountId":connection.account_id,"chatId":str(chat_id),
                "jobId":job_id,"sent":False,"error":"STALE_OR_STOPPED"
            })
            return
        body=str(job["body"])
        message=await connection.client.send_message(chat_id,body)
        await bridge_json(session,"POST","/api/bridge",json={
            "type":"ack","accountId":connection.account_id,"chatId":str(chat_id),
            "jobId":job_id,"sent":True,"sentMessageId":message.id
        })
        log.info("Telegram conversation turn delivered; account=%s job=%s",connection.account_id,job_id)
    except FloodWaitError as exc:
        await bridge_json(session,"POST","/api/bridge",json={
            "type":"ack","accountId":connection.account_id,"chatId":str(chat_id),
            "jobId":job_id,"sent":False,"error":"FLOOD_WAIT"
        })
        log.warning("Rate limited for %s seconds on %s",exc.seconds,connection.account_id)
        await asyncio.sleep(min(exc.seconds,3600))
    except (RPCError,Exception) as exc:
        await bridge_json(session,"POST","/api/bridge",json={
            "type":"ack","accountId":connection.account_id,"chatId":str(chat_id),
            "jobId":job_id,"sent":False,"error":type(exc).__name__
        })
        log.warning("Conversation turn failed; account=%s job=%s error=%s",
                    connection.account_id,job_id,type(exc).__name__)


async def run():
    connections:dict[str,Connection]={}
    timeout=ClientTimeout(total=55)
    async with ClientSession(timeout=timeout) as session:
        next_refresh=0.0
        while True:
            try:
                await poll_logins(session,BASE,HEADERS)
                if await poll_session_files(session,BASE,HEADERS):
                    next_refresh=0.0
                now=asyncio.get_running_loop().time()
                if now>=next_refresh:
                    await update_accounts(session,connections)
                    next_refresh=now+REFRESH_SECONDS
                    if not connections:
                        log.info("No active Telegram account yet. Configure credentials in the admin site.")
                # One coordinator per group, but every connected account can send
                # its own already-approved outbox messages. Bounded concurrency
                # keeps 10-50 accounts responsive without hammering the server.
                coordinator={}
                for item in connections.values():
                    for gid in item.chat_ids:
                        if gid not in coordinator or item.account_id<coordinator[gid]:
                            coordinator[gid]=item.account_id
                semaphore=asyncio.Semaphore(12)
                async def process_group(connection,chat_id):
                    async with semaphore:
                        await bridge_json(session,"POST","/api/bridge",json={
                            "type":"heartbeat","accountId":connection.account_id,"chatId":str(chat_id),"userId":str(connection.user_id)
                        })
                        if coordinator.get(chat_id)==connection.account_id:
                            await bridge_json(session,"GET","/api/bridge/auto",params={
                                "accountId":connection.account_id,"chatId":str(chat_id)
                            })
                        await deliver_approved(session,connection,chat_id)
                tasks=[process_group(connection,chat_id)
                       for connection in list(connections.values())
                       for chat_id in list(connection.chat_ids)]
                if tasks:
                    await asyncio.gather(*tasks,return_exceptions=False)
            except Exception as exc:
                log.warning("Worker cycle error: %s",type(exc).__name__)
            await asyncio.sleep(POLL_SECONDS)


if __name__=="__main__":
    asyncio.run(run())
