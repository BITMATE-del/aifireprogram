import {randomUUID} from "node:crypto";
import {credentialDatabase} from "./credential-vault";

let prepared:Promise<void>|null=null;
export async function sessionFileDb(){
 const db=await credentialDatabase();
 if(!prepared){
  prepared=(async()=>{
   await db.query(`CREATE TABLE IF NOT EXISTS moment_session_file_imports(
    account_id text PRIMARY KEY,
    request_id text NOT NULL,
    phase text NOT NULL,
    file_cipher text,
    message text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
    CHECK(phase IN ('pending','processing','connected','error'))
   )`);
   await db.query("ALTER TABLE moment_session_file_imports ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0");
   await db.query("CREATE INDEX IF NOT EXISTS moment_session_files_pending ON moment_session_file_imports(phase,updated_at)");
  })();
  prepared.catch(()=>{prepared=null});
 }
 await prepared;
 return db;
}
export const maxSessionFileBytes=512*1024;
export function sessionFileRequestId(){return randomUUID()}
