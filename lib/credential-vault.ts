import {createCipheriv,createDecipheriv,hkdfSync,randomBytes} from "node:crypto";
import {database} from "./workspace-db";

const context="moment-studio-credentials-v1";
function encryptionKey():Buffer{
 const secret=process.env.CREDENTIAL_ENCRYPTION_KEY;
 if(!secret||secret.length<32)throw new Error("CREDENTIAL_ENCRYPTION_KEY_MISSING_OR_SHORT");
 return Buffer.from(hkdfSync("sha256",Buffer.from(secret),Buffer.from("moment-studio-credential-storage"),Buffer.from(context),32));
}
function encrypt(plain:string):string{
 const iv=randomBytes(12);
 const cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);
 const encrypted=Buffer.concat([cipher.update(plain,"utf8"),cipher.final()]);
 return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}
function decrypt(value:string):string{
 const [v,iv,tag,blob]=value.split(".");
 if(v!=="v1"||!iv||!tag||!blob)throw new Error("INVALID_ENCRYPTED_SECRET");
 const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(iv,"base64url"));
 decipher.setAuthTag(Buffer.from(tag,"base64url"));
 return Buffer.concat([decipher.update(Buffer.from(blob,"base64url")),decipher.final()]).toString("utf8");
}

let prepared:Promise<void>|null=null;
export async function credentialDatabase(){
 const db=await database();
 if(!prepared){
   prepared=db.query(`CREATE TABLE IF NOT EXISTS moment_account_credentials (
    account_id text PRIMARY KEY,
    telegram_api_id_encrypted text,
    telegram_api_hash_encrypted text,
    telegram_session_encrypted text,
    openai_api_key_encrypted text,
    updated_at timestamptz NOT NULL DEFAULT now()
   )`).then(()=>{});
   prepared.catch(()=>{prepared=null;});
 }
 await prepared;
 return db;
}
const secretFields={
 telegramApiId:"telegram_api_id_encrypted",
 telegramApiHash:"telegram_api_hash_encrypted",
 telegramSession:"telegram_session_encrypted",
 openaiApiKey:"openai_api_key_encrypted"
} as const;
export type SecretName=keyof typeof secretFields;
export async function saveCredential(accountId:string,field:SecretName,value:string|null){
 const db=await credentialDatabase();
 const column=secretFields[field];
 const encrypted=value===null?null:encrypt(value);
 await db.query(`INSERT INTO moment_account_credentials(account_id,${column},updated_at)
 VALUES($1,$2,now()) ON CONFLICT (account_id) DO UPDATE
 SET ${column}=EXCLUDED.${column},updated_at=now()`,[accountId,encrypted]);
}
export async function accountSecret(accountId:string,field:SecretName):Promise<string|null>{
 const db=await credentialDatabase();
 const res=await db.query(`SELECT ${secretFields[field]} AS value FROM moment_account_credentials WHERE account_id=$1`,[accountId]);
 return res.rows[0]?.value?decrypt(res.rows[0].value):null;
}
export const DEFAULT_ACCOUNT_ID="__global_defaults__";
export const INHERITABLE_FIELDS=["telegramApiId","telegramApiHash","openaiApiKey"] as const;
export type InheritableField=typeof INHERITABLE_FIELDS[number];
export async function effectiveAccountSecret(accountId:string,field:SecretName):Promise<{value:string|null;source:"custom"|"default"|"none"}>{
 const custom=await accountSecret(accountId,field);
 if(custom)return {value:custom,source:"custom"};
 if(field==="telegramSession")return {value:null,source:"none"};
 const shared=await accountSecret(DEFAULT_ACCOUNT_ID,field);
 return shared?{value:shared,source:"default"}:{value:null,source:"none"};
}
export async function allCredentialRecords():Promise<{
 accountId:string;telegramApiId:string;telegramApiHash:string;telegramSession:string
}[]>{
 const db=await credentialDatabase();
 const result=await db.query(`SELECT account_id,telegram_session_encrypted AS session
 FROM moment_account_credentials WHERE telegram_session_encrypted IS NOT NULL
 AND account_id <> $1`,[DEFAULT_ACCOUNT_ID]);
 const rows:{accountId:string;telegramApiId:string;telegramApiHash:string;telegramSession:string}[]=[];
 for(const row of result.rows){
  try{
   const [id,hash]=await Promise.all([
    effectiveAccountSecret(row.account_id,"telegramApiId"),
    effectiveAccountSecret(row.account_id,"telegramApiHash")
   ]);
   if(id.value&&hash.value)rows.push({
    accountId:row.account_id,telegramApiId:id.value,telegramApiHash:hash.value,
    telegramSession:decrypt(row.session)
   });
  }catch{}
 }
 return rows;
}
export async function defaultCredentialStatus(){
 const db=await credentialDatabase();
 const result=await db.query(`SELECT telegram_api_id_encrypted IS NOT NULL AS telegram_api_id,
 telegram_api_hash_encrypted IS NOT NULL AS telegram_api_hash,
 openai_api_key_encrypted IS NOT NULL AS openai_api_key,updated_at
 FROM moment_account_credentials WHERE account_id=$1`,[DEFAULT_ACCOUNT_ID]);
 const row=result.rows[0];
 return {
  telegramApiId:Boolean(row?.telegram_api_id),telegramApiHash:Boolean(row?.telegram_api_hash),
  openaiApiKey:Boolean(row?.openai_api_key),updatedAt:row?.updated_at||null
 };
}
export async function credentialsStatus(accountId:string){
 const db=await credentialDatabase();
 const result=await db.query(`SELECT telegram_api_id_encrypted IS NOT NULL AS telegram_api_id,
 telegram_api_hash_encrypted IS NOT NULL AS telegram_api_hash,
 telegram_session_encrypted IS NOT NULL AS telegram_session,
 openai_api_key_encrypted IS NOT NULL AS openai_api_key,updated_at
 FROM moment_account_credentials WHERE account_id=$1`,[accountId]);
 const row=result.rows[0];
 return {
  telegramApiId:Boolean(row?.telegram_api_id),
  telegramApiHash:Boolean(row?.telegram_api_hash),
  telegramSession:Boolean(row?.telegram_session),
  openaiApiKey:Boolean(row?.openai_api_key),
  updatedAt:row?.updated_at||null
 };
}
