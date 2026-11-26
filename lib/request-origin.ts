import {NextRequest} from "next/server";

/** Railway/other reverse proxies may rewrite req.nextUrl.origin to an internal hostname.
 * Compare the browser Origin to the externally routed Host headers instead.
 */
export function sameSiteRequest(req:NextRequest):boolean{
 const origin=req.headers.get("origin");
 if(!origin)return true;
 let incoming:URL;
 try{incoming=new URL(origin)}catch{return false}
 if(!["https:","http:"].includes(incoming.protocol))return false;
 const hosts=[
  req.headers.get("x-forwarded-host"),
  req.headers.get("host"),
  process.env.RAILWAY_PUBLIC_DOMAIN,
  process.env.NEXT_PUBLIC_APP_DOMAIN
 ].filter((h):h is string=>!!h).flatMap(h=>h.split(",").map(x=>x.trim().toLowerCase()));
 const originHost=incoming.host.toLowerCase();
 if(incoming.protocol!=="https:"&&process.env.NODE_ENV==="production")return false;
 return hosts.includes(originHost);
}
