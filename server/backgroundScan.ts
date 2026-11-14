import type { Express } from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { localOcr } from './ocrLocal';
import { getLocalSource, ffRun } from './mediaLibrary';
import { planParts } from '../src/lib/parts';
import type { FrameResult } from '../src/lib/typography';

const ROOT=path.resolve(process.cwd(),'local_data','jobs');
const JOB_ID=/^[0-9a-f-]{36}$/;
export type JobStatus='queued'|'running'|'paused'|'complete'|'error';
export interface ScanJob {
 id:string;sourceId:string;status:JobStatus;kind:'ocr';sampleEvery:number;
 totalParts:number;nextPart:number;framesDone:number;
 message:string;createdAt:string;updatedAt:string;
}
const jobs=new Map<string,ScanJob>();
let active:string|null=null;
let activeProcess:ChildProcessWithoutNullStreams|null=null;
let initialized=false;
const jobPath=(id:string)=>path.join(ROOT,id+'.json');
const partPath=(id:string,index:number)=>path.join(ROOT,id+'-part-'+index+'.json');
const now=()=>new Date().toISOString();
async function save(job:ScanJob){
 job.updatedAt=now();
 await fsp.mkdir(ROOT,{recursive:true});
 const tmp=jobPath(job.id)+'.tmp-'+randomUUID();
 await fsp.writeFile(tmp,JSON.stringify(job,null,2));
 await fsp.rename(tmp,jobPath(job.id));
}
async function dimensions(file:string):Promise<{width:number;height:number}>{
 const p=await ffRun(['-v','error','-select_streams','v:0',
  '-show_entries','stream=width,height','-of','json',file],'ffprobe',20000);
 if(p.code!==0)throw Error('Видео кадрын хэмжээг уншиж чадсангүй.');
 const v=JSON.parse(p.stdout.toString('utf8')).streams?.[0];
 if(!v?.width||!v?.height)throw Error('Эх файлд видео дүрс олдсонгүй.');
 const w=960,h=Math.max(2,Math.round(v.height/v.width*w/2)*2);
 return {width:w,height:h};
}
const SOI=Buffer.from([0xff,0xd8]),EOI=Buffer.from([0xff,0xd9]);
/** Emit sampled frames from ffmpeg as an async iterator, with backpressure while OCR runs. */
async function scanPart(job:ScanJob,file:string,coreStart:number,coreEnd:number,dim:{width:number;height:number}):Promise<FrameResult[]>{
 const cmd=['-hide_banner','-nostdin','-v','error','-ss',String(coreStart),'-i',file,
  '-t',String(coreEnd-coreStart),'-vf','fps=1/'+job.sampleEvery+',scale='+dim.width+':'+dim.height,
  '-q:v','5','-f','image2pipe','-vcodec','mjpeg','pipe:1'];
 const child=spawn('ffmpeg',cmd,{windowsHide:true,stdio:['ignore','pipe','pipe']});
 activeProcess=child;
 let stderr='',pending=Buffer.alloc(0),count=0;
 const frames:FrameResult[]=[];
 child.stderr.on('data',(c:Buffer)=>{stderr=(stderr+c.toString('utf8')).slice(-1000);});
 const exitPromise=new Promise<number>((resolve,reject)=>{
  child.on('close',code=>resolve(code??-1));child.on('error',reject);
 });
 try{
  for await(const chunk of child.stdout){
   if(job.status==='paused'){child.kill();break;}
   pending=Buffer.concat([pending,chunk as Buffer]);
   if(pending.length>12_000_000)throw Error('Видео frame stream хэт том.');
   for(;;){
    const a=pending.indexOf(SOI),b=a>=0?pending.indexOf(EOI,a+2):-1;
    if(a<0){pending=Buffer.alloc(0);break;}
    if(b<0){if(a>0)pending=pending.subarray(a);break;}
    const jpg=pending.subarray(a,b+2);
    pending=pending.subarray(b+2);
    const frameSec=Math.min(coreEnd,coreStart+count*job.sampleEvery);
    count++;
    if(job.status==='paused'){child.kill();break;}
    const blocks=await localOcr(jpg,dim.width,dim.height,frameSec);
    if(blocks.length){
     // Do not store repeated identical title cards; preserve the first evidence frame.
     const previous=frames[frames.length-1];
     const fingerprint=(xs:typeof blocks)=>xs.map(x=>x.text.trim().toLowerCase()).sort().join('|');
     if(!previous||fingerprint(previous.blocks)!==fingerprint(blocks))frames.push({frameSec,blocks});
    }
    job.framesDone++;
    job.message='OCR · хэсэг '+(job.nextPart+1)+'/'+job.totalParts+' · '+count+' кадр';
   }
  }
  const exit=await exitPromise;
  if(job.status!=='paused'&&exit!==0)throw Error('FFmpeg кадр уншихад алдаа: '+stderr);
  return frames;
 }catch(e){
  child.kill();await exitPromise.catch(()=>{});
  throw e;
 }finally{
  if(activeProcess===child)activeProcess=null;
 }
}
async function runQueue(){
 if(active)return;
 const job=Array.from(jobs.values()).find(j=>j.status==='queued');
 if(!job)return;
 active=job.id;job.status='running';await save(job);
 try{
  const source=await getLocalSource(job.sourceId);
  if(!source||!source.meta.duration)throw Error('Эх видео локал хөдөлгүүрт бэлэн биш.');
  const parts=planParts(source.meta.duration,5,2);
  const dim=await dimensions(source.filepath);
  while(job.nextPart<parts.length){
   if(job.status==='paused')break;
   const p=parts[job.nextPart];
   const frames=await scanPart(job,source.filepath,p.coreStart,p.coreEnd,dim);
   if(job.status==='paused')break;
   const tmp=partPath(job.id,job.nextPart)+'.tmp';
   await fsp.writeFile(tmp,JSON.stringify({partIndex:job.nextPart,coreStart:p.coreStart,coreEnd:p.coreEnd,frames}));
   await fsp.rename(tmp,partPath(job.id,job.nextPart));
   job.nextPart++;job.message='Хэсэг '+job.nextPart+'/'+parts.length+' OCR бэлэн';
   await save(job);
  }
  if(job.status!=='paused'){job.status='complete';job.message='Бүх хэсгийн OCR дууссан';}
 }catch(e){
  job.status='error';job.message=e instanceof Error?e.message:'OCR боловсруулах алдаа';
 }finally{
  await save(job);active=null;void runQueue();
 }
}
export async function recoverScanJobs(){
 if(initialized)return;
 initialized=true;
 await fsp.mkdir(ROOT,{recursive:true});
 for(const name of await fsp.readdir(ROOT)){
  if(!name.endsWith('.json')||name.includes('-part-'))continue;
  try{
   const j=JSON.parse(await fsp.readFile(path.join(ROOT,name),'utf8')) as ScanJob;
   if(!JOB_ID.test(j.id)||j.kind!=='ocr')continue;
   if(j.status==='running')j.status='queued'; // reprocess current unfinished part after crash
   jobs.set(j.id,j);
  }catch{/* invalid manifest skipped */}
 }
 void runQueue();
}
export function registerScanRoutes(app:Express){
 app.use('/api/scan',(req,res,next)=>{
  if(req.method!=='GET'&&req.get('X-BYBE-Request')!=='1'){res.status(403).end();return;}
  next();
 });
 app.post('/api/scan/start',async(req,res)=>{
  const sourceId=req.body?.sourceId,sampleEvery=Number(req.body?.sampleEvery||5);
  if(typeof sourceId!=='string'||!JOB_ID.test(sourceId)||![3,4,5,8,10].includes(sampleEvery)){
   res.status(400).json({error:'Эх видео эсвэл OCR давтамж буруу байна.'});return;
  }
  const source=await getLocalSource(sourceId);
  if(!source||!source.meta.duration){res.status(404).json({error:'Эх видео локал хөдөлгүүрт бэлэн биш.'});return;}
  const existing=Array.from(jobs.values()).find(j=>j.sourceId===sourceId&&j.kind==='ocr'&&j.status!=='error');
  if(existing){res.json(existing);return;}
  const job:ScanJob={id:randomUUID(),sourceId,status:'queued',kind:'ocr',sampleEvery,
   totalParts:planParts(source.meta.duration,5,2).length,nextPart:0,framesDone:0,
   message:'OCR дараалалд орлоо',createdAt:now(),updatedAt:now()};
  jobs.set(job.id,job);await save(job);res.json(job);void runQueue();
 });
 app.get('/api/scan/:id',async(req,res)=>{
  const j=jobs.get(req.params.id);
  if(!j){res.status(404).json({error:'OCR job олдсонгүй.'});return;}
  res.json(j);
 });
 app.get('/api/scan/:id/results',async(req,res)=>{
  const j=jobs.get(req.params.id);
  if(!j){res.status(404).end();return;}
  const after=Number(req.query.afterPart??-1),parts=[];
  for(let i=Math.max(0,after+1);i<Math.min(j.nextPart,after+1+5);i++){
   try{parts.push(JSON.parse(await fsp.readFile(partPath(j.id,i),'utf8')));}catch{/* partial item ignored */}
  }
  res.json({parts,nextPart:j.nextPart,status:j.status});
 });
 app.post('/api/scan/:id/pause',async(req,res)=>{
  const j=jobs.get(req.params.id);if(!j){res.status(404).end();return;}
  if(j.status==='queued'||j.status==='running'){j.status='paused';j.message='Хэрэглэгч түр зогсоосон';activeProcess?.kill();await save(j);}
  res.json(j);
 });
 app.post('/api/scan/:id/resume',async(req,res)=>{
  const j=jobs.get(req.params.id);if(!j){res.status(404).end();return;}
  if(j.status==='paused'||j.status==='error'){j.status='queued';j.message='Дахин үргэлжлүүлэх дараалалд';await save(j);}
  res.json(j);void runQueue();
 });
}
