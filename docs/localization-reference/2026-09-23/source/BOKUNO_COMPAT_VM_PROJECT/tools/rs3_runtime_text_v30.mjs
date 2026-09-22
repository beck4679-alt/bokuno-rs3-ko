import {assertSupportedRom} from './rs3_rom_guard_v32r2.mjs';
/** ROM-native dictionary/buffer text model. No Unicode names/numbers invented.
 * 39: F000+128*argument -> 68:DB00 ID map -> name table or F300 custom name.
 * 3A: EF00[argument] -> FD:0280 item table (argument is NOT the item index).
 * 3D/3E: big-endian WRAM pointer -> native digit slots 0300..0309.
 * Missing assignment slots remain U+FFFD display surrogates with exact slot IDs.
 * State reads are invalidated conservatively after unmodeled native effects.
 */
import { createHash } from 'node:crypto';
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const hex=n=>(n>>>0).toString(16).toUpperCase().padStart(6,'0');
export const EXPECTED_ROM='68a42e5373b856788f9c71c12f5c9aab036c826316278af1780403514ffc5941';
export const normalizeAssignedText=s=>s==='␣'?' ':s;
export const TEXT_COMMANDS=new Set([0x39,0x3A,0x3B,0x4A,0x3D,0x3E]);
export const TEXT_4F=new Set([0x11,0x12,0x13,0x14,0x15,0x2F,0x43]);
export function nativeDecimalBytes(value,width,trim=false){
  if(!Number.isInteger(value)||value<0||value>65535||![3,5].includes(width))throw new RangeError('invalid native decimal input');
  const digits=String(value).padStart(5,'0');
  const bytes=[];let significant=false;
  for(let i=0;i<5;i++){
    const digit=Number(digits[i]);
    significant ||= digit!==0||i===4;
    bytes.push(significant?0x23:0x20,significant?digit:0);
  }
  let result=bytes.slice((5-width)*2);
  if(trim)while(result.length>2&&result[0]===0x20&&result[1]===0)result=result.slice(2);
  return result;
}
export function createRuntimeTextModel(rom,assignment,{guard=true}={}){
  const WIDEST=new Map();   // 표별 최대 폭 항목 캐시 (상태 없는 변수 문안의 보수적 폭 가정)
  if(guard)assertSupportedRom(rom,'native text model');
  const inv=new Map();
  for(const [ch,slot] of Object.entries(assignment)){
    if(!Number.isInteger(slot)||slot<0||slot>0x7ff)throw new TypeError('invalid glyph assignment');
    const chars=inv.get(slot)||[];chars.push(normalizeAssignedText(ch));inv.set(slot,chars);
  }
  inv.set(0,[' ']);
  // 엔진 기호·숫자 슬롯은 **일부러 바닐라로 둔 자리**다([[rs3-symbol-slots-must-stay-vanilla]], collect_v32_defects_v1 SYMBOL_SLOTS 와 같은 판단).
  //   0x23 행(0x300~0x30F)은 숫자(0x300+N=N)와 기호, 0x97~0x9C·0x42A 는 엔진 기호. 배정이 없어도 미배정 결함이 아니라 바닐라 글리프로 센다.
  const VANILLA_SYMBOL=slot=>(slot>=0x97&&slot<=0x9c)||(slot>=0x300&&slot<=0x30f)||slot===0x42a;
  // E7/E8 are preserved Japanese punctuation glyphs, not unknown symbols.
  // Retaining their identity lets the full-dump audit detect untranslated punctuation.
  const vanillaText=slot=>slot===0x97?'。':slot===0x98?'、':(slot>=0x300&&slot<=0x309)?String(slot-0x300):'※';
  function glyph(slot,at){
    const chars=inv.get(slot)||[];let text=chars.length===1?chars[0]:null;
    if(text===null&&VANILLA_SYMBOL(slot))return {slot,text:vanillaText(slot),display:vanillaText(slot),at,kind:'vanilla-symbol'};
    return {slot,text,display:text??'�',at,kind:text===null?'unmapped-glyph-slot':'glyph'};
  }
  function decodeBuffer(bytes,source){
    const tokens=[],issues=[];let i=0;
    while(i<bytes.length){
      const at=i,b=bytes[i++];let slot;
      if(b>=0x50&&b<=0xfc)slot=b-0x50;
      else if((b>=0x20&&b<=0x23)||b===0x18||b===0x46){
        if(i>=bytes.length){issues.push({kind:'truncated-native-buffer-glyph',source,byteOffset:at,byte:b});break;}
        slot=(b===0x18?0x400:b===0x46?0x500:(b-0x20)<<8)|bytes[i++];
      }else{issues.push({kind:'unsupported-native-buffer-byte',source,byteOffset:at,byte:b});break;}
      const token=glyph(slot,`${source}+${at}`);tokens.push(token);
      if(token.text===null)issues.push({kind:token.kind,slot,source,byteOffset:at});
    }
    return {text:tokens.map(t=>t.display).join(''),tokens,issues,bytes:[...bytes],complete:!issues.length,source};
  }
  // Exact byte-copy contract in C0:3126/3222/3309: zero/50 terminates;
  // a lead below 50 copies one more byte even at the nominal record edge.
  function copyName(read,start,limit,source){
    const bytes=[],issues=[];let i=0;
    while(i<limit){
      const b=read(start+i);
      if(b===null||b===undefined){issues.push({kind:'unresolved-runtime-memory',source,address:start+i});break;}
      if(b===0||b===0x50)break;
      bytes.push(b);i++;
      if(b<0x50){const next=read(start+i);if(next===null||next===undefined){issues.push({kind:'unresolved-runtime-memory',source,address:start+i});break;}bytes.push(next);i++;}
    }
    const result=decodeBuffer(bytes,source);result.issues.unshift(...issues);result.complete=!result.issues.length;return result;
  }
  function resolve(op,args,context={}){
    const sub=op===0x4f?args[0]:null,argument=op===0x4f?args[1]:args[0];
    if(!TEXT_COMMANDS.has(op)&&!(op===0x4f&&TEXT_4F.has(sub)))return null;
    const scratch=context.scratch||{},state=context.state;
    const read=a=>{
      a&=0x1ffff;
      const si=a-0xef00;
      if(si>=0&&si<=0x1fe&&has(scratch,si))return scratch[si];
      if(scratch.__nativeMemoryInvalidated)return null;
      return state?.wram?.[a]??null;
    };
    const missing=(why)=>({text:'',tokens:[],issues:[{kind:'unresolved-runtime-macro',opcode:op.toString(16),subop:sub,argument,reason:why,layoutOmitted:true}],complete:false,source:'runtime'});
    const fromRom=(base,index,stride)=>copyName(a=>rom[a],base+index*stride,stride,`ROM:${hex(base+index*stride)}`);
    // 상태가 없을 때의 **가정** — 미해결(issue) 이 아니라 assumptions 로 딱지를 남기고 complete 는 유지한다.
    //   완결성 보고서가 「가정 아래 판정됨」으로 따로 세게 하려는 것이다 (2026-09-07, 사용자 「워커를 완벽하게」).
    const tag=(r,kind,reason,extra={})=>{r.assumptions=[...(r.assumptions||[]),{kind,reason,...extra}];return r;};
    const widest=(base,stride,count)=>{                      // 표에서 가장 넓은 항목(반칸 폭 최대) — 넘침 검사에 보수적
      const k=`${base}:${stride}`;if(WIDEST.has(k))return WIDEST.get(k);
      let best=0,bw=-1;for(let i=0;i<count;i++){const r=fromRom(base,i,stride);const w=r.tokens.length;if(r.complete&&w>bw){bw=w;best=i;}}
      WIDEST.set(k,best);return best;};
    const assumedFrom=(base,stride,count,kind,reason)=>tag(fromRom(base,widest(base,stride,count),stride),kind,reason,{widthAssumed:'table-max'});
    const probeName=Number.isInteger(context.protagonistNameId)?context.protagonistNameId:null;   // 클래스 프로브 중인 주인공의 4A 이름 번호
    // 단일 클래스 걷기(클래스 게이트 없는 이벤트를 클래스 0 하나로 걷는 배치, 2026-09-07): 주인공 이름은 8명 중 **가장 넓은 기본 이름**으로 가정해
    //   폭 판정을 보수적으로 잡고 'protagonist-name-max-width' 딱지를 남긴다. 어느 주인공이든 id 0..7 이 F300 갈래일 수 있으므로 id<8 전부에 적용.
    const probeMax=context.protagonistNameId==='max';
    const actorName=id=>{
      const lead=read(0xf000);
      if(lead!==null)return id===lead?copyName(read,0xf300,8,'WRAM:00F300'):fromRom(0x3d1480,id,8);
      // 상태 없음. 지도자 레코드 F000 은 언제나 주인공(68DB00 이 raw 0..7 을 항등으로 보냄)이므로
      //   규칙 A: id>=8 은 사용자 입력 이름(F300) 갈래일 수 없다 → 롬 표 확정.
      if(id>=8)return fromRom(0x3d1480,id,8);
      if(probeMax){const r=assumedFrom(0x3d1480,8,8,'protagonist-name-max-width','single-class walk; widest of the 8 default protagonist names assumed');r.resolvedIndex=id;return r;}
      //   규칙 B: 프로브 클래스를 알면 그 주인공만 F300 갈래 — 기본 이름 폭을 가정하고 딱지.
      if(probeName!==null){
        const r=fromRom(0x3d1480,id,8);
        return id===probeName?tag(r,'default-protagonist-name','F300 custom name unknown; default table name width assumed',{nameId:id}):r;
      }
      const r=fromRom(0x3d1480,id,8);
      r.issues.push({kind:'unresolved-custom-name-branch',nameId:id,reason:'F000/F300 state unavailable',layoutOmitted:false});r.complete=false;return r;
    };
    let result;
    if(op===0x39){
      const raw=read((0xf000+(argument<<7))&65535);
      if(raw===null){
        // 파티 슬롯: 0 은 지도자 = 프로브 주인공(기본 이름 가정), 1..5 는 편성 미지 → 인명표 최대 폭 가정
        if(argument===0&&probeName!==null){result=tag(fromRom(0x3d1480,probeName,8),'default-protagonist-name','party slot 0 = probe protagonist; default name width assumed',{nameId:probeName});result.resolvedIndex=probeName;}
        else{result=assumedFrom(0x3d1480,8,256,'unknown-party-member','party record unavailable; widest actor name assumed');result.resolvedIndex=null;}
      }else{const id=rom[0x68db00+raw];result=actorName(id);result.resolvedIndex=id;}
    }else if(op===0x4a){result=actorName(argument);result.resolvedIndex=argument;}
    else if(op===0x3b){result=fromRom(0x3d1dc0,argument,10);result.resolvedIndex=argument;}
    else if(op===0x3a){const id=read(0xef00+argument);if(id===null){result=assumedFrom(0x3d0280,8,256,'unknown-item-variable','EF00 item index unavailable; widest item name assumed');result.resolvedIndex=null;}else{result=fromRom(0x3d0280,id,8);result.resolvedIndex=id;}}
    else if(op===0x3d||op===0x3e){
      const address=(args[0]<<8)|args[1],lo=read(address),hi=op===0x3e?read((address+1)&65535):0;
      if(lo===null||hi===null){const digits=op===0x3e?5:3;result=tag(decodeBuffer(nativeDecimalBytes(Math.min(10**digits-1,65535),digits),`WRAM:${hex(address)}`),'unknown-numeric-variable',`WRAM value unavailable; ${digits}-digit maximum assumed`,{widthAssumed:'max-digits'});result.numericValue=null;}
      else{result=decodeBuffer(nativeDecimalBytes(lo|(hi<<8),op===0x3e?5:3),`WRAM:${hex(address)}`);result.numericValue=lo|(hi<<8);}
    }else if(op===0x4f){
      const lo=sub===0x11?read(0xd2f2):read(0xef00+argument);
      if(lo===null){
        // 4F 계열 변수 문안: 상태 없음 → 해당 표의 최대 폭 가정(숫자는 최대 자릿수)
        if(sub===0x2f)result=assumedFrom(0x3d1480,8,256,'unknown-actor-variable','EF00 actor index unavailable; widest actor name assumed');
        else if(sub===0x43){result=tag(decodeBuffer(nativeDecimalBytes(999,3,true),`EF00:${argument}`),'unknown-numeric-variable','EF00 value unavailable; 3-digit maximum assumed',{widthAssumed:'max-digits'});result.numericValue=null;}
        else if(sub===0x13)result=assumedFrom(0x3d27c0,10,4096,'unknown-item12-variable','EF00 12-bit item index unavailable; widest entry assumed');
        else{const base={0x11:0x3d1dc0,0x12:0x3d0a80,0x14:0x3d0000,0x15:0x3d1c80}[sub];result=assumedFrom(base,sub===0x12?8:10,256,'unknown-table-variable',`EF00/D2F2 index unavailable; widest entry of ${hex(base)} assumed`);}
        result.resolvedIndex=null;
        return {...result,opcode:op.toString(16),subop:sub,argument};
      }
      if(sub===0x2f){result=actorName(lo);result.resolvedIndex=lo;}
      else if(sub===0x43){result=decodeBuffer(nativeDecimalBytes(lo,3,true),`EF00:${argument}`);result.numericValue=lo;}
      else if(sub===0x13){const hi=read(0xef00+argument+1);if(hi===null)return missing('EF00 high byte unavailable');const id=(lo|(hi<<8))&0xfff;result=fromRom(0x3d27c0,id,10);result.resolvedIndex=id;}
      else{const base={0x11:0x3d1dc0,0x12:0x3d0a80,0x14:0x3d0000,0x15:0x3d1c80}[sub];result=fromRom(base,lo,sub===0x12?8:10);result.resolvedIndex=lo;}
    }
    return {...result,opcode:op.toString(16),subop:sub,argument};
  }
  return {glyph,decodeBuffer,copyName,resolve};
}
