"""Manage Telegram accounts through the already authorized Telethon session."""
import asyncio
import base64
import io
import logging
from telethon.tl.functions.channels import JoinChannelRequest
from telethon.tl.functions.messages import ImportChatInviteRequest
from telethon.tl.functions.account import UpdateProfileRequest
from telethon.tl.functions.photos import UploadProfilePhotoRequest
from telethon.errors import FloodWaitError, RPCError

log=logging.getLogger("moment.account_actions")

async def perform(client, action):
    kind=action.get("type")
    data=action.get("data") or {}
    if kind=="change_name":
        first=str(data.get("firstName","")).strip()
        last=str(data.get("lastName","")).strip()
        if not first or len(first)>64 or len(last)>64:
            raise ValueError("INVALID_PROFILE_NAME")
        await client(UpdateProfileRequest(first_name=first,last_name=last))
        return {"message":"텔레그램 이름 변경 완료"}
    if kind=="change_photo":
        blob=base64.b64decode(str(data.get("imageBase64","")),validate=True)
        if not (100<=len(blob)<=2*1024*1024):
            raise ValueError("INVALID_PHOTO_SIZE")
        ext=data.get("extension")
        if ext not in (".png",".jpg"):
            raise ValueError("INVALID_PHOTO_FORMAT")
        if ext==".jpg" and not blob.startswith(b"\xff\xd8\xff"):
            raise ValueError("INVALID_JPEG")
        if ext==".png" and not blob.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("INVALID_PNG")
        stream=io.BytesIO(blob)
        stream.name="avatar"+ext
        photo=await client.upload_file(stream,part_size_kb=128,file_name=stream.name)
        await client(UploadProfilePhotoRequest(file=photo))
        return {"message":"프로필 사진 변경 완료"}
    if kind=="join_group":
        url=str(data.get("invite","")).strip()
        segment=url.split("://")[-1]
        segment=segment.split("/",1)[-1].rstrip("/")
        if segment.startswith("+") or segment.startswith("joinchat/"):
            code=segment[1:] if segment.startswith("+") else segment[len("joinchat/"):]
            if not code or len(code)>120:
                raise ValueError("INVALID_INVITE")
            imported=await client(ImportChatInviteRequest(hash=code))
            joined=list(getattr(imported,"chats",[]) or [])
            if not joined:
                raise ValueError("GROUP_JOIN_RESULT_UNAVAILABLE")
            entity=joined[0]
        else:
            username=segment.lstrip("@")
            if not (4<=len(username)<=32 and username.replace("_","").isalnum()):
                raise ValueError("INVALID_PUBLIC_GROUP")
            entity=await client.get_entity(username)
            await client(JoinChannelRequest(entity))
        # Telegram group IDs used by Telethon event.chat_id include -100 prefix.
        from telethon import utils
        return {"message":"그룹 입장 완료. 참여 그룹 목록에서 확인하세요.",
            "group":{"id":str(utils.get_peer_id(entity)),"title":str(getattr(entity,"title","텔레그램 그룹"))[:120]}}
    raise ValueError("UNKNOWN_ACTION")

async def poll_account(session,base,headers,connection):
    try:
        async with session.get(base+"/api/bridge/account-actions",headers=headers,params={"accountId":connection.account_id}) as response:
            if response.status!=200:
                log.warning("Account management query failed for %s: HTTP %s",connection.account_id,response.status)
                return
            response_data=await response.json()
    except Exception as exc:
        log.warning("Account management queue unreachable (%s)",type(exc).__name__)
        return
    task=response_data.get("action")
    if not task:
        return
    payload={"accountId":connection.account_id,"id":str(task.get("id","")),"success":False}
    try:
        result=await asyncio.wait_for(perform(connection.client,task),timeout=75)
        payload.update({"success":True,**result})
    except FloodWaitError as exc:
        payload["message"]=f"텔레그램 요청 제한: {min(int(exc.seconds),86400)}초 뒤 다시 시도하세요."
    except RPCError as exc:
        payload["message"]="텔레그램 작업 실패: "+type(exc).__name__
    except Exception as exc:
        payload["message"]="작업을 적용하지 못했습니다: "+type(exc).__name__
    try:
        async with session.post(base+"/api/bridge/account-actions",headers=headers,json=payload) as response:
            if response.status!=200:
                log.warning("Account management ack HTTP %s",response.status)
    except Exception as exc:
        log.warning("Account management ack unavailable (%s)",type(exc).__name__)
