// End-to-end local server smoke test with a real synthesized MP4 and FFmpeg.
// No Gemini API, no Python/ASR, and no user media required.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT=process.cwd(),PORT=34567,BASE='http://127.0.0.1:'+PORT;
const headers={'X-BYBE-Request':'1'};
const run=(bin,args,cwd=ROOT)=>new Promise((resolve,reject)=>{
 const p=spawn(bin,args,{cwd,env:process.env,stdio:['ignore','ignore','pipe']});
 let stderr='';p.stderr.on('data',b=>stderr+=b.toString('utf8'));
 p.on('error',reject);p.on('close',code=>code===0?resolve(undefined):reject(Error(bin+' exited '+code+' '+stderr.slice(-1500))));
});
async function json(pathname,method='GET',body){
 const response=await fetch(BASE+pathname,{
  method,headers:body instanceof Uint8Array?{...headers,'Content-Type':'application/octet-stream'}:
   {...headers,...(body?{'Content-Type':'application/json'}:{})},
  body:body instanceof Uint8Array?body:body?JSON.stringify(body):undefined});
 const value=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(method+' '+pathname+' status '+response.status+': '+JSON.stringify(value));
 return value;
}
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'bybe-media-smoke-'));
const input=path.join(temp,'tiny.mp4');
let server;
try{
 await run('ffmpeg',['-hide_banner','-loglevel','error','-y',
  '-f','lavfi','-i','color=c=navy:s=320x180:r=15:d=3',
  '-f','lavfi','-i','sine=frequency=440:duration=3',
  '-c:v','mpeg4','-q:v','6','-c:a','aac','-shortest',input]);
 const data=await fs.readFile(input);
 server=spawn('node',['--import','tsx','server.ts'],{
  cwd:ROOT,env:{...process.env,PORT:String(PORT),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
 let serverLog='';server.stdout.on('data',b=>{serverLog+=b.toString('utf8');});
 server.stderr.on('data',b=>{serverLog+=b.toString('utf8');});
 let ready=false;
 for(let i=0;i<60;i++){
  await sleep(500);
  try{const h=await json('/api/health');if(h.ok){ready=true;break;}}catch{}
 }
 if(!ready)throw Error('Server failed to start: '+serverLog);
 const created=await json('/api/media/start','POST',{name:'tiny.mp4',size:data.length,modified:123});
 if(!created.id)throw Error('missing media source id');
 const chunk=await json('/api/media/'+created.id+'/chunk?offset=0','PUT',new Uint8Array(data));
 if(chunk.uploaded!==data.length)throw Error('incorrect upload bytes');
 const finished=await json('/api/media/'+created.id+'/finish','POST',{});
 if(finished.state!=='ready'||finished.duration<2||!finished.hash)throw Error('media finalize not ready');
 const p=await json('/api/media/'+created.id+'/peaks?start=0&end=2&bins=128');
 if(p.peaks.length!==128||Math.max(...p.peaks)<=0)throw Error('real audio peaks not present');
 const preview=await fetch(BASE+'/api/media/'+created.id+'/listen?start=0.6&end=1.8');
 const previewWav=Buffer.from(await preview.arrayBuffer());
 if(!preview.ok||previewWav.toString('ascii',0,4)!=='RIFF'||previewWav.length<5000)
  throw Error('Independent listen WAV failed');
 const denied=await fetch(BASE+'/api/media/'+created.id+'/listen?start=2&end=1');
 if(denied.status!==400)throw Error('Invalid audio preview interval was accepted');
 const rev=await json('/api/media/'+created.id+'/export-wav','POST',{
  text:'růžová',kind:'word_normal',start:.2,end:1.2,clipId:'smoke-1'});
 if(!rev.id||!rev.sha256||rev.qa!=='REVIEW_REQUIRED')throw Error('WAV revision missing metadata');
 const wav=await fetch(BASE+'/api/media/'+created.id+'/revisions/'+rev.id+'/download');
 const wavData=Buffer.from(await wav.arrayBuffer());
 if(!wav.ok||wavData.toString('ascii',0,4)!=='RIFF'||wavData.length<1000)throw Error('WAV download invalid');
 const revisions=await json('/api/media/'+created.id+'/revisions');
 if(revisions.revisions.length!==1)throw Error('revision history missing');
 const beforeQA=await json('/api/media/'+created.id+'/app-ready');
 if(beforeQA.clips.length!==0)throw Error('Unverified WAV must not be app-ready');
 const qa={
  start_heard:true,end_heard:true,whole_heard:true,
  language_correct:true,text_correct:true,role_correct:true
 };
 const verified=await json('/api/media/'+created.id+'/revisions/'+rev.id+'/verify','POST',{
  clipId:'smoke-1',text:'růžová',kind:'word_normal',start:.2,end:1.2,checks:qa});
 if(verified.qa!=='MANUALLY_VERIFIED')throw Error('Six-check QA failed');
 const appReady=await json('/api/media/'+created.id+'/app-ready');
 if(appReady.clips.length!==1||appReady.clips[0].sha256!==rev.sha256)throw Error('App-ready hash manifest mismatch');
 const streamed=await fetch(BASE+'/api/media/'+created.id+'/revisions/'+rev.id+'/stream');
 const streamedWav=Buffer.from(await streamed.arrayBuffer());
 if(!streamed.ok||streamedWav.toString('ascii',0,4)!=='RIFF')throw Error('Inline QA WAV failed');
 console.log('PASS MP4 source + waveform + independent live listen + bound check + WAV revision + hash + six QA');
}finally{
 server?.kill();
 await fs.rm(temp,{recursive:true,force:true});
}
