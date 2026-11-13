import { NextRequest, NextResponse } from "next/server";
import { validSession } from "./lib/auth";
export async function middleware(req:NextRequest) {
 const path=req.nextUrl.pathname;
 const configured=Boolean(process.env.ADMIN_PASSWORD&&process.env.AUTH_SECRET);
 const authenticated=configured&&await validSession(req.cookies.get("ace_session")?.value,process.env.AUTH_SECRET!);
 if(path==="/login" || path==="/api/auth/login"){
  if(path==="/login" && authenticated)return NextResponse.redirect(new URL("/",req.url));
  return NextResponse.next();
 }
 if(!authenticated){
  if(path.startsWith("/api/"))return NextResponse.json({error:"관리자 로그인이 필요합니다."},{status:401});
  return NextResponse.redirect(new URL("/login",req.url));
 }
 return NextResponse.next();
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};
