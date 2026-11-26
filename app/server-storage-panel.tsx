"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {Database,Download,Save,RefreshCw} from "lucide-react";
type Data={accounts:unknown[];groups:unknown[];people:unknown[];assignments:unknown[];messages:unknown[];activeGroup:string};
type Props={state:Data;onLoad:(value:Data)=>void};
const serialize=(v:Data)=>JSON.stringify(v);
export default function ServerStoragePanel({state,onLoad}:Props){
 const [status,setStatus]=useState<"checking"|"ready"|"unavailable">("checking");
 const [exists,setExists]=useState(false),[version,setVersion]=useState(0),[updated,setUpdated]=useState("");
 const [working,setWorking]=useState(false),[notice,setNotice]=useState("");
 const [auto,setAuto]=useState(false),[baseline,setBaseline]=useState("");
 const syncedVersion=useRef(0),busy=useRef(false),lastSaved=useRef("");
 const fetchServer=useCallback(async()=>{
  const r=await fetch("/api/workspace",{cache:"no-store"});const data=await r.json();
  if(!r.ok)throw Error(data.error||"서버 저장소에 연결하지 못했습니다.");
  return data as {exists:boolean;version:number;updatedAt:string;state:Data|null};
 },[]);
 const refresh=useCallback(async()=>{
  try{
   const data=await fetchServer();
   setStatus("ready");setExists(data.exists===true);setVersion(data.version||0);
   syncedVersion.current=data.version||0;setUpdated(data.updatedAt||"");
   const serverText=data.state?serialize(data.state):"";
   lastSaved.current=serverText;setBaseline(serverText);
   // On reload, never silently push a different browser's data to server.
   setAuto(localStorage.getItem("ace.autosave") === "on" && !!serverText && serverText===serialize(state));
  }catch(e){setStatus("unavailable");setAuto(false);setNotice(e instanceof Error?e.message:"서버 저장소 연결 실패");}
 // Initial server snapshot is deliberately checked only once. Further local edits are user-controlled.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[fetchServer]);
 useEffect(()=>{void refresh()},[refresh]);
 async function persist(value:Data,silent=false){
  if(busy.current)return;
  busy.current=true;setWorking(true);if(!silent)setNotice("");
  try{
   const r=await fetch("/api/workspace",{method:"PUT",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({version:syncedVersion.current,state:value})});
   const data=await r.json();
   if(!r.ok)throw Error(data.error||"서버 저장 실패");
   syncedVersion.current=data.version;setVersion(data.version);
   setExists(true);setUpdated(data.updatedAt||"");
   lastSaved.current=serialize(value);setBaseline(lastSaved.current);
   if(!silent)setNotice("현재 설정을 서버에 저장했습니다.");
  }catch(e){
   setAuto(false);localStorage.removeItem("ace.autosave");
   setNotice((silent?"자동 저장 중단: ":"")+(e instanceof Error?e.message:"저장 실패")+" · 내용을 확인한 뒤 다시 저장하세요.");
  }finally{busy.current=false;setWorking(false)}
 }
 async function save(){
  if(busy.current||status!=="ready")return;
  if(exists&&!confirm("현재 브라우저 설정을 서버에 저장합니다. 다른 브라우저의 변경사항이 있다면 충돌 검사로 저장을 거부합니다. 계속할까요?"))return;
  await persist(state);
 }
 async function load(){
  if(busy.current||!exists)return;
  if(!confirm("서버 저장본으로 브라우저의 현재 설정을 교체합니다. 브라우저의 미저장 변경은 사라집니다. 계속할까요?"))return;
  busy.current=true;setWorking(true);
  try{
   const data=await fetchServer();
   if(!data.state)throw Error("서버 저장본을 찾을 수 없습니다.");
   onLoad(data.state);syncedVersion.current=data.version;setVersion(data.version);
   setUpdated(data.updatedAt||"");lastSaved.current=serialize(data.state);setBaseline(lastSaved.current);
   setNotice("서버 설정을 가져왔습니다.");
  }catch(e){setNotice(e instanceof Error?e.message:"불러오기 실패")}
  finally{busy.current=false;setWorking(false)}
 }
 function toggleAuto(checked:boolean){
  if(checked){
   if(status!=="ready"||!exists||!baseline||serialize(state)!==baseline){
    setNotice("자동 저장 전 현재 브라우저 설정을 서버에 저장하거나 서버 저장본을 불러와 일치시켜 주세요.");
    return;
   }
   localStorage.setItem("ace.autosave","on");setAuto(true);setNotice("자동 저장 활성화: 설정 변경 후 약 2초 뒤 서버에 저장합니다.");
  }else{localStorage.removeItem("ace.autosave");setAuto(false);setNotice("자동 저장을 껐습니다. 브라우저 데이터는 유지됩니다.");}
 }
 useEffect(()=>{
  if(!auto||status!=="ready"||busy.current||!baseline)return;
  const current=serialize(state);
  if(current===lastSaved.current)return;
  const timer=setTimeout(()=>{void persist(state,true)},2000);
  return()=>clearTimeout(timer);
 // serialize(state) stabilizes the dependency across parent renders.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[auto,status,serialize(state),baseline]);
 return <section className="nxPanel nxUnderPanel">
  <div className="nxPanelHeading"><div><h2>PostgreSQL 서버 저장</h2><p>계정·그룹·페르소나·대화를 안전하게 보존합니다.</p></div></div>
  <div className="nxBackupNote"><Database size={16}/> {status==="checking"?"서버 확인 중":status==="ready"?exists?"서버 저장본 있음 · 버전 "+version:"서버 연결됨 · 저장된 설정 없음":"서버 저장 기능 연결 실패"}{updated?" · "+new Date(updated).toLocaleString("ko-KR"):""}</div>
  <div className="nxBackupActions"><button disabled={working||status!=="ready"} onClick={save}><Save size={16}/> 현재 설정 서버 저장</button>
  <button disabled={working||status!=="ready"||!exists} onClick={load}><Download size={16}/> 서버 설정 불러오기</button>
  <button disabled={working} onClick={()=>void refresh()}><RefreshCw size={16}/> 상태 새로고침</button></div>
  <label className="nxAutoSaveControl"><input type="checkbox" checked={auto} onChange={e=>toggleAuto(e.target.checked)}/><span><strong>변경사항 자동 저장</strong><small>최초 저장·불러오기 후 활성화 가능. 다른 브라우저와 충돌하면 중단됩니다.</small></span><b>{auto?"사용 중":"꺼짐"}</b></label>
  <p className="nxTip">자동 저장은 켠 브라우저에서만 작동하며, 서버 설정과 일치하는 상태에서 시작합니다. 계정 API 비밀키는 별도 암호화 저장되므로 포함되지 않습니다.</p>
  {notice&&<p className="nxBackupMessage" role="status">{notice}</p>}
 </section>;
}
