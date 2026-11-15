// Evaluate acoustic boundary proposals against the USER'S manually verified gold times.
// No fabricated results, no cloud API, no modification of the source media.
// Usage:
//   node --import tsx scripts/evaluate_audio_boundaries.mjs source.mkv gold.json
// gold.json: {"samples":[{"id":"95-word","roughStart":12.4,"roughEnd":14.2,
//                         "verifiedStart":12.68,"verifiedEnd":13.96}]}
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {analyzeBoundaryPcm} from '../server/audioBoundary.ts';
const [media,labels]=process.argv.slice(2);
if(!media||!labels){
 console.error('Usage: node --import tsx scripts/evaluate_audio_boundaries.mjs source.mkv gold.json');
 process.exit(2);
}
const gold=JSON.parse(await fs.readFile(labels,'utf8'));
const isWorkspace=gold.schema==='bybe-workspace-v2';
const samples=isWorkspace?
 (Array.isArray(gold.segments)?gold.segments:[])
  .filter(s=>s.qa==='MANUALLY_VERIFIED'&&
   Number.isFinite(s.firstPassStart)&&Number.isFinite(s.firstPassEnd)&&
   Number.isFinite(s.start)&&Number.isFinite(s.end))
  .map(s=>({id:s.id,text:s.text,roughStart:s.firstPassStart,roughEnd:s.firstPassEnd,
   verifiedStart:s.start,verifiedEnd:s.end}))
 :gold.samples;
if(!Array.isArray(samples)||samples.length===0)throw Error(
 isWorkspace?'Баталгаажсан, эхний саналын хугацаатай QA мөр байхгүй. Аудиог засаж 6 QA баталгаажуулаад JSON экспортлоно уу.':
 'Gold manifest-д samples [] байх ёстой.');
if(samples.length<20)console.warn('АНХААР: 20-аас цөөн жишээ. Энэ нь найдвартай benchmark биш.');
async function ff(args,limit=1_800_000){
 return await new Promise((resolve,reject)=>{
  const p=spawn('ffmpeg',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const chunks=[];let len=0,tail='';
  p.stdout.on('data',b=>{len+=b.length;if(len>limit)p.kill();else chunks.push(b);});
  p.stderr.on('data',b=>tail=(tail+String(b)).slice(-1000));
  p.once('error',reject);
  p.once('close',code=>code===0?resolve(Buffer.concat(chunks)):
    reject(Error('ffmpeg '+code+': '+tail)));
 });
}
const errors=[],rows=[];
for(const sample of samples){
 const {id,roughStart,roughEnd,verifiedStart,verifiedEnd}=sample;
 if(![roughStart,roughEnd,verifiedStart,verifiedEnd].every(Number.isFinite)||
    roughStart<0||roughEnd<=roughStart||roughEnd-roughStart>35||
    verifiedStart<0||verifiedEnd<=verifiedStart)throw Error('Invalid gold entry '+String(id));
 const from=Math.max(0,roughStart-2),to=roughEnd+2;
 const pcm=await ff(['-hide_banner','-nostdin','-v','error','-ss',String(from),
  '-i',media,'-t',String(to-from),'-vn','-ac','1','-ar','16000','-f','s16le','pipe:1']);
 const inferred=analyzeBoundaryPcm(pcm,from,roughStart,roughEnd,to);
 const baseline=(Math.abs(roughStart-verifiedStart)+Math.abs(roughEnd-verifiedEnd))/2;
 const after=(Math.abs(inferred.proposed.start-verifiedStart)+Math.abs(inferred.proposed.end-verifiedEnd))/2;
 rows.push({id:String(id||rows.length+1),roughStart,roughEnd,verifiedStart,verifiedEnd,
  proposedStart:inferred.proposed.start,proposedEnd:inferred.proposed.end,
  beforeMs:Math.round(baseline*1000),afterMs:Math.round(after*1000),
  improved:after<baseline-.005,regressed:after>baseline+.005,
  suggested:inferred.state==='PROPOSED_REVIEW_REQUIRED'});
 errors.push({baseline,after});
}
const avg=key=>Math.round(errors.reduce((a,x)=>a+x[key],0)/errors.length*1000);
const ranked=[...rows].sort((a,b)=>a.afterMs-b.afterMs);
const summary={samples:rows.length,baselineMAEms:avg('baseline'),refinedMAEms:avg('after'),
  improved:rows.filter(x=>x.improved).length,
  regressed:rows.filter(x=>x.regressed).length,
  unchanged:rows.filter(x=>!x.improved&&!x.regressed).length,
  refinedP90ms:ranked[Math.floor(.9*(ranked.length-1))]?.afterMs,
  caveat:'Real manually checked boundaries are required. Acoustic analysis is not word forced alignment.'};
console.log(JSON.stringify({summary,rows},null,2));
if(process.env.BYBE_EVAL_OUT){
 await fs.writeFile(process.env.BYBE_EVAL_OUT,JSON.stringify({summary,rows},null,2));
 console.error('Metrics saved: '+process.env.BYBE_EVAL_OUT);
}
