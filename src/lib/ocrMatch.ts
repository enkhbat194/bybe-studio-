import type { FrameResult, OcrBlock } from './typography';

export interface TimedTranscript { id:string;start:number;end:number;text:string;ocrId?:string|null;qa?:string }
export interface TextMatch { clipId:string;ocrId:string;frameSec:number;score:number;text:string }

/** Czech-aware normalization for comparison ONLY. Display text is never rewritten. */
export function normalizeForComparison(s:string):string {
 return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('cs').replace(/[^a-z0-9 ]/g,' ')
  .replace(/\s+/g,' ').trim();
}
function distance(a:string,b:string):number{
 if(a===b)return 0;
 if(!a.length)return b.length;
 if(!b.length)return a.length;
 const prev=Array.from({length:b.length+1},(_,i)=>i);
 const curr=new Array<number>(b.length+1).fill(0);
 for(let i=1;i<=a.length;i++){
  curr[0]=i;
  for(let j=1;j<=b.length;j++){
   const cost=a[i-1]===b[j-1]?0:1;
   curr[j]=Math.min(prev[j]+1,curr[j-1]+1,prev[j-1]+cost);
  }
  for(let j=0;j<=b.length;j++)prev[j]=curr[j];
 }
 return prev[b.length];
}
export function textMatchScore(transcript:string,ocrText:string):number{
 const a=normalizeForComparison(transcript),b=normalizeForComparison(ocrText);
 if(a.length<3||b.length<3)return 0;
 const wa=a.split(' '),wb=b.split(' ');
 if(Math.abs(wa.length-wb.length)>Math.max(1,Math.round(wa.length*.25)))return 0;
 const charScore=1-distance(a,b)/Math.max(a.length,b.length);
 const intersection=wa.filter(x=>wb.includes(x)).length;
 const union=new Set([...wa,...wb]).size;
 const tokenScore=intersection/Math.max(1,union);
 return Math.round((.8*charScore+.2*tokenScore)*1000)/1000;
}
function bestBlock(frames:FrameResult[],t:number,text:string):{block:OcrBlock;score:number}|null{
 let found:{block:OcrBlock;score:number}|null=null;
 for(const frame of frames){
  const d=t-frame.frameSec;
  if(d < -3 || d > 9)continue; // screenshot may precede the spoken text, not prove alignment
  for(const block of frame.blocks){
   if(block.proposedRole==='ignore')continue;
   const score=textMatchScore(text,block.text);
   if(score<.88)continue;
   const weighted=score-Math.abs(d)*.001;
   if(!found||weighted>found.score)found={block,score:weighted};
  }
 }
 return found;
}
/** Conservative proposed links. Never certify QA or classify slow/fast playback. */
export function proposeTextLinks(segments:TimedTranscript[],frames:FrameResult[]):TextMatch[]{
 const proposals:TextMatch[]=[];
 for(const s of segments){
  if(s.ocrId || s.qa==='MANUALLY_VERIFIED')continue;
  if(!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.end<=s.start)continue;
  const candidate=bestBlock(frames,(s.start+s.end)/2,s.text);
  if(!candidate)continue;
  proposals.push({clipId:s.id,ocrId:candidate.block.id,frameSec:candidate.block.frameSec,
   text:candidate.block.text,score:Math.max(0,Math.round(candidate.score*1000)/1000)});
 }
 return proposals;
}
