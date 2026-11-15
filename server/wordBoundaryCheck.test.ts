import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {compareWhisperWords} from './wordBoundaryCheck';
const words=[
 {text:'Myslím,',start:10.2,end:10.7},
 {text:'že',start:10.72,end:10.9},
 {text:'stříbrná',start:10.95,end:11.42},
 {text:'ti',start:11.45,end:11.56},
 {text:'sluší',start:11.58,end:11.96},
 {text:'víc.',start:12.01,end:12.22}
];
test('Exact Czech sentence matching uses full phrase not one word',()=>{
 const r=compareWhisperWords('Myslím, že stříbrná ti sluší víc.',10.2,10.17,12.3,[{words}]);
 assert.equal(r.status,'MATCH_EXACT');assert.equal(r.verdict,'AGREE_REVIEW');
 assert.equal(r.asrStart,10.2);assert.equal(r.asrEnd,12.22);
});
test('Different start/end estimate must explicitly flag boundary conflict',()=>{
 const r=compareWhisperWords('stříbrná',10.95,11.4,11.9,[{words}]);
 assert.equal(r.status,'MATCH_EXACT');assert.equal(r.verdict,'DISAGREE_REVIEW');
 assert.ok((r.startDeltaMs||0)>250);
});
test('Accent mismatches must be flagged rather than silently normalized',()=>{
 const r=compareWhisperWords('stribrna',10.95,10.93,11.49,[{words}]);
 assert.equal(r.status,'MATCH_ACCENT_VARIANT');
 assert.ok(r.note.includes('Чех'));
});
test('Absent Czech phrase and absent word timestamps cannot approve',()=>{
 assert.equal(compareWhisperWords('zlatá',10,10,12,[{words}]).status,'NO_MATCH');
 assert.equal(compareWhisperWords('zlatá',10,10,12,[{text:'zlatá'}]).status,'NO_WORD_TIMES');
});
test('Repeated word matches nearest original clip, not first occurrence',()=>{
 const all=[{words:[{text:'růžová',start:2,end:2.5},{text:'růžová',start:6,end:6.4}]}];
 const r=compareWhisperWords('růžová',6.05,6,6.42,all);
 assert.equal(r.asrStart,6);
});
