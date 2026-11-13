import { NextRequest, NextResponse } from "next/server";

type Persona = { id: string; name: string; role: string; style: string; risk: number };
type Turn = { speakerId: string; speaker: string; text: string };
function stringValue(v: unknown, max = 500) { return typeof v === "string" ? v.slice(0,max) : ""; }
function safePersonas(raw: unknown): Persona[] {
 if (!Array.isArray(raw)) return [];
 return raw.slice(0,20).filter(p=>p && typeof p.id==="string" && typeof p.name==="string").map(p=>({
 id:stringValue(p.id,80),name:stringValue(p.name,60),role:stringValue(p.role,120),
 style:stringValue(p.style,400),risk:typeof p.risk==="number"?Math.min(100,Math.max(0,p.risk)):50
 }));
}
function sample(topic: string, people: Persona[]): Turn[] {
 const starters = [
 "우선 확인해야 할 것은 시장 데이터의 기준 시각과 거래량입니다. 지금은 결론보다 조건을 먼저 정하는 게 좋겠습니다.",
 "저는 기업 실적과 업종 전망을 함께 봐야 한다고 생각합니다. 단기 가격 움직임만으로 결론을 내리긴 어렵습니다.",
 "좋은 의견입니다. 다만 기대가 커질수록 손실 시나리오와 비중 관리도 같이 검토해야 합니다.",
 "말씀하신 기준에 동의하는 부분도 있지만, 추세 전환 여부는 추가 데이터가 있어야 판단할 수 있겠네요.",
 "그럼 앞서 말한 조건을 다음 거래일에 다시 확인하고, 맞았던 판단과 틀렸던 판단을 모두 기록하죠."
 ];
 return people.slice(0,5).map((p,i)=>({speakerId:p.id,speaker:p.name,text:(i===0?"오늘 토론 주제는 '"+topic+"'입니다. ":"")+starters[i]}));
}
export async function POST(req: NextRequest) {
 try {
  const body=await req.json();
  const topic=stringValue(body?.topic,1200).trim();
  const humanMessage=stringValue(body?.humanMessage,1200).trim();
  const personas=safePersonas(body?.personas);
  const history=Array.isArray(body?.history)?body.history.slice(-16).map((x:unknown)=>{
   const v=x as {speaker?:unknown;text?:unknown};return {speaker:stringValue(v?.speaker,60),text:stringValue(v?.text,600)};
  }):[];
  if(!topic || personas.length<2) return NextResponse.json({error:"주제와 최소 2명의 페르소나가 필요합니다."},{status:400});
  if(JSON.stringify(body).length>25000) return NextResponse.json({error:"요청 크기가 너무 큽니다."},{status:413});
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey) return NextResponse.json({mode:"sample",turns:sample(topic,personas),notice:"샘플 토론입니다. OPENAI_API_KEY 미설정으로 실제 AI 호출은 수행하지 않았습니다."});
  const instructions="당신은 비공개 투자 커뮤니티 AI 시뮬레이션의 대화 감독입니다. 전문가는 전체 발언 중 소수이고 일반 참여자의 질문, 조심스러운 반응, 직접 본 경험, 반론, 공감, 관망이 중심입니다. 실제 트레이더 발언이 제공됐다면 그 메시지를 직접 읽은 일반 회원들의 후속 반응을 생성하세요. 이전 발언을 그대로 반복하지 말고 서로 다른 관심사와 말투를 반영하세요. AI가 실제 투자를 했다고 사칭하거나 실제 회원인 척하지 마세요. 의견 차이는 근거가 있을 때만 제시하세요. 일부 참여자가 답하지 않는 것도 자연스럽습니다.  각 페르소나의 이름과 역할을 반영하여 서로 다른 의견, 근거, 질문이 자연스럽게 이어지는 한국어 대화 4~6개를 작성하세요. 입력에 없는 구체적인 실시간 가격이나 실제 수익, 체결 내역을 지어내지 마세요. 수익은 입증된 경우만 실제로 표현하고 그 외에는 모의투자로 표시하세요. 지나친 칭찬, 의미 없는 맞장구, 반복은 피하세요. JSON 객체 {\\\"turns\\\":[{\\\"speakerId\\\":\\\"...\\\",\\\"speaker\\\":\\\"...\\\",\\\"text\\\":\\\"...\\\"}]}만 출력하세요.";
  const response=await fetch("https://api.openai.com/v1/chat/completions",{
   method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
   body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-4o-mini",temperature:0.65,response_format:{type:"json_object"},messages:[
    {role:"system",content:instructions},
    {role:"user",content:JSON.stringify({topic,humanMessage,personas,history,marketData:"외부 시세 연결 안 됨. 실시간 가격 주장 금지."})}
   ]}),signal:AbortSignal.timeout(30000),cache:"no-store"
  });
  if(!response.ok) return NextResponse.json({error:"AI 생성 실패: 모델 설정 또는 API 사용 한도를 확인하세요.",status:response.status},{status:502});
  const payload=await response.json(); const parsed=JSON.parse(payload?.choices?.[0]?.message?.content||"{}");
  const permitted=new Map(personas.map(p=>[p.id,p.name]));
  const turns=Array.isArray(parsed.turns)?parsed.turns.slice(0,6).filter((t:Turn)=>t && permitted.has(t.speakerId)&&typeof t.text==="string").map((t:Turn)=>({speakerId:t.speakerId,speaker:permitted.get(t.speakerId),text:t.text.slice(0,900)})):[];
  if(turns.length<2) return NextResponse.json({error:"생성된 토론이 품질 검사를 통과하지 못했습니다."},{status:502});
  return NextResponse.json({mode:"ai",turns,notice:"AI가 생성한 시뮬레이션이며 실시간 시세 검증은 수행되지 않았습니다."});
 } catch { return NextResponse.json({error:"요청 처리 중 오류가 발생했습니다."},{status:500}); }
}
