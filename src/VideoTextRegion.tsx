import { useRef, useState } from 'react';
import type { PointerEvent as RP } from 'react';
type Box={x:number;y:number;w:number;h:number};
type Result={text:string;kind:string;frameSec:number};
interface Props{
 video:React.RefObject<HTMLVideoElement|null>;
 active:boolean;
 initialKind:string;
 onApply:(data:Result)=>void;
 onClose:()=>void;
 onStatus:(s:string)=>void;
}
const clamp=(n:number)=>Math.min(1,Math.max(0,n));
export default function VideoTextRegion({video,active,initialKind,onApply,onClose,onStatus}:Props){
 const boxRef=useRef<HTMLDivElement|null>(null);
 const pointer=useRef<{x:number;y:number}|null>(null);
 const [box,setBox]=useState<Box|null>(null);
 const [text,setText]=useState('');
 const [kind,setKind]=useState(initialKind);
 const [reading,setReading]=useState(false);
 const [frameSec,setFrameSec]=useState(0);
 const [error,setError]=useState('');
 function position(e:RP<HTMLDivElement>){
  const rect=boxRef.current?.getBoundingClientRect();
  if(!rect)return{x:0,y:0};
  return{x:clamp((e.clientX-rect.left)/rect.width),y:clamp((e.clientY-rect.top)/rect.height)};
 }
 function onDown(e:RP<HTMLDivElement>){
  if(e.button!==0)return;
  const p=position(e);pointer.current=p;setBox({x:p.x,y:p.y,w:0,h:0});
  e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();
 }
 function onMove(e:RP<HTMLDivElement>){
  if(!pointer.current)return;
  const p=position(e),a=pointer.current;
  setBox({x:Math.min(a.x,p.x),y:Math.min(a.y,p.y),w:Math.abs(a.x-p.x),h:Math.abs(a.y-p.y)});
 }
 async function onUp(e:RP<HTMLDivElement>){
  if(!pointer.current)return;
  const a=pointer.current,p=position(e);pointer.current=null;
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  const rect={x:Math.min(a.x,p.x),y:Math.min(a.y,p.y),w:Math.abs(a.x-p.x),h:Math.abs(a.y-p.y)};
  if(rect.w<.02||rect.h<.02){setError('Үг эсвэл өгүүлбэрийн бүх хэсгийг хулганаар хүрээлж чирнэ үү.');setBox(null);return;}
  setBox(rect);
  const v=video.current;
  if(!v||!v.videoWidth){setError('Видео кадр бэлэн биш. Текстийг гараар бичиж болно.');return;}
  const timestamp=v.currentTime;setFrameSec(timestamp);setReading(true);setText('');setError('');
  try{
   // Crop user-defined rectangle rather than OCR-ing a full noisy presenter frame.
   const vw=v.videoWidth,vh=v.videoHeight;
   const x=Math.floor(rect.x*vw),y=Math.floor(rect.y*vh);
   const w=Math.max(1,Math.min(vw-x,Math.ceil(rect.w*vw))),h=Math.max(1,Math.min(vh-y,Math.ceil(rect.h*vh)));
   const scale=Math.min(3,Math.max(1,100/Math.max(16,h)));
   const canvas=document.createElement('canvas');
   canvas.width=Math.min(2300,Math.round(w*scale));
   canvas.height=Math.min(1500,Math.round(h*scale));
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas ажилласангүй');
   ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(v,x,y,w,h,0,0,canvas.width,canvas.height);
   const response=await fetch('/api/ocr-layout',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      imageBase64:canvas.toDataURL('image/jpeg',.95).split(',')[1],
      mimeType:'image/jpeg',frameSec:timestamp,imageWidth:canvas.width,imageHeight:canvas.height
    })
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||'OCR боловсруулах алдаа');
   const lines=Array.isArray(data.blocks)?data.blocks.filter((b:any)=>typeof b.text==='string')
     .sort((a:any,b:any)=>(a.box?.y??0)-(b.box?.y??0)):[] as any[];
   const found=lines.map((b:any)=>b.text.trim()).filter(Boolean).join(' ').normalize('NFC');
   setText(found);
   if(!found)setError('Энэ хэсгийн бичвэр танигдсангүй. Доорх талбарт гараар бичээд холбоно.');
   else onStatus('Сонгосон хүрээнээс '+found.length+' тэмдэгт танилаа. Хуулж эсвэл аудиотой холбоно.');
  }catch(e){setError((e instanceof Error?e.message:'OCR алдаа')+' — текстийг гараар бичиж болно.');}
  finally{setReading(false);}
 }
 async function copy(){
  if(!text.trim())return;
  try{await navigator.clipboard.writeText(text.trim());onStatus('Текст хууллаа: '+text.trim());}
  catch{onStatus('Хуулахыг браузер хориглолоо. Текстийг талбараас Ctrl+C дарж хуулж болно.');}
 }
 if(!active)return null;
 return <>
  <div ref={boxRef} className="bybe-region-layer"
    onPointerDown={onDown} onPointerMove={onMove} onPointerUp={e=>void onUp(e)}
    onPointerCancel={()=>{pointer.current=null;}} title="Үг, бүтэн өгүүлбэрийг хулганаар хүрээлж чирнэ үү">
   {box&&<div className="bybe-region-selection" style={{left:box.x*100+'%',top:box.y*100+'%',width:box.w*100+'%',height:box.h*100+'%'}}/>}
  </div>
  <div className="bybe-region-text-panel">
   <div className="bybe-region-panel-top"><strong>Кадраас текст сонгох</strong>
    <span>{reading?'OCR таньж байна…':'Үг эсвэл өгүүлбэрийг хүрээлж чирнэ'}</span>
    <button type="button" onClick={onClose}>✕ Хаах</button></div>
   <textarea aria-label="OCR эсвэл гараар бичсэн текст" value={text}
     onChange={e=>setText(e.target.value)} rows={2}
     placeholder="OCR таньсан өгүүлбэр энд гарна. Танихгүй бол өөрөө бичиж болно."/>
   <div className="bybe-region-panel-actions">
    <select aria-label="Текстийн төрөл" value={kind} onChange={e=>setKind(e.target.value)}>
     <option value="unknown">Төрөл тодорхойгүй</option>
     <option value="word_normal">Чех үг</option>
     <option value="sentence_normal">Чех өгүүлбэр</option>
     <option value="english_word">Англи үг</option>
     <option value="english_sentence">Англи өгүүлбэр</option>
     <option value="word_slow">Чех үг удаан</option>
     <option value="sentence_slow">Чех өгүүлбэр удаан</option>
    </select>
    <button type="button" disabled={!text.trim()} onClick={()=>void copy()}>⧉ Текст хуулах</button>
    <button type="button" className="primary" disabled={!text.trim()||reading}
      onClick={()=>onApply({text:text.trim(),kind,frameSec:frameSec||video.current?.currentTime||0})}>
      ✓ Сонгосон аудиотой холбох
    </button>
   </div>
   {error&&<p className="bybe-region-warning" role="status">{error}</p>}
   <small>Автомат OCR алдаатай байж болно. Бичвэрийг засаж, сонгосон аудионы мөртэй холбох боломжтой.</small>
  </div>
 </>;
}
