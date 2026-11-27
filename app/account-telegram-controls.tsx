"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {ImagePlus,Link2,RefreshCw,UserRound} from "lucide-react";
type Action={id:string;type:string;state:string;message:string;created_at:string;completed_at:string|null};
export default function AccountTelegramControls({accountId}:{accountId:string}){
 const [invite,setInvite]=useState(""),[firstName,setFirstName]=useState(""),[lastName,setLastName]=useState("");
 const [photo,setPhoto]=useState<File|null>(null);
 const [actions,setActions]=useState<Action[]>([]);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const upload=useRef<HTMLInputElement>(null);
 const refresh=useCallback(async()=>{
  try{
   const res=await fetch("/api/account-actions?accountId="+encodeURIComponent(accountId),{cache:"no-store"});
   const data=await res.json();if(!res.ok)throw Error(data.error||"작업 기록 조회 실패");
   setActions(Array.isArray(data.actions)?data.actions:[]);
  }catch(e){setNotice(e instanceof Error?e.message:"작업 상태 조회 실패")}
 },[accountId]);
 useEffect(()=>{setNotice("");setInvite("");setFirstName("");setLastName("");setPhoto(null);void refresh();const timer=setInterval(()=>void refresh(),7000);return()=>clearInterval(timer)},[refresh]);
 async function submit(type:"join_group"|"change_name"|"change_photo"){
  if(busy)return;
  setBusy(true);setNotice("");
  try{
   const form=new FormData();form.set("accountId",accountId);form.set("type",type);
   if(type==="join_group"){form.set("invite",invite.trim());if(!invite.trim())throw Error("그룹 초대 링크를 입력하세요.")}
   if(type==="change_name"){form.set("firstName",firstName.trim());form.set("lastName",lastName.trim());if(!firstName.trim())throw Error("변경할 이름을 입력하세요.")}
   if(type==="change_photo"){if(!photo)throw Error("사진을 선택하세요.");form.set("photo",photo);}
   const res=await fetch("/api/account-actions",{method:"POST",body:form});
   const data=await res.json();if(!res.ok)throw Error(data.error||"요청 실패");
   setNotice("작업 요청을 접수했습니다. 아래에서 실제 적용 결과를 확인할 수 있습니다.");
   if(type==="join_group")setInvite("");
   if(type==="change_photo"){setPhoto(null);if(upload.current)upload.current.value="";}
   await refresh();
  }catch(e){setNotice(e instanceof Error?e.message:"작업 요청 실패")}
  finally{setBusy(false)}
 }
 const title=(s:string)=>s==="join_group"?"그룹 입장":s==="change_name"?"이름 변경":"프로필 사진";
 const state=(s:string)=>s==="pending"?"접수":s==="processing"?"적용 중":s==="success"?"완료":"실패";
 return <section className="nxTelegramAccountManage">
  <div className="nxCredentialHead"><div><strong><UserRound size={17}/> 텔레그램 계정 직접 관리</strong><p>텔레그램 PC 창 없이, 연결된 계정으로 그룹 참여 및 프로필을 변경합니다.</p></div></div>
  <div className="nxTelegramActionGrid">
   <div className="nxTelegramAction"><strong><Link2 size={15}/> 그룹 입장</strong><input value={invite} onChange={e=>setInvite(e.target.value)} placeholder="https://t.me/+초대코드 또는 t.me/그룹아이디" maxLength={220}/><button disabled={busy||!invite.trim()} onClick={()=>void submit("join_group")}>그룹 입장</button></div>
   <div className="nxTelegramAction"><strong><UserRound size={15}/> 닉네임 변경</strong><div className="nxTelegramNameFields"><input value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="이름" maxLength={64}/><input value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="성 (선택)" maxLength={64}/></div><button disabled={busy||!firstName.trim()} onClick={()=>void submit("change_name")}>이름 적용</button></div>
   <div className="nxTelegramAction"><strong><ImagePlus size={15}/> 프로필 사진 변경</strong><input ref={upload} type="file" accept="image/jpeg,image/png" onChange={e=>setPhoto(e.target.files?.[0]||null)}/><button disabled={busy||!photo} onClick={()=>void submit("change_photo")}>{photo?"사진 적용":"사진 선택 후 적용"}</button></div>
  </div>
  {notice&&<p role="status" className="nxCredentialNotice">{notice}</p>}
  <div className="nxTelegramActionLog"><div className="nxAccountActionHeader"><strong>최근 계정 작업</strong><button disabled={busy} onClick={()=>void refresh()}><RefreshCw size={14}/> 새로고침</button></div>
   {actions.length?actions.map(x=><div key={x.id} className="nxAccountActionRow"><strong>{title(x.type)}</strong><span className={x.state==="success"?"ok":x.state==="failed"?"fail":""}>{state(x.state)}</span><small>{x.message||"텔레그램 워커에서 처리 대기 중"}</small></div>):<p className="nxTip">아직 계정 관리 작업이 없습니다.</p>}
  </div>
  <p className="nxTip">계정 연결이 확인된 상태에서 작업이 처리됩니다. 비공개 그룹은 유효한 초대 링크와 입장 권한이 필요하고, 프로필 사진은 JPG/PNG 2MB 이하로 등록할 수 있습니다.</p>
 </section>;
}
