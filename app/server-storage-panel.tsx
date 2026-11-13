"use client";
import {useEffect,useState} from "react";
import {Database,Download,Save} from "lucide-react";
type Data={accounts:unknown[];groups:unknown[];people:unknown[];assignments:unknown[];messages:unknown[];activeGroup:string};
type Props={state:Data;onLoad:(value:Data)=>void};
export default function ServerStoragePanel({state,onLoad}:Props){
 const [status,setStatus]=useState<"checking"|"ready"|"unavailable">("checking");
 const [exists,setExists]=useState(false),[version,setVersion]=useState(0),[updated,setUpdated]=useState("");
 const [working,setWorking]=useState(false),[notice,setNotice]=useState("");
 async function refresh(){
  try{const r=await fetch("/api/workspace",{cache:"no-store"});const data=await r.json();if(!r.ok)throw Error(data.error||"서버 저장소에 연결하지 못했습니다.");
  setStatus("ready");setExists(data.exists===true);setVersion(data.version||0);setUpdated(data.updatedAt||"");
  }catch(e){setStatus("unavailable");setNotice(e instanceof Error?e.message:"서버 저장소 연결 실패");}
 }
 useEffect(()=>{void refresh()},[]);
 async function save(){
  if(working)return;
  if(exists&&!confirm("현재 브라우저의 계정·그룹·대화 기록을 서버 저장본에 덮어씁니다. 계속할까요?"))return;
  setWorking(true);setNotice("");
  try{
   const r=await fetch("/api/workspace",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({version,state})});
   const data=await r.json();
   if(!r.ok)throw Error(data.error||"서버 저장 실패");
   setVersion(data.version);setExists(true);setUpdated(data.updatedAt||"");setNotice("현재 브라우저의 설정을 서버에 저장했습니다.");
  }catch(e){setNotice(e instanceof Error?e.message:"저장 실패");}
  finally{setWorking(false)}
 }
 async function load(){
  if(working||!exists)return;
  if(!confirm("서버 저장본을 불러오면 현재 브라우저의 저장되지 않은 변경사항이 덮어씌워집니다. 계속할까요?"))return;
  setWorking(true);setNotice("");
  try{
   const r=await fetch("/api/workspace",{cache:"no-store"});const data=await r.json();
   if(!r.ok||!data.state)throw Error(data.error||"저장된 서버 데이터가 없습니다.");
   onLoad(data.state as Data);setVersion(data.version);setUpdated(data.updatedAt||"");
   setNotice("서버 저장본을 불러왔습니다. 변경사항은 먼저 브라우저에 반영됩니다.");
  }catch(e){setNotice(e instanceof Error?e.message:"불러오기 실패");}
  finally{setWorking(false)}
 }
 return <section className="nxPanel nxUnderPanel"><div className="nxPanelHeading"><div><h2>PostgreSQL 서버 저장</h2><p>서로 다른 브라우저에서 설정을 전달하기 위한 서버 저장본입니다.</p></div></div>
 <div className="nxBackupNote"><Database size={16}/> {status==="checking"?"서버 데이터베이스 확인 중":status==="ready"?exists?"서버 저장본 있음 · 버전 "+version:"서버 연결됨 · 저장된 설정 없음":"서버 저장 기능을 아직 사용할 수 없습니다."}{updated?" · "+new Date(updated).toLocaleString("ko-KR"):""}</div>
 <div className="nxBackupActions"><button disabled={working||status!=="ready"} onClick={save}><Save size={16}/> 현재 설정 서버에 저장</button><button disabled={working||status!=="ready"||!exists} onClick={load}><Download size={16}/> 서버 저장본 불러오기</button><button disabled={working} onClick={refresh}>상태 다시 확인</button></div>
 <p className="nxTip">안전한 초기 이관을 위해 현재는 수동 저장·불러오기 방식입니다. 다른 기기에서 작업하기 전 서버 저장본을 불러오세요. 자동 동기화와 변경 충돌 병합은 아직 구현되지 않았습니다.</p>
 {notice&&<p className="nxBackupMessage" role="status">{notice}</p>}</section>;
}
