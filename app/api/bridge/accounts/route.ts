import {NextRequest,NextResponse} from "next/server";
import {allCredentialRecords,credentialDatabase} from "../../../../lib/credential-vault";
import {allowedChats,authorizedBridge} from "../../../../lib/group-bridge";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 if(!authorizedBridge(req))return NextResponse.json({error:"인증 실패"},{status:401,headers:{"Cache-Control":"no-store"}});
 try{
  const db=await credentialDatabase();
  const result=await db.query("SELECT content FROM moment_workspace_state WHERE id=$1",["primary"]);
  const content=result.rows[0]?.content as Record<string,unknown>|undefined;
  const accounts=Array.isArray(content?.accounts)?content.accounts as {id?:unknown;enabled?:unknown}[]:[];
  const assignments=Array.isArray(content?.assignments)?content.assignments as {accountId?:unknown;groupId?:unknown;mode?:unknown}[]:[];
  const enabled=new Set(accounts.filter(a=>a.enabled!==false&&typeof a.id==="string").map(a=>a.id as string));
  const allowed=allowedChats();
  const all=await allCredentialRecords();
  const data=all.flatMap(rec=>{
   if(!enabled.has(rec.accountId))return [];
   const chats=Array.from(new Set(assignments.filter(a=>a.accountId===rec.accountId&&a.mode!=="observer"&&typeof a.groupId==="string"&&allowed.has(a.groupId)).map(a=>a.groupId as string)));
   if(!chats.length)return [];
   return [{...rec,chatIds:chats}];
  });
  return NextResponse.json({accounts:data},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"계정 인증 설정을 조회하지 못했습니다."},{status:503,headers:{"Cache-Control":"no-store"}});}
}
