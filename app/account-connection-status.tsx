"use client";
import {useEffect,useState} from "react";
import {Activity,CheckCircle2,RefreshCw,WifiOff} from "lucide-react";
type Info={registered:boolean;assigned:number;apiReady:boolean;sessionSaved:boolean;connected:boolean;chats:{groupId:string;online:boolean;lastSeen:string}[];state:string;error?:string};
export default function AccountConnectionStatus({accountId}:{accountId:string}){
 const [info,setInfo]=useState<Info|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function refresh(){
  setBusy(true);setError("");
  try{const r=await fetch("/api/connection-status?accountId="+encodeURIComponent(accountId),{cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"조회 실패");setInfo(d)}
  catch(e){setError(e instanceof Error?e.message:"조회 실패")}
  finally{setBusy(false)}
 }
 useEffect(()=>{setInfo(null);void refresh();const timer=setInterval(()=>{void refresh()},30000);return()=>clearInterval(timer)},[accountId]);
 const state=info?.state==="online"?"텔레그램 연결됨":info?.state==="session_missing"?"로그인 필요":info?.state==="not_saved"?"서버에 계정 저장 필요":info?.state==="group_not_assigned"?"그룹 배정 필요":"연결 확인 필요";
 return <section className="nxConnectionSummary">
  <div className="nxConnectionHeader"><strong><Activity size={15}/> 실제 계정 연결 상태</strong><button disabled={busy} onClick={()=>void refresh()}><RefreshCw size={14}/> {busy?"확인 중":"다시 확인"}</button></div>
  {info&&<><div className="nxConnectionState">{info.connected?<CheckCircle2 size={18}/>:<WifiOff size={18}/>}<b>{state}</b></div>
   <div className="nxConnectionDetails"><span>API 설정 <b>{info.apiReady?"완료":"필요"}</b></span><span>로그인 세션 <b>{info.sessionSaved?"저장됨":"미등록"}</b></span><span>서버 그룹 배정 <b>{info.assigned}개</b></span><span>실제 연결 그룹 <b>{info.chats.filter(c=>c.online).length}개</b></span></div>
   {info.chats.length>0&&<p>최근 연결: {info.chats[0].groupId} · {new Date(info.chats[0].lastSeen).toLocaleString("ko-KR")}</p>}
  </>}
  {error&&<p role="status">{error}</p>}
  <small>서버 구동 여부와 실제 텔레그램 계정 연결은 다릅니다. 최근 90초 내 워커 활동이 있을 때 연결로 표시합니다.</small>
 </section>
}
