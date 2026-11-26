"use client";
import {useEffect,useState} from "react";
import {CheckCircle2,KeyRound,LockKeyhole,Phone,RefreshCw,ShieldCheck} from "lucide-react";
type Phase="idle"|"pending"|"processing"|"code_sent"|"password_required"|"connected"|"error";
export default function TelegramPhoneLogin({accountId,onConnected}:{accountId:string;onConnected:()=>void}){
 const [phase,setPhase]=useState<Phase>("idle");
 const [phone,setPhone]=useState("");
 const [code,setCode]=useState("");
 const [password,setPassword]=useState("");
 const [working,setWorking]=useState(false);
 const [notice,setNotice]=useState("");
 const [active,setActive]=useState(false);
 async function status(){
  try{
   const r=await fetch("/api/telegram-login?accountId="+encodeURIComponent(accountId),{cache:"no-store"});
   const data=await r.json();
   if(!r.ok)throw Error(data.error||"인증 상태 조회 실패");
   const next=data.phase as Phase;
   setPhase(next);setNotice(data.message||"");
   if(next==="connected"){setActive(false);onConnected();}
   else if(next==="error"||next==="idle")setActive(false);
  }catch(e){setNotice(e instanceof Error?e.message:"상태를 확인할 수 없습니다.");setActive(false)}
 }
 useEffect(()=>{setPhase("idle");setActive(false);setPhone("");setCode("");setPassword("");void status();},[accountId]);
 useEffect(()=>{
  if(!active)return;
  const timer=setInterval(()=>{void status()},3000);
  return()=>clearInterval(timer);
 },[active,accountId]);
 async function submit(action:"start"|"code"|"password"|"cancel"){
  if(working)return;setWorking(true);setNotice("");
  try{
   const body:Record<string,string>={accountId,action};
   if(action==="start")body.phone=phone;
   if(action==="code")body.code=code;
   if(action==="password")body.password=password;
   const r=await fetch("/api/telegram-login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
   const d=await r.json();
   if(!r.ok)throw Error(d.error||"텔레그램 인증 요청 실패");
   if(action==="start")setPhone("");
   if(action==="code")setCode("");
   if(action==="password")setPassword("");
   setPhase((d.phase||"pending") as Phase);setNotice(d.message||"요청을 처리하는 중입니다.");
   setActive(action!=="cancel");
  }catch(e){setNotice(e instanceof Error?e.message:"인증 요청 실패")}
  finally{setWorking(false)}
 }
 const busy=phase==="pending"||phase==="processing";
 return <div className="nxTelegramLogin">
  <div className="nxTelegramLoginHead"><span className="nxTelegramLoginIcon"><Phone size={19}/></span><div><strong>텔레그램 계정으로 로그인</strong><p>별도 PC 프로그램 없이 웹에서 본인 계정을 인증합니다.</p></div></div>
  {phase==="connected"?<div className="nxTelegramConnected"><CheckCircle2 size={19}/><div><strong>로그인 세션이 저장되었습니다.</strong><small>그룹 배정과 서버 저장을 완료하면 워커가 계정 연결을 시도합니다.</small></div></div>:<>
   {(phase==="idle"||phase==="error")&&<label>전화번호 (국가번호 포함)<input value={phone} autoComplete="tel" inputMode="tel" placeholder="+821012345678" onChange={e=>setPhone(e.target.value)} maxLength={20}/></label>}
   {phase==="code_sent"&&<label>텔레그램으로 받은 인증코드<input value={code} autoComplete="one-time-code" inputMode="numeric" placeholder="인증코드 5~6자리" onChange={e=>setCode(e.target.value)} maxLength={8}/></label>}
   {phase==="password_required"&&<label>텔레그램 2단계 인증 비밀번호<input type="password" autoComplete="off" value={password} placeholder="2단계 인증을 설정했다면 입력" onChange={e=>setPassword(e.target.value)} maxLength={256}/></label>}
   <div className="nxTelegramLoginActions">
     {(phase==="idle"||phase==="error")&&<button className="nxPrimary" disabled={working||!/^[+]\d{8,15}$/.test(phone.replace(/[\s()-]/g,""))} onClick={()=>void submit("start")}><Phone size={15}/> 인증코드 요청</button>}
     {phase==="code_sent"&&<button className="nxPrimary" disabled={working||!/^\d{4,8}$/.test(code.trim())} onClick={()=>void submit("code")}><KeyRound size={15}/> 인증코드 확인</button>}
     {phase==="password_required"&&<button className="nxPrimary" disabled={working||!password} onClick={()=>void submit("password")}><LockKeyhole size={15}/> 로그인 완료</button>}
     {busy&&<span className="nxTelegramPending"><RefreshCw size={15}/> 텔레그램 인증 처리 중...</span>}
     <button className="nxTelegramMinor" disabled={working} onClick={()=>void status()}><RefreshCw size={14}/> 상태 확인</button>
     {phase!=="idle"&&<button className="nxTelegramMinor" disabled={working} onClick={()=>void submit("cancel")}>처음부터 다시</button>}
   </div>
  </>}
  {notice&&<div className="nxTelegramNotice" role="status">{notice}</div>}
  <div className="nxTelegramSecurity"><ShieldCheck size={15}/><span>전화번호·인증코드·2단계 비밀번호는 인증에만 사용하며 화면에 다시 표시하지 않습니다. 인증 완료 후 계정별 세션만 암호화 저장합니다. 본인이 소유한 계정만 로그인하세요.</span></div>
 </div>;
}
