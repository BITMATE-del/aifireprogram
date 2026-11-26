import {database} from "./workspace-db";
let initialized:Promise<void>|null=null;
export async function bridgeDatabase(){
 const db=await database();
 if(!initialized){
  initialized=(async()=>{
   await db.query(`CREATE TABLE IF NOT EXISTS moment_group_inbox(
    id bigserial PRIMARY KEY, chat_id text NOT NULL, message_id bigint NOT NULL,
    sender_id text NOT NULL, sender_name text NOT NULL DEFAULT '',
    body text NOT NULL, observed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(chat_id,message_id)
   )`);
   await db.query(`CREATE TABLE IF NOT EXISTS moment_group_outbox(
    id bigserial PRIMARY KEY, account_id text NOT NULL, chat_id text NOT NULL,
    reply_to_message_id bigint NOT NULL, body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'pending',
    claimed_at timestamptz, sent_message_id bigint,
    completed_at timestamptz, last_error text,
    CHECK(status IN ('pending','sending','sent','failed','cancelled'))
   )`);
   await db.query(`CREATE TABLE IF NOT EXISTS moment_telegram_heartbeats(
    account_id text NOT NULL, chat_id text NOT NULL, last_seen timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(account_id,chat_id)
   )`);
   await db.query("ALTER TABLE moment_group_outbox ADD COLUMN IF NOT EXISTS idempotency_key text");
   await db.query("CREATE UNIQUE INDEX IF NOT EXISTS moment_outbox_idempotency ON moment_group_outbox(idempotency_key) WHERE idempotency_key IS NOT NULL");
   await db.query(`CREATE TABLE IF NOT EXISTS moment_discovered_groups(
     account_id text NOT NULL,
     chat_id text NOT NULL,
     title text NOT NULL DEFAULT '',
     discovered_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY(account_id,chat_id)
   )`);
   await db.query("CREATE INDEX IF NOT EXISTS moment_inbox_chat_recent ON moment_group_inbox(chat_id,id DESC)");
   await db.query("CREATE INDEX IF NOT EXISTS moment_outbox_account_status ON moment_group_outbox(account_id,status,id)");
  })().catch(err=>{initialized=null;throw err});
 }
 await initialized;
 return db;
}
export function safeChatId(value:unknown):string|null{
 const s=String(value??"").trim();
 return /^-?\d{1,20}$/.test(s)?s:null;
}
export function safeAccountId(value:unknown):string|null{
 return typeof value==="string"&&value.length>=1&&value.length<=120?value:null;
}
export function allowedChats():Set<string>{
 return new Set((process.env.TELEGRAM_ALLOWED_CHAT_IDS||"").split(",").map(x=>x.trim()).filter(x=>/^-?\d{1,20}$/.test(x)));
}
export function authorizedBridge(req:Request):boolean{
 const expected=process.env.TELEGRAM_BRIDGE_KEY;
 const given=req.headers.get("x-bridge-key");
 if(!expected||expected.length<32||!given)return false;
 // Avoid string early-exit comparisons for secrets.
 const a=new TextEncoder().encode(expected),b=new TextEncoder().encode(given);
 if(a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
 return diff===0;
}

/** A send that was claimed but not acknowledged might already exist at Telegram.
 * Never retry automatically. Flag it for operator reconciliation.
 */
export async function flagUnconfirmedSends(){
 const db=await bridgeDatabase();
 await db.query(`UPDATE moment_group_outbox
  SET status='failed',last_error='전송 결과 미확인: 텔레그램에서 실제 발송 여부를 확인한 후 처리하세요.',
      completed_at=now()
  WHERE status='sending' AND claimed_at<now()-interval '3 minutes'`);
}
