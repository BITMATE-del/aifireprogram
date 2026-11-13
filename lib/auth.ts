const encoder = new TextEncoder();
function hex(bytes: Uint8Array) { return Array.from(bytes).map(x=>x.toString(16).padStart(2,"0")).join(""); }
async function sign(value:string, secret:string) {
 const key = await crypto.subtle.importKey("raw",encoder.encode(secret),"HMAC",false,["sign"]);
 return hex(new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(value))));
}
export async function createSession(secret:string) {
 const expiry=String(Date.now()+12*60*60*1000);
 return expiry+"."+await sign(expiry,secret);
}
export async function validSession(cookie:string|undefined,secret:string) {
 if(!cookie||!secret)return false;
 const [expiry,signature,...rest]=cookie.split(".");
 if(rest.length||!expiry||!signature||!/^[0-9]+$/.test(expiry))return false;
 if(Number(expiry)<=Date.now()||Number(expiry)>Date.now()+12*60*60*1000)return false;
 const expected=await sign(expiry,secret);
 if(expected.length!==signature.length)return false;
 let diff=0;for(let i=0;i<expected.length;i++) diff|=expected.charCodeAt(i)^signature.charCodeAt(i);
 return diff===0;
}
