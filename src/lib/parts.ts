export interface VideoPart { index:number; coreStart:number; coreEnd:number; analysisStart:number; analysisEnd:number }
/** Parts are virtual ranges; original media is never split or overwritten. */
export function planParts(durationSec:number,partMinutes=5,overlapSec=2):VideoPart[] {
  if(!Number.isFinite(durationSec)||durationSec<=0) return [];
  if(!Number.isFinite(partMinutes)||partMinutes<0.5||partMinutes>30)throw Error('Invalid part length');
  const size=partMinutes*60;
  const overlap=Math.min(Math.max(overlapSec,0),size/4);
  const parts:VideoPart[]=[];
  for(let i=0;i<Math.ceil(durationSec/size);i++){
    const coreStart=i*size,coreEnd=Math.min(durationSec,(i+1)*size);
    parts.push({index:i+1,coreStart,coreEnd,analysisStart:Math.max(0,coreStart-overlap),analysisEnd:Math.min(durationSec,coreEnd+overlap)});
  }
  return parts;
}
/** Clip ownership uses core intervals, avoiding duplicate exports from overlapping analysis windows. */
export function owningPart(parts:VideoPart[],midpoint:number):number|null {
  return parts.find(p=>midpoint>=p.coreStart && (midpoint<p.coreEnd||p===parts[parts.length-1]&&midpoint<=p.coreEnd))?.index??null;
}
