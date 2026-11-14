import { useEffect, useRef, useState } from 'react';
import type { FrameResult } from './lib/typography';

interface ScanJob {
 id:string;sourceId:string;status:'queued'|'running'|'paused'|'complete'|'error';
 kind:'ocr';sampleEvery:number;totalParts:number;nextPart:number;framesDone:number;message:string;
}
const HEADERS={'X-BYBE-Request':'1','Content-Type':'application/json'};
async function api(url:string,method='GET',body?:unknown):Promise<any>{
 const r=await fetch(url,{method,headers:HEADERS,body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(data.error||'OCR арын ажлын алдаа');
 return data;
}
export function useBackgroundScan(sourceId:string,addFrames:(frames:FrameResult[])=>void){
 const [job,setJob]=useState<ScanJob|null>(null),[message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const after=useRef(-1);
 const frameHandler=useRef(addFrames);
 frameHandler.current=addFrames;
 useEffect(()=>{
  after.current=-1;setJob(null);setMessage('');
  if(!sourceId)return;
  let alive=true;
  let jobId=localStorage.getItem('bybe-ocr-job:'+sourceId)||'';
  const refresh=async()=>{
   jobId=localStorage.getItem('bybe-ocr-job:'+sourceId)||jobId;
   if(!jobId)return;
   try{
    const j=await api('/api/scan/'+jobId) as ScanJob;
    if(!alive)return;
    setJob(j);
    if(j.nextPart>after.current+1){
     const data=await api('/api/scan/'+jobId+'/results?afterPart='+after.current);
     if(!alive)return;
     const parts=(data.parts||[]) as Array<{partIndex:number;frames:FrameResult[]}>;
     const fresh=parts.flatMap(part=>part.frames);
     if(fresh.length)frameHandler.current(fresh);
     if(parts.length)after.current=parts[parts.length-1].partIndex;
    }
   }catch(e){
    if(!alive)return;
    setMessage(e instanceof Error?e.message:'OCR job олдсонгүй');
   }
  };
  void refresh();
  const timer=setInterval(()=>{void refresh();},2000);
  return()=>{alive=false;clearInterval(timer);};
 },[sourceId]);
 async function start(){
  if(!sourceId){setMessage('Эх видеог локал хөдөлгүүрт холбоно уу.');return;}
  setBusy(true);
  try{
   const j=await api('/api/scan/start','POST',{sourceId,sampleEvery:5}) as ScanJob;
   localStorage.setItem('bybe-ocr-job:'+sourceId,j.id);
   setJob(j);setMessage('Автомат OCR эхэлсэн. 5 минутын хэсгүүд бэлэн болмогц жагсаалтад нэмэгдэнэ.');
  }catch(e){setMessage(e instanceof Error?e.message:'OCR эхлүүлэхэд алдаа');}
  finally{setBusy(false);}
 }
 async function change(action:'pause'|'resume'){
  if(!job)return;
  setBusy(true);
  try{const j=await api('/api/scan/'+job.id+'/'+action,'POST',{}) as ScanJob;setJob(j);}
  catch(e){setMessage(e instanceof Error?e.message:'OCR удирдлагын алдаа');}
  finally{setBusy(false);}
 }
 return {job,message,busy,start,pause:()=>change('pause'),resume:()=>change('resume')};
}
