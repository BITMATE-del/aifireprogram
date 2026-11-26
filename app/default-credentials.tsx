"use client";
import {useEffect,useState} from "react";
import {Check,Eye,EyeOff,Globe2,KeyRound,Lock,Save,Trash2} from "lucide-react";

type Field="telegramApiId"|"telegramApiHash"|"openaiApiKey";
type Status=Record<Field,boolean>;
const fields:{id:Field;name:string;help:string;placeholder:string}[]=[
 {id:"telegramApiId",name:"Telegram API ID",help:"연결할 계정들에 공통 적용할 API ID",placeholder:"API ID"},
 {id:"telegramApiHash",name:"Telegram API HASH",help:"연결할 계정들에 공통 적용할 API HASH",placeholder:"API HASH"},
 {id:"openaiApiKey",name:"OpenAI API 키",help:"별도 키를 등록하지 않은 계정의 기본 GPT API",placeholder:"sk-..."}
];
const blank:Status={telegramApiId:false,telegramApiHash:false,openaiApiKey:false};
export default function DefaultCredentials(){
 const [status,setStatus]=useState<Status>(blank);
 const [values,setValues]=useState<Record<Field,string>>({telegramApiId:"",telegramApiHash:"",openaiApiKey:""});
 const [show,setShow]=useState<Record<Field,boolean>>({telegramApiId:false,telegramApiHash:false,openaiApiKey:false});
 const [working,setWorking]=useState<Field|null>(null),[loading,setLoading]=useState(true),[notice,setNotice]=useState("");
 useEffect(()=>{
  fetch("/api/default-credentials",{cache:"no-store"})
   .then(async r=>{const x=await r.json();if(!r.ok)throw Error(x.error||"조회 실패");return x})
   .then(x=>setStatus(x.status)).catch(e=>setNotice(e instanceof Error?e.message:"조회 실패"))
   .finally(()=>setLoading(false));
 },[]);
 async function save(field:Field,value:string|null){
  if(working)return;setWorking(field);setNotice("");
  try{
   const r=await fetch("/api/default-credentials",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({field,value})});
   const x=await r.json();
   if(!r.ok)throw Error(x.error||"기본값 저장 실패");
   setStatus(x.status);setValues(prev=>({...prev,[field]:""}));
   setNotice(value===null?"기본 설정을 해제했습니다. 개별 설정은 유지됩니다.":"전체 기본값을 암호화 저장했습니다. 별도 설정이 없는 계정에 자동 적용됩니다.");
  }catch(e){setNotice(e instanceof Error?e.message:"저장 실패")}
  finally{setWorking(null)}
 }
 return <section className="nxPanel nxGlobalDefaults">
  <div className="nxGlobalHeading"><span className="nxGlobalIcon"><Globe2 size={20}/></span><div><h3>전체 기본 API 설정</h3><p>한 번만 입력하면 모든 계정에서 기본값으로 사용합니다. 계정별 설정이 있으면 그 값을 우선합니다.</p></div><span className="nxCredentialSecure"><Lock size={13}/> 서버 암호화</span></div>
  <div className="nxGlobalGrid">{fields.map(row=><div key={row.id} className="nxGlobalField">
    <div className="nxCredentialLabel"><strong>{row.name}</strong><span className={status[row.id]?"nxCredentialOn":"nxCredentialOff"}>{loading?"조회 중":status[row.id]?"기본값 저장됨":"미설정"}</span></div>
    <p>{row.help}</p>
    <div className="nxCredentialControls">
     <div className="nxSecretInput"><input type={row.id==="telegramApiId"||show[row.id]?"text":"password"} autoComplete="off" value={values[row.id]} placeholder={status[row.id]?"새 값을 입력하면 기본값 교체":row.placeholder} onChange={e=>setValues(v=>({...v,[row.id]:e.target.value}))}/>
      {row.id!=="telegramApiId"&&<button type="button" title={show[row.id]?"숨기기":"보기"} onClick={()=>setShow(v=>({...v,[row.id]:!v[row.id]}))}>{show[row.id]?<EyeOff size={15}/>:<Eye size={15}/>}</button>}
     </div>
     <button className="nxCredentialSave" disabled={loading||!!working||!values[row.id].trim()} onClick={()=>save(row.id,values[row.id].trim())}><Save size={14}/> 저장</button>
     {status[row.id]&&<button className="nxCredentialDelete" aria-label={row.name+" 기본값 해제"} disabled={loading||!!working} onClick={()=>{if(confirm("이 기본값을 해제할까요? 계정별 설정은 유지됩니다."))void save(row.id,null)}}><Trash2 size={14}/></button>}
    </div>
  </div>)}</div>
  <div className="nxGlobalInfo"><KeyRound size={16}/><p><b>적용 순서:</b> 개별 계정 API → 전체 기본 API → 기존 서버 OpenAI 환경변수(해당 시). <b>Telegram 로그인 세션은 절대로 공통 사용하지 않습니다.</b> 반드시 계정별로 등록해야 합니다.</p></div>
  {notice&&<div className="nxCredentialNotice" role="status"><Check size={15}/>{notice}</div>}
 </section>;
}
