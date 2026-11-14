import type { Express, Request, Response } from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

const ROOT=path.resolve(process.cwd(),'local_data','media');
const MAX_CHUNK=8*1024*1024;
const MAX_SOURCE=25*1024*1024*1024; // capacity is additionally limited by free disk
const SAMPLE_RATE=8000;
type State='uploading'|'ready';
export interface SourceMeta{
 id:string;filename:string;size:number;modified:number;state:State;uploaded:number;
 hash?:string;duration?:number;createdAt:string;revisions:RevisionMeta[];
}
export interface RevisionMeta{
 id:string;clipId?:string;text:string;kind:string;start:number;end:number;
 filename:string;sha256:string;bytes:number;createdAt:string;qa:'REVIEW_REQUIRED';
}
export type Runner = (args:string[],binary?:string)=>Promise<{code:number;stdout:Buffer;stderr:string}>;

export async function ffRun(args:string[],binary='ffmpeg',maxOutput=20_000_000):Promise<{code:number;stdout:Buffer;stderr:string}>{
 return new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const chunks:Buffer[]=[];let size=0,stderr='';
  child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>maxOutput){child.kill();reject(new Error('FFmpeg үр дүн хэт том.'))}else chunks.push(chunk);});
  child.stderr.on('data',(b:Buffer)=>{stderr=(stderr+b.toString('utf8')).slice(-4000);});
  child.on('error',reject);
  child.on('close',code=>resolve({code:code??-1,stdout:Buffer.concat(chunks),stderr}));
 });
}
function validId(id:string):boolean{return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)}
const sourceDir=(id:string)=>path.join(ROOT,id);
const manifestFile=(id:string)=>path.join(sourceDir(id),'manifest.json');
const original=(id:string)=>path.join(sourceDir(id),'source.bin');
const validName=(n:string)=>/\.(mkv|mp4|mov|webm|mp3|wav|m4a|aac|flac)$/i.test(n);
const jsonSafeName=(x:string)=>x.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,95)||'untitled';
const sha256=async(file:string)=>new Promise<string>((resolve,reject)=>{
 const stream=fs.createReadStream(file),hash=createHash('sha256');
 stream.on('data',b=>hash.update(b));stream.on('error',reject);stream.on('end',()=>resolve(hash.digest('hex')));
});
export async function getLocalSource(id:string):Promise<{meta:SourceMeta;filepath:string}|null>{
 const m=await load(id);return m&&m.state==='ready'?{meta:m,filepath:original(id)}:null;
}
async function load(id:string):Promise<SourceMeta|null>{
 if(!validId(id))return null;
 try{return JSON.parse(await fsp.readFile(manifestFile(id),'utf8')) as SourceMeta;}catch{return null;}
}
async function save(m:SourceMeta){
 const tmp=manifestFile(m.id)+'.'+randomUUID()+'.tmp';
 await fsp.writeFile(tmp,JSON.stringify(m,null,2),'utf8');
 await fsp.rename(tmp,manifestFile(m.id));
}
function num(v:unknown):number{return typeof v==='number'?v:Number(v);}
function fail(res:Response,e:unknown,code=500){
 console.error('BYBE media:',e instanceof Error?e.message:String(e));
 return res.status(code).json({error:e instanceof Error?e.message:'Аудионы хөдөлгүүрийн алдаа'});
}
async function sourceOr404(id:string,res:Response){
 const m=await load(id);if(!m){res.status(404).json({error:'Эх файл олдсонгүй.'});return null;}return m;
}
const locks=new Map<string,Promise<void>>();
async function serial<T>(key:string,op:()=>Promise<T>):Promise<T>{
 const prev=locks.get(key)||Promise.resolve();
 let release=()=>{};
 const next=new Promise<void>(r=>{release=r;});
 locks.set(key,next);await prev;
 try{return await op();}finally{release();if(locks.get(key)===next)locks.delete(key);}
}
export function validClip(start:number,end:number,duration:number):boolean{
 return [start,end,duration].every(Number.isFinite)&&start>=0&&end>start&&end-start>=0.04&&end-start<=300&&end<=duration+.05;
}
export function peaksFromPcm(buffer:Buffer,bins:number):number[]{
 if(bins<1||bins>8000||buffer.length%2!==0)return[];
 const n=buffer.length/2,acc=new Float64Array(bins),count=new Uint32Array(bins);
 for(let i=0;i<n;i++){
  const bin=Math.min(bins-1,Math.floor(i*bins/Math.max(n,1)));
  const v=buffer.readInt16LE(2*i)/32768;
  acc[bin]+=v*v;count[bin]++;
 }
 const raw=Array.from(acc,(v,i)=>Math.sqrt(v/Math.max(count[i],1)));
 const peak=Math.max(.001,...raw);
 return raw.map(v=>Math.round(1000*v/peak)/1000);
}
async function probe(file:string):Promise<number>{
 const r=await ffRun(['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file],'ffprobe',25000);
 if(r.code!==0)throw Error('FFprobe уншиж чадсангүй: '+r.stderr.slice(-180));
 const d=Number(r.stdout.toString('utf8').trim());
 if(!Number.isFinite(d)||d<=0)throw Error('Видеоны үргэлжлэх хугацаа тодорхойгүй.');
 return d;
}
export function registerMediaRoutes(app:Express):void{
 // Uploads remain on this computer. Explicit same-origin custom header mitigates drive-by browser requests.
 app.use('/api/media',(req,res,next)=>{
  if(req.method!=='GET'&&req.get('X-BYBE-Request')!=='1'){res.status(403).json({error:'Зөвшөөрөгдсөн локал хүсэлт биш.'});return;}
  const origin=req.get('Origin');
  if(origin){try{if(new URL(origin).host!==req.get('Host')){res.status(403).json({error:'Гаднын origin хориглосон.'});return;}}
   catch{res.status(403).end();return;}}
  next();
 });
 app.post('/api/media/start',async(req,res)=>{
  try{
   const {name,size,modified}=req.body||{};
   if(typeof name!=='string'||name.length>240||!validName(name)||!Number.isSafeInteger(size)||size<=0||size>MAX_SOURCE){
    res.status(400).json({error:'Файлын төрөл эсвэл хэмжээ буруу байна.'});return;
   }
   await fsp.mkdir(ROOT,{recursive:true});
   const id=randomUUID(),dir=sourceDir(id);
   await fsp.mkdir(dir,{recursive:false});
   await fsp.writeFile(original(id),'',{flag:'wx'});
   const m:SourceMeta={id,filename:path.basename(name),size,modified:num(modified)||0,state:'uploading',uploaded:0,
    createdAt:new Date().toISOString(),revisions:[]};
   await save(m);
   res.json({id,uploaded:0,size});
  }catch(e){fail(res,e);}
 });
 app.get('/api/media/:id',async(req,res)=>{
  const m=await sourceOr404(req.params.id,res);if(!m)return;
  res.json(m);
 });
 app.put('/api/media/:id/chunk',async(req,res)=>{
  const id=req.params.id;
  if(!validId(id)){res.status(400).end();return;}
  const offset=Number(req.query.offset);
  const len=Number(req.get('content-length')||0);
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(len)||len<1||len>MAX_CHUNK){
   res.status(400).json({error:'Файлын багц эсвэл эхлэх байршил буруу байна.'});return;
  }
  if(req.get('content-type')!=='application/octet-stream'){res.status(415).end();return;}
  try{
   const result=await serial(id,async()=>{
    const m=await load(id);
    if(!m||m.state!=='uploading')throw Error('Файл импортлох бүртгэл олдсонгүй.');
    const stats=await fsp.stat(original(id));
    if(stats.size!==m.uploaded){m.uploaded=stats.size;await save(m);}
    if(offset!==m.uploaded)throw Error('Дараагийн хэсгийн offset таарахгүй: '+m.uploaded);
    if(m.uploaded+len>m.size)throw Error('Файлын хэмжээ хэтэрсэн.');
    const out=fs.createWriteStream(original(id),{flags:'a'});
    await pipeline(req,out);
    const bytes=(await fsp.stat(original(id))).size;
    if(bytes>m.size)throw Error('Импорт хэмжээ хэтэрсэн.');
    m.uploaded=bytes;await save(m);
    return {uploaded:bytes,size:m.size};
   });
   res.json(result);
  }catch(e){fail(res,e,409);}
 });
 app.post('/api/media/:id/finish',async(req,res)=>{
  const id=req.params.id;if(!validId(id)){res.status(400).end();return;}
  try{
   const out=await serial(id,async()=>{
    const m=await load(id);
    if(!m)throw Error('Файл олдсонгүй.');
    if(m.state==='ready')return m;
    if((await fsp.stat(original(id))).size!==m.size)throw Error('Файл бүрэн хуулагдаагүй.');
    const duration=await probe(original(id));
    m.hash=await sha256(original(id));m.duration=duration;m.uploaded=m.size;m.state='ready';await save(m);
    return m;
   });
   res.json(out);
  }catch(e){fail(res,e,422);}
 });
 app.post('/api/media/:id/prepare-preview',async(req,res)=>{
  const id=req.params.id;const m=await sourceOr404(id,res);if(!m)return;
  if(m.state!=='ready'){res.status(409).json({error:'Эх видео бүрэн импортлогдоогүй.'});return;}
  const input=original(m.id),preview=path.join(sourceDir(id),'browser-preview.mp4');
  try{
   const out=await serial(id,async()=>{
    try{if((await fsp.stat(preview)).size>0)return {ready:true,url:'/api/media/'+id+'/preview'};}catch{/* not generated */}
    const temp=preview+'.partial.mp4';
    await fsp.rm(temp,{force:true});
    const r=await ffRun(['-hide_banner','-nostdin','-y','-loglevel','error','-i',input,
      '-map','0:v:0','-map','0:a:0?','-c:v','copy','-c:a','aac','-b:a','128k',
      '-movflags','+faststart','-f','mp4',temp],'ffmpeg',24000);
    if(r.code!==0)throw Error('MP4 preview remux алдаа: '+r.stderr.slice(-300));
    await fsp.rename(temp,preview);
    return {ready:true,url:'/api/media/'+id+'/preview'};
   });
   res.json(out);
  }catch(e){fail(res,e);}
 });
 app.get('/api/media/:id/preview',async(req,res)=>{
  if(!validId(req.params.id)){res.status(404).end();return;}
  const m=await load(req.params.id);if(!m||m.state!=='ready'){res.status(404).end();return;}
  const preview=path.join(sourceDir(m.id),'browser-preview.mp4');
  try{await fsp.access(preview);res.type('mp4');res.sendFile(preview);}catch{res.status(404).end();}
 });
 app.get('/api/media/:id/peaks',async(req,res)=>{
  const m=await sourceOr404(req.params.id,res);if(!m)return;
  if(m.state!=='ready'||!m.duration){res.status(409).json({error:'Видео бүрэн импортлогдоогүй.'});return;}
  const start=num(req.query.start),end=num(req.query.end);
  const bins=Math.floor(num(req.query.bins)||1200);
  if(!Number.isFinite(start)||start<0||!Number.isFinite(end)||end<=start||end>m.duration+.01||end-start>600||bins<64||bins>5000){
   res.status(400).json({error:'Долгионы хугацаа эсвэл хэмжээ буруу.'});return;
  }
  try{
   const r=await ffRun(['-v','error','-ss',String(start),'-i',original(m.id),'-t',String(end-start),
    '-vn','-ac','1','-ar',String(SAMPLE_RATE),'-f','s16le','pipe:1'],'ffmpeg',12_000_000);
   if(r.code!==0)throw Error('FFmpeg waveform алдаа: '+r.stderr.slice(-180));
   res.json({start,end,peaks:peaksFromPcm(r.stdout,bins)});
  }catch(e){fail(res,e);}
 });
 app.post('/api/media/:id/export-wav',async(req,res)=>{
  const id=req.params.id;
  const m=await sourceOr404(id,res);if(!m)return;
  if(m.state!=='ready'||!m.duration){res.status(409).json({error:'Эх медиа бэлэн биш.'});return;}
  const {text,kind,clipId}=req.body||{},start=num(req.body?.start),end=num(req.body?.end);
  const kinds=['word_normal','word_slow','sentence_normal','sentence_slow','english_word','english_sentence','unknown'];
  if(typeof text!=='string'||!text.trim()||text.length>300||!kinds.includes(kind)||!validClip(start,end,m.duration)){
   res.status(400).json({error:'Экспортын текст, төрөл эсвэл эхлэл/төгсгөл буруу.'});return;
  }
  try{
   const revision=await serial(id,async()=>{
    const revId=randomUUID();
    const dir=path.join(sourceDir(id),'revisions');
    await fsp.mkdir(dir,{recursive:true});
    const filename=jsonSafeName(text)+'__'+kind+'__'+revId.slice(0,8)+'.wav';
    const output=path.join(dir,filename);
    const r=await ffRun(['-hide_banner','-nostdin','-y','-loglevel','error','-ss',String(start),'-i',original(id),
      '-t',String(end-start),'-vn','-ac','1','-ar','44100','-c:a','pcm_s16le',output],'ffmpeg',20000);
    if(r.code!==0)throw Error('WAV таслахад алдаа: '+r.stderr.slice(-300));
    const [hash,stat]=await Promise.all([sha256(output),fsp.stat(output)]);
    if(!stat.size){await fsp.rm(output,{force:true});throw Error('Хоосон WAV үүссэн.');}
    const rev:RevisionMeta={id:revId,clipId:typeof clipId==='string'?clipId:undefined,text:text.trim(),kind,start,end,
      filename,sha256:hash,bytes:stat.size,createdAt:new Date().toISOString(),qa:'REVIEW_REQUIRED'};
    const latest=await load(id);if(!latest)throw Error('Эх бүртгэл устсан.');
    latest.revisions.push(rev);await save(latest);
    return rev;
   });
   res.json(revision);
  }catch(e){fail(res,e);}
 });
 app.get('/api/media/:id/revisions',async(req,res)=>{
  const m=await sourceOr404(req.params.id,res);if(m)res.json({revisions:m.revisions});
 });
 app.get('/api/media/:id/revisions/:revisionId/download',async(req,res)=>{
  const m=await sourceOr404(req.params.id,res);if(!m)return;
  const rev=m.revisions.find(r=>r.id===req.params.revisionId);
  if(!rev){res.status(404).end();return;}
  res.download(path.join(sourceDir(m.id),'revisions',rev.filename),rev.filename);
 });
}
