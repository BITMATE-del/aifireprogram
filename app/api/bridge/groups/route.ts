import {NextRequest,NextResponse} from "next/server";
import {authorizedBridge,bridgeDatabase,safeAccountId,safeChatId} from "../../../../lib/group-bridge";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 if(!authorizedBridge(req))return NextResponse.json({error:"인증 실패"},{status:401});
 try{
  const raw=await req.text();
  if(raw.length>25000)return NextResponse.json({error:"요청 용량 초과"},{status:413});
  const input=JSON.parse(raw);
  const id=safeAccountId(input.accountId);
  const groups=Array.isArray(input.groups)?input.groups.slice(0,100):[];
  if(!id)return NextResponse.json({error:"계정 ID 누락"},{status:400});
  const db=await bridgeDatabase();
  let count=0;
  for(const item of groups){
   const chatId=safeChatId(item?.id),title=typeof item?.title==="string"?item.title.trim().slice(0,120):"";
   if(!chatId||!title)continue;
   await db.query(`INSERT INTO moment_discovered_groups(account_id,chat_id,title,discovered_at)
     VALUES($1,$2,$3,now())
     ON CONFLICT(account_id,chat_id) DO UPDATE SET title=$3,discovered_at=now()`,[id,chatId,title]);
   count++;
  }
  return NextResponse.json({ok:true,count});
 }catch{return NextResponse.json({error:"그룹 확인 정보를 저장하지 못했습니다."},{status:503})}
}
