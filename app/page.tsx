"use client";
import { useEffect, useMemo, useState } from "react";
import { Activity, BrainCircuit, CircleStop, LayoutDashboard, MessagesSquare, Play, Plus, Settings2, ShieldCheck, Trash2, Users, Wallet, X } from "lucide-react";

type Persona = { id:string; name:string; role:string; style:string; risk:number };
type Group = {id:string; name:string};
type Message = {id:string;groupId:string;speakerId:string;speaker:string;text:string;at:string};
type Tab = "dashboard"|"personas"|"groups"|"discussion"|"settings";
const seedPeople: Persona[] = [
 {id:"p1",name:"김실장",role:"기술적 분석",style:"차트, 거래량, 지지저항을 중심으로 말한다. 냉정하고 간결하다.",risk:45},
 {id:"p2",name:"박대표",role:"가치투자",style:"실적과 기업가치를 중심으로 신중하고 점잖게 논의한다.",risk:30},
 {id:"p3",name:"정대리",role:"단기매매",style:"거래량과 수급에 민감하며 직설적으로 질문한다.",risk:70},
 {id:"p4",name:"최팀장",role:"위험관리",style:"위험과 손절 조건을 꼭 짚되 불필요한 반대는 하지 않는다.",risk:20},
 {id:"p5",name:"이과장",role:"시장 뉴스",style:"경제와 산업 흐름을 근거로 균형 있게 설명한다.",risk:50}
];
const seedGroups:Group[]=[{id:"demo-private",name:"비공개 테스트 그룹"}];
function id(){return Math.random().toString(36).slice(2)+Date.now().toString(36);}
function load<T>(key:string,fallback:T):T {try {const data=localStorage.getItem(key);return data?JSON.parse(data) as T:fallback;} catch{return fallback;}}
export default function Home(){
 const [ready,setReady]=useState(false);
 const [tab,setTab]=useState<Tab>("dashboard");
 const [people,setPeople]=useState<Persona[]>(seedPeople);
 const [groups,setGroups]=useState<Group[]>(seedGroups);
 const [messages,setMessages]=useState<Message[]>([]);
 const [activeGroup,setActiveGroup]=useState("demo-private");
 const [topic,setTopic]=useState("오늘 삼성전자 흐름과 다음 거래일에 확인할 변수");
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("실제 텔레그램 전송은 비활성화되어 있습니다. 비공개 시뮬레이션 환경입니다.");
 const [editing,setEditing]=useState<Persona|null>(null);
 const [newGroupName,setNewGroupName]=useState("");
 const [newGroupId,setNewGroupId]=useState("");
 useEffect(()=>{setPeople(load("ace.people",seedPeople));setGroups(load("ace.groups",seedGroups));setMessages(load("ace.messages",[]));setActiveGroup(load("ace.activeGroup","demo-private"));setReady(true);},[]);
 useEffect(()=>{if(ready){localStorage.setItem("ace.people",JSON.stringify(people));localStorage.setItem("ace.groups",JSON.stringify(groups));localStorage.setItem("ace.messages",JSON.stringify(messages.slice(-500)));localStorage.setItem("ace.activeGroup",JSON.stringify(activeGroup));}},[ready,people,groups,messages,activeGroup]);
 const current=useMemo(()=>messages.filter(m=>m.groupId===activeGroup),[messages,activeGroup]);
 const group=groups.find(g=>g.id===activeGroup);
 function savePersona(p:Persona){setPeople(old=>old.some(x=>x.id===p.id)?old.map(x=>x.id===p.id?p:x):[...old,p]);setEditing(null);}
 function addGroup(){const name=newGroupName.trim();const identifier=newGroupId.trim()||"local-"+id();if(!name)return; if(groups.some(g=>g.id===identifier)){setNotice("이미 등록된 그룹 ID입니다.");return;}setGroups(old=>[...old,{id:identifier,name}]);setActiveGroup(identifier);setNewGroupName("");setNewGroupId("");setNotice("로컬 시뮬레이션 그룹이 추가되었습니다. 텔레그램 연결은 아직 구현되지 않았습니다.");}
 async function discuss(){
  if(busy||people.length<2)return;setBusy(true);setNotice("서버에서 토론을 생성하고 있습니다.");
  try {
   const res=await fetch("/api/discussion",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic,personas:people,history:current.slice(-16)})});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error||"대화 생성 실패");
   const newMessages:Message[]=data.turns.map((t:{speaker:string;speakerId:string;text:string})=>({id:id(),groupId:activeGroup,speaker:t.speaker,speakerId:t.speakerId,text:t.text,at:new Date().toISOString()}));
   setMessages(old=>[...old,...newMessages].slice(-500));setNotice(data.notice||"시뮬레이션을 생성했습니다.");
  }catch(e){setNotice(e instanceof Error?e.message:"오류가 발생했습니다.");}finally{setBusy(false);}
 }
 const nav:[Tab,string,React.ReactNode][]=[["dashboard","대시보드",<LayoutDashboard key="d" size={18}/>],["personas","AI 페르소나",<Users key="p" size={18}/>],["groups","그룹 관리",<MessagesSquare key="g" size={18}/>],["discussion","토론 운영실",<BrainCircuit key="t" size={18}/>],["settings","시스템 안내",<Settings2 key="s" size={18}/>]];
 return <div className="shell">
  <aside className="sidebar"><div className="brand"><span className="brandIcon"><BrainCircuit size={22}/></span><span><b>AI COMMUNITY</b><small>ENGINE CONTROL CENTER</small></span></div>
   <div className="navLabel">운영 메뉴</div><nav>{nav.map(([key,label,icon])=><button key={key} className={"navItem "+(tab===key?"selected":"")} onClick={()=>setTab(key)}>{icon}{label}</button>)}</nav>
   <div className="sideBottom"><span className="greenDot"/>시뮬레이션 모드 <small>v0.1 · 로컬 데이터</small></div></aside>
  <main className="main"><header className="top"><span className="breadcrumb">운영센터 <span>/</span> {nav.find(n=>n[0]===tab)?.[1]}</span><span className="pill"><ShieldCheck size={14}/> 비공개 테스트</span></header>
  <div className="content">
   <div className="pageTitle"><div><h1>{nav.find(n=>n[0]===tab)?.[1]}</h1><p>독립 페르소나와 공동 기억으로 운영하는 AI 투자 토론 시뮬레이션</p></div></div>
   {tab==="dashboard"&&<><div className="stats"><div className="stat"><span>등록 AI 전문가</span><strong>{people.length}</strong><small>페르소나 개별 설정</small></div><div className="stat"><span>시뮬레이션 그룹</span><strong>{groups.length}</strong><small>그룹별 대화 기록 분리</small></div><div className="stat"><span>생성된 발언</span><strong>{messages.length}</strong><small>브라우저에만 저장</small></div><div className="stat"><span>외부 전송</span><strong>OFF</strong><small>텔레그램 미연결</small></div></div><section className="panel"><div className="panelHeading"><h2>빠른 실행</h2><span className="muted">테스트 환경에서만 생성됩니다</span></div><div className="quick"><button className="primary" onClick={()=>setTab("discussion")}><Play size={16}/> 새 토론 시작</button><button onClick={()=>{setTab("personas");setEditing({id:id(),name:"",role:"",style:"",risk:50});}}><Plus size={16}/> 전문가 추가</button><button onClick={()=>setTab("groups")}><MessagesSquare size={16}/> 그룹 관리</button></div></section><section className="panel"><div className="panelHeading"><h2>최근 토론</h2></div>{messages.length?messages.slice(-5).reverse().map(m=><div key={m.id} className="recent"><b>{m.speaker}</b><span>{m.text}</span></div>):<p className="empty">아직 토론 기록이 없습니다. 토론 운영실에서 시작하세요.</p>}</section></>}
   {tab==="personas"&&<><div className="actionRow"><p className="muted">모든 페르소나의 역할과 말투를 직접 조정할 수 있습니다.</p><button className="primary" onClick={()=>setEditing({id:id(),name:"",role:"",style:"",risk:50})}><Plus size={16}/> AI 전문가 생성</button></div><div className="personaGrid">{people.map((p,i)=><div className="personaCard" key={p.id}><div className="personaHead"><div className="avatar">{p.name.slice(0,1)}</div><div><b>{p.name}</b><small>{p.role||"분야 미설정"}</small></div></div><p>{p.style||"상세 성향을 입력해주세요."}</p><div className="risk"><span>공격 성향</span><b>{p.risk}/100</b></div><div className="riskTrack"><span style={{width:p.risk+"%"}}/></div><div className="cardActions"><button onClick={()=>setEditing(p)}>수정</button><button onClick={()=>setPeople(old=>[...old,{...p,id:id(),name:p.name+" 복제"}])}>복제</button><button className="danger" onClick={()=>{if(confirm("이 페르소나를 삭제할까요?"))setPeople(old=>old.filter(x=>x.id!==p.id));}}><Trash2 size={14}/></button></div></div>)}</div></>}
   {tab==="groups"&&<><section className="panel"><div className="panelHeading"><h2>시뮬레이션 그룹 등록</h2></div><div className="formRow"><label>그룹 이름<input value={newGroupName} onChange={e=>setNewGroupName(e.target.value)} placeholder="예: 투자 토론 테스트 A"/></label><label>그룹 ID (선택)<input value={newGroupId} onChange={e=>setNewGroupId(e.target.value)} placeholder="미입력 시 로컬 ID 생성"/></label><button className="primary" onClick={addGroup}><Plus size={16}/> 그룹 추가</button></div><p className="hint">실제 Telegram 그룹 ID를 입력해도 연결·전송되지 않습니다.</p></section><section className="panel"><div className="panelHeading"><h2>그룹 목록</h2></div>{groups.map(g=><div className="groupLine" key={g.id}><div><b>{g.name}</b><small>{g.id}</small></div><div className="lineActions"><button onClick={()=>{setActiveGroup(g.id);setTab("discussion");}}>토론 열기</button><button className="danger" disabled={groups.length===1} onClick={()=>{if(confirm("그룹과 로컬 토론 기록을 삭제할까요?")){setGroups(old=>old.filter(x=>x.id!==g.id));setMessages(old=>old.filter(x=>x.groupId!==g.id));if(activeGroup===g.id)setActiveGroup(groups.find(x=>x.id!==g.id)?.id||"");}}}><Trash2 size={16}/></button></div></div>)}</section></>}
   {tab==="discussion"&&<div className="discussionLayout"><section className="panel compose"><div className="panelHeading"><h2>토론 설정</h2><span className="pill">시뮬레이션 전용</span></div><label>대상 그룹<select value={activeGroup} onChange={e=>setActiveGroup(e.target.value)}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label><label>오늘의 토론 주제<textarea value={topic} onChange={e=>setTopic(e.target.value)} rows={4} maxLength={180}/></label><div className="miniLabel">참여 AI 전문가 <strong>{people.length}명</strong></div><div className="participants">{people.map(p=><span key={p.id}>{p.name}</span>)}</div><button disabled={busy||people.length<2||!topic.trim()} className="primary wide" onClick={discuss}><Play size={16}/>{busy?"생성 중...":"AI 토론 생성"}</button><button className="wide" disabled={busy||!current.length} onClick={()=>{if(confirm("이 그룹의 시뮬레이션 대화 기록을 초기화할까요?"))setMessages(old=>old.filter(m=>m.groupId!==activeGroup));}}><CircleStop size={16}/> 대화 기록 초기화</button><p className="hint">AI 생성은 서버 API로 처리됩니다. 설정된 모델이 없으면 샘플 대화가 표시됩니다.</p></section><section className="panel chat"><div className="panelHeading"><div><h2>{group?.name||"그룹 미선택"}</h2><span className="muted">그룹 독립 기록 · {current.length}개 메시지</span></div><Activity size={17} color="#8aa0b6"/></div><div className="chatScroll">{current.length?current.map(m=><article className="bubbleRow" key={m.id}><div className="avatar small">{m.speaker.slice(0,1)}</div><div className="bubble"><div className="bubbleHead"><b>{m.speaker}</b><small>{new Date(m.at).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})}</small></div><p>{m.text}</p></div></article>):<div className="chatEmpty"><BrainCircuit size={34}/><strong>아직 토론이 시작되지 않았습니다</strong><span>좌측에서 주제를 설정하고 토론을 생성하세요.</span></div>}</div></section></div>}
   {tab==="settings"&&<div className="settingsGrid"><section className="panel"><div className="panelHeading"><h2>현재 구현 상태</h2></div><div className="statusLine"><ShieldCheck size={18}/> 페르소나 생성·수정·복제 <b>구현</b></div><div className="statusLine"><ShieldCheck size={18}/> 그룹별 시뮬레이션 기록 <b>구현</b></div><div className="statusLine"><ShieldCheck size={18}/> 서버 AI 토론 생성 <b>구현</b></div><div className="statusLine"><Wallet size={18}/> 영구 DB·다중 관리자 <b>미구현</b></div><div className="statusLine"><MessagesSquare size={18}/> 텔레그램 연결·전송 <b>미구현</b></div></section><section className="panel"><div className="panelHeading"><h2>개발 환경 안내</h2></div><p className="hint">OPENAI_API_KEY를 서버에 설정하면 실제 AI 생성 API를 사용합니다. 키가 없다면 샘플 대화만 생성합니다. 현재 대화 기록은 브라우저 저장소에 보관되며 다른 기기와 동기화되지 않습니다.</p><p className="hint">실시간 주식 시세 및 실제 매매 정보는 아직 연결되지 않았습니다. 생성된 분석은 투자 권유나 검증된 전망이 아닙니다.</p></section></div>}
   <div className="notice">{notice}</div>
  </div></main>
  {editing&&<div className="modalBackdrop" onClick={()=>setEditing(null)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="panelHeading"><h2>AI 페르소나 설정</h2><button className="iconButton" onClick={()=>setEditing(null)}><X size={19}/></button></div><label>이름<input value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})} maxLength={60}/></label><label>전문 분야<input value={editing.role} onChange={e=>setEditing({...editing,role:e.target.value})} maxLength={120}/></label><label>말투·행동 지침<textarea rows={5} value={editing.style} onChange={e=>setEditing({...editing,style:e.target.value})} maxLength={400}/></label><label>공격적인 투자 성향: {editing.risk}/100<input type="range" min="0" max="100" value={editing.risk} onChange={e=>setEditing({...editing,risk:Number(e.target.value)})}/></label><div className="modalActions"><button onClick={()=>setEditing(null)}>취소</button><button className="primary" disabled={!editing.name.trim()} onClick={()=>savePersona({...editing,name:editing.name.trim()})}>저장</button></div></div></div>}
 </div>;
}
