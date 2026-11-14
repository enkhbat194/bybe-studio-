import type { Express, Request, Response } from 'express';
import type { GoogleGenAI } from '@google/genai';
import { validateBlock } from '../src/lib/typography';

type ClientFactory = () => GoogleGenAI|null;
export function registerTypographyRoutes(app:Express,getClient:ClientFactory):void {
  app.post('/api/ocr-layout',async(req:Request,res:Response)=>{
    const ai=getClient();
    if(!ai){res.status(503).json({error:'Gemini API түлхүүр байхгүй. OCR шинжилгээ хийх боломжгүй.'});return;}
    const {imageBase64,mimeType,frameSec}=req.body||{};
    const ts=Number(frameSec);
    if(!Number.isFinite(ts)||ts<0||typeof imageBase64!=='string'||imageBase64.length>4_000_000||
      !['image/jpeg','image/png'].includes(mimeType)|| !/^[A-Za-z0-9+/=]+$/.test(imageBase64)){
      res.status(400).json({error:'Кадрын өгөгдөл буруу байна.'});return;
    }
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
            'Text role is only an UNVERIFIED SUGGESTION based on semantics and typography; do not confuse the written text with audio speech or timestamps.',
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
      res.json({frameSec:ts,blocks,status:'OCR_PROPOSAL_REVIEW_REQUIRED'});
    }catch(err){
      console.error('Typography OCR failed:',err instanceof Error?err.message:'error');
      res.status(502).json({error:'Текстийн байрлал таних хүсэлт амжилтгүй. AI тохиргоо, квотоо шалгана уу.'});
    }
  });
}
