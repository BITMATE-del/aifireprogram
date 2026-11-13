import { NextRequest, NextResponse } from "next/server";
import { createSession } from "../../../../lib/auth";
import { timingSafeEqual } from "node:crypto";
export async function POST(req:NextRequest) {
 const password=process.env.ADMIN_PASSWORD,secret=process.env.AUTH_SECRET;
 if(!password||!secret)return NextResponse.json({error:"서버 관리자 인증 설정이 필요합니다."},{status:503});
 let supplied="";
 try { const data=await req.json(); if(typeof data?.password==="string") supplied=data.password.slice(0,128); }
 catch{return NextResponse.json({error:"요청 형식이 잘못되었습니다."},{status:400});}
 const a=Buffer.from(password);const b=Buffer.from(supplied);
 if(a.length!==b.length||!timingSafeEqual(a,b))return NextResponse.json({error:"비밀번호가 일치하지 않습니다."},{status:401});
 const response=NextResponse.json({ok:true});
 response.cookies.set("ace_session",await createSession(secret),{httpOnly:true,sameSite:"strict",secure:process.env.NODE_ENV==="production",path:"/",maxAge:12*60*60});
 return response;
}
