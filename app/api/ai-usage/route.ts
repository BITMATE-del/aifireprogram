import {NextRequest,NextResponse} from "next/server";
import {usageDb} from "../../../lib/ai-usage";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(req:NextRequest){
 const account=req.nextUrl.searchParams.get("accountId")||"";
 if(account.length>120)return json({error:"계정 이름이 올바르지 않습니다."},400);
 try{
  const db=await usageDb();
  const condition=account?"WHERE account_id=$1":"";
  const args=account?[account]:[];
  const sumFields=`COUNT(*)::int AS requests,
    COALESCE(SUM(prompt_tokens),0)::bigint AS prompt_tokens,
    COALESCE(SUM(completion_tokens),0)::bigint AS completion_tokens,
    COALESCE(SUM(cached_tokens),0)::bigint AS cached_tokens,
    COALESCE(SUM(estimated_cost_usd),0)::float8 AS estimated_usd,
    COUNT(*) FILTER (WHERE estimated_cost_usd IS NULL)::int AS unknown_cost_requests`;
  const [all,today,month,days,accounts,recent]=await Promise.all([
    db.query(`SELECT ${sumFields} FROM moment_ai_usage ${condition}`,args),
    db.query(`SELECT ${sumFields} FROM moment_ai_usage WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul' ${account?"AND account_id=$1":""}`,args),
    db.query(`SELECT ${sumFields} FROM moment_ai_usage WHERE created_at >= date_trunc('month',now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul' ${account?"AND account_id=$1":""}`,args),
    db.query(`SELECT (created_at AT TIME ZONE 'Asia/Seoul')::date::text AS day,COUNT(*)::int AS requests,
      COALESCE(SUM(prompt_tokens),0)::bigint AS prompt_tokens,
      COALESCE(SUM(completion_tokens),0)::bigint AS completion_tokens,
      COALESCE(SUM(estimated_cost_usd),0)::float8 AS estimated_usd,
      COUNT(*) FILTER(WHERE estimated_cost_usd IS NULL)::int AS unknown_cost_requests
      FROM moment_ai_usage WHERE created_at >= now() - interval '7 days' ${account?"AND account_id=$1":""}
      GROUP BY day ORDER BY day`,args),
    db.query(`SELECT account_id,COUNT(*)::int AS requests,
      COALESCE(SUM(prompt_tokens+completion_tokens),0)::bigint AS total_tokens,
      COALESCE(SUM(estimated_cost_usd),0)::float8 AS estimated_usd,
      COUNT(*) FILTER(WHERE estimated_cost_usd IS NULL)::int AS unknown_cost_requests
      FROM moment_ai_usage ${condition} GROUP BY account_id ORDER BY estimated_usd DESC,requests DESC LIMIT 100`,args),
    db.query(`SELECT account_id,group_id,model,prompt_tokens,completion_tokens,cached_tokens,estimated_cost_usd::float8 AS estimated_usd,created_at
      FROM moment_ai_usage ${condition} ORDER BY created_at DESC LIMIT 40`,args)
  ]);
  return json({accountId:account,all:all.rows[0],today:today.rows[0],month:month.rows[0],
    days:days.rows,accounts:accounts.rows,recent:recent.rows,
    note:"모먼트 스튜디오가 호출한 OpenAI API 응답의 실제 토큰 수 × 등록 단가로 산출한 추정 비용입니다. OpenAI 결제 청구액, 잔액 또는 다른 앱의 사용량을 뜻하지 않습니다.",
    ratesUrl:"https://developers.openai.com/api/docs/pricing"});
 }catch{return json({error:"토큰 사용 통계를 조회할 수 없습니다."},503);}
}
