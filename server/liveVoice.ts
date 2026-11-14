/** Future feature retained from the AI Studio prototype.
 * Disabled unless BYBE_ENABLE_LIVE_VOICE=true. Do not expose it in primary Czech800 QA flow.
 * Never embed or return GEMINI_API_KEY to the browser.
 */
import type http from 'node:http';
import type { GoogleGenAI } from '@google/genai';
import { Modality } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';

export function registerLiveVoice(server:http.Server, getClient:()=>GoogleGenAI|null):void{
  const wss=new WebSocketServer({noServer:true,maxPayload:2_000_000});
  server.on('upgrade',(req,socket,head)=>{
    const pathname=new URL(req.url||'/', 'http://localhost').pathname;
    if(pathname!=='/api/live-ws'){socket.destroy();return;}
    const origin=req.headers.origin;
    if(origin){
      try{
        const url=new URL(origin);
        if(url.host!==req.headers.host){socket.destroy();return;}
      }catch{socket.destroy();return;}
    }
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  wss.on('connection',async(ws:WebSocket)=>{
    const ai=getClient();
    if(!ai){ws.send(JSON.stringify({error:'Gemini API түлхүүр тохируулаагүй.'}));ws.close();return;}
    let session:Awaited<ReturnType<typeof ai.live.connect>>|null=null;
    try{
      session=await ai.live.connect({
        model:process.env.GEMINI_LIVE_MODEL||'gemini-3.8-live',
        config:{responseModalities:[Modality.AUDIO],inputAudioTranscription:{},outputAudioTranscription:{},
          speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Zephyr'}}},
          systemInstruction:'You are BYBE Studio live voice assistant. Reply in Mongolian, accurately and concisely.'},
        callbacks:{
          onopen:()=>{},
          onmessage:(msg)=>{
            if(ws.readyState!==WebSocket.OPEN)return;
            const content=msg.serverContent;
            if(content?.inputTranscription?.text)ws.send(JSON.stringify({inputTranscript:content.inputTranscription.text}));
            if(content?.outputTranscription?.text)ws.send(JSON.stringify({outputTranscript:content.outputTranscription.text}));
            for(const part of content?.modelTurn?.parts||[]){
              if(part.inlineData?.data)ws.send(JSON.stringify({audio:part.inlineData.data}));
            }
            if(content?.interrupted)ws.send(JSON.stringify({interrupted:true}));
            if(content?.turnComplete)ws.send(JSON.stringify({turnComplete:true}));
          },
          onerror:(e)=>{console.error('Live Voice',e);if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({error:'Live Voice холбооны алдаа'}));},
          onclose:()=>{if(ws.readyState===WebSocket.OPEN)ws.close();}
        }
      });
      if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({ready:true}));
    }catch(e){console.error('Live Voice startup',e);if(ws.readyState===WebSocket.OPEN)ws.close(1011,'Live Voice unavailable');return;}
    ws.on('message',(raw)=>{
      if(!session)return;
      try{
        const data=JSON.parse(raw.toString()) as {audio?:string;text?:string};
        if(typeof data.audio==='string'&&data.audio.length<1_500_000){
          session.sendRealtimeInput({audio:{data:data.audio,mimeType:'audio/pcm;rate=16000'}});
        } else if(typeof data.text==='string'&&data.text.length<10000){
          session.sendRealtimeInput({text:data.text});
        }
      }catch{/* Invalid frame ignored. */}
    });
    ws.on('close',()=>{try{session?.close();}catch{/* closed */}});
  });
}
