import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import { registerTypographyRoutes } from './server/ocrTypography';

const app=express();
const PORT=Number(process.env.PORT||3000);
const HOST=process.env.HOST||'0.0.0.0';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
app.disable('x-powered-by');
app.use(express.json({limit:'6mb'}));

function client():GoogleGenAI | null {
  const key=process.env.GEMINI_API_KEY?.trim();
  return key && key!=='MY_GEMINI_API_KEY' ? new GoogleGenAI({apiKey:key}) : null;
}
function sendError(error:unknown):string {
  const msg=error instanceof Error ? error.message : String(error);
  if(msg.includes('429'))return 'Gemini API хязгаарт хүрсэн. Дараа нь дахин оролдоно уу.';
  if(msg.includes('403')||msg.includes('API_KEY_INVALID'))return 'Gemini API түлхүүрийн эрх эсвэл утга буруу байна.';
  return 'AI хүсэлт амжилтгүй боллоо. Серверийн логийг шалгана уу.';
}
registerTypographyRoutes(app,client);
app.get('/api/health',(_req,res)=>res.json({ok:true,hasApiKey:client()!==null,locale:'mn',
  liveVoiceEnabled:process.env.BYBE_ENABLE_LIVE_VOICE==='true',
  ocrEngine:process.env.BYBE_OCR_ENGINE==='gemini'?'gemini-opt-in':'tesseract-local'}));

/** OCR scans one deliberate screenshot. Screenshot time is NOT the spoken audio timestamp. */
app.post('/api/ocr-frame',async(req,res)=>{
  const ai=client();
  if(!ai)return res.status(503).json({error:'GEMINI_API_KEY тохируулаагүй байна.'});
  const {imageBase64,mimeType,timestampSec}=req.body||{};
  if(typeof imageBase64!=='string'||imageBase64.length>4_000_000||
     !['image/jpeg','image/png'].includes(mimeType)||
     !/^[A-Za-z0-9+/=]+$/.test(imageBase64))
    return res.status(400).json({error:'Кадрын зураг эсвэл хэмжээ буруу байна.'});
  try {
    const model=process.env.GEMINI_MODEL||'gemini-2.5-flash';
    const result=await ai.models.generateContent({
      model,
      contents:{parts:[
        {inlineData:{mimeType,data:imageBase64}},
        {text:[
          'You are transcribing a Czech vocabulary learning slide from an image.',
          'Extract ONLY what is visibly printed. Preserve Czech accents č ř š ž ě ů í á é ó ú ý exactly.',
          'Do NOT repair, invent, translate, complete hidden text or infer audio timings.',
          'Return a JSON object with these exact string fields: czechWord, czechSentence, englishWord, englishSentence, note.',
          'If a field is missing or illegible, use an empty string and explain in note.',
          'The image frame timestamp is for finding the screenshot only, NOT an audio clip boundary.',
          'Frame time: '+String(Number(timestampSec)||0)+' seconds'
        ].join('\n')}
      ]},
      config:{responseMimeType:'application/json'}
    });
    const parsed=JSON.parse((result.text||'{}').trim());
    const str=(x:unknown)=>typeof x==='string'?x.slice(0,2000):'';
    res.json({czechWord:str(parsed.czechWord),czechSentence:str(parsed.czechSentence),
      englishWord:str(parsed.englishWord),englishSentence:str(parsed.englishSentence),
      note:str(parsed.note),status:'AI_PROPOSAL_REVIEW_REQUIRED'});
  }catch(err){console.error('OCR failure:',err);res.status(502).json({error:sendError(err)});}
});

/** Short-clip ASR support for a later audio alignment pipeline; no fake timestamps or confidence. */
app.post('/api/transcribe-clip',async(req,res)=>{
  const ai=client();if(!ai)return res.status(503).json({error:'GEMINI_API_KEY тохируулаагүй байна.'});
  const {audioBase64,mimeType}=req.body||{};
  if(typeof audioBase64!=='string'||audioBase64.length>4_000_000 ||
     !['audio/mp3','audio/mpeg','audio/wav','audio/webm','audio/mp4'].includes(mimeType)||
     !/^[A-Za-z0-9+/=]+$/.test(audioBase64))
    return res.status(400).json({error:'Аудионы файл эсвэл хэмжээ буруу байна.'});
  try{
    const result=await ai.models.generateContent({
      model:process.env.GEMINI_MODEL||'gemini-2.5-flash',
      contents:{parts:[
        {inlineData:{mimeType,data:audioBase64}},
        {text:'Transcribe audible Czech and English in their original languages, preserving Czech diacritics. Do not invent speech, clip start/end timestamps or confidence scores. Output a compact transcript; note uncertain words.'}
      ]}
    });
    return res.json({transcript:(result.text||'').trim(),status:'ASR_PROPOSAL_REVIEW_REQUIRED'});
  }catch(err){console.error('ASR failure:',err);res.status(502).json({error:sendError(err)});}
});

async function main(){
  if(process.env.NODE_ENV!=='production'){
    const {createServer}=await import('vite');
    const vite=await createServer({server:{middlewareMode:true},appType:'spa'});
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname,'dist')));
    app.get('*',(_req,res)=>res.sendFile(path.join(__dirname,'dist','index.html')));
  }
  const server=http.createServer(app);
  if(process.env.BYBE_ENABLE_LIVE_VOICE==='true'){
    const { registerLiveVoice }=await import('./server/liveVoice');
    registerLiveVoice(server,client);
    console.log('BYBE Live Voice opt-in enabled');
  }
  server.listen(PORT,HOST,()=>console.log('BYBE Studio (MN) listening on http://'+HOST+':'+PORT));
}
main().catch(err=>{console.error(err);process.exitCode=1;});
