import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validClip, peaksFromPcm } from './mediaLibrary';
test('WAV extraction only accepts real bounded intervals',()=>{
 assert.equal(validClip(0,1,10),true);
 assert.equal(validClip(9.8,10,10),true);
 assert.equal(validClip(1,1,10),false);
 assert.equal(validClip(-1,2,10),false);
 assert.equal(validClip(9,11,10),false);
 assert.equal(validClip(1,601,700),false);
});
test('actual 16-bit PCM values produce nonfake timeline peak levels',()=>{
 const pcm=Buffer.alloc(1600);
 for(let i=0;i<800;i++)pcm.writeInt16LE(i<400?0:(i%2===0?16000:-16000),i*2);
 const bars=peaksFromPcm(pcm,8);
 assert.equal(bars.length,8);
 assert.equal(bars[0],0);assert.equal(bars[7],1);
 assert.deepEqual(peaksFromPcm(Buffer.from([1]),8),[]);
});
