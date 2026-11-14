// Real local Czech OCR regression: verifies overlay text AND clickable regions.
// Generates a synthetic learning slide; no copyrighted video or Gemini API needed.
import { spawnSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { localOcr } from '../server/ocrLocal.ts';

const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'bybe-ocr-test-'));
try{
 const font='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
 const fontRegular='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
 await fsp.access(font);await fsp.access(fontRegular);
 const file=path.join(dir,'frame.png');
 const filters=[
  "drawtext=fontfile="+font+":text='růžová':fontsize=64:fontcolor=0x101d31:x=63:y=48",
  "drawtext=fontfile="+fontRegular+":text='pink':fontsize=48:fontcolor=0x101d31:x=63:y=125"
 ].join(',');
 const ffmpeg=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi',
  '-i','color=c=0x9acbe0:s=960x540:d=1','-vf',filters,'-frames:v','1','-y',file],{
  encoding:'utf8',timeout:30_000});
 if(ffmpeg.error||ffmpeg.status!==0)throw Error('FFmpeg test image: '+ffmpeg.stderr);
 const blocks=await localOcr(await fsp.readFile(file),960,540,10.56);
 const cz=blocks.find(b=>b.text.toLocaleLowerCase('cs').includes('růžová'));
 const eng=blocks.find(b=>b.text.toLowerCase().includes('pink'));
 if(!cz||!eng)throw Error('OCR must detect both Czech + English overlay text; found: '+blocks.map(x=>x.text).join(' | '));
 if(cz.box.x<.04||cz.box.x>.2||cz.box.y<.04||cz.box.y>.25||
   eng.box.y<=cz.box.y)throw Error('OCR bounding box normalization incorrect');
 console.log('PASS local OCR sparse layout:',cz.text,eng.text,'/ coordinates:',cz.box,eng.box);
}finally{
 await fsp.rm(dir,{recursive:true,force:true});
 // Tesseract workers may hold their Node process open; test runner can exit explicitly.
 process.exitCode=process.exitCode||0;
}
process.exit(process.exitCode||0);
