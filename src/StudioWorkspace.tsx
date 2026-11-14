import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Check, ChevronLeft, ChevronRight, Clipboard, Download, Edit3, FileVideo, FolderOpen, Play, Repeat2, Save, ScanText, Settings2, X } from 'lucide-react';
import { planParts, owningPart } from './lib/parts';
import { effectiveRole, roleLabel, sameScreenText, styleRuleFromBlock, styleSignature, validateBlock, type FrameResult, type OcrBlock, type StyleRule, type TextRole } from './lib/typography';
import { useMediaEngine } from './useMediaEngine';
import { useBackgroundScan } from './useBackgroundScan';
import './StudioWorkspace.css';

type ClipKind='word_normal'|'word_slow'|'sentence_normal'|'sentence_slow'|'english_word'|'english_sentence'|'unknown';
interface Segment {
 id:string;sourceKey:string;text:string;kind:ClipKind;start:number;end:number;
 frameSec:number|null;ocrId:string|null;styleSignature:string|null;
 qa:'REVIEW_REQUIRED'|'MANUALLY_VERIFIED';updatedAt:string;
}
const KINDS:ClipKind[]=['word_normal','word_slow','sentence_normal','sentence_slow','english_word','english_sentence','unknown'];
const kindNames:Record<ClipKind,string>={
 word_normal:'Чех үг · энгийн',word_slow:'Чех үг · удаан',
 sentence_normal:'Чех өгүүлбэр · энгийн',sentence_slow:'Чех өгүүлбэр · удаан',
 english_word:'Англи үг',english_sentence:'Англи өгүүлбэр',unknown:'Ангилаагүй'
};
const roles:TextRole[]=['czech_word','czech_sentence','english_word','english_sentence','ignore','unknown'];
const keyPrefix='bybe-workspace-v2';
const safeRead=<T,>(key:string,fallback:T):T=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}};
const n3=(v:number)=>Math.round(v*1000)/1000;
const time=(v:number)=>{if(!Number.isFinite(v))return '--:--';const m=Math.floor(v/60),s=(v%60).toFixed(2).padStart(5,'0');return String(m).padStart(2,'0')+':'+s;};
function kindFromRole(role:TextRole):ClipKind {
 return role==='czech_word'?'word_normal':role==='czech_sentence'?'sentence_normal':role==='english_word'?'english_word':role==='english_sentence'?'english_sentence':'unknown';
}
function isSegment(o:unknown):o is Segment {
 if(!o||typeof o!=='object')return false;const v=o as Partial<Segment>;
 return typeof v.id==='string'&&typeof v.sourceKey==='string'&&typeof v.text==='string'&&KINDS.includes(v.kind as ClipKind)
 &&typeof v.start==='number'&&typeof v.end==='number'&&v.start>=0&&v.end>v.start
 &&['REVIEW_REQUIRED','MANUALLY_VERIFIED'].includes(String(v.qa));
}
function nearestFrame(frames:FrameResult[],current:number):FrameResult|null {
 const best=frames.reduce<FrameResult|null>((prev,f)=>!prev||Math.abs(f.frameSec-current)<Math.abs(prev.frameSec-current)?f:prev,null);
 return best&&Math.abs(best.frameSec-current)<=1.5?best:null;
}

export default function StudioWorkspace(){
 const [file,setFile]=useState<File|null>(null);
 const [src,setSrc]=useState('');
 const [sourceKey,setSourceKey]=useState('');
 const [hydratedKey,setHydratedKey]=useState('');
 const [duration,setDuration]=useState(0);
 const [current,setCurrent]=useState(0);
 const [segments,setSegments]=useState<Segment[]>([]);
 const [frames,setFrames]=useState<FrameResult[]>([]);
 const [styleRules,setStyleRules]=useState<StyleRule[]>([]);
 const [selectedRange,setSelectedRange]=useState<{start:number;end:number}|null>(null);
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [editId,setEditId]=useState<string|null>(null);
 const [editDraft,setEditDraft]=useState<{text:string;start:string;end:string;kind:ClipKind}>({text:'',start:'0',end:'1',kind:'unknown'});
 const [textMode,setTextMode]=useState(false);
 const [status,setStatus]=useState('');
 const [busy,setBusy]=useState(false);
 const [styleTarget,setStyleTarget]=useState<OcrBlock|null>(null);
 const [styleRole,setStyleRole]=useState<TextRole>('unknown');
 const [loop,setLoop]=useState<string|null>(null);
 const [partIndex,setPartIndex]=useState(0);
 const [ocrMode,setOcrMode]=useState('Локал OCR');
 const [zoom,setZoom]=useState(1);
 const video=useRef<HTMLVideoElement|null>(null);
 const seekEnd=useRef<number|null>(null);
 const dragStart=useRef<number|null>(null);
 const pointerBox=useRef<HTMLDivElement|null>(null);
 const filePicker=useRef<HTMLInputElement|null>(null);
 const importPicker=useRef<HTMLInputElement|null>(null);
 const listRef=useRef<HTMLDivElement|null>(null);
 const rowRefs=useRef<Record<string,HTMLDivElement|null>>({});
 const manualList=useRef(false);
 const lastActive=useRef<string|null>(null);
 const parts=useMemo(()=>planParts(duration,5,2),[duration]);
 const part=parts[partIndex]??{index:1,coreStart:0,coreEnd:Math.max(duration,1),analysisStart:0,analysisEnd:Math.max(duration,1)};
 const active=segments.find(s=>current>=s.start&&current<s.end)??null;
 const activeId=active?.id??null;
 const selected=segments.find(s=>s.id===selectedId)??null;
 const editing=segments.find(s=>s.id===editId)??null;
 const frame=nearestFrame(frames,current);
 const visibleBlocks=frame?.blocks.filter(b=>effectiveRole(b,styleRules)!=='ignore')??[];
 const reviewCount=segments.filter(s=>s.qa==='REVIEW_REQUIRED').length;
 const collected=useMemo(()=>{
  const list:OcrBlock[]=[];
  for(const snap of frames){for(const block of snap.blocks){
    if(effectiveRole(block,styleRules)==='ignore')continue;
    if(!list.some(old=>sameScreenText(old,block)))list.push(block);
  }}
  return list.sort((a,b)=>a.frameSec-b.frameSec);
 },[frames,styleRules]);
 const unlinked=collected.filter(b=>!segments.some(s=>s.ocrId===b.id||s.text===b.text&&Math.abs((s.frameSec??-100)-b.frameSec)<10));

 useEffect(()=>{fetch('/api/health').then(r=>r.json()).then(v=>setOcrMode(v.ocrEngine==='gemini-opt-in'?'Gemini OCR (сонголт)':'Локал OCR · үнэгүй')).catch(()=>{});},[]);
 useEffect(()=>{return ()=>{if(src)URL.revokeObjectURL(src);};},[src]);
 useEffect(()=>{
  if(!sourceKey)return;
  const data=safeRead<{segments:Segment[];frames:FrameResult[];styleRules:StyleRule[]}>(keyPrefix+':'+sourceKey,{segments:[],frames:[],styleRules:[]});
  setSegments((data.segments||[]).filter(isSegment));
  setFrames(Array.isArray(data.frames)?data.frames.filter(x=>typeof x.frameSec==='number'&&Array.isArray(x.blocks)):[]);
  setStyleRules(Array.isArray(data.styleRules)?data.styleRules:[]);
  setSelectedRange(null);setSelectedId(null);setPartIndex(0);setCurrent(0);setLoop(null);
  setHydratedKey(sourceKey);
 },[sourceKey]);
 useEffect(()=>{
  if(!sourceKey||hydratedKey!==sourceKey)return;
  try{
   // A bounded browser cache. Full video processing will require SQLite on the local worker.
   localStorage.setItem(keyPrefix+':'+sourceKey,JSON.stringify({segments,frames:frames.slice(-120),styleRules}));
  }catch{setStatus('Төхөөрөмжийн түр санах ой дүүрсэн. JSON нөөцлөлт хийгээрэй.');}
 },[segments,frames,styleRules,sourceKey,hydratedKey]);
 useEffect(()=>{
  if(!activeId||activeId===lastActive.current||manualList.current||editId)return;
  lastActive.current=activeId;
  rowRefs.current[activeId]?.scrollIntoView({block:'nearest',behavior:'smooth'});
 },[activeId,editId]);
 useEffect(()=>{
  const onKey=(e:KeyboardEvent)=>{
   if(e.ctrlKey||e.metaKey||e.altKey)return;
   const el=e.target as HTMLElement|null;
   if(editId){
    if(e.key==='Enter'&&!el?.matches('textarea')){e.preventDefault();saveEdit();}
    if(e.key==='Escape'){e.preventDefault();setEditId(null);}
    return;
   }
   if(el?.matches('input,textarea,select,[contenteditable="true"]'))return;
   if(e.key==='Escape'){setTextMode(false);setStyleTarget(null);}
   if(e.key.toLowerCase()==='t'){e.preventDefault();setTextMode(v=>!v);}
   if(e.key.toLowerCase()==='e'&&selected){e.preventDefault();beginEdit(selected);}
   if(e.key===' '){e.preventDefault();const v=video.current;if(v){if(v.paused)void v.play();else v.pause();}}
  };
  window.addEventListener('keydown',onKey);
  return ()=>window.removeEventListener('keydown',onKey);
 });

 function openFile(f?:File){
  if(!f)return;
  if(!f.type.startsWith('video/')&&!f.type.startsWith('audio/')&&!/\.(mkv|mp4|mov|webm|mp3|wav|m4a)$/i.test(f.name)){
    setStatus('Аудио/видео файл сонгоно уу.');return;
  }
  const key=[f.name,f.size,f.lastModified].join(':');
  setFile(f);setSourceKey(key);setSrc(URL.createObjectURL(f));setDuration(0);setStatus('Файл нээгдлээ. Хөтөч MKV-ийн зарим кодекийг дэмжихгүй байж болно.');
 }
 function toPartAt(t:number){const ix=owningPart(parts,t);if(ix!==null)setPartIndex(ix-1);}
 function onTimeTick(){
  const v=video.current;if(!v)return;
  const t=v.currentTime;setCurrent(t);toPartAt(t);
  if(seekEnd.current!==null&&t>=seekEnd.current){
   if(loop){const s=segments.find(x=>x.id===loop);if(s){v.currentTime=s.start;return;}}
   v.pause();seekEnd.current=null;
  }
 }
 function play(s:Segment,repeat=false){
  const v=video.current;if(!v){setStatus('Эх видеогоо эхлээд нээнэ үү.');return;}
  setSelectedId(s.id);setLoop(repeat?s.id:null);seekEnd.current=s.end;
  v.currentTime=s.start;toPartAt(s.start);void v.play().catch(()=>setStatus('Видео тоглуулах формат дэмжигдэхгүй байна.'));
 }
 function beginEdit(s:Segment){
  setSelectedId(s.id);setEditId(s.id);setEditDraft({text:s.text,start:String(s.start),end:String(s.end),kind:s.kind});
  setLoop(null);
 }
 function saveEdit(){
  if(!editId)return;
  const start=Number(editDraft.start),end=Number(editDraft.end);
  if(!editDraft.text.trim()||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||(duration>0&&end>duration)){
   setStatus('Бичвэр эсвэл эхлэл/төгсгөлийн хугацаа буруу байна.');return;
  }
  setSegments(old=>old.map(s=>s.id===editId?{...s,text:editDraft.text.trim(),start:n3(start),end:n3(end),kind:editDraft.kind,qa:'REVIEW_REQUIRED' as const,updatedAt:new Date().toISOString()}:s).sort((a,b)=>a.start-b.start));
  setEditId(null);setStatus('Засвар хадгалагдлаа. Өмнөх QA баталгаа хүчингүй.');
 }
 function posToTime(clientX:number){
  const el=pointerBox.current;if(!el)return 0;
  const rect=el.getBoundingClientRect();
  const fraction=Math.min(1,Math.max(0,(clientX-rect.left)/rect.width));
  const span=(part.coreEnd-part.coreStart)/zoom;
  const offset=Math.max(0,Math.min(part.coreEnd-part.coreStart-span,current-(part.coreStart+span/2)));
  return n3(part.coreStart+offset+fraction*span);
 }
 function beginDrag(e:React.PointerEvent<HTMLDivElement>){
  if(!duration)return;
  e.currentTarget.setPointerCapture(e.pointerId);dragStart.current=posToTime(e.clientX);
  setSelectedRange({start:dragStart.current,end:dragStart.current+0.001});setLoop(null);
 }
 function drag(e:React.PointerEvent<HTMLDivElement>){
  if(dragStart.current===null)return;
  const t=posToTime(e.clientX),lo=Math.min(t,dragStart.current),hi=Math.max(t,dragStart.current);
  setSelectedRange({start:lo,end:Math.max(hi,lo+0.001)});
 }
 function endDrag(e:React.PointerEvent<HTMLDivElement>){
  if(dragStart.current===null)return;
  const t=posToTime(e.clientX),start=Math.min(t,dragStart.current),end=Math.max(t,dragStart.current);
  dragStart.current=null;
  if(end-start<.08){const v=video.current;if(v)v.currentTime=t;setSelectedRange(null);return;}
  setSelectedRange({start:n3(start),end:n3(end)});
  const v=video.current;if(v){v.pause();v.currentTime=start;}setCurrent(start);
  setStatus('Хэсэг сонголоо. T дараад видеон дээрх бичвэрийг товшино уу.');
 }
 async function captureFrame(){
  const v=video.current;if(!v?.videoWidth)return setStatus('Дүрстэй видео файл нээнэ үү.');
  v.pause();
  const frameSec=v.currentTime;
  const canvas=document.createElement('canvas');canvas.width=Math.min(1280,v.videoWidth);
  canvas.height=Math.round(v.videoHeight*canvas.width/v.videoWidth);
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.drawImage(v,0,0,canvas.width,canvas.height);
  setBusy(true);
  try {
   const resp=await fetch('/api/ocr-layout',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({imageBase64:canvas.toDataURL('image/jpeg',.87).split(',')[1],mimeType:'image/jpeg',frameSec,imageWidth:canvas.width,imageHeight:canvas.height})});
   const data=await resp.json();
   if(!resp.ok)throw new Error(data.error||'OCR алдаа');
   const blocks=(Array.isArray(data.blocks)?data.blocks:[])
    .map((b:unknown,i:number)=>validateBlock(b,frameSec,i)).filter((b:OcrBlock|null):b is OcrBlock=>b!==null);
   setFrames(old=>[...old.filter(f=>Math.abs(f.frameSec-frameSec)>0.5),{frameSec,blocks}].sort((a,b)=>a.frameSec-b.frameSec));
   setStatus(blocks.length+' бичвэр илэрлээ. Сонголт буруу бол хэв маягийн дүрмийг засна уу.');
  }catch(e){setStatus(e instanceof Error?e.message:'OCR алдаа');}
  finally{setBusy(false);}
 }
 function assignBlock(b:OcrBlock){
  const role=effectiveRole(b,styleRules);
  if(textMode&&selectedRange){
   const seg:Segment={id:crypto.randomUUID(),sourceKey,text:b.text,kind:kindFromRole(role),
    start:selectedRange.start,end:selectedRange.end,frameSec:b.frameSec,ocrId:b.id,styleSignature:styleSignature(b),
    qa:'REVIEW_REQUIRED',updatedAt:new Date().toISOString()};
   setSegments(old=>[...old,seg].sort((a,c)=>a.start-c.start));
   setSelectedId(seg.id);setSelectedRange(null);setTextMode(false);
   setStatus('Аудионы хэсгийг "'+b.text+'" бичвэртэй холболоо. Сонсож шалгах шаардлагатай.');
  }else{
   void navigator.clipboard?.writeText(b.text).then(()=>setStatus('Текст хуулагдлаа: '+b.text)).catch(()=>setStatus('Текст: '+b.text));
  }
 }
 function saveStyleRule(){
  if(!styleTarget)return;
  const rule=styleRuleFromBlock(styleTarget,styleRole);
  setStyleRules(old=>[...old.filter(x=>x.signature!==rule.signature),rule]);
  setStyleTarget(null);setStatus('Ижил хэв маягийн бичвэрт "'+roleLabel(styleRole)+'" ангилал хэрэглэнэ (зөвхөн энэ видео).');
 }
 function exportJson(){
  const payload={schema:'bybe-workspace-v2',source:{name:file?.name??'',size:file?.size??0,modified:file?.lastModified??0},
   savedAt:new Date().toISOString(),segments,frames,styleRules};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='BYBE_'+(file?.name??'workspace')+'.json';a.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function importJson(f?:File){
  if(!f)return;
  try{
   if(!file)throw new Error('Эх видеог эхлээд нээнэ үү.');
   const data=JSON.parse(await f.text());
   if(!Array.isArray(data.segments)||!data.segments.every(isSegment))throw new Error('Хадгалсан сегментийн бүтэц буруу.');
   // Imported data is scoped to a source; never silently assign to the wrong media.
   if(data.source?.name!==file.name||data.source?.size!==file.size)throw new Error('Өөр видеоны бүртгэл байна. Тохирох эх видеог нээнэ үү.');
   setSegments(data.segments.map((s:Segment)=>({...s,sourceKey:sourceKey||s.sourceKey})));
   setFrames(Array.isArray(data.frames)?data.frames:[]);
   setStyleRules(Array.isArray(data.styleRules)?data.styleRules:[]);
   setStatus(data.segments.length+' мөр импортлов. Хугацаа болон аудиог шалгана уу.');
  }catch(e){setStatus(e instanceof Error?e.message:'JSON импортын алдаа');}
 }
 const span=(part.coreEnd-part.coreStart)/zoom;
 const startOfView=part.coreStart+Math.max(0,Math.min(part.coreEnd-part.coreStart-span,current-(part.coreStart+span/2)));
 const endOfView=startOfView+span;
 const media=useMediaEngine(file,startOfView,endOfView);
 const mergeFrames=useCallback((newFrames:FrameResult[])=>{
  setFrames(old=>{
   const all=new Map(old.map(f=>[f.frameSec.toFixed(2),f]));
   for(const frame of newFrames)if(!all.has(frame.frameSec.toFixed(2)))all.set(frame.frameSec.toFixed(2),frame);
   return Array.from(all.values()).sort((a,b)=>a.frameSec-b.frameSec);
  });
 },[]);
 const scan=useBackgroundScan(media.sourceId,mergeFrames);
 useEffect(()=>{if(!duration && media.sourceDuration>0)setDuration(media.sourceDuration);},[duration,media.sourceDuration]);
 const pct=(sec:number)=>100*(sec-startOfView)/Math.max(.001,endOfView-startOfView);
 const soundBars=useMemo(()=>media.peaks.map((amplitude,i)=>(
  <i key={i} className="bybe-wave-bar" style={{
    left:100*i/media.peaks.length+'%',height:Math.max(2,amplitude*84)+'%',
    width:100/media.peaks.length+'%',
  }}/>
 )),[media.peaks]);
 const rows=segments.filter(s=>s.start<part.coreEnd&&s.end>part.coreStart);
 const videoAspect=video.current?.videoWidth&&video.current?.videoHeight?video.current.videoWidth/video.current.videoHeight:16/9;

 return <div className="bybe-workstation">
  <header className="bybe-menu">
   <div className="bybe-logo"><AudioLines size={22}/> <strong>BYBE Studio</strong></div>
   <input ref={filePicker} hidden type="file" accept="video/*,audio/*,.mkv,.mp4,.mp3,.wav,.webm" onChange={e=>openFile(e.target.files?.[0])}/>
   <input ref={importPicker} hidden type="file" accept="application/json,.json" onChange={e=>void importJson(e.target.files?.[0])}/>
   <button onClick={()=>filePicker.current?.click()}><FolderOpen size={17}/> Файл нээх</button>
   <button onClick={()=>importPicker.current?.click()}><FileVideo size={17}/> Бүртгэл оруулах</button>
   <button onClick={exportJson}><Download size={17}/> JSON экспорт</button>
   <button onClick={()=>void media.upload()} disabled={!file||media.working||!!media.sourceId}>
    <Save size={17}/> {media.working&&media.progress!==null?'Импорт '+media.progress+'%':media.sourceId?'FFmpeg бэлэн':'Локал аудио холбох'}
   </button>
   {media.sourceId&&<button onClick={()=>void media.preparePreview()} disabled={media.working}>
    <FileVideo size={17}/> MKV → MP4 үзэх
   </button>}
   {media.working&&<button onClick={media.cancel}>Импортыг зогсоох</button>}
   <button onClick={()=>void captureFrame()} disabled={!src||busy}><ScanText size={17}/> {busy?'Уншиж байна…':'Кадрын OCR'}</button>
   <button disabled={!media.sourceId||scan.busy||!!scan.job&&scan.job.status!=='error'} onClick={()=>void scan.start()}>
    <ScanText size={17}/> Бүх видеоны OCR
   </button>
   {scan.job?.status==='running'&&<button onClick={()=>void scan.pause()}>OCR түр зогсоох</button>}
   {scan.job?.status==='paused'&&<button onClick={()=>void scan.resume()}>OCR үргэлжлүүлэх</button>}
   <span className="bybe-top-status">{file?.name??'Эх видео сонгоогүй'} · {ocrMode}</span>
  </header>
  {scan.job&&<div className="bybe-message" role="status">
    Автомат OCR: {scan.job.message} · {scan.job.nextPart}/{scan.job.totalParts} хэсэг
    {scan.job.status==='complete'?' · Дууссан':''}
   </div>}
  {scan.message&&<div className="bybe-message" role="status">{scan.message}</div>}
  {media.status&&<div className="bybe-message" role="status">{media.status}
    {media.lastRevision&&media.sourceId&&<a href={'/api/media/'+media.sourceId+'/revisions/'+media.lastRevision.id+'/download'} download>WAV татах: {media.lastRevision.filename}</a>}
   </div>}
  {status&&<div className="bybe-message" role="status">{status}<button aria-label="Мессеж хаах" onClick={()=>setStatus('')}><X size={15}/></button></div>}
  <main className="bybe-core">
   <section className="bybe-transcript panel">
    <header><h2>Текст · аудионы жагсаалт</h2><span>{rows.length} аудио · {unlinked.length} OCR · QA {reviewCount}</span></header>
    <div className="bybe-rows" ref={listRef} onWheel={()=>{manualList.current=true;window.setTimeout(()=>manualList.current=false,3000);}}>
     {rows.length===0?<div className="bybe-empty">Энэ хэсэгт аудионы мөр алга. Доод хугацааны шугамаас хэсэг сонгоод, <b>T</b> дарж видеоны текст дээр товшино.</div>:
      rows.map(s=><div key={s.id} ref={r=>{rowRefs.current[s.id]=r;}} className={'bybe-row '+(activeId===s.id?'is-current ':'')+(selectedId===s.id?'is-selected':'')}>
       <button className="bybe-row-text" onClick={()=>{setSelectedId(s.id);const v=video.current;if(v){v.currentTime=s.start;v.pause();}}} title="Видеог энэ хэсэгт очуулах">
        <span>{s.text}</span><small>{time(s.start)}–{time(s.end)} · {kindNames[s.kind]}</small>
       </button>
       <div className="bybe-row-actions">
        <button title="Сонсох" aria-label={s.text+' сонсох'} onClick={()=>play(s,false)}><Play size={15}/></button>
        <button className={loop===s.id?'is-loop':''} title="Тасралтгүй давтах" aria-label={s.text+' давтах'} onClick={()=>loop===s.id?(setLoop(null),video.current?.pause()):play(s,true)}><Repeat2 size={15}/></button>
        <button title="Засах" aria-label={s.text+' засах'} onClick={()=>beginEdit(s)}><Edit3 size={15}/></button>
        <button disabled={!media.sourceId||media.working} title="Жинхэнэ WAV шинэ хувилбар хадгалах (QA шалгах шаардлагатай)"
         aria-label={s.text+' WAV үүсгэх'} onClick={()=>void media.exportWav(s)}><Download size={15}/></button>
       </div>
      </div>)}
     {unlinked.map(b=><div key={b.id} className="bybe-ocr-row">
      <button className="bybe-row-text" onClick={()=>{const v=video.current;if(v){v.pause();v.currentTime=b.frameSec;}toPartAt(b.frameSec);}} title="Энэ бичвэр гарсан кадрт очих">
       <span>{b.text}</span><small>OCR · {roleLabel(effectiveRole(b,styleRules))} · {time(b.frameSec)}</small>
      </button>
      <button title="Хэсэг сонгосны дараа энэ бичвэртэй холбох" onClick={()=>assignBlock(b)}>{selectedRange?'＋':'⧉'}</button>
      <button title="Хэв маягийг ангилах" onClick={()=>{setStyleTarget(b);setStyleRole(effectiveRole(b,styleRules));}}><Settings2 size={14}/></button>
     </div>)}
    </div>
   </section>
   <section className="bybe-preview panel">
    <header><h2>Эх видео · нэг товшилтын текст</h2><span>Текст таних: {frame?'кадр бэлэн':'энэ кадрт байхгүй'}</span></header>
    <div className="bybe-video-holder">
     {src?<div className="bybe-video-frame" style={{aspectRatio:String(videoAspect)}}>
      <video ref={video} src={media.previewUrl||src} controls playsInline preload="metadata"
       onTimeUpdate={onTimeTick}
       onLoadedMetadata={e=>{const d=e.currentTarget.duration;setDuration(Number.isFinite(d)?d:0);}}
       onError={()=>setStatus('Файлын кодекийг браузер уншиж чадсангүй. MKV-г FFmpeg-ээр MP4 preview болгон хөрвүүлэх шаардлагатай.')}
       onEnded={()=>{setLoop(null);seekEnd.current=null;}}/>
      {visibleBlocks.map(b=><div key={b.id} className={'bybe-ocr-box '+(textMode?'armed':'')}
        style={{left:b.box.x*100+'%',top:b.box.y*100+'%',width:b.box.w*100+'%',height:b.box.h*100+'%'}}>
        <button className="bybe-ocr-select" title={'Хуулах / холбоход товших: '+b.text} onClick={()=>assignBlock(b)}>
          {textMode?'＋':''}{b.text}
        </button>
        <button className="bybe-style-button" title="Энэ үсгийн хэв маягийг ангилах" onClick={()=>{setStyleTarget(b);setStyleRole(effectiveRole(b,styleRules));}}><Settings2 size={11}/></button>
       </div>)}
      </div>:<div className="bybe-video-empty"><FileVideo size={34}/> Эх видео сонгоно уу</div>}
    </div>
    <div className="bybe-preview-tools">
     <span>{time(current)} / {time(duration)}</span>
     <button className={textMode?'primary':''} onClick={()=>setTextMode(v=>!v)}>T · Текст холбох</button>
     <button onClick={()=>void captureFrame()} disabled={!src||busy}><ScanText size={15}/> Одоо харагдаж буй кадрыг таних</button>
    </div>
    <p className="bybe-help">Үндсэн OCR компьютер дээр үнэгүй ажиллана. Анхны запускт Чех/Англи хэлний загвар татагдаж болно. Үсгийн өнгө/зузааны бодит танилт хараахан байхгүй. Координат ба текстийг шалгана.</p>
   </section>
  </main>
  <section className="bybe-timeline panel">
   <header><h2>Үндсэн аудионы хугацааны шугам</h2>
    <div><button onClick={()=>setZoom(x=>Math.max(1,x/2))}>−</button><span> ×{zoom}</span><button onClick={()=>setZoom(x=>Math.min(8,x*2))}>＋</button></div>
   </header>
   <div className="bybe-partnav">
    <button disabled={partIndex===0} onClick={()=>{setPartIndex(x=>x-1);if(video.current)video.current.currentTime=parts[partIndex-1]?.coreStart??0;}}><ChevronLeft size={16}/></button>
    <span>Хэсэг {partIndex+1}/{parts.length||1} · {time(part.coreStart)}–{time(part.coreEnd)} · Эх файл өөрчлөгдөхгүй</span>
    <button disabled={partIndex>=parts.length-1} onClick={()=>{setPartIndex(x=>x+1);if(video.current)video.current.currentTime=parts[partIndex+1]?.coreStart??0;}}><ChevronRight size={16}/></button>
   </div>
   <div className="bybe-track" ref={pointerBox} onPointerDown={beginDrag} onPointerMove={drag} onPointerUp={endDrag}>
    <div className="bybe-track-grid"/>
    {soundBars.length>0&&<div className="bybe-wave-peaks">{soundBars}</div>}
    {segments.filter(s=>s.start<endOfView&&s.end>startOfView).map(s=><div className="bybe-track-segment" key={s.id}
     style={{left:Math.max(0,pct(s.start))+'%',width:Math.max(.3,Math.min(100,pct(s.end))-Math.max(0,pct(s.start)))+'%'}} title={s.text}/>)}
    {selectedRange&&selectedRange.end>startOfView&&selectedRange.start<endOfView&&<div className="bybe-track-selection"
     style={{left:Math.max(0,pct(selectedRange.start))+'%',width:Math.max(.3,Math.min(100,pct(selectedRange.end))-Math.max(0,pct(selectedRange.start)))+'%'}}/>}
    {current>=startOfView&&current<=endOfView&&<div className="bybe-track-head" style={{left:pct(current)+'%'}}/>}
   </div>
   <div className="bybe-timeline-footer">
    <span>{time(startOfView)}</span>
    <span>{selectedRange?'Сонгосон: '+time(selectedRange.start)+' – '+time(selectedRange.end)+' · T → текст дээр товших':'Хулганаар чирж хугацаа сонгох · нэг товшилтоор гүйлгэх'}</span>
    <span>{time(endOfView)}</span>
   </div>
   <p className="bybe-help">{media.sourceId?
    'Бодит waveform: FFmpeg аудионоос тооцсон долгион. Аудионы мөрийн ↓ товчоор шинэ WAV revision хадгална. QA баталгаажуулалт тусдаа.' :
    'Эх файлыг «Локал аудио холбох» товчоор энэ компьютерийн FFmpeg хөдөлгүүрт оруулбал бодит waveform болон WAV экспорт идэвхжинэ.'}</p>
  </section>
  {styleTarget&&<div className="bybe-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setStyleTarget(null);}}>
   <section className="bybe-modal" role="dialog" aria-modal="true" aria-label="Текстийн хэв маяг">
    <header><h2>Текстийн хэв маягийг таних</h2><button onClick={()=>setStyleTarget(null)}><X size={18}/></button></header>
    <strong>{styleTarget.text}</strong>
    <p>Хэв маяг: {styleSignature(styleTarget)}</p>
    <label>Энэ хэлбэрийн бичвэрийг ангилах
     <select value={styleRole} onChange={e=>setStyleRole(e.target.value as TextRole)}>
      {roles.map(r=><option key={r} value={r}>{roleLabel(r)}</option>)}
     </select>
    </label>
    <p className="bybe-help">Энэ дүрэм зөвхөн одоогийн бичлэгт хэрэглэгдэнэ. Өөр бичлэгт автоматаар хуулахгүй.</p>
    <div className="bybe-actions"><button onClick={()=>setStyleTarget(null)}>Болих</button><button className="primary" onClick={saveStyleRule}><Check size={16}/> Ижил хэв маягт хэрэглэх</button></div>
   </section>
  </div>}
  {editing&&<div className="bybe-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditId(null);}}>
   <section className="bybe-modal" role="dialog" aria-modal="true" aria-label="Аудионы зааг засах">
    <header><h2>Аудионы хэсэг засах</h2><button onClick={()=>setEditId(null)}><X size={18}/></button></header>
    <div className="bybe-edit-fields">
     <label>Бичвэр<input value={editDraft.text} onChange={e=>setEditDraft(v=>({...v,text:e.target.value}))}/></label>
     <label>Төрөл<select value={editDraft.kind} onChange={e=>setEditDraft(v=>({...v,kind:e.target.value as ClipKind}))}>{KINDS.map(k=><option key={k} value={k}>{kindNames[k]}</option>)}</select></label>
     <label>Эхлэл (сек)<input type="number" step=".001" value={editDraft.start} onChange={e=>setEditDraft(v=>({...v,start:e.target.value}))}/></label>
     <label>Төгсгөл (сек)<input type="number" step=".001" value={editDraft.end} onChange={e=>setEditDraft(v=>({...v,end:e.target.value}))}/></label>
    </div>
    <div className="bybe-actions"><button onClick={()=>play(editing,false)}><Play size={16}/> Сонсох</button><button onClick={()=>play(editing,true)}><Repeat2 size={16}/> Давтах</button>
      <button className="primary" onClick={saveEdit}><Save size={16}/> Enter · Хадгалах</button></div>
    <p className="bybe-help">Хугацаа/текст засахад QA баталгаа хүчингүй болно. Esc — хаах.</p>
   </section>
  </div>}
 </div>;
}
