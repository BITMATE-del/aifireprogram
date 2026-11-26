"""Server-controlled, explicitly initiated Telegram phone login.

Pending login credentials are delivered over authenticated HTTPS and never logged.
The Telethon client stays in this worker's memory until phone code / 2FA completes.
"""
import asyncio
import logging
import time
from dataclasses import dataclass
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import (
    SessionPasswordNeededError,PhoneCodeInvalidError,PhoneCodeExpiredError,
    PhoneNumberInvalidError,PasswordHashInvalidError,FloodWaitError
)
log=logging.getLogger("moment.login")

@dataclass
class Pending:
    client:TelegramClient
    phone:str
    request_id:str
    started:float

sessions:dict[str,Pending]={}

async def respond(session,base:str,headers:dict,task:dict,phase:str,message:str="",session_value:str|None=None):
    body={"accountId":task["accountId"],"requestId":task["requestId"],"phase":phase,"message":message[:160]}
    if session_value is not None:
        body["session"]=session_value
    try:
        async with session.post(base+"/api/bridge/login",headers=headers,json=body) as r:
            if r.status!=200:
                log.warning("Telegram login result not accepted, HTTP %s",r.status)
    except Exception as exc:
        log.warning("Login result transport error: %s",type(exc).__name__)

async def close(account_id:str):
    pending=sessions.pop(account_id,None)
    if pending:
        try:await pending.client.disconnect()
        except Exception:pass

async def process_task(session,base:str,headers:dict,task:dict):
    account_id=task["accountId"]
    action=task["action"]
    try:
        if action=="start":
            await close(account_id)
            api_id=task.get("apiId")
            api_hash=task.get("apiHash")
            phone=task.get("payload")
            if not api_id or not api_hash:
                await respond(session,base,headers,task,"error","먼저 전체 기본 설정에서 Telegram API ID와 HASH를 저장하세요.")
                return
            if not phone or not str(phone).startswith("+"):
                await respond(session,base,headers,task,"error","전화번호 형식이 잘못되었습니다.")
                return
            client=TelegramClient(StringSession(),int(api_id),str(api_hash),auto_reconnect=True,connection_retries=2,request_retries=1)
            try:
                await asyncio.wait_for(client.connect(),timeout=18)
                await asyncio.wait_for(client.send_code_request(str(phone)),timeout=25)
            except Exception:
                await client.disconnect()
                raise
            sessions[account_id]=Pending(client,str(phone),task["requestId"],time.monotonic())
            await respond(session,base,headers,task,"code_sent","텔레그램으로 발송된 인증코드를 입력하세요.")
            return
        pending=sessions.get(account_id)
        if not pending or pending.request_id!=task["requestId"]:
            await respond(session,base,headers,task,"error","인증 세션이 만료됐습니다. 전화번호부터 다시 입력하세요.")
            return
        if action=="code":
            try:
                await asyncio.wait_for(pending.client.sign_in(phone=pending.phone,code=str(task.get("payload",""))),timeout=30)
            except SessionPasswordNeededError:
                await respond(session,base,headers,task,"password_required","텔레그램 2단계 인증 비밀번호를 입력하세요.")
                return
            except PhoneCodeInvalidError:
                await respond(session,base,headers,task,"code_sent","인증코드가 올바르지 않습니다. 다시 입력하세요.")
                return
            except PhoneCodeExpiredError:
                await close(account_id)
                await respond(session,base,headers,task,"error","인증코드가 만료됐습니다. 처음부터 다시 진행하세요.")
                return
        elif action=="password":
            try:
                await asyncio.wait_for(pending.client.sign_in(password=str(task.get("payload",""))),timeout=30)
            except PasswordHashInvalidError:
                await respond(session,base,headers,task,"password_required","2단계 비밀번호가 올바르지 않습니다. 다시 입력하세요.")
                return
        else:
            await respond(session,base,headers,task,"error","알 수 없는 인증 요청입니다.")
            return
        if not await pending.client.is_user_authorized():
            await respond(session,base,headers,task,"error","텔레그램 로그인 완료 여부를 확인하지 못했습니다.")
            await close(account_id)
            return
        new_session=StringSession.save(pending.client.session)
        await respond(session,base,headers,task,"connected","계정 연결 완료. 로그인 세션을 암호화 저장했습니다.",new_session)
        # Discover joined groups immediately, before any group assignment.
        # Never subscribe to messages or send replies from unselected groups.
        try:
            dialogs=await pending.client.get_dialogs(limit=200)
            discovered=[{"id":str(d.id),"title":str(d.name or "그룹")[:120]} for d in dialogs if d.is_group]
            async with session.post(base+"/api/bridge/groups",headers=headers,
                json={"accountId":account_id,"groups":discovered[:100]}) as response:
                if response.status!=200:
                    log.warning("Account group discovery delivery failed, status=%s",response.status)
        except Exception as exc:
            log.warning("Account group discovery failed, type=%s",type(exc).__name__)
        await close(account_id)
        log.info("Telegram account website login completed for %s",account_id)
    except FloodWaitError as exc:
        await close(account_id)
        await respond(session,base,headers,task,"error",f"텔레그램 요청 제한: {exc.seconds}초 후 다시 시도하세요.")
    except PhoneNumberInvalidError:
        await close(account_id)
        await respond(session,base,headers,task,"error","전화번호가 올바르지 않습니다. 국가번호를 확인하세요.")
    except Exception as exc:
        await close(account_id)
        log.warning("Phone login failed for %s: %s",account_id,type(exc).__name__)
        await respond(session,base,headers,task,"error","인증 처리 오류가 발생했습니다. 다시 시도하세요.")

async def poll(session,base:str,headers:dict):
    for account_id,pending in list(sessions.items()):
        if time.monotonic()-pending.started>600:
            await close(account_id)
    try:
        async with session.get(base+"/api/bridge/login",headers=headers) as response:
            if response.status!=200:return
            payload=await response.json()
    except Exception:return
    task=payload.get("task")
    if task:
        await process_task(session,base,headers,task)
