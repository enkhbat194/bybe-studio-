import type { Express } from 'express';
import { getLocalSource, ffRun } from './mediaLibrary';

const RATE=16_000, HOP=160, NFFT=512;
const PRE_ROLL=.065, POST_ROLL=.095;
const n3=(n:number)=>Math.round(n*1000)/1000;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const percentile=(sorted:number[],p:number)=>sorted[Math.floor(clamp(p,0,1)*Math.max(0,sorted.length-1))]||0;
export interface AcousticFrame{
 t:number;level:number;low:number;mid:number;high:number;flux:number;active:boolean;
}
export interface BoundarySuggestion{
 original:{start:number;end:number};
 proposed:{start:number;end:number};
 analysis:{start:number;end:number;hopMs:10;rate:16000};
 method:'ACOUSTIC_10MS_REVIEW_ONLY';
 state:'PROPOSED_REVIEW_REQUIRED'|'NO_CLEAR_BOUNDARY';
 changed:{start:boolean;end:boolean};
 warnings:string[];
 frames:AcousticFrame[];
}
function fft(real:Float64Array,imag:Float64Array){
 const n=real.length;
 for(let i=1,j=0;i<n;i++){
  let bit=n>>1;
  while(j&bit){j^=bit;bit>>=1;}
  j^=bit;
  if(i<j){const a=real[i];real[i]=real[j];real[j]=a;
   const b=imag[i];imag[i]=imag[j];imag[j]=b;}
 }
 for(let len=2;len<=n;len<<=1){
  const angle=-2*Math.PI/len,wr0=Math.cos(angle),wi0=Math.sin(angle);
  for(let i=0;i<n;i+=len){
   let wr=1,wi=0;
   for(let j=0;j<len/2;j++){
    const u=i+j,v=u+len/2,vr=real[v]*wr-imag[v]*wi,vi=real[v]*wi+imag[v]*wr;
    real[v]=real[u]-vr;imag[v]=imag[u]-vi;real[u]+=vr;imag[u]+=vi;
    const nwr=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=nwr;
   }
  }
 }
}
function framesFromPcm(pcm:Buffer,windowStart:number):AcousticFrame[]{
 const count=Math.floor(pcm.length/2),frames:AcousticFrame[]=[];
 const previous=new Float64Array(NFFT/2+1);
 for(let from=0;from<count;from+=HOP){
  let sum=0,nonzero=0,prev=0;
  const real=new Float64Array(NFFT),imag=new Float64Array(NFFT);
  for(let j=0;j<NFFT;j++){
   const i=from+j,raw=i<count?pcm.readInt16LE(i*2)/32768:0;
   if(j<HOP*2){sum+=raw*raw;if(j&&raw*prev<0)nonzero++;prev=raw;}
   real[j]=raw*(.5-.5*Math.cos(2*Math.PI*j/(NFFT-1)));
  }
  fft(real,imag);
  let bands=[0,0,0],flux=0;
  for(let k=3;k<=NFFT/2;k++){
   const hz=k*RATE/NFFT,power=real[k]*real[k]+imag[k]*imag[k];
   const idx=hz<450?0:hz<2300?1:2;
   bands[idx]+=power;
   const amplitude=Math.sqrt(power);
   flux+=Math.max(0,amplitude-previous[k]);
   previous[k]=amplitude;
  }
  frames.push({t:n3(windowStart+from/RATE),
   level:Math.sqrt(sum/(HOP*2)),low:Math.sqrt(bands[0]),mid:Math.sqrt(bands[1]),
   high:Math.sqrt(bands[2]),flux,active:false});
 }
 return frames;
}
interface Edge {time:number;gap:number;activity:number;distance:number}
/** Return only transitions supported by >=40ms quiet and >=40ms activity. */
function transitions(frames:AcousticFrame[],kind:'onset'|'offset',around:number){
 const candidates:Edge[]=[];
 for(let i=7;i<frames.length-7;i++){
  const t=frames[i].t;
  if(Math.abs(t-around)>.75)continue;
  // Onset has silence BEFORE, activity AFTER; offset has the reverse.
  let silence=0,active=0;
  for(let k=1;k<=6;k++){
   const before=frames[i-k].active,after=frames[i+k-1].active;
   if(kind==='onset'){
    if(!before)silence++;if(after)active++;
   }else{
    if(!after)silence++;if(before)active++;
   }
  }
  if(silence>=4&&active>=4)candidates.push({time:t,gap:silence,activity:active,distance:Math.abs(t-around)});
 }
 // Same transition creates a cluster ~20ms wide; closest proposed boundary wins.
 return candidates.sort((a,b)=>a.distance-b.distance||b.gap-a.gap)[0]||null;
}
function markActivity(frames:AcousticFrame[]){
 const values=frames.map(f=>f.level).sort((a,b)=>a-b);
 const q15=percentile(values,.15),q90=percentile(values,.9);
 // Reject constant/hiss noise with no dynamic speech-like energy change.
 if(q90<.003||q90-q15<.006)return {dynamic:false,noise:q15,peak:q90,threshold:0};
 const threshold=q15+.20*(q90-q15);
 const spectral=frames.map(f=>f.high).sort((a,b)=>a-b);
 const highBase=percentile(spectral,.20),highMax=percentile(spectral,.9);
 for(const f of frames){
  // High-frequency unvoiced consonants may be low amplitude: preserve if they rise
  // distinctly from background, but do not claim phoneme identification.
  f.active=f.level>=threshold ||
   (f.level>q15+.065*(q90-q15) && highMax>highBase*2.2 && f.high>highBase+.48*(highMax-highBase));
 }
 // Bridge <=20ms micro-gaps inside a syllable, not actual >=40ms pauses.
 for(let i=2;i<frames.length-2;i++){
  if(frames[i-1].active&&frames[i+2].active){frames[i].active=true;frames[i+1].active=true;}
 }
 return {dynamic:true,noise:q15,peak:q90,threshold};
}
export function analyzeBoundaryPcm(
 pcm:Buffer,windowStart:number,start:number,end:number,sourceDuration:number):BoundarySuggestion{
 if(!Buffer.isBuffer(pcm)||pcm.length<3200||pcm.length%2!==0)throw Error('16 kHz PCM дууны өгөгдөл буруу.');
 if(![windowStart,start,end,sourceDuration].every(Number.isFinite)||start<0||end<=start||
    end>sourceDuration+.05||windowStart>start||pcm.length>RATE*2*48)
  throw Error('Заагийн хугацаа эсвэл аудионы хэмжээ буруу.');
 const frames=framesFromPcm(pcm,windowStart);
 const activity=markActivity(frames);
 const warnings:string[]=[];
 const left=activity.dynamic?transitions(frames,'onset',start):null;
 const right=activity.dynamic?transitions(frames,'offset',end):null;
 let a=start,b=end;
 if(left&&Math.abs(left.time-start)<=.75)a=Math.max(0,left.time-PRE_ROLL);
 else warnings.push('Эхлэлийн өмнөх нам гүм ба ярианы зааг тодорхой бус — эхлэх хугацааг өөрчлөөгүй.');
 if(right&&Math.abs(right.time-end)<=.75)b=Math.min(sourceDuration,right.time+POST_ROLL);
 else warnings.push('Төгсгөлийн дараах нам гүм ба ярианы зааг тодорхой бус — төгсөх хугацааг өөрчлөөгүй.');
 if(!activity.dynamic)warnings.push('Дууны динамик ялгаа хангалтгүй; зөвхөн зураг/долгионоор нарийн зааг тогтоохгүй.');
 // Never propose zero/negative/very long clips. Speech may flow continuously without silence.
 if(b<=a+.07||b-a>40){a=start;b=end;warnings.push('Санал болгосон хүрээ баталгаагүй тул эх заагийг хэвээр үлдээлээ.');}
 const changed={start:Math.abs(a-start)>.015,end:Math.abs(b-end)>.015};
 if(changed.start||changed.end)warnings.push('AI-тай дуудлагын Forced Alignment хийгдээгүй. Санал нь зөвхөн акустик хэмжилт; сонсож QA хийнэ.');
 return {original:{start:n3(start),end:n3(end)},proposed:{start:n3(a),end:n3(b)},
  analysis:{start:n3(windowStart),end:n3(Math.min(sourceDuration,windowStart+pcm.length/(RATE*2))),hopMs:10,rate:16000},
  method:'ACOUSTIC_10MS_REVIEW_ONLY',
  state:changed.start||changed.end?'PROPOSED_REVIEW_REQUIRED':'NO_CLEAR_BOUNDARY',
  changed,warnings,frames:frames.map(f=>({...f,level:Math.round(f.level*10000)/10000,
   low:Math.round(f.low*100)/100,mid:Math.round(f.mid*100)/100,
   high:Math.round(f.high*100)/100,flux:Math.round(f.flux*100)/100}))};
}
export function registerAudioBoundaryRoutes(app:Express){
 app.post('/api/media/:id/boundary-analyze',async(req,res)=>{
  if(req.get('X-BYBE-Request')!=='1'){res.status(403).json({error:'Зөвшөөрөлгүй хүсэлт.'});return;}
  const origin=req.get('Origin');
  if(origin){try{if(new URL(origin).host!==req.get('Host')){res.status(403).end();return;}}
   catch{res.status(403).end();return;}}
  const start=Number(req.body?.start),end=Number(req.body?.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end-start>35){
   res.status(400).json({error:'Зааг шинжлэх хэсэг 0–35 секунд байх ёстой.'});return;
  }
  try{
   const source=await getLocalSource(req.params.id);
   if(!source?.meta.duration){res.status(404).json({error:'Локал эх файл бэлэн биш.'});return;}
   if(end>source.meta.duration+.01){res.status(400).json({error:'Эх файлаас хэтэрсэн хугацаа.'});return;}
   const from=Math.max(0,start-2),to=Math.min(source.meta.duration,end+2);
   const args=['-hide_banner','-nostdin','-v','error','-ss',String(from),
    '-i',source.filepath,'-t',String(to-from),'-vn','-ac','1','-ar',String(RATE),
    '-f','s16le','pipe:1'];
   const result=await ffRun(args,'ffmpeg',RATE*2*44);
   if(result.code!==0)throw Error('FFmpeg дууны шинжилгээ ажилласангүй: '+result.stderr.slice(-250));
   if(!result.stdout.length)throw Error('Энэ хугацаанд аудио өгөгдөл алга.');
   res.json(analyzeBoundaryPcm(result.stdout,from,start,end,source.meta.duration));
  }catch(error){res.status(500).json({error:error instanceof Error?error.message:'Аудио шинжилгээний алдаа'});}
 });
}
