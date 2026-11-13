"use client";
import {useState} from "react";
export type Assignment={accountId:string;groupId:string;personaId:string;mode:"expert"|"member"|"observer"};
type Persona={id:string;name:string;role:string;style:string;risk:number};
type Group={id:string;name:string};
export default function AssignmentPanel({people,groups,assignments,onChange,onEdit}:{
people:Persona[];groups:Group[];assignments:Assignment[];onChange:(a:Assignment[])=>void;onEdit:(p:Persona)=>void;
}){
const [account,setAccount]=useState("테스트 계정 A");
const [group,setGroup]=useState(groups[0]?.id||"");
const [persona,setPersona]=useState(people[0]?.id||"");
const [mode,setMode]=useState<Assignment["mode"]>("member");
function add(){if(!account.trim()||!group||!persona)return;const rest=assignments.filter(a=>!(a.accountId===account.trim()&&a.groupId===group));onChange([...rest,{accountId:account.trim(),groupId:group,personaId:persona,mode}]);}
return <section className="panel"><div className="panelHeading"><h2>계정 → 그룹 선택 → 페르소나 배정</h2><span className="muted">테스트용 계정 이름 · 실제 텔레그램 인증 미연결</span></div>
<div className="assignmentForm">
<label>1. 계정<input value={account} maxLength={60} onChange={e=>setAccount(e.target.value)} placeholder="테스트 계정 이름"/></label>
<label>2. 그룹<select value={group} onChange={e=>setGroup(e.target.value)}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
<label>3. 페르소나<select value={persona} onChange={e=>setPersona(e.target.value)}>{people.map(p=><option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select></label>
<label>참여 형태<select value={mode} onChange={e=>setMode(e.target.value as Assignment["mode"])}><option value="member">일반 참여자</option><option value="expert">전문가</option><option value="observer">관망형</option></select></label>
<button className="primary" onClick={add} disabled={!account.trim()||!group||!persona}>배정 저장</button>
</div>
<p className="hint">그룹마다 서로 다른 계정·페르소나 구성을 사용할 수 있습니다. 전문가의 원문이 올라오면 일반 참여자들이 그 내용에 반응하는 구성이 우선입니다.</p>
<div className="assignmentList">{assignments.map((a,i)=>{const p=people.find(x=>x.id===a.personaId);const g=groups.find(x=>x.id===a.groupId);return <div className="assignmentItem" key={a.accountId+":"+a.groupId}><div><b>{a.accountId}</b> <span>→ {g?.name||"삭제된 그룹"} → {p?.name||"삭제된 페르소나"} · {a.mode==="expert"?"전문가":a.mode==="observer"?"관망형":"일반 참여자"}</span></div><div className="lineActions">{p&&<button onClick={()=>onEdit(p)}>페르소나 설정</button>}<button className="danger" onClick={()=>onChange(assignments.filter((_,j)=>j!==i))}>배정 해제</button></div></div>})}</div>
</section>;
}
