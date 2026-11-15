// Startup regression: launch the SAME live wrapper used on Windows,
// with network syncing disabled, and verify that the local HTTP server listens.
// No video source, Git fetch, Whisper model or API key needed.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const port=34629;
const child=spawn(process.execPath,['scripts/dev_live.mjs','--no-sync'],{
 cwd:process.cwd(), env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},
 stdio:['ignore','pipe','pipe'],
});
let logs='',exited=false;
child.stdout.on('data',x=>logs+=String(x));
child.stderr.on('data',x=>logs+=String(x));
child.on('exit',()=>exited=true);
child.on('error',x=>logs+=' spawn error: '+x.message);
let ok=false;
try{
 for(let i=0;i<85;i++){
  await sleep(400);
  if(exited)throw Error('LIVE exited before server started: '+logs.slice(-1800));
  try{
   const res=await fetch('http://127.0.0.1:'+port+'/api/health',{signal:AbortSignal.timeout(1200)});
   if(res.ok&&(await res.json()).ok){ok=true;break;}
  }catch{/* startup pending */}
 }
 if(!ok)throw Error('LIVE startup timeout: '+logs.slice(-1800));
 if(!logs.includes('GitHub автоматаар татах идэвхгүй'))throw Error('startup did not honor --no-sync');
 console.log('PASS LIVE launcher starts real BYBE HTTP server without requiring network/Git/Whisper.');
}finally{
 child.kill('SIGTERM');
 await sleep(600);
}
