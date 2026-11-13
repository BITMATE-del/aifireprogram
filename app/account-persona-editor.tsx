"use client";
import {useEffect,useState} from "react";
import {BrainCircuit,Check,MessageCircle,Save,Settings2,UserRound,Users} from "lucide-react";
type Account={id:string;name:string;note:string;enabled:boolean};
type Group={id:string;name:string};
type Persona={id:string;name:string;role:string;style:string;risk:number};
type Assignment={accountId:string;groupId:string;personaId:string;mode:"member"|"expert"|"observer"};
type Props={account:Account|null;initialGroupId?:string;groups:Group[];people:Persona[];assignments:Assignment[];save:(persona:Persona,assignment:Assignment)=>void;openTest:(groupId:string)=>void};
const templates=[
 {label:"초보 질문형",role:"일반 회원 · 질문형",style:"설명이 어려우면 짧게 묻는다. 같은 질문을 반복하지 않는다.",risk:25},
 {label:"조용한 관망형",role:"일반 회원 · 관망형",style:"대화를 읽되 관련된 질문이 있을 때만 말한다. 가벼운 공감 표현을 남발하지 않는다.",risk:20},
 {label:"공감·대화형",role:"일반 회원 · 공감형",style:"다른 의견에 자연스럽게 반응하고 필요한 정보를 짧게 확인한다.",risk:50},
 {label:"활발한 토론형",role:"일반 회원 · 토론형",style:"다른 의견을 존중하되 궁금한 근거는 적극적으로 질문한다.",risk:65},
 {label:"전문 트레이더",role:"전문가 · 시장분석",style:"실제 데이터에 근거해 분석하고 불확실한 정보는 단정하지 않는다.",risk:50}
];
export default function AccountPersonaEditor({account,initialGroupId,groups,people,assignments,save,openTest}:Props){
 const [group,setGroup]=useState("");
 const [role,setRole]=useState<Assignment["mode"]>("member");
 const [name,setName]=useState("");
 const [type,setType]=useState(templates[0].role);
 const [style,setStyle]=useState(templates[0].style);
 const [risk,setRisk]=useState(25);

 const [message,setMessage]=useState("");
 const accountId=account?.id||"";
 const selectedGroup=group||groups[0]?.id||"";
 const existing=assignments.find(x=>x.accountId===accountId&&x.groupId===selectedGroup);
 useEffect(()=>{setGroup(initialGroupId&&groups.some(g=>g.id===initialGroupId)?initialGroupId:groups[0]?.id||"");},[accountId,initialGroupId,groups.length]);
 useEffect(()=>{
  const assignment=assignments.find(x=>x.accountId===accountId&&x.groupId===selectedGroup);
  const p=people.find(x=>x.id===assignment?.personaId);
  setName(p?.name||account?.name||"");
  setType(p?.role||templates[0].role);
  setStyle(p?.style||templates[0].style);
  setRisk(p?.risk??25);
  setRole(assignment?.mode||"member");
  setMessage("");
 // Rehydrate editor only on account/group switch; saved data is intentionally not overwritten while typing.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[accountId,selectedGroup]);
 if(!account)return <div className="nxAccountEmpty"><UserRound size={28}/><strong>계정을 먼저 선택하세요</strong><p>왼쪽에서 계정을 선택하면 이곳에서 그룹별 성격을 직접 설정할 수 있습니다.</p></div>;
 const currentPersona=people.find(x=>x.id===existing?.personaId);
 const shared=currentPersona&&assignments.filter(x=>x.personaId===currentPersona.id).length>1;
 function commit(){
  if(!selectedGroup||!name.trim()){setMessage("그룹과 표시 이름을 확인하세요.");return;}
  const personaId=existing&&!shared&&existing.personaId.startsWith("account-")?existing.personaId:"account-"+accountId.replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,30)+"-"+selectedGroup.replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,30)+"-"+Date.now().toString(36);
  save({id:personaId,name:name.trim(),role:type,style:style.trim(),risk},{accountId,groupId:selectedGroup,personaId,mode:role});
  setMessage("이 계정의 그룹별 성격이 저장되었습니다.");
 }
 return <div className="nxAccountEditor">
  <div className="nxEditorTop"><span className="nxAvatar">{account.name.slice(0,1)}</span><div><strong>{account.name}</strong><small>이 계정의 그룹별 AI 성격을 설정합니다.</small></div>{existing&&<span className="nxAssignedFlag"><Check size={13}/> 적용됨</span>}</div>
  <label>1. 활동 그룹<select value={selectedGroup} onChange={e=>setGroup(e.target.value)}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
  <label>2. 참여 역할<select value={role} onChange={e=>setRole(e.target.value as Assignment["mode"])}><option value="member">일반 참여자</option><option value="expert">전문가</option><option value="observer">관망형 (자동 발언 제외)</option></select></label>
  <div className="nxTemplateHeading">3. 성격 선택 <small>누르면 아래 설정에 적용됩니다.</small></div>
  <div className="nxTemplateChips">{templates.map(t=><button key={t.label} onClick={()=>{setType(t.role);setStyle(t.style);setRisk(t.risk);}}>{t.label}</button>)}</div>
  <label>이름<input value={name} onChange={e=>setName(e.target.value)} maxLength={60}/></label>
  <label>성격 / 활동 유형<input value={type} onChange={e=>setType(e.target.value)} maxLength={120}/></label>
  <label>말투와 반응 방식<textarea value={style} onChange={e=>setStyle(e.target.value)} rows={4} maxLength={1500} placeholder="예: 시장 얘기를 듣고 궁금한 점만 짧게 묻는 성격"/></label>
  <label>투자 성향 <span>{risk}/100</span><input type="range" value={risk} min={0} max={100} step={5} onChange={e=>setRisk(Number(e.target.value))}/></label>
  <div className="nxEditorActions"><button className="nxPrimary" onClick={commit}><Save size={15}/> 이 계정에 저장</button><button onClick={()=>openTest(selectedGroup)}><MessageCircle size={15}/> 대화 테스트</button></div>
  {message&&<p className="nxEditorMessage" role="status">{message}</p>}
  <p className="nxTip">각 그룹에 별도의 성격이 저장되며 기존 공용 페르소나를 다른 계정에서 사용 중이더라도 변경이 퍼지지 않도록 분리합니다. 현재는 로컬 시뮬레이션 설정입니다.</p>
 </div>
}
