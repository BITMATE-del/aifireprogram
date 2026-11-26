import {NextRequest,NextResponse} from "next/server";
import {effectiveAccountSecret} from "../../../lib/credential-vault";
import {recordUsage} from "../../../lib/ai-usage";
import {checkAiBudget} from "../../../lib/ai-budget";
import {isAllowedGroup,bridgeDatabase} from "../../../lib/group-bridge";
export const runtime="nodejs";
type Persona={id:string;name:string;role:string;style:string;risk:number;accountId:string;participationRole:"member"|"expert"|"observer"};
type Turn={speakerId:string;speaker:string;text:string};
function str(v:unknown,max=500){return typeof v==="string"?v.trim().slice(0,max):""}
function personasOf(v:unknown):Persona[]{if(!Array.isArray(v))return [];return v.slice(0,20).filter(p=>p&&typeof p==="object"&&typeof p.id==="string"&&typeof p.name==="string").map(p=>({id:str(p.id,80),name:str(p.name,60),role:str(p.role,120),style:str(p.style,1200),risk:typeof p.risk==="number"?Math.max(0,Math.min(100,p.risk)):50,accountId:str(p.accountId,120),participationRole:p.participationRole==="expert"?"expert":p.participationRole==="observer"?"observer":"member"}));}
function sample(topic:string,people:Persona[],human:string):Turn[]{
 const order=[...people].filter(p=>p.participationRole!=="observer").sort((a,b)=>Number(a.participationRole==="expert")-Number(b.participationRole==="expert"));
 const entries=order.slice(0,Math.min(4,order.length));
 const lines=[
 human?"그 말씀을 듣고 보니 기준을 어느 지점에서 바꾸실지가 궁금하네요.":"그 주제라면 먼저 어떤 근거로 판단하는지 듣고 싶습니다.",
 "저는 단순히 방향보다 그 판단이 틀렸을 때 어떻게 대응할지가 더 중요하다고 생각합니다.",
 "두 분이 보는 기준이 다르네요. 거래량과 실적 중 어떤 쪽이 지금 더 중요한지 확인해볼 필요가 있겠습니다.",
 "결국 지금 단정하기보다는 다음 데이터를 확인한 뒤 다시 비교해보는 게 낫겠네요."
 ];
 return entries.map((p,i)=>({speakerId:p.id,speaker:p.name,text:(i===0&&!human?"‘"+topic.slice(0,85)+"’에 대해 한 가지 궁금한 게 있습니다. ":"")+lines[i]}));
}
export async function POST(req:NextRequest){
 try{
  const contentLength=Number(req.headers.get("content-length")||0);
  if(contentLength>30000)return NextResponse.json({error:"요청 용량이 너무 큽니다."},{status:413});
  const input=await req.json();
  if(JSON.stringify(input).length>30000)return NextResponse.json({error:"요청 용량이 너무 큽니다."},{status:413});
  const topic=str(input?.topic,1200),human=str(input?.humanMessage,1200),people=personasOf(input?.personas);
  let history:{speaker:string;text:string}[]=Array.isArray(input?.history)?input.history.slice(-16).map((v:unknown)=>{const x=v as {speaker?:unknown;text?:unknown};return {speaker:str(x?.speaker,60),text:str(x?.text,600)}}):[];
  const groupId=str(input?.groupId,120);
  const inboxMessageId=str(input?.inboxMessageId,40);
  const isDirectQuestion=Boolean(human)&&(/[?？]/.test(human)||/(까요|나요|습니까|어떻게|왜|의견|궁금|알려|어떤가요|괜찮을까요)/.test(human));
  if(groupId && await isAllowedGroup(groupId)){
   try{
    const db=await bridgeDatabase();
    // Interleave real member messages and previously sent AI messages in Telegram
    // order so the next response can continue the actual group conversation.
    const recent=await db.query(`WITH current_msg AS (
      SELECT message_id FROM moment_group_inbox WHERE chat_id=$1 AND id=$2::bigint
     ), dialog AS (
      SELECT sender_name AS speaker,body AS text,message_id AS tid
       FROM moment_group_inbox WHERE chat_id=$1 AND message_id<
       COALESCE((SELECT message_id FROM current_msg),9223372036854775807)
      UNION ALL
      SELECT account_id AS speaker,body AS text,sent_message_id AS tid
       FROM moment_group_outbox WHERE chat_id=$1 AND status='sent'
       AND sent_message_id IS NOT NULL AND sent_message_id<
       COALESCE((SELECT message_id FROM current_msg),9223372036854775807)
     ) SELECT speaker,text FROM (SELECT speaker,text,tid FROM dialog ORDER BY tid DESC LIMIT 20) x ORDER BY tid ASC`,
      [groupId,/^\d+$/.test(inboxMessageId)?inboxMessageId:"0"]);
    if(recent.rowCount)history=recent.rows.map((r:{speaker:string;text:string})=>({speaker:str(r.speaker,60),text:str(r.text,600)}));
   }catch{ /* keep manual test available if the real inbox is not ready */ }
  }
  if(!topic||people.length<1)return NextResponse.json({error:"토론 주제와 발언 가능한 AI 페르소나 1명 이상이 필요합니다."},{status:400});
  const preferred=str(input?.credentialAccountId,120);
  const allowedAccounts=new Set(people.map(p=>p.accountId).filter(Boolean));
  const chosen=allowedAccounts.has(preferred)?preferred:people[0]?.accountId||"";
  let key:string|null=null;
  let billedAccountId="";
  if(chosen){
   try{
    const credential=await effectiveAccountSecret(chosen,"openaiApiKey");
    key=credential.value;
    if(key)billedAccountId=chosen;
   }catch{}
  }
  if(!key){key=process.env.OPENAI_API_KEY||null;billedAccountId=key?"__server_default__":"";}
  if(!key)return NextResponse.json({mode:"sample",turns:sample(topic,people,human),notice:"등록된 계정별 OpenAI 키나 서버 기본 API 키가 없어 샘플 반응을 표시합니다. 실제 AI 대화가 아닙니다."},{headers:{"Cache-Control":"no-store"}});
  if(billedAccountId){
   try{
    const budget=await checkAiBudget(billedAccountId);
    if(!budget.ok)return NextResponse.json({error:budget.message||"API 사용 한도를 초과했습니다.",code:"AI_BUDGET_LIMIT"},{status:429});
   }catch{return NextResponse.json({error:"API 사용 한도를 확인하지 못했습니다. 요청을 중단했습니다."},{status:503});}
  }
  const speakers=people.filter(p=>p.participationRole!=="observer");
  if(!speakers.length)return NextResponse.json({error:"이 그룹의 모든 AI 계정이 관망 모드입니다. 최소 한 계정의 역할을 일반 참여자 또는 전문가로 변경하세요.",code:"NO_ACTIVE_SPEAKER"},{status:400});
  const roster=speakers.map((p,i)=>({speakerId:"P"+(i+1),name:p.name,role:p.role,style:p.style,risk:p.risk,participationRole:p.participationRole}));
  const idFromSlot=new Map(roster.map((p,i)=>[p.speakerId,speakers[i]]));
  const description=[
    "당신은 비공개 AI 투자 커뮤니티 시뮬레이션의 대화 디렉터입니다.",
    "입력된 사람의 발언이 있다면 그 내용을 핵심으로 삼아 일반 참여자들의 후속 반응을 만드세요.",
    "모든 발언을 전문가 분석으로 만들지 마세요. 자연스러운 질문, 짧은 의견, 조심스러운 이견, 추가 확인 요청을 우선하세요.",
    "페르소나의 개별 role, style, risk, participationRole, accountId를 준수하세요. member 역할이 발언의 중심이며 expert는 요청이 있거나 근거가 필요한 때에만 반응합니다.",
    "발언자는 사용자 데이터에 제공된 짧은 speakerId(P1, P2 등)로 식별합니다. speakerId 값은 반드시 목록에서 그대로 골라 작성하세요. observer는 절대로 발언시키지 마세요.",
    "단순 인사·의미 없는 중복 발언에는 0개도 가능합니다. 그러나 사용자가 직접 질문한 경우, 문맥에 맞게 답할 수 있다면 member 페르소나에서 1~2개의 짧고 유용한 반응을 생성하세요.",
    "직전 대화와 의미 중복, 동일 어구 반복, 근거 없는 찬양, 노골적인 홍보성 발언을 피하세요.",
    "실제 데이터가 제공되지 않았으므로 최신 시세나 거래 성과를 만들어 내지 마세요.",
    "AI가 실제 거래를 했거나 수익을 얻었다고 허위 주장하지 않으며, 모의투자일 때는 명시하세요.",
    "대화는 교육용 시뮬레이션이며 실제 참여자가 쓴 것처럼 사칭하지 마세요.",
    "질문이 아닌 때는 0~3개, 명확한 질문에는 보통 1~2개의 자연스러운 한국어 메시지를 만드세요. 불필요한 맞장구를 만들지 마세요.",
    "한 번 반응한 참여자는 그 주제에 연속 답변을 하지 않도록 하고, 질문형·관망형 회원의 말수 차이를 유지하세요.",
    '반드시 JSON 객체 {"turns":[{"speakerId":"P1","text":"발언"}]} 형식으로만 응답하세요. speakerId는 입력된 발언자 목록의 P1, P2 등의 ID만 사용하세요.'
  ].join("\n");
  const response=await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify({
      model:process.env.OPENAI_MODEL||"gpt-4o-mini",
      response_format:{type:"json_object"},
      temperature:0.7,
      max_tokens:1200,
      messages:[{role:"system",content:description},{role:"user",content:JSON.stringify({topic,humanMessage:human,isDirectQuestion,personas:roster,history,marketData:"실시간 시세 미연동"})}]
    }),
    signal:AbortSignal.timeout(30000),cache:"no-store"
  });
  if(!response.ok)return NextResponse.json({error:response.status===429?"AI API 요청 한도에 도달했습니다.":"AI 모델 호출에 실패했습니다. 서버 모델 및 API 설정을 확인하세요.",status:response.status},{status:502});
  const result=await response.json();
  // Record the provider-reported usage, even if the generated JSON later fails parsing.
  const usage=result?.usage;
  if(usage&&Number.isFinite(usage.prompt_tokens)&&Number.isFinite(usage.completion_tokens)){
   try{
    await recordUsage({
      accountId:billedAccountId||"__server_default__",
      groupId:str(input?.groupId,120),
      model:String(result?.model||process.env.OPENAI_MODEL||"gpt-4o-mini"),
      requestId:typeof result?.id==="string"?result.id:null,
      prompt:Math.max(0,Math.trunc(usage.prompt_tokens)),
      completion:Math.max(0,Math.trunc(usage.completion_tokens)),
      cached:Math.max(0,Math.trunc(usage.prompt_tokens_details?.cached_tokens||0))
    });
   }catch(error){console.error("AI usage ledger write failed",error instanceof Error?error.name:"unknown");}
  }

  let parsed:{turns?:{speakerId?:unknown;text?:unknown}[]};
  try{parsed=JSON.parse(result?.choices?.[0]?.message?.content||"{}")}catch{return NextResponse.json({error:"AI 응답 형식을 해석할 수 없습니다."},{status:502});}
  const normalize=(v:string)=>v.toLowerCase().replace(/[\\s\\p{P}\\p{S}]/gu,"");
  const seen=new Set(history.slice(-10).map(x=>normalize(x.text)));
  const decodeSpeaker=(raw:unknown):Persona|undefined=>{
    const label=str(raw,140).trim();
    if(!label)return speakers.length===1?speakers[0]:undefined;
    const normalized=label.replace(/^[#"'\s]+|[#"'\s]+$/g,"").toUpperCase();
    // Models sometimes write "P1", "p1", "1", or "speaker_P1".
    const simple=/^(?:SPEAKER[_\s-]*)?P?0*(\d{1,2})$/.exec(normalized);
    if(simple){
      const index=Number(simple[1])-1;
      if(index>=0&&index<speakers.length)return speakers[index];
    }
    const exact=roster.findIndex((p,i)=>p.speakerId===normalized||speakers[i].id===label);
    if(exact>=0)return speakers[exact];
    const names=speakers.filter(p=>p.name===label||normalize(p.name)===normalize(label));
    if(names.length===1)return names[0];
    const accounts=speakers.filter(p=>p.accountId===label);
    if(accounts.length===1)return accounts[0];
    // A single non-observer account is unambiguous even when the model uses
    // its visible nickname instead of an ID. Never guess for multiple accounts.
    return speakers.length===1?speakers[0]:undefined;
  };
  let rejectedSpeaker=0,rejectedRepeat=0,rejectedEmpty=0;
  const rawTurns=Array.isArray(parsed.turns)?parsed.turns:[];
  const turns:Turn[]=rawTurns.slice(0,3).flatMap(t=>{
    if(!t||typeof t!=="object"){rejectedEmpty++;return [];}
    const reply=t as {speakerId?:unknown;speaker?:unknown;name?:unknown;text?:unknown;message?:unknown;content?:unknown};
    const matching=decodeSpeaker(reply.speakerId??reply.speaker??reply.name);
    if(!matching){rejectedSpeaker++;return [];}
    const message=str(reply.text??reply.message??reply.content,700);
    if(!message){rejectedEmpty++;return [];}
    if(seen.has(normalize(message))){rejectedRepeat++;return [];}
    seen.add(normalize(message));
    return [{speakerId:matching.id,speaker:matching.name,text:message}];
  });
  if(!turns.length){
    const reason=rawTurns.length===0?"MODEL_NO_TURNS":rejectedSpeaker?"UNKNOWN_SPEAKER":rejectedRepeat?"DUPLICATE_TURNS":"EMPTY_TURNS";
    const notice=reason==="MODEL_NO_TURNS"
      ?"AI가 추가 발언이 필요하지 않다고 판단했습니다. 질문이라면 성격 설정이나 질문 내용을 확인해 주세요."
      :reason==="UNKNOWN_SPEAKER"?"AI가 답변을 생성했지만 발언자 식별에 실패했습니다. 다시 생성해 보세요."
      :reason==="DUPLICATE_TURNS"?"생성된 반응이 이전 대화와 동일해 제외됐습니다."
      :"AI가 빈 발언을 반환해 제외됐습니다.";
    console.info("AI discussion filtered", {reason,returned:rawTurns.length,rejectedSpeaker,rejectedRepeat,rejectedEmpty});
    return NextResponse.json({mode:"ai",turns:[],reason,notice},{headers:{"Cache-Control":"no-store"}});
  }
  return NextResponse.json({mode:"ai",turns,notice:"AI가 생성한 비공개 토론 시뮬레이션입니다. 실제 시세 검증은 수행되지 않았습니다."},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"토론 생성 중 서버 오류가 발생했습니다."},{status:500})}
}
