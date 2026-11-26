import {NextRequest,NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {sameSiteRequest} from "../../../lib/request-origin";
import {encryptTransientSecret,loginDb} from "../../../lib/telegram-login-store";
import {credentialsStatus} from "../../../lib/credential-vault";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const result=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"no-store"}});
const validId=(s:unknown):s is string=>typeof s==="string"&&s.length>=1&&s.length<=120&&s!=="__global_defaults__";

export async function GET(req:NextRequest){
 const id=req.nextUrl.searchParams.get("accountId");
 if(!validId(id))return result({error:"계정을 선택하세요."},400);
 try{
  const db=await loginDb();
  const {rows}=await db.query("SELECT phase,message,expires_at,updated_at FROM moment_telegram_login WHERE account_id=$1",[id]);
  const r=rows[0];
  const expired=r&&new Date(r.expires_at).getTime()<=Date.now();
  const stalled=r&&r.phase==="processing"&&new Date(r.updated_at).getTime()<Date.now()-90000;
  const phase=(expired&&r.phase!=="connected")||stalled?"error":r?.phase||"idle";
  return result({phase,message:expired?"인증 시간이 만료됐습니다. 다시 시작하세요.":stalled?"인증 연결이 중단됐습니다. 처음부터 다시 진행하세요.":r?.message||null,connected:(await credentialsStatus(id)).telegramSession});
 }catch{return result({error:"인증 상태를 확인할 수 없습니다."},503)}
}
export async function POST(req:NextRequest){
 if(!sameSiteRequest(req))return result({error:"잘못된 요청 출처입니다."},403);
 let body:{accountId?:unknown;action?:unknown;phone?:unknown;code?:unknown;password?:unknown};
 try{const t=await req.text();if(t.length>1500)return result({error:"입력값이 너무 깁니다."},413);body=JSON.parse(t);}catch{return result({error:"요청 형식이 올바르지 않습니다."},400)}
 if(!validId(body.accountId))return result({error:"계정을 선택하세요."},400);
 const accountId=body.accountId;
 try{
  const db=await loginDb();
  if(body.action==="start"){
   const phone=String(body.phone||"").trim().replace(/[\s()-]/g,"");
   if(!/^\+[1-9]\d{7,14}$/.test(phone))return result({error:"국가번호를 포함한 전화번호를 입력하세요. 예: +821012345678"},400);
   const check=await db.query("SELECT phase,updated_at,attempts FROM moment_telegram_login WHERE account_id=$1",[accountId]);
   if(check.rows[0]&&["pending","processing","code_sent","password_required"].includes(check.rows[0].phase)&&new Date(check.rows[0].updated_at).getTime()>Date.now()-25000)return result({error:"이미 인증을 진행 중입니다. 잠시 후 상태를 확인하세요."},429);
   if(check.rows[0]&&Number(check.rows[0].attempts)>=5&&new Date(check.rows[0].updated_at).getTime()>Date.now()-3600000)return result({error:"인증 시도 횟수가 초과됐습니다. 1시간 후 다시 시도하세요."},429);
   const requestId=randomUUID();
   await db.query(`INSERT INTO moment_telegram_login(account_id,request_id,phase,action,payload_cipher,attempts,created_at,updated_at,expires_at,message)
    VALUES($1,$2,'pending','start',$3,1,now(),now(),now()+interval '10 minutes',NULL)
    ON CONFLICT(account_id) DO UPDATE SET request_id=$2,phase='pending',action='start',
    payload_cipher=$3,attempts=CASE WHEN moment_telegram_login.updated_at>now()-interval '1 hour' THEN moment_telegram_login.attempts+1 ELSE 1 END,
    created_at=now(),updated_at=now(),expires_at=now()+interval '10 minutes',message=NULL`,[accountId,requestId,encryptTransientSecret(phone)]);
   return result({ok:true,phase:"pending",message:"텔레그램으로 인증코드를 요청하고 있습니다."});
  }
  if(body.action==="code"){
   const code=String(body.code||"").trim().replace(/\s/g,"");
   if(!/^\d{4,8}$/.test(code))return result({error:"텔레그램에서 받은 숫자 인증코드를 입력하세요."},400);
   const attempts=await db.query("SELECT attempts FROM moment_telegram_login WHERE account_id=$1 AND phase='code_sent'",[accountId]);
   if(!attempts.rowCount||Number(attempts.rows[0].attempts)>=8)return result({error:"인증 입력 횟수를 초과했습니다. 처음부터 다시 진행하세요."},429);
   const cipher=encryptTransientSecret(code);
   const r=await db.query(`UPDATE moment_telegram_login SET phase='pending',action='code',payload_cipher=$2,attempts=attempts+1,updated_at=now(),message=NULL
   WHERE account_id=$1 AND phase='code_sent' AND expires_at>now() RETURNING request_id`,[accountId,cipher]);
   if(!r.rowCount)return result({error:"인증코드 요청 단계가 아닙니다. 상태를 확인하거나 처음부터 진행하세요."},409);
   return result({ok:true,phase:"pending"});
  }
  if(body.action==="password"){
   const attempts=await db.query("SELECT attempts FROM moment_telegram_login WHERE account_id=$1 AND phase='password_required'",[accountId]);
   if(!attempts.rowCount||Number(attempts.rows[0].attempts)>=8)return result({error:"인증 입력 횟수를 초과했습니다. 처음부터 다시 진행하세요."},429);
   const pass=String(body.password||"");
   if(pass.length<1||pass.length>256)return result({error:"텔레그램 2단계 비밀번호를 확인하세요."},400);
   const r=await db.query(`UPDATE moment_telegram_login SET phase='pending',action='password',payload_cipher=$2,attempts=attempts+1,updated_at=now(),message=NULL
   WHERE account_id=$1 AND phase='password_required' AND expires_at>now() RETURNING request_id`,[accountId,encryptTransientSecret(pass)]);
   if(!r.rowCount)return result({error:"2단계 비밀번호 입력 단계가 아닙니다."},409);
   return result({ok:true,phase:"pending"});
  }
  if(body.action==="cancel"){
   await db.query("DELETE FROM moment_telegram_login WHERE account_id=$1",[accountId]);
   return result({ok:true,phase:"idle"});
  }
  return result({error:"알 수 없는 인증 단계입니다."},400);
 }catch{return result({error:"인증 요청을 처리하지 못했습니다. 서버 설정을 확인하세요."},503)}
}
