import type { Express } from 'express';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { getLocalSource } from './mediaLibrary';

type AsrReply={id:string;ok:boolean;error?:string;segments?:unknown[];language?:string;device?:string;status?:string};
let worker:ChildProcessWithoutNullStreams|null=null;
let pending=new Map<string,{resolve:(v:AsrReply)=>void;reject:(e:Error)=>void;timer:NodeJS.Timeout}>();
let stdoutBuffer='',stderrTail='';
function failAll(message:string){
 for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(new Error(message));}
 pending.clear();worker=null;
}
function launchWorker():ChildProcessWithoutNullStreams{
 if(worker&&!worker.killed)return worker;
 const windows=process.platform==='win32';
 const cmd=process.env.BYBE_PYTHON || (windows?'py':'python3');
 const args=[...(windows&&cmd==='py'?['-3.11']:[]),path.join(process.cwd(),'scripts','local_asr_worker.py')];
 const child=spawn(cmd,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
 worker=child;stdoutBuffer='';stderrTail='';
 child.stdout.on('data',(chunk:Buffer)=>{
  stdoutBuffer+=chunk.toString('utf8');
  if(stdoutBuffer.length>10_000_000){child.kill();return;}
  let index;
  while((index=stdoutBuffer.indexOf('\n'))>=0){
   const line=stdoutBuffer.slice(0,index);stdoutBuffer=stdoutBuffer.slice(index+1);
   try{
    const parsed=JSON.parse(line) as AsrReply;
    const op=pending.get(parsed.id);if(!op)continue;
    clearTimeout(op.timer);pending.delete(parsed.id);
    if(parsed.ok)op.resolve(parsed);
    else op.reject(new Error(parsed.error||'Whisper ASR ажилласангүй.'));
   }catch(e){console.error('Invalid ASR worker reply',e);}
  }
 });
 child.stderr.on('data',(b:Buffer)=>{stderrTail=(stderrTail+b.toString('utf8')).slice(-2000);});
 child.on('error',err=>failAll('Python ASR эхлүүлэх боломжгүй: '+err.message));
 child.on('exit',code=>failAll('ASR worker зогссон ('+code+'). '+stderrTail.slice(-350)));
 return child;
}
async function transcribe(source:string,start:number,end:number):Promise<AsrReply>{
 return new Promise<AsrReply>((resolve,reject)=>{
  const id=randomUUID(),child=launchWorker();
  const timer=setTimeout(()=>{child.kill();},20*60*1000);
  pending.set(id,{resolve,reject,timer});
  child.stdin.write(JSON.stringify({id,source,start,end})+'\n',e=>{
   if(e){const p=pending.get(id);if(p){pending.delete(id);clearTimeout(p.timer);reject(e);}}
  });
 });
}
export function registerLocalAsrRoutes(app:Express){
 app.use('/api/asr',(req,res,next)=>{
  if(req.method!=='GET'&&req.get('X-BYBE-Request')!=='1'){res.status(403).end();return;}
  next();
 });
 app.get('/api/asr/status',(_req,res)=>res.json({
  service:'faster-whisper',optional:true,workerRunning:!!worker&&!worker.killed,
  model:process.env.BYBE_ASR_MODEL||'small',
  note:'Python 3.11 + faster-whisper заавал суусан байх хэрэгтэй. Транскрипц зөвхөн санал.'
 }));
 app.post('/api/asr/part',async(req,res)=>{
  const {sourceId}=req.body||{};
  const start=Number(req.body?.start),end=Number(req.body?.end);
  if(typeof sourceId!=='string'||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end-start>600){
   res.status(400).json({error:'ASR эх файл эсвэл хугацаа буруу.'});return;
  }
  const source=await getLocalSource(sourceId);
  if(!source||!source.meta.duration||end>source.meta.duration+.05){
   res.status(404).json({error:'ASR эх файл олдсонгүй.'});return;
  }
  try{
   const output=await transcribe(source.filepath,start,end);
   res.json(output);
  }catch(e){
   res.status(502).json({error:e instanceof Error?e.message:'Локал Whisper яриа таних алдаа.'});
  }
 });
}
