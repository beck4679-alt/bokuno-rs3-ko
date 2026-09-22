/** Finite nibble path constraints. Does not execute an emulator. */
export function splitFlagDomain(domain, {kind='range',low=0,high=15,mask=15,invert=false}={}) {
  if(!Array.isArray(domain)||domain.some(n=>!Number.isInteger(n)||n<0||n>15))throw new RangeError('invalid nibble domain');
  const yes=[],no=[];
  for(const n of [...new Set(domain)].sort((a,b)=>a-b)) {
    const pass=kind==='bit' ? (invert ? !(n&mask) : !!(n&mask)) : n>=low&&n<=high;
    (pass?yes:no).push(n);
  }
  return {yes,no};
}
export function constrainFlag(overlay,key,values) {
  if(!/^[vep]\d+$/.test(key))throw new TypeError('invalid flag key');
  delete overlay['g'+key];delete overlay['x'+key];
  overlay[key]=values.length===1?values[0]:null;overlay['d'+key]=values.slice();
}
/** C0:2EED selects r in 0..(n||256)-1. r==0 continues;
 * otherwise tail-dispatches (D51B+r)&FFFF. Correlation with frame RNG is not claimed.
 */
export function randomEventAlternatives(base,count,fallthrough,identity) {
  if(!Number.isInteger(count)||count<0||count>255)throw new RangeError('invalid random count');
  const out=[{value:0,kind:'continue',pc:fallthrough}];
  for(let value=1;value<(count||256);value++) {
    const nativeEvent=Number.isInteger(base)?(base+value)&65535:null;
    const range=nativeEvent===null?null:identity.rangeOfNative(nativeEvent);
    out.push({value,kind:'tail-event',nativeEvent,range,pc:range?.start??null});
  }
  return out;
}
/** Vanilla 33/34/45 inspect the raw next byte after BOTH gate outcomes.
 * If it is <0C the next pair is tail-dispatched in the current VM frame.
 * 0D and 49 gates instead return through C0:1C7A: no inline dispatch.
 */
export function gateSuccessor(rom,pc,opcode,identity) {
  if([0x33,0x34,0x45].includes(opcode)&&rom[pc]<0x0c) {
    const nativeEvent=(rom[pc]<<8)|rom[pc+1],range=identity.rangeOfNative(nativeEvent);
    return {pc:range?.start??null,range,nativeEvent,tail:true,referencePc:pc};
  }
  return {pc,tail:false};
}
/** C0:2EA3 / 2EDD: call selected pair; return after all D3C1 pairs. */
export function selectionCallAlternatives(rom,pc,count,identity) {
  if(!Number.isInteger(count)||count<1||count>255)throw new RangeError('unresolved option count');
  const returnPc=pc+1+2*count;
  return Array.from({length:count},(_,index)=>{
    const referencePc=pc+1+2*index,b0=rom[referencePc],b1=rom[referencePc+1];
    const nativeEvent=(b0<<8)|b1;
    const supported=b1!==undefined&&(b0<0x10&&b0!==0x0d||b0===0x4c);
    const range=supported?identity.rangeOfNative(nativeEvent):null;
    return {index,count,referencePc,returnPc,nativeEvent,range};
  });
}
