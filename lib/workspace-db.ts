import {Pool} from "pg";
type DbState={accounts:unknown[];groups:unknown[];people:unknown[];assignments:unknown[];messages:unknown[];activeGroup:string};
const url=process.env.DATABASE_URL;
const pool=url?new Pool({connectionString:url,max:5,idleTimeoutMillis:15000,connectionTimeoutMillis:5000}):null;
let ready:Promise<void>|null=null;
export function databaseConfigured(){return Boolean(pool);}
export async function database(){
 if(!pool)throw new Error("DATABASE_URL_NOT_CONFIGURED");
 if(!ready){
  ready=pool.query(`CREATE TABLE IF NOT EXISTS moment_workspace_state (
   id text PRIMARY KEY,
   content jsonb NOT NULL DEFAULT '{}'::jsonb,
   version bigint NOT NULL DEFAULT 1,
   updated_at timestamptz NOT NULL DEFAULT now()
  )`).then(()=>{});
  ready.catch(()=>{ready=null;});
 }
 await ready;
 return pool;
}
export function validateState(raw:unknown):DbState|null {
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const r=raw as Record<string,unknown>;
 const limits:{[K in keyof Omit<DbState,"activeGroup">]:number}={accounts:500,groups:100,people:1000,assignments:5000,messages:3000};
 for(const key of Object.keys(limits) as (keyof typeof limits)[]){
  if(!Array.isArray(r[key])||r[key].length>limits[key])return null;
  if(r[key].some((item:unknown)=>!item||typeof item!=="object"||Array.isArray(item)))return null;
 }
 if(typeof r.activeGroup!=="string"||r.activeGroup.length>150)return null;
 return r as DbState;
}
