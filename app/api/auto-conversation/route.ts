import {NextRequest,NextResponse} from "next/server";
import {autoDb,getAutoStatus} from "../../../lib/auto-conversation";
import {isAllowedGroup,safeChatId} from "../../../lib/group-bridge";
import {sameSiteRequest} from "../../../lib/request-origin";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(req:NextRequest){
 const chatId=safeChatId(req.nextUrl.searchParams.get("chatId"));
 if(!chatId||!(await isAllowedGroup(chatId)))return reply({error:"그룹이 허용되지 않았습니다."},403);
 try{return reply(await getAutoStatus(chatId))}
 catch{return reply({error:"운영 상태를 조회하지 못했습니다."},503)}
}
export async function POST(req:NextRequest){
 if(!sameSiteRequest(req))return reply({error:"잘못된 요청 출처입니다."},403);
 let body:{chatId?:unknown;enabled?:unknown;intervalSeconds?:unknown};
 try{const raw=await req.text();if(raw.length>1200)return reply({error:"요청 용량 초과"},413);body=JSON.parse(raw);}
 catch{return reply({error:"입력 정보 오류"},400);}
 const chatId=safeChatId(body.chatId);
 if(!chatId||typeof body.enabled!=="boolean"||!(await isAllowedGroup(chatId)))return reply({error:"그룹 또는 동작 상태가 올바르지 않습니다."},400);
 const enabled=body.enabled;
 const interval=Number(body.intervalSeconds??60);
 if(!Number.isInteger(interval)||interval<30||interval>3600)return reply({error:"최소 반응 간격은 30~3600초 사이로 지정하세요."},400);
 const db=await autoDb();
 const client=await db.connect();
 try{
  await client.query("BEGIN");
  const config=await client.query("SELECT content FROM moment_workspace_state WHERE id='primary'");
  const state=config.rows[0]?.content as {accounts?:{id:string;enabled:boolean}[];assignments?:{accountId:string;groupId:string;mode:string}[]}|undefined;
  const registered=new Set(state?.accounts?.filter(a=>a.enabled!==false).map(a=>a.id)||[]);
  const active=(state?.assignments||[]).filter(a=>a.groupId===chatId&&a.mode!=="observer"&&registered.has(a.accountId));
  if(enabled&&!active.length){await client.query("ROLLBACK");return reply({error:"활동 가능한 AI 계정이 없습니다. 먼저 그룹에 계정을 배정하세요."},409)}
  const last=await client.query("SELECT COALESCE(MAX(id),0)::bigint AS latest FROM moment_group_inbox WHERE chat_id=$1",[chatId]);
  const current=await client.query("SELECT enabled,last_inbox_id FROM moment_auto_groups WHERE chat_id=$1 FOR UPDATE",[chatId]);
  const previouslyEnabled=Boolean(current.rows[0]?.enabled);
  if(enabled){
   // Starting should not replay historical messages. Repeat start is idempotent.
   await client.query(`INSERT INTO moment_auto_groups(chat_id,enabled,min_interval_seconds,last_inbox_id,updated_at,last_error)
    VALUES($1,true,$2,$3,now(),NULL)
    ON CONFLICT(chat_id) DO UPDATE SET enabled=true,
    min_interval_seconds=$2,last_inbox_id=CASE WHEN moment_auto_groups.enabled THEN moment_auto_groups.last_inbox_id ELSE $3 END,
    updated_at=now(),last_error=NULL`,[chatId,interval,String(last.rows[0].latest)]);
  }else{
   await client.query(`INSERT INTO moment_auto_groups(chat_id,enabled,disclosure_confirmed,min_interval_seconds,last_inbox_id)
    VALUES($1,false,false,$2,$3)
    ON CONFLICT(chat_id) DO UPDATE SET enabled=false,updated_at=now()`,[chatId,interval,String(last.rows[0].latest)]);
   await client.query("UPDATE moment_group_outbox SET status='cancelled',completed_at=now(),last_error='운영자가 자동 대화를 정지했습니다.' WHERE chat_id=$1 AND source_type='auto' AND status='pending'",[chatId]);
   await client.query("UPDATE moment_auto_jobs SET status='cancelled',completed_at=now() WHERE chat_id=$1 AND status='processing'",[chatId]);
  }
  await client.query("COMMIT");
  return reply({ok:true,alreadyRunning:enabled&&previouslyEnabled,...await getAutoStatus(chatId)});
 }catch{
  await client.query("ROLLBACK").catch(()=>{});
  return reply({error:"자동 운영 설정 저장 실패"},503);
 }finally{client.release()}
}
