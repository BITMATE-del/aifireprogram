import {NextRequest,NextResponse} from "next/server";
import {effectiveAccountSecret} from "../../../../lib/credential-vault";
import {sameSiteRequest} from "../../../../lib/request-origin";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 if(!sameSiteRequest(req))return NextResponse.json({error:"잘못된 요청 출처입니다."},{status:403});
 let body:{accountId?:unknown};
 try{body=await req.json()}catch{return NextResponse.json({error:"잘못된 요청입니다."},{status:400})}
 const id=body?.accountId;
 if(typeof id!=="string"||!id.trim()||id.length>120)return NextResponse.json({error:"계정을 선택하세요."},{status:400});
 try{
  const {value:key,source}=await effectiveAccountSecret(id,"openaiApiKey");
  if(!key)return NextResponse.json({error:"이 계정에 OpenAI API 키가 등록되지 않았습니다."},{status:400});
  const response=await fetch("https://api.openai.com/v1/models",{headers:{Authorization:"Bearer "+key},cache:"no-store",signal:AbortSignal.timeout(12000)});
  if(!response.ok){
   return NextResponse.json({valid:false,error:response.status===401?"API 키 인증 실패":response.status===403?"API 키 접근권한이 없습니다.":"OpenAI 서버에서 확인에 실패했습니다. 응답 코드: "+response.status},{status:502});
  }
  return NextResponse.json({valid:true,message:"OpenAI API 인증이 확인됐습니다 ("+(source==="default"?"전체 기본값":"개별 설정")+"). 사용 가능한 모델과 결제 한도는 별도로 확인해야 합니다."},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"OpenAI에 연결할 수 없습니다."},{status:503})}
}
