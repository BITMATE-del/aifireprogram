import {NextRequest,NextResponse} from "next/server";
import {sameSiteRequest} from "../../../lib/request-origin";
import {bridgeDatabase,safeAccountId,safeChatId} from "../../../lib/group-bridge";
import {validateState} from "../../../lib/workspace-db";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(req:NextRequest){
 if(!sameSiteRequest(req))return json({error:"잘못된 요청 출처입니다."},403);
 let payload:{accountId?:unknown;chatId?:unknown;checked?:unknown};
 try{const text=await req.text();if(text.length>1000)return json({error:"입력값이 너무 큽니다."},413);payload=JSON.parse(text)}
 catch{return json({error:"요청 정보를 확인하세요."},400)}
 const accountId=safeAccountId(payload.accountId),chatId=safeChatId(payload.chatId);
 if(!accountId||!chatId||typeof payload.checked!=="boolean")return json({error:"계정·그룹을 선택하세요."},400);
 const db=await bridgeDatabase(),client=await db.connect();
 try{
  await client.query("BEGIN");
  // Serialize account/group changes with every other workspace PUT.
  const current=await client.query("SELECT content,version FROM moment_workspace_state WHERE id='primary' FOR UPDATE");
  if(!current.rowCount){await client.query("ROLLBACK");return json({error:"운영 현황에서 계정 정보를 먼저 서버에 저장하세요."},409)}
  const state=validateState(current.rows[0].content);
  if(!state){await client.query("ROLLBACK");return json({error:"서버 설정 형식이 올바르지 않습니다."},503)}
  const account=state.accounts.find((a:unknown)=>a&&typeof a==="object"&&(a as {id?:unknown}).id===accountId);
  if(!account){await client.query("ROLLBACK");return json({error:"서버에 등록되지 않은 계정입니다. 계정을 서버에 저장하세요."},409)}
  const found=await client.query("SELECT title FROM moment_discovered_groups WHERE account_id=$1 AND chat_id=$2",[accountId,chatId]);
  if(!found.rowCount){await client.query("ROLLBACK");return json({error:"로그인한 계정에서 발견되지 않은 그룹입니다. 목록을 새로고침하세요."},404)}
  type Assignment={accountId:string;groupId:string;personaId:string;mode:"member"|"expert"|"observer"};
  type Group={id:string;name:string};
  const nextAssignments=(state.assignments as Assignment[]).filter(x=>!(x.accountId===accountId&&x.groupId===chatId));
  const nextGroups=state.groups as Group[];
  if(payload.checked){
   if(!nextGroups.some(x=>x.id===chatId))nextGroups.push({id:chatId,name:String(found.rows[0].title).slice(0,120)});
   const old=(state.assignments as Assignment[]).find(x=>x.accountId===accountId&&x.groupId===chatId);
   const other=(state.assignments as Assignment[]).find(x=>x.accountId===accountId);
   const people=state.people as {id:string}[];
   const personaId=[old?.personaId,other?.personaId,"p3",people[0]?.id].find(x=>x&&people.some(p=>p.id===x));
   if(!personaId){await client.query("ROLLBACK");return json({error:"설정할 페르소나가 없습니다. 먼저 계정 성격을 만들어주세요."},409)}
   nextAssignments.push({accountId,groupId:chatId,personaId,mode:old?.mode??"member"});
   await client.query(`INSERT INTO moment_group_approvals(account_id,chat_id,approved_at)
     VALUES($1,$2,now()) ON CONFLICT (account_id,chat_id) DO UPDATE SET approved_at=now()`,[accountId,chatId]);
  }else{
   await client.query("DELETE FROM moment_group_approvals WHERE account_id=$1 AND chat_id=$2",[accountId,chatId]);
  }
  state.assignments=nextAssignments;
  state.groups=nextGroups;
  state.activeGroup=payload.checked?chatId:state.activeGroup;
  if(!validateState(state)){await client.query("ROLLBACK");return json({error:"설정 저장 제한을 초과했습니다."},400)}
  const updated=await client.query("UPDATE moment_workspace_state SET content=$1::jsonb,version=version+1,updated_at=now() WHERE id='primary' RETURNING version",[JSON.stringify(state)]);
  await client.query("COMMIT");
  return json({ok:true,checked:payload.checked,version:Number(updated.rows[0].version),state});
 }catch{
  await client.query("ROLLBACK").catch(()=>{});
  return json({error:"그룹 선택 정보를 저장하지 못했습니다."},503);
 }finally{client.release()}
}
