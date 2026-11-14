import type { Express } from 'express';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getLocalSource } from './mediaLibrary';
import { planParts } from '../src/lib/parts';
import { transcribeLocalPart } from './localAsr';

const ROOT=path.resolve(process.cwd(),'local_data','asr-jobs');
interface Job{
 id:string;sourceId:string;status:'queued'|'running'|'paused'|'complete'|'error';
 totalParts:number;nextPart:number;message:string;updatedAt:string;
}
const jobs=new Map<string,Job>();
const isId=(s:string)=>/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s);
const filepath=(id:string)=>path.join(ROOT,id+'.json');
const resultfile=(id:string,i:number)=>path.join(ROOT,id+'-part-'+i+'.json');
const save=async(job:Job)=>{
 await fsp.mkdir(ROOT,{recursive:true});
 job.updatedAt=new Date().toISOString();
 const tmp=filepath(job.id)+'.tmp-'+randomUUID();
 await fsp.writeFile(tmp,JSON.stringify(job));await fsp.rename(tmp,filepath(job.id));
};
let active:string|null=null,initialized=false;
const paused=(job:Job)=>jobs.get(job.id)?.status==='paused';
async function run(){
 if(active)return;
 const job=Array.from(jobs.values()).find(j=>j.status==='queued');
 if(!job)return;
 active=job.id;job.status='running';await save(job);
 try{
  const source=await getLocalSource(job.sourceId);
  if(!source||!source.meta.duration)throw Error('Эх видео локал FFmpeg хөдөлгүүрт бүрэн импортлоогүй.');
  const parts=planParts(source.meta.duration,5,2);
  while(job.nextPart<parts.length){
   if(paused(job))break;
   const p=parts[job.nextPart];
   job.message='Whisper · '+(job.nextPart+1)+'/'+parts.length+' хэсгийн яриаг таньж байна';
   await save(job);
   const recognized=await transcribeLocalPart(source.filepath,p.coreStart,p.coreEnd);
   if(paused(job))break;
   const output={partIndex:job.nextPart,coreStart:p.coreStart,coreEnd:p.coreEnd,
    language:recognized.language||'unknown',device:recognized.device||'unknown',
    segments:recognized.segments||[],status:'ASR_PROPOSAL_REVIEW_REQUIRED'};
   const tmp=resultfile(job.id,job.nextPart)+'.tmp-'+randomUUID();
   await fsp.writeFile(tmp,JSON.stringify(output));await fsp.rename(tmp,resultfile(job.id,job.nextPart));
   job.nextPart++;
   job.message='Whisper · '+job.nextPart+'/'+parts.length+' хэсгийн санал бэлэн';
   await save(job);
  }
  if(!paused(job)){job.status='complete';job.message='ASR яриа таних бүх хэсэг дууссан';}
 }catch(e){job.status='error';job.message=e instanceof Error?e.message:'Whisper ASR алдаа';}
 finally{await save(job);active=null;void run();}
}
export async function recoverAsrJobs(){
 if(initialized)return;initialized=true;
 await fsp.mkdir(ROOT,{recursive:true});
 for(const item of await fsp.readdir(ROOT)){
  if(!item.endsWith('.json')||item.includes('-part-'))continue;
  try{
   const j=JSON.parse(await fsp.readFile(path.join(ROOT,item),'utf8')) as Job;
   if(!isId(j.id))continue;
   if(j.status==='running')j.status='queued';
   jobs.set(j.id,j);
  }catch{/* ignore invalid manifest */}
 }
 void run();
}
export function registerBackgroundAsr(app:Express){
 app.use('/api/asr-jobs',(req,res,next)=>{
  if(req.method!=='GET'&&req.get('X-BYBE-Request')!=='1'){res.status(403).end();return;}
  next();
 });
 app.post('/api/asr-jobs/start',async(req,res)=>{
  const id=req.body?.sourceId;
  if(typeof id!=='string'||!isId(id)){res.status(400).json({error:'Эх файлын ID буруу.'});return;}
  const source=await getLocalSource(id);
  if(!source||!source.meta.duration){res.status(404).json({error:'Эх видео бэлэн биш.'});return;}
  const existing=Array.from(jobs.values()).find(j=>j.sourceId===id);
  if(existing){res.json(existing);return;}
  const job:Job={id:randomUUID(),sourceId:id,status:'queued',nextPart:0,
   totalParts:planParts(source.meta.duration,5,2).length,message:'ASR дараалалд',
   updatedAt:new Date().toISOString()};
  jobs.set(job.id,job);await save(job);res.json(job);void run();
 });
 app.get('/api/asr-jobs/:id',async(req,res)=>{
  const j=jobs.get(req.params.id);if(!j){res.status(404).end();return;}res.json(j);
 });
 app.get('/api/asr-jobs/:id/results',async(req,res)=>{
  const j=jobs.get(req.params.id);if(!j){res.status(404).end();return;}
  const after=Math.floor(Number(req.query.afterPart??-1));
  if(!Number.isFinite(after)||after<-1){res.status(400).end();return;}
  const parts=[];
  for(let i=after+1;i<Math.min(j.nextPart,after+6);i++){
   try{parts.push(JSON.parse(await fsp.readFile(resultfile(j.id,i),'utf8')));}catch{/* skip */}
  }
  res.json({parts,nextPart:j.nextPart,status:j.status});
 });
 app.post('/api/asr-jobs/:id/pause',async(req,res)=>{
  const j=jobs.get(req.params.id);if(!j){res.status(404).end();return;}
  if(j.status==='running'||j.status==='queued'){j.status='paused';j.message='Түр зогсоох хүсэлт — одоогийн хэсэг дуусахад хүчинтэй';await save(j);}
  res.json(j);
 });
 app.post('/api/asr-jobs/:id/resume',async(req,res)=>{
  const j=jobs.get(req.params.id);if(!j){res.status(404).end();return;}
  if(j.status==='paused'||j.status==='error'){j.status='queued';j.message='ASR дараалалд';await save(j);void run();}
  res.json(j);
 });
}
