import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {analyzeBoundaryPcm} from './audioBoundary';

const sr=16000;
function synthetic(seconds:number,bursts:Array<[number,number]>,noise=0){
 const samples=Math.floor(seconds*sr),pcm=Buffer.alloc(samples*2);
 for(let i=0;i<samples;i++){
  const t=i/sr;
  const inside=bursts.some(([from,to])=>t>=from&&t<to);
  const fricative=inside&&(Math.abs(t-Math.round(t*2)/2)<.045);
  const wave=(inside?(fricative?
   .29*Math.sin(2*Math.PI*3300*t)+.1*Math.sin(2*Math.PI*4400*t):
   .46*Math.sin(2*Math.PI*240*t)+.21*Math.sin(2*Math.PI*900*t)):0)+
   noise*Math.sin(2*Math.PI*137*t);
  pcm.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(wave*22000))),i*2);
 }
 return pcm;
}
test('10ms boundary proposal corrects both grossly misplaced ends on isolated synthetic speech',()=>{
 const pcm=synthetic(7,[[2,3.7]],.002);
 const result=analyzeBoundaryPcm(pcm,0,2.19,3.54,7);
 assert.equal(result.method,'ACOUSTIC_10MS_REVIEW_ONLY');
 assert.equal(result.analysis.hopMs,10);
 assert.ok(result.frames.length>=690);
 assert.ok(result.changed.start,'start unchanged: '+JSON.stringify(result.proposed));
 assert.ok(result.changed.end,'end unchanged: '+JSON.stringify(result.proposed));
 assert.ok(Math.abs(result.proposed.start-2)<.20,'start '+result.proposed.start);
 assert.ok(Math.abs(result.proposed.end-3.7)<.20,'end '+result.proposed.end);
 assert.equal(result.state,'PROPOSED_REVIEW_REQUIRED');
 assert.ok(result.warnings.some(x=>x.includes('Forced Alignment')),'must not claim word-level proof');
});
test('All-silent audio must refuse to propose false boundaries',()=>{
 const r=analyzeBoundaryPcm(Buffer.alloc(16000*4*2),0,1,2,4);
 assert.equal(r.state,'NO_CLEAR_BOUNDARY');
 assert.equal(r.proposed.start,1);assert.equal(r.proposed.end,2);
 assert.ok(r.warnings.length>=2);
});
test('Continuous sine wave does not invent silence/word boundaries',()=>{
 const r=analyzeBoundaryPcm(synthetic(5,[[0,5]]),0,1.1,3.2,5);
 assert.equal(r.state,'NO_CLEAR_BOUNDARY');
 assert.equal(r.proposed.start,1.1);assert.equal(r.proposed.end,3.2);
});
test('Short separated words retain central pauses rather than splitting every silence',()=>{
 const r=analyzeBoundaryPcm(synthetic(6,[[1.5,1.95],[2.1,2.6]]),0,1.62,2.46,6);
 assert.equal(r.state,'PROPOSED_REVIEW_REQUIRED');
 assert.ok(r.proposed.start<1.62);
 assert.ok(r.proposed.end>2.46);
 assert.ok(r.proposed.end-r.proposed.start>.9);
});
test('Reject nonfinite, overlong and negative time ranges',()=>{
 const pcm=synthetic(2,[[.3,1.4]]);
 for(const args of [[NaN,1],[1,1],[.5,42]]){
  assert.throws(()=>analyzeBoundaryPcm(pcm,0,args[0],args[1],2));
 }
});
