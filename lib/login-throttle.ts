const windowMs=15*60*1000;
const attempts = new Map<string,{count:number;resetAt:number}>();
export function loginAllowed(address:string):{allowed:boolean;retryAfter:number}{
 const now=Date.now();
 const value=attempts.get(address);
 if(!value||value.resetAt<=now){attempts.delete(address);return {allowed:true,retryAfter:0};}
 if(value.count>=5)return {allowed:false,retryAfter:Math.max(1,Math.ceil((value.resetAt-now)/1000))};
 return {allowed:true,retryAfter:0};
}
export function loginFailed(address:string){
 const now=Date.now();const x=attempts.get(address);
 attempts.set(address,!x||x.resetAt<=now?{count:1,resetAt:now+windowMs}:{...x,count:x.count+1});
 if(attempts.size>5000){for(const [key,val] of attempts){if(val.resetAt<now)attempts.delete(key);}if(attempts.size>5000)attempts.clear();}
}
export function loginSucceeded(address:string){attempts.delete(address);}
