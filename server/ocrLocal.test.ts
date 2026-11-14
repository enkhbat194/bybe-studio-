import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { blocksFromTsv } from './ocrLocal';

const h='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
const lines=[
 '5\t1\t1\t1\t1\t1\t50\t60\t100\t40\t93\tmělký',
 '5\t1\t2\t1\t1\t1\t50\t105\t120\t28\t94\tshallow',
 '5\t1\t3\t1\t1\t1\t40\t450\t100\t35\t91\tNeboj',
 '5\t1\t3\t1\t1\t2\t147\t450\t40\t35\t92\tse,',
 '5\t1\t3\t1\t1\t3\t193\t450\t90\t35\t90\tvoda',
];
test('local OCR groups words into clickable lines and preserves Czech characters',()=>{
 const result=blocksFromTsv(h+'\n'+lines.join('\n'),1280,720,170);
 assert.equal(result.length,3);
 assert.equal(result[0].text,'mělký');
 assert.equal(result[1].text,'shallow');
 assert.equal(result[2].text,'Neboj se, voda');
 assert.equal(result[0].box.x,50/1280);
 assert.equal(result[0].proposedRole,'unknown');
 assert.equal(result[0].color,'unknown');
});
test('local OCR rejects malformed TSV rather than inventing text',()=>{
 assert.deepEqual(blocksFromTsv('garbage',1280,720,170),[]);
 assert.deepEqual(blocksFromTsv(h+'\n'+lines[0],0,720,170),[]);
});
