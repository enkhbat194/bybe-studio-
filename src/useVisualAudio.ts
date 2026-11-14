import { useEffect, useRef, useState } from 'react';
import { planParts } from './lib/parts';
import type { FrameResult } from './lib/typography';
import { looksLikeTitle, proposeVisualAudio, type AudioSuggestion } from './lib/autoAlign';

/** Fetch only parts where the OCR actually saw a likely vocabulary slide. */
export function useVisualAudio(sourceId:string,duration:number,frames:FrameResult[],
 onSuggestions:(newItems:AudioSuggestion[])=>void){
 const [partsPeaks,setPartsPeaks]=useState<Record<number,number[]>>({});
 const fetching=useRef(new Set<number>()),handler=useRef(onSuggestions),activeSource=useRef('');
 handler.current=onSuggestions;
 useEffect(()=>{
  activeSource.current=sourceId;
  fetching.current.clear();setPartsPeaks({});
 },[sourceId]);
 useEffect(()=>{
  if(!sourceId||duration<=0)return;
  const parts=planParts(duration,5,2);
  for(let i=0;i<parts.length;i++){
   if(partsPeaks[i]||fetching.current.has(i))continue;
   const part=parts[i];
   const available=frames.some(f=>f.frameSec>=part.coreStart&&f.frameSec<part.coreEnd
    &&f.blocks.some(looksLikeTitle));
   if(!available)continue;
   fetching.current.add(i);
   const url='/api/media/'+sourceId+'/peaks?start='+part.coreStart+
    '&end='+part.coreEnd+'&bins=1200';
   void fetch(url).then(async resp=>{
    const data=await resp.json().catch(()=>({}));
    if(!resp.ok)throw Error(data.error||'Waveform peaks унших алдаа');
    if(activeSource.current===sourceId && Array.isArray(data.peaks)&&data.peaks.length>=24){
     setPartsPeaks(old=>({...old,[i]:data.peaks}));
    }
   }).catch(e=>console.warn('Auto audio candidate:',e))
    .finally(()=>{if(activeSource.current===sourceId)fetching.current.delete(i);});
  }
 },[sourceId,duration,frames,partsPeaks]);
 useEffect(()=>{
  if(!sourceId||activeSource.current!==sourceId||!duration||!frames.length)return;
  const parts=planParts(duration,5,2);
  const proposed:AudioSuggestion[]=[];
  for(const [key,peaks] of Object.entries(partsPeaks)){
   const ix=Number(key),part=parts[ix];
   if(!part)continue;
   proposed.push(...proposeVisualAudio(frames,peaks,part.coreStart,part.coreEnd));
  }
  if(proposed.length)handler.current(proposed);
 },[sourceId,duration,frames,partsPeaks]);
 return {readyParts:Object.keys(partsPeaks).length};
}
