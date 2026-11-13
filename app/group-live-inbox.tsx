"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {Check,MessageCircle,RefreshCw,Send,WifiOff} from "lucide-react";

type Persona={id:string;name:string;role:string;style:string;risk:number};
type Assignment={accountId:string;groupId:string;personaId:string;mode:"member"|"expert"|"observer"};
type InboxMessage={id:string;chat_id:string;message_id:string;sender_name:string;sender_id:string;body:string;observed_at:string};
type Outgoing={id:string;account_id:string;body:string;reply_to_message_id:string;status:string;last_error:string|null};
type Turn={speakerId:string;speaker:string;text:string};
export default function GroupLiveInbox({groupId,people,assignments}:{
 groupId:string;people:Persona[];assignments:Assignment[];
}){
 const [inbox,setInbox]=useState<InboxMessage[]>([]);
 const [outbox,setOutbox]=useState<Outgoing[]>([]);
 const [selected,setSelected]=useState("");
 const [connected,setConnected]=useState(false);
 const [loading,setLoading]=useState(false),[generating,setGenerating]=useState(false),[approving,setApproving]=useState(false);
 const [drafts,setDrafts]=useState<Turn[]>([]);
 const [draftMode,setDraftMode]=useState("");
 const [notice,setNotice]=useState("수신 메시지를 선택한 다음 AI 반응을 검토하세요.");
 const eligible=useMemo(()=>assignments.filter(a=>a.groupId===groupId&&a.mode!=="observer").flatMap(a=>{
  const p=people.find(x=>x.id===a.personaId);
  return p?[{...p,id:a.accountId+"::"+a.groupId,accountId:a.accountId,participationRole:a.mode}]:[];
 }),[groupId,assignments,people]);
 const current=inbox.find(m=>String(m.id)===selected);
 const refresh=useCallback(async()=>{
  if(!/^-?\d+$/.test(groupId)){setConnected(false);setInbox([]);setOutbox([]);setNotice("실제 Telegram 숫자형 그룹 ID를 등록해야 메시지를 조회할 수 있습니다.");return;}
  setLoading(true);
  try{
   const response=await fetch("/api/group-inbox?chatId="+encodeURIComponent(groupId),{cache:"no-store"});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||"조회 오류");
   setConnected(Boolean(data.connected));setInbox(Array.isArray(data.messages)?data.messages:[]);setOutbox(Array.isArray(data.drafts)?data.drafts:[]);
   if(!data.connected)setNotice(data.error||"그룹 연결 정보를 확인하세요.");
  }catch(e){setConnected(false);setNotice(e instanceof Error?e.message:"메시지함 조회 실패");}
  finally{setLoading(false);}
 },[groupId]);
 useEffect(()=>{setSelected("");setDrafts([]);setDraftMode("");void refresh();},[refresh]);
 async function generate(){
  if(!current||generating||eligible.length===0)return;
  setGenerating(true);setDrafts([]);setNotice("실제 그룹 발언을 바탕으로 AI 반응을 작성합니다.");
  try{
   const history=inbox.filter(m=>Number(m.id)<Number(current.id)).slice(-12).map(m=>({speaker:m.sender_name,text:m.body}));
   const response=await fetch("/api/discussion",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    topic:current.body,humanMessage:current.body,personas:eligible,history
   })});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||"AI 반응 생성 실패");
   setDrafts(Array.isArray(result.turns)?result.turns:[]);
   setDraftMode(result.mode||"");
   setNotice(result.mode==="sample"?"API 키가 없어 샘플 반응만 표시합니다. 실제 발송 승인은 불가능합니다.":result.notice||"검토 후 개별 승인할 수 있습니다.");
  }catch(e){setNotice(e instanceof Error?e.message:"반응 생성 실패")}
  finally{setGenerating(false)}
 }
 async function approve(turn:Turn,index:number){
  if(!current||draftMode!=="ai"||approving)return;
  const participant=eligible.find(p=>p.id===turn.speakerId);
  if(!participant)return;
  if(!confirm(participant.name+" 계정의 답변을 실제 텔레그램 그룹에 전송하도록 승인하시겠습니까?"))return;
  setApproving(true);
  try{
   const response=await fetch("/api/group-inbox",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    accountId:participant.accountId,chatId:groupId,messageId:Number(current.message_id),text:turn.text
   })});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||"전송 승인 실패");
   setDrafts(old=>old.filter((_,i)=>i!==index));
   setNotice("발송 승인 완료. 연결된 계정 워커가 대기열에서 가져가면 전송합니다.");
   await refresh();
  }catch(e){setNotice(e instanceof Error?e.message:"승인 실패")}
  finally{setApproving(false);}
 }
 return <section className="nxPanel nxUnderPanel">
  <div className="nxPanelHeading"><div><h2>그룹 실시간 메시지함</h2><p>사람이 작성한 원본 메시지를 보고, AI 반응을 검토한 뒤 승인합니다.</p></div><button onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/>{loading?"확인 중":"새로고침"}</button></div>
  <div className="nxLiveState">{connected?<span className="nxLiveReady"><Check size={14}/> 수신 저장소 준비됨</span>:<span><WifiOff size={14}/> 그룹 연결 미설정</span>}<small>수신 저장소 준비 여부가 텔레그램 계정 연결을 보장하지는 않습니다.</small></div>
  <div className="nxLiveGrid">
   <div className="nxLiveList"><h3>실제 그룹 수신 메시지 <small>{inbox.length}개</small></h3>
    {inbox.length?inbox.map(m=><button className={"nxLiveItem "+(selected===String(m.id)?"selected":"")} key={m.id} onClick={()=>{setSelected(String(m.id));setDrafts([]);setDraftMode("");}}>
      <strong>{m.sender_name||"참여자"}</strong><time>{new Date(m.observed_at).toLocaleString("ko-KR")}</time><p>{m.body}</p>
    </button>):<div className="nxEmpty">아직 수신된 메시지가 없습니다. 계정 워커와 실제 그룹을 연결해야 표시됩니다.</div>}
   </div>
   <div className="nxLiveDetail">
     <h3>AI 반응 검토</h3>
     {current?<><div className="nxSource"><strong>{current.sender_name||"참여자"}의 발언</strong><p>{current.body}</p></div>
       <button className="nxPrimary" disabled={generating||eligible.length===0} onClick={generate}><MessageCircle size={15}/>{generating?"반응 생성 중":"이 발언에 AI 반응 생성"}</button>
       {drafts.map((turn,index)=><div key={turn.speakerId+index} className="nxDraft"><strong>{turn.speaker}</strong><p>{turn.text}</p><button disabled={approving||draftMode!=="ai"} onClick={()=>approve(turn,index)}><Send size={14}/> 개별 전송 승인</button></div>)}
       {drafts.length===0&&<p className="nxTip">생성된 답변이 없거나 아직 반응을 생성하지 않았습니다.</p>}
     </>:<div className="nxEmpty">왼쪽의 메시지를 선택하세요.</div>}
   </div>
  </div>
  <div className="nxQueue"><strong>전송 처리 기록</strong>{outbox.length?outbox.slice(0,10).map(m=><div key={m.id}><span>{m.account_id}</span><span>{m.body.slice(0,100)}</span><small>{m.status==="pending"?"전송 대기":m.status==="sending"?"전송 처리 중":m.status==="sent"?"전송 완료":m.status==="failed"?"전송 실패":"취소"}</small></div>):<p className="nxTip">승인된 메시지가 없습니다.</p>}</div>
  <p className="nxTip" role="status">{notice}</p>
 </section>;
}
