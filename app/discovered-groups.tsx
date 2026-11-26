"use client";
import {useEffect,useState} from "react";
import {Check,RefreshCw,Users,ShieldAlert} from "lucide-react";
type Found={accountId:string;id:string;name:string;detectedAt:string;allowed:boolean};
export default function DiscoveredGroups({existing,onAdd}:{existing:string[];onAdd:(group:{id:string;name:string})=>void}){
 const [groups,setGroups]=useState<Found[]>([]),[loading,setLoading]=useState(false),[notice,setNotice]=useState("");
 async function refresh(){
  setLoading(true);setNotice("");
  try{const r=await fetch("/api/discovered-groups",{cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"그룹 조회 실패");setGroups(Array.isArray(d.groups)?d.groups:[])}
  catch(e){setNotice(e instanceof Error?e.message:"조회 실패")}finally{setLoading(false)}
 }
 useEffect(()=>{void refresh()},[]);
 const unique=[...new Map(groups.map(g=>[g.id,g])).values()];
 return <section className="nxDiscoveredGroups">
  <div className="nxPanelHeading"><div><h2>텔레그램에서 찾은 그룹</h2><p>연결된 계정이 참여한 그룹을 자동으로 확인합니다.</p></div><button onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/>{loading?"확인 중":"새로고침"}</button></div>
  {unique.length?unique.map(g=><div key={g.id} className="nxDiscoverRow">
   <span className="nxAvatar nxGroupAvatar"><Users size={17}/></span><div><strong>{g.name}</strong><small>{g.id} · 감지 계정 {g.accountId}</small></div>
   <span className={g.allowed?"nxCredentialOn":"nxCredentialOff"}>{g.allowed?"허용 그룹":"미허용"}</span>
   <button disabled={existing.includes(g.id)||!g.allowed} onClick={()=>onAdd({id:g.id,name:g.name})}>{existing.includes(g.id)?<><Check size={14}/> 등록됨</>:g.allowed?"그룹 등록":"허용 필요"}</button>
  </div>):<div className="nxEmpty">아직 탐지된 그룹이 없습니다. 텔레그램 계정 로그인 후 그룹 목록을 새로고침하세요.</div>}
  <div className="nxGlobalInfo"><ShieldAlert size={16}/><p>그룹이 발견되어도 자동 참여나 전송은 시작하지 않습니다. Railway의 TELEGRAM_ALLOWED_CHAT_IDS에 포함된 그룹만 등록·발송할 수 있으며, 기존 계정 배정도 유지됩니다.</p></div>
  {notice&&<p className="nxTip">{notice}</p>}
 </section>
}
