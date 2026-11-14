import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { textMatchScore, proposeTextLinks, normalizeForComparison } from './ocrMatch.js';
import type { FrameResult } from './typography.js';
test('OCR matcher compares Czech accents but does not change original text',()=>{
 assert.equal(normalizeForComparison('STŘÍBRNÁ!'),'stribrna');
 assert.equal(textMatchScore('stříbrná','stříbrná'),1);
 assert.ok(textMatchScore('Neboj se, voda je tady velmi mělká.','Neboj se, voda je tady velmi mělká.')>.99);
});
test('OCR can link accurately while preserving word form differences',()=>{
 const frames:FrameResult[]=[{frameSec:30,blocks:[
  {id:'word',frameSec:30,text:'stříbrná',box:{x:.05,y:.07,w:.2,h:.08},size:'large',weight:'unknown',color:'unknown',proposedRole:'unknown'},
  {id:'translation',frameSec:30,text:'silver',box:{x:.05,y:.17,w:.2,h:.06},size:'small',weight:'unknown',color:'unknown',proposedRole:'unknown'}
 ]}];
 const matches=proposeTextLinks([{id:'audio-1',start:32,end:33,text:'Stříbrná',ocrId:null}],frames);
 assert.equal(matches.length,1);
 assert.equal(matches[0].ocrId,'word');
 assert.equal(matches[0].frameSec,30);
});
test('Does not mistakenly match unrelated words or distant frames',()=>{
 const frames:FrameResult[]=[{frameSec:30,blocks:[
  {id:'a',frameSec:30,text:'mělký',box:{x:0,y:0,w:.1,h:.1},size:'large',weight:'unknown',color:'unknown',proposedRole:'unknown'}
 ]}];
 assert.deepEqual(proposeTextLinks([{id:'s1',start:32,end:34,text:'hluboký',ocrId:null}],frames),[]);
 assert.deepEqual(proposeTextLinks([{id:'s1',start:70,end:71,text:'mělký',ocrId:null}],frames),[]);
});
test('Verified or already linked segments are not altered',()=>{
 const frames:FrameResult[]=[{frameSec:5,blocks:[
  {id:'a',frameSec:5,text:'růžová',box:{x:0,y:0,w:.1,h:.1},size:'large',weight:'unknown',color:'unknown',proposedRole:'unknown'}
 ]}];
 assert.deepEqual(proposeTextLinks([{id:'1',start:5,end:6,text:'růžová',ocrId:null,qa:'MANUALLY_VERIFIED'},
  {id:'2',start:5,end:6,text:'růžová',ocrId:'manual'}],frames),[]);
});
