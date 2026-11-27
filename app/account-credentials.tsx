"use client";
import {useEffect,useRef,useState} from "react";
import {Check,Eye,EyeOff,KeyRound,Lock,Save,Trash2,Upload,WifiOff} from "lucide-react";
import TelegramPhoneLogin from "./telegram-phone-login";
import AccountConnectionStatus from "./account-connection-status";
type Field="telegramApiId"|"telegramApiHash"|"telegramSession"|"openaiApiKey";
type Status={telegramApiId:boolean;telegramApiHash:boolean;telegramSession:boolean;openaiApiKey:boolean;updatedAt:string|null};
type Source="custom"|"default"|"none";
type Sources=Record<Field,Source>;
const none:Sources={telegramApiId:"none",telegramApiHash:"none",telegramSession:"none",openaiApiKey:"none"};
const labels:{field:Field;label:string;tip:string;hint:string}[]=[
 {field:"telegramApiId",label:"Telegram API ID",tip:"my.telegram.org에서 발급한 숫자",hint:"예: 12345678"},
 {field:"telegramApiHash",label:"Telegram API HASH",tip:"Telegram 개발자 페이지에서 함께 발급한 32자리 값",hint:"API HASH 입력"},
 {field:"telegramSession",label:"Telegram 로그인 세션",tip:"본인 PC에서 생성한 StringSession — 로그인 권한과 같습니다.",hint:"StringSession 값을 입력"},
 {field:"openaiApiKey",label:"OpenAI API 키",tip:"이 계정의 AI 응답 생성에 사용하는 API 키",hint:"sk-..."}
];
const empty:Status={telegramApiId:false,telegramApiHash:false,telegramSession:false,openaiApiKey:false,updatedAt:null};
export default function AccountCredentials({accountId}:{accountId:string}){
 const [status,setStatus]=useState<Status>(empty);
 const [sources,setSources]=useState<Sources>(none);
 const [inputs,setInputs]=useState<Record<Field,string>>({telegramApiId:"",telegramApiHash:"",telegramSession:"",openaiApiKey:""});
 const [visible,setVisible]=useState<Record<Field,boolean>>({telegramApiId:false,telegramApiHash:false,telegramSession:false,openaiApiKey:false});
 const [loading,setLoading]=useState(false),[working,setWorking]=useState<Field|null>(null);
 const [notice,setNotice]=useState("");
 const [testing,setTesting]=useState(false);
 const [loginMode,setLoginMode]=useState<"phone"|"session">("phone");
 const fileInput=useRef<HTMLInputElement>(null);
 const [uploading,setUploading]=useState(false);
 const [importPending,setImportPending]=useState(false);
 const [importMessage,setImportMessage]=useState("");
 useEffect(()=>{
  let alive=true;
  setInputs({telegramApiId:"",telegramApiHash:"",telegramSession:"",openaiApiKey:""});
  setStatus(empty);setSources(none);setNotice("");setLoading(true);setImportPending(false);setImportMessage("");
  fetch("/api/account-credentials?accountId="+encodeURIComponent(accountId),{cache:"no-store"})
   .then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error||"설정 조회 실패");return data})
   .then(data=>{if(alive){setStatus(data.status);setSources(data.sources||none)}})
   .catch(e=>{if(alive)setNotice(e instanceof Error?e.message:"상태 확인 실패")})
   .finally(()=>{if(alive)setLoading(false)});
  return()=>{alive=false};
 },[accountId]);
 async function mutate(field:Field,value:string|null){
  if(working)return;
  setWorking(field);setNotice("");
  try{
   const res=await fetch("/api/account-credentials",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId,field,value})});
   const data=await res.json();
   if(!res.ok)throw Error(data.error||"저장 실패");
   setStatus(data.status);setSources(data.sources||none);
   setInputs(prev=>({...prev,[field]:""}));
   setNotice(value===null?"해당 인증정보를 해제했습니다.":"암호화 저장했습니다. 입력한 키는 다시 표시하지 않습니다.");
  }catch(e){setNotice(e instanceof Error?e.message:"저장 실패")}
  finally{setWorking(null)}
 }
 async function refreshCredentialStatus(){
  try{
   const r=await fetch("/api/account-credentials?accountId="+encodeURIComponent(accountId),{cache:"no-store"});
   const data=await r.json();
   if(r.ok){setStatus(data.status);setSources(data.sources||none);}
  }catch{}
 }
 async function uploadSessionFile(file:File){
  if(uploading||working)return;
  if(!/\\.(session|txt)$/i.test(file.name)){setNotice(".session 또는 .txt 파일만 선택해 주세요.");return;}
  if(file.size<85||file.size>512*1024){setNotice("세션 파일은 최대 512KB까지 지원합니다.");return;}
  setUploading(true);setNotice("");setImportMessage("");
  try{
   const payload=new FormData();
   payload.set("accountId",accountId);payload.set("file",file);
   const res=await fetch("/api/session-file",{method:"POST",body:payload});
   const data=await res.json();
   if(!res.ok)throw Error(data.error||"세션 파일 업로드 실패");
   setNotice(data.message||"세션 파일 등록 요청 완료");
   if(data.phase==="connected"){setImportPending(false);await refreshCredentialStatus();}
   else if(data.phase==="pending"){setImportPending(true);setImportMessage("SQLite 세션 파일 변환 중");}
  }catch(e){setNotice(e instanceof Error?e.message:"세션 파일 등록 실패");setImportPending(false);}
  finally{setUploading(false);if(fileInput.current)fileInput.current.value="";}
 }
 useEffect(()=>{
  if(!importPending)return;
  let active=true;
  const check=async()=>{
   try{
    const response=await fetch("/api/session-file?accountId="+encodeURIComponent(accountId),{cache:"no-store"});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||"세션 등록 상태 조회 실패");
    if(!active)return;
    if(result.phase==="connected"){
     setImportPending(false);setImportMessage("");
     setNotice(result.message||"세션 파일 등록이 완료됐습니다.");
     await refreshCredentialStatus();
    }else if(result.phase==="error"){
     setImportPending(false);setImportMessage("");
     setNotice(result.message||"세션 파일을 확인할 수 없습니다.");
    }else{
     setImportMessage(result.phase==="processing"?"SQLite 세션 확인 중":"세션 변환 대기 중");
    }
   }catch(e){if(active){setImportPending(false);setImportMessage("");setNotice(e instanceof Error?e.message:"등록 상태를 확인하지 못했습니다.");}}
  };
  void check();const timer=setInterval(()=>void check(),3000);
  return()=>{active=false;clearInterval(timer)};
 },[accountId,importPending]);
 async function testOpenAi(){
  if(testing)return;setTesting(true);setNotice("");
  try{
   const res=await fetch("/api/account-credentials/test",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId})});
   const data=await res.json();
   if(!res.ok)throw Error(data.error||"API 인증 확인 실패");
   setNotice(data.message||"OpenAI 키 인증 확인 완료");
  }catch(e){setNotice(e instanceof Error?e.message:"OpenAI 키 확인 오류")}
  finally{setTesting(false)}
 }
 return <section className="nxCredentialPanel">
   <div className="nxCredentialHead"><div><strong><KeyRound size={17}/> 계정별 API 연결</strong><p><b>{accountId}</b> 계정만의 인증정보를 등록합니다.</p></div><span className="nxCredentialSecure"><Lock size={13}/> 서버 암호화</span></div>
   <div className="nxTelegramMode"><strong>텔레그램 계정 로그인 방식</strong><div><button className={loginMode==="phone"?"active":""} onClick={()=>setLoginMode("phone")}>전화번호로 일반 로그인</button><button className={loginMode==="session"?"active":""} onClick={()=>setLoginMode("session")}>세션 파일·직접 입력</button></div></div>
   <div className="nxCredentialFields">{labels.map(row=>row.field==="telegramSession"&&loginMode==="phone"?<div className="nxCredentialField" key={row.field}><TelegramPhoneLogin accountId={accountId} onConnected={()=>{void refreshCredentialStatus()}}/></div>:<div className="nxCredentialField" key={row.field}>
    <div className="nxCredentialLabel"><strong>{row.label}</strong><span className={sources[row.field]!=="none"?"nxCredentialOn":"nxCredentialOff"}>{loading?"확인 중":sources[row.field]==="custom"?"개별 설정":sources[row.field]==="default"?"전체 기본값 사용":"미설정"}</span></div>
    <p>{row.tip}</p>
    <div className="nxCredentialControls">
      <div className="nxSecretInput"><input type={row.field==="telegramApiId"||visible[row.field]?"text":"password"} autoComplete="off" spellCheck={false} maxLength={8000} value={inputs[row.field]} placeholder={sources[row.field]==="custom"?"새 개별값으로 변경":sources[row.field]==="default"?"비워두면 전체 기본값 사용":row.hint} onChange={e=>setInputs(prev=>({...prev,[row.field]:e.target.value}))}/>
      {row.field!=="telegramApiId"&&<button type="button" aria-label={visible[row.field]?"숨기기":"보기"} onClick={()=>setVisible(prev=>({...prev,[row.field]:!prev[row.field]}))}>{visible[row.field]?<EyeOff size={16}/>:<Eye size={16}/>}</button>}</div>
      <button className="nxCredentialSave" disabled={loading||!!working||!inputs[row.field].trim()} onClick={()=>mutate(row.field,inputs[row.field].trim())}><Save size={14}/> 저장</button>
      {sources[row.field]==="custom"&&<button className="nxCredentialDelete" disabled={loading||!!working} title={row.field==="telegramSession"?"저장된 세션 해제":"개별값 해제하고 기본값 사용"} onClick={()=>{if(confirm(row.label+" 개별값을 해제하시겠습니까? 기본값이 있다면 자동 적용됩니다."))void mutate(row.field,null)}}><Trash2 size={15}/></button>}
    </div>
    {row.field==="telegramSession"&&loginMode==="session"&&<div className="nxSessionFileUpload">
      <input ref={fileInput} type="file" accept=".session,.txt" aria-label="텔레그램 세션 파일 선택" onChange={e=>{const f=e.target.files?.[0];if(f)void uploadSessionFile(f);}} disabled={uploading||!!working} hidden/>
      <button type="button" className="nxSessionFileButton" disabled={uploading||!!working} onClick={()=>fileInput.current?.click()}><Upload size={16}/>{uploading?"업로드 중":"세션 파일 선택"}</button>
      <span>Telethon <b>.session</b> 또는 StringSession <b>.txt</b> · 최대 512KB</span>
      {importPending&&<strong className="nxSessionFileProgress">{importMessage||"세션 변환 중"}</strong>}
    </div>}
    </div>)}</div>
   <div className="nxCredentialTest"><button disabled={testing||loading||sources.openaiApiKey==="none"} onClick={testOpenAi}><Check size={15}/>{testing?"키 확인 중":"저장된 OpenAI API 연결 확인"}</button><span>API 키 유효성만 확인하며 토큰 생성 비용이 발생하지 않는 조회입니다.</span></div>
   <AccountConnectionStatus accountId={accountId}/>
   <div className="nxCredentialHelp"><WifiOff size={16}/><span>Telegram API ID·HASH는 전체 기본값을 사용할 수 있습니다. 전화번호 인증으로 계정별 로그인 세션을 자동 생성하거나, 기존 StringSession을 직접 입력하거나 .session/.txt 파일로 등록할 수 있습니다. 등록 후 연결은 별도 워커가 수행합니다. API 키와 세션은 브라우저 저장소나 백업 파일에 포함되지 않습니다.</span></div>
   {notice&&<div className="nxCredentialNotice" role="status"><Check size={15}/>{notice}</div>}
 </section>;
}
