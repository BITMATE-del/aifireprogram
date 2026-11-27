"""Convert a user-owned Telethon SQLite session file into an encrypted StringSession.

File bytes exist only in a short-lived local temporary directory. The
authenticated bridge queue does not return Telegram credentials to browsers.
"""
import asyncio
import base64
import logging
import os
import tempfile

from telethon.sessions import SQLiteSession, StringSession

log=logging.getLogger("moment.session_import")
MAX_SIZE=512*1024

def convert_sqlite_session(encoded:str)->str:
    raw=base64.b64decode(encoded,validate=True)
    if not (90<=len(raw)<=MAX_SIZE and raw.startswith(b"SQLite format 3\x00")):
        raise ValueError("Invalid Telethon SQLite session header")
    with tempfile.TemporaryDirectory(prefix="moment-session-") as temporary:
        filename=os.path.join(temporary,"imported.session")
        with open(filename,"xb") as out:
            out.write(raw)
        # Telethon reads the same .session format it originally produced.
        sqlite_session=SQLiteSession(os.path.join(temporary,"imported"))
        try:
            if not sqlite_session.auth_key:
                raise ValueError("Session does not contain Telegram authorization")
            converted=StringSession.save(sqlite_session)
            if not converted or len(converted)<80:
                raise ValueError("Session conversion failed")
            return converted
        finally:
            sqlite_session.close()

async def poll(session,base:str,headers:dict)->bool:
    try:
        async with session.get(base+"/api/bridge/session-file",headers=headers) as response:
            if response.status!=200:
                return False
            data=await response.json()
    except Exception as exc:
        log.warning("Session file queue unavailable: %s",type(exc).__name__)
        return False
    task=data.get("task")
    if not isinstance(task,dict):
        return False
    account_id=task.get("accountId")
    request_id=task.get("requestId")
    try:
        converted=await asyncio.to_thread(convert_sqlite_session,str(task["contentBase64"]))
        payload={"accountId":account_id,"requestId":request_id,"phase":"connected","session":converted}
    except Exception as exc:
        log.warning("Session file conversion failed for %s: %s",account_id,type(exc).__name__)
        payload={"accountId":account_id,"requestId":request_id,"phase":"error",
                 "message":"Telethon .session 파일을 읽지 못했습니다. 로그인 세션이 유효한지 확인하세요."}
    try:
        async with session.post(base+"/api/bridge/session-file",headers=headers,json=payload) as response:
            if response.status!=200:
                log.warning("Session file result not accepted: HTTP %s",response.status)
                return False
    except Exception as exc:
        log.warning("Session file result transport failed: %s",type(exc).__name__)
        return False
    if payload["phase"]=="connected":
        log.info("Telegram session file imported for account %s",account_id)
        return True
    return False
