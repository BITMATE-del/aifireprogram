export type Candidate={accountId:string;interests?:string;frequency?:"quiet"|"balanced"|"active"};
export function participationCooldownMs(frequency?:string):number{
 return frequency==="quiet"?600000:frequency==="active"?90000:180000;
}
export function eligibleConversationCandidates<T extends Candidate>(
 speakers:T[],lastSpoke:Map<string,number>,currentSpeaker:string|null,
 nowMs:number,step:number):T[]{
 return speakers.filter(p=>{
  if(p.accountId===currentSpeaker)return false;
  const previous=lastSpoke.get(p.accountId);
  if(previous===undefined)return true;
  if(step>=3)return true; // Re-entry into a bounded exchange is allowed.
  return nowMs-previous>=participationCooldownMs(p.frequency);
 });
}
export function selectConversationCandidates<T extends Candidate>(
 speakers:T[],topic:string,lastSpoke:Map<string,number>,seed:number,limit=16):T[]{
 if(speakers.length===0)return [];
 const offset=Math.abs(seed)%speakers.length;
 const rotated=[...speakers.slice(offset),...speakers.slice(0,offset)];
 const normalized=topic.toLowerCase();
 return rotated.map((p,i)=>({
  p,i,
  score:(p.interests||"").split(/[,，\s]+/).filter(x=>x.length>=2&&normalized.includes(x.toLowerCase())).length,
  last:lastSpoke.get(p.accountId)??0,
 })).sort((a,b)=>b.score-a.score||a.last-b.last||a.i-b.i).slice(0,Math.max(1,limit)).map(x=>x.p);
}
export function mayQueueAiTurn(enabled:boolean,hasNewHumanMessage:boolean,sessionStatus:string):boolean{
 return enabled&&!hasNewHumanMessage&&sessionStatus==="deciding";
}
export function maySendAiTurn(enabled:boolean,hasNewHumanMessage:boolean,sessionStatus:string,isLastSessionTurn:boolean):boolean{
 return enabled&&!hasNewHumanMessage&&sessionStatus==="waiting"&&isLastSessionTurn;
}
export function nextTurnAllowed(turnCount:number,lastDelivered:boolean,onlineSpeakers:number):boolean{
 return turnCount>=1&&turnCount<3&&lastDelivered&&onlineSpeakers>=2;
}
