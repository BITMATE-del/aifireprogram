import {NextRequest,NextResponse} from "next/server";
import {authorizedBridge} from "../../../../lib/group-bridge";
import {decryptTransientSecret,encryptTransientSecret} from "../../../../lib/credential-vault";
import {sessionFileDb} from "../../../../lib/session-file-store";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const json=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(req:NextRequest){
 if(!authorizedBridge(req))return json({error:"인증 실패"},401);
 try{
  const db=await sessionFileDb(),client=await db.connect();
  try{
   await client.query("BEGIN");
   await client.query(`UPDATE moment_session_file_imports SET phase='error',
     message='세션 변환 처리 시간이 초과됐습니다. 파일을 다시 등록해 주세요.',file_cipher=NULL,updated_at=now()
     WHERE phase IN ('pending','processing') AND expires_at<=now()`);
   await client.query(`UPDATE moment_session_file_imports SET phase='error',
     message='세션 변환 결과를 서버에 저장하지 못했습니다. 파일을 다시 등록해 주세요.',file_cipher=NULL,updated_at=now()
     WHERE phase='processing' AND attempts>=3 AND updated_at<now()-interval '90 seconds'`);
   await client.query(`UPDATE moment_session_file_imports SET phase='pending',updated_at=now()
     WHERE phase='processing' AND attempts<3 AND updated_at<now()-interval '90 seconds' AND expires_at>now()`);
   const r=await client.query(`UPDATE moment_session_file_imports SET phase='processing',attempts=attempts+1,updated_at=now()
     WHERE account_id=(SELECT account_id FROM moment_session_file_imports
      WHERE phase='pending' AND attempts<3 AND expires_at>now() ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED LIMIT 1)
     RETURNING account_id,request_id,file_cipher`);
   await client.query("COMMIT");
   const task=r.rows[0];
   if(!task)return json({task:null});
   return json({task:{accountId:task.account_id,requestId:task.request_id,
     contentBase64:decryptTransientSecret(task.file_cipher)}});
  }catch(err){await client.query("ROLLBACK").catch(()=>{});throw err}finally{client.release()}
 }catch{return json({error:"파일 변환 작업 조회 실패"},503)}
}
export async function POST(req:NextRequest){
 if(!authorizedBridge(req))return json({error:"인증 실패"},401);
 let payload:{accountId?:unknown;requestId?:unknown;phase?:unknown;session?:unknown;message?:unknown};
 try{
  const raw=await req.text();if(raw.length>12000)return json({error:"요청 크기 초과"},413);
  payload=JSON.parse(raw);
 }catch{return json({error:"요청 형식 오류"},400)}
 const {accountId,requestId,phase}=payload;
 // A valid bridge-authenticated worker can report a conversion error even when
 // the imported file is malformed. Never reject the error report itself.
 if(typeof accountId!=="string"||accountId.length===0||accountId.length>120||
    typeof requestId!=="string"||requestId.length===0||requestId.length>120||
    (phase!=="connected"&&phase!=="error"))return json({error:"작업 정보 오류"},400);
 const success=phase==="connected";
 const session=typeof payload.session==="string"?payload.session:"";
 if(success&&!/^1[A-Za-z0-9_-]{80,7999}$/.test(session)){
  payload={...payload,phase:"error",message:"세션 변환 결과가 유효한 StringSession 형식이 아닙니다."};
 }
 const finalSuccess=payload.phase==="connected";
 const db=await sessionFileDb(),client=await db.connect();
 try{
  await client.query("BEGIN");
  const found=await client.query(`SELECT phase FROM moment_session_file_imports WHERE account_id=$1 AND request_id=$2
    AND expires_at>now() FOR UPDATE`,[accountId,requestId]);
  if(!found.rows.length||!["processing","pending"].includes(found.rows[0].phase)){
   await client.query("ROLLBACK");return json({error:"작업이 만료되었거나 새 파일로 교체됐습니다."},409);
  }
  if(finalSuccess){
   await client.query(`INSERT INTO moment_account_credentials(account_id,telegram_session_encrypted,updated_at)
     VALUES($1,$2,now()) ON CONFLICT(account_id) DO UPDATE SET
     telegram_session_encrypted=EXCLUDED.telegram_session_encrypted,updated_at=now()`,
     [accountId,encryptTransientSecret(session)]);
  }
  const message=finalSuccess?"세션 파일 변환 및 암호화 등록 완료. 계정 연결 상태를 확인하세요.":
    typeof payload.message==="string"?payload.message.slice(0,160):"세션 파일 형식을 확인할 수 없습니다.";
  await client.query(`UPDATE moment_session_file_imports SET phase=$3,message=$4,
     file_cipher=NULL,updated_at=now() WHERE account_id=$1 AND request_id=$2`,
     [accountId,requestId,finalSuccess?"connected":"error",message]);
  await client.query("COMMIT");
  return json({ok:true,phase:finalSuccess?"connected":"error",message});
 }catch{
  await client.query("ROLLBACK").catch(()=>{});
  return json({error:"변환된 세션 저장 실패"},503);
 }finally{client.release()}
}
