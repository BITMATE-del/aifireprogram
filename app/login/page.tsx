"use client";
import { FormEvent, useState } from "react";
import { BrainCircuit, LockKeyhole } from "lucide-react";
export default function Login(){
 const [password,setPassword]=useState("");const [loading,setLoading]=useState(false);const [error,setError]=useState("");
 async function submit(e:FormEvent){e.preventDefault();setLoading(true);setError("");try{
 const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});
 const data=await response.json();if(!response.ok)throw new Error(data.error||"로그인 실패");window.location.assign("/");
 }catch(err){setError(err instanceof Error?err.message:"로그인 오류");}finally{setLoading(false);}}
 return <main className="loginPage"><form className="loginCard" onSubmit={submit}><div className="brandIcon"><BrainCircuit size={25}/></div><h1>AI COMMUNITY ENGINE</h1><p>관리자 전용 운영센터</p><label>관리자 비밀번호<input type="password" value={password} autoComplete="current-password" onChange={e=>setPassword(e.target.value)} placeholder="비밀번호 입력" required autoFocus/></label>{error&&<div className="loginError">{error}</div>}<button disabled={loading||!password} className="primary wide" type="submit"><LockKeyhole size={16}/>{loading?"인증 중...":"관리자 로그인"}</button><small>인증 후 운영 화면을 사용할 수 있습니다.</small></form></main>;
}
