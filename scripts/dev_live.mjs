// BYBE Studio optional development auto-update launcher.
// Pulls only FF-only trusted origin feature branch. Never resets or overwrites
// local edits. Updates client HMR via Vite and restarts server via Node watch.
// Start once with START_BYBE_LIVE.bat. No background agent after closing window.
import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
const ROOT=path.resolve(import.meta.dirname,'..');
const BRANCH='feature/typography-ocr-workstation';
const INTERVAL=90_000;
function git(...args){
 const r=spawnSync('git',args,{cwd:ROOT,encoding:'utf8',windowsHide:true,timeout:35_000});
 return {ok:r.status===0,output:(r.stdout||'').trim(),error:(r.stderr||'').trim()};
}
function verify(){
 const here=git('branch','--show-current');
 if(!here.ok||here.output!==BRANCH){
  throw Error('Шууд шинэчлэлт зөвхөн '+BRANCH+' салбар дээр ажиллана. Одоогийн салбар: '+here.output);
 }
 const origin=git('remote','get-url','origin');
 if(!origin.ok||!/github\.com[:/]enkhbat194\/bybe-studio-(?:\.git)?\/?$/.test(origin.output)){
  throw Error('Git origin BYBE Studio-ийн зөв repository биш. Автоматаар татахгүй.');
 }
}
let checking=false;
function update(){
 if(checking)return;checking=true;
 try{
  verify();
  const dirty=git('status','--porcelain','--untracked-files=no');
  if(!dirty.ok||dirty.output){
   console.log('[BYBE LIVE] Компьютер дээр өөрчлөгдсөн код байна. Git merge хийхгүй, өгөгдөл алдахгүй.');
   return;
  }
  const remote=git('fetch','--quiet','origin',BRANCH);
  if(!remote.ok){console.log('[BYBE LIVE] Интернет эсвэл Git fetch алдаа: '+remote.error.slice(0,160));return;}
  const local=git('rev-parse','HEAD'),head=git('rev-parse','FETCH_HEAD');
  if(!local.ok||!head.ok||local.output===head.output)return;
  if(!git('merge-base','--is-ancestor','HEAD','FETCH_HEAD').ok){
   console.log('[BYBE LIVE] Салбар зөрсөн. Кодыг хүчээр дарж бичихгүй.');return;
  }
  const deps=git('diff','--name-only','HEAD','FETCH_HEAD','--','package.json','package-lock.json');
  const merged=git('merge','--ff-only','FETCH_HEAD');
  if(!merged.ok){console.log('[BYBE LIVE] Fast-forward боломжгүй: '+merged.error);return;}
  console.log('[BYBE LIVE] Шинэ хувилбар автоматаар авлаа: '+head.output.slice(0,9));
  if(deps.output){
   console.log('[BYBE LIVE] npm хамаарал өөрчлөгдсөн тул суулгаж байна.');
   const npm=process.platform==='win32'?'npm.cmd':'npm';
   const r=spawnSync(npm,['install','--no-audit','--no-fund'],{cwd:ROOT,stdio:'inherit',windowsHide:true,timeout:180_000,shell:process.platform==='win32'});
   if(r.status!==0)console.log('[BYBE LIVE] npm install амжилтгүй. Серверийн логийг шалгана уу.');
  }
 }catch(e){console.log('[BYBE LIVE] Шинэчлэлт түр зогсов: '+String(e.message||e));}
 finally{checking=false;}
}
if(process.argv.includes('--check')){
 verify();console.log('BYBE LIVE branch and origin: OK');process.exit(0);
}
update();
const child=spawn(process.execPath,['--import','tsx','--watch','server.ts'],{
 cwd:ROOT,env:{...process.env,BYBE_ASR_DEVICE:process.env.BYBE_ASR_DEVICE||'cpu'},
 stdio:'inherit',windowsHide:true
});
let stopped=false;
const timer=setInterval(update,INTERVAL);
function shutdown(){
 if(stopped)return;
 stopped=true;clearInterval(timer);
 if(child.pid)child.kill();
}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
child.on('exit',(code)=>{
 shutdown();console.log('[BYBE LIVE] Сервер зогслоо ('+(code??'')+').');
 process.exitCode=code??0;
});
console.log('[BYBE LIVE] Ажиллаж байна. GitHub өөрчлөлтийг 90 секунд тутам шалгана.');
console.log('[BYBE LIVE] UI нь Vite HMR-ээр, сервер Node watch-ээр шинэчлэгдэнэ.');
