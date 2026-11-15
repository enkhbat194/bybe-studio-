import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Check, ChevronLeft, ChevronRight, Clipboard, Download, Edit3, FileVideo, FolderOpen, Play, Repeat2, Save, ScanText, Settings2, Trash2, Undo2, X } from 'lucide-react';
import { planParts, owningPart } from './lib/parts';
import { proposeTextLinks } from './lib/ocrMatch';
import { effectiveRole, roleLabel, sameScreenText, styleRuleFromBlock, styleSignature, usefulVideoText, validateBlock, type FrameResult, type OcrBlock, type StyleRule, type TextRole } from './lib/typography';
import { useMediaEngine } from './useMediaEngine';
import { useBackgroundScan } from './useBackgroundScan';
import { useBackgroundAsr, type AsrCandidate } from './useBackgroundAsr';
import { useVisualAudio } from './useVisualAudio';
import type { AudioSuggestion } from './lib/autoAlign';
import ClipWaveEditor from './ClipWaveEditor';
import VideoTextRegion from './VideoTextRegion';
import './StudioWorkspace.css';
import './StudioWorkspaceRefine.css';

type ClipKind='word_normal'|'word_slow'|'sentence_normal'|'sentence_slow'|'english_word'|'english_sentence'|'unknown';
const qaItems={
 start_heard:'Эхний авиа бүтэн',end_heard:'Сүүлийн авиа бүтэн',whole_heard:'Бүтэн дуудлага зөв',
 language_correct:'Зөв хэлээр ярьсан',text_correct:'Аудио ба бичвэр таарсан',role_correct:'Аудионы төрөл зөв',
} as const;
type QAKey=keyof typeof qaItems;
const emptyQa=():Record<QAKey,boolean>=>Object.fromEntries(Object.keys(qaItems).map(k=>[k,false])) as Record<QAKey,boolean>;
interface Segment {
 id:string;sourceKey:string;text:string;kind:ClipKind;start:number;end:number;
 revisionId?:string;checks?:Record<QAKey,boolean>;matchStatus?:'AUTO_SUGGESTED';
 origin?:'VISUAL_AUDIO_ESTIMATE'|'LOCAL_ASR';
 firstPassStart?:number;firstPassEnd?:number;
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
 // A batch OCR frame may represent the same slide for several seconds.
 const prior=frames.filter(f=>f.frameSec<=current).reduce<FrameResult|null>((prev,f)=>
  !prev||f.frameSec>prev.frameSec?f:prev,null);
 if(prior&&current-prior.frameSec<=8)return prior;
 const upcoming=frames.filter(f=>f.frameSec>current).reduce<FrameResult|null>((prev,f)=>
  !prev||f.frameSec<prev.frameSec?f:prev,null);
 return upcoming&&upcoming.frameSec-current<=2?upcoming:null;
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
 const [lastDeleted,setLastDeleted]=useState<Segment|null>(null);
 const [dismissed,setDismissed]=useState<{start:number;end:number}[]>([]);
 const dismissedRef=useRef<{start:number;end:number}[]>([]);
 const videoFrameRef=useRef<HTMLDivElement|null>(null);
 const [editId,setEditId]=useState<string|null>(null);
 const [qaChecks,setQaChecks]=useState<Record<QAKey,boolean>>(emptyQa);
 const [editDraft,setEditDraft]=useState<{text:string;start:string;end:string;kind:ClipKind}>({text:'',start:'0',end:'1',kind:'unknown'});
 const [textMode,setTextMode]=useState(false);
 const [status,setStatus]=useState('');
 const [busy,setBusy]=useState(false);
 const [styleTarget,setStyleTarget]=useState<OcrBlock|null>(null);
 const [styleRole,setStyleRole]=useState<TextRole>('unknown');
 const [loop,setLoop]=useState<string|null>(null);
 const [partIndex,setPartIndex]=useState(0);
 const [ocrMode,setOcrMode]=useState('Локал OCR');
 const [capabilities,setCapabilities]=useState<{ffmpeg:boolean;ffprobe:boolean;python:boolean;fasterWhisper:boolean}|null>(null);
 const [asrBusy,setAsrBusy]=useState(false);
 const [toolsOpen,setToolsOpen]=useState(false);
 const [zoom,setZoom]=useState(1);
 const [viewAnchor,setViewAnchor]=useState(0);
 const video=useRef<HTMLVideoElement|null>(null);
 const seekEnd=useRef<number|null>(null);
 const dragStart=useRef<number|null>(null);
 const panDrag=useRef<{x:number;anchor:number}|null>(null);
 const pointerBox=useRef<HTMLDivElement|null>(null);
 const filePicker=useRef<HTMLInputElement|null>(null);
 const importPicker=useRef<HTMLInputElement|null>(null);
 const listRef=useRef<HTMLDivElement|null>(null);
 const rowRefs=useRef<Record<string,HTMLDivElement|null>>({});
 const manualList=useRef(false);
 const lastActive=useRef<string|null>(null);
 const autoImportKey=useRef('');
 const autoOcrSource=useRef('');
 const autoAsrSource=useRef('');
 const parts=useMemo(()=>planParts(duration,5,2),[duration]);
 const part=parts[partIndex]??{index:1,coreStart:0,coreEnd:Math.max(duration,1),analysisStart:0,analysisEnd:Math.max(duration,1)};
 const active=segments.find(s=>current>=s.start&&current<s.end)??null;
 const activeId=active?.id??null;
 const selected=segments.find(s=>s.id===selectedId)??null;
 const editing=segments.find(s=>s.id===editId)??null;
 const frame=nearestFrame(frames,current);
 const visibleBlocks=textMode?(frame?.blocks.filter(b=>usefulVideoText(b)&&effectiveRole(b,styleRules)!=='ignore')??[]):[];
 const reviewCount=segments.filter(s=>s.qa==='REVIEW_REQUIRED').length;
 const collected=useMemo(()=>{
  const list:OcrBlock[]=[];
  for(const snap of frames){for(const block of snap.blocks){
    if(!usefulVideoText(block)||effectiveRole(block,styleRules)==='ignore')continue;
    if(!list.some(old=>sameScreenText(old,block)))list.push(block);
  }}
  return list.sort((a,b)=>a.frameSec-b.frameSec);
 },[frames,styleRules]);
 const unlinked=collected.filter(b=>b.frameSec>=part.coreStart&&b.frameSec<part.coreEnd&&!segments.some(s=>s.ocrId===b.id||s.text===b.text&&Math.abs((s.frameSec??-100)-b.frameSec)<10));

 // Connect only high-similarity OCR and ASR results; never certify quality.
 useEffect(()=>{
  if(!frames.length||!segments.length)return;
  const proposed=proposeTextLinks(segments,frames);
  if(!proposed.length)return;
  const byClip=new Map(proposed.map(m=>[m.clipId,m]));
  setSegments(old=>old.map(segment=>{
   const linked=byClip.get(segment.id);
   if(!linked||segment.ocrId||segment.qa==='MANUALLY_VERIFIED')return segment;
   const block=frames.find(f=>f.frameSec===linked.frameSec)?.blocks.find(b=>b.id===linked.ocrId);
   if(!block)return segment;
   return {...segment,ocrId:linked.ocrId,frameSec:linked.frameSec,
    styleSignature:styleSignature(block),matchStatus:'AUTO_SUGGESTED' as const};
  }));
 },[frames,segments]);
 useEffect(()=>{
  fetch('/api/health').then(r=>r.json())
   .then(v=>setOcrMode(v.ocrEngine==='gemini-opt-in'?'Gemini OCR (сонголт)':'Локал OCR · үнэгүй')).catch(()=>{});
  fetch('/api/system/capabilities').then(r=>r.json()).then(setCapabilities).catch(()=>{});
 },[]);
 useEffect(()=>{return ()=>{if(src)URL.revokeObjectURL(src);};},[src]);
 // SHIFT + mouse wheel on video = go backwards / forwards in the original media.
 // This is independent of the timeline pan and does not interfere with video play controls.
 useEffect(()=>{
  const el=videoFrameRef.current;if(!el)return;
  const wheel=(e:WheelEvent)=>{
   if(!e.shiftKey||!video.current)return;
   e.preventDefault();
   const delta=e.deltaY||e.deltaX;
   if(!delta)return;
   const v=video.current;
   const step=Math.max(1,Math.min(9,Math.abs(delta)/90*3.5));
   const target=Math.max(0,Math.min(duration||v.duration||1,v.currentTime+Math.sign(delta)*step));
   v.pause();v.currentTime=target;setCurrent(target);setViewAnchor(target);toPartAt(target);
  };
  el.addEventListener('wheel',wheel,{passive:false});
  return()=>el.removeEventListener('wheel',wheel);
 },[src,duration,parts]);
 useEffect(()=>{
  if(!sourceKey)return;
  const data=safeRead<{segments:Segment[];frames:FrameResult[];styleRules:StyleRule[];dismissed?:{start:number;end:number}[]}>(keyPrefix+':'+sourceKey,{segments:[],frames:[],styleRules:[]});
  const tombstones=Array.isArray(data.dismissed)?data.dismissed.filter(x=>Number.isFinite(x.start)&&Number.isFinite(x.end)):[];
  dismissedRef.current=tombstones;setDismissed(tombstones);setLastDeleted(null);
  setSegments((data.segments||[]).filter(isSegment));
  setFrames(Array.isArray(data.frames)?data.frames.filter(x=>typeof x.frameSec==='number'&&Array.isArray(x.blocks)):[]);
  setStyleRules(Array.isArray(data.styleRules)?data.styleRules:[]);
  setSelectedRange(null);setSelectedId(null);setPartIndex(0);setCurrent(0);setViewAnchor(0);setZoom(1);setLoop(null);
  setHydratedKey(sourceKey);
 },[sourceKey]);
 useEffect(()=>{
  if(!sourceKey||hydratedKey!==sourceKey)return;
  try{
   // A bounded browser cache. Full video processing will require SQLite on the local worker.
   localStorage.setItem(keyPrefix+':'+sourceKey,JSON.stringify({segments,frames:frames.slice(-120),styleRules,dismissed}));
  }catch{setStatus('Төхөөрөмжийн түр санах ой дүүрсэн. JSON нөөцлөлт хийгээрэй.');}
 },[segments,frames,styleRules,dismissed,sourceKey,hydratedKey]);
 useEffect(()=>{
  if(!activeId||activeId===lastActive.current||manualList.current||editId)return;
  lastActive.current=activeId;
  rowRefs.current[activeId]?.scrollIntoView({block:'nearest',behavior:'smooth'});
 },[activeId,editId]);
 useEffect(()=>{
  const onKey=(e:KeyboardEvent)=>{
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&lastDeleted){
    const target=e.target as HTMLElement|null;
    if(!target?.matches('input,textarea,select,[contenteditable="true"]')){
     e.preventDefault();undoDelete();
    }
    return;
   }
   if(e.ctrlKey||e.metaKey||e.altKey)return;
   const el=e.target as HTMLElement|null;
   if(editId){
    if(e.key==='Enter'&&!el?.matches('textarea,input,select,button,audio,[contenteditable="true"]')){e.preventDefault();saveEdit();}
    if(e.key==='Escape'){e.preventDefault();setEditId(null);}
    return;
   }
   if(el?.matches('input,textarea,select,[contenteditable="true"]'))return;
   if((e.key==='Delete'||e.key==='Backspace')&&selected){e.preventDefault();removeSegment(selected);return;}
   if((e.key==='z'||e.key==='Z')&&e.shiftKey&&lastDeleted){e.preventDefault();undoDelete();return;}
   if(e.key==='Escape'){setTextMode(false);setStyleTarget(null);}
   if(e.key.toLowerCase()==='t'){e.preventDefault();if(!textMode)video.current?.pause();setTextMode(v=>!v);}
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
  autoImportKey.current='';
  autoOcrSource.current='';
  autoAsrSource.current='';
  dismissedRef.current=[];
  setFile(f);setSourceKey(key);setSrc(URL.createObjectURL(f));setDuration(0);
  setTextMode(false);
  setStatus('Видео нээгдлээ. BYBE файлыг локал хөдөлгүүрт бэлтгээд OCR-ийг автоматаар эхлүүлнэ. Том файлд SSD зай шаардлагатай.');
 }
 function toPartAt(t:number){const ix=owningPart(parts,t);if(ix!==null)setPartIndex(ix-1);}
 function onTimeTick(){
  const v=video.current;if(!v)return;
  const t=v.currentTime;setCurrent(t);toPartAt(t);
  if(t<startOfView||t>endOfView)setViewAnchor(t);
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
 async function exportClip(s:Segment){
  const revision=await media.exportWav(s);
  if(!revision)return;
  setSegments(old=>old.map(c=>c.id===s.id?{...c,revisionId:revision.id,checks:emptyQa(),
   qa:'REVIEW_REQUIRED' as const}:c));
  setStatus('Жинхэнэ WAV хадгаллаа. Хүний QA шалгалт шаардлагатай.');
 }
 async function verifyEditing(){
  if(!editing||!media.sourceId||!editing.revisionId)return;
  if(editDraft.text.trim()!==editing.text||Number(editDraft.start)!==editing.start||Number(editDraft.end)!==editing.end||editDraft.kind!==editing.kind){
   setStatus('Энэ засвар хараахан хадгалагдаагүй. Эхлээд хадгалаад шинэ WAV үүсгэнэ үү.');return;
  }
  if(!Object.keys(qaItems).every(k=>qaChecks[k as QAKey])){setStatus('6 QA шалгалт бүгдийг батална уу.');return;}
  try{
   const response=await fetch('/api/media/'+media.sourceId+'/revisions/'+editing.revisionId+'/verify',{
    method:'POST',headers:{'X-BYBE-Request':'1','Content-Type':'application/json'},
    body:JSON.stringify({clipId:editing.id,text:editing.text,start:editing.start,end:editing.end,kind:editing.kind,checks:qaChecks})
   });
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'QA батлахад алдаа.');
   setSegments(old=>old.map(c=>c.id===editing.id?{...c,checks:{...qaChecks},
    qa:'MANUALLY_VERIFIED' as const}:c));
   setEditId(null);setStatus('Бодит WAV хэшийг шалгаж, хүний 6 QA баталгааг хадгаллаа.');
  }catch(e){setStatus(e instanceof Error?e.message:'QA баталгаажуулалтын алдаа');}
 }
 async function downloadAppReady(){
  if(!media.sourceId){setStatus('Эх видеог локал хөдөлгүүрт холбоно уу.');return;}
  try{
   const response=await fetch('/api/media/'+media.sourceId+'/app-ready');
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Экспортын алдаа');
   const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download='BYBE_APP_READY.json';a.click();
   window.setTimeout(()=>URL.revokeObjectURL(url),1000);
   setStatus((data.clips?.length||0)+' QA баталгаажсан WAV-ийн manifest экспортлов. Аудио файлуудыг тусад нь татна.');
  }catch(e){setStatus(e instanceof Error?e.message:'Экспортын алдаа');}
 }
 const deletedMatch=(a:{start:number;end:number},b:{start:number;end:number})=>
  Math.abs(a.start-b.start)<.65&&Math.abs(a.end-b.end)<.8;
 function removeSegment(s:Segment){
  if(s.qa==='MANUALLY_VERIFIED'&&
    !window.confirm('QA баталгаажсан аудионы бүртгэлийг устгах уу? WAV файл сервер дээр хэвээр үлдэнэ.'))return;
  const next=[...dismissedRef.current,{start:s.start,end:s.end}];
  dismissedRef.current=next;setDismissed(next);
  setSegments(old=>old.filter(x=>x.id!==s.id));
  if(selectedId===s.id)setSelectedId(null);
  setLastDeleted(s);
  setStatus('Аудионы мөрийг хаслаа. Ctrl+Z эсвэл «Буцаах» дарж сэргээнэ. Эх видео, WAV файл устахгүй.');
 }
 function undoDelete(){
  if(!lastDeleted||lastDeleted.sourceKey!==sourceKey)return;
  const prior=lastDeleted;
  let i=-1;
  for(let idx=dismissedRef.current.length-1;idx>=0;idx--){
   if(deletedMatch(dismissedRef.current[idx],prior)){i=idx;break;}
  }
  const next=dismissedRef.current.filter((_,idx)=>idx!==i);
  dismissedRef.current=next;setDismissed(next);
  setSegments(old=>old.some(x=>x.id===prior.id)?old:[...old,prior].sort((a,b)=>a.start-b.start));
  setSelectedId(prior.id);setLastDeleted(null);
  setStatus('Устгасан аудионы мөр сэргээгдлээ.');
 }
 function attachRegionText(data:{text:string;kind:string;frameSec:number}){
  const text=data.text.normalize('NFC').trim();
  if(!text)return setStatus('Хоосон бичвэртэй аудио холбохгүй.');
  const kind=KINDS.includes(data.kind as ClipKind)?data.kind as ClipKind:'unknown';
  const start=selectedRange?.start??selected?.start,end=selectedRange?.end??selected?.end;
  if(start===undefined||end===undefined||end-start<.04){
   setStatus('Эхлээд доод waveform-аас аудио хүрээ чирж сонгох эсвэл зүүн жагсаалтын мөр сонгоно уу.');
   return;
  }
  if(selectedRange){
   const item:Segment={id:crypto.randomUUID(),sourceKey,text,kind,
    start:n3(start),end:n3(end),frameSec:data.frameSec,ocrId:null,
    styleSignature:null,qa:'REVIEW_REQUIRED',updatedAt:new Date().toISOString()};
   setSegments(old=>[...old,item].sort((a,b)=>a.start-b.start));
   setSelectedId(item.id);setSelectedRange(null);
  }else if(selected){
   setSegments(old=>old.map(x=>x.id===selected.id?{...x,text,kind,
    frameSec:data.frameSec,ocrId:null,styleSignature:null,origin:undefined,
    matchStatus:undefined,revisionId:undefined,checks:emptyQa(),
    qa:'REVIEW_REQUIRED' as const,updatedAt:new Date().toISOString()}:x));
  }
  setTextMode(false);setStatus('Бүтэн бичвэр "'+text+'" сонгосон аудиотой холбогдлоо. Сонсож QA шалгана.');
 }
 function beginEdit(s:Segment){
  video.current?.pause();
  setSelectedId(s.id);setEditId(s.id);setEditDraft({text:s.text,start:String(s.start),end:String(s.end),kind:s.kind});setQaChecks(s.checks||emptyQa());
  setLoop(null);
 }
 function saveEdit(){
  if(!editId)return;
  const start=Number(editDraft.start),end=Number(editDraft.end);
  if(!editDraft.text.trim()||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||(duration>0&&end>duration)){
   setStatus('Бичвэр эсвэл эхлэл/төгсгөлийн хугацаа буруу байна.');return;
  }
  setSegments(old=>old.map(s=>s.id===editId?{...s,text:editDraft.text.trim(),start:n3(start),end:n3(end),kind:editDraft.kind,
   firstPassStart:s.firstPassStart??s.start,firstPassEnd:s.firstPassEnd??s.end,
   origin:undefined,matchStatus:undefined,revisionId:undefined,checks:emptyQa(),qa:'REVIEW_REQUIRED' as const,updatedAt:new Date().toISOString()}:s).sort((a,b)=>a.start-b.start));
  setEditId(null);setStatus('Засвар хадгалагдлаа. Өмнөх QA баталгаа хүчингүй.');
 }
 function posToTime(clientX:number){
  const el=pointerBox.current;if(!el)return 0;
  const rect=el.getBoundingClientRect();
  const fraction=Math.min(1,Math.max(0,(clientX-rect.left)/rect.width));
  const span=(part.coreEnd-part.coreStart)/zoom;
  // Match the EXACT rendered viewport, including independent mouse panning.
  return n3(startOfView+fraction*span);
 }
 function beginDrag(e:React.PointerEvent<HTMLDivElement>){
  if(!duration)return;
  if(e.shiftKey||e.button===1){
   panDrag.current={x:e.clientX,anchor:viewAnchor};e.currentTarget.setPointerCapture(e.pointerId);return;
  }
  e.currentTarget.setPointerCapture(e.pointerId);dragStart.current=posToTime(e.clientX);
  setSelectedRange({start:dragStart.current,end:dragStart.current+0.001});setLoop(null);
 }
 function drag(e:React.PointerEvent<HTMLDivElement>){
  if(panDrag.current){
   const pixels=pointerBox.current?.getBoundingClientRect().width||1;
   const delta=(e.clientX-panDrag.current.x)/pixels*span;
   setViewAnchor(Math.max(part.coreStart,Math.min(part.coreEnd,panDrag.current.anchor-delta)));
   return;
  }
  if(dragStart.current===null)return;
  const t=posToTime(e.clientX),lo=Math.min(t,dragStart.current),hi=Math.max(t,dragStart.current);
  setSelectedRange({start:lo,end:Math.max(hi,lo+0.001)});
 }
 function endDrag(e:React.PointerEvent<HTMLDivElement>){
  if(panDrag.current){
   panDrag.current=null;
   if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
   return;
  }
  if(dragStart.current===null)return;
  const t=posToTime(e.clientX),start=Math.min(t,dragStart.current),end=Math.max(t,dragStart.current);
  dragStart.current=null;
  if(end-start<.08){const v=video.current;if(v)v.currentTime=t;setSelectedRange(null);return;}
  setSelectedRange({start:n3(start),end:n3(end)});
  const v=video.current;if(v){v.pause();v.currentTime=start;}setCurrent(start);
  setTextMode(true);
  setStatus('Аудионы хүрээ сонголоо. Одоо видеоны Чех үг эсвэл бүтэн өгүүлбэрийг хулганаар хүрээлж чир.');
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
  }else if(textMode&&selected){
   setSegments(old=>old.map(c=>c.id===selected.id?{
    ...c,text:b.text,kind:kindFromRole(role)==='unknown'?c.kind:kindFromRole(role),
    frameSec:b.frameSec,ocrId:b.id,styleSignature:styleSignature(b),origin:undefined,matchStatus:undefined,revisionId:undefined,checks:emptyQa(),
    qa:'REVIEW_REQUIRED' as const,updatedAt:new Date().toISOString()
   }:c));
   setTextMode(false);
   setStatus('Сонгосон аудионы бичвэрийг "'+b.text+'" болгож холболоо. QA дахин шалгах шаардлагатай.');
  }else{
   void navigator.clipboard?.writeText(b.text).then(()=>setStatus('Текст хуулагдлаа: '+b.text)).catch(()=>setStatus('Текст: '+b.text));
  }
 }
 async function transcribePart(){
  if(!media.sourceId){setStatus('Whisper ашиглахын өмнө эх видеог локал хөдөлгүүрт холбох хэрэгтэй.');return;}
  setAsrBusy(true);setStatus('Локал Whisper яриа таньж байна. Хугацаа шаардаж болно…');
  try{
   const result=await fetch('/api/asr/part',{method:'POST',
    headers:{'X-BYBE-Request':'1','Content-Type':'application/json'},
    body:JSON.stringify({sourceId:media.sourceId,start:part.coreStart,end:part.coreEnd})});
   const data=await result.json();
   if(!result.ok)throw Error(data.error||'Whisper алдаа');
   const candidates=(Array.isArray(data.segments)?data.segments:[]).filter((c:any)=>
    typeof c.text==='string'&&typeof c.start==='number'&&typeof c.end==='number'&&
    c.start>=0&&c.end>c.start) as Array<{text:string;start:number;end:number}>;
   const created=candidates.map(c=>({
    id:crypto.randomUUID(),sourceKey,text:c.text,kind:'unknown' as const,
    start:n3(c.start),end:n3(c.end),frameSec:null,ocrId:null,styleSignature:null,
    qa:'REVIEW_REQUIRED' as const,updatedAt:new Date().toISOString()
   }));
   setSegments(old=>[...old,...created.filter(c=>!old.some(x=>Math.abs(x.start-c.start)<.35&&
    Math.abs(x.end-c.end)<.35))].sort((a,b)=>a.start-b.start));
   setStatus('Whisper '+data.device+' дээр '+created.length+' ярианы хэсэг санал болголоо. Хэлний ангилал ба текстийг сонсож баталгаажуулна.');
  }catch(e){setStatus(e instanceof Error?e.message:'Whisper танилтын алдаа');}
  finally{setAsrBusy(false);}
 }
 function saveStyleRule(){
  if(!styleTarget)return;
  const rule=styleRuleFromBlock(styleTarget,styleRole);
  setStyleRules(old=>[...old.filter(x=>x.signature!==rule.signature),rule]);
  setStyleTarget(null);setStatus('Ижил хэв маягийн бичвэрт "'+roleLabel(styleRole)+'" ангилал хэрэглэнэ (зөвхөн энэ видео).');
 }
 function exportJson(){
  const payload={schema:'bybe-workspace-v2',source:{name:file?.name??'',size:file?.size??0,modified:file?.lastModified??0},
   savedAt:new Date().toISOString(),segments,frames,styleRules,dismissed};
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
   const hidden=Array.isArray(data.dismissed)?data.dismissed.filter((x:any)=>Number.isFinite(x.start)&&Number.isFinite(x.end)):[];
   dismissedRef.current=hidden;setDismissed(hidden);
   setStatus(data.segments.length+' мөр импортлов. Хугацаа болон аудиог шалгана уу.');
  }catch(e){setStatus(e instanceof Error?e.message:'JSON импортын алдаа');}
 }
 const span=(part.coreEnd-part.coreStart)/zoom;
 const startOfView=part.coreStart+Math.max(0,Math.min(part.coreEnd-part.coreStart-span,viewAnchor-(part.coreStart+span/2)));
 const endOfView=startOfView+span;
 // React wheel handlers can be passive; bind a native non-passive listener so
 // wheel zoom does not scroll the whole page on Chrome/Edge.
 useEffect(()=>{
  const track=pointerBox.current;if(!track)return;
  const handler=(e:WheelEvent)=>{
   e.preventDefault();
   if(e.shiftKey){
    setViewAnchor(a=>Math.max(part.coreStart,Math.min(part.coreEnd,
     a+Math.sign(e.deltaY)*span*.22)));
    return;
   }
   const rect=track.getBoundingClientRect();
   const ratio=Math.max(0,Math.min(1,(e.clientX-rect.left)/Math.max(1,rect.width)));
   const target=startOfView+span*ratio;
   const newZoom=Math.max(1,Math.min(64,zoom*(e.deltaY>0?1/1.4:1.4)));
   const nextSpan=(part.coreEnd-part.coreStart)/newZoom;
   setViewAnchor(target+(.5-ratio)*nextSpan);
   setZoom(newZoom);
  };
  track.addEventListener('wheel',handler,{passive:false});
  return()=>track.removeEventListener('wheel',handler);
 },[zoom,span,startOfView,part.coreStart,part.coreEnd]);
 const media=useMediaEngine(file,startOfView,endOfView);
 const mergeFrames=useCallback((newFrames:FrameResult[])=>{
  setFrames(old=>{
   const all=new Map(old.map(f=>[f.frameSec.toFixed(2),f]));
   for(const frame of newFrames){
    const key=frame.frameSec.toFixed(2),prior=all.get(key);
    // A deliberate re-scan may validly contain FEWER text regions after noise filtering.
    // Replace old blocks for the same timestamp, rather than preserving the noisiest output.
    if(!prior||JSON.stringify(prior.blocks)!==JSON.stringify(frame.blocks))all.set(key,frame);
   }
   return Array.from(all.values()).sort((a,b)=>a.frameSec-b.frameSec);
  });
 },[]);
 const scan=useBackgroundScan(media.sourceId,mergeFrames);
 const addAutoAudio=useCallback((items:AudioSuggestion[])=>{
  setSegments(old=>{
   const merged=old.slice();
   let changed=false;
   for(const suggestion of items){
    if(dismissedRef.current.some(d=>Math.abs(d.start-suggestion.start)<.65&&Math.abs(d.end-suggestion.end)<.8))continue;
    // Never overwrite a manually edited or ASR-based audio segment with visual estimates.
    if(merged.some(c=>Math.abs(c.start-suggestion.start)<.45&&Math.abs(c.end-suggestion.end)<.45))continue;
    if(merged.some(c=>c.origin!=='VISUAL_AUDIO_ESTIMATE'&&
      Math.max(0,Math.min(c.end,suggestion.end)-Math.max(c.start,suggestion.start))>
      .60*Math.min(c.end-c.start,suggestion.end-suggestion.start)))continue;
    // Avoid unstable duplicate proposals while OCR frame batches arrive.
    if(merged.some(c=>c.origin==='VISUAL_AUDIO_ESTIMATE'&&
      Math.abs(c.start-suggestion.start)<.7))continue;
    merged.push({id:crypto.randomUUID(),sourceKey,text:suggestion.text,
      start:suggestion.start,end:suggestion.end,firstPassStart:suggestion.start,firstPassEnd:suggestion.end,kind:'unknown',
      frameSec:suggestion.frameSec,ocrId:suggestion.ocrId,styleSignature:null,
      qa:'REVIEW_REQUIRED',origin:'VISUAL_AUDIO_ESTIMATE',matchStatus:'AUTO_SUGGESTED',
      updatedAt:new Date().toISOString()});
    changed=true;
   }
   return changed?merged.sort((a,b)=>a.start-b.start):old;
  });
 },[sourceKey]);
 const visualAudio=useVisualAudio(media.sourceId,media.sourceDuration||duration,frames,addAutoAudio);
 // Opening a video is sufficient to begin preparing the local FFmpeg data.
 // Refs prevent duplicate long-running imports across React rerenders.
 useEffect(()=>{
  if(!file||media.sourceId||media.working)return;
  const key=[file.name,file.size,file.lastModified].join(':');
  if(autoImportKey.current===key)return;
  autoImportKey.current=key;
  void media.upload();
 },[file,media.sourceId,media.working,media.upload]);
 // Do not require a second hidden click after media import: OCR is local/free.
 useEffect(()=>{
  if(!media.sourceId||scan.job||scan.busy)return;
  if(autoOcrSource.current===media.sourceId)return;
  autoOcrSource.current=media.sourceId;
  void scan.start();
 },[media.sourceId,scan.job,scan.busy,scan.start]);
 const receiveAsr=useCallback((items:AsrCandidate[])=>{
  setSegments(old=>{
   let known=old.slice(),changed=false;
   for(const entry of items){
    if(typeof entry.text!=='string'||!Number.isFinite(entry.start)||!Number.isFinite(entry.end)||entry.end<=entry.start)continue;
    if(dismissedRef.current.some(d=>Math.abs(d.start-entry.start)<.65&&Math.abs(d.end-entry.end)<.8))continue;
    if(known.some(s=>s.origin!=='VISUAL_AUDIO_ESTIMATE'&&Math.abs(s.start-entry.start)<.4&&Math.abs(s.end-entry.end)<.4))continue;
    // A local speech-recognition timestamp supersedes an estimated waveform slot,
    // but NEVER removes manual edits, WAV revisions or verified records.
    known=known.filter(c=>c.origin!=='VISUAL_AUDIO_ESTIMATE'||c.revisionId||
       Math.max(0,Math.min(c.end,entry.end)-Math.max(c.start,entry.start))<
       .45*Math.min(c.end-c.start,entry.end-entry.start));
    known.push({id:crypto.randomUUID(),sourceKey,text:entry.text,kind:'unknown',
      start:n3(entry.start),end:n3(entry.end),firstPassStart:n3(entry.start),firstPassEnd:n3(entry.end),
      frameSec:null,ocrId:null,styleSignature:null,
      qa:'REVIEW_REQUIRED',origin:'LOCAL_ASR',updatedAt:new Date().toISOString()});
    changed=true;
   }
   return changed?known.sort((a,b)=>a.start-b.start):old;
  });
 },[sourceKey]);
 const backgroundAsr=useBackgroundAsr(media.sourceId,receiveAsr);
 // If free faster-whisper is installed, source import launches ASR automatically.
 // Without it, the visual+audio waveform proposal still runs and is clearly unverified.
 useEffect(()=>{
  if(!media.sourceId||capabilities?.fasterWhisper!==true||backgroundAsr.busy)return;
  // An existing failed CUDA job predates CPU-safe default; retry ONCE per reopening.
  if(backgroundAsr.job?.status==='error'){
   const key=media.sourceId+':retry';
   if(autoAsrSource.current===key)return;
   autoAsrSource.current=key;
   void backgroundAsr.resume();
   return;
  }
  if(backgroundAsr.job)return;
  if(autoAsrSource.current===media.sourceId)return;
  autoAsrSource.current=media.sourceId;
  void backgroundAsr.start();
 },[media.sourceId,capabilities?.fasterWhisper,backgroundAsr.job,backgroundAsr.busy,backgroundAsr.start,backgroundAsr.resume]);
 useEffect(()=>{if(!duration && media.sourceDuration>0)setDuration(media.sourceDuration);},[duration,media.sourceDuration]);
 const pct=(sec:number)=>100*(sec-startOfView)/Math.max(.001,endOfView-startOfView);
 const soundBars=useMemo(()=>media.peaks.map((amplitude,i)=>(
  <i key={i} className="bybe-wave-bar" style={{
    left:100*i/media.peaks.length+'%',height:Math.max(2,amplitude*84)+'%',
    width:100/media.peaks.length+'%',
  }}/>
 )),[media.peaks]);
 const ocrBlocks=frames.reduce((count,f)=>count+f.blocks.filter(usefulVideoText).length,0);
 const estimated=segments.filter(s=>s.origin==='VISUAL_AUDIO_ESTIMATE').length;
 const issues=[
  ...(capabilities&&(!capabilities.ffmpeg||!capabilities.ffprobe)?['FFmpeg эсвэл FFprobe байхгүй. WAV, waveform, OCR хөдөлгүүр ажиллахгүй.']:[]),
  ...(scan.job?.status==='error'?[scan.job.message.slice(0,165)]:[]),
  ...(scan.job?.status==='complete'&&ocrBlocks===0?['OCR дууссан ч бичвэр 0 байна. «OCR дахин таних» товч дарна уу.']:[]),
  ...(backgroundAsr.job?.status==='error'?[backgroundAsr.job.message.slice(0,165)]:[]),
 ];
 const rows=segments.filter(s=>s.start<part.coreEnd&&s.end>part.coreStart);
 const videoAspect=video.current?.videoWidth&&video.current?.videoHeight?video.current.videoWidth/video.current.videoHeight:16/9;

 return <div className="bybe-workstation">
  <header className="bybe-menu">
   <div className="bybe-logo"><AudioLines size={22}/> <strong>BYBE Studio</strong></div>
   <input ref={filePicker} hidden type="file" accept="video/*,audio/*,.mkv,.mp4,.mp3,.wav,.webm" onChange={e=>openFile(e.target.files?.[0])}/>
   <input ref={importPicker} hidden type="file" accept="application/json,.json" onChange={e=>void importJson(e.target.files?.[0])}/>
   <button onClick={()=>filePicker.current?.click()}><FolderOpen size={17}/> Файл нээх</button>
   <button onClick={exportJson}><Download size={17}/> Бүртгэл экспортлох</button>
   {media.sourceId&&<button onClick={()=>void downloadAppReady()}>Баталгаажсан аудио</button>}
   <button onClick={()=>setToolsOpen(v=>!v)} aria-expanded={toolsOpen} aria-controls="bybe-extra-tools">
    <Settings2 size={17}/> Хэрэгслүүд {toolsOpen?'▲':'▼'}
   </button>
   {file&&<span className="bybe-short-status">{media.sourceId?'Аудио бэлэн':media.working?'Файл бэлтгэж байна '+(media.progress??0)+'%':'Файл нээгдсэн'} · {ocrMode}</span>}
  </header>
  {toolsOpen&&<nav id="bybe-extra-tools" className="bybe-extra-tools" aria-label="Нэмэлт хэрэгслүүд">
   <button onClick={()=>importPicker.current?.click()}><FileVideo size={17}/> JSON бүртгэл оруулах</button>
   <button onClick={()=>void media.upload()} disabled={!file||media.working||!!media.sourceId}>
    <Save size={17}/> {media.sourceId?'Аудио бэлэн':'Локал аудио холбох'}
   </button>
   {media.sourceId&&<button onClick={()=>void media.preparePreview()} disabled={media.working}>
    <FileVideo size={17}/> MKV → MP4 үзэх
   </button>}
   {media.working&&<button onClick={media.cancel}>Импортыг зогсоох</button>}
   <button onClick={()=>void captureFrame()} disabled={!src||busy}><ScanText size={17}/> Кадрын OCR</button>
   {capabilities&&!capabilities.fasterWhisper&&<span className="bybe-asr-install-note">Whisper суулгаагүй: <code>INSTALL_WHISPER_WINDOWS.bat</code> ажиллуулаад серверээ дахин асаана.</span>}
   <button onClick={()=>void backgroundAsr.start()} title={capabilities&&!capabilities.fasterWhisper?'Whisper-ийн Python сан суулгагдаагүй байна':''} disabled={!media.sourceId||backgroundAsr.busy||capabilities?.fasterWhisper===false||!!backgroundAsr.job&&backgroundAsr.job.status!=='error'}>
    <AudioLines size={17}/> Бүх видеоны Whisper
   </button>
   {backgroundAsr.job?.status==='running'&&<button onClick={()=>void backgroundAsr.pause()}>ASR түр зогсоох</button>}
   {backgroundAsr.job?.status==='paused'&&<button onClick={()=>void backgroundAsr.resume()}>ASR үргэлжлүүлэх</button>}
   <button onClick={()=>void transcribePart()} title={capabilities&&!capabilities.fasterWhisper?'INSTALL_WHISPER_WINDOWS.bat хэрэгтэй':''} disabled={!media.sourceId||asrBusy||capabilities?.fasterWhisper===false}>
    <AudioLines size={17}/> {asrBusy?'Whisper ажиллаж байна…':'Энэ хэсгийн яриа таних'}
   </button>
   <button disabled={!media.sourceId||scan.busy||!!scan.job&&scan.job.status!=='error'} onClick={()=>void scan.start()}>
    <ScanText size={17}/> Бүх видеоны OCR
   </button>
   {scan.job?.status==='running'&&<button onClick={()=>void scan.pause()}>OCR түр зогсоох</button>}
   {scan.job?.status==='paused'&&<button onClick={()=>void scan.resume()}>OCR үргэлжлүүлэх</button>}
  </nav>}
  <section className="bybe-statusline" aria-label="Төслийн төлөв">
   <div className="bybe-statusline-main">
    <span className="bybe-status-indicator ready">●</span>
    <strong>{file?'Видео: '+file.name:'Видео нээгээгүй'}</strong>
    <span className="bybe-status-divider">·</span>
    <span>{media.sourceId?'Аудио бэлэн':media.working?'Аудио бэлтгэж байна '+(media.progress??0)+'%':'Аудио хүлээгдэж байна'}</span>
    <span className="bybe-status-divider">·</span>
    <span className={scan.job?.status==='error'?'bybe-status-error':''}>
     {scan.job?.status==='running'?'OCR ажиллаж байна: '+scan.job.nextPart+'/'+scan.job.totalParts:
      scan.job?.status==='complete'?'OCR: '+(scan.job.blocksFound??ocrBlocks)+' бичвэр':
      scan.job?.status==='error'?'OCR алдаа':'OCR хүлээгдэж байна'}
    </span>
    <span className="bybe-status-divider">·</span>
    <span>{segments.length} аудио санал{estimated?' · '+estimated+' урьдчилсан':''}</span>
   </div>
   <div className="bybe-statusline-actions">
    {media.working&&<button onClick={media.cancel}>Импорт зогсоох</button>}
    {scan.job?.status==='running'&&<button onClick={()=>void scan.pause()}>OCR зогсоох</button>}
    {scan.job?.status==='paused'&&<button onClick={()=>void scan.resume()}>OCR үргэлжлүүлэх</button>}
    {file&&media.sourceId&&(scan.job?.status==='complete'||scan.job?.status==='error')&&
     <button className="bybe-rescan" disabled={scan.busy}
      onClick={()=>void scan.rescan()}>↻ OCR дахин таних</button>}
    {backgroundAsr.job?.status==='error'&&<button onClick={()=>void backgroundAsr.resume()}>↻ Whisper дахин оролдох</button>}
    <details className="bybe-diagnostics">
     <summary>Төлөв ба алдаа {issues.length?'('+issues.length+')':''}</summary>
     <div className="bybe-diagnostic-list">
      {capabilities&&(!capabilities.ffmpeg||!capabilities.ffprobe)&&
       <div className="bybe-diagnostic-error">FFmpeg/FFprobe олдсонгүй. Windows PATH-ийг шалга.</div>}
      {scan.job&&<div><strong>OCR:</strong> {scan.job.message}</div>}
      {media.sourceId&&<div><strong>Автомат аудио:</strong> OCR бичвэр + FFmpeg аудионы идэвхтэй үе. 
       {visualAudio.readyParts}/{parts.length} хэсгийн долгион, {estimated} урьдчилсан холбоос. 
       Яг хэлсэн үгийг баталж чадахгүй тул сонсож QA хийнэ.</div>}
      {backgroundAsr.job&&<div><strong>Whisper:</strong> {backgroundAsr.job.message}</div>}
      {media.status&&<div><strong>Аудио:</strong> {media.status}</div>}
      {scan.message&&<div>{scan.message}</div>}
      {backgroundAsr.message&&<div>{backgroundAsr.message}</div>}
      {status&&<div>{status}</div>}
      {media.lastRevision&&media.sourceId&&<a
       href={'/api/media/'+media.sourceId+'/revisions/'+media.lastRevision.id+'/download'} download>
       WAV татах: {media.lastRevision.filename}</a>}
     </div>
    </details>
   </div>
  </section>
  {issues.length>0&&<div className="bybe-alert" role="alert">
   <strong>Шалгах шаардлагатай:</strong> {issues[0]}
   {issues.length>1?' · Бусад '+(issues.length-1)+' асуудлыг «Төлөв ба алдаа» цэсээс үзнэ.':''}
  </div>}
  <main className="bybe-core">
   <section className="bybe-transcript panel">
    <header><h2>Автомат холбосон аудио</h2>
     <div className="bybe-rows-head-actions">
      <span>{rows.length} хэсэг · {reviewCount} шалгах</span>
      {lastDeleted&&<button type="button" title="Ctrl+Z" onClick={undoDelete}><Undo2 size={14}/> Буцаах</button>}
     </div>
    </header>
    <div className="bybe-rows" ref={listRef} onWheel={()=>{manualList.current=true;window.setTimeout(()=>manualList.current=false,3000);}}>
     {rows.length===0&&unlinked.length===0?<div className="bybe-empty">
      <strong>{!file?'Эх видеогоо нээнэ үү.':!media.sourceId?'Видео бэлтгэж байна…':scan.job?.status==='running'?'Текст болон аудионы санал бэлтгэж байна…':'Энэ хэсгийн аудио санал хараахан алга.'}</strong>
      <p>{!file?'Эх видео нээгээд эхний OCR-ийг автоматаар эхлүүлнэ.':
       !media.sourceId?'BYBE эх файлыг локал серверт хуулж, FFmpeg-ээр аудионы долгион бэлтгэнэ.':
       scan.job?.status==='running'?'OCR илрүүлэх + FFmpeg аудионы идэвхтэй хэсгүүдээр автоматаар холбож байна. Зөвхөн шалгахад оролцоно.':
       'Whisper суусан бол яриаг автоматаар танина. Суулаагүй үед OCR + waveform холболт урьдчилсан санал гаргах бөгөөд буруу заагийг засаж болно.'}</p>
     </div>:
      rows.map(s=><div key={s.id} ref={r=>{rowRefs.current[s.id]=r;}} className={'bybe-row '+(activeId===s.id?'is-current ':'')+(selectedId===s.id?'is-selected':'')}>
       <button className="bybe-row-text" onClick={()=>{setSelectedId(s.id);const v=video.current;if(v){v.currentTime=s.start;v.pause();}}} title="Видеог энэ хэсэгт очуулах">
        <span>{s.text}</span><small>{time(s.start)}–{time(s.end)} · {kindNames[s.kind]} · {s.qa==='MANUALLY_VERIFIED'?'✓ QA баталсан':s.origin==='VISUAL_AUDIO_ESTIMATE'?'OCR + долгионы санал · зааг шалгах':s.origin==='LOCAL_ASR'?'Whisper танилт · шалгах':s.matchStatus==='AUTO_SUGGESTED'?'OCR таарсан · шалгах':'QA шалгах'}</small>
       </button>
       <div className="bybe-row-actions">
        <button title="Сонсох" aria-label={s.text+' сонсох'} onClick={()=>play(s,false)}><Play size={15}/></button>
        <button className={loop===s.id?'is-loop':''} title="Тасралтгүй давтах" aria-label={s.text+' давтах'} onClick={()=>loop===s.id?(setLoop(null),video.current?.pause()):play(s,true)}><Repeat2 size={15}/></button>
        <button title="Засах" aria-label={s.text+' засах'} onClick={()=>beginEdit(s)}><Edit3 size={15}/></button>
        <button type="button" className="bybe-delete-row" title="Энэ аудионы мөрийг устгах · Delete (Ctrl+Z буцаах)"
         aria-label={s.text+' аудионы мөр устгах'} onClick={()=>removeSegment(s)}><Trash2 size={15}/></button>
        <button disabled={!media.sourceId||media.working} title="Жинхэнэ WAV шинэ хувилбар хадгалах (QA шалгах шаардлагатай)"
         aria-label={s.text+' WAV үүсгэх'} onClick={()=>void exportClip(s)}><Download size={15}/></button>
       </div>
      </div>)}
     {unlinked.length>0&&<details className="bybe-raw-ocr">
      <summary>Түүхий OCR бичвэр ({unlinked.length}) · Автомат холболтод ороогүй</summary>
      {unlinked.map(b=><div key={b.id} className="bybe-ocr-row">
      <button className="bybe-row-text" onClick={()=>{const v=video.current;if(v){v.pause();v.currentTime=b.frameSec;}toPartAt(b.frameSec);}} title="Энэ бичвэр гарсан кадрт очих">
       <span>{b.text}</span><small>OCR · {roleLabel(effectiveRole(b,styleRules))} · {time(b.frameSec)}</small>
      </button>
      <button title="Хэсэг сонгосны дараа энэ бичвэртэй холбох" onClick={()=>assignBlock(b)}>{selectedRange?'＋':'⧉'}</button>
      <button title="Хэв маягийг ангилах" onClick={()=>{setStyleTarget(b);setStyleRole(effectiveRole(b,styleRules));}}><Settings2 size={14}/></button>
     </div>)}
     </details>}
    </div>
   </section>
   <section className="bybe-preview panel">
    <header><h2>Эх видео · текст сонгох</h2><span>Текст таних: {frame?'кадр бэлэн':'энэ кадрт байхгүй'}</span></header>
    <div className="bybe-video-holder">
     {src?<div className="bybe-video-frame" ref={videoFrameRef} style={{aspectRatio:String(videoAspect)}}>
      <video ref={video} src={media.previewUrl||src} controls playsInline disablePictureInPicture preload="metadata"
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
       {textMode&&<VideoTextRegion video={video} active={textMode}
        initialKind={selected?.kind??'unknown'} onApply={attachRegionText}
        onClose={()=>setTextMode(false)} onStatus={setStatus}/>}
      </div>:<div className="bybe-video-empty"><FileVideo size={34}/> Эх видео сонгоно уу</div>}
    </div>
    <div className="bybe-preview-tools">
     <span>{time(current)} / {time(duration)}</span>
     <button className={textMode?'primary':''} onClick={()=>{if(!textMode)video.current?.pause();setTextMode(v=>!v);}}>
      {textMode?'✕ Сонголт хаах':'T · Бүтэн текст хүрээлэх'}
     </button>
     <button onClick={()=>void captureFrame()} disabled={!src||busy}><ScanText size={15}/> Одоо харагдаж буй кадрыг таних</button>
    </div>
    <p className="bybe-help">T товч → видеоны үг/өгүүлбэрийг хулганаар хүрээлж чирнэ → текст OCR-оор орно → засаж, хуулж эсвэл сонгосон аудиотой холбоно. OCR танихгүй бол шууд бичнэ. Shift + дугуй = видеог урагш/хойш шилжүүлэх.</p>
   </section>
  </main>
  <section className="bybe-timeline panel">
   <header><h2>Аудионы хугацааны шугам</h2>
    <div><button onClick={()=>setZoom(x=>Math.max(1,x/1.6))}>−</button><span> ×{zoom.toFixed(1)}</span>
    <button onClick={()=>setZoom(x=>Math.min(64,x*1.6))}>＋</button></div>
   </header>
   <label className="bybe-source-overview">
    <span>Бүтэн эх файл · {time(current)} / {time(duration)}</span>
    <input type="range" min="0" max={duration||1} step=".1" value={Math.min(current,duration||1)}
      onChange={e=>{
       const t=Number(e.target.value);
       if(video.current){video.current.pause();video.current.currentTime=t;}
       setCurrent(t);setViewAnchor(t);toPartAt(t);
      }}/>
    <span>Файлын аль ч хугацаанд очих</span>
   </label>
   <div className="bybe-partnav">
    <button disabled={partIndex===0} onClick={()=>{setPartIndex(x=>x-1);if(video.current)video.current.currentTime=parts[partIndex-1]?.coreStart??0;}}><ChevronLeft size={16}/></button>
    <span>Хэсэг {partIndex+1}/{parts.length||1} · {time(part.coreStart)}–{time(part.coreEnd)} · Эх файл өөрчлөгдөхгүй</span>
    <button disabled={partIndex>=parts.length-1} onClick={()=>{setPartIndex(x=>x+1);if(video.current)video.current.currentTime=parts[partIndex+1]?.coreStart??0;}}><ChevronRight size={16}/></button>
   </div>
   <div className="bybe-track" ref={pointerBox}
    onPointerDown={beginDrag} onPointerMove={drag} onPointerUp={endDrag}>
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
    <span>{selectedRange?'Сонгосон: '+time(selectedRange.start)+' – '+time(selectedRange.end)+' · T → текст дээр товших':'Дугуй = томруулах · Shift+дугуй / Shift+чирэх = шилжих · чирэх = таслах'}</span>
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
    <ClipWaveEditor sourceId={media.sourceId} sourceDuration={duration} text={editDraft.text}
     originalStart={editing.start} originalEnd={editing.end}
     start={Number(editDraft.start)} end={Number(editDraft.end)}
     onChange={(start,end)=>setEditDraft(d=>({...d,start:start.toFixed(3),end:end.toFixed(3)}))}/>
    <div className="bybe-edit-fields">
     <label>Бичвэр<input value={editDraft.text} onChange={e=>setEditDraft(v=>({...v,text:e.target.value}))}/></label>
     <label>Төрөл<select value={editDraft.kind} onChange={e=>setEditDraft(v=>({...v,kind:e.target.value as ClipKind}))}>{KINDS.map(k=><option key={k} value={k}>{kindNames[k]}</option>)}</select></label>
     <label>Эхлэл (сек)<input type="number" step=".001" value={editDraft.start} onChange={e=>setEditDraft(v=>({...v,start:e.target.value}))}/></label>
     <label>Төгсгөл (сек)<input type="number" step=".001" value={editDraft.end} onChange={e=>setEditDraft(v=>({...v,end:e.target.value}))}/></label>
    </div>
    {editing.revisionId&&media.sourceId&&<div className="bybe-export-qa">
     <h3>WAV хүний QA шалгалт</h3>
     <audio controls preload="none" src={'/api/media/'+media.sourceId+'/revisions/'+editing.revisionId+'/stream'}/>
     <div className="bybe-qa-grid">{(Object.keys(qaItems) as QAKey[]).map(key=>
      <label key={key}><input type="checkbox" checked={qaChecks[key]}
       onChange={e=>setQaChecks(old=>({...old,[key]:e.target.checked}))}/>{qaItems[key]}</label>)}</div>
     <button className="primary" disabled={!Object.values(qaChecks).every(Boolean)} onClick={()=>void verifyEditing()}>
      ✓ 6 шалгалтаар батлах</button>
    </div>}
    <div className="bybe-actions"><button className="primary" onClick={saveEdit}><Save size={16}/> Засвар хадгалах</button></div>
    <p className="bybe-help">Хугацаа/текст засахад QA баталгаа хүчингүй болно. Esc — хаах.</p>
   </section>
  </div>}
 </div>;
}
