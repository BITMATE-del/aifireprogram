import {NextRequest,NextResponse} from "next/server";
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
  const history=Array.isArray(input?.history)?input.history.slice(-16).map((v:unknown)=>{const x=v as {speaker?:unknown;text?:unknown};return {speaker:str(x?.speaker,60),text:str(x?.text,600)}}):[];
  if(!topic||people.length<1)return NextResponse.json({error:"토론 주제와 발언 가능한 AI 페르소나 1명 이상이 필요합니다."},{status:400});
  const key=process.env.OPENAI_API_KEY;
  if(!key)return NextResponse.json({mode:"sample",turns:sample(topic,people,human),notice:"API 키가 없어 샘플 반응을 표시합니다. 실제 AI 대화가 아닙니다."},{headers:{"Cache-Control":"no-store"}});
  const description=[
    "당신은 비공개 AI 투자 커뮤니티 시뮬레이션의 대화 디렉터입니다.",
    "입력된 사람의 발언이 있다면 그 내용을 핵심으로 삼아 일반 참여자들의 후속 반응을 만드세요.",
    "모든 발언을 전문가 분석으로 만들지 마세요. 자연스러운 질문, 짧은 의견, 조심스러운 이견, 추가 확인 요청을 우선하세요.",
    "페르소나의 개별 role, style, risk, participationRole, accountId를 준수하세요. member 역할이 발언의 중심이며 expert는 요청이 있거나 근거가 필요한 때에만 반응합니다.",
    "각 발언자는 계정별 id가 다릅니다. 같은 이름이어도 id가 다른 계정을 혼동하지 마세요. observer는 절대로 발언시키지 마세요.",
    "발언 가치가 없거나 이전에 충분히 답했다면 발언 0개도 가능합니다. 말을 억지로 생성하지 마세요.",
    "직전 대화와 의미 중복, 동일 어구 반복, 근거 없는 찬양, 노골적인 홍보성 발언을 피하세요.",
    "실제 데이터가 제공되지 않았으므로 최신 시세나 거래 성과를 만들어 내지 마세요.",
    "AI가 실제 거래를 했거나 수익을 얻었다고 허위 주장하지 않으며, 모의투자일 때는 명시하세요.",
    "대화는 교육용 시뮬레이션이며 실제 참여자가 쓴 것처럼 사칭하지 마세요.",
    "필요하면 0~5개 자연스러운 한국어 메시지를 만드세요. 불필요한 맞장구를 만들지 마세요.",
    '반드시 JSON 객체 {"turns":[{"speakerId":"페르소나 id","text":"발언"}]} 형식으로만 응답하세요.'
  ].join("\n");
  const response=await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify({
      model:process.env.OPENAI_MODEL||"gpt-4o-mini",
      response_format:{type:"json_object"},
      temperature:0.7,
      max_tokens:1200,
      messages:[{role:"system",content:description},{role:"user",content:JSON.stringify({topic,humanMessage:human,personas:people,history,marketData:"실시간 시세 미연동"})}]
    }),
    signal:AbortSignal.timeout(30000),cache:"no-store"
  });
  if(!response.ok)return NextResponse.json({error:response.status===429?"AI API 요청 한도에 도달했습니다.":"AI 모델 호출에 실패했습니다. 서버 모델 및 API 설정을 확인하세요.",status:response.status},{status:502});
  const result=await response.json();
  let parsed:{turns?:{speakerId?:unknown;text?:unknown}[]};
  try{parsed=JSON.parse(result?.choices?.[0]?.message?.content||"{}")}catch{return NextResponse.json({error:"AI 응답 형식을 해석할 수 없습니다."},{status:502});}
  const lookup=new Map(people.filter(p=>p.participationRole!=="observer").map(p=>[p.id,p.name]));
  const seen=new Set<string>();
  const turns:Turn[]=(Array.isArray(parsed.turns)?parsed.turns:[]).slice(0,5).flatMap(t=>{
    const speakerId=str(t.speakerId,80),text=str(t.text,700);
    if(!lookup.has(speakerId)||!text||seen.has(text))return [];
    seen.add(text);return [{speakerId,speaker:lookup.get(speakerId)!,text}];
  });
  if(turns.length===0)return NextResponse.json({mode:"ai",turns:[],notice:"현재 주제에는 꼭 필요한 추가 발언이 없어 대화를 생성하지 않았습니다."},{headers:{"Cache-Control":"no-store"}});
  return NextResponse.json({mode:"ai",turns,notice:"AI가 생성한 비공개 토론 시뮬레이션입니다. 실제 시세 검증은 수행되지 않았습니다."},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"토론 생성 중 서버 오류가 발생했습니다."},{status:500})}
}
