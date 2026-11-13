import {NextRequest,NextResponse} from "next/server";
import {allowedChats,bridgeDatabase,safeAccountId,safeChatId} from "../../../lib/group-bridge";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const answer=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(req:NextRequest){
 const chatId=safeChatId(req.nextUrl.searchParams.get("chatId"));
 if(!chatId||!allowedChats().has(chatId))return answer({connected:false,messages:[],drafts:[],error:"그룹 ID가 허용 목록에 등록되어 있지 않습니다."},200);
 try{
  const db=await bridgeDatabase();
  const [messages,drafts]=await Promise.all([
    db.query(`SELECT id,chat_id,message_id,sender_id,sender_name,body,observed_at
      FROM moment_group_inbox WHERE chat_id=$1 ORDER BY id DESC LIMIT 40`,[chatId]),
    db.query(`SELECT id,account_id,chat_id,reply_to_message_id,body,status,created_at,completed_at,last_error
      FROM moment_group_outbox WHERE chat_id=$1 ORDER BY id DESC LIMIT 40`,[chatId])
  ]);
  return answer({connected:true,messages:messages.rows.reverse(),drafts:drafts.rows});
 }catch{return answer({error:"메시지 조회에 실패했습니다."},503);}
}
export async function POST(req:NextRequest){
 const origin=req.headers.get("origin");
 if(origin&&origin!==req.nextUrl.origin)return answer({error:"요청 출처 오류"},403);
 let body:{chatId?:unknown;accountId?:unknown;messageId?:unknown;text?:unknown};
 try{const raw=await req.text();if(raw.length>4000)return answer({error:"메시지가 너무 깁니다."},413);body=JSON.parse(raw)}
 catch{return answer({error:"요청 형식 오류"},400)}
 const chatId=safeChatId(body.chatId),accountId=safeAccountId(body.accountId);
 const messageId=Number(body.messageId),text=typeof body.text==="string"?body.text.trim():"";
 if(!chatId||!allowedChats().has(chatId)||!accountId||!Number.isSafeInteger(messageId)||messageId<=0||text.length<1||text.length>700)return answer({error:"그룹·계정·메시지 정보를 확인하세요."},400);
 try{
  const db=await bridgeDatabase();
  const snapshot=await db.query("SELECT content FROM moment_workspace_state WHERE id='primary'");
  if(!snapshot.rowCount)return answer({error:"먼저 시스템 상태에서 계정·그룹 설정을 서버에 저장하세요."},409);
  const config=snapshot.rows[0].content as Record<string,unknown>;
  const assignments=Array.isArray(config.assignments)?config.assignments as {accountId?:string;groupId?:string;mode?:string}[]:[];
  const accounts=Array.isArray(config.accounts)?config.accounts as {id?:string;enabled?:boolean}[]:[];
  if(!accounts.some(a=>a.id===accountId&&a.enabled!==false)||!assignments.some(a=>a.accountId===accountId&&a.groupId===chatId&&a.mode!=="observer"))return answer({error:"이 그룹에 허용된 발언 계정이 아닙니다. 서버 설정을 확인하세요."},403);
  const src=await db.query("SELECT message_id FROM moment_group_inbox WHERE chat_id=$1 AND message_id=$2",[chatId,messageId]);
  if(!src.rowCount)return answer({error:"원본 그룹 메시지를 찾지 못했습니다."},404);
  // Operator approval; never infer approval from AI generation alone.
  const result=await db.query(`INSERT INTO moment_group_outbox(account_id,chat_id,reply_to_message_id,body)
    VALUES($1,$2,$3,$4) RETURNING id,status`,[accountId,chatId,messageId,text]);
  return answer({ok:true,id:result.rows[0].id,status:result.rows[0].status});
 }catch{return answer({error:"전송 승인 저장에 실패했습니다."},503);}
}
