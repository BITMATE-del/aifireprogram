import {NextRequest,NextResponse} from "next/server";
import {sameSiteRequest} from "../../../lib/request-origin";
import {encryptTransientSecret,credentialsStatus} from "../../../lib/credential-vault";
import {accountActionDb} from "../../../lib/account-actions";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const out=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"no-store"}});
const safeAccount=(x:unknown):x is string=>typeof x==="string"&&x.length>0&&x.length<=120&&!/[\x00-\x1f]/.test(x);
export async function GET(req:NextRequest){
 const id=req.nextUrl.searchParams.get("accountId");
 if(!safeAccount(id))return out({error:"계정이 올바르지 않습니다."},400);
 try{
  const db=await accountActionDb();
  const r=await db.query(`SELECT id::text,type, state,message,created_at,completed_at
    FROM (SELECT id,action_type AS type,state,message,created_at,completed_at
      FROM moment_account_actions WHERE account_id=$1 ORDER BY id DESC LIMIT 8) x`,[id]);
  return out({actions:r.rows});
 }catch{return out({error:"계정 작업 상태 조회 실패"},503)}
}
export async function POST(req:NextRequest){
 if(!sameSiteRequest(req))return out({error:"요청 출처 오류"},403);
 const declared=Number(req.headers.get("content-length")||0);
 if(declared>3*1024*1024)return out({error:"사진 파일은 2MB 이하로 선택하세요."},413);
 let form:FormData;
 try{form=await req.formData()}catch{return out({error:"입력 데이터를 읽지 못했습니다."},400)}
 const accountId=form.get("accountId"),type=form.get("type");
 if(!safeAccount(accountId)||!["join_group","change_name","change_photo"].includes(String(type)))return out({error:"계정 또는 작업 유형 오류"},400);
 const cred=await credentialsStatus(accountId);
 if(!cred.telegramSession)return out({error:"먼저 이 계정에 로그인 세션을 등록하세요."},409);
 let data:Record<string,string>;
 if(type==="join_group"){
  const invite=String(form.get("invite")||"").trim();
  const accepted=/^(?:https:\/\/)?(?:t\.me|telegram\.me)\/(?:\+[A-Za-z0-9_-]{6,120}|joinchat\/[A-Za-z0-9_-]{6,120}|[A-Za-z][A-Za-z0-9_]{3,31})(?:\/)?$/i;
  if(!accepted.test(invite))return out({error:"공식 Telegram 초대 링크 또는 공개 그룹 주소를 입력하세요."},400);
  data={invite};
 }else if(type==="change_name"){
  const firstName=String(form.get("firstName")||"").trim(),lastName=String(form.get("lastName")||"").trim();
  if(!firstName||firstName.length>64||lastName.length>64||/[\x00-\x1f]/.test(firstName+lastName))return out({error:"이름은 1~64자, 성은 64자 이내로 입력하세요."},400);
  data={firstName,lastName};
 }else{
  const file=form.get("photo");
  if(!(file instanceof File)||file.size<100||file.size>2*1024*1024)return out({error:"프로필 사진은 2MB 이하의 JPG/PNG 파일이어야 합니다."},400);
  const buffer=Buffer.from(await file.arrayBuffer());
  const jpeg=buffer.subarray(0,3).equals(Buffer.from([255,216,255]));
  const png=buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(!jpeg&&!png)return out({error:"JPG 또는 PNG 이미지 파일만 지원합니다."},400);
  data={imageBase64:buffer.toString("base64"),extension:jpeg?".jpg":".png"};
 }
 try{
  const db=await accountActionDb();
  const r=await db.query(`INSERT INTO moment_account_actions(account_id,action_type,payload)
   VALUES($1,$2,$3) RETURNING id::text`,[accountId,type,encryptTransientSecret(JSON.stringify(data))]);
  return out({ok:true,id:r.rows[0].id,message:"작업을 접수했습니다. 계정 연결 후 적용 결과가 표시됩니다."});
 }catch{return out({error:"계정 작업 등록 실패"},503)}
}
