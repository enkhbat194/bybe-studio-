// End-to-end auto-link regression with real FFmpeg audio peaks + Tesseract OCR.
// This intentionally DOES NOT certify speech recognition or clip precision.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { proposeVisualAudio } from '../src/lib/autoAlign.ts';

const PORT=34569,BASE='http://127.0.0.1:'+PORT,header={'X-BYBE-Request':'1'};
const run=(cmd,args)=>new Promise((resolve,reject)=>{
 const child=spawn(cmd,args,{stdio:['ignore','ignore','pipe']});
 let error='';child.stderr.on('data',b=>error+=String(b));
 child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(cmd+' failed: '+error.slice(-2500))));
});
async function api(url,method='GET',payload){
 const res=await fetch(BASE+url,{method,headers:payload instanceof Uint8Array?
 {...header,'Content-Type':'application/octet-stream'}:
 {...header,...(payload?{'Content-Type':'application/json'}:{})},
 body:payload instanceof Uint8Array?payload:payload?JSON.stringify(payload):undefined});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(url+': '+res.status+' '+JSON.stringify(data));
 return data;
}
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bybe-autolink-smoke-'));
const raw=path.join(dir,'voice.raw'),video=path.join(dir,'voice.mp4');
let server;
try{
 // An original, synthesized signal with distinct sound islands; no user audio.
 const sampleRate=16000,seconds=16,samples=sampleRate*seconds;
 const pcm=Buffer.alloc(samples*2);
 const bursts=[[1.1,2.45],[3.8,5.65],[7.2,8.6],[10.1,12.2]];
 for(let i=0;i<samples;i++){
  const t=i/sampleRate;
  const voice=bursts.some(([a,b])=>t>=a&&t<b);
  pcm.writeInt16LE(voice?Math.round(13000*Math.sin(2*Math.PI*425*t)):0,i*2);
 }
 await fs.writeFile(raw,pcm);
 const filter="drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='růžová':fontsize=64:fontcolor=0x14243d:x=63:y=48";
 await run('ffmpeg',['-hide_banner','-loglevel','error','-y',
  '-f','lavfi','-i','color=c=0x9acbe0:s=960x540:r=6:d=16',
  '-f','s16le','-ar',String(sampleRate),'-ac','1','-i',raw,
  '-vf',filter,'-c:v','mpeg4','-q:v','5','-c:a','aac',
  '-t','16','-shortest',video]);
 server=spawn('node',['--import','tsx','server.ts'],{env:{...process.env,PORT:String(PORT),HOST:'127.0.0.1'},
  stdio:['ignore','pipe','pipe']});
 let log='';server.stdout.on('data',b=>log+=String(b));server.stderr.on('data',b=>log+=String(b));
 let ready=false;
 for(let i=0;i<60;i++){await sleep(400);try{await api('/api/health');ready=true;break;}catch{}}
 if(!ready)throw Error('Server failed '+log.slice(-2000));
 const bytes=await fs.readFile(video);
 const created=await api('/api/media/start','POST',{name:'source.mp4',size:bytes.length,modified:123});
 await api('/api/media/'+created.id+'/chunk?offset=0','PUT',new Uint8Array(bytes));
 const finished=await api('/api/media/'+created.id+'/finish','POST',{});
 const sourceId=created.id;
 if(finished.duration<15.5)throw Error('Source duration unexpectedly short');
 const scan=await api('/api/scan/start','POST',{sourceId,sampleEvery:5});
 let job;
 for(let i=0;i<110;i++){
  await sleep(500);
  job=await api('/api/scan/'+scan.id);
  if(['complete','error'].includes(job.status))break;
 }
 if(job?.status!=='complete')throw Error('Local OCR did not finish: '+JSON.stringify(job));
 const result=await api('/api/scan/'+scan.id+'/results?afterPart=-1');
 const frames=result.parts.flatMap(p=>p.frames||[]);
 if(!frames.some(f=>f.blocks.some(b=>b.text.toLocaleLowerCase('cs').includes('růžová'))))
  throw Error('Czech OCR lost actual title: '+JSON.stringify(frames).slice(0,900));
 const audio=await api('/api/media/'+sourceId+'/peaks?start=0&end=16&bins=1200');
 const candidates=proposeVisualAudio(frames,audio.peaks,0,16);
 if(!candidates.some(c=>c.text.toLocaleLowerCase('cs').includes('růžová')&&c.end>c.start))
  throw Error('No automatic audio/text candidate: '+JSON.stringify({frames,candidates}).slice(0,1100));
 if(candidates.some(c=>c.kind!=='unknown'||c.method!=='VISUAL_AUDIO_ESTIMATE'))
  throw Error('Auto link proposals must be unverified and unclassified');
 console.log('PASS real MP4 → local OCR → FFmpeg PCM → automatic unverified audio-text linking:',candidates.length);
}finally{
 server?.kill();
 await fs.rm(dir,{recursive:true,force:true});
}
