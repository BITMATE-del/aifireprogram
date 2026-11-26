import {database} from "./workspace-db";
import {encryptTransientSecret,decryptTransientSecret} from "./credential-vault";
let ready:Promise<void>|null=null;
export type LoginPhase="pending"|"processing"|"code_sent"|"password_required"|"connected"|"error";
export async function loginDb(){
 const db=await database();
 if(!ready){ready=db.query(`CREATE TABLE IF NOT EXISTS moment_telegram_login (
 account_id text PRIMARY KEY, request_id uuid NOT NULL, phase text NOT NULL,
 action text NOT NULL DEFAULT 'start', payload_cipher text,
 attempts int NOT NULL DEFAULT 0, message text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
 )`).then(()=>{});ready.catch(()=>{ready=null})}
 await ready;return db;
}
export const maskPhone=(s:string)=>s.slice(0,3)+"***"+s.slice(-3);
export {encryptTransientSecret,decryptTransientSecret};
