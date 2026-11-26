import {NextRequest,NextResponse} from "next/server";
import {credentialsStatus,defaultCredentialStatus} from "../../../lib/credential-vault";
import {bridgeDatabase} from "../../../lib/group-bridge";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const accountId=req.nextUrl.searchParams.get("accountId");
 if(!accountId||accountId.length>120||accountId==="__global_defaults__")return NextResponse.json({error:"계정을 선택하세요."},{status:400});
 try{
  const [credential,defaultKeys,db]=await Promise.all([credentialsStatus(accountId),defaultCredentialStatus(),bridgeDatabase()]);
  const [heartbeat,config]=await Promise.all([
   db.query(`SELECT chat_id,last_seen,(last_seen>now()-interval '90 seconds') AS online
       FROM moment_telegram_heartbeats WHERE account_id=$1 ORDER BY last_seen DESC LIMIT 50`,[accountId]),
   db.query("SELECT content FROM moment_workspace_state WHERE id='primary'")
  ]);
  const info=config.rows[0]?.content as {accounts?:{id:string;enabled:boolean}[];assignments?:{accountId:string;groupId:string}[]}|undefined;
  const registered=Boolean(info?.accounts?.some(x=>x.id===accountId));
  const assigned=info?.assignments?.filter(x=>x.accountId===accountId).length||0;
  const chats=heartbeat.rows.map((h:{chat_id:string;last_seen:Date;online:boolean})=>({groupId:h.chat_id,lastSeen:h.last_seen,online:h.online}));
  return NextResponse.json({
   registered,assigned,apiReady:(credential.telegramApiId||defaultKeys.telegramApiId)&&(credential.telegramApiHash||defaultKeys.telegramApiHash),
   sessionSaved:credential.telegramSession,
   connected:chats.some(x=>x.online),
   chats,
   state:!credential.telegramSession?"session_missing":!registered?"not_saved":!assigned?"group_not_assigned":chats.some(x=>x.online)?"online":"offline"
  },{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"연결 상태 조회 실패"},{status:503});}
}
