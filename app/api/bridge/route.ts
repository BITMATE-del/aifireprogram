import {NextRequest,NextResponse} from "next/server";
import {isAllowedGroup,authorizedBridge,bridgeDatabase,safeAccountId,safeChatId} from "../../../lib/group-bridge";
import {autoDb} from "../../../lib/auto-conversation";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(req:NextRequest){
 if(!authorizedBridge(req))return reply({error:"인증 실패"},401);
 let body:Record<string,unknown>;
 try{const text=await req.text();if(text.length>4000)return reply({error:"크기 제한"},413);body=JSON.parse(text);}catch{return reply({error:"잘못된 요청"},400);}
 const type=body.type;
 const chatId=safeChatId(body.chatId);
 if(!chatId||!(await isAllowedGroup(chatId)))return reply({error:"허용되지 않은 그룹"},403);
 try{
  const db=await autoDb();
  if(type==="heartbeat"){
   const accountId=safeAccountId(body.accountId);
   if(!accountId)return reply({error:"계정 ID 오류"},400);
   const telegramUserId=typeof body.userId==="string"&&/^\\d{1,20}$/.test(body.userId)?body.userId:null;
   await db.query(`INSERT INTO moment_telegram_heartbeats(account_id,chat_id,telegram_user_id,last_seen)
     VALUES($1,$2,$3,now()) ON CONFLICT (account_id,chat_id) DO UPDATE SET
       last_seen=now(),telegram_user_id=COALESCE(EXCLUDED.telegram_user_id,moment_telegram_heartbeats.telegram_user_id)`,[accountId,chatId,telegramUserId]);
   return reply({ok:true});
  }
  if(type==="message"){
   const text=typeof body.text==="string"?body.text.trim().slice(0,1500):"";
   const messageId=Number(body.messageId);
   const senderId=String(body.senderId??"").slice(0,100);
   const senderName=String(body.senderName??"").slice(0,100);
   if(!text||!Number.isSafeInteger(messageId)||messageId<=0||!senderId)return reply({error:"잘못된 메시지 정보"},400);
   const aiSender=await db.query("SELECT 1 FROM moment_telegram_heartbeats WHERE telegram_user_id=$1 LIMIT 1",[senderId]);
   if(aiSender.rowCount)return reply({ok:true,inserted:false,reason:"own_ai_account"});
   const result=await db.query(`INSERT INTO moment_group_inbox(chat_id,message_id,sender_id,sender_name,body)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(chat_id,message_id) DO NOTHING RETURNING id`,[chatId,messageId,senderId,senderName,text]);
   return reply({ok:true,inserted:result.rowCount===1});
  }
  if(type==="ack"){
   const accountId=safeAccountId(body.accountId),jobId=Number(body.jobId);
   if(!accountId||!Number.isSafeInteger(jobId)||jobId<=0)return reply({error:"작업 정보 오류"},400);
   const sent=body.sent===true;
   const sentId=Number(body.sentMessageId);
   const client=await db.connect();
   try{
    await client.query("BEGIN");
    const r=await client.query(`UPDATE moment_group_outbox SET status=$1,completed_at=now(),
     sent_message_id=$2,last_error=$3
     WHERE id=$4 AND account_id=$5 AND chat_id=$6 AND status='sending'
     RETURNING id,conversation_session_id`,[sent?"sent":"failed",sent&&Number.isSafeInteger(sentId)?sentId:null,sent?null:String(body.error||"전송 실패").slice(0,300),jobId,accountId,chatId]);
    if(r.rows[0]?.conversation_session_id){
     await client.query(`UPDATE moment_conversation_sessions SET
       next_decision_at=now()+interval '12 seconds',status=CASE WHEN $2::boolean THEN 'waiting' ELSE 'ended' END,
       updated_at=now() WHERE id=$1 AND last_outbox_id=$3 AND status='waiting'`,
       [r.rows[0].conversation_session_id,sent,jobId]);
    }
    await client.query("COMMIT");
    return reply({ok:r.rowCount===1});
   }catch(err){await client.query("ROLLBACK").catch(()=>{});throw err}
   finally{client.release()}
  }
  return reply({error:"지원하지 않는 요청"},400);
 }catch{return reply({error:"서버 저장소 오류"},503);}
}
export async function GET(req:NextRequest){
 if(!authorizedBridge(req))return reply({error:"인증 실패"},401);
 const accountId=safeAccountId(req.nextUrl.searchParams.get("accountId"));
 const chatId=safeChatId(req.nextUrl.searchParams.get("chatId"));
 if(!accountId||!chatId||!(await isAllowedGroup(chatId)))return reply({error:"계정·그룹 확인 실패"},403);
 try{
  const verify=req.nextUrl.searchParams.get("verifyJobId");
  if(verify!==null){
   if(!/^\d{1,18}$/.test(verify))return reply({canSend:false},400);
   const db=await autoDb();
   const allowed=await db.query(`SELECT o.id FROM moment_group_outbox o
      WHERE o.id=$1::bigint AND o.account_id=$2 AND o.chat_id=$3 AND o.status='sending'
       AND (
        o.source_type<>'auto' OR (
         EXISTS(SELECT 1 FROM moment_auto_groups g WHERE g.chat_id=o.chat_id AND g.enabled=true)
         AND NOT EXISTS(SELECT 1 FROM moment_group_inbox i WHERE i.chat_id=o.chat_id
          AND i.message_id>o.reply_to_message_id)
         AND EXISTS(SELECT 1 FROM moment_conversation_sessions s
           WHERE s.id=o.conversation_session_id AND s.status='waiting'
            AND s.last_outbox_id=o.id)
        )
       )`,[verify,accountId,chatId]);
   return reply({canSend:Boolean(allowed.rowCount)});
  }
  const db=await autoDb(),client=await db.connect();
  try{
   await client.query("BEGIN");
   // A person's newer message supersedes any delayed AI-to-AI follow-up.
   // When Start/Stop was turned off, old queued auto messages must not leak.
   await client.query(`UPDATE moment_group_outbox o SET status='cancelled',completed_at=now(),
      last_error='대화 흐름 변경 또는 작동 정지로 자동 발언 취소'
      WHERE o.account_id=$1 AND o.chat_id=$2 AND o.source_type='auto' AND o.status='pending'
      AND (
        NOT EXISTS(SELECT 1 FROM moment_auto_groups g WHERE g.chat_id=o.chat_id AND g.enabled=true)
        OR EXISTS(SELECT 1 FROM moment_group_inbox i
          WHERE i.chat_id=o.chat_id AND i.message_id>o.reply_to_message_id)
      )`,[accountId,chatId]);
   const job=await client.query(`SELECT id,account_id,chat_id,reply_to_message_id,body
    FROM moment_group_outbox o WHERE status='pending' AND account_id=$1 AND chat_id=$2
     AND not_before<=now()
     AND NOT EXISTS(SELECT 1 FROM moment_group_outbox active
       WHERE active.account_id=o.account_id AND active.status='sending')
    ORDER BY id FOR UPDATE OF o SKIP LOCKED LIMIT 1`,[accountId,chatId]);
   if(job.rowCount){
    await client.query("UPDATE moment_group_outbox SET status='sending',claimed_at=now() WHERE id=$1",[job.rows[0].id]);
   }
   await client.query("COMMIT");
   return reply({job:job.rows[0]||null});
  }catch(e){await client.query("ROLLBACK");throw e}
  finally{client.release()}
 }catch{return reply({error:"작업 조회 실패"},503);}
}
