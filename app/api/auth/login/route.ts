import { NextRequest, NextResponse } from "next/server";
import { createSession } from "../../../../lib/auth";
import { timingSafeEqual } from "node:crypto";
import {loginAllowed,loginFailed,loginSucceeded} from "../../../../lib/login-throttle";
export async function POST(req:NextRequest) {
 const password=process.env.ADMIN_PASSWORD,secret=process.env.AUTH_SECRET;
 const origin=req.headers.get("origin");
 if(origin&&origin!==req.nextUrl.origin)return NextResponse.json({error:"잘못된 요청 출처입니다."},{status:403});
 const ip=(req.headers.get("x-real-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]||"unknown").trim().slice(0,80);
 const rate=loginAllowed(ip);
 if(!rate.allowed)return NextResponse.json({error:"로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요."},{status:429,headers:{"Retry-After":String(rate.retryAfter)}});
 if(!password||!secret)return NextResponse.json({error:"서버 관리자 인증 설정이 필요합니다."},{status:503});
 let supplied="";
 try { const data=await req.json(); if(typeof data?.password==="string") supplied=data.password.slice(0,128); }
 catch{return NextResponse.json({error:"요청 형식이 잘못되었습니다."},{status:400});}
 const a=Buffer.from(password);const b=Buffer.from(supplied);
 if(a.length!==b.length||!timingSafeEqual(a,b)){loginFailed(ip);return NextResponse.json({error:"비밀번호가 일치하지 않습니다."},{status:401});}
 loginSucceeded(ip);
 const response=NextResponse.json({ok:true});
 response.cookies.set("ace_session",await createSession(secret),{httpOnly:true,sameSite:"strict",secure:process.env.NODE_ENV==="production",path:"/",maxAge:12*60*60});
 return response;
}
