"use client";
import {useEffect,useMemo,useState} from "react";
import {Activity,ArrowRight,BookOpen,BrainCircuit,Check,ChevronDown,CircleHelp,ClipboardList,Copy,MessageCircle,Play,Plus,Save,Settings2,ShieldCheck,SlidersHorizontal,Trash2,Users,WifiOff,X} from "lucide-react";

type Persona={id:string;name:string;role:string;style:string;risk:number};
type Group={id:string;name:string};
type Account={id:string;name:string;note:string;enabled:boolean};
type Assignment={accountId:string;groupId:string;personaId:string;mode:"expert"|"member"|"observer"};
type Message={id:string;groupId:string;speakerId:string;speaker:string;text:string;at:string};
type View="assign"|"test"|"overview";
const seedPeople:Persona[]=[
 {id:"p1",name:"김실장",role:"기술적 분석",style:"추세와 거래량에 집중한다. 자료가 부족하면 단정하지 않는다. 차분하고 짧게 이야기한다.",risk:40},
 {id:"p2",name:"박대표",role:"가치투자",style:"기업 실적을 중시하며 상대의 의견을 경청한다. 신중한 말투를 사용한다.",risk:30},
 {id:"p3",name:"정대리",role:"일반 회원 · 질문형",style:"전문용어가 나오면 쉬운 표현으로 다시 묻는다. 대화에 도움이 되는 짧은 질문만 한다.",risk:45},
 {id:"p4",name:"최팀장",role:"일반 회원 · 관망형",style:"필요한 순간에만 조심스럽게 반응하며 손실 가능성을 묻는다.",risk:20},
 {id:"p5",name:"이과장",role:"일반 회원 · 공감형",style:"다른 사람의 의견을 이해하고 짧게 공감하거나 새로운 질문을 던진다.",risk:50}
];
const preset=[
 {name:"초보 질문형",role:"일반 회원 · 질문형",style:"전문가 행세를 하지 않고 잘 모르는 용어를 짧게 질문한다. 같은 질문은 반복하지 않는다.",risk:25},
 {name:"직장인 관망형",role:"일반 회원 · 관망형",style:"직장인처럼 여유가 없고 신중하다. 모든 대화에 끼어들지 않고 판단 근거가 궁금할 때만 짧게 묻는다.",risk:20},
 {name:"경험 나눔형",role:"일반 회원 · 경험형",style:"자신의 실제 거래나 수익을 꾸며내지 않는다. 일반적인 투자 경험과 관점을 공유하고 다른 사람 의견에 반응한다.",risk:50},
 {name:"활발한 질문형",role:"일반 회원 · 활발형",style:"친근한 대화체로 질문하며 때때로 분석의 빈틈을 묻는다. 의미 없는 추임새는 피한다.",risk:65},
 {name:"전문 트레이더",role:"트레이더 · 전문형",style:"실제 시세의 기준 시각과 근거를 확인한 뒤 시장을 분석한다. 확정적 수익 약속을 하지 않는다.",risk:55}
];
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function read<T>(key:string,defaults:T):T{try{const s=localStorage.getItem(key);return s?JSON.parse(s) as T:defaults}catch{return defaults}}
function makeStyle(note:string){const s=note.trim();if(!s)return "";const clauses=[s,"텔레그램 그룹의 직전 대화에 맞춰 반응한다.","주제에 보탤 말이 없으면 발언하지 않는다.","실제 거래·수익을 한 것처럼 꾸며 말하지 않는다.","동일한 질문이나 단순 동의를 반복하지 않는다."];return clauses.join(" ")}
export default function Studio(){
 const [hydrated,setHydrated]=useState(false);
 const [view,setView]=useState<View>("assign");
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [groups,setGroups]=useState<Group[]>([{id:"demo-private",name:"비공개 테스트 그룹"}]);
 const [people,setPeople]=useState<Persona[]>(seedPeople);
 const [assignments,setAssignments]=useState<Assignment[]>([]);
 const [messages,setMessages]=useState<Message[]>([]);
 const [account,setAccount]=useState("");
 const [groupId,setGroupId]=useState("demo-private");
 const [personaId,setPersonaId]=useState("p3");
 const [mode,setMode]=useState<Assignment["mode"]>("member");
 const [newAccount,setNewAccount]=useState("");
 const [newGroup,setNewGroup]=useState("");
 const [newGroupId,setNewGroupId]=useState("");
 const [filter,setFilter]=useState("");
 const [editing,setEditing]=useState<Persona|null>(null);
 const [simpleNote,setSimpleNote]=useState("");
 const [topic,setTopic]=useState("오늘 삼성전자 흐름과 다음 거래일에 확인할 조건");
 const [traderMessage,setTraderMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [generationMode,setGenerationMode]=useState("none");
 useEffect(()=>{
   setAccounts(read("ace.accounts",[]));setGroups(read("ace.groups",[{id:"demo-private",name:"비공개 테스트 그룹"}]));setPeople(read("ace.people",seedPeople));
   setAssignments(read("ace.assignments",[]));setMessages(read("ace.messages",[]));
   setGroupId(read("ace.activeGroup","demo-private"));setHydrated(true);
 },[]);
 useEffect(()=>{if(!hydrated)return;
  localStorage.setItem("ace.accounts",JSON.stringify(accounts));
  localStorage.setItem("ace.groups",JSON.stringify(groups));localStorage.setItem("ace.people",JSON.stringify(people));
  localStorage.setItem("ace.assignments",JSON.stringify(assignments));localStorage.setItem("ace.messages",JSON.stringify(messages.slice(-400)));
  localStorage.setItem("ace.activeGroup",JSON.stringify(groupId));
 },[hydrated,accounts,groups,people,assignments,messages,groupId]);
 const selected=assignments.find(a=>a.accountId===account&&a.groupId===groupId);
 const members=assignments.filter(a=>a.groupId===groupId);
 const active=useMemo(()=>{const ids=new Set(members.filter(a=>a.mode!=="observer").map(a=>a.personaId));return people.filter(p=>ids.has(p.id))},[members,people]);
 const history=messages.filter(m=>m.groupId===groupId);
 const counter={accounts:accounts.length,groups:groups.length,assigned:assignments.length,ready:members.length};
 function selectAccount(id:string){setAccount(id);const a=assignments.find(x=>x.accountId===id&&x.groupId===groupId);if(a){setPersonaId(a.personaId);setMode(a.mode)}}
 function selectGroup(id:string){setGroupId(id);const a=assignments.find(x=>x.accountId===account&&x.groupId===id);if(a){setPersonaId(a.personaId);setMode(a.mode)}}
 function registerAccount(){const name=newAccount.trim();if(!name)return;if(accounts.some(a=>a.id===name)){setNotice("이미 등록된 계정 이름입니다.");return}setAccounts(a=>[...a,{id:name,name,note:"테스트 계정 · 실제 세션 미연결",enabled:true}]);setAccount(name);setNewAccount("");setNotice(name+" 테스트 계정을 추가했습니다. 실제 텔레그램 계정과는 연결되지 않았습니다.")}
 function registerGroup(){const name=newGroup.trim();if(!name)return;const id=newGroupId.trim()||"local-"+uid();if(groups.some(g=>g.id===id)){setNotice("이미 존재하는 그룹 ID입니다.");return}setGroups(a=>[...a,{id,name}]);setGroupId(id);setNewGroup("");setNewGroupId("");setNotice("로컬 테스트 그룹을 추가했습니다.")}
 function assign(){if(!account||!groupId||!personaId)return;setAssignments(old=>[...old.filter(a=>!(a.accountId===account&&a.groupId===groupId)),{accountId:account,groupId,personaId,mode}]);setNotice("적용 완료: "+account+" → "+(groups.find(g=>g.id===groupId)?.name||groupId)+" → "+(people.find(p=>p.id===personaId)?.name||personaId))}
 function createPersona(){setSimpleNote("");setEditing({id:uid(),name:"",role:"일반 회원 · 질문형",style:"",risk:45})}
 function editPersona(p:Persona){setEditing({...p});setSimpleNote("")}
 function savePersona(){if(!editing?.name.trim())return;const current={...editing,name:editing.name.trim(),style:editing.style.trim()};setPeople(old=>old.some(p=>p.id===current.id)?old.map(p=>p.id===current.id?current:p):[...old,current]);setPersonaId(current.id);setEditing(null);setNotice("페르소나 ‘"+current.name+"’ 저장 완료. 계정에 입히려면 아래의 '이 계정에 페르소나 적용'을 눌러야 합니다.")}
 async function test(){
  if(busy||active.length<2){setNotice("현재 그룹에 발언 가능한 페르소나를 2개 이상 배정하세요.");return}
  const input=traderMessage.trim();setBusy(true);setNotice("대화를 생성하는 중입니다.");
  try {
   const res=await fetch("/api/discussion",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:input||topic,humanMessage:input,groupId,personas:active,history:history.slice(-16)})});
   const raw=await res.text();let data:{turns?:{speakerId:string;speaker:string;text:string}[];mode?:string;notice?:string;error?:string};
   try{data=JSON.parse(raw)}catch{throw new Error("서버 응답을 읽지 못했습니다. 배포 상태를 확인하세요.")}
   if(!res.ok||!Array.isArray(data.turns))throw new Error(data.error||"AI 생성 실패");
   const date=new Date().toISOString();
   const result:Message[]=[...(input?[{id:uid(),groupId,speakerId:"human",speaker:"트레이더 · 수동 입력",text:input,at:date}]:[]),...data.turns.map(t=>({id:uid(),groupId,speakerId:t.speakerId,speaker:t.speaker,text:t.text,at:date}))];
   setMessages(old=>[...old,...result].slice(-400));setTraderMessage("");setGenerationMode(data.mode||"unknown");setNotice(data.notice||"시뮬레이션 생성 완료");
  }catch(e){setNotice(e instanceof Error?e.message:"서버 연결 실패")}finally{setBusy(false)}
 }
 async function logout(){await fetch("/api/auth/logout",{method:"POST"});window.location.assign("/login")}
 return <div className="aceApp">
  <aside className="aceSidebar">
   <div className="aceLogo"><span className="aceMark"><BrainCircuit size={22}/></span><div><strong>모먼트</strong><small>MOMENT STUDIO</small></div></div>
   <div className="aceSidebarLabel">운영 워크스페이스</div>
   <nav className="aceNavigation">
    <button className={view==="assign"?"aceNavOn":""} onClick={()=>setView("assign")}><Users size={18}/> 계정 · 페르소나 배치 <ArrowRight size={15}/></button>
    <button className={view==="test"?"aceNavOn":""} onClick={()=>setView("test")}><MessageCircle size={18}/> 대화 테스트 <ArrowRight size={15}/></button>
    <button className={view==="overview"?"aceNavOn":""} onClick={()=>setView("overview")}><ClipboardList size={18}/> 운영 현황 <ArrowRight size={15}/></button>
   </nav>
   <div className="aceSidebarFoot"><span className="aceFootDot"/> 비공개 시뮬레이션<small>텔레그램 연결 전 · 브라우저 저장</small></div>
  </aside>
  <main className="aceMain">
   <header className="aceHeader"><div className="aceLocation">AI COMMUNITY / {view==="assign"?"계정 배치":view==="test"?"토론 테스트":"운영 현황"}</div><div className="aceHeaderActions"><span className="aceStatusPill"><ShieldCheck size={14}/> 테스트 환경</span><button onClick={logout}>로그아웃</button></div></header>
   <div className="aceContent">
    <div className="aceTitleBar"><div><span className="aceEyebrow">AI 커뮤니티 운영</span><h1>{view==="assign"?"계정에 성격을 입히는 가장 쉬운 방법":view==="test"?"대화의 흐름을 직접 확인하세요":"지금 운영 가능한 기능을 확인하세요"}</h1><p>{view==="assign"?"계정을 고르고, 활동할 그룹을 선택한 다음, 원하는 말투와 역할을 적용하세요.":view==="test"?"실제 트레이더의 발언을 넣으면 배정된 AI들이 각자 다른 관점에서 반응합니다.":"실제 동작과 준비 중인 기능을 명확하게 구분했습니다."}</p></div><span className="aceNotLive"><WifiOff size={14}/> 실제 전송 OFF</span></div>
    {view==="assign"&&<>
      <div className="aceMetrics"><div><span>테스트 계정</span><strong>{counter.accounts}</strong></div><div><span>등록 그룹</span><strong>{counter.groups}</strong></div><div><span>활동 배정</span><strong>{counter.assigned}</strong></div><div><span>페르소나</span><strong>{people.length}</strong></div></div>
      <div className="aceProgress"><div><span>01</span><strong>계정 선택</strong><small>누가 말할까요?</small></div><ArrowRight size={18}/><div><span>02</span><strong>그룹 선택</strong><small>어디서 말할까요?</small></div><ArrowRight size={18}/><div><span>03</span><strong>성격 적용</strong><small>어떻게 반응할까요?</small></div></div>
      <div className="aceThreeColumns">
        <section className="acePanel">
         <div className="acePanelTitle"><span className="aceStep">1</span><div><h2>계정 선택</h2><p>테스트에 참여할 계정을 선택하세요</p></div></div>
         <div className="aceList">
         {accounts.length?accounts.filter(a=>a.name.includes(filter)).map(a=><button key={a.id} className={"aceSelectItem "+(account===a.id?"active":"")} onClick={()=>selectAccount(a.id)}><span className="aceAvatar">{a.name.slice(0,1)}</span><span className="aceItemText"><strong>{a.name}</strong><small>{assignments.filter(x=>x.accountId===a.id).length}개 그룹 배정 · 미연결</small></span>{account===a.id?<Check size={18}/>:null}</button>):<div className="aceEmptyMini">등록된 테스트 계정이 없습니다. 아래에서 추가하세요.</div>}
         </div>
         <label className="aceInputCaption">계정 검색<input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="이름으로 검색"/></label>
         <div className="aceAdd"><input value={newAccount} maxLength={60} onChange={e=>setNewAccount(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")registerAccount()}} placeholder="새 테스트 계정 이름"/><button onClick={registerAccount} disabled={!newAccount.trim()} title="계정 추가"><Plus size={18}/></button></div>
         {account&&<button className="aceTextAction" onClick={()=>{if(!window.confirm("이 계정과 연결된 배정을 삭제할까요?"))return;setAccounts(old=>old.filter(a=>a.id!==account));setAssignments(old=>old.filter(a=>a.accountId!==account));setAccount("")}}><Trash2 size={14}/> 선택 계정 제거</button>}
        </section>
        <section className="acePanel">
         <div className="acePanelTitle"><span className="aceStep">2</span><div><h2>그룹 선택</h2><p>계정이 참여할 토론 공간</p></div></div>
         <div className="aceList">{groups.map(g=><button key={g.id} className={"aceSelectItem "+(groupId===g.id?"active":"")} onClick={()=>selectGroup(g.id)}><span className="aceGroupIcon"><Users size={17}/></span><span className="aceItemText"><strong>{g.name}</strong><small>{assignments.filter(a=>a.groupId===g.id).length}개 배정 · {g.id}</small></span>{groupId===g.id?<Check size={18}/>:null}</button>)}</div>
         <div className="aceAdd aceGroupAdd"><input value={newGroup} onChange={e=>setNewGroup(e.target.value)} placeholder="새 그룹 이름"/><button onClick={registerGroup} disabled={!newGroup.trim()} title="그룹 추가"><Plus size={18}/></button></div>
         <details className="aceDetails"><summary>그룹 ID 직접 지정</summary><input value={newGroupId} onChange={e=>setNewGroupId(e.target.value)} placeholder="-100... 또는 로컬 ID (선택)"/><small>실제 텔레그램 연결은 수행되지 않습니다.</small></details>
        </section>
        <section className="acePanel aceFocus">
         <div className="acePanelTitle"><span className="aceStep">3</span><div><h2>페르소나 설정</h2><p>이 계정의 성격·역할·말투를 배정</p></div></div>
         <label className="aceInputCaption">참여 역할<select value={mode} onChange={e=>setMode(e.target.value as Assignment["mode"])}><option value="member">일반 회원형 · 질문과 반응 중심</option><option value="expert">전문가형 · 분석 중심</option><option value="observer">관망형 · 대화 생성 제외</option></select></label>
         <label className="aceInputCaption">적용할 페르소나<select value={personaId} onChange={e=>setPersonaId(e.target.value)}>{people.map(p=><option value={p.id} key={p.id}>{p.name} — {p.role}</option>)}</select></label>
         {people.find(p=>p.id===personaId)&&<div className="acePersonaPreview"><div className="acePreviewTag">선택한 AI 성격</div><strong>{people.find(p=>p.id===personaId)?.name}</strong><p>{people.find(p=>p.id===personaId)?.style}</p><div className="acePreviewActions"><button onClick={()=>{const p=people.find(p=>p.id===personaId);if(p)editPersona(p)}}><Settings2 size={15}/> 말투·성격 편집</button><button onClick={createPersona}><Plus size={15}/> 새 성격 만들기</button></div></div>}
         <button className="acePrimary aceFull" disabled={!account||!groupId||!personaId} onClick={assign}><Check size={17}/> 이 계정에 페르소나 적용</button>
         <p className="aceHelper">{selected?"이미 배정된 계정입니다. 수정 후 적용하면 기존 설정이 변경됩니다.":"저장 버튼을 눌러야 실제로 이 계정·그룹에 배정됩니다."}</p>
        </section>
      </div>
      <section className="acePanel aceAssignments"><div className="aceBetween"><div><h2>현재 그룹 참여 구성</h2><p>페르소나가 실제로 어느 계정에 적용됐는지 바로 확인합니다.</p></div><button onClick={()=>setView("test")} className="aceSecondary">이 구성으로 토론 테스트 <ArrowRight size={16}/></button></div>
       <div className="aceAssignmentRows">{members.length?members.map(a=>{const p=people.find(x=>x.id===a.personaId);return <div className="aceAssignment" key={a.accountId+":"+a.groupId}><span className="aceAvatar">{a.accountId.slice(0,1)}</span><div><strong>{a.accountId}</strong><small>{a.mode==="member"?"일반 회원":a.mode==="expert"?"전문가":"관망형"} · {p?.role||"페르소나 없음"}</small></div><div className="aceAssignmentPersona"><BrainCircuit size={15}/> {p?.name||"삭제된 페르소나"}</div><button onClick={()=>{setAccount(a.accountId);setPersonaId(a.personaId);setMode(a.mode);if(p)editPersona(p)}}>수정</button><button title="배정 해제" onClick={()=>setAssignments(old=>old.filter(x=>x!==a))}><X size={16}/></button></div>}):<div className="aceEmptyMini">아직 선택한 그룹에 배정된 계정이 없습니다. 위에서 계정을 선택하고 페르소나를 적용하세요.</div>}</div>
      </section>
    </>}
    {view==="test"&&<div className="aceTestGrid">
     <section className="acePanel"><div className="acePanelTitle"><span className="aceStep"><MessageCircle size={16}/></span><div><h2>토론 실행</h2><p>배정된 성격으로 대화 생성</p></div></div>
      <label className="aceInputCaption">대상 그룹<select value={groupId} onChange={e=>selectGroup(e.target.value)}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
      <div className="aceTestRoster"><strong>참여 AI {active.length}명</strong><span>관망형은 발언 생성에서 제외됩니다.</span><div>{active.map(p=><em key={p.id}>{p.name}</em>)}</div></div>
      <label className="aceInputCaption">트레이더 또는 실제 참여자 발언<textarea rows={6} maxLength={1200} value={traderMessage} onChange={e=>setTraderMessage(e.target.value)} placeholder="예) 오늘 삼성전자는 거래량이 중요합니다. 이번 주는 어떻게 보시나요?"/></label>
      <label className="aceInputCaption">기본 토론 주제<input value={topic} maxLength={180} onChange={e=>setTopic(e.target.value)}/></label>
      <button className="acePrimary aceFull" disabled={busy||active.length<2||(!traderMessage.trim()&&!topic.trim())} onClick={test}><Play size={16}/>{busy?"AI 반응 생성 중":"이 그룹의 대화 생성"}</button>
      {active.length<2&&<p className="aceHelper">그룹에 발언 가능한 페르소나 2명 이상 배정이 필요합니다.</p>}
      <button className="aceSecondary aceFull" disabled={!history.length||busy} onClick={()=>{if(window.confirm("선택 그룹의 로컬 대화 기록을 삭제하시겠습니까?"))setMessages(old=>old.filter(m=>m.groupId!==groupId))}}><Trash2 size={15}/> 현재 그룹 기록 초기화</button>
      <p className="aceHelper">실제 텔레그램 메시지를 읽거나 전송하지 않습니다. 모델 키가 없다면 샘플 토론이 생성됩니다.</p>
     </section>
     <section className="acePanel aceConversation"><div className="aceBetween"><div><h2>{groups.find(g=>g.id===groupId)?.name||"선택 그룹"}</h2><p>그룹 독립 대화 기록 · {history.length}개 메시지</p></div><span className="aceInfoChip">{generationMode==="sample"?"샘플 모드":generationMode==="ai"?"AI 생성":"시뮬레이션"}</span></div>
      <div className="aceThread">{history.length?history.map(m=><div key={m.id} className={"aceMessage "+(m.speakerId==="human"?"human":"")}><span className="aceAvatar">{m.speaker.slice(0,1)}</span><div><div className="aceMessageMeta"><strong>{m.speaker}</strong><time>{new Date(m.at).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})}</time></div><p>{m.text}</p></div></div>):<div className="aceConversationEmpty"><MessageCircle size={32}/><strong>아직 토론 내역이 없습니다</strong><span>왼쪽에서 트레이더 발언을 입력하고 대화를 생성해보세요.</span></div>}</div>
     </section>
    </div>}
    {view==="overview"&&<div className="aceOverview">
      <div className="aceMetrics"><div><span>테스트 계정</span><strong>{accounts.length}</strong></div><div><span>그룹</span><strong>{groups.length}</strong></div><div><span>배정</span><strong>{assignments.length}</strong></div><div><span>대화 기록</span><strong>{messages.length}</strong></div></div>
      <section className="acePanel"><h2>현재 사용할 수 있는 기능</h2><div className="aceFeatureRows">{["테스트 계정 및 그룹 등록","그룹마다 페르소나 배정","AI 말투 프리셋 및 자연어 설명 입력","그룹별 토론 생성·대화 기록 보관"].map(t=><div key={t}><Check size={17}/>{t}<span>사용 가능</span></div>)}</div></section>
      <section className="acePanel"><h2>연동 준비 중</h2><div className="aceFeatureRows pending">{["실제 텔레그램 세션 로그인·그룹 메시지 수신","24시간 실행 워커 및 발언 자동화","서버 PostgreSQL 공동 기억","실시간 주식 시세·수익 데이터 검증"].map(t=><div key={t}><CircleHelp size={17}/>{t}<span>미구현</span></div>)}</div></section>
      <div className="aceNoticeBox"><ShieldCheck size={18}/> 현재 설정은 브라우저 로컬 저장소에 저장됩니다. 다른 기기와 자동 동기화되지 않으며, 실제 투자 수익을 생성하거나 검증하지 않습니다.</div>
    </div>}
    {notice&&<div className="aceToast" role="status">{notice}<button onClick={()=>setNotice("")}><X size={15}/></button></div>}
   </div>
  </main>
  {editing&&<div className="aceModalOverlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEditing(null)}}><div className="aceModal" role="dialog" aria-modal="true" aria-label="페르소나 편집"><div className="aceBetween"><div><span className="aceEyebrow">페르소나 디자이너</span><h2>{editing.name?editing.name+" · 성격 편집":"새 페르소나 만들기"}</h2></div><button className="aceIconButton" onClick={()=>setEditing(null)}><X size={19}/></button></div>
    <div className="aceModalScroll">
     <div className="acePresetTitle"><SlidersHorizontal size={17}/> 프롬프트를 몰라도 됩니다. 유형을 고르세요.</div>
     <div className="acePresetList">{preset.map(t=><button key={t.name} onClick={()=>{setEditing({...editing,role:t.role,style:t.style,risk:t.risk});setSimpleNote("")}}>{t.name}</button>)}</div>
     <div className="aceFormTwo"><label className="aceInputCaption">표시 이름<input value={editing.name} maxLength={60} onChange={e=>setEditing({...editing,name:e.target.value})} placeholder="예: 조과장"/></label><label className="aceInputCaption">역할<input value={editing.role} maxLength={120} onChange={e=>setEditing({...editing,role:e.target.value})} placeholder="예: 일반 회원 · 질문형"/></label></div>
     <label className="aceInputCaption">일상적인 말로 성격 설명하기<textarea value={simpleNote} rows={3} onChange={e=>setSimpleNote(e.target.value)} placeholder="예: 50대 직장인처럼 말이 적고, 어려운 말은 짧게 물어봐. 너무 아는 척하지 마."/></label>
     <button className="aceSecondary aceFull" disabled={!simpleNote.trim()} onClick={()=>setEditing({...editing,style:makeStyle(simpleNote)})}><BrainCircuit size={15}/> 설명을 행동 지침으로 정리</button>
     <label className="aceInputCaption">실제 적용될 행동 지침<textarea value={editing.style} rows={5} maxLength={1200} onChange={e=>setEditing({...editing,style:e.target.value})} placeholder="대화 습관, 말투, 언제 침묵할지 등을 적으세요."/></label>
     <label className="aceInputCaption">투자 성향 {editing.risk}/100<input type="range" min="0" max="100" step="5" value={editing.risk} onChange={e=>setEditing({...editing,risk:Number(e.target.value)})}/></label>
     <p className="aceHelper">성격을 저장한 뒤 계정 배치 화면에서 해당 페르소나를 선택하고 적용해야 합니다. 프롬프트 자동 정리는 규칙 기반이며 AI API 호출은 아닙니다.</p>
    </div>
    <div className="aceModalActions"><button className="aceSecondary" onClick={()=>setEditing(null)}>취소</button><button className="acePrimary" disabled={!editing.name.trim()} onClick={savePersona}><Save size={16}/> 성격 저장</button></div>
   </div></div>}
 </div>
}
