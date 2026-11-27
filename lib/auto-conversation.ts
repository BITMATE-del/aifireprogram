import {bridgeDatabase} from "./group-bridge";

let ready:Promise<void>|null=null;
export async function autoDb(){
 const db=await bridgeDatabase();
 if(!ready){
  ready=(async()=>{
   await db.query(`CREATE TABLE IF NOT EXISTS moment_auto_groups(
     chat_id text PRIMARY KEY,
     enabled boolean NOT NULL DEFAULT false,
     disclosure_confirmed boolean NOT NULL DEFAULT false,
     min_interval_seconds integer NOT NULL DEFAULT 60,
     last_inbox_id bigint NOT NULL DEFAULT 0,
     last_generated_at timestamptz,
     last_error text,
     updated_at timestamptz NOT NULL DEFAULT now(),
     CHECK(min_interval_seconds BETWEEN 30 AND 3600)
   )`);
   await db.query(`CREATE TABLE IF NOT EXISTS moment_auto_jobs(
     id bigserial PRIMARY KEY,
     chat_id text NOT NULL,
     inbox_id bigint NOT NULL,
     account_id text NOT NULL,
     status text NOT NULL DEFAULT 'processing',
     claimed_at timestamptz NOT NULL DEFAULT now(),
     completed_at timestamptz,
     error text,
     UNIQUE(chat_id,inbox_id),
     CHECK(status IN ('processing','queued','skipped','failed','cancelled'))
   )`);
   // Shared Telegram user IDs prevent AI accounts on separate workers from
   // being mistaken for human authors of a new conversation.
   await db.query("ALTER TABLE moment_telegram_heartbeats ADD COLUMN IF NOT EXISTS telegram_user_id text");
   await db.query("CREATE INDEX IF NOT EXISTS moment_connected_ai_user_ids ON moment_telegram_heartbeats(telegram_user_id) WHERE telegram_user_id IS NOT NULL");
   await db.query("ALTER TABLE moment_group_outbox ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual'");
   await db.query("ALTER TABLE moment_group_outbox ADD COLUMN IF NOT EXISTS not_before timestamptz NOT NULL DEFAULT now()");
   await db.query("ALTER TABLE moment_auto_jobs ADD COLUMN IF NOT EXISTS decision_reason text");
   await db.query("ALTER TABLE moment_auto_jobs ADD COLUMN IF NOT EXISTS selected_accounts text[]");
   await db.query("ALTER TABLE moment_auto_jobs ADD COLUMN IF NOT EXISTS decision_type text");
   await db.query("CREATE INDEX IF NOT EXISTS moment_outbox_due ON moment_group_outbox(chat_id,account_id,not_before) WHERE status='pending'");
   await db.query("CREATE INDEX IF NOT EXISTS moment_auto_jobs_group_recent ON moment_auto_jobs(chat_id,id DESC)");
   await db.query(`CREATE TABLE IF NOT EXISTS moment_group_memory(
     chat_id text PRIMARY KEY,
     summary text NOT NULL DEFAULT '',
     updated_at timestamptz NOT NULL DEFAULT now()
   )`);
   // One live conversation per group. Prior sessions remain available for auditing.
   await db.query(`CREATE TABLE IF NOT EXISTS moment_conversation_sessions(
     id bigserial PRIMARY KEY,
     chat_id text NOT NULL,
     root_inbox_id bigint NOT NULL,
     last_human_inbox_id bigint NOT NULL,
     status text NOT NULL DEFAULT 'observing',
     turn_count integer NOT NULL DEFAULT 0,
     last_outbox_id bigint,
     next_decision_at timestamptz NOT NULL DEFAULT now(),
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE(chat_id,root_inbox_id),
     CHECK(status IN ('observing','deciding','waiting','reevaluating','ended','cancelled')),
     CHECK(turn_count BETWEEN 0 AND 3)
   )`);
   await db.query("CREATE UNIQUE INDEX IF NOT EXISTS moment_one_active_session_per_group ON moment_conversation_sessions(chat_id) WHERE status IN ('observing','deciding','waiting','reevaluating')");
   await db.query("CREATE INDEX IF NOT EXISTS moment_session_recent ON moment_conversation_sessions(chat_id,id DESC)");
   await db.query(`CREATE TABLE IF NOT EXISTS moment_conversation_decisions(
      id bigserial PRIMARY KEY, chat_id text NOT NULL, session_id bigint NOT NULL,
      turn_step integer NOT NULL, decision text NOT NULL,
      reason text NOT NULL DEFAULT '', selected_account text,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(session_id,turn_step)
   )`);
   await db.query("CREATE INDEX IF NOT EXISTS moment_conversation_decisions_recent ON moment_conversation_decisions(chat_id,id DESC)");
   await db.query("ALTER TABLE moment_group_outbox ADD COLUMN IF NOT EXISTS conversation_session_id bigint");
   await db.query("ALTER TABLE moment_group_outbox ADD COLUMN IF NOT EXISTS target_outbox_id bigint");
   await db.query("ALTER TABLE moment_group_outbox ADD COLUMN IF NOT EXISTS turn_intent text");
   await db.query("ALTER TABLE moment_group_outbox ADD COLUMN IF NOT EXISTS turn_step integer");
   await db.query("ALTER TABLE moment_auto_jobs ADD COLUMN IF NOT EXISTS conversation_session_id bigint");
   await db.query("ALTER TABLE moment_auto_jobs ADD COLUMN IF NOT EXISTS turn_step integer");
   await db.query("CREATE UNIQUE INDEX IF NOT EXISTS moment_unique_session_step ON moment_group_outbox(conversation_session_id,turn_step) WHERE conversation_session_id IS NOT NULL");
   await db.query("CREATE INDEX IF NOT EXISTS moment_auto_groups_enabled ON moment_auto_groups(enabled)");
  })();
  ready.catch(()=>{ready=null;});
 }
 await ready;
 return db;
}
export type AutoStatus={chatId:string;enabled:boolean;disclosureConfirmed:boolean;intervalSeconds:number;lastError:string|null;lastGeneratedAt:string|null};
export async function getAutoStatus(chatId:string):Promise<AutoStatus>{
 const db=await autoDb();
 const r=await db.query("SELECT enabled,disclosure_confirmed,min_interval_seconds,last_error,last_generated_at FROM moment_auto_groups WHERE chat_id=$1",[chatId]);
 const x=r.rows[0];
 return {chatId,enabled:Boolean(x?.enabled),disclosureConfirmed:Boolean(x?.disclosure_confirmed),intervalSeconds:Number(x?.min_interval_seconds??60),lastError:x?.last_error||null,lastGeneratedAt:x?.last_generated_at||null};
}
