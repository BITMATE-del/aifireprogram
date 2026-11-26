import {NextRequest,NextResponse} from "next/server";
import {authorizedBridge} from "../../../../lib/group-bridge";
import {loginDb,decryptTransientSecret} from "../../../../lib/telegram-login-store";
import {effectiveAccountSecret,saveCredential} from "../../../../lib/credential-vault";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const out=(o:unknown,status=200)=>NextResponse.json(o,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(req:NextRequest){
 if(!authorizedBridge(req))return out({error:"인증 실패"},401);
 try{
  const db=await loginDb();
  const client=await db.connect();
  try{
   await client.query("BEGIN");
   // A worker restart loses its in-memory Telegram challenge. Do not leave an
   // unrecoverable processing state or silently replay an OTP.
   await client.query(`UPDATE moment_telegram_login SET phase='error',
      message='인증 연결이 중단됐습니다. 전화번호부터 다시 시도하세요.',
      payload_cipher=NULL,updated_at=now()
      WHERE phase='processing' AND updated_at<now()-interval '75 seconds'`);
   const {rows}=await client.query(`SELECT account_id,request_id,action,payload_cipher
     FROM moment_telegram_login WHERE phase='pending' AND expires_at>now()
     ORDER BY updated_at FOR UPDATE SKIP LOCKED LIMIT 1`);
   if(!rows.length){await client.query("COMMIT");return out({task:null})}
   const item=rows[0];
   // Read/decrypt before clearing the one-time payload. A failed decrypt may
   // never consume the challenge without returning it to the worker.
   const payload=item.payload_cipher?decryptTransientSecret(item.payload_cipher):"";
   let id:string|null=null,hash:string|null=null;
   if(item.action==="start"){
    const creds=await Promise.all([
     effectiveAccountSecret(item.account_id,"telegramApiId"),
     effectiveAccountSecret(item.account_id,"telegramApiHash")
    ]);
    id=creds[0].value;hash=creds[1].value;
   }
   await client.query(`UPDATE moment_telegram_login SET phase='processing',
     payload_cipher=NULL,updated_at=now()
     WHERE account_id=$1 AND request_id=$2`,[item.account_id,item.request_id]);
   await client.query("COMMIT");
   return out({task:{accountId:item.account_id,requestId:item.request_id,action:item.action,
    payload,apiId:id,apiHash:hash}});
  }catch(e){await client.query("ROLLBACK");throw e}
  finally{client.release()}
 }catch{return out({error:"인증 작업을 조회하지 못했습니다."},503)}
}
export async function POST(req:NextRequest){
 if(!authorizedBridge(req))return out({error:"인증 실패"},401);
 let body:{accountId?:unknown;requestId?:unknown;phase?:unknown;session?:unknown;message?:unknown};
 try{const raw=await req.text();if(raw.length>15000)return out({error:"요청 용량을 초과했습니다."},413);body=JSON.parse(raw)}catch{return out({error:"요청 형식 오류"},400)}
 if(typeof body.accountId!=="string"||body.accountId.length>120||typeof body.requestId!=="string")return out({error:"작업 식별 오류"},400);
 const phase=body.phase;
 if(!["code_sent","password_required","connected","error"].includes(String(phase)))return out({error:"작업 단계 오류"},400);
 try{
  const db=await loginDb();
  const row=await db.query(`SELECT phase FROM moment_telegram_login WHERE account_id=$1 AND request_id=$2 AND expires_at>now()`,[body.accountId,body.requestId]);
  if(!row.rowCount||row.rows[0].phase!=="processing")return out({error:"인증 작업이 만료됐거나 중복 처리됐습니다."},409);
  if(phase==="connected"){
   if(typeof body.session!=="string"||body.session.length<80||body.session.length>10000)return out({error:"세션 형식 오류"},400);
   // Save only for the active challenge, never disclose the session in an API response.
   await saveCredential(body.accountId,"telegramSession",body.session);
  }
  const r=await db.query(`UPDATE moment_telegram_login SET phase=$3,payload_cipher=NULL,
      message=$4,updated_at=now()
      WHERE account_id=$1 AND request_id=$2 AND phase='processing' RETURNING account_id`,
    [body.accountId,body.requestId,phase,typeof body.message==="string"?body.message.slice(0,160):null]);
  return out({ok:r.rowCount===1});
 }catch{return out({error:"인증 결과 저장 실패"},503)}
}
