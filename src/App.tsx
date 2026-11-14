import { useEffect, useRef, useState } from 'react';
import { Activity, AudioLines, CheckCircle2, ClipboardCheck, Download, FileVideo2, Mic2, Play, ScanText, ShieldCheck, Upload, WandSparkles } from 'lucide-react';
import { mn as t } from './i18n/mn';
import { allChecks, clipFilename, emptyChecks, isClipRecord, QA_KEYS, ROLES, validRange, type ClipRecord, type ClipRole, type QAFlags } from './lib/clipRules';

type Tab = 'dashboard' | 'media' | 'clips' | 'qa' | 'export' | 'live';
interface FormData {
  wordNo: string; sourcePart: string; czechWord: string; czechSentence: string;
  englishWord: string; englishSentence: string; role: ClipRole; start: string; end: string;
}
interface OcrResult { czechWord?: string; czechSentence?: string; englishWord?: string; englishSentence?: string; note?: string; }
const initialForm: FormData = { wordNo: '95', sourcePart: '004', czechWord: '', czechSentence: '', englishWord: '', englishSentence: '', role: 'word_normal', start: '0', end: '1' };
const STORE = 'bybe-studio-mn-clips-v1';
const tabs: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
  { id: 'dashboard', label: t.dashboard, icon: Activity },
  { id: 'media', label: t.media, icon: FileVideo2 },
  { id: 'clips', label: t.clips, icon: AudioLines },
  { id: 'qa', label: t.qa, icon: ClipboardCheck },
  { id: 'export', label: t.export, icon: Download },
  { id: 'live', label: t.liveVoice, icon: Mic2 },
];
const qaLabels: Record<keyof QAFlags, string> = {
  start_heard:t.startHeard, end_heard:t.endHeard, whole_heard:t.wholeHeard,
  language_correct:t.languageCorrect, text_correct:t.textCorrect, role_correct:t.roleCorrect,
};
const roleLabels: Record<ClipRole, string> = {
  word_normal:t.wordNormal, word_slow:t.wordSlow, sentence_normal:t.sentenceNormal, sentence_slow:t.sentenceSlow,
};
function round(v:number):number { return Math.round(v * 1000) / 1000; }
function readStored(): ClipRecord[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || '[]');
    return Array.isArray(raw) ? raw.filter(isClipRecord) : [];
  } catch { return []; }
}
function fmt(v:number):string { return Number.isFinite(v) ? v.toFixed(3) + ' сек' : '—'; }

export default function App() {
  const [tab,setTab] = useState<Tab>('dashboard');
  const [clips,setClips] = useState<ClipRecord[]>(readStored);
  const [selected,setSelected] = useState<string | null>(null);
  const [form,setForm] = useState<FormData>(initialForm);
  const [checks,setChecks] = useState<QAFlags>(emptyChecks);
  const [videoName,setVideoName] = useState('');
  const [videoUrl,setVideoUrl] = useState('');
  const [duration,setDuration] = useState<number>();
  const [currentTime,setCurrentTime] = useState(0);
  const [ocr,setOcr] = useState<OcrResult | null>(null);
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const [health,setHealth] = useState<'unknown'|'ready'|'missing'>('unknown');
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackEnd = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const item = clips.find(c => c.id === selected);
  const verifiedCount = clips.filter(c => c.status === 'MANUALLY_VERIFIED').length;

  useEffect(() => { localStorage.setItem(STORE, JSON.stringify(clips)); }, [clips]);
  useEffect(() => {
    fetch('/api/health').then(r=>r.json()).then(r=>setHealth(r.hasApiKey ? 'ready' : 'missing')).catch(()=>setHealth('missing'));
  },[]);
  useEffect(() => () => { if(videoUrl) URL.revokeObjectURL(videoUrl); },[videoUrl]);

  function changeFile(file?:File) {
    if(!file) return;
    if (!file.type.startsWith('video/') && !file.type.startsWith('audio/') && !/\.(mkv|mp4|mov|m4a|mp3|wav|webm)$/i.test(file.name)) {
      setMessage('Аудио эсвэл видео файл сонгоно уу.'); return;
    }
    setVideoUrl(URL.createObjectURL(file)); setVideoName(file.name);
    setDuration(undefined); setCurrentTime(0); setOcr(null);
    setMessage('Эх файлыг нээлээ. Текст болон хугацааг тусад нь баталгаажуулна.');
    setTab('media');
  }
  function setValue<K extends keyof FormData>(key:K,value:FormData[K]) { setForm(prev=>({...prev,[key]:value})); }
  function selectClip(c:ClipRecord) {
    setSelected(c.id);
    setForm({wordNo:String(c.wordNo), sourcePart:c.sourcePart, czechWord:c.czechWord, czechSentence:c.czechSentence,
      englishWord:c.englishWord || '', englishSentence:c.englishSentence || '', role:c.role,
      start:String(c.start),end:String(c.end)});
    setChecks({...c.checks}); setMessage('');
  }
  function newClip() { setSelected(null); setForm(initialForm); setChecks(emptyChecks()); setMessage(''); }
  function saveCandidate() {
    const start=Number(form.start),end=Number(form.end),wordNo=Number(form.wordNo);
    if (!validRange(start,end,duration) || !Number.isInteger(wordNo) || wordNo <= 0) {
      setMessage(t.validRange); return;
    }
    if (!form.czechWord.trim() || (form.role.startsWith('sentence') && !form.czechSentence.trim())) {
      setMessage('Чех үг, өгүүлбэрийн үндсэн текстийг бөглөнө үү.');return;
    }
    const now = new Date().toISOString();
    const next:ClipRecord={id:selected || crypto.randomUUID(),sourcePart:form.sourcePart.trim() || 'unknown',
      wordNo,czechWord:form.czechWord.trim(),czechSentence:form.czechSentence.trim(),
      englishWord:form.englishWord.trim(),englishSentence:form.englishSentence.trim(),role:form.role,
      start:round(start),end:round(end),checks:emptyChecks(),status:'REVIEW_REQUIRED',updatedAt:now};
    setClips(old=>selected ? old.map(c=>c.id===selected?next:c) : [...old,next]);
    setSelected(next.id);setChecks(emptyChecks());setMessage('Хадгаллаа. Өмнөх QA баталгаа хүчингүй болсон.');
  }
  function verify() {
    if(!selected || !allChecks(checks)){setMessage('Зургаан шалгалтыг бүгдийг батална уу.');return;}
    setClips(old=>old.map(c=>c.id===selected?{...c,checks:{...checks},status:'MANUALLY_VERIFIED',updatedAt:new Date().toISOString()}:c));
    setMessage(t.manuallyVerified);
  }
  function playRange() {
    const video=videoRef.current; if(!video || !item){setMessage('Эх видео файлаа сонгоно уу.');return;}
    playbackEnd.current=item.end; video.currentTime=item.start;
    void video.play().catch(()=>setMessage('Видео тоглуулах боломжгүй байна. Файлын форматыг шалгана уу.'));
  }
  function onTick() {
    const v=videoRef.current; if(!v)return;
    setCurrentTime(v.currentTime);
    if(playbackEnd.current!==null && v.currentTime>=playbackEnd.current) {
      v.pause();playbackEnd.current=null;
    }
  }
  async function analyzeFrame() {
    const v=videoRef.current;
    if(!v || !v.videoWidth){setMessage('Дүрстэй видео файл нээнэ үү.');return;}
    const canvas=document.createElement('canvas');
    canvas.width=Math.min(1280,v.videoWidth);canvas.height=Math.round(v.videoHeight*canvas.width/v.videoWidth);
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.drawImage(v,0,0,canvas.width,canvas.height);
    setBusy(true);setMessage('Кадрын бичвэрийг шинжилж байна…');
    try {
      const base64=canvas.toDataURL('image/jpeg',0.88).split(',')[1];
      const resp=await fetch('/api/ocr-frame',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({imageBase64:base64,mimeType:'image/jpeg',timestampSec:v.currentTime})});
      const data=await resp.json();
      if(!resp.ok)throw Error(data.error || t.ocrError);
      setOcr(data);setMessage('Текстийн санал гарлаа. Дэлгэцийн эх бичвэртэй тулгаж шалгана уу.');
    } catch(err) { setMessage(err instanceof Error?err.message:t.ocrError); }
    finally{setBusy(false);}
  }
  function applyOcr() {
    if(!ocr)return;
    setForm(prev=>({...prev,czechWord:ocr.czechWord || prev.czechWord,
      czechSentence:ocr.czechSentence || prev.czechSentence,
      englishWord:ocr.englishWord || prev.englishWord,englishSentence:ocr.englishSentence || prev.englishSentence}));
    setTab('clips');setMessage('OCR-ийн санал редакторт орлоо. Текстийг заавал шалгаарай.');
  }
  function exportJson() {
    const payload={schema:'bybe-studio-qa-v1',language:'mn',sourceFilename:videoName || null,
      exportedAt:new Date().toISOString(),clips:clips.map(c=>({...c,filename:clipFilename(c)}))};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='BYBE_CZECH800_QA.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  async function importJson(file?:File) {
    if(!file)return;
    try {
      const parsed=JSON.parse(await file.text());const records=parsed?.clips;
      if(!Array.isArray(records)||!records.every(isClipRecord))throw Error(t.importError);
      setClips(records);newClip();setMessage(records.length+' аудионы бүртгэл орууллаа. Эх видео тусдаа файл.');
      setTab('clips');
    } catch(err){setMessage(err instanceof Error?err.message:t.importError);}
  }

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><AudioLines size={23}/></span><div><strong>{t.appName}</strong><small>{t.appSubtitle}</small></div></div>
      <div className="side-heading">{t.project}</div>
      <nav aria-label="Үндсэн цэс">
        {tabs.map(({id,label,icon:Icon})=><button key={id} className={'nav-item '+(tab===id?'active':'')}
           onClick={()=>setTab(id)}><Icon size={18}/><span>{label}</span>{id==='live'&&<span className="future-dot">●</span>}</button>)}
      </nav>
      <div className="sidebar-bottom"><ShieldCheck size={17}/><span>Эх видео болон QA бүртгэлд хамгаалалттай хандана.</span></div>
    </aside>
    <div className="main">
      <header className="topbar">
        <div><span className="eyebrow">ЧЕХ 800 / АЖЛЫН ОРЧИН</span><h1>{tabs.find(x=>x.id===tab)?.label}</h1></div>
        <div className="top-actions"><span className={'health '+(health==='ready'?'ok':'')}>{health==='ready'?'Gemini API: бэлэн':'Gemini API: түлхүүр шалгах'}</span><span className="locale">MN · Монгол</span></div>
      </header>
      {message&&<div className="notice" role="status">{message}<button onClick={()=>setMessage('')}>×</button></div>}
      {tab==='dashboard'&&<div className="dashboard">
        <div className="hero"><span className="eyebrow">АЖЛЫН ҮНДСЭН ЗАРЧИМ</span><h2>Эх видео → Чех текст → Аудионы зааг → Хүний QA</h2>
          <p>AI-ийн санал бол зөвхөн эхний хувилбар. Бодит агуулга, эхлэл, төгсгөлийг сонсож баталсны дараа л баталгаажсан төлөвт шилжинэ.</p>
          <button className="primary" onClick={()=>setTab('media')}><Upload size={17}/>{t.chooseVideo}</button>
        </div>
        <div className="metrics"><div className="metric"><span>{t.clipsCount}</span><strong>{clips.length}</strong></div>
          <div className="metric"><span>{t.pendingCount}</span><strong>{clips.length-verifiedCount}</strong></div>
          <div className="metric"><span>{t.verifiedCount}</span><strong>{verifiedCount}</strong></div></div>
        <div className="panel"><h3>Боловсруулалтын дөрвөн шат</h3><div className="steps">{['1. Дэлгэцийн Чех бичвэр','2. Аудионы эхлэл, төгсгөл','3. Хувилбар ба файл','4. 6 шалгалтаар батлах'].map(x=><div key={x}>{x}</div>)}</div></div>
        <div className="warning">Энэ хувилбар нь Монгол хэлтэй ажлын орчны суурь. Бүх бичлэгийн автомат танилт болон бодит WAV таслагч бүрэн холбогдоогүй.</div>
      </div>}
      {(tab==='media'||tab==='clips'||tab==='qa')&&<div className="video-panel panel">
        <div className="section-head"><div><h3>{t.media}</h3><p>{videoName || t.noVideo}</p></div>
          <button className="secondary" onClick={()=>fileInputRef.current?.click()}><Upload size={16}/>{t.chooseVideo}</button>
          <input hidden type="file" accept="video/*,audio/*,.mkv,.mp4,.mov,.m4a,.mp3,.wav,.webm" ref={fileInputRef}
            onChange={e=>changeFile(e.target.files?.[0])}/></div>
        {videoUrl?<video ref={videoRef} src={videoUrl} controls playsInline preload="metadata"
          onLoadedMetadata={e=>{const v=e.currentTarget;setDuration(Number.isFinite(v.duration)?v.duration:undefined);}}
          onTimeUpdate={onTick} onEnded={()=>{playbackEnd.current=null;}} onError={()=>setMessage("Хөтөч энэ файлын видео/аудио кодекийг уншиж чадсангүй. MKV файлыг FFmpeg ашиглан хөрвүүлэх шаардлагатай байж болно.")}/>:<div className="empty-video"><FileVideo2 size={38}/>{t.noVideo}</div>}
        <div className="media-info"><span>{t.currentTime}: {fmt(currentTime)}</span><span>{t.fileDuration}: {fmt(duration ?? NaN)}</span></div>
      </div>}
      {tab==='media'&&<div className="two-col">
        <div className="panel"><div className="section-head"><h3>OCR — дэлгэцийн бичвэр</h3><ScanText size={21}/></div>
          <p className="help">Видеог тухайн үг харагдаж буй мөчид зогсоогоод кадрын текстийг танина.</p>
          <button className="primary" onClick={analyzeFrame} disabled={!videoUrl||busy}><WandSparkles size={17}/>{busy?t.progress:t.captureFrame}</button>
          <p className="help">{t.videoNote}</p>
        </div>
        <div className="panel"><h3>Текстийн санал</h3>{ocr?
          <><dl className="ocr-result"><dt>{t.detectedWord}</dt><dd>{ocr.czechWord||'—'}</dd>
            <dt>{t.detectedSentence}</dt><dd>{ocr.czechSentence||'—'}</dd>
            <dt>{t.englishWord}</dt><dd>{ocr.englishWord||'—'}</dd>
            <dt>{t.englishSentence}</dt><dd>{ocr.englishSentence||'—'}</dd></dl>
            <div className="warning">{t.analyzeWarning}</div>
            <button className="secondary" onClick={applyOcr}>Редакторт шилжүүлэх</button></>
          :<p className="help">Кадрын шинжилгээ хийгдээгүй байна.</p>}</div>
      </div>}
      {tab==='clips'&&<div className="workspace">
        <div className="panel clip-list"><div className="section-head"><h3>{t.clips}</h3><button className="secondary" onClick={newClip}>+ {t.addCandidate}</button></div>
          {clips.length===0?<p className="help">{t.noCandidates}</p>:clips.map(c=>
            <button key={c.id} className={'clip-row '+(c.id===selected?'selected':'')} onClick={()=>selectClip(c)}>
              <div><b>№{c.wordNo} · {c.role.startsWith('sentence')?c.czechSentence:c.czechWord}</b><small>{roleLabels[c.role]} · {fmt(c.start)} – {fmt(c.end)}</small></div>
              <span className={'state '+(c.status==='MANUALLY_VERIFIED'?'good':'')}>{c.status==='MANUALLY_VERIFIED'?'✓ QA':'QA?'}</span>
            </button>)}
        </div>
        <div className="panel editor"><h3>Аудионы заагийн редактор</h3>
          <div className="form-grid">
            <label>{t.wordNo}<input type="number" min="1" value={form.wordNo} onChange={e=>setValue('wordNo',e.target.value)}/></label>
            <label>{t.part}<input value={form.sourcePart} onChange={e=>setValue('sourcePart',e.target.value)}/></label>
            <label>{t.detectedWord}<input value={form.czechWord} onChange={e=>setValue('czechWord',e.target.value)}/></label>
            <label>{t.englishWord}<input value={form.englishWord} onChange={e=>setValue('englishWord',e.target.value)}/></label>
            <label className="wide">{t.detectedSentence}<textarea rows={2} value={form.czechSentence} onChange={e=>setValue('czechSentence',e.target.value)}/></label>
            <label className="wide">{t.englishSentence}<textarea rows={2} value={form.englishSentence} onChange={e=>setValue('englishSentence',e.target.value)}/></label>
            <label className="wide">{t.clipKind}<select value={form.role} onChange={e=>setValue('role',e.target.value as ClipRole)}>
              {ROLES.map(role=><option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
            <label>{t.start}<input type="number" min="0" step="0.001" value={form.start} onChange={e=>setValue('start',e.target.value)}/></label>
            <label>{t.end}<input type="number" min="0" step="0.001" value={form.end} onChange={e=>setValue('end',e.target.value)}/></label>
          </div>
          <div className="actions"><button className="primary" onClick={saveCandidate}>{t.saveCandidate}</button>
            <button className="secondary" disabled={!item || !videoUrl} onClick={playRange}><Play size={17}/>{t.playSelection}</button></div>
          <p className="help">{t.resetWarning}</p>
          <p className="help">{t.safetyNotice}</p>
        </div>
      </div>}
      {tab==='qa'&&<div className="two-col"><div className="panel"><h3>Аудионы сонголт</h3>
        {clips.length===0?<p className="help">{t.noCandidates}</p>:clips.map(c=>
          <button key={c.id} className={'clip-row '+(c.id===selected?'selected':'')} onClick={()=>selectClip(c)}>
            <b>№{c.wordNo} · {c.role.startsWith('sentence')?c.czechSentence:c.czechWord}</b>
            <small>{roleLabels[c.role]}</small></button>)}</div>
        <div className="panel"><h3>{t.qa}</h3>{!item?<p className="help">{t.pickClip}</p>:<>
          <div className="qa-title"><strong>{clipFilename(item)}</strong><span className={'state '+(item.status==='MANUALLY_VERIFIED'?'good':'')}>
            {item.status==='MANUALLY_VERIFIED'?t.manuallyVerified:t.needsReview}</span></div>
          <button className="secondary" disabled={!videoUrl} onClick={playRange}><Play size={17}/>{t.playSelection}</button>
          <div className="checks">{QA_KEYS.map(k=><label key={k}><input type="checkbox" checked={checks[k]}
            onChange={e=>setChecks(old=>({...old,[k]:e.target.checked}))}/>{qaLabels[k]}</label>)}</div>
          <button className="primary" onClick={verify} disabled={!allChecks(checks)}><CheckCircle2 size={17}/>{t.verify}</button>
          <p className="help">{t.resetWarning}</p></>}</div></div>}
      {tab==='export'&&<div className="two-col">
        <div className="panel"><h3>{t.export}</h3><p>{t.exportNote}</p>
          <button className="primary" onClick={exportJson}><Download size={17}/>{t.exportJson}</button>
          <button className="secondary space" onClick={()=>importRef.current?.click()}><Upload size={17}/>{t.importJson}</button>
          <input ref={importRef} hidden type="file" accept=".json,application/json" onChange={e=>importJson(e.target.files?.[0])}/>
          <p className="help">{t.sourceNotSaved}</p></div>
        <div className="panel"><h3>Дараагийн холболтууд</h3><p>{t.batchNote}</p>
          <p>WAV болон эх видеог GitHub-д байршуулахгүй. Google AI Studio-д кодыг GitHub Pull ашиглан синхрончилно.</p>
          <div className="warning">{t.safetyNotice}</div></div></div>}
      {tab==='live'&&<div className="panel"><h3>{t.liveVoice} <span className="state">{t.future}</span></h3>
        <p>{t.liveVoiceNote}</p><p className="help">Үндсэн аудио QA ажлыг хүндрүүлэхгүйгээр тусдаа модуль болгон хадгална.</p></div>}
      <footer>BYBE Studio · Монгол интерфэйс · Source ≠ AI proposal ≠ Human QA</footer>
    </div>
  </div>;
}
