import { usefulVideoText, type FrameResult, type OcrBlock } from './typography';

export interface AudioSuggestion {
 text:string;start:number;end:number;frameSec:number;ocrId:string;kind:
 'word_normal'|'word_slow'|'sentence_normal'|'sentence_slow'|'english_word'|'english_sentence'|'unknown';
 method:'VISUAL_AUDIO_ESTIMATE';
}
/** Only title-like upper-left items can anchor a slide; skip watermark, counters and tiny OCR noise. */
export function looksLikeTitle(b:OcrBlock):boolean{
 const s=b.text.normalize('NFC').trim();
 const topLeft=b.box.x>=.015&&b.box.x<.52&&b.box.y>=.04&&b.box.y<.42&&b.box.h>=.025;
 const centeredLarge=b.box.x>=.23&&b.box.x<.78&&b.box.y>=.34&&b.box.y<.70&&b.box.h>=.046;
 return usefulVideoText(b)&&(topLeft||centeredLarge)&&b.box.h<.17
  &&s.length>=3&&s.length<=34&&s.split(/\s+/).length<=2
  &&!/[\d@/:]/.test(s)&&/^[\p{L}\p{M}'\- ]+$/u.test(s);
}
interface Slide {word:OcrBlock;english?:OcrBlock;sentence?:OcrBlock;englishSentence?:OcrBlock;start:number}
function captureOtherText(slide:Slide,frame:FrameResult){
 for(const b of frame.blocks){
  if(b.id===slide.word.id||/[\d@]/.test(b.text)||/class|www|https?:/i.test(b.text))continue;
  const words=b.text.trim().split(/\s+/).length;
  // Supports both upper-left vocabulary overlays and centered full-screen word slides.
  if(b.box.x<.84 && b.box.y>slide.word.box.y && b.box.y<Math.min(.78,slide.word.box.y+.28)
      &&b.box.h>=.025 && words<=2 &&
    (!slide.english||b.box.y<slide.english.box.y))slide.english=b;
  if(b.box.y>.57&&words>=2){
   if(!slide.sentence||b.box.y<slide.sentence.box.y)slide.sentence=b;
   if(b.box.y>.74&&(!slide.englishSentence||b.box.y>slide.englishSentence.box.y))slide.englishSentence=b;
  }
 }
}
export function discoverSlides(frames:FrameResult[],start:number,end:number):Slide[]{
 const slides:Slide[]=[];
 for(const frame of frames.filter(f=>f.frameSec>=start-.5&&f.frameSec<end).sort((a,b)=>a.frameSec-b.frameSec)){
  const title=frame.blocks.filter(looksLikeTitle).sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x)[0];
  if(!title)continue;
  const last=slides[slides.length-1];
  const text=title.text.trim().toLocaleLowerCase('cs');
  if(last&&last.word.text.trim().toLocaleLowerCase('cs')===text&&frame.frameSec-last.start<90){
   captureOtherText(last,frame);continue;
  }
  // A noisy single OCR frame near a slide boundary can be wrong; keep proposals
  // clearly labeled as estimates, never manual QA.
  const slide:Slide={word:title,start:frame.frameSec};
  captureOtherText(slide,frame);
  slides.push(slide);
 }
 return slides;
}
interface Island {start:number;end:number}
/** Estimate speech-sized intervals from RMS waveform. Energy is not ASR/VAD. */
export function energyIslands(peaks:number[],start:number,end:number):Island[]{
 if(peaks.length<24||end<=start)return[];
 const ordered=peaks.filter(Number.isFinite).sort((a,b)=>a-b);
 const q=(p:number)=>ordered[Math.min(ordered.length-1,Math.floor((ordered.length-1)*p))]||0;
 const floor=q(.1),mid=q(.5),high=q(.9);
 if(high<.025 || high-floor<.075)return[];
 const threshold=Math.max(.04,Math.min(.42,floor+.27*(high-floor),mid*.82));
 const dt=(end-start)/peaks.length;
 const active=peaks.map(x=>Number.isFinite(x)&&x>=threshold);
 // Bridge at most ~300 ms of pauses between phonemes, not several-second silences.
 const maxGap=Math.max(0,Math.floor(.30/dt));
 for(let i=0;i<active.length;){
  if(!active[i]){i++;continue;}
  let next=i+1;
  while(next<active.length&&active[next])next++;
  let j=next;while(j<active.length&&!active[j]&&j-next<=maxGap)j++;
  if(j<active.length&&active[j]&&j-next<=maxGap){for(let k=next;k<j;k++)active[k]=true;}
  i=Math.max(next,j);
 }
 const out:Island[]=[];let at=-1;
 for(let i=0;i<=active.length;i++){
  if(i<active.length&&active[i]){if(at===-1)at=i;continue;}
  if(at!==-1){
   const a=Math.max(start,start+(at*dt)-.09),b=Math.min(end,start+i*dt+.13);
   if(b-a>=.42&&b-a<=11.5)out.push({start:a,end:b});
   at=-1;
  }
 }
 return out;
}
const n3=(n:number)=>Math.round(n*1000)/1000;
/**
 * FIRST PASS ONLY: show OCR text bound to likely speech bursts by slide timing.
 * Without ASR, neither the words being spoken nor their start/end are verified.
 */
export function proposeVisualAudio(frames:FrameResult[],peaks:number[],start:number,end:number):AudioSuggestion[]{
 const slides=discoverSlides(frames,start,end);
 if(!slides.length)return[];
 const utterances=energyIslands(peaks,start,end);
 const proposals:AudioSuggestion[]=[];
 for(let i=0;i<slides.length;i++){
  const slide=slides[i],next=slides[i+1];
  // One screen can remain visible for 20+ s; never assume a precise audio timestamp.
  const windowStart=Math.max(start,slide.start-1.5);
  const windowEnd=Math.min(end,next?.start??slide.start+45,slide.start+50);
  if(windowEnd-windowStart<.5)continue;
  const candidates=utterances.filter(v=>v.end>windowStart&&v.start<windowEnd)
   .filter(v=>v.start>=slide.start-2.0).slice(0,6);
  if(!candidates.length)continue;
  // The position labels are a template guess for common bilingual vocabulary videos,
  // NOT an AI transcript: unknown audio type remains unknown pending listening.
  const word=slide.word;
  for(let j=0;j<candidates.length;j++){
   const voice=candidates[j];
   const visual=(j===2?slide.english:
    j===3||j===5?slide.sentence:
    j===4?slide.englishSentence:undefined)||word;
   const a=n3(Math.max(start,voice.start)),b=n3(Math.min(end,voice.end));
   if(b-a<.25)continue;
   proposals.push({text:visual.text,start:a,end:b,frameSec:visual.frameSec,
    ocrId:visual.id,kind:'unknown',method:'VISUAL_AUDIO_ESTIMATE'});
  }
 }
 return proposals;
}
