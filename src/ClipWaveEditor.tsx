import { useEffect, useMemo, useRef, useState } from 'react';
interface Props {
 sourceId:string;sourceDuration:number;
 originalStart:number;originalEnd:number;start:number;end:number;
 onChange:(start:number,end:number)=>void;
}
const W=650,H=105,margin=6;
export default function ClipWaveEditor({sourceId,sourceDuration,originalStart,originalEnd,start,end,onChange}:Props){
 const [peaks,setPeaks]=useState<number[]>([]);
 const [error,setError]=useState('');
 const drag=useRef<'start'|'end'|null>(null);
 const svg=useRef<SVGSVGElement>(null);
 const windowStart=Math.max(0,originalStart-2);
 const windowEnd=Math.min(sourceDuration||originalEnd+2,originalEnd+2);
 const span=Math.max(.1,windowEnd-windowStart);
 useEffect(()=>{
  if(!sourceId||!Number.isFinite(span)||span<=0)return;
  const ctrl=new AbortController();setPeaks([]);setError('');
  fetch('/api/media/'+sourceId+'/peaks?start='+windowStart+'&end='+windowEnd+'&bins=500',{signal:ctrl.signal})
   .then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error||'Waveform алдаа');return j;})
   .then(j=>{if(!ctrl.signal.aborted)setPeaks(j.peaks||[]);})
   .catch(e=>{if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:'Waveform алдаа');});
  return()=>ctrl.abort();
 },[sourceId,windowStart,windowEnd,span]);
 const xpos=(t:number)=>margin+(t-windowStart)/span*(W-2*margin);
 const bars=useMemo(()=>peaks.map((amp,i)=>{
  const x=margin+i/peaks.length*(W-2*margin);
  const height=Math.max(1,amp*(H-22)*.85);
  return <rect key={i} x={x} y={(H-height)/2} width={(W-2*margin)/peaks.length+.25}
   height={height} fill="#44cbb4" opacity=".85"/>;
 }),[peaks]);
 function getTime(clientX:number){
  const rect=svg.current?.getBoundingClientRect();
  if(!rect)return start;
  const x=Math.max(0,Math.min(1,(clientX-rect.left)/rect.width));
  return Math.round((windowStart+x*span)*1000)/1000;
 }
 function move(e:React.PointerEvent<SVGSVGElement>){
  if(!drag.current)return;
  const t=getTime(e.clientX);
  if(drag.current==='start')onChange(Math.max(windowStart,Math.min(end-.04,t)),end);
  else onChange(start,Math.min(windowEnd,Math.max(start+.04,t)));
 }
 return <div className="bybe-clip-wave">
  <div className="bybe-clip-help">Хөх шугам — эхлэл, шар шугам — төгсгөл. Хулганаар чирж нарийн засна.</div>
  {sourceId?<svg ref={svg} viewBox={'0 0 '+W+' '+H} preserveAspectRatio="none"
   onPointerDown={e=>{
    const t=getTime(e.clientX);
    drag.current=Math.abs(t-start)<=Math.abs(t-end)?'start':'end';
    e.currentTarget.setPointerCapture(e.pointerId);move(e);
   }}
   onPointerMove={move}
   onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
   onPointerCancel={()=>{drag.current=null;}}
   style={{width:'100%',height:125,cursor:'ew-resize',touchAction:'none',background:'#071723',borderRadius:8}}>
    <line x1="0" x2={W} y1={H/2} y2={H/2} stroke="#4d6680" strokeWidth=".5"/>
    {bars}
    <rect x={xpos(start)} y="0" width={Math.max(0,xpos(end)-xpos(start))} height={H}
     fill="#4f94e8" opacity=".12" pointerEvents="none"/>
    <line x1={xpos(start)} x2={xpos(start)} y1="0" y2={H} stroke="#36afff" strokeWidth="3" pointerEvents="none"/>
    <line x1={xpos(end)} x2={xpos(end)} y1="0" y2={H} stroke="#ffb547" strokeWidth="3" pointerEvents="none"/>
   </svg>:<div className="bybe-clip-help">Эх файлыг локал FFmpeg хөдөлгүүрт холбоход долгион харагдана.</div>}
  {error&&<p className="bybe-clip-error">{error}</p>}
  <div className="bybe-clip-times"><span>{windowStart.toFixed(3)} сек</span><span>{windowEnd.toFixed(3)} сек</span></div>
 </div>;
}
