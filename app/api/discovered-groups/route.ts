import {NextResponse} from "next/server";
import {allowedChats,bridgeDatabase} from "../../../lib/group-bridge";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 try{
  const db=await bridgeDatabase();
  const records=await db.query(`SELECT account_id,chat_id,title,discovered_at
     FROM moment_discovered_groups ORDER BY discovered_at DESC LIMIT 200`);
  const allow=allowedChats();
  return NextResponse.json({groups:records.rows.map(r=>({
    accountId:r.account_id,id:r.chat_id,name:r.title,
    detectedAt:r.discovered_at,allowed:allow.has(r.chat_id)
  }))},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"발견된 그룹 정보를 불러오지 못했습니다."},{status:503})}
}
