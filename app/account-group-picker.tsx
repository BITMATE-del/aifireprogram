"use client";
import {useCallback,useEffect,useState} from "react";
import {Check,RefreshCw,Users,WifiOff} from "lucide-react";
type Group={id:string;name:string};
type Assignment={accountId:string;groupId:string;personaId:string;mode:"member"|"expert"|"observer"};
type WorkspaceState={accounts:unknown[];groups:Group[];people:unknown[];assignments:Assignment[];messages:unknown[];activeGroup:string};
type Found={accountId:string;id:string;name:string;detectedAt:string;allowed:boolean};
export default function AccountGroupPicker({accountId,assignments,onSynced}:{
 accountId:string;
 assignments:Assignment[];
 onSynced:(state:WorkspaceState,version:number)=>void;
}){
 const [items,setItems]=useState<Found[]>([]);
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState<string|null>(null);
 const [notice,setNotice]=useState("");
 const refresh=useCallback(async()=>{
  setLoading(true);setNotice("");
  try{
   const response=await fetch("/api/discovered-groups",{cache:"no-store"});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||"그룹 목록을 가져오지 못했습니다.");
   setItems((Array.isArray(data.groups)?data.groups:[]).filter((g:Found)=>g.accountId===accountId));
  }catch(e){setNotice(e instanceof Error?e.message:"그룹 조회 실패")}
  finally{setLoading(false)}
 },[accountId]);
 useEffect(()=>{setItems([]);void refresh()},[refresh]);
 async function toggle(group:Found,next:boolean){
  if(saving)return;
  setSaving(group.id);setNotice("");
  try{
   const response=await fetch("/api/group-selection",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId,chatId:group.id,checked:next})});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||"그룹 설정 변경 실패");
   onSynced(data.state as WorkspaceState,Number(data.version));
   setNotice(next?"그룹이 등록되고 계정에 배정됐습니다. AI 페르소나는 별도 탭에서 변경할 수 있습니다.":"그룹 배정을 해제했습니다. 다른 계정의 설정은 유지됩니다.");
   await refresh();
  }catch(e){setNotice(e instanceof Error?e.message:"변경 실패")}
  finally{setSaving(null)}
 }
 const unique=[...new Map(items.map(g=>[g.id,g])).values()];
 const count=unique.filter(g=>assignments.some(a=>a.accountId===accountId&&a.groupId===g.id)).length;
 return <section className="nxPanel nxAccountGroups">
  <div className="nxPanelHeading"><div><h2>참여할 그룹 선택 <small>{count}개 선택</small></h2><p>로그인한 텔레그램 계정의 그룹을 불러옵니다. 체크하면 등록과 서버 배정이 한 번에 완료됩니다.</p></div><button disabled={loading||!!saving} onClick={()=>void refresh()}><RefreshCw size={15}/>{loading?"조회 중":"목록 새로고침"}</button></div>
  {unique.length?unique.map(g=>{
   const checked=assignments.some(a=>a.accountId===accountId&&a.groupId===g.id);
   return <label key={g.id} className={"nxGroupCheckRow "+(checked?"checked":"")}>
    <input type="checkbox" checked={checked} disabled={!!saving} onChange={e=>void toggle(g,e.target.checked)}/>
    <span className="nxGroupCheckIcon"><Users size={16}/></span>
    <span className="nxGroupCheckInfo"><strong>{g.name}</strong><small>{g.id}</small></span>
    <span className="nxGroupCheckStatus">{saving===g.id?"저장 중":checked?<><Check size={14}/> 배정됨</>:"미선택"}</span>
   </label>;
  }):<div className="nxGroupEmpty"><WifiOff size={21}/><strong>아직 그룹 목록을 확인하지 못했습니다.</strong><p>텔레그램 로그인 세션이 저장됐다면 워커가 해당 계정을 연결해 참여 그룹을 가져옵니다. 계정 등록이 서버에 저장되어 있어야 하며, 로그인 직후에는 연결에 시간이 걸릴 수 있습니다.</p></div>}
  <p className="nxTip">그룹 조회만으로 메시지를 읽거나 보내지 않습니다. 실제 활동은 체크한 그룹에서만 허용되며, AI 답변은 별도 승인 후에만 전송됩니다.</p>
  {notice&&<p className="nxBackupMessage" role="status">{notice}</p>}
 </section>;
}
