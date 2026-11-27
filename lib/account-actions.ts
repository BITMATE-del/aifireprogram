import {credentialDatabase} from "./credential-vault";
let ready:Promise<void>|null=null;
export async function accountActionDb(){
 const db=await credentialDatabase();
 if(!ready){
  ready=(async()=>{
   await db.query(`CREATE TABLE IF NOT EXISTS moment_account_actions(
    id bigserial PRIMARY KEY,account_id text NOT NULL,
    action_type text NOT NULL,
    payload text NOT NULL,
    state text NOT NULL DEFAULT 'pending',
    message text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    claimed_at timestamptz,completed_at timestamptz,
    CHECK(action_type IN ('join_group','change_name','change_photo')),
    CHECK(state IN ('pending','processing','success','failed'))
   )`);
   await db.query("CREATE INDEX IF NOT EXISTS moment_account_action_work ON moment_account_actions(state,id)");
   await db.query("CREATE INDEX IF NOT EXISTS moment_account_action_recent ON moment_account_actions(account_id,id DESC)");
  })().catch(e=>{ready=null;throw e});
 }
 await ready;return db;
}
