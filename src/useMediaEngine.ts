import { useCallback, useEffect, useRef, useState } from 'react';

const CHUNK=8*1024*1024;
const header={'X-BYBE-Request':'1'};
export interface ExportItem {id:string;clipId?:string;filename:string;sha256:string;bytes:number;qa:string;}
export interface MediaClip {id:string;text:string;kind:string;start:number;end:number;}
interface Meta {id:string;uploaded:number;size:number;state:'uploading'|'ready';duration?:number;}
async function readJson(response:Response):Promise<any>{
 const value=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(typeof value.error==='string'?value.error:'Локал серверийн хүсэлт амжилтгүй.');
 return value;
}
async function request(url:string,method='GET',payload?:unknown):Promise<any>{
 const response=await fetch(url,{method,headers:payload?{...header,'Content-Type':'application/json'}:header,
  body:payload?JSON.stringify(payload):undefined});
 return readJson(response);
}
const mediaKey=(file:File)=>'bybe-media-v1:'+file.name+':'+file.size+':'+file.lastModified;
export function useMediaEngine(file:File|null,start:number,end:number){
 const [sourceId,setSourceId]=useState('');
 const [sourceDuration,setSourceDuration]=useState(0);
 const [status,setStatus]=useState('');
 const [progress,setProgress]=useState<number|null>(null);
 const [working,setWorking]=useState(false);
 const [peaks,setPeaks]=useState<number[]>([]);
 const [lastRevision,setLastRevision]=useState<ExportItem|null>(null);
 const [previewUrl,setPreviewUrl]=useState('');
 const abort=useRef<AbortController|null>(null);
 const fileKey=file?mediaKey(file):'';
 useEffect(()=>{
  let alive=true;
  setSourceId('');setSourceDuration(0);setPeaks([]);setProgress(null);setStatus('');setLastRevision(null);setPreviewUrl('');
  if(!file)return;
  const id=localStorage.getItem(fileKey);
  if(!id)return;
  request('/api/media/'+id).then((m:Meta)=>{
   if(!alive)return;
   if(m.state==='ready'){setSourceId(id);setSourceDuration(m.duration||0);setStatus('Эх файл локал хөдөлгүүрт бэлэн.');}
   else{setStatus('Өмнөх импорт '+Math.floor(m.uploaded/m.size*100)+'% — үргэлжлүүлэх боломжтой.');}
  }).catch(()=>{if(alive)localStorage.removeItem(fileKey);});
  return()=>{alive=false;};
 },[fileKey]);
 const upload=useCallback(async()=>{
  if(!file||working)return;
  setWorking(true);
  const controller=new AbortController();abort.current=controller;
  try{
   let id=localStorage.getItem(fileKey)||'';
   let meta:Meta|null=null;
   if(id){try{meta=await request('/api/media/'+id);}catch{localStorage.removeItem(fileKey);id='';}}
   if(!meta){
    const created=await request('/api/media/start','POST',{name:file.name,size:file.size,modified:file.lastModified}) as Meta;
    meta=created;id=created.id;localStorage.setItem(fileKey,id);
   }
   if(meta.state==='ready'){
    setSourceId(id);setSourceDuration(meta.duration||0);setProgress(100);setStatus('Эх файл бэлэн.');return;
   }
   let offset=meta.uploaded;
   while(offset<file.size){
    if(controller.signal.aborted)throw Error('Импорт зогсоосон. Дараа нь үргэлжлүүлж болно.');
    const end=Math.min(file.size,offset+CHUNK);
    const bytes=await file.slice(offset,end).arrayBuffer();
    const r=await fetch('/api/media/'+id+'/chunk?offset='+offset,{method:'PUT',
      headers:{...header,'Content-Type':'application/octet-stream'},
      body:bytes,signal:controller.signal});
    if(!r.ok){
      const latest=await request('/api/media/'+id);
      if(latest.uploaded!==offset){offset=latest.uploaded;continue;}
      throw Error((await r.json().catch(()=>({}))).error||'Хэсгийг хуулахад алдаа гарлаа.');
    }
    offset=(await r.json()).uploaded;
    setProgress(Math.round(offset/file.size*100));
    setStatus('Эх файлыг энэ компьютерийн локал хөдөлгүүрт холбож байна: '+Math.round(offset/file.size*100)+'%');
   }
   setStatus('FFprobe мэдээлэл ба файлын SHA-256 шалгаж байна…');
   const done=await request('/api/media/'+id+'/finish','POST',{});
   setSourceDuration(done.duration||0);setSourceId(id);setProgress(100);setStatus('Импорт дууссан. WAV болон бодит waveform ашиглаж болно.');
  }catch(e){setStatus(e instanceof Error?e.message:'Импортын алдаа');}
  finally{setWorking(false);abort.current=null;}
 },[file,fileKey,working]);
 useEffect(()=>{
  if(!sourceId||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return;
  const ctrl=new AbortController();setPeaks([]);
  const target='/api/media/'+sourceId+'/peaks?start='+start.toFixed(3)+'&end='+end.toFixed(3)+'&bins=1200';
  fetch(target,{signal:ctrl.signal}).then(readJson).then(data=>{
    if(!ctrl.signal.aborted)setPeaks(Array.isArray(data.peaks)?data.peaks:[]);
  }).catch(e=>{if(!ctrl.signal.aborted)setStatus(e instanceof Error?e.message:'Waveform алдаа');});
  return()=>ctrl.abort();
 },[sourceId,start,end]);
 const exportWav=useCallback(async(c:MediaClip)=>{
  if(!sourceId){setStatus('Эх файлыг эхлээд локал хөдөлгүүрт холбоно уу.');return null;}
  setWorking(true);
  try{
   const result=await request('/api/media/'+sourceId+'/export-wav','POST',
    {clipId:c.id,text:c.text,kind:c.kind,start:c.start,end:c.end}) as ExportItem;
   setLastRevision(result);setStatus('Жинхэнэ WAV үүслээ: '+result.filename+' · QA шалгах шаардлагатай');
   return result;
  }catch(e){setStatus(e instanceof Error?e.message:'WAV үүсгэхэд алдаа');return null;}
  finally{setWorking(false);}
 },[sourceId]);
 const preparePreview=useCallback(async()=>{
  if(!sourceId){setStatus('Эх файлыг эхлээд локал хөдөлгүүрт холбоно уу.');return;}
  setWorking(true);setStatus('MP4 preview бэлтгэж байна. Том файлд хугацаа шаардагдана…');
  try{
   const result=await request('/api/media/'+sourceId+'/prepare-preview','POST',{});
   setPreviewUrl(result.url);setStatus('MP4 preview бэлэн. Эх медиа өөрчлөгдөөгүй.');
  }catch(e){setStatus(e instanceof Error?e.message:'Видео бэлтгэхэд алдаа');}
  finally{setWorking(false);}
 },[sourceId]);
 return {sourceId,sourceDuration,status,progress,working,peaks,lastRevision,previewUrl,upload,exportWav,preparePreview,cancel:()=>abort.current?.abort()};
}
