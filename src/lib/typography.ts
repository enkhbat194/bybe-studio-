export type TextRole = 'czech_word' | 'czech_sentence' | 'english_word' | 'english_sentence' | 'ignore' | 'unknown';
export type SizeClass = 'large' | 'medium' | 'small' | 'unknown';
export type WeightClass = 'bold' | 'regular' | 'unknown';
export interface OcrBox { x: number; y: number; w: number; h: number }
export interface OcrBlock {
  id: string; text: string; box: OcrBox; size: SizeClass; weight: WeightClass;
  color: 'dark' | 'light' | 'accent' | 'unknown';
  proposedRole: TextRole; frameSec: number;
}
export interface StyleRule { signature: string; role: TextRole; createdAt: string }
export interface FrameResult { frameSec: number; blocks: OcrBlock[] }
const ROLES:TextRole[]=['czech_word','czech_sentence','english_word','english_sentence','ignore','unknown'];
const SIZES:SizeClass[]=['large','medium','small','unknown'];
const WEIGHTS:WeightClass[]=['bold','regular','unknown'];
const COLORS:OcrBlock['color'][]=['dark','light','accent','unknown'];
const bound=(n:number)=>Math.min(1,Math.max(0,n));
export function validateBlock(input:unknown, frameSec:number, index:number):OcrBlock|null {
  if(!input || typeof input!=='object')return null;
  const v=input as Record<string,unknown>;
  const box=v.box as Record<string,unknown>|undefined;
  if(!box || !['x','y','w','h'].every(k=>typeof box[k]==='number'&&Number.isFinite(box[k])))return null;
  const x=bound(box.x as number), y=bound(box.y as number), w=bound(box.w as number), h=bound(box.h as number);
  if(!w || !h || x+w>1.05 || y+h>1.05)return null;
  const text=typeof v.text==='string'?v.text.trim().normalize('NFC').slice(0,600):'';
  if(!text)return null;
  return {
    id: 'f'+Math.round(frameSec*1000)+'-b'+index,
    text,box:{x,y,w:Math.min(w,1-x),h:Math.min(h,1-y)},
    size:SIZES.includes(v.size as SizeClass)?v.size as SizeClass:'unknown',
    weight:WEIGHTS.includes(v.weight as WeightClass)?v.weight as WeightClass:'unknown',
    color:COLORS.includes(v.color as OcrBlock['color'])?v.color as OcrBlock['color']:'unknown',
    proposedRole:ROLES.includes(v.proposedRole as TextRole)?v.proposedRole as TextRole:'unknown',
    frameSec,
  };
}
/** A simple design classifier. Labels are assigned by a human; no inference is falsely certified. */
export function styleSignature(block:OcrBlock):string {
  const {x,y}=block.box;
  const location=x<0.44?(y<0.42?'top-left':y>0.59?'bottom-left':'middle-left'):
    x>0.67?(y<0.42?'top-right':y>0.59?'bottom-right':'middle-right'):
    y<0.42?'top-center':y>0.59?'bottom-center':'center';
  return [location,block.size,block.weight,block.color].join('|');
}
export function effectiveRole(block:OcrBlock,rules:StyleRule[]):TextRole {
  const rule=rules.find(r=>r.signature===styleSignature(block));
  return rule?.role ?? block.proposedRole;
}
export function styleRuleFromBlock(block:OcrBlock,role:TextRole):StyleRule {
  return {signature:styleSignature(block),role,createdAt:new Date().toISOString()};
}
export function sameScreenText(a:OcrBlock,b:OcrBlock):boolean {
  return a.text.toLocaleLowerCase().replace(/\s+/g,' ')===b.text.toLocaleLowerCase().replace(/\s+/g,' ') &&
    styleSignature(a)===styleSignature(b);
}
export function canSelectAsText(block:OcrBlock,rules:StyleRule[]):boolean {
  return effectiveRole(block,rules)!=='ignore';
}
export function roleLabel(role:TextRole):string {
  return ({czech_word:'Чех үг',czech_sentence:'Чех өгүүлбэр',english_word:'Англи үг',english_sentence:'Англи өгүүлбэр',ignore:'Алгасах',unknown:'Тодорхойгүй'} as Record<TextRole,string>)[role];
}
