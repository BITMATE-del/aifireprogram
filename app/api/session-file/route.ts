import {NextRequest,NextResponse} from "next/server";
import {sameSiteRequest} from "../../../lib/request-origin";
import {credentialsStatus,saveCredential,encryptTransientSecret} from "../../../lib/credential-vault";
import {sessionFileDb,sessionFileRequestId,maxSessionFileBytes} from "../../../lib/session-file-store";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const json=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{"Cache-Control":"no-store"}});
const validAccount=(x:unknown)=>typeof x==="string"&&x.trim().length>0&&x.length<=120&&
 x!=="__global_defaults__"&&x!=="__server_default__"&&!/[\x00-\x1f]/.test(x);
const sqliteSignature=Buffer.from("SQLite format 3\0","binary");
function stringSession(source:Buffer):string|null{
 const value=new TextDecoder("utf-8",{fatal:true}).decode(source).replace(/^\uFEFF/,"").trim();
 return /^1[A-Za-z0-9_-]{80,7999}$/.test(value)?value:null;
}
export async function GET(req:NextRequest){
 const accountId=req.nextUrl.searchParams.get("accountId");
 if(!validAccount(accountId))return json({error:"계정 ID가 올바르지 않습니다."},400);
 try{
  const db=await sessionFileDb();
  const result=await db.query("SELECT phase,message,expires_at FROM moment_session_file_imports WHERE account_id=$1",[accountId]);
  const task=result.rows[0];
  if(!task)return json({phase:"idle"});
  const expired=new Date(task.expires_at).getTime()<Date.now()&&["pending","processing"].includes(task.phase);
  return json({phase:expired?"error":task.phase,message:expired?"세션 변환 시간이 만료됐습니다. 파일을 다시 선택하세요.":task.message});
 }catch{return json({error:"파일 등록 상태를 조회하지 못했습니다."},503)}
}
export async function POST(req:NextRequest){
 if(!sameSiteRequest(req))return json({error:"요청 출처가 올바르지 않습니다."},403);
 const len=Number(req.headers.get("content-length")||0);
 if(len>maxSessionFileBytes+32000)return json({error:"파일 용량은 512KB 이하여야 합니다."},413);
 let payload:FormData;
 try{payload=await req.formData()}catch{return json({error:"파일 형식을 확인하세요."},400)}
 const accountId=payload.get("accountId"),uploaded=payload.get("file");
 if(!validAccount(accountId)||!(uploaded instanceof File))return json({error:"계정과 세션 파일을 선택하세요."},400);
 if(uploaded.size<85||uploaded.size>maxSessionFileBytes)return json({error:"세션 파일 크기가 올바르지 않습니다. 최대 512KB입니다."},400);
 const filename=uploaded.name.toLowerCase();
 if(!/\.(session|txt)$/.test(filename))return json({error:".session 또는 .txt 파일만 지원합니다."},400);
 const bytes=Buffer.from(await uploaded.arrayBuffer());
 try{
  let value:string|null=null;
  try{value=stringSession(bytes)}catch{}
  if(value){
   await saveCredential(accountId,"telegramSession",value);
   const db=await sessionFileDb();
   await db.query("DELETE FROM moment_session_file_imports WHERE account_id=$1",[accountId]);
   return json({ok:true,phase:"connected",message:"세션 파일을 암호화 저장했습니다. 텔레그램 연결 상태를 확인하세요.",status:await credentialsStatus(accountId)});
  }
  if(!filename.endsWith(".session")||!bytes.subarray(0,16).equals(sqliteSignature))
   return json({error:"Telethon StringSession 텍스트(.txt) 또는 SQLite 세션(.session) 파일이 아닙니다."},400);
  const db=await sessionFileDb();
  const requestId=sessionFileRequestId();
  await db.query(`INSERT INTO moment_session_file_imports(account_id,request_id,phase,file_cipher,message,created_at,updated_at,expires_at)
   VALUES($1,$2,'pending',$3,'세션 파일을 연결 워커에서 확인하는 중입니다.',now(),now(),now()+interval '15 minutes')
   ON CONFLICT(account_id) DO UPDATE SET request_id=$2,phase='pending',file_cipher=$3,message='세션 파일을 연결 워커에서 확인하는 중입니다.',
   created_at=now(),updated_at=now(),expires_at=now()+interval '15 minutes'`,
  [accountId,requestId,encryptTransientSecret(bytes.toString("base64"))]);
  return json({ok:true,phase:"pending",message:"세션 파일을 등록했습니다. 워커에서 변환한 후 자동 연결됩니다."});
 }catch{return json({error:"세션 파일을 저장하지 못했습니다. 서버 저장소를 확인하세요."},503)}
}
