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

test('Tesseract.js v7 HEADERLESS TSV yields Czech word and English gloss',()=>{
 const rows=[
  '1\t1\t0\t0\t0\t0\t0\t0\t960\t540\t-1\t',
  '5\t1\t1\t1\t1\t1\t68\t48\t233\t58\t96.801559\trůžová',
  '5\t1\t2\t1\t1\t1\t67\t125\t97\t46\t96.460129\tpink'
 ].join('\n');
 const blocks=blocksFromTsv(rows,960,540,10.56);
 assert.deepEqual(blocks.map(b=>b.text),['růžová','pink']);
 assert.equal(blocks[0].box.x,68/960);
 assert.equal(blocks[1].box.y,125/540);
});

test('OCR removes watermark, numeric counters and face noise but keeps valid Czech lesson',()=>{
 const rows=[
   '5\t1\t1\t1\t1\t1\t55\t64\t210\t52\t96\tčesnek',
   '5\t1\t2\t1\t1\t1\t55\t133\t115\t43\t92\tgarlic',
   '5\t1\t3\t1\t1\t1\t775\t10\t174\t20\t98\tCzechClass101.com',
   '5\t1\t4\t1\t1\t1\t800\t100\t30\t43\t99\t14',
   '5\t1\t5\t1\t1\t1\t500\t280\t24\t15\t90\tM',
   '5\t1\t6\t1\t1\t1\t450\t320\t30\t15\t30\txx',
 ].join('\n');
 const result=blocksFromTsv(h+'\n'+rows,960,540,12);
 assert.deepEqual(result.map(b=>b.text),['česnek','garlic']);
});
