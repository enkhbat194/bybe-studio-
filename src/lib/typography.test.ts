import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateBlock, styleSignature, effectiveRole, styleRuleFromBlock, sameScreenText } from './typography.js';
import { planParts, owningPart } from './parts.js';
test('OCR text preserves Czech accent and normalized box',()=>{
 const b=validateBlock({text:'mělký',box:{x:.06,y:.15,w:.25,h:.12},size:'large',weight:'bold',color:'dark',proposedRole:'czech_word'},35,0);
 assert.ok(b);assert.equal(b.text,'mělký');assert.equal(b.box.w,.25);
});
test('same visual style is reusable per-video, not tied to Czech lexeme',()=>{
 const a=validateBlock({text:'mělký',box:{x:.06,y:.15,w:.25,h:.12},size:'large',weight:'bold',color:'dark',proposedRole:'unknown'},1,0)!;
 const b=validateBlock({...a,text:'růžová',box:{x:.07,y:.16,w:.26,h:.11}},2,1)!;
 const r=styleRuleFromBlock(a,'czech_word');
 assert.equal(styleSignature(a),styleSignature(b));
 assert.equal(effectiveRole(b,[r]),'czech_word');
 assert.equal(effectiveRole(b,[]),'unknown');
 assert.equal(sameScreenText(a,b),false);
});
test('6-hour duration yields 72 five-minute parts and no duplicate ownership',()=>{
 const p=planParts(6*3600,5,2);
 assert.equal(p.length,72);assert.equal(p[1].analysisStart,298);
 assert.equal(p[0].analysisEnd,302);
 assert.equal(owningPart(p,300),2);
 assert.equal(owningPart(p,21600),72);
});
test('malformed OCR boxes rejected',()=>{
 assert.equal(validateBlock({text:'x',box:{x:.8,y:.8,w:.6,h:.6}},2,0),null);
});

test('OCR visual overlay filter allows Czech title and subtitle, rejects watermark/face artifacts',async()=>{
 const {usefulVideoText}=await import('./typography.js');
 const base={id:'x',frameSec:0,size:'large' as const,weight:'unknown' as const,
  color:'unknown' as const,proposedRole:'unknown' as const};
 const title={...base,text:'růžová',box:{x:.05,y:.12,w:.2,h:.06}};
 assert.equal(usefulVideoText(title),true);
 assert.equal(usefulVideoText({...title,text:'CzechClass101.com',box:{x:.78,y:.01,w:.2,h:.03}}),false);
 assert.equal(usefulVideoText({...title,text:'M',box:{x:.48,y:.5,w:.03,h:.02}}),false);
 assert.equal(usefulVideoText({...title,text:'Nosí zlaté oční stíny.',box:{x:.2,y:.76,w:.5,h:.05}}),true);
});
