"use client";
import {useRef,useState} from "react";
import {Download,Upload,ShieldCheck} from "lucide-react";
const keys=["ace.accounts","ace.groups","ace.people","ace.assignments","ace.messages","ace.activeGroup"] as const;
type Backup={format:"moment-studio-backup";version:1;exportedAt:string;data:Record<string,unknown>};
export default function BackupPanel(){
 const fileInput=useRef<HTMLInputElement>(null);
 const [message,setMessage]=useState("");
 function exportData(){
  const data:Record<string,unknown>={};
  for(const key of keys){const raw=localStorage.getItem(key);if(raw!==null){try{data[key]=JSON.parse(raw)}catch{data[key]=raw}}}
  const pack:Backup={format:"moment-studio-backup",version:1,exportedAt:new Date().toISOString(),data};
  const blob=new Blob([JSON.stringify(pack,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download="moment-studio-backup-"+new Date().toISOString().slice(0,10)+".json";a.click();URL.revokeObjectURL(url);
  setMessage("설정 및 대화 기록 백업 파일을 생성했습니다. 파일을 안전하게 보관하세요.");
 }
 async function importData(file:File){
  try{
   if(file.size>5_000_000)throw new Error("5MB 이하 백업 파일만 가져올 수 있습니다.");
   const imported=JSON.parse(await file.text()) as Backup;
   if(imported?.format!=="moment-studio-backup"||imported.version!==1||!imported.data||typeof imported.data!=="object")throw new Error("모먼트 스튜디오 백업 파일이 아닙니다.");
   const data=imported.data;
   for(const key of keys.slice(0,5))if(data[key]!==undefined&&!Array.isArray(data[key]))throw new Error("백업 파일 데이터 구조가 맞지 않습니다.");
   if(data["ace.activeGroup"]!==undefined&&typeof data["ace.activeGroup"]!=="string")throw new Error("그룹 설정이 올바르지 않습니다.");
   if(!confirm("기존 브라우저 설정을 백업 파일 내용으로 바꾸고 새로고침합니다. 계속할까요?"))return;
   for(const key of keys){if(Object.prototype.hasOwnProperty.call(data,key))localStorage.setItem(key,JSON.stringify(data[key]));}
   window.location.reload();
  }catch(e){setMessage(e instanceof Error?e.message:"가져오기에 실패했습니다.");}
 }
 return <section className="nxPanel nxUnderPanel"><div className="nxPanelHeading"><div><h2>설정 백업 및 복원</h2><p>서버 데이터베이스 연결 전에는 브라우저 데이터를 직접 백업할 수 있습니다.</p></div></div>
 <div className="nxBackupActions"><button onClick={exportData}><Download size={16}/> 내 설정 백업하기</button><button onClick={()=>fileInput.current?.click()}><Upload size={16}/> 백업 파일 가져오기</button><input ref={fileInput} hidden type="file" accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];if(file)void importData(file);e.currentTarget.value="";}}/></div>
 <div className="nxBackupNote"><ShieldCheck size={16}/> 내보낸 파일에는 대화 기록과 계정 이름이 포함될 수 있으므로 외부에 공유하지 마세요. 비밀번호·API 키·텔레그램 세션은 포함하지 않습니다.</div>
 {message&&<p className="nxBackupMessage" role="status">{message}</p>}</section>
}
