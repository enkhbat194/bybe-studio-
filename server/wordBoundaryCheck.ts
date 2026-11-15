// Independent ASR word-time comparison. A match is evidence, NOT QA approval.
// Czech diacritics are retained in the primary check; accentless fallback is flagged.
export interface TimedWord {text:string;start:number;end:number}
export interface WhisperSegment {text?:string;start?:number;end?:number;words?:TimedWord[]}
export interface WordBoundaryEvidence{
 status:'MATCH_EXACT'|'MATCH_ACCENT_VARIANT'|'NO_MATCH'|'NO_WORD_TIMES';
 verdict:'AGREE_REVIEW'|'DISAGREE_REVIEW'|'UNAVAILABLE_REVIEW';
 recognizedText:string;
 asrStart?:number;asrEnd?:number;
 startDeltaMs?:number;endDeltaMs?:number;
 note:string;
}
const norm=(s:string)=>s.normalize('NFC').toLocaleLowerCase('cs').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const bare=(s:string)=>norm(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const n3=(n:number)=>Math.round(n*1000)/1000;
export function compareWhisperWords(
 expected:string,originalStart:number,refinedStart:number,refinedEnd:number,segments:WhisperSegment[]):WordBoundaryEvidence{
 const plain=norm(expected),goal=plain.split(' ').filter(Boolean);
 if(!goal.length)return {status:'NO_MATCH',verdict:'UNAVAILABLE_REVIEW',recognizedText:'',
  note:'Харьцуулах текст байхгүй.'};
 const words=segments.flatMap(s=>Array.isArray(s.words)?s.words:[])
  .filter(x=>typeof x.text==='string'&&Number.isFinite(x.start)&&Number.isFinite(x.end)&&x.end>x.start)
  .sort((a,b)=>a.start-b.start);
 if(!words.length)return {status:'NO_WORD_TIMES',verdict:'UNAVAILABLE_REVIEW',recognizedText:'',
  note:'Whisper үгийн эхлэл/төгсгөлийн timestamp буцаагаагүй.'};
 const options:Array<{start:number;end:number;text:string;variant:boolean}>=[];
 for(let i=0;i<words.length;i++){
  for(let j=i;j<Math.min(words.length,i+goal.length+3);j++){
   const part=words.slice(i,j+1);
   if(part.some((w,k)=>k>0&&w.start-part[k-1].end>.3))break;
   const text=part.map(x=>x.text).join(' ').trim();
   const normalized=norm(text);
   if(normalized===plain||bare(normalized)===bare(plain))
    options.push({start:part[0].start,end:part[part.length-1].end,text,variant:normalized!==plain});
  }
 }
 if(!options.length)return {status:'NO_MATCH',verdict:'UNAVAILABLE_REVIEW',recognizedText:words.map(w=>w.text).join(' ').slice(0,400),
  note:'Whisper таньсан үг/өгүүлбэр OCR-ийн тексттэй таараагүй. Заагийг баталгаажуулахгүй.'};
 options.sort((a,b)=>Number(a.variant)-Number(b.variant)+
   .001*(Math.abs(a.start-originalStart)-Math.abs(b.start-originalStart)));
 const best=options[0],ds=n3((refinedStart-best.start)*1000),de=n3((refinedEnd-best.end)*1000);
 const agree=Math.abs(ds)<=250&&Math.abs(de)<=250;
 return {status:best.variant?'MATCH_ACCENT_VARIANT':'MATCH_EXACT',
  verdict:agree?'AGREE_REVIEW':'DISAGREE_REVIEW',
  recognizedText:best.text,asrStart:n3(best.start),asrEnd:n3(best.end),
  startDeltaMs:ds,endDeltaMs:de,
  note:best.variant?'Үгийн өргөлт/үсэг таараагүй; Чех текстийг хүний хяналтаар засна.':
   agree?'Whisper ба акустик зааг ойролцоо; энэ нь QA баталгаа биш.':
   'Whisper ба акустик зааг зөрсөн. Эхлэл, төгсгөлийг заавал сонсож шалгана.'};
}
