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
type Speaker=Persona&{id:string;accountId:string;participationRole:"member"|"expert"|"observer"};
type Inbox={id:string;message_id:string;body:string;observed_at:string};
type Conversation={id:string;root_inbox_id:string;last_human_inbox_id:string;turn_count:number;last_outbox_id:string|null;status:string;next_decision_at:string};
type Generated={mode?:string;decision?:string;decisionReason?:string;memorySummary?:string;error?:string;turns?:{speakerId:string;text:string;intent?:string}[]};

function focus(people:Speaker[],topic:string){
 const normalized=topic.toLowerCase();
 return people.map((p,i)=>({
  p,i,
  relevance:(p.interests||"").split(/[,，\s]+/).filter(x=>x.length>=2&&normalized.includes(x.toLowerCase())).length,
 })).sort((a,b)=>b.relevance-a.relevance||a.i-b.i).slice(0,16).map(x=>x.p);
}
async function audit(db:Awaited<ReturnType<typeof autoDb>>,chatId:string,sessionId:string,step:number,decision:string,reason:string,account?:string){
 await db.query(`INSERT INTO moment_conversation_decisions(chat_id,session_id,turn_step,decision,reason,selected_account)
  VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(session_id,turn_step) DO NOTHING`,
 [chatId,sessionId,step,decision,reason.slice(0,250),account||null]);
}
export async function GET(req:NextRequest){
 if(!authorizedBridge(req))return respond({error:"인증 실패"},401);
 const accountId=safeAccountId(req.nextUrl.searchParams.get("accountId"));
 const chatId=safeChatId(req.nextUrl.searchParams.get("chatId"));
 if(!accountId||!chatId||!(await isAllowedGroup(chatId)))return respond({error:"계정 또는 그룹 권한 오류"},403);
 const db=await autoDb(),client=await db.connect();
 let session:Conversation|null=null;
 let candidate:Inbox|null=null;
 let speakers:Speaker[]=[];
 let step=0;
 let lastAi:{account_id:string;body:string;id:string}|null=null;
 let task:"initial"|"followup"="initial";
 try{
  await client.query("BEGIN");
  const config=await client.query("SELECT enabled,min_interval_seconds,last_inbox_id,last_generated_at FROM moment_auto_groups WHERE chat_id=$1 FOR UPDATE",[chatId]);
  if(!config.rows[0]?.enabled){await client.query("COMMIT");return respond({active:false});}
  const stateResult=await client.query("SELECT content FROM moment_workspace_state WHERE id='primary'");
  const state=stateResult.rows[0]?.content as {accounts?:Account[];assignments?:Assignment[];people?:Persona[]}|undefined;
  const registered=new Set((state?.accounts||[]).filter(x=>x.enabled!==false).map(x=>x.id));
  const heartbeats=await client.query("SELECT account_id FROM moment_telegram_heartbeats WHERE chat_id=$1 AND last_seen>now()-interval '90 seconds'",[chatId]);
  const online=new Set(heartbeats.rows.map((x:{account_id:string})=>x.account_id));
  const eligible=(state?.assignments||[]).filter(x=>x.groupId===chatId&&x.mode!=="observer"&&registered.has(x.accountId)&&online.has(x.accountId));
  eligible.sort((a,b)=>a.accountId.localeCompare(b.accountId));
  if(!eligible.length||eligible[0].accountId!==accountId){await client.query("COMMIT");return respond({active:true,idle:eligible.length?"coordinator":"no_online_account"});}
  speakers=eligible.flatMap(a=>{
   const p=state?.people?.find(x=>x.id===a.personaId);
   return p?[{...p,id:a.accountId+"::"+chatId,accountId:a.accountId,participationRole:a.mode}]:[];
  });
  if(!speakers.length){await client.query("COMMIT");return respond({active:true,idle:"no_personas"});}
  const current=await client.query("SELECT * FROM moment_conversation_sessions WHERE chat_id=$1 AND status IN ('observing','deciding','waiting','reevaluating') FOR UPDATE",[chatId]);
  const latest=await client.query("SELECT id::text,message_id::text,body,observed_at FROM moment_group_inbox WHERE chat_id=$1 ORDER BY id DESC LIMIT 1",[chatId]);
  const newest=latest.rows[0] as Inbox|undefined;
  if(current.rowCount){
   session={...current.rows[0],id:String(current.rows[0].id),root_inbox_id:String(current.rows[0].root_inbox_id),last_human_inbox_id:String(current.rows[0].last_human_inbox_id),last_outbox_id:current.rows[0].last_outbox_id?String(current.rows[0].last_outbox_id):null} as Conversation;
   if(newest&&BigInt(newest.id)>BigInt(session.last_human_inbox_id)){
    await client.query("UPDATE moment_conversation_sessions SET status='cancelled',updated_at=now() WHERE id=$1",[session.id]);
    await client.query("UPDATE moment_group_outbox SET status='cancelled',completed_at=now(),last_error='사람의 새 대화로 기존 계획 취소' WHERE conversation_session_id=$1 AND status='pending'",[session.id]);
    session=null;
   }else if(session.status==="deciding"){
    if(Date.now()-new Date(current.rows[0].updated_at).getTime()>90000){
     await client.query("UPDATE moment_conversation_sessions SET status='ended',updated_at=now() WHERE id=$1",[session.id]);
    }
    await client.query("COMMIT");return respond({active:true,idle:"already_deciding"});
   }else if(session.status==="waiting"){
    if(!session.last_outbox_id){
     await client.query("UPDATE moment_conversation_sessions SET status='ended',updated_at=now() WHERE id=$1",[session.id]);
     await client.query("COMMIT");return respond({active:true,idle:"no_last_turn"});
    }
    const last=await client.query("SELECT id::text,account_id,body,status FROM moment_group_outbox WHERE id=$1",[session.last_outbox_id]);
    if(last.rows[0]?.status==="pending"||last.rows[0]?.status==="sending"){
     await client.query("COMMIT");return respond({active:true,idle:"waiting_send"});
    }
    if(last.rows[0]?.status!=="sent"||Number(session.turn_count)>=3){
     await client.query("UPDATE moment_conversation_sessions SET status='ended',updated_at=now() WHERE id=$1",[session.id]);
     await client.query("COMMIT");return respond({active:true,idle:"session_end"});
    }
    if(new Date(session.next_decision_at).getTime()>Date.now()){
     await client.query("COMMIT");return respond({active:true,idle:"waiting_context"});
    }
    if(speakers.length<2){
     await client.query("UPDATE moment_conversation_sessions SET status='ended',updated_at=now() WHERE id=$1",[session.id]);
     await client.query("COMMIT");return respond({active:true,idle:"no_other_speaker"});
    }
    lastAi={id:last.rows[0].id,account_id:last.rows[0].account_id,body:last.rows[0].body};
    task="followup";
   }else{
    await client.query("COMMIT");return respond({active:true,idle:"session_observing"});
   }
  }
  if(!session){
   if(!newest||BigInt(newest.id)<=BigInt(String(config.rows[0].last_inbox_id))){
    await client.query("COMMIT");return respond({active:true,idle:"no_new_message"});
   }
   const age=Date.now()-new Date(newest.observed_at).getTime();
   if(age<10000){await client.query("COMMIT");return respond({active:true,idle:"observing"});}
   if(age>180000){
    await client.query("UPDATE moment_auto_groups SET last_inbox_id=$2 WHERE chat_id=$1",[chatId,newest.id]);
    await client.query("COMMIT");return respond({active:true,idle:"expired_inbox"});
   }
   if(config.rows[0].last_generated_at&&Date.now()-new Date(config.rows[0].last_generated_at).getTime()<Number(config.rows[0].min_interval_seconds)*1000){
    await client.query("COMMIT");return respond({active:true,idle:"group_cooldown"});
   }
   const created=await client.query(`INSERT INTO moment_conversation_sessions(chat_id,root_inbox_id,last_human_inbox_id,status)
     VALUES($1,$2,$2,'deciding') ON CONFLICT(chat_id,root_inbox_id) DO NOTHING RETURNING id::text`,[chatId,newest.id]);
   if(!created.rowCount){await client.query("COMMIT");return respond({active:true,idle:"previously_evaluated"});}
   session={id:created.rows[0].id,root_inbox_id:newest.id,last_human_inbox_id:newest.id,turn_count:0,last_outbox_id:null,status:"deciding",next_decision_at:new Date().toISOString()};
   await client.query("UPDATE moment_auto_groups SET last_inbox_id=$2,last_generated_at=now(),last_error=NULL WHERE chat_id=$1",[chatId,newest.id]);
  }
  candidate=(await client.query("SELECT id::text,message_id::text,body,observed_at FROM moment_group_inbox WHERE id=$1 AND chat_id=$2",[session.root_inbox_id,chatId])).rows[0] as Inbox|undefined||null;
  if(!candidate){await client.query("UPDATE moment_conversation_sessions SET status='ended' WHERE id=$1",[session.id]);await client.query("COMMIT");return respond({active:true,idle:"missing_original"});}
  step=Number(session.turn_count)+1;
  await client.query("UPDATE moment_conversation_sessions SET status='deciding',updated_at=now() WHERE id=$1",[session.id]);
  await client.query("COMMIT");
 }catch(e){
  await client.query("ROLLBACK").catch(()=>{});
  console.error("session claim",e instanceof Error?e.name:"unknown");
  return respond({error:"대화 세션 확보 오류"},503);
 }finally{client.release();}
 if(!session||!candidate)return respond({active:true,idle:"no_candidate"});
 try{
  const recent=await db.query(`SELECT account_id,MAX(created_at) AS last_at FROM moment_group_outbox WHERE chat_id=$1
    AND source_type='auto' AND status IN ('pending','sending','sent') AND created_at>now()-interval '15 minutes'
    GROUP BY account_id`,[chatId]);
  const lastSpoke=new Map(recent.rows.map((x:{account_id:string;last_at:Date})=>[x.account_id,new Date(x.last_at).getTime()]));
  const candidates=speakers.filter(p=>{
   if(lastAi?.account_id===p.accountId)return false;
   const n=lastSpoke.get(p.accountId),min=p.frequency==="quiet"?600000:p.frequency==="active"?90000:180000;
   return (task==="followup"&&step>=3)||!n||Date.now()-n>=min;
  });
  if(!candidates.length){
   await audit(db,chatId,session.id,step,"END","발언 가능한 다른 계정이 없거나 휴식 간격 미충족");
   await db.query("UPDATE moment_conversation_sessions SET status='ended',updated_at=now() WHERE id=$1 AND status='deciding'",[session.id]);
   return respond({active:true,decision:"END"});
  }
  const focusSpeakers=focus(candidates,task==="followup"?(lastAi?.body||candidate.body):candidate.body);
  const [memory,prior]=await Promise.all([
   db.query("SELECT summary FROM moment_group_memory WHERE chat_id=$1 AND updated_at>now()-interval '14 days'",[chatId]),
   db.query(`SELECT account_id,body FROM moment_group_outbox WHERE chat_id=$1 AND status='sent'
    AND created_at>now()-interval '7 days' AND account_id=ANY($2::text[])
    ORDER BY completed_at DESC LIMIT 20`,[chatId,focusSpeakers.map(x=>x.accountId)])
  ]);
  const input={director:true,conversationStep:step,followUp:task==="followup",
   lastAiTurn:lastAi?{speakerAccountId:lastAi.account_id,text:lastAi.body}:null,
   groupId:chatId,topic:candidate.body,humanMessage:candidate.body,
   inboxMessageId:candidate.id,credentialAccountId:accountId,personas:focusSpeakers,
   groupMemory:memory.rows[0]?.summary||"",
   accountPriorMessages:prior.rows.slice(0,14).map((x:{account_id:string;body:string})=>({accountId:x.account_id,text:String(x.body).slice(0,200)}))
  };
  const response=await generate(new NextRequest("https://internal.moment.invalid/api/discussion",{
   method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)
  }));
  const value=await response.json() as Generated;
  if(!response.ok||value.mode!=="ai")throw Error(typeof value.error==="string"?value.error.slice(0,180):"AI 응답 오류");
  const first=Array.isArray(value.turns)?value.turns.find(x=>focusSpeakers.some(p=>p.id===x.speakerId)&&typeof x.text==="string"&&x.text.trim()):undefined;
  const selected=first?focusSpeakers.find(p=>p.id===first.speakerId):undefined;
  const reason=(value.decisionReason||"추가 발언 불필요").slice(0,200);
  const c=await db.connect();
  try{
   await c.query("BEGIN");
   const row=await c.query("SELECT status,turn_count,last_human_inbox_id FROM moment_conversation_sessions WHERE id=$1 FOR UPDATE",[session.id]);
   const running=await c.query("SELECT enabled FROM moment_auto_groups WHERE chat_id=$1 FOR UPDATE",[chatId]);
   const newest=await c.query("SELECT COALESCE(MAX(id),0)::bigint AS latest FROM moment_group_inbox WHERE chat_id=$1",[chatId]);
   if(!row.rows[0]||row.rows[0].status!=="deciding"||!running.rows[0]?.enabled||
      BigInt(String(newest.rows[0].latest))>BigInt(String(row.rows[0].last_human_inbox_id))){
    await c.query("UPDATE moment_conversation_sessions SET status='cancelled',updated_at=now() WHERE id=$1",[session.id]);
    await c.query("COMMIT");return respond({active:false,decision:"CANCEL"});
   }
   if(!selected||!first||step>3){
    await c.query("UPDATE moment_conversation_sessions SET status='ended',updated_at=now() WHERE id=$1",[session.id]);
    await c.query(`INSERT INTO moment_conversation_decisions(chat_id,session_id,turn_step,decision,reason)
      VALUES($1,$2,$3,'END',$4) ON CONFLICT(session_id,turn_step) DO NOTHING`,[chatId,session.id,step,reason]);
    await c.query("COMMIT");return respond({active:true,decision:"END",reason});
   }
   const key="conversation:"+session.id+":turn:"+step;
   const queued=await c.query(`INSERT INTO moment_group_outbox
     (account_id,chat_id,reply_to_message_id,body,idempotency_key,source_type,conversation_session_id,target_outbox_id,turn_intent,turn_step)
     VALUES($1,$2,$3,$4,$5,'auto',$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING id::text`,
    [selected.accountId,chatId,candidate.message_id,String(first.text).trim().slice(0,700),key,
     session.id,lastAi?.id||null,first.intent||"ANSWER",step]);
   if(!queued.rowCount)throw Error("conversation turn already scheduled");
   await c.query(`UPDATE moment_conversation_sessions SET status='waiting',turn_count=$2,last_outbox_id=$3,
     next_decision_at=now()+interval '12 seconds',updated_at=now() WHERE id=$1`,
     [session.id,step,queued.rows[0].id]);
   await c.query(`INSERT INTO moment_conversation_decisions(chat_id,session_id,turn_step,decision,reason,selected_account)
     VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(session_id,turn_step) DO NOTHING`,
     [chatId,session.id,step,step===1?"SPEAK":"EXCHANGE",reason,selected.accountId]);
   const summary=typeof value.memorySummary==="string"?value.memorySummary.trim().slice(0,500):"";
   if(summary.length>10)await c.query(`INSERT INTO moment_group_memory(chat_id,summary)
     VALUES($1,$2) ON CONFLICT(chat_id) DO UPDATE SET summary=$2,updated_at=now()`,[chatId,summary]);
   await c.query("COMMIT");
   return respond({active:true,decision:step===1?"SPEAK":"EXCHANGE",queued:1});
  }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}
  finally{c.release();}
 }catch(e){
  const reason=e instanceof Error?e.message.slice(0,170):"처리 오류";
  console.error("conversation decision",e instanceof Error?e.name:"unknown");
  await db.query("UPDATE moment_conversation_sessions SET status='ended',updated_at=now() WHERE id=$1 AND status='deciding'",[session.id]).catch(()=>{});
  await db.query("UPDATE moment_auto_groups SET last_error=$2 WHERE chat_id=$1",[chatId,reason]).catch(()=>{});
  return respond({active:true,error:"대화 판단 실패",reason},503);
 }
}
