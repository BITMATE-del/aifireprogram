import {NextRequest,NextResponse} from "next/server";
import {credentialsStatus,saveCredential,type SecretName} from "../../../lib/credential-vault";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const names=new Set<SecretName>(["telegramApiId","telegramApiHash","telegramSession","openaiApiKey"]);
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
const validAccount=(v:unknown)=>typeof v==="string"&&v.trim().length>0&&v.length<=120&&!/[\x00-\x1F]/.test(v);
export async function GET(req:NextRequest){
 const accountId=req.nextUrl.searchParams.get("accountId");
 if(!validAccount(accountId))return json({error:"계정을 선택해 주세요."},400);
 try{return json({accountId,status:await credentialsStatus(accountId!)})}
 catch{return json({error:"설정 상태를 읽을 수 없습니다. 서버 암호화 키와 DB 연결을 확인하세요."},503)}
}
export async function PATCH(req:NextRequest){
 const origin=req.headers.get("origin");
 if(origin&&origin!==req.nextUrl.origin)return json({error:"잘못된 요청 출처입니다."},403);
 try{
  const raw=await req.text();
  if(raw.length>12000)return json({error:"설정 용량을 초과했습니다."},413);
  const input=JSON.parse(raw) as {accountId?:unknown;field?:unknown;value?:unknown};
  if(!validAccount(input.accountId)||!names.has(input.field as SecretName))return json({error:"잘못된 계정 또는 설정 항목입니다."},400);
  const field=input.field as SecretName;
  const value=input.value;
  if(value!==null&&(typeof value!=="string"||!value.trim()||value.length>8000))return json({error:"값을 확인해주세요."},400);
  if(typeof value==="string"){
   if(field==="telegramApiId"&&!/^\d{4,12}$/.test(value.trim()))return json({error:"Telegram API ID는 숫자여야 합니다."},400);
   if(field==="telegramApiHash"&&!/^[a-fA-F0-9]{32}$/.test(value.trim()))return json({error:"Telegram API HASH는 32자리 16진수 문자열입니다."},400);
   if(field==="telegramSession"&&value.trim().length<80)return json({error:"Telegram 세션 값 형식을 확인하세요."},400);
   if(field==="openaiApiKey"&&!/^sk-[\w-]{12,}$/.test(value.trim()))return json({error:"OpenAI API 키 형식을 확인하세요."},400);
  }
  await saveCredential(input.accountId as string,field,typeof value==="string"?value.trim():null);
  return json({ok:true,status:await credentialsStatus(input.accountId as string)});
 }catch{return json({error:"저장하지 못했습니다. 서버 DB 또는 암호화 설정을 확인하세요."},503)}
}
