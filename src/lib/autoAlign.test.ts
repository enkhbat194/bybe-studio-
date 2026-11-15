import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { looksLikeTitle,energyIslands,discoverSlides,proposeVisualAudio } from './autoAlign';
import type { FrameResult,OcrBlock } from './typography';
const block=(id:string,text:string,x:number,y:number,h=.055,frameSec=0):OcrBlock=>({
 id,text,box:{x,y,w:.22,h},size:'large',weight:'unknown',color:'dark',
 proposedRole:'unknown',frameSec,
});
test('OCR slide anchors ignore watermark, counters, and English gloss below Czech title',()=>{
 const title=block('cz','růžová',.04,.12);
 assert.ok(looksLikeTitle(title));
 assert.equal(looksLikeTitle(block('watermark','CzechClass101.com',.72,.03)),false);
 assert.equal(looksLikeTitle(block('counter','15',.79,.1)),false);
 const frames:FrameResult[]=[
  {frameSec:10,blocks:[title,block('en','pink',.04,.245),block('water','CzechClass101.com',.74,.03)]},
  {frameSec:15,blocks:[block('cz2','růžová',.04,.12,.055,15),block('en2','pink',.04,.245,.045,15)]},
  {frameSec:35,blocks:[block('next','stříbrná',.04,.12,.055,35),block('silver','silver',.04,.245,.045,35)]}
 ];
 const slides=discoverSlides(frames,0,60);
 assert.deepEqual(slides.map(x=>x.word.text),['růžová','stříbrná']);
 assert.equal(slides[0].english?.text,'pink');
});
test('FFmpeg waveform energy can produce bounded review-only text-linked candidates',()=>{
 const peaks=Array(1200).fill(.009);
 // Roughly five speech islands after 10 s / before 35 s
 for(const [a,b] of [[11,12.5],[14.1,15.5],[18,19],[22,24],[28,30.1]]){
  for(let i=Math.floor(a*20);i<Math.floor(b*20);i++)peaks[i]=.76;
 }
 const frames:FrameResult[]=[
  {frameSec:10,blocks:[block('cz','růžová',.04,.12,.05,10),block('en','pink',.04,.25,.045,10)]},
  {frameSec:35,blocks:[block('next','stříbrná',.04,.12,.05,35)]}
 ];
 const islands=energyIslands(peaks,0,60);
 assert.ok(islands.length>=5,'expected speech islands, got '+islands.length);
 const matches=proposeVisualAudio(frames,peaks,0,60);
 assert.ok(matches.length>=3,'expected proposals, got '+matches.length);
 assert.equal(matches[0].text,'růžová');
 assert.equal(matches[0].method,'VISUAL_AUDIO_ESTIMATE');
 assert.equal(matches[0].kind,'unknown');
 assert.ok(matches.every(x=>x.end>x.start&&x.end-x.start<=11.5));
});
test('Silent or constant noise must not create false linked audio',()=>{
 const frames:FrameResult[]=[{frameSec:3,blocks:[block('a','zlatá',.05,.14,.05,3)]}];
 assert.deepEqual(proposeVisualAudio(frames,Array(1200).fill(0),0,60),[]);
 assert.deepEqual(proposeVisualAudio(frames,Array(1200).fill(.2),0,60),[]);
});

test('Centered word slide also anchors OCR/audio without selecting the English gloss',()=>{
 const frames:FrameResult[]=[
  {frameSec:120,blocks:[
   block('w','kašel',.42,.42,.08,120),
   block('e','cough',.42,.59,.05,120)
  ]}
 ];
 const slides=discoverSlides(frames,100,145);
 assert.equal(slides.length,1);
 assert.equal(slides[0].word.text,'kašel');
 assert.equal(slides[0].english?.text,'cough');
});
