import {NextRequest,NextResponse} from "next/server";
import {DEFAULT_ACCOUNT_ID,defaultCredentialStatus,saveCredential,type InheritableField} from "../../../lib/credential-vault";
import {sameSiteRequest} from "../../../lib/request-origin";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const fields=new Set<InheritableField>(["telegramApiId","telegramApiHash","openaiApiKey"]);
const answer=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(){
 try{return answer({status:await defaultCredentialStatus()})}
 catch{return answer({error:"기본 API 설정을 조회할 수 없습니다."},503)}
}
export async function PATCH(req:NextRequest){
 if(!sameSiteRequest(req))return answer({error:"잘못된 요청 출처입니다."},403);
 try{
  const raw=await req.text();
  if(raw.length>10000)return answer({error:"요청 용량이 너무 큽니다."},413);
  const parsed=JSON.parse(raw) as {field?:unknown;value?:unknown};
  if(!fields.has(parsed.field as InheritableField))return answer({error:"기본값으로 사용할 수 없는 항목입니다."},400);
  const field=parsed.field as InheritableField;
  const value=parsed.value;
  if(value!==null&&(typeof value!=="string"||!value.trim()||value.length>8000))return answer({error:"값을 확인하세요."},400);
  if(typeof value==="string"){
   const clean=value.trim();
   if(field==="telegramApiId"&&!/^\d{4,12}$/.test(clean))return answer({error:"Telegram API ID는 숫자여야 합니다."},400);
   if(field==="telegramApiHash"&&!/^[a-fA-F0-9]{32}$/.test(clean))return answer({error:"Telegram API HASH는 32자리의 16진수입니다."},400);
   if(field==="openaiApiKey"&&!/^sk-[\w-]{12,}$/.test(clean))return answer({error:"OpenAI API 키 형식을 확인하세요."},400);
  }
  await saveCredential(DEFAULT_ACCOUNT_ID,field,typeof value==="string"?value.trim():null);
  return answer({ok:true,status:await defaultCredentialStatus()});
 }catch{return answer({error:"기본 API 정보를 저장하지 못했습니다."},503);}
}
