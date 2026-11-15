import { useEffect, useRef, useState } from 'react';

interface Job {id:string;sourceId:string;status:'queued'|'running'|'paused'|'complete'|'error';totalParts:number;nextPart:number;message:string}
export interface AsrCandidate {
 start:number;end:number;text:string;language?:string;
 asrPass?:'VAD_UTTERANCE';languageScope?:string;languageProbability?:number;
 reviewReasons?:string[];
}
const heads={'X-BYBE-Request':'1','Content-Type':'application/json'};
async function call(url:string,method='GET',body?:unknown){
 const r=await fetch(url,{method,headers:heads,body:body===undefined?undefined:JSON.stringify(body)});
 const json=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(json.error||'Локал ASR алдаа');
 return json;
}
export function useBackgroundAsr(sourceId:string,receive:(items:AsrCandidate[])=>void){
 const [job,setJob]=useState<Job|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const handled=useRef(-1),currentJobId=useRef(''),callback=useRef(receive);callback.current=receive;
 useEffect(()=>{
  handled.current=-1;currentJobId.current='';setJob(null);setMessage('');
  if(!sourceId)return;
  let alive=true,jobId=localStorage.getItem('bybe-asr-job:'+sourceId)||'';
  async function refresh(){
   jobId=localStorage.getItem('bybe-asr-job:'+sourceId)||jobId;
   if(!jobId)return;
   if(currentJobId.current!==jobId){
    currentJobId.current=jobId;handled.current=-1;
   }
   try{
    const j=await call('/api/asr-jobs/'+jobId) as Job;
    if(!alive)return;setJob(j);
    if(j.nextPart>handled.current+1){
     const result=await call('/api/asr-jobs/'+jobId+'/results?afterPart='+handled.current);
     if(!alive)return;
     const parts=(result.parts||[]) as Array<{partIndex:number;segments:AsrCandidate[]}>;
     const segments=parts.flatMap(p=>p.segments);
     if(segments.length)callback.current(segments);
     if(parts.length)handled.current=parts[parts.length-1].partIndex;
    }
   }catch(e){if(alive)setMessage(e instanceof Error?e.message:'ASR төлөв унших алдаа');}
  }
  void refresh();
  const timer=setInterval(()=>{void refresh();},2500);
  return()=>{alive=false;clearInterval(timer);};
 },[sourceId]);
 async function start(force=false){
  if(!sourceId){setMessage('Эх видеог локал FFmpeg хөдөлгүүрт холбоно уу.');return;}
  setBusy(true);
  try{
   const j=await call('/api/asr-jobs/start','POST',{sourceId,force}) as Job;
   localStorage.setItem('bybe-asr-job:'+sourceId,j.id);
   if(currentJobId.current!==j.id){handled.current=-1;currentJobId.current=j.id;}
   setJob(j);setMessage(force?'VAD шинэ танилтын ажил эхэллээ. Хуучин QA/WAV хадгалагдана.':
    'Локал Whisper ASR арын боловсруулалт эхэллээ.');
  }catch(e){setMessage(e instanceof Error?e.message:'ASR эхлүүлэх алдаа');}
  finally{setBusy(false);}
 }
 async function change(action:'pause'|'resume'){
  if(!job)return;
  setBusy(true);
  try{setJob(await call('/api/asr-jobs/'+job.id+'/'+action,'POST',{}));}
  catch(e){setMessage(e instanceof Error?e.message:'ASR төлөв өөрчлөх алдаа');}
  finally{setBusy(false);}
 }
 return {job,busy,message,start,pause:()=>change('pause'),resume:()=>change('resume')};
}
