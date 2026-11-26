import {usageDb} from "./ai-usage";

let init:Promise<void>|null=null;
export async function budgetDb(){
 const db=await usageDb();
 if(!init){
  init=db.query(`CREATE TABLE IF NOT EXISTS moment_ai_budget(
    account_id text PRIMARY KEY,
    daily_limit_usd numeric(12,6) NOT NULL DEFAULT 0,
    monthly_limit_usd numeric(12,6) NOT NULL DEFAULT 0,
    minute_limit integer NOT NULL DEFAULT 10,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK(daily_limit_usd>=0 AND monthly_limit_usd>=0 AND minute_limit BETWEEN 1 AND 120)
   )`).then(()=>{});
  init.catch(()=>{init=null});
 }
 await init;return db;
}
export async function aiBudget(accountId:string){
 const db=await budgetDb();
 const result=await db.query(`SELECT daily_limit_usd::float8 AS daily,monthly_limit_usd::float8 AS monthly,
   minute_limit AS per_minute FROM moment_ai_budget WHERE account_id=$1`,[accountId]);
 return result.rows[0]||{daily:0,monthly:0,per_minute:10};
}
export async function checkAiBudget(accountId:string):Promise<{ok:boolean;message?:string}>{
 const db=await budgetDb();
 const limit=await aiBudget(accountId);
 const row=await db.query(`SELECT
  COUNT(*) FILTER(WHERE created_at>now()-interval '1 minute')::int AS one_minute,
  COALESCE(SUM(estimated_cost_usd) FILTER(WHERE created_at>=
   (date_trunc('day',now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')),0)::float8 AS today,
  COALESCE(SUM(estimated_cost_usd) FILTER(WHERE created_at>=
   (date_trunc('month',now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')),0)::float8 AS month
  FROM moment_ai_usage WHERE account_id=$1 AND created_at>now()-interval '35 days'`,[accountId]);
 const stat=row.rows[0];
 if(Number(stat.one_minute)>=Number(limit.per_minute))return {ok:false,message:"이 계정의 분당 API 호출 한도에 도달했습니다."};
 if(Number(limit.daily)>0&&Number(stat.today)>=Number(limit.daily))return {ok:false,message:"이 계정의 일일 예상 비용 한도에 도달했습니다."};
 if(Number(limit.monthly)>0&&Number(stat.month)>=Number(limit.monthly))return {ok:false,message:"이 계정의 월간 예상 비용 한도에 도달했습니다."};
 return {ok:true};
}
