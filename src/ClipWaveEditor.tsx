import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
interface Props {
 sourceId:string;sourceDuration:number;
 originalStart:number;originalEnd:number;start:number;end:number;
 onChange:(start:number,end:number)=>void;
}
const W=760,H=145,margin=8;
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
const sec=(v:number)=>Math.max(0,v).toFixed(3)+' сек';
const MAX_SPAN=600; // FFmpeg peak endpoint limits one window to 600 seconds.
export default function ClipWaveEditor({sourceId,sourceDuration,originalStart,originalEnd,start,end,onChange}:Props){
 const duration=Math.max(sourceDuration||0,originalEnd+1,1);
 const initialSpan=()=>Math.min(duration,Math.max(20,(originalEnd-originalStart)*4));
 const [span,setSpan]=useState(initialSpan);
 const [windowStart,setWindowStart]=useState(()=>Math.max(0,originalStart-8));
 const [peaks,setPeaks]=useState<number[]>([]);
 const [error,setError]=useState('');
 const [repeat,setRepeat]=useState(false);
 const [listening,setListening]=useState<'selection'|'window'>('selection');
 const drag=useRef<{mode:'start'|'end'|'pan';x:number;origin:number}|null>(null);
 const svg=useRef<SVGSVGElement>(null);
 const audio=useRef<HTMLAudioElement>(null);
 const actualSpan=Math.max(.25,Math.min(MAX_SPAN,duration,span));
 const from=clamp(windowStart,0,Math.max(0,duration-actualSpan));
 const to=Math.min(duration,from+actualSpan);
 const delta=Math.max(.001,to-from);

 useEffect(()=>{
  const width=Math.min(duration,MAX_SPAN,Math.max(20,(originalEnd-originalStart)*4));
  setSpan(width);
  setWindowStart(clamp((originalStart+originalEnd)/2-width/2,0,Math.max(0,duration-width)));
  setPeaks([]);setError('');
 },[sourceId,originalStart,originalEnd,duration]);

 // Debounce FFmpeg calls while panning or dragging. Memory use is bounded even for 6-hour files.
 useEffect(()=>{
  if(!sourceId||to<=from)return;
  const ctrl=new AbortController();
  const timer=window.setTimeout(()=>{
   void fetch('/api/media/'+sourceId+'/peaks?start='+from.toFixed(3)+
     '&end='+to.toFixed(3)+'&bins=950',{signal:ctrl.signal})
    .then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error||'Waveform алдаа');return j;})
    .then(j=>{if(!ctrl.signal.aborted){setPeaks(Array.isArray(j.peaks)?j.peaks:[]);setError('');}})
    .catch(e=>{if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:'Waveform алдаа');});
  },140);
  return()=>{clearTimeout(timer);ctrl.abort();};
 },[sourceId,from,to]);

 function center(time:number,newSpan=actualSpan){
  const w=clamp(newSpan,.5,Math.min(MAX_SPAN,duration));
  setSpan(w);
  setWindowStart(clamp(time-w/2,0,Math.max(0,duration-w)));
 }
 function zoom(factor:number,anchor=from+delta/2,ratio=.5){
  const width=clamp(actualSpan*factor,.5,Math.min(MAX_SPAN,duration));
  setSpan(width);setWindowStart(clamp(anchor-width*ratio,0,Math.max(0,duration-width)));
 }
 const xpos=(t:number)=>margin+(t-from)/delta*(W-2*margin);
 const bars=useMemo(()=>peaks.map((amp,i)=>{
  const x=margin+i/peaks.length*(W-2*margin);
  const height=Math.max(1,amp*(H-16)*.85);
  return <rect key={i} x={x} y={(H-height)/2} width={(W-2*margin)/peaks.length+.1}
   height={height} fill="#44cbb4" opacity=".85"/>;
 }),[peaks]);
 function getTime(clientX:number){
  const rect=svg.current?.getBoundingClientRect();
  if(!rect)return start;
  const relative=clamp((clientX-rect.left)/rect.width,0,1);
  return Math.round((from+relative*delta)*1000)/1000;
 }
 function down(e:ReactPointerEvent<SVGSVGElement>){
  if(e.button!==0&&e.button!==1)return;
  const t=getTime(e.clientX);
  const edgeTolerance=delta*12/Math.max(50,e.currentTarget.getBoundingClientRect().width);
  const mode=(e.shiftKey||e.button===1)?'pan':
   Math.abs(t-start)<=edgeTolerance?'start':
   Math.abs(t-end)<=edgeTolerance?'end':
   Math.abs(t-start)<Math.abs(t-end)?'start':'end';
  drag.current={mode,x:e.clientX,origin:from};
  e.currentTarget.setPointerCapture(e.pointerId);
  if(mode==='start')onChange(Math.max(0,Math.min(end-.04,t)),end);
  if(mode==='end')onChange(start,Math.min(duration,Math.max(start+.04,t)));
 }
 function move(e:ReactPointerEvent<SVGSVGElement>){
  const dragging=drag.current;if(!dragging)return;
  const t=getTime(e.clientX);
  if(dragging.mode==='pan'){
   const pixels=svg.current?.getBoundingClientRect().width||W;
   setWindowStart(clamp(dragging.origin-(e.clientX-dragging.x)*delta/pixels,
     0,Math.max(0,duration-delta)));
  }else if(dragging.mode==='start'){
   onChange(Math.max(0,Math.min(end-.04,t)),end);
  }else onChange(start,Math.min(duration,Math.max(start+.04,t)));
 }
 useEffect(()=>{
  const element=svg.current;if(!element)return;
  const wheel=(e:WheelEvent)=>{
   e.preventDefault();
   if(e.shiftKey){
    setWindowStart(clamp(from+Math.sign(e.deltaY)*delta*.25,0,Math.max(0,duration-delta)));
    return;
   }
   const rect=element.getBoundingClientRect();
   const ratio=clamp((e.clientX-rect.left)/Math.max(1,rect.width),0,1);
   const nextSpan=clamp(actualSpan*(e.deltaY>0?1.4:1/1.4),.5,Math.min(MAX_SPAN,duration));
   setSpan(nextSpan);
   setWindowStart(clamp(from+delta*ratio-nextSpan*ratio,0,Math.max(0,duration-nextSpan)));
  };
  element.addEventListener('wheel',wheel,{passive:false});
  return()=>element.removeEventListener('wheel',wheel);
 },[from,delta,actualSpan,duration]);
 function listen(mode:'selection'|'window'){
  if(!sourceId)return;
  const a=audio.current;if(!a)return;
  const s=mode==='window'?from:start,t=mode==='window'?to:end;
  if(t-s<.04||t-s>300){setError('Сонсох хүрээ 0.04–300 секунд байх ёстой. Томруулж нарийсгана уу.');return;}
  const url='/api/media/'+encodeURIComponent(sourceId)+'/listen?start='+s.toFixed(3)+'&end='+t.toFixed(3);
  setError('');setListening(mode);
  a.pause();a.src=url;a.load();
  void a.play().catch(()=>setError('Аудио эхлээгүй. Доорх audio Play товчийг дарж эсвэл FFmpeg-ийн алдааг шалгана уу.'));
 }
 const canPreview=sourceId&&end>start&&end-start<=300;
 return <div className="bybe-clip-wave bybe-wave-editor-v2">
  <div className="bybe-wave-navigation">
   <button type="button" onClick={()=>center(from-delta*.55+delta/2)} title="Зүүн тийш шилжих">←</button>
   <button type="button" onClick={()=>zoom(1.6)} title="Харах хугацааг уртасгах">−</button>
   <button type="button" onClick={()=>zoom(1/1.6)} title="Нарийвчилж томруулах">＋</button>
   <button type="button" onClick={()=>center(from+delta*.55+delta/2)} title="Баруун тийш шилжих">→</button>
   <button type="button" onClick={()=>center((start+end)/2)} title="Сонгосон аудиогоо төвд харуулах">Сонголт руу</button>
   <span className="bybe-wave-window-label">{sec(from)} — {sec(to)} · харах хүрээ {delta.toFixed(1)} сек</span>
  </div>
  <label className="bybe-wave-overview">
   <span>Бүтэн бичлэгийн байршил</span>
   <input type="range" min={0} max={Math.max(duration,.001)} step={.1}
     value={clamp(from+delta/2,0,duration)}
     onChange={e=>center(Number(e.target.value))}/>
   <span>{sec(duration)}</span>
  </label>
  <div className="bybe-clip-help">Хөх шугам — эхлэл, шар шугам — төгсгөл. Чирж засна.
   Дугуйгаар zoom, Shift + дугуй / Shift + чирэхэд зүүн-баруун тийш шилжинэ.
   Сонгосон аудио өөр газарт байвал гүйлгэгчээр бүтэн бичлэгийн дурын хэсэгт очно.</div>
  <svg ref={svg} viewBox={'0 0 '+W+' '+H} preserveAspectRatio="none"
   onPointerDown={down} onPointerMove={move}
   onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
   onPointerCancel={()=>{drag.current=null;}}
   style={{width:'100%',height:180,cursor:'ew-resize',touchAction:'none',background:'#071723',borderRadius:8}}>
   <line x1={0} x2={W} y1={H/2} y2={H/2} stroke="#4d6680" strokeWidth=".6"/>
   {bars}
   <rect x={Math.max(0,xpos(start))} y="0" width={Math.max(0,Math.min(W,xpos(end))-Math.max(0,xpos(start)))}
    height={H} fill="#4f94e8" opacity=".19" pointerEvents="none"/>
   {start>=from&&start<=to&&<line x1={xpos(start)} x2={xpos(start)} y1="0" y2={H}
    stroke="#36afff" strokeWidth="3" pointerEvents="none"/>}
   {end>=from&&end<=to&&<line x1={xpos(end)} x2={xpos(end)} y1="0" y2={H}
    stroke="#ffb547" strokeWidth="3" pointerEvents="none"/>}
  </svg>
  <div className="bybe-clip-times"><span>{sec(from)}</span><span>{sec(to)}</span></div>
  <div className="bybe-preview-audio-controls">
   <button type="button" disabled={!canPreview} onClick={()=>listen('selection')}>▶ Сонгосон хэсгийг сонсох</button>
   <button type="button" disabled={!sourceId||delta>300} onClick={()=>listen('window')}>▶ Дэлгэцийн хүрээг сонсох</button>
   <button type="button" onClick={()=>setRepeat(x=>!x)} aria-pressed={repeat}>
    {repeat?'↻ Давталт идэвхтэй':'↻ Давтах'}
   </button>
  </div>
  <audio ref={audio} controls loop={repeat} preload="none" style={{width:'100%',height:40}}
   aria-label="Засварын цонхны бие даасан аудио тоглуулагч"/>
  <small className="bybe-audio-separate-note">Бие даасан аудио — эх видео зогсож, байршлаа өөрчлөхгүй. Одоо: {listening==='selection'?'сонгосон хэсэг':'харагдаж буй хүрээ'}</small>
  {error&&<p className="bybe-clip-error" role="alert">{error}</p>}
 </div>;
}
