"use client";
import {useCallback,useEffect,useState} from "react";
import {Activity,CheckCircle2,MessageCircle,PauseCircle,PlayCircle,RefreshCw,ShieldCheck,WifiOff} from "lucide-react";

type InboxMessage={id:string;chat_id:string;message_id:string;sender_name:string;body:string;observed_at:string};
type Outgoing={id:string;account_id:string;body:string;status:string;last_error:string|null};
type Runtime={chatId:string;enabled:boolean;disclosureConfirmed:boolean;intervalSeconds:number;lastError:string|null;lastGeneratedAt:string|null};
const stateLabel=(s:string)=>s==="pending"?"발송 대기":s==="sending"?"발송 중":s==="sent"?"전송 완료":s==="failed"?"전송 확인 필요":s==="cancelled"?"취소됨":s;
export default function GroupLiveInbox({groupId}:{groupId:string}){
 const [messages,setMessages]=useState<InboxMessage[]>([]);
 const [outbox,setOutbox]=useState<Outgoing[]>([]);
 const [workers,setWorkers]=useState<{account_id:string;online:boolean;last_seen:string}[]>([]);
 const [runtime,setRuntime]=useState<Runtime|null>(null);
 const [disclosure,setDisclosure]=useState(false);
 const [loading,setLoading]=useState(false),[working,setWorking]=useState(false);
 const [notice,setNotice]=useState("");
 const valid=/^-?\d+$/.test(groupId);
 const refresh=useCallback(async(visual=false)=>{
  if(!/^-?\d+$/.test(groupId)){setMessages([]);setOutbox([]);setWorkers([]);setRuntime(null);return;}
  if(visual)setLoading(true);
  try{
   const [one,two]=await Promise.all([
    fetch("/api/group-inbox?chatId="+encodeURIComponent(groupId),{cache:"no-store"}),
    fetch("/api/auto-conversation?chatId="+encodeURIComponent(groupId),{cache:"no-store"})
   ]);
   const inbox=await one.json(),operation=await two.json();
   if(!one.ok)throw Error(inbox.error||"메시지함 조회 실패");
   if(!two.ok)throw Error(operation.error||"자동 운영 상태 조회 실패");
   setMessages(Array.isArray(inbox.messages)?inbox.messages:[]);
   setOutbox(Array.isArray(inbox.drafts)?inbox.drafts:[]);
   setWorkers(Array.isArray(inbox.workers)?inbox.workers:[]);
   setRuntime(operation);
   setNotice(old=>old.startsWith("운영 상태")?"":old);
  }catch(e){if(visual)setNotice(e instanceof Error?e.message:"서버 연결 확인 실패");}
  finally{if(visual)setLoading(false);}
 },[groupId]);
 useEffect(()=>{setDisclosure(false);setNotice("");void refresh(true);const timer=setInterval(()=>{void refresh(false)},8000);return()=>clearInterval(timer)},[refresh]);
 async function change(enabled:boolean){
  if(!valid||working)return;
  if(enabled&&!disclosure){setNotice("시작하려면 먼저 그룹 안내나 계정 프로필에 AI 운영 사실을 표시하고 아래 항목을 확인하세요.");return;}
  setWorking(true);setNotice("운영 상태를 변경하는 중입니다.");
  try{
   const response=await fetch("/api/auto-conversation",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({chatId:groupId,enabled,disclosureConfirmed:enabled?disclosure:false,intervalSeconds:runtime?.intervalSeconds||60})
   });
   const result=await response.json();
   if(!response.ok)throw Error(result.error||"상태 변경 실패");
   setRuntime(result);
   setNotice(enabled?"자동 대화가 시작됐습니다. 지금부터 들어오는 사람의 새 메시지에 문맥을 고려해 반응합니다.":"자동 대화를 정지했습니다. 아직 발송 대기 중인 자동 응답은 취소합니다.");
   await refresh(false);
  }catch(e){setNotice(e instanceof Error?e.message:"상태 변경 실패");}
  finally{setWorking(false);}
 }
 const online=workers.filter(w=>w.online);
 return <section className="nxPanel nxUnderPanel nxAutoConversation">
  <div className="nxPanelHeading"><div><h2>그룹 자동 대화</h2><p>일반 회원이 작성한 실제 메시지 흐름을 분석하고 필요한 경우 자동으로 반응합니다.</p></div>
   <button disabled={loading||working} onClick={()=>void refresh(true)}><RefreshCw size={15}/>{loading?"조회 중":"새로고침"}</button></div>
  <div className="nxAutoHero">
   <div className="nxAutoHeroHead">
    <div className={"nxAutoStatus "+(runtime?.enabled?"running":"stopped")}>
     {runtime?.enabled?<Activity size={18}/>:<PauseCircle size={18}/>}
     <span>{runtime?.enabled?"자동 대화 작동 중":"자동 대화 정지"}</span>
    </div>
    <span className="nxAutoOnline">{online.length? <CheckCircle2 size={14}/>:<WifiOff size={14}/>} 실제 연결 계정 {online.length}개</span>
   </div>
   <p>새로 들어오는 사람의 메시지만 처리하며, AI 계정끼리 주고받는 자동 대화는 생성하지 않습니다. 답글(인용)이 아닌 일반 메시지로 전송합니다.</p>
   {!runtime?.enabled&&<label className="nxAutoDisclosure"><input type="checkbox" checked={disclosure} onChange={e=>setDisclosure(e.target.checked)}/><span>그룹 안내 또는 계정 프로필에 AI 자동 참여 사실을 표시했습니다.</span></label>}
   <div className="nxAutoControls">
    {runtime?.enabled?
     <button className="nxAutoStop" disabled={working} onClick={()=>void change(false)}><PauseCircle size={18}/> {working?"처리 중":"작동 정지"}</button>:
     <button className="nxAutoStart" disabled={!valid||working||!disclosure} onClick={()=>void change(true)}><PlayCircle size={18}/> {working?"처리 중":"작동 시작"}</button>
    }
    <span>최소 반응 간격 {runtime?.intervalSeconds??60}초 · 시작 이전 메시지 소급 발송 없음</span>
   </div>
  </div>
  {runtime?.lastError&&<div className="nxAutoError" role="alert">최근 AI 처리 오류: {runtime.lastError}</div>}
  {notice&&<div className="nxAutoNotice" role="status">{notice}</div>}
  <div className="nxAutoHistory">
   <div className="nxAutoColumn"><h3>실제 그룹 수신 메시지 <small>{messages.length}건</small></h3>
    {messages.length?messages.slice(-15).reverse().map(m=><div className="nxAutoRecord" key={m.id}><strong>{m.sender_name||"참여자"} <time>{new Date(m.observed_at).toLocaleString("ko-KR")}</time></strong><p>{m.body}</p></div>):<p className="nxEmpty">새로 수신된 메시지가 없습니다. 연결 계정과 그룹 배정을 확인하세요.</p>}
   </div>
   <div className="nxAutoColumn"><h3>AI 전송 기록 <small>{outbox.length}건</small></h3>
    {outbox.length?outbox.slice(0,15).map(m=><div className="nxAutoRecord" key={m.id}>
     <strong>{m.account_id}<span className={"nxAutoSendStatus "+m.status}>{stateLabel(m.status)}</span></strong>
     <p>{m.body}</p>{m.last_error&&<small>{m.last_error}</small>}
    </div>):<p className="nxEmpty">아직 전송 기록이 없습니다. 작동 시작 후 새 그룹 메시지에 반응하면 이곳에 표시됩니다.</p>}
   </div>
  </div>
  <div className="nxAutoHelp"><ShieldCheck size={16}/><span>AI 계정임을 그룹에 명확히 안내한 뒤 이용하세요. 실제 시세나 수익을 꾸며내지 않고, AI 반응은 사람의 발언에 기반해 생성됩니다. 반복 발송·중복 응답·예산 초과를 제한합니다.</span></div>
 </section>;
}
