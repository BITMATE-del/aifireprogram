import {NextRequest,NextResponse} from "next/server";
import {aiBudget,budgetDb} from "../../../lib/ai-budget";
import {sameSiteRequest} from "../../../lib/request-origin";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(req:NextRequest){
 const accountId=req.nextUrl.searchParams.get("accountId")||"";
 if(!accountId||accountId.length>120)return reply({error:"계정을 선택하세요."},400);
 try{return reply({accountId,limits:await aiBudget(accountId)})}catch{return reply({error:"한도 조회 실패"},503)}
}
export async function PUT(req:NextRequest){
 if(!sameSiteRequest(req))return reply({error:"요청 출처 확인 실패"},403);
 try{
  const raw=await req.text();if(raw.length>3000)return reply({error:"요청 용량 초과"},413);
  const d=JSON.parse(raw);
  const accountId=d.accountId;
  const daily=Number(d.daily),monthly=Number(d.monthly),perMinute=Number(d.perMinute);
  if(typeof accountId!=="string"||!accountId.trim()||accountId.length>120||
    !Number.isFinite(daily)||daily<0||daily>100000||
    !Number.isFinite(monthly)||monthly<0||monthly>1000000||
    !Number.isInteger(perMinute)||perMinute<1||perMinute>120)
    return reply({error:"한도 값을 확인하세요. 금액은 USD, 0은 무제한입니다."},400);
  const db=await budgetDb();
  await db.query(`INSERT INTO moment_ai_budget(account_id,daily_limit_usd,monthly_limit_usd,minute_limit,updated_at)
    VALUES($1,$2,$3,$4,now()) ON CONFLICT(account_id) DO UPDATE SET
    daily_limit_usd=$2,monthly_limit_usd=$3,minute_limit=$4,updated_at=now()`,
    [accountId,daily,monthly,perMinute]);
  return reply({ok:true,limits:await aiBudget(accountId)});
 }catch{return reply({error:"한도 저장 실패"},503)}
}
