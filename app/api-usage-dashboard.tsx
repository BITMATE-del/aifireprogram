"use client";
import {useEffect,useState} from "react";
import {Activity,ArrowUpRight,BarChart3,BrainCircuit,CheckCircle2,Clock3,KeyRound,RefreshCw,ShieldCheck,Wallet} from "lucide-react";
import AccountCredentials from "./account-credentials";
import DefaultCredentials from "./default-credentials";

type Account={id:string;name:string;enabled:boolean};
type Totals={requests:number;prompt_tokens:string;completion_tokens:string;cached_tokens:string;estimated_usd:number;unknown_cost_requests:number};
type Day={day:string;requests:number;prompt_tokens:string;completion_tokens:string;estimated_usd:number;unknown_cost_requests:number};
type AccountTotal={account_id:string;requests:number;total_tokens:string;estimated_usd:number;unknown_cost_requests:number};
type Entry={account_id:string;group_id:string;model:string;prompt_tokens:number;completion_tokens:number;cached_tokens:number;estimated_usd:number|null;created_at:string};
type Usage={all:Totals;today:Totals;month:Totals;days:Day[];accounts:AccountTotal[];recent:Entry[];note:string;error?:string};
const num=(v:string|number|undefined)=>Number(v||0);
const tokens=(n:string|number|undefined)=>num(n).toLocaleString("ko-KR");
const usd=(n:number|undefined)=>"$"+num(n).toFixed(6);
export default function ApiUsageDashboard({accounts,selectedAccount,onSelect}:{
 accounts:Account[];selectedAccount:string;onSelect:(id:string)=>void
}){
 const [tab,setTab]=useState<"defaults"|"keys"|"usage">("defaults");
 const [usage,setUsage]=useState<Usage|null>(null);
 const [loading,setLoading]=useState(false),[error,setError]=useState("");
 const [scope,setScope]=useState("all");
 const query=async(id:string)=>{
  setLoading(true);setError("");
  try{
   const r=await fetch("/api/ai-usage"+(id!=="all"?"?accountId="+encodeURIComponent(id):""),{cache:"no-store"});
   const j:Usage=await r.json();
   if(!r.ok)throw Error(j.error||"통계 조회 실패");
   setUsage(j);
  }catch(e){setError(e instanceof Error?e.message:"조회할 수 없습니다.");setUsage(null)}
  finally{setLoading(false)}
 };
 useEffect(()=>{if(tab==="usage")void query(scope);},[tab,scope]);
 const max=Math.max(.000001,...(usage?.days||[]).map(x=>num(x.estimated_usd)));
 return <div className="nxApiWorkspace">
   <div className="nxApiHeader"><div><div className="nxApiEyebrow"><ShieldCheck size={15}/> 내 계정 API 설정</div><h2>API 연결 및 사용량 관리</h2><p>공통 API는 한 번만 등록하고, 계정별 예외만 설정하세요. 사용한 토큰과 비용도 확인할 수 있습니다.</p></div></div>
   <div className="nxApiTabs"><button className={tab==="defaults"?"active":""} onClick={()=>setTab("defaults")}><ShieldCheck size={17}/> 전체 기본 설정</button><button className={tab==="keys"?"active":""} onClick={()=>setTab("keys")}><KeyRound size={17}/> 계정별 개별 설정</button><button className={tab==="usage"?"active":""} onClick={()=>setTab("usage")}><BarChart3 size={17}/> 토큰·사용금액</button></div>
   {tab==="defaults"&&<DefaultCredentials/>}
   {tab==="keys"&&<div className="nxApiKeyLayout">
    <section className="nxPanel nxApiAccountList"><div className="nxPanelHeading"><div><h2>등록 계정 <small>{accounts.length}</small></h2><p>설정하려는 계정을 선택하세요.</p></div></div>
      {accounts.length?accounts.map(a=><button key={a.id} className={"nxAccountSelect "+(selectedAccount===a.id?"selected":"")} onClick={()=>onSelect(a.id)}><span className="nxAvatar">{a.name.slice(0,1)}</span><span><strong>{a.name}</strong><small>{a.enabled===false?"비활성":"활성"} · 계정별 독립 API</small></span>{selectedAccount===a.id&&<CheckCircle2 size={18}/>}</button>):<div className="nxEmpty">계정 관리에서 계정을 먼저 등록하세요.</div>}
    </section>
    <section className="nxPanel nxApiKeyEditor">{selectedAccount?<AccountCredentials key={selectedAccount} accountId={selectedAccount}/>:<div className="nxApiEmpty"><KeyRound size={29}/><strong>API를 등록할 계정을 선택하세요</strong><p>Telegram API ID·HASH·OpenAI 키는 기본값을 상속하고, 각 계정은 고유 세션과 필요한 개별값만 저장합니다.</p></div>}</section>
   </div>}
   {tab==="usage"&&<div className="nxUsageContent">
    <div className="nxUsageFilters"><label>조회 계정<select value={scope} onChange={e=>setScope(e.target.value)}><option value="all">전체 계정</option><option value="__server_default__">서버 기본 API 키</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><button onClick={()=>void query(scope)} disabled={loading}><RefreshCw size={15}/>{loading?"조회 중":"새로고침"}</button></div>
    {error&&<div className="nxNotice">{error}</div>}
    {usage&&<>
      <div className="nxUsageCards">
        <div><span>오늘 예상 사용금액</span><strong>{usd(usage.today.estimated_usd)}</strong><small>{tokens(usage.today.requests)}회 API 요청</small></div>
        <div><span>이번 달 예상 사용금액</span><strong>{usd(usage.month.estimated_usd)}</strong><small>{tokens(usage.month.requests)}회 API 요청</small></div>
        <div><span>누적 사용 토큰</span><strong>{tokens(num(usage.all.prompt_tokens)+num(usage.all.completion_tokens))}</strong><small>입력 {tokens(usage.all.prompt_tokens)} / 출력 {tokens(usage.all.completion_tokens)}</small></div>
        <div><span>누적 예상 사용금액</span><strong>{usd(usage.all.estimated_usd)}</strong><small>{tokens(usage.all.requests)}회 · 미산정 {tokens(usage.all.unknown_cost_requests)}회</small></div>
      </div>
      <div className="nxUsagePanels">
       <section className="nxPanel"><div className="nxPanelHeading"><div><h2>최근 7일 사용금액</h2><p>일별 API 사용량 · 미국 달러 USD</p></div></div>
        {usage.days.length?<div className="nxUsageBars">{usage.days.map(d=><div key={d.day} className="nxUsageBarRow"><span>{d.day.slice(5)}</span><div><div style={{width:Math.max(2,(num(d.estimated_usd)/max)*100)+"%"}}/></div><strong>{usd(d.estimated_usd)}</strong></div>)}</div>:<div className="nxEmpty">기록된 API 호출이 없습니다. AI 토론을 실행하면 여기에 집계됩니다.</div>}
       </section>
       <section className="nxPanel"><div className="nxPanelHeading"><div><h2>사용량 상세</h2><p>모먼트 스튜디오 API 요청만 집계</p></div></div>
        <div className="nxUsageDetail"><div><span>전체 입력 토큰</span><strong>{tokens(usage.all.prompt_tokens)}</strong></div><div><span>전체 출력 토큰</span><strong>{tokens(usage.all.completion_tokens)}</strong></div><div><span>캐시 입력 토큰</span><strong>{tokens(usage.all.cached_tokens)}</strong></div><div><span>전체 호출 수</span><strong>{tokens(usage.all.requests)}</strong></div></div>
       </section>
      </div>
      <section className="nxPanel"><div className="nxPanelHeading"><div><h2>계정별 사용금액</h2><p>API 호출에 사용한 계정의 키를 기준으로 집계합니다.</p></div></div><div className="nxUsageTableWrap"><table className="nxUsageTable"><thead><tr><th>API 계정</th><th>호출 횟수</th><th>총 토큰</th><th>예상 비용(USD)</th></tr></thead><tbody>{usage.accounts.length?usage.accounts.map(a=><tr key={a.account_id}><td>{a.account_id==="__server_default__"?"서버 기본 API":a.account_id}</td><td>{tokens(a.requests)}</td><td>{tokens(a.total_tokens)}</td><td>{usd(a.estimated_usd)}{a.unknown_cost_requests>0?" · 일부 미산정":""}</td></tr>):<tr><td colSpan={4}>아직 사용 기록이 없습니다.</td></tr>}</tbody></table></div></section>
      <section className="nxPanel"><div className="nxPanelHeading"><div><h2>최근 API 요청 기록</h2><p>실제 응답에서 제공된 토큰 사용량을 기록합니다.</p></div></div><div className="nxUsageTableWrap"><table className="nxUsageTable"><thead><tr><th>호출 시각</th><th>API 계정</th><th>모델</th><th>입력</th><th>출력</th><th>예상 비용</th></tr></thead><tbody>{usage.recent.length?usage.recent.map((r,i)=><tr key={r.account_id+r.created_at+i}><td>{new Date(r.created_at).toLocaleString("ko-KR")}</td><td>{r.account_id==="__server_default__"?"서버 기본":r.account_id}</td><td>{r.model}</td><td>{tokens(r.prompt_tokens)}</td><td>{tokens(r.completion_tokens)}</td><td>{r.estimated_usd===null?"미산정":usd(r.estimated_usd)}</td></tr>):<tr><td colSpan={6}>사용 기록이 없습니다.</td></tr>}</tbody></table></div></section>
      <div className="nxUsageDisclaimer"><Wallet size={19}/><p>{usage.note} 서버 밖에서 사용한 같은 API 키의 비용, OpenAI 결제 잔액, 플랫폼 전체 청구액은 조회되지 않습니다. 단가는 변경될 수 있습니다. <a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noreferrer">공식 요금표 확인 <ArrowUpRight size={12}/></a></p></div>
    </>}
   </div>}
 </div>
}
