"use client";
import {useEffect,useState} from "react";
import {Check,Eye,EyeOff,KeyRound,Lock,Save,Trash2,WifiOff} from "lucide-react";
type Field="telegramApiId"|"telegramApiHash"|"telegramSession"|"openaiApiKey";
type Status={telegramApiId:boolean;telegramApiHash:boolean;telegramSession:boolean;openaiApiKey:boolean;updatedAt:string|null};
const labels:{field:Field;label:string;tip:string;hint:string}[]=[
 {field:"telegramApiId",label:"Telegram API ID",tip:"my.telegram.org에서 발급한 숫자",hint:"예: 12345678"},
 {field:"telegramApiHash",label:"Telegram API HASH",tip:"Telegram 개발자 페이지에서 함께 발급한 32자리 값",hint:"API HASH 입력"},
 {field:"telegramSession",label:"Telegram 로그인 세션",tip:"본인 PC에서 생성한 StringSession — 로그인 권한과 같습니다.",hint:"StringSession 값을 입력"},
 {field:"openaiApiKey",label:"OpenAI API 키",tip:"이 계정의 AI 응답 생성에 사용하는 API 키",hint:"sk-..."}
];
const empty:Status={telegramApiId:false,telegramApiHash:false,telegramSession:false,openaiApiKey:false,updatedAt:null};
export default function AccountCredentials({accountId}:{accountId:string}){
 const [status,setStatus]=useState<Status>(empty);
 const [inputs,setInputs]=useState<Record<Field,string>>({telegramApiId:"",telegramApiHash:"",telegramSession:"",openaiApiKey:""});
 const [visible,setVisible]=useState<Record<Field,boolean>>({telegramApiId:false,telegramApiHash:false,telegramSession:false,openaiApiKey:false});
 const [loading,setLoading]=useState(false),[working,setWorking]=useState<Field|null>(null);
 const [notice,setNotice]=useState("");
 const [testing,setTesting]=useState(false);
 useEffect(()=>{
  let alive=true;
  setInputs({telegramApiId:"",telegramApiHash:"",telegramSession:"",openaiApiKey:""});
  setStatus(empty);setNotice("");setLoading(true);
  fetch("/api/account-credentials?accountId="+encodeURIComponent(accountId),{cache:"no-store"})
   .then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error||"설정 조회 실패");return data})
   .then(data=>{if(alive)setStatus(data.status)})
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
   setStatus(data.status);
   setInputs(prev=>({...prev,[field]:""}));
   setNotice(value===null?"해당 인증정보를 해제했습니다.":"암호화 저장했습니다. 입력한 키는 다시 표시하지 않습니다.");
  }catch(e){setNotice(e instanceof Error?e.message:"저장 실패")}
  finally{setWorking(null)}
 }
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
   <div className="nxCredentialFields">{labels.map(row=><div className="nxCredentialField" key={row.field}>
    <div className="nxCredentialLabel"><strong>{row.label}</strong><span className={status[row.field]?"nxCredentialOn":"nxCredentialOff"}>{loading?"확인 중":status[row.field]?"등록됨":"미등록"}</span></div>
    <p>{row.tip}</p>
    <div className="nxCredentialControls">
      <div className="nxSecretInput"><input type={row.field==="telegramApiId"||visible[row.field]?"text":"password"} autoComplete="off" spellCheck={false} maxLength={8000} value={inputs[row.field]} placeholder={status[row.field]?"새 값을 입력하면 기존 값 교체":row.hint} onChange={e=>setInputs(prev=>({...prev,[row.field]:e.target.value}))}/>
      {row.field!=="telegramApiId"&&<button type="button" aria-label={visible[row.field]?"숨기기":"보기"} onClick={()=>setVisible(prev=>({...prev,[row.field]:!prev[row.field]}))}>{visible[row.field]?<EyeOff size={16}/>:<Eye size={16}/>}</button>}</div>
      <button className="nxCredentialSave" disabled={loading||!!working||!inputs[row.field].trim()} onClick={()=>mutate(row.field,inputs[row.field].trim())}><Save size={14}/> 저장</button>
      {status[row.field]&&<button className="nxCredentialDelete" disabled={loading||!!working} title="저장된 키 해제" onClick={()=>{if(confirm(row.label+" 저장값을 해제할까요?"))void mutate(row.field,null)}}><Trash2 size={15}/></button>}
    </div></div>)}</div>
   <div className="nxCredentialTest"><button disabled={testing||loading||!status.openaiApiKey} onClick={testOpenAi}><Check size={15}/>{testing?"키 확인 중":"저장된 OpenAI API 연결 확인"}</button><span>API 키 유효성만 확인하며 토큰 생성 비용이 발생하지 않는 조회입니다.</span></div>
   <div className="nxCredentialHelp"><WifiOff size={16}/><span>API ID·HASH·세션을 모두 등록해야 계정을 연결할 수 있습니다. 실제 연결은 별도 워커가 수행하며 현재 저장만으로 온라인 상태가 보장되지는 않습니다. API 키와 세션은 브라우저 저장소나 백업 파일에 포함되지 않습니다.</span></div>
   {notice&&<div className="nxCredentialNotice" role="status"><Check size={15}/>{notice}</div>}
 </section>;
}
