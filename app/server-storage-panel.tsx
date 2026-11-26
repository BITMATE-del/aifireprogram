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
 const onLoadRef=useRef(onLoad);
 onLoadRef.current=onLoad;
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
   if(data.exists&&data.state){
    // Production always treats PostgreSQL as authoritative.
    onLoadRef.current(data.state);
    localStorage.setItem("ace.autosave","on");
    setAuto(true);
   }else{
    setAuto(false);
   }
  }catch(e){setStatus("unavailable");setAuto(false);setNotice(e instanceof Error?e.message:"서버 저장소 연결 실패");}
 // Load the current server snapshot before enabling production autosave.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[fetchServer]);
 useEffect(()=>{void refresh()},[refresh]);
 useEffect(()=>{
  function updateFromGroupSelection(event:Event){
   const detail=(event as CustomEvent<{version:number;state:Data}>).detail;
   if(!detail?.state||!Number.isSafeInteger(detail.version))return;
   syncedVersion.current=detail.version;
   setVersion(detail.version);
   setExists(true);
   lastSaved.current=serialize(detail.state);
   setBaseline(lastSaved.current);
   setNotice("선택한 그룹의 등록·배정이 서버에 즉시 저장됐습니다.");
   setAuto(true);
  }
  window.addEventListener("moment:workspace-synced",updateFromGroupSelection);
  return()=>window.removeEventListener("moment:workspace-synced",updateFromGroupSelection);
 },[]);

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
   setAuto(true);
   if(!silent)setNotice("현재 설정을 서버에 저장했습니다.");
  }catch(e){
   setAuto(false);localStorage.removeItem("ace.autosave");
   setNotice((silent?"자동 저장 중단: ":"")+(e instanceof Error?e.message:"저장 실패")+" · 내용을 확인한 뒤 다시 저장하세요.");
  }finally{busy.current=false;setWorking(false)}
 }
 async function save(){
  if(busy.current||status!=="ready")return;

  await persist(state);
 }
 async function load(){
  if(busy.current||!exists)return;

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
  <div className="nxPanelHeading"><div><h2>실제 운영 데이터</h2><p>서버를 기준으로 계정·그룹·페르소나 설정을 자동 동기화합니다.</p></div></div>
  <div className="nxBackupNote"><Database size={16}/> {status==="checking"?"서버 확인 중":status==="ready"?exists?"서버 저장본 있음 · 버전 "+version:"서버 연결됨 · 저장된 설정 없음":"서버 저장 기능 연결 실패"}{updated?" · "+new Date(updated).toLocaleString("ko-KR"):""}</div>
  <div className="nxBackupActions"><button disabled={working||status!=="ready"} onClick={save}><Save size={16}/> 현재 설정 서버 저장</button>
  <button disabled={working||status!=="ready"||!exists} onClick={load}><Download size={16}/> 서버 설정 불러오기</button>
  <button disabled={working} onClick={()=>void refresh()}><RefreshCw size={16}/> 상태 새로고침</button></div>
  <p className="nxTip">{auto?"변경사항 자동 저장이 활성화되어 있습니다.":"서버 연결 및 최초 저장이 필요합니다."} 다른 화면에서 수정된 버전이 있으면 덮어쓰지 않고 오류를 표시합니다.</p>

  {notice&&<p className="nxBackupMessage" role="status">{notice}</p>}
 </section>;
}
