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
