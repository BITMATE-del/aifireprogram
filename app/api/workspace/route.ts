import {NextRequest,NextResponse} from "next/server";
import {database,databaseConfigured,validateState} from "../../../lib/workspace-db";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 if(!databaseConfigured())return NextResponse.json({configured:false,error:"DATABASE_URL 미설정"},{status:503});
 try{
  const db=await database();
  const result=await db.query("SELECT content,version,updated_at FROM moment_workspace_state WHERE id=$1",["primary"]);
  const item=result.rows[0];
  return NextResponse.json({configured:true,exists:!!item,state:item?.content??null,version:Number(item?.version??0),updatedAt:item?.updated_at??null},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"데이터베이스를 조회하지 못했습니다."},{status:503});}
}
export async function PUT(req:NextRequest){
 if(!databaseConfigured())return NextResponse.json({error:"DATABASE_URL 미설정"},{status:503});
 const origin=req.headers.get("origin");
 if(origin&&origin!==req.nextUrl.origin)return NextResponse.json({error:"요청 출처가 올바르지 않습니다."},{status:403});
 try{
  const raw=await req.text();
  if(raw.length>1_500_000)return NextResponse.json({error:"저장 데이터가 너무 큽니다."},{status:413});
  const input=JSON.parse(raw);
  const version=input?.version;
  if(!Number.isSafeInteger(version)||version<0)return NextResponse.json({error:"저장 버전이 올바르지 않습니다."},{status:400});
  const state=validateState(input?.state);
  if(!state)return NextResponse.json({error:"저장 데이터 형식이 올바르지 않습니다."},{status:400});
  const db=await database();
  const saved=await db.query(`INSERT INTO moment_workspace_state(id,content,version,updated_at)
   VALUES($1,$2::jsonb,1,now())
   ON CONFLICT (id) DO UPDATE SET content=EXCLUDED.content,version=moment_workspace_state.version+1,updated_at=now()
   WHERE moment_workspace_state.version=$3
   RETURNING version,updated_at`,["primary",JSON.stringify(state),version]);
  if(!saved.rows.length)return NextResponse.json({error:"다른 화면에서 데이터가 변경됐습니다. 서버 데이터를 다시 불러온 뒤 확인하세요.",code:"VERSION_CONFLICT"},{status:409});
  return NextResponse.json({ok:true,version:Number(saved.rows[0].version),updatedAt:saved.rows[0].updated_at},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"서버 데이터 저장에 실패했습니다."},{status:503});}
}
