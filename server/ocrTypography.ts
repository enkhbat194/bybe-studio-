import type { Express, Request, Response } from 'express';
import type { GoogleGenAI } from '@google/genai';
import { validateBlock } from '../src/lib/typography';
import { localOcr } from './ocrLocal';

type ClientFactory = () => GoogleGenAI|null;

/** Default: Tesseract.js on this PC, no API key. Gemini only when deliberately opted in. */
export function registerTypographyRoutes(app:Express,getClient:ClientFactory):void {
  app.post('/api/ocr-layout',async(req:Request,res:Response)=>{
    const {imageBase64,mimeType,frameSec,imageWidth,imageHeight}=req.body||{};
    const ts=Number(frameSec),w=Number(imageWidth),h=Number(imageHeight);
    if(!Number.isFinite(ts)||ts<0||typeof imageBase64!=='string'||imageBase64.length>4_000_000||
      !['image/jpeg','image/png'].includes(mimeType)|| !/^[A-Za-z0-9+/=]+$/.test(imageBase64) ||
      !Number.isInteger(w)||!Number.isInteger(h)||w<32||h<32||w>3000||h>3000){
      res.status(400).json({error:'Кадрын зураг, хэмжээ эсвэл хугацаа буруу байна.'});return;
    }
    // Do not silently send the user's screenshot to a paid cloud provider.
    const mode=process.env.BYBE_OCR_ENGINE==='gemini'?'gemini':'local';
    if(mode==='local'){
      try{
        const blocks=await localOcr(Buffer.from(imageBase64,'base64'),w,h,ts);
        res.json({frameSec:ts,blocks,status:'OCR_PROPOSAL_REVIEW_REQUIRED',engine:'tesseract-local',
          warning:'Локал OCR-ийн бичвэр, диакритик болон ангиллыг хэрэглэгч шалгана. Фонтын жин ба өнгө одоохондоо танигдаагүй.'});
      }catch(err){
        console.error('Local OCR failure:',err instanceof Error?err.message:'unknown');
        res.status(502).json({error:'Локал OCR ажилласангүй. Эхний удаа ces/eng хэлний загвар татахад интернет хэрэгтэй байж болно.'});
      }
      return;
    }
    const ai=getClient();
    if(!ai){res.status(503).json({error:'Gemini-г тохиргоогоор сонгосон боловч GEMINI_API_KEY байхгүй байна. BYBE_OCR_ENGINE=local болгоно уу.'});return;}
    try {
      const result=await ai.models.generateContent({
        model:process.env.GEMINI_MODEL||'gemini-2.5-flash',
        contents:{parts:[
          {inlineData:{mimeType,data:imageBase64}},
          {text:[
            'Read the EXACT on-screen text from this Czech vocabulary video frame. Return JSON only.',
            'Return {"blocks":[{"text":"...","box":{"x":0.1,"y":0.2,"w":0.2,"h":0.1},"size":"large","weight":"bold","color":"dark","proposedRole":"czech_word"}]}.',
            'Every box x/y/w/h MUST be a fraction of full image width/height within [0,1]; x+w <=1 and y+h<=1.',
            'size one of large,medium,small,unknown. weight bold,regular,unknown. color dark,light,accent,unknown.',
            'proposedRole one of czech_word,czech_sentence,english_word,english_sentence,ignore,unknown.',
            'Text role is only an UNVERIFIED SUGGESTION based on semantics and typography; do not confuse written text with audio speech or timestamps.',
            'Preserve all accents and original spelling (mělký, mělká, růžová, ř, ů). Never paraphrase or correct text.',
            'Include only visible text; omit imaginary text. If too uncertain use unknown. Include up to 30 useful text blocks.',
            'Exclude YouTube/browser chrome when possible; note that text may be overlayed within the video.',
          ].join('\n')}
        ]},
        config:{responseMimeType:'application/json'},
      });
      const parsed=JSON.parse((result.text||'{}').trim()) as {blocks?:unknown[]};
      const blocks=(Array.isArray(parsed.blocks)?parsed.blocks:[])
        .slice(0,30).map((b,i)=>validateBlock(b,ts,i)).filter(b=>b!==null);
      res.json({frameSec:ts,blocks,status:'OCR_PROPOSAL_REVIEW_REQUIRED',engine:'gemini-opt-in'});
    }catch(err){
      console.error('Gemini OCR failed:',err instanceof Error?err.message:'error');
      res.status(502).json({error:'Gemini OCR хүсэлт амжилтгүй. API тохиргоо, квотоо шалгана уу.'});
    }
  });
}
