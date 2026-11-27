import {NextRequest,NextResponse} from "next/server";
import {authorizedBridge} from "../../../../lib/group-bridge";
import {decryptTransientSecret} from "../../../../lib/credential-vault";
import {accountActionDb} from "../../../../lib/account-actions";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const out=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(req:NextRequest){
 if(!authorizedBridge(req))return out({error:"인증 실패"},401);
 const accountId=req.nextUrl.searchParams.get("accountId");
 if(!accountId||accountId.length>120)return out({error:"계정 ID 오류"},400);
 try{
  const db=await accountActionDb(),c=await db.connect();
  try{
   await c.query("BEGIN");
   await c.query(`UPDATE moment_account_actions SET state='failed',message='작업 시간 초과, 연결 상태를 확인하세요.',completed_at=now()
    WHERE account_id=$1 AND state='pending' AND created_at<now()-interval '20 minutes'`,[accountId]);
   await c.query(`UPDATE moment_account_actions SET state='failed',message='처리 결과 확인 불가, 실제 텔레그램 계정에서 변경 여부를 확인하세요.',completed_at=now()
    WHERE account_id=$1 AND state='processing' AND claimed_at<now()-interval '2 minutes'`,[accountId]);
   const r=await c.query(`UPDATE moment_account_actions SET state='processing',claimed_at=now()
    WHERE id=(SELECT id FROM moment_account_actions WHERE account_id=$1 AND state='pending'
     AND NOT EXISTS(SELECT 1 FROM moment_account_actions x WHERE x.account_id=$1 AND x.state='processing')
     ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id::text,action_type,payload`,[accountId]);
   await c.query("COMMIT");
   if(!r.rows.length)return out({action:null});
   const item=r.rows[0];
   return out({action:{id:item.id,type:item.action_type,data:JSON.parse(decryptTransientSecret(item.payload))}});
  }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}
  finally{c.release()}
 }catch{return out({error:"계정 작업 조회 실패"},503)}
}
export async function POST(req:NextRequest){
 if(!authorizedBridge(req))return out({error:"인증 실패"},401);
 let input:{accountId?:unknown;id?:unknown;success?:unknown;message?:unknown;group?:unknown};
 try{const raw=await req.text();if(raw.length>2500)return out({error:"요청 크기 초과"},413);input=JSON.parse(raw)}
 catch{return out({error:"요청 오류"},400)}
 const accountId=input.accountId,id=String(input.id||"");
 if(typeof accountId!=="string"||accountId.length>120||!/^[0-9]{1,18}$/.test(id)||typeof input.success!=="boolean")return out({error:"작업 확인 형식 오류"},400);
 try{
  const db=await accountActionDb(),c=await db.connect();
  try{
   await c.query("BEGIN");
   const result=await c.query(`UPDATE moment_account_actions SET state=$3,message=$4,completed_at=now(),payload=''
     WHERE account_id=$1 AND id=$2 AND state='processing'
     RETURNING id,action_type`,[accountId,id,input.success?"success":"failed",
     String(input.message|| (input.success?"적용 완료":"작업 실패")).slice(0,180)]);
   if(input.success&&result.rows[0]?.action_type==="join_group"&&input.group&&typeof input.group==="object"){
    const g=input.group as {id?:unknown;title?:unknown};
    if(typeof g.id==="string"&&/^-?\d{1,20}$/.test(g.id)&&typeof g.title==="string"){
     await c.query(`INSERT INTO moment_discovered_groups(account_id,chat_id,title,discovered_at)
       VALUES($1,$2,$3,now()) ON CONFLICT(account_id,chat_id)
       DO UPDATE SET title=EXCLUDED.title,discovered_at=now()`,
       [accountId,g.id,g.title.slice(0,120)]);
    }
   }
   await c.query("COMMIT");return out({ok:result.rowCount===1});
  }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}
  finally{c.release()}
 }catch{return out({error:"계정 작업 결과 저장 실패"},503)}
}
