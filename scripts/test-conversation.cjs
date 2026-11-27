const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ts=require("typescript");
const source=fs.readFileSync(path.join(__dirname,"..","lib","conversation-policy.ts"),"utf8");
const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}});
const exportedFunctions={};
vm.runInNewContext(outputText,{exports:exportedFunctions,require,module:{exports:exportedFunctions}});
const {participationCooldownMs,eligibleConversationCandidates,selectConversationCandidates,mayQueueAiTurn,maySendAiTurn,nextTurnAllowed}=exportedFunctions;
let tests=0;
function check(label,callback){callback();console.log("PASS",label);tests++;}
const group=n=>Array.from({length:n},(_,i)=>({accountId:"account_"+String(i+1).padStart(2,"0"),interests:i%3===0?"반도체,삼성전자":"배당주",frequency:i%4===0?"quiet":"balanced"}));
check("one account never loops with itself",()=>{
 const a=group(1);
 assert.equal(eligibleConversationCandidates(a,new Map(),a[0].accountId,Date.now(),2).length,0);
 assert.equal(nextTurnAllowed(1,true,1),false);
});
check("10 accounts respect single-turn shortlist",()=>{
 const selected=selectConversationCandidates(group(10),"반도체",new Map(),0,16);
 assert.equal(selected.length,10);assert.equal(new Set(selected.map(x=>x.accountId)).size,10);
});
check("20 and 50 accounts select at most 16 at once",()=>{
 for(const n of [20,50]){
  const selected=selectConversationCandidates(group(n),"삼성전자",new Map(),n,16);
  assert.equal(selected.length,16);
  assert.equal(new Set(selected.map(x=>x.accountId)).size,16);
 }
});
check("50 accounts are not starved by persistent first-16 preference",()=>{
 const people=group(50).map(p=>({...p,interests:""}));
 const seen=new Set();
 for(let i=0;i<50;i++)for(const p of selectConversationCandidates(people,"대화",new Map(),i,16))seen.add(p.accountId);
 assert.equal(seen.size,50);
});
check("relevant interests are prioritized",()=>{
 const list=[{accountId:"a",interests:"배당"},{accountId:"b",interests:"반도체,삼성전자"}];
 assert.equal(selectConversationCandidates(list,"삼성전자 반도체 수급",new Map(),0,1)[0].accountId,"b");
});
check("quiet, balanced, active cooldowns",()=>{
 assert.equal(participationCooldownMs("quiet"),600000);
 assert.equal(participationCooldownMs("balanced"),180000);
 assert.equal(participationCooldownMs("active"),90000);
});
check("avoid consecutive turns from same persona",()=>{
 const a=group(10),previous=a[0].accountId;
 assert.equal(eligibleConversationCandidates(a,new Map(),previous,1000000,2).some(p=>p.accountId===previous),false);
});
check("allow reasoned third-turn reentry after another persona",()=>{
 const people=group(2),lastSpoke=new Map([[people[0].accountId,1000000]]);
 const available=eligibleConversationCandidates(people,lastSpoke,people[1].accountId,1005000,3);
 assert.equal(available[0].accountId,people[0].accountId);
});
check("stop and new human invalidate pending decisions",()=>{
 assert.equal(mayQueueAiTurn(false,false,"deciding"),false);
 assert.equal(mayQueueAiTurn(true,true,"deciding"),false);
 assert.equal(mayQueueAiTurn(true,false,"deciding"),true);
});
check("unconfirmed or cancelled send is never eligible",()=>{
 assert.equal(maySendAiTurn(true,false,"waiting",true),true);
 assert.equal(maySendAiTurn(false,false,"waiting",true),false);
 assert.equal(maySendAiTurn(true,true,"waiting",true),false);
 assert.equal(maySendAiTurn(true,false,"cancelled",true),false);
 assert.equal(maySendAiTurn(true,false,"waiting",false),false);
});
check("bounded exchange ends after 3 turns",()=>{
 assert.equal(nextTurnAllowed(1,true,10),true);
 assert.equal(nextTurnAllowed(2,true,10),true);
 assert.equal(nextTurnAllowed(3,true,10),false);
 assert.equal(nextTurnAllowed(2,false,10),false);
});
check("group candidate selection is independently scoped",()=>{
 const first=selectConversationCandidates(group(10),"",new Map(),0,3);
 const second=selectConversationCandidates(group(20).map(x=>({...x,accountId:"other_"+x.accountId})),"",new Map(),0,3);
 assert.equal(first.every(x=>!x.accountId.startsWith("other_")),true);
 assert.equal(second.every(x=>x.accountId.startsWith("other_")),true);
});
console.log("Conversation policy tests:",tests,"passed");
