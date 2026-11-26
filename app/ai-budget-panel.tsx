"use client";
import {useEffect,useState} from "react";
import {Save,ShieldCheck} from "lucide-react";
export default function AiBudgetPanel({accountId}:{accountId:string}){
 const [daily,setDaily]=useState("0"),[monthly,setMonthly]=useState("0"),[minute,setMinute]=useState("10");
 const [loading,setLoading]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{
  let active=true;setMessage("");
  fetch("/api/ai-budget?accountId="+encodeURIComponent(accountId),{cache:"no-store"})
   .then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||"조회 실패");return d})
   .then(d=>{if(active){setDaily(String(d.limits.daily));setMonthly(String(d.limits.monthly));setMinute(String(d.limits.per_minute))}})
   .catch(e=>{if(active)setMessage(e instanceof Error?e.message:"조회 실패")});
  return()=>{active=false};
 },[accountId]);
 async function save(){
  if(loading)return;
  setLoading(true);setMessage("");
  try{
   const r=await fetch("/api/ai-budget",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId,daily,monthly,perMinute:minute})});
   const d=await r.json();if(!r.ok)throw Error(d.error||"저장 실패");
   setMessage("이 계정의 API 사용 제한을 저장했습니다.");
  }catch(e){setMessage(e instanceof Error?e.message:"저장 실패")}
  finally{setLoading(false)}
 }
 return <section className="nxPanel nxAiBudget">
  <div className="nxPanelHeading"><div><h2>API 비용·호출 제한</h2><p>선택 계정의 예상 비용과 분당 요청 수를 제한합니다.</p></div></div>
  <div className="nxBudgetGrid">
   <label>일일 예상 사용한도 (USD)<input type="number" min={0} max={100000} step="0.01" value={daily} onChange={e=>setDaily(e.target.value)}/></label>
   <label>월간 예상 사용한도 (USD)<input type="number" min={0} max={1000000} step="0.01" value={monthly} onChange={e=>setMonthly(e.target.value)}/></label>
   <label>분당 최대 API 요청<input type="number" min={1} max={120} step={1} value={minute} onChange={e=>setMinute(e.target.value)}/></label>
  </div>
  <div className="nxBudgetActions"><button className="nxPrimary" disabled={loading} onClick={()=>void save()}><Save size={15}/>{loading?"저장 중":"계정 한도 저장"}</button><span><ShieldCheck size={14}/> 금액 0은 무제한, 호출 수는 1~120</span></div>
  <p className="nxTip">과거 기록된 API 응답의 추정 비용을 기준으로 다음 요청을 차단합니다. 동시 요청·가격 변경·OpenAI 외부 사용으로 실제 결제액이 한도를 넘을 수 있으므로 결제 플랫폼 자체의 예산 한도도 설정하세요.</p>
  {message&&<p className="nxBackupMessage" role="status">{message}</p>}
 </section>;
}
