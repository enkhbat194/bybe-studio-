// Regression for Windows Python cp1252 stdout/UnicodeEncodeError.
import { spawn } from 'node:child_process';
import path from 'node:path';
const py=process.env.BYBE_TEST_PYTHON||'python3';
const worker=spawn(py,[path.join(process.cwd(),'scripts','local_asr_worker.py')],{
 env:{...process.env,PYTHONIOENCODING:'cp1252'},
 stdio:['pipe','pipe','pipe']});
const stdout=[];
let errors='';
worker.stdout.on('data',b=>stdout.push(b));
worker.stderr.on('data',b=>errors+=b.toString('utf8'));
worker.stdin.write(JSON.stringify({id:'unicode-smoke',source:'nonexistent',
 start:0,end:1})+'\n','utf8');
worker.stdin.end();
const code=await new Promise((resolve,reject)=>{
 worker.once('error',reject);worker.once('exit',resolve);
});
const body=Buffer.concat(stdout).toString('utf8').trim();
const reply=JSON.parse(body);
if(code!==0||reply.id!=='unicode-smoke'||reply.ok!==false||!reply.error)
 throw Error('Python worker cp1252 still crashed or returned invalid JSON: '+code+' '+body+' '+errors);
console.log('PASS Python worker sends UTF-8 JSON with Mongolian error without UnicodeEncodeError');
