import {NextRequest,NextResponse} from "next/server";
import {authorizedBridge,isAllowedGroup,safeAccountId,safeChatId} from "../../../../lib/group-bridge";
import {autoDb} from "../../../../lib/auto-conversation";
import {POST as generate} from "../../discussion/route";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const respond=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{"Cache-Control":"no-store"}});
type Account={id:string;enabled?:boolean};
type Assignment={accountId:string;groupId:string;personaId:string;mode:"member"|"expert"|"observer"};
type Persona={id:string;name:string;role:string;style:string;risk:number};
type Inbox={id:string;message_id:string;body:string;sender_name:string;observed_at:string};
export async function GET(req:NextRequest){
 if(!authorizedBridge(req))return respond({error:"인증 실패"},401);
 const accountId=safeAccountId(req.nextUrl.searchParams.get("accountId"));
 const chatId=safeChatId(req.nextUrl.searchParams.get("chatId"));
 if(!accountId||!chatId||!(await isAllowedGroup(chatId)))return respond({error:"계정 또는 그룹 권한 오류"},403);
 const db=await autoDb(),client=await db.connect();
 let candidate:Inbox|null=null,jobId:string|null=null,persona:Persona|null=null,assignment:Assignment|null=null;
 try{
  await client.query("BEGIN");
  const mode=await client.query(`SELECT enabled,disclosure_confirmed,min_interval_seconds,last_inbox_id,last_generated_at
     FROM moment_auto_groups WHERE chat_id=$1 FOR UPDATE`,[chatId]);
  if(!mode.rowCount||!mode.rows[0].enabled){
   await client.query("COMMIT");return respond({active:false});
  }
  const m=mode.rows[0];
  if(m.last_generated_at&&Date.now()-new Date(m.last_generated_at).getTime()<Number(m.min_interval_seconds)*1000){
   await client.query("COMMIT");return respond({active:true,idle:"cooldown"});
  }
  const config=await client.query("SELECT content FROM moment_workspace_state WHERE id='primary'");
  const state=config.rows[0]?.content as {accounts?:Account[];assignments?:Assignment[];people?:Persona[]}|undefined;
  const active=new Set((state?.accounts||[]).filter(a=>a.enabled!==false).map(a=>a.id));
  const assigned=(state?.assignments||[]).filter(a=>a.groupId===chatId&&a.mode!=="observer"&&active.has(a.accountId));
  const heartbeat=await client.query(`SELECT DISTINCT account_id FROM moment_telegram_heartbeats
    WHERE chat_id=$1 AND last_seen>now()-interval '90 seconds'`,[chatId]);
  const online=new Set(heartbeat.rows.map((r:{account_id:string})=>r.account_id));
  const participants=assigned.filter(a=>online.has(a.accountId)&&state?.people?.some(p=>p.id===a.personaId)).sort((a,b)=>a.accountId.localeCompare(b.accountId));
  if(!participants.length){await client.query("COMMIT");return respond({active:true,idle:"no_online_persona"});}
  const incoming=await client.query(`SELECT id::text,message_id::text,body,sender_name,observed_at
    FROM moment_group_inbox WHERE chat_id=$1 AND id>$2
    ORDER BY id ASC LIMIT 1`,[chatId,m.last_inbox_id]);
  if(!incoming.rowCount){await client.query("COMMIT");return respond({active:true,idle:"no_new_message"});}
  candidate=incoming.rows[0] as Inbox;
  // A stopped group never replays old messages when restarted.
  if(Date.now()-new Date(candidate.observed_at).getTime()>180000){
   await client.query("UPDATE moment_auto_groups SET last_inbox_id=$2 WHERE chat_id=$1",[chatId,candidate.id]);
   await client.query("COMMIT");return respond({active:true,idle:"stale_message_skipped"});
  }
  const index=Number(BigInt(candidate.id)%BigInt(participants.length));
  assignment=participants[index];
  if(assignment.accountId!==accountId){await client.query("COMMIT");return respond({active:true,idle:"other_account_turn"});}
  persona=state?.people?.find(p=>p.id===assignment!.personaId)||null;
  if(!persona){await client.query("COMMIT");return respond({active:true,idle:"persona_unavailable"});}
  const inserted=await client.query(`INSERT INTO moment_auto_jobs(chat_id,inbox_id,account_id,status)
    VALUES($1,$2,$3,'processing') ON CONFLICT(chat_id,inbox_id) DO NOTHING RETURNING id::text`,[chatId,candidate.id,accountId]);
  await client.query("UPDATE moment_auto_groups SET last_inbox_id=$2,last_generated_at=now(),last_error=NULL WHERE chat_id=$1",[chatId,candidate.id]);
  await client.query("COMMIT");
  if(!inserted.rowCount)return respond({active:true,idle:"already_processed"});
  jobId=inserted.rows[0].id;
 }catch(err){
  await client.query("ROLLBACK").catch(()=>{});
  console.error("auto claim",err instanceof Error?err.name:"unknown");
  return respond({error:"자동 대화 작업 준비 실패"},503);
 }finally{client.release();}
 if(!candidate||!persona||!assignment||!jobId)return respond({active:true,idle:"no_work"});
 try{
  const input={groupId:chatId,topic:candidate.body,humanMessage:candidate.body,inboxMessageId:candidate.id,
    credentialAccountId:accountId,
    personas:[{...persona,id:accountId+"::"+chatId,accountId,participationRole:assignment.mode}]};
  const internalReq=new NextRequest("https://internal.moment.invalid/api/discussion",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)
  });
  const generated=await generate(internalReq);
  const result=await generated.json();
  if(!generated.ok){
   const error=typeof result?.error==="string"?result.error.slice(0,200):"AI 생성 실패";
   await db.query("UPDATE moment_auto_jobs SET status='failed',completed_at=now(),error=$2 WHERE id=$1",[jobId,error]);
   await db.query("UPDATE moment_auto_groups SET last_error=$2 WHERE chat_id=$1",[chatId,error]);
   return respond({active:true,created:false,reason:error});
  }
  if(result?.mode!=="ai"||!Array.isArray(result?.turns)||!result.turns.length){
   await db.query("UPDATE moment_auto_jobs SET status='skipped',completed_at=now() WHERE id=$1",[jobId]);
   return respond({active:true,created:false,reason:"no_meaningful_reply"});
  }
  const turn=result.turns.find((t:{speakerId?:string})=>t.speakerId===accountId+"::"+chatId);
  const body=typeof turn?.text==="string"?turn.text.trim().slice(0,700):"";
  if(!body){
   await db.query("UPDATE moment_auto_jobs SET status='skipped',completed_at=now() WHERE id=$1",[jobId]);
   return respond({active:true,created:false,reason:"empty_or_unmatched"});
  }
  const c=await db.connect();
  try{
   await c.query("BEGIN");
   const stillRunning=await c.query("SELECT enabled FROM moment_auto_groups WHERE chat_id=$1 FOR UPDATE",[chatId]);
   if(!stillRunning.rows[0]?.enabled){
    await c.query("UPDATE moment_auto_jobs SET status='cancelled',completed_at=now() WHERE id=$1",[jobId]);
    await c.query("COMMIT");
    return respond({active:false,created:false});
   }
   const key="auto:"+chatId+":"+candidate.id+":"+accountId;
   const queued=await c.query(`INSERT INTO moment_group_outbox
      (account_id,chat_id,reply_to_message_id,body,idempotency_key,source_type)
      VALUES($1,$2,$3,$4,$5,'auto') ON CONFLICT DO NOTHING RETURNING id`,
      [accountId,chatId,candidate.message_id,body,key]);
   await c.query("UPDATE moment_auto_jobs SET status=$2,completed_at=now() WHERE id=$1",[jobId,queued.rowCount?"queued":"skipped"]);
   await c.query("COMMIT");
   return respond({active:true,created:queued.rowCount===1});
  }catch(err){
   await c.query("ROLLBACK").catch(()=>{});
   throw err;
  }finally{c.release();}
 }catch(err){
  console.error("auto conversation",err instanceof Error?err.name:"unknown");
  await db.query("UPDATE moment_auto_jobs SET status='failed',completed_at=now(),error='생성 처리 오류' WHERE id=$1 AND status='processing'",[jobId]).catch(()=>{});
  return respond({error:"자동 응답 생성 실패"},503);
 }
}
