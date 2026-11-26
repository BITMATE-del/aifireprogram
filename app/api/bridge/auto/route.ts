import {NextRequest,NextResponse} from "next/server";
import {authorizedBridge,isAllowedGroup,safeAccountId,safeChatId} from "../../../../lib/group-bridge";
import {autoDb} from "../../../../lib/auto-conversation";
import {POST as generate} from "../../discussion/route";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const respond=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{"Cache-Control":"no-store"}});
type Account={id:string;enabled?:boolean};
type Assignment={accountId:string;groupId:string;personaId:string;mode:"member"|"expert"|"observer"};
type Persona={id:string;name:string;role:string;style:string;risk:number;frequency?:"quiet"|"balanced"|"active";responseMode?:"reactive"|"balanced"|"independent";interests?:string};
type Inbox={id:string;message_id:string;body:string;sender_name:string;observed_at:string};
type Speaker=Persona&{id:string;accountId:string;participationRole:"member"|"expert"|"observer"};
type Generated={mode?:string;decision?:string;decisionReason?:string;reason?:string;error?:string;turns?:{speakerId:string;text:string}[]};

export async function GET(req:NextRequest){
 if(!authorizedBridge(req))return respond({error:"인증 실패"},401);
 const accountId=safeAccountId(req.nextUrl.searchParams.get("accountId"));
 const chatId=safeChatId(req.nextUrl.searchParams.get("chatId"));
 if(!accountId||!chatId||!(await isAllowedGroup(chatId)))return respond({error:"계정 또는 그룹 권한 오류"},403);
 const db=await autoDb(),client=await db.connect();
 let candidate:Inbox|null=null,jobId:string|null=null,speakers:Speaker[]=[];
 try{
  await client.query("BEGIN");
  const record=await client.query(`SELECT enabled,min_interval_seconds,last_inbox_id,last_generated_at
    FROM moment_auto_groups WHERE chat_id=$1 FOR UPDATE`,[chatId]);
  if(!record.rowCount||!record.rows[0].enabled){
   await client.query("COMMIT");return respond({active:false});
  }
  const mode=record.rows[0];
  const config=await client.query("SELECT content FROM moment_workspace_state WHERE id='primary'");
  const state=config.rows[0]?.content as {accounts?:Account[];assignments?:Assignment[];people?:Persona[]}|undefined;
  const enabledAccounts=new Set((state?.accounts||[]).filter(a=>a.enabled!==false).map(a=>a.id));
  const heartbeats=await client.query(`SELECT DISTINCT account_id FROM moment_telegram_heartbeats
    WHERE chat_id=$1 AND last_seen>now()-interval '90 seconds'`,[chatId]);
  const online=new Set(heartbeats.rows.map((r:{account_id:string})=>r.account_id));
  const assigned=(state?.assignments||[]).filter(a=>a.groupId===chatId&&a.mode!=="observer"&&
    enabledAccounts.has(a.accountId)&&online.has(a.accountId));
  assigned.sort((a,b)=>a.accountId.localeCompare(b.accountId));
  // Exactly one account owns the group's evaluation tick. This is independent
  // of message ID and avoids n parallel OpenAI calls for n connected accounts.
  if(!assigned.length||assigned[0].accountId!==accountId){
   await client.query("COMMIT");return respond({active:true,idle:assigned.length?"coordinator_account":"no_online_persona"});
  }
  speakers=assigned.flatMap(a=>{
   const p=state?.people?.find(p=>p.id===a.personaId);
   return p?[{...p,id:a.accountId+"::"+chatId,accountId:a.accountId,participationRole:a.mode}]:[];
  });
  if(!speakers.length){await client.query("COMMIT");return respond({active:true,idle:"no_persona"});}
  if(mode.last_generated_at&&Date.now()-new Date(mode.last_generated_at).getTime()<Number(mode.min_interval_seconds)*1000){
   await client.query("COMMIT");return respond({active:true,idle:"cooldown"});
  }
  const incoming=await client.query(`SELECT id::text,message_id::text,body,sender_name,observed_at
    FROM moment_group_inbox WHERE chat_id=$1 AND id>$2 ORDER BY id DESC LIMIT 1`,
    [chatId,mode.last_inbox_id]);
  if(!incoming.rowCount){await client.query("COMMIT");return respond({active:true,idle:"no_new_message"});}
  candidate=incoming.rows[0] as Inbox;
  const age=Date.now()-new Date(candidate.observed_at).getTime();
  if(age<10000){await client.query("COMMIT");return respond({active:true,idle:"listening_to_people"});}
  if(age>180000){
   await client.query("UPDATE moment_auto_groups SET last_inbox_id=$2 WHERE chat_id=$1",[chatId,candidate.id]);
   await client.query("COMMIT");return respond({active:true,idle:"old_messages_ignored"});
  }
  // Do not let an account dominate every exchange. Recent speakers are
  // de-prioritized, not forcibly rotated.
  const recent=await client.query(`SELECT account_id,MAX(created_at) AS last_at FROM moment_group_outbox
     WHERE chat_id=$1 AND source_type='auto' AND status IN ('pending','sending','sent')
     AND created_at>now()-interval '15 minutes' GROUP BY account_id`,[chatId]);
  const lastSpoke=new Map(recent.rows.map((r:{account_id:string;last_at:Date})=>[r.account_id,new Date(r.last_at).getTime()]));
  const available=speakers.filter(p=>{
   const last=lastSpoke.get(p.accountId);
   const interval=p.frequency==="quiet"?600000:p.frequency==="active"?90000:180000;
   return !last||Date.now()-last>=interval;
  });
  if(!available.length){
   await client.query("UPDATE moment_auto_groups SET last_inbox_id=$2 WHERE chat_id=$1",[chatId,candidate.id]);
   await client.query("COMMIT");return respond({active:true,idle:"account_rest"});
  }
  speakers=available.slice(0,12);
  const inserted=await client.query(`INSERT INTO moment_auto_jobs(chat_id,inbox_id,account_id,status)
    VALUES($1,$2,$3,'processing') ON CONFLICT(chat_id,inbox_id) DO NOTHING RETURNING id::text`,[chatId,candidate.id,accountId]);
  await client.query("UPDATE moment_auto_groups SET last_inbox_id=$2,last_generated_at=now(),last_error=NULL WHERE chat_id=$1",[chatId,candidate.id]);
  await client.query("COMMIT");
  if(!inserted.rowCount)return respond({active:true,idle:"already_processed"});
  jobId=inserted.rows[0].id;
 }catch(error){
  await client.query("ROLLBACK").catch(()=>{});
  console.error("Director claim",error instanceof Error?error.name:"unknown");
  return respond({error:"대화 판단 준비 실패"},503);
 }finally{client.release();}
 if(!candidate||!jobId)return respond({active:true,idle:"no_work"});

 try{
  // All available group personalities are given to ONE group director.
  // One judgment can choose silence, one speaker or a two-speaker exchange.
  const input={director:true,groupId:chatId,topic:candidate.body,humanMessage:candidate.body,
    inboxMessageId:candidate.id,credentialAccountId:accountId,personas:speakers};
  const internal=new NextRequest("https://internal.moment.invalid/api/discussion",{
   method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)
  });
  const response=await generate(internal),value=await response.json() as Generated;
  if(!response.ok||value.mode!=="ai"){
   const error=(typeof value.error==="string"?value.error:"AI 판단 엔진 오류").slice(0,200);
   await db.query("UPDATE moment_auto_jobs SET status='failed',decision_type='error',completed_at=now(),error=$2 WHERE id=$1",[jobId,error]);
   await db.query("UPDATE moment_auto_groups SET last_error=$2 WHERE chat_id=$1",[chatId,error]);
   return respond({active:true,created:false,reason:error});
  }
  const turns=Array.isArray(value.turns)?value.turns.slice(0,2):[];
  const selected=new Set<string>();
  const valid=turns.flatMap(t=>{
   const persona=speakers.find(x=>x.id===t.speakerId);
   const message=typeof t.text==="string"?t.text.trim().slice(0,700):"";
   if(!persona||!message||selected.has(persona.accountId))return [];
   selected.add(persona.accountId);
   return [{accountId:persona.accountId,text:message}];
  });
  const reason=(typeof value.decisionReason==="string"?value.decisionReason:value.reason||"별도 발언 불필요").slice(0,180);
  const c=await db.connect();
  try{
   await c.query("BEGIN");
   const state=await c.query("SELECT enabled FROM moment_auto_groups WHERE chat_id=$1 FOR UPDATE",[chatId]);
   if(!state.rows[0]?.enabled){
    await c.query("UPDATE moment_auto_jobs SET status='cancelled',decision_type='stopped',completed_at=now() WHERE id=$1",[jobId]);
    await c.query("COMMIT");return respond({active:false});
   }
   // Abort outdated plans if a person has continued speaking during generation.
   const latest=await c.query("SELECT COALESCE(MAX(id),0)::bigint AS last FROM moment_group_inbox WHERE chat_id=$1",[chatId]);
   if(BigInt(String(latest.rows[0].last))>BigInt(candidate.id)){
    await c.query("UPDATE moment_auto_jobs SET status='skipped',decision_type='people_continued',decision_reason='사람의 새 메시지가 있어 이전 답변 계획을 취소함',completed_at=now() WHERE id=$1",[jobId]);
    await c.query("COMMIT");return respond({active:true,created:false,reason:"people_continued"});
   }
   let queued=0;
   for(let i=0;i<valid.length;i++){
    const turn=valid[i],key="director:"+chatId+":"+candidate.id+":"+turn.accountId;
    const result=await c.query(`INSERT INTO moment_group_outbox
      (account_id,chat_id,reply_to_message_id,body,idempotency_key,source_type,not_before)
      VALUES($1,$2,$3,$4,$5,'auto',now()+($6::int * interval '1 second'))
      ON CONFLICT DO NOTHING RETURNING id`,
      [turn.accountId,chatId,candidate.message_id,turn.text,key,i===0?0:16]);
    queued+=result.rowCount||0;
   }
   await c.query(`UPDATE moment_auto_jobs
     SET status=$2,decision_type=$3,decision_reason=$4,selected_accounts=$5,completed_at=now()
     WHERE id=$1`,[jobId,queued?"queued":"skipped",queued?"reply":"silent",reason,valid.map(v=>v.accountId)]);
   await c.query("COMMIT");
   return respond({active:true,created:queued,decision:queued?"reply":"silent",reason});
  }catch(err){await c.query("ROLLBACK").catch(()=>{});throw err}
  finally{c.release();}
 }catch(err){
  console.error("Director decision",err instanceof Error?err.name:"unknown");
  await db.query("UPDATE moment_auto_jobs SET status='failed',decision_type='error',error='대화 판단 또는 저장 오류',completed_at=now() WHERE id=$1 AND status='processing'",[jobId]).catch(()=>{});
  return respond({error:"AI 대화 판단 처리 실패"},503);
 }
}
