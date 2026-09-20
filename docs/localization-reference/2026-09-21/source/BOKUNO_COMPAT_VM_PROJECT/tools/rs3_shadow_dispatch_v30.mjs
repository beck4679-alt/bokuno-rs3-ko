import {assertSupportedRom} from './rs3_rom_guard_v32r2.mjs';
/** Read the candidate's actual g24b shadow directory, not a manifest promise.
 * Eligibility is for entry through C0:1BC6 (not arbitrary mid-handler operands).
 * C0:1C29/1C50, macros 39/3A/3B/4A, 4B and the 46 handler call the lookup.
 * 4F48 calls it with the pointer on the subopcode, not the 4F opcode.
 * In particular 24/3D/3E do not call the hook. A FE-return can land on a 3D
 * byte that used to be a source glyph, despite that address being in shadowRows.
 */
import { createHash } from 'node:crypto';
export const CANDIDATE_SHA256='68a42e5373b856788f9c71c12f5c9aab036c826316278af1780403514ffc5941';
export const EXTRA_SHA256=['93e548ba6a62001aa8922c118afdfaf7dcb128e629924281793ff97c20aecade','8182f890e38d43df746cbbdc07d9aba28177cb5c397bd3be19f8cb95c7afb48b'];
export function createShadowDispatch(rom) {
  assertSupportedRom(rom,'shadow dispatch');
  const cpuToFile=a=>{const b=a>>>16;return b>=0xc0?((b-0xc0)<<16)|(a&65535):b>=0x40&&b<=0x7d?a:null;};
  const word=a=>rom[a]|(rom[a+1]<<8);
  const banks=new Map();
  for(let b=0;b<256;b++){
    const d=0x3ff800+5*b,n=word(d);if(!n)continue;
    const base=cpuToFile((rom[d+4]<<16)|word(d+2));
    if(base===null||base+n*5>rom.length)throw new Error('invalid shadow directory bank '+b.toString(16));
    let prev=-1;for(let i=0;i<n;i++){const k=word(base+2*i);if(k<=prev)throw new Error('unsorted shadow keys');prev=k;}
    banks.set(b,{n,base});
  }
  const cache=new Map();
  function lookup(a){
    if(cache.has(a))return cache.get(a);
    const b=a>>>16,cb=b<=0x3f?b+0xc0:b,rec=banks.get(cb),key=a&65535;
    if(!rec){cache.set(a,null);return null;}
    let lo=0,hi=rec.n-1;
    while(lo<=hi){const i=(lo+hi)>>1,k=word(rec.base+2*i);if(k<key)lo=i+1;else if(k>key)hi=i-1;else{
      const t=rec.base+rec.n*2+3*i,ptr=word(t)|(rom[t+2]<<16),file=cpuToFile(ptr);
      if(file===null)throw new Error('shadow target is not ROM');
      const hit={source:a,target:file,targetCpu:ptr,directoryBank:cb,index:i};cache.set(a,hit);return hit;
    }}
    cache.set(a,null);return null;
  }
  function eligibility(a){
    const b=rom[a],next=rom[a+1];
    if(b>=0x50)return {eligible:true,kind:'one-byte-glyph-or-arena-control'};
    if(b>=0x20&&b<=0x23)return {eligible:true,kind:'two-byte-glyph'};
    if(b===0x18&&next>=0x10)return {eligible:true,kind:'extended-glyph'};
    if(b===0x46)return {eligible:true,kind:next>=0x10?'extended-glyph':'46-handler'};
    if([0x39,0x3a,0x3b,0x4a,0x4b].includes(b))return {eligible:true,kind:'hooked-command'};
    return {eligible:false,kind:'unhooked-dispatch-command'};
  }
  function active(a){return eligibility(a).eligible?lookup(a):null;}
  return {lookup,active,eligibility,banks};
}
