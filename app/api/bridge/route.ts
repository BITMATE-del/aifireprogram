import {NextRequest,NextResponse} from "next/server";
import {allowedChats,authorizedBridge,bridgeDatabase,safeAccountId,safeChatId} from "../../../lib/group-bridge";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(req:NextRequest){
 if(!authorizedBridge(req))return reply({error:"인증 실패"},401);
 let body:Record<string,unknown>;
 try{const text=await req.text();if(text.length>4000)return reply({error:"크기 제한"},413);body=JSON.parse(text);}catch{return reply({error:"잘못된 요청"},400);}
 const type=body.type;
 const chatId=safeChatId(body.chatId);
 if(!chatId||!allowedChats().has(chatId))return reply({error:"허용되지 않은 그룹"},403);
 try{
  const db=await bridgeDatabase();
  if(type==="heartbeat"){
   const accountId=safeAccountId(body.accountId);
   if(!accountId)return reply({error:"계정 ID 오류"},400);
   await db.query(`INSERT INTO moment_telegram_heartbeats(account_id,chat_id,last_seen)
     VALUES($1,$2,now()) ON CONFLICT (account_id,chat_id) DO UPDATE SET last_seen=now()`,[accountId,chatId]);
   return reply({ok:true});
  }
  if(type==="message"){
   const text=typeof body.text==="string"?body.text.trim().slice(0,1500):"";
   const messageId=Number(body.messageId);
   const senderId=String(body.senderId??"").slice(0,100);
   const senderName=String(body.senderName??"").slice(0,100);
   if(!text||!Number.isSafeInteger(messageId)||messageId<=0||!senderId)return reply({error:"잘못된 메시지 정보"},400);
   const result=await db.query(`INSERT INTO moment_group_inbox(chat_id,message_id,sender_id,sender_name,body)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(chat_id,message_id) DO NOTHING RETURNING id`,[chatId,messageId,senderId,senderName,text]);
   return reply({ok:true,inserted:result.rowCount===1});
  }
  if(type==="ack"){
   const accountId=safeAccountId(body.accountId),jobId=Number(body.jobId);
   if(!accountId||!Number.isSafeInteger(jobId)||jobId<=0)return reply({error:"작업 정보 오류"},400);
   const sent=body.sent===true;
   const sentId=Number(body.sentMessageId);
   const r=await db.query(`UPDATE moment_group_outbox SET status=$1,completed_at=now(),
     sent_message_id=$2,last_error=$3
     WHERE id=$4 AND account_id=$5 AND chat_id=$6 AND status='sending'
     RETURNING id`,[sent?"sent":"failed",sent&&Number.isSafeInteger(sentId)?sentId:null,sent?null:String(body.error||"전송 실패").slice(0,300),jobId,accountId,chatId]);
   return reply({ok:r.rowCount===1});
  }
  return reply({error:"지원하지 않는 요청"},400);
 }catch{return reply({error:"서버 저장소 오류"},503);}
}
export async function GET(req:NextRequest){
 if(!authorizedBridge(req))return reply({error:"인증 실패"},401);
 const accountId=safeAccountId(req.nextUrl.searchParams.get("accountId"));
 const chatId=safeChatId(req.nextUrl.searchParams.get("chatId"));
 if(!accountId||!chatId||!allowedChats().has(chatId))return reply({error:"계정·그룹 확인 실패"},403);
 try{
  const db=await bridgeDatabase(),client=await db.connect();
  try{
   await client.query("BEGIN");
   const job=await client.query(`SELECT id,account_id,chat_id,reply_to_message_id,body
    FROM moment_group_outbox WHERE status='pending' AND account_id=$1 AND chat_id=$2
    ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`,[accountId,chatId]);
   if(job.rowCount){
    await client.query("UPDATE moment_group_outbox SET status='sending',claimed_at=now() WHERE id=$1",[job.rows[0].id]);
   }
   await client.query("COMMIT");
   return reply({job:job.rows[0]||null});
  }catch(e){await client.query("ROLLBACK");throw e}
  finally{client.release()}
 }catch{return reply({error:"작업 조회 실패"},503);}
}
