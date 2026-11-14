import { createWorker, PSM, type Worker } from 'tesseract.js';
import type { OcrBlock } from '../src/lib/typography';

let workerPromise: Promise<Worker> | null = null;
let queue: Promise<void> = Promise.resolve();

function worker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker(['ces', 'eng']).then(async instance => {
      // Vocabulary slides have short scattered text over a presenter. Default PSM 3
      // often reads only the watermark and misses both the Czech word and translation.
      await instance.setParameters({tessedit_pageseg_mode: PSM.SPARSE_TEXT});
      return instance;
    }).catch(err => {
      workerPromise = null; // allow retry if language data download fails
      throw err;
    });
  }
  return workerPromise;
}

/** Parse Tesseract's TSV layout. One OCR line becomes one clickable region.
 * This is a deterministic layout extraction, NOT guaranteed Czech transcription.
 */
export function blocksFromTsv(tsv: string, width: number, height: number, frameSec: number): OcrBlock[] {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(frameSec)) return [];
  type Line = { text: string[]; x0: number; y0: number; x1: number; y1: number; score: number[] };
  const lines = new Map<string, Line>();
  const rows = tsv.split(/\r?\n/).filter(row => row.trim().length>0);
  // Tesseract.js v7 returns HEADERLESS TSV. CLI Tesseract often has a header.
  // Previously we discarded the first data row as a header then returned [].
  const expected = ['level','page_num','block_num','par_num','line_num','word_num',
    'left','top','width','height','conf','text'];
  const first = rows[0]?.split('\t') ?? [];
  if(first.length<12) return [];
  const header=first[0].trim().replace(/^\uFEFF/,'')==='level'?rows.shift()!.split('\t'):expected;
  const column=(name:string)=>header.indexOf(name);
  if (expected.some(k => column(k) === -1)) return [];
  for (const row of rows) {
    const cols = row.split('\t');
    if (cols[column('level')] !== '5') continue; // Tesseract word-level result
    const text = cols.slice(column('text')).join('\t').trim();
    const left=Number(cols[column('left')]),top=Number(cols[column('top')]);
    const w=Number(cols[column('width')]),h=Number(cols[column('height')]);
    const conf=Number(cols[column('conf')]);
    if(!text || ![left,top,w,h,conf].every(Number.isFinite) || conf<0 || w<=0 || h<=0)continue;
    const key=['page_num','block_num','par_num','line_num'].map(k=>cols[column(k)]).join(':');
    const current=lines.get(key) ?? {text:[],x0:left,y0:top,x1:left+w,y1:top+h,score:[]};
    current.text.push(text);
    current.x0=Math.min(current.x0,left);current.y0=Math.min(current.y0,top);
    current.x1=Math.max(current.x1,left+w);current.y1=Math.max(current.y1,top+h);
    current.score.push(conf);lines.set(key,current);
  }
  const out:OcrBlock[]=[];
  for(const line of lines.values()) {
    const x=Math.max(0,line.x0/width),y=Math.max(0,line.y0/height);
    const right=Math.min(1,line.x1/width),bottom=Math.min(1,line.y1/height);
    if(right<=x||bottom<=y)continue;
    const text=line.text.join(' ').normalize('NFC').trim();
    const confidence=line.score.reduce((n,v)=>n+v,0)/Math.max(1,line.score.length);
    if(!text || text.length>400 || confidence<53)continue;
    // Screenshot layout: Czech lesson overlays, not arbitrary presenter-face shapes.
    // CzechClass watermark, circle counter and noisy microscopic artifacts are not content.
    if(/(?:CzechClass101|https?:|www\.|^\d+[.\d]*$)/i.test(text))continue;
    const letters=(text.match(/[\p{L}]/gu)||[]).length;
    if(letters<2||letters/Math.max(1,text.length)<.46)continue;
    const relativeHeight=bottom-y;
    const topLeft=x<.50&&y<.47&&relativeHeight>=.022;
    const prominentCenter=relativeHeight>=.046&&x<.84&&y<.74;
    const subtitle=y>=.57&&y<.95&&relativeHeight>=.022&&text.length>=7;
    if(!(topLeft||prominentCenter||subtitle))continue;
    const size: OcrBlock['size'] = relativeHeight>=.05?'large':relativeHeight>=.028?'medium':'small';
    out.push({
      id:'f'+Math.round(frameSec*1000)+'-b'+out.length,
      text,box:{x,y,w:right-x,h:bottom-y},
      size,weight:'unknown',color:'unknown',proposedRole:'unknown',frameSec,
    });
  }
  return out.sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x).slice(0,35);
}

/** Serialize requests so that one 16GB-RAM workstation doesn't create many OCR workers. */
export async function localOcr(imageBytes: Buffer, width: number, height: number, frameSec: number): Promise<OcrBlock[]> {
  const previous=queue;
  let release=()=>{};
  queue=new Promise<void>(resolve=>{release=resolve;});
  await previous;
  try {
    const instance=await worker();
    const result=await instance.recognize(imageBytes,{}, {tsv:true});
    return blocksFromTsv(result.data.tsv || '',width,height,frameSec);
  } finally {
    release();
  }
}
