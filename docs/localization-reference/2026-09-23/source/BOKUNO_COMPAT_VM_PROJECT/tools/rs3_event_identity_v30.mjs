import {assertSupportedRom} from './rs3_rom_guard_v32r2.mjs';
/** Tool catalog IDs are NOT all native VM event numbers.
 * Catalog 0Fxx indexes CPU 5E:F500, selected by native event 4Cxx.
 * Native 32 0F xx instead uses the vanilla FD:0000 pointer page.
 * Evidence: C0:2F14, 5A:AC70, 5A:FD60 and isolated CPU dispatch tests.
 */
import {createHash} from 'node:crypto';
const EXPECTED='68a42e5373b856788f9c71c12f5c9aab036c826316278af1780403514ffc5941';
export function logicalToNativeEvent(id){
 if(!Number.isInteger(id)||id<1||id>0xfff||(id>>>8)===0xd)throw new RangeError('invalid logical catalog event');
 return (id>>>8)===0xf?0x4c00+(id&255):id;
}
export function nativeToLogicalEvent(id){
 if(!Number.isInteger(id)||id<0||id>65535)throw new RangeError('invalid native event');
 if((id>>>8)===0x4c)return 0x0f00+(id&255);
 return id>0&&id<0xf00&&(id>>>8)!==0xd?id:null;
}
export function createEventIdentity(rom,{guard=true}={}){
 if(guard)assertSupportedRom(rom,'event identity');
 const file=(bank,address)=>bank>=0xc0?(bank-0xc0)*65536+address:bank>=0x40&&bank<=0x7d?bank*65536+address:null;
 const read=(bank,address)=>{const off=file(bank,address&65535);return off===null?null:rom[off]??null;};
 const u16=(bank,address)=>{const lo=read(bank,address),hi=read(bank,address+1);return lo===null||hi===null?null:lo|(hi<<8);};
 function nativeRange(id){
  if(!Number.isInteger(id)||id<0||id>65535)return null;
  const high=id>>>8;let bank,address,startCpu,end16,tableCpu,kind;
  if([0xc,0xe,0x31,0x4c].includes(high)){
   bank=high===0x4c?0x5e:0x5a;
   const origin=high===0xc?0xc00:high===0x4c?0x4c00:0xe00;
   const base=high===0xc?0xa970:high===0x4c?0xf500:0xf800;
   address=(base+3*(id-origin))&65535;
   const ad=u16(bank,address),cb=read(bank,address+2);
   if(ad===null||cb===null)return null;
   startCpu=(cb<<16)|ad;end16=(ad-1)&65535;tableCpu=(bank<<16)|address;kind='native-far-start-minus-one';
  }else{
   bank=(0xfa+(id>>>10))&255;const slot=id&1023;
   const previous=slot?u16(bank,(slot-1)*2):0;
   const next=u16(bank,slot*2);
   if(previous===null||next===null)return null;
   const ad=slot?(previous+0x800)&65535:0x800;
   startCpu=(bank<<16)|ad;end16=(next+0x800)&65535;tableCpu=(bank<<16)|(slot*2);kind='native-u16-block-table';
  }
  const start=file(startCpu>>>16,startCpu&65535);
  if(start===null)return null;
  return {start,end16,source:kind,nativeEvent:id,logicalEvent:nativeToLogicalEvent(id),entryCpu:startCpu,tableCpu};
 }
 function logicalRange(id){
  let native;try{native=logicalToNativeEvent(id);}catch{return null;}
  const range=nativeRange(native);return range?{...range,logicalEvent:id}:null;
 }
 return {nativeRange,logicalRange};
}
