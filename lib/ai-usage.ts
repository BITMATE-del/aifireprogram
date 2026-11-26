import {database} from "./workspace-db";

let init:Promise<void>|null=null;
export async function usageDb(){
 const db=await database();
 if(!init){
  init=db.query(`CREATE TABLE IF NOT EXISTS moment_ai_usage(
    id bigserial PRIMARY KEY,
    account_id text NOT NULL,
    group_id text NOT NULL DEFAULT '',
    model text NOT NULL,
    request_id text,
    prompt_tokens integer NOT NULL DEFAULT 0,
    completion_tokens integer NOT NULL DEFAULT 0,
    cached_tokens integer NOT NULL DEFAULT 0,
    estimated_cost_usd numeric(16,9),
    pricing_note text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`).then(async()=>{
    await db.query("CREATE INDEX IF NOT EXISTS moment_ai_usage_account_time ON moment_ai_usage(account_id,created_at DESC)");
    await db.query("CREATE INDEX IF NOT EXISTS moment_ai_usage_time ON moment_ai_usage(created_at DESC)");
  });
  init.catch(()=>{init=null;});
 }
 await init;return db;
}
const modelRates:Record<string,{input:number;cached:number;output:number}>={
 "gpt-4o-mini":{input:0.15,cached:0.075,output:0.60},
 "gpt-4o-mini-2024-07-18":{input:0.15,cached:0.075,output:0.60},
 "gpt-4o":{input:2.50,cached:1.25,output:10.00},
 "gpt-4o-2024-08-06":{input:2.50,cached:1.25,output:10.00}
};
export function estimateCost(model:string,prompt:number,completion:number,cached:number):number|null{
 const rates=modelRates[model];
 if(!rates)return null;
 const fresh=Math.max(0,prompt-Math.max(0,cached));
 return Number(((fresh*rates.input+Math.max(0,cached)*rates.cached+completion*rates.output)/1_000_000).toFixed(9));
}
export async function recordUsage(input:{accountId:string;groupId:string;model:string;requestId:string|null;prompt:number;completion:number;cached:number;}){
 const db=await usageDb();
 const cost=estimateCost(input.model,input.prompt,input.completion,input.cached);
 await db.query(`INSERT INTO moment_ai_usage
 (account_id,group_id,model,request_id,prompt_tokens,completion_tokens,cached_tokens,estimated_cost_usd,pricing_note)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[
  input.accountId,input.groupId,input.model,input.requestId,
  input.prompt,input.completion,input.cached,cost,
  cost===null?"요금표 미등록 모델":"모델별 공개 단가로 계산한 추정치"
 ]);
}
