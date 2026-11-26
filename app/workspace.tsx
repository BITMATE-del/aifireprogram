"use client";
import {useEffect,useMemo,useState} from "react";
import AccountPersonaEditor from "./account-persona-editor";
import AccountCredentials from "./account-credentials";
import ApiUsageDashboard from "./api-usage-dashboard";
import BackupPanel from "./backup-panel";
import ServerStoragePanel from "./server-storage-panel";
import GroupLiveInbox from "./group-live-inbox";
import AccountGroupPicker from "./account-group-picker";
import {Activity,ArrowRight,BrainCircuit,Check,ChevronRight,CircleHelp,LayoutDashboard,MessageCircle,Plus,Trash2,Users,UserRound,WifiOff,X} from "lucide-react";

type Account={id:string;name:string;note:string;enabled:boolean};
type Group={id:string;name:string};
type Persona={id:string;name:string;role:string;style:string;risk:number;frequency?:"quiet"|"balanced"|"active";responseMode?:"reactive"|"balanced"|"independent";interests?:string};
type Assignment={accountId:string;groupId:string;personaId:string;mode:"member"|"expert"|"observer"};
type Message={id:string;groupId:string;speakerId:string;speaker:string;text:string;at:string};
type Page="home"|"accounts"|"groups"|"discussion"|"usage"|"status";
type Template={title:string;role:string;style:string;risk:number};
const defaults:Persona[]=[
{id:"p1",name:"김실장",role:"전문가 · 기술 분석",style:"실제 차트 근거를 우선하고 확정적인 수익을 약속하지 않는다. 짧고 차분하게 답한다.",risk:40},
{id:"p2",name:"박대표",role:"전문가 · 가치투자",style:"기업 실적을 중심으로 신중하게 설명한다. 다른 관점도 경청한다.",risk:30},
{id:"p3",name:"정대리",role:"일반 회원 · 질문형",style:"전문가처럼 분석하지 않는다. 모르는 용어를 짧게 물어보고 의견을 확인한다.",risk:45},
{id:"p4",name:"최팀장",role:"일반 회원 · 관망형",style:"대부분 관망하다가 위험을 확인하고 싶을 때만 질문한다.",risk:20},
{id:"p5",name:"이과장",role:"일반 회원 · 공감형",style:"상대의 의견에 자연스럽게 반응하고 질문한다. 같은 내용 반복은 피한다.",risk:50}
];
const templates:Template[]=[
{title:"초보 질문형",role:"일반 회원 · 질문형",style:"전문가인 척하지 않고 이해되지 않는 부분을 묻는다. 짧고 자연스러운 문장을 사용한다.",risk:25},
{title:"신중한 관망형",role:"일반 회원 · 관망형",style:"말수가 적고 쉽게 확신하지 않는다. 중요한 근거가 궁금할 때만 이야기한다.",risk:20},
{title:"경험 공유형",role:"일반 회원 · 경험형",style:"일반적인 투자 경험을 편하게 이야기하지만 실제로 하지 않은 거래나 수익을 꾸미지 않는다.",risk:45},
{title:"활발한 질문형",role:"일반 회원 · 활발형",style:"친근한 대화체로 후속 질문을 하고 근거가 있으면 반론한다. 같은 질문을 반복하지 않는다.",risk:65},
{title:"전문 트레이더",role:"전문가 · 트레이더",style:"시장 데이터와 분석 근거를 명확히 구분해 설명한다. 위험 시나리오도 언급한다.",risk:55}
];
const menu:[Page,string,typeof LayoutDashboard][]=[
["accounts","계정 관리",UserRound],["groups","그룹 관리",Users],["discussion","AI 토론",MessageCircle],["usage","API·사용량",Activity],["status","운영 현황",Activity]
];
const nid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
function restore<T>(name:string,otherwise:T):T{try{const x=localStorage.getItem(name);return x?JSON.parse(x) as T:otherwise}catch{return otherwise}}
export default function Workspace(){
const [ready,setReady]=useState(false);
const [page,setPage]=useState<Page>("status");
const [accounts,setAccounts]=useState<Account[]>([]);
const [groups,setGroups]=useState<Group[]>([]);
const [personas,setPersonas]=useState<Persona[]>(defaults);
const [assignments,setAssignments]=useState<Assignment[]>([]);
const [messages,setMessages]=useState<Message[]>([]);
const [accountTab,setAccountTab]=useState<"api"|"groups"|"persona">("api");
const [accountName,setAccountName]=useState(""),[groupName,setGroupName]=useState(""),[groupCode,setGroupCode]=useState("");
const [accountId,setAccountId]=useState(""),[groupId,setGroupId]=useState("");



const [notice,setNotice]=useState("");
useEffect(()=>{setAccounts(restore("ace.accounts",[]));setGroups(restore("ace.groups",[]));setPersonas(restore("ace.people",defaults));setAssignments(restore("ace.assignments",[]));setMessages(restore("ace.messages",[]));setGroupId(restore("ace.activeGroup",""));setReady(true)},[]);
useEffect(()=>{if(!ready)return;localStorage.setItem("ace.accounts",JSON.stringify(accounts));localStorage.setItem("ace.groups",JSON.stringify(groups));localStorage.setItem("ace.people",JSON.stringify(personas));localStorage.setItem("ace.assignments",JSON.stringify(assignments));localStorage.setItem("ace.messages",JSON.stringify(messages.slice(-400)));localStorage.setItem("ace.activeGroup",JSON.stringify(groupId));},[ready,accounts,groups,personas,assignments,messages,groupId]);
const realGroups=groups.filter(g=>/^-?\d{1,20}$/.test(g.id));
const currentGroup=realGroups.some(g=>g.id===groupId)?groupId:(realGroups[0]?.id||"");
const groupAssignments=assignments.filter(x=>x.groupId===currentGroup&&accounts.some(a=>a.id===x.accountId)&&personas.some(p=>p.id===x.personaId));
const groupPeople=useMemo(()=>groupAssignments.filter(a=>a.mode!=="observer").flatMap(a=>{const p=personas.find(x=>x.id===a.personaId);return p?[{...p,id:a.accountId+"::"+a.groupId,name:p.name,accountId:a.accountId,participationRole:a.mode}]:[];}),[personas,groupAssignments]);
function go(p:Page){setPage(p);setNotice("");}
function addAccount(){
 const name=accountName.trim();
 if(!name||accounts.some(a=>a.id===name))return;
 if(name==="__global_defaults__"||name==="__server_default__"){setNotice("시스템 예약 이름은 사용할 수 없습니다.");return;}
 setAccounts(old=>[...old,{id:name,name,note:"텔레그램 연결 대기",enabled:true}]);
 setAccountId(name);setAccountName("");
 setNotice("계정을 등록했습니다. API 연결 설정에서 텔레그램 로그인을 완료하세요.");
}
return <div className="nxApp">
 <aside className="nxSide"><div className="nxBrand"><span className="nxBrandIcon"><BrainCircuit size={23}/></span><div><strong>모먼트</strong><small>MOMENT STUDIO</small></div></div><div className="nxSideLabel">운영 메뉴</div><nav>{menu.map(([key,label,Icon])=><button key={key} className={page===key?"on":""} onClick={()=>go(key)}><Icon size={18}/>{label}{page===key&&<ChevronRight size={15}/>}</button>)}</nav><div className="nxFoot"><span className="nxGreenDot"/> 실제 텔레그램 운영<small>연결 상태는 AI 토론에서 확인</small></div></aside>
 <main className="nxMain"><header className="nxHeader"><div>운영센터 <span>/</span> {menu.find(x=>x[0]===page)?.[1]}</div><div><span className="nxChip">운영 환경</span><button onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});window.location.assign("/login")}}>로그아웃</button></div></header><div className="nxContent">
 <div className="nxHeading"><div><span className="nxEyebrow">AI COMMUNITY MANAGEMENT</span><h1>{menu.find(x=>x[0]===page)?.[1]}</h1><p>{({
 home:"진행 상황을 한눈에 확인하고 필요한 메뉴로 바로 이동하세요.",
 accounts:"등록할 텔레그램 계정과 그룹별 AI 성격을 여기서 관리합니다.",
 groups:"AI가 활동할 그룹을 등록하고 관리합니다.",
 discussion:"실제 텔레그램 그룹 메시지와 자동 대화 운영 상태를 확인합니다.",
 usage:"계정별 Telegram·OpenAI API 등록, 토큰 소모량과 추정 비용을 확인합니다.",
 status:"서버 저장, 그룹 연결 상태, 운영 준비 상태를 확인합니다."
 } as Record<Page,string>)[page]}</p></div><span className="nxOffline"><Activity size={14}/> 연결된 그룹 실시간 운영</span></div>
 {page==="home"&&<div className="nxPanel"><h2>실제 운영 현황</h2><p>등록된 텔레그램 계정 {accounts.length}개 · 연결 그룹 {realGroups.length}개 · 계정 배정 {assignments.length}개</p><p>그룹별 작동 상태와 대화 기록은 AI 토론에서 확인하세요.</p><button className="nxPrimary" onClick={()=>go("discussion")}>AI 토론 운영 보기 <ArrowRight size={16}/></button></div>}
 {page==="accounts"&&<><div className="nxAccountLayout"><section className="nxPanel"><div className="nxPanelHeading"><div><h2>계정 목록 <small>{accounts.length}</small></h2><p>설정할 계정을 선택하세요.</p></div></div><div className="nxCreateRow nxAccountAdd"><input value={accountName} maxLength={60} onChange={e=>setAccountName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addAccount()}} placeholder="텔레그램 계정 이름"/><button className="nxPrimary" onClick={addAccount} disabled={!accountName.trim()}><Plus size={16}/> 추가</button></div><div className="nxList">{accounts.length?accounts.map(a=><div key={a.id} className="nxAccountToggleRow"><button className={"nxAccountSelect "+(accountId===a.id?"selected":"")} onClick={()=>setAccountId(a.id)}><span className="nxAvatar">{a.name.slice(0,1)}</span><span><strong>{a.name}</strong><small>{assignments.filter(x=>x.accountId===a.id).length}개 그룹 배정 · {a.enabled?"사용 중":"일시중지"}</small></span>{accountId===a.id&&<Check size={17}/>}</button><button className={"nxPauseAccount "+(a.enabled?"":"paused")} onClick={()=>{setAccounts(old=>old.map(x=>x.id===a.id?{...x,enabled:!x.enabled}:x));setNotice(a.enabled?"계정 일시중지 설정을 변경했습니다. 자동 저장이 꺼져 있다면 운영 현황에서 서버 저장을 진행하세요.":"계정 사용 설정을 변경했습니다. 서버 저장 후 워커에 반영됩니다.");}}>{a.enabled?"중지":"재개"}</button></div>):<div className="nxEmpty">계정을 추가한 뒤 텔레그램으로 로그인하세요.</div>}</div>{accountId&&<button className="nxRemoveAccount" onClick={async()=>{if(!confirm("이 계정의 서버 API 키와 텔레그램 세션까지 해제하고 계정을 삭제할까요?"))return;const removed=accountId;try{const response=await fetch("/api/account-credentials",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:removed})});if(!response.ok)throw Error("서버의 API 키 삭제에 실패해 계정을 유지합니다.");setAccounts(old=>old.filter(a=>a.id!==removed));setAssignments(old=>old.filter(a=>a.accountId!==removed));setAccountId("");setNotice("계정과 암호화된 인증정보를 해제했습니다. 운영 현황에서 서버 설정도 다시 저장하세요.");}catch(e){setNotice(e instanceof Error?e.message:"계정 삭제 실패");}}}><Trash2 size={15}/> 선택한 계정 삭제</button>}</section><section className="nxPanel"><div className="nxAccountTabs"><button className={accountTab==="api"?"active":""} onClick={()=>setAccountTab("api")}>API 연결 설정</button><button className={accountTab==="groups"?"active":""} onClick={()=>setAccountTab("groups")}>참여 그룹 선택</button><button className={accountTab==="persona"?"active":""} onClick={()=>setAccountTab("persona")}>AI 페르소나 설정</button></div>{accountTab==="api"?(accountId?<AccountCredentials key={accountId} accountId={accountId}/>:<div className="nxEmpty">왼쪽에서 계정을 선택하면 API 정보를 등록할 수 있습니다.</div>):accountTab==="groups"?(accountId?<AccountGroupPicker accountId={accountId} assignments={assignments} onSynced={(remote,version)=>{setGroups(remote.groups as Group[]);setAssignments(remote.assignments as Assignment[]);setGroupId(remote.activeGroup);window.dispatchEvent(new CustomEvent("moment:workspace-synced",{detail:{version,state:remote}}));setNotice("선택한 텔레그램 그룹이 서버에 저장되고 계정에 배정됐습니다.");}}/>:<div className="nxEmpty">왼쪽에서 계정을 선택해 주세요.</div>):<><div className="nxPanelHeading"><div><h2>계정별 페르소나</h2><p>그룹을 선택하고 이 계정의 성격을 설정하세요.</p></div></div><AccountPersonaEditor account={accounts.find(a=>a.id===accountId)||null} initialGroupId={groupId} groups={groups} people={personas} assignments={assignments} save={(persona,assignment,applyAll)=>{
 setPersonas(old=>old.some(x=>x.id===persona.id)?old.map(x=>x.id===persona.id?persona:x):[...old,persona]);
 setAssignments(old=>{
  if(!applyAll)return [...old.filter(x=>!(x.accountId===assignment.accountId&&x.groupId===assignment.groupId)),assignment];
  const target=old.filter(x=>x.accountId===assignment.accountId);
  const unique=new Map(target.map(x=>[x.groupId,{...x,personaId:persona.id}]));
  unique.set(assignment.groupId,assignment);
  return [...old.filter(x=>x.accountId!==assignment.accountId),...unique.values()];
 });
 setNotice(applyAll?"계정 기본 성격을 배정된 그룹 전체에 적용했습니다. 서버 자동 저장 또는 운영 현황 저장 후 반영됩니다.":"선택한 그룹의 개별 성격을 적용했습니다. 서버에 저장 후 반영됩니다.");
}} openTest={selected=>{setGroupId(selected);go("discussion");}}/></>}</section></div>

 </>}
 {page==="usage"&&<ApiUsageDashboard accounts={accounts} selectedAccount={accountId} onSelect={setAccountId}/>}
 {page==="groups"&&<div className="nxPanel">
  <div className="nxPanelHeading"><div><h2>실제 텔레그램 그룹 <small>{realGroups.length}</small></h2><p>연결된 계정에서 참여 그룹을 검색하고 체크하면 이 목록에 등록됩니다.</p></div></div>
  <div className="nxList">{realGroups.length?realGroups.map(g=><div className="nxRecord" key={g.id}><span className="nxAvatar nxGroupAvatar"><Users size={17}/></span><div><strong>{g.name}</strong><small>{g.id} · {assignments.filter(x=>x.groupId===g.id).length}개 계정 배정</small></div><button onClick={()=>{setGroupId(g.id);go("discussion")}}>운영 보기 <ArrowRight size={14}/></button></div>):<div className="nxEmpty">등록된 실제 그룹이 없습니다. 계정 관리에서 텔레그램에 로그인한 뒤 참여 그룹을 선택하세요.</div>}</div>
  <p className="nxTip">그룹 추가 및 해제는 계정 관리 → 참여 그룹 선택에서 처리합니다.</p>
 </div>}
 {page==="discussion"&&<div className="nxTestGrid">
  <div className="nxPanel nxDiscussionPicker">
   <div className="nxPanelHeading"><div><h2>실제 그룹 운영</h2><p>대화가 수신되는 텔레그램 그룹만 선택합니다.</p></div></div>
   <label>대상 그룹<select value={currentGroup} onChange={e=>setGroupId(e.target.value)}>{!realGroups.length&&<option value="">연결된 그룹 없음</option>}{realGroups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
   <div className="nxRoster"><strong>배정된 AI 계정 {groupPeople.length}개</strong><div>{groupPeople.map(p=><span key={p.id}>{p.name} · {p.accountId}</span>)}</div>{!groupPeople.length&&<small>계정 관리에서 그룹과 페르소나를 배정해 주세요.</small>}</div>
  </div>
  {currentGroup?<GroupLiveInbox groupId={currentGroup}/>:<div className="nxPanel"><div className="nxEmpty">먼저 계정 관리에서 실제 텔레그램 그룹을 체크하세요.</div></div>}
 </div>}
 {page==="status"&&<><div className="nxPanel"><div className="nxPanelHeading"><div><h2>서비스 구현 상태</h2><p>현재 실제 동작하는 부분과 아직 미구현인 기능을 구분합니다.</p></div></div><div className="nxStatusList">{[["실제 텔레그램 계정·그룹 관리","사용 가능",true],["계정별 페르소나 설정·배정","사용 가능",true],["그룹 대화 디렉터·자동 발언","API 설정 시 사용 가능",true],["실제 그룹 수신·전송 기록","사용 가능",true],["텔레그램 일반 계정 API·세션 등록","계정별 등록 가능",true],["텔레그램 그룹 자동 대화 시작·정지","그룹별 시작 버튼으로 사용 가능",true],["개별 OpenAI API 키·토큰 사용량 기록","사용 가능",true],["그룹 공동 기억·요약","사용 가능",true],["실시간 시세·성과 검증","미구현",false]].map(([label,status,ok])=><div key={String(label)}><span>{ok?<Check size={18}/>:<CircleHelp size={18}/>}</span><strong>{label}</strong><small>{status}</small></div>)}</div></div></>}
 <div style={{display:page==="status"?"block":"none"}}><ServerStoragePanel state={{accounts,groups,people:personas,assignments,messages,activeGroup:groupId}} onLoad={value=>{setAccounts(value.accounts as Account[]);setGroups(value.groups as Group[]);setPersonas(value.people as Persona[]);setAssignments(value.assignments as Assignment[]);setMessages(value.messages as Message[]);setGroupId(value.activeGroup);setNotice("서버 저장본을 불러왔습니다.");}}/></div>
 {notice&&<div className="nxNotice" role="status">{notice}<button onClick={()=>setNotice("")}><X size={15}/></button></div>}
 </div></main>

 </div>
}
