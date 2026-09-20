/** Candidate-only stream reader, z61. No emulator, ledger text or source-op boundaries.
 * C0:FF10: shadow lookup, then gated FD/FE/FF carriers; redirects re-dispatch.
 * FF:E297: half-open per-bank ranges from FF:E400/E600 gate the carriers.
 * FE bank comes from the ROM FF:E300 table, FF's bank comes from its operand.
 * The state-machine consumer handles non-text commands at their own PC.
 */
import {createNativeOps} from './rs3_native_ops_v30.mjs';
import {createShadowDispatch} from './rs3_shadow_dispatch_v30.mjs';
import {createContextualTextDispatch} from './rs3_contextual_text_stream_v1.mjs';
import {validateSoftPaddingStream} from './rs3_soft_padding_stream_v1.mjs';
import {dialogueValidationBase} from './rs3_dialogue_validation_base_v1.mjs';
import {createHash} from 'node:crypto';
import {createPaddingIntervalLookup} from './rs3_native_padding_guard_v1.mjs';
export const fileToCpu=a=>((a>>>16)<=0x3f?a+0xc00000:a);
export const cpuToFile=a=>{const b=a>>>16;return b>=0xc0?a-0xc00000:b>=0x40&&b<=0x7d?a:null;};
export function createCandidateStream(rom,opts={}) {
  const validationBase=dialogueValidationBase(rom,opts.layoutPatch);
  const softValidated=validateSoftPaddingStream(validationBase.rom,validationBase.patch);
  const native=createNativeOps(rom,{...opts,dispatchRom:rom});
  const shadow=createShadowDispatch(rom);
  const contextualDispatch=createContextualTextDispatch(rom,opts.layoutPatch?.contextualText);
  const word=a=>rom[a]|rom[a+1]<<8;
  const ranges=new Map();
  // The adaptive padding helper consumes exactly FD FD + 50x64 + FD FD as a
  // zero-width layout operation when the native pen is already at line start.
  // Do not infer this from bytes: accept only the patch's registered spans and
  // prove each span against the atomic arena write and its source/back owner.
  const layoutTokens=new Map();
  const hexBytes=v=>Buffer.from(String(v||'').replace(/\s+/g,''),'hex');
  const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
  const n=v=>Number(v);
  const cpuBankOfFile=fb=>(fb>>>16)<=0x3f?0xc0+(fb>>>16):(fb>>>16);
  const makeAdaptiveTokens=()=>{
    const meta=opts.adaptivePadding;
    if(meta===undefined||meta===null)return;
    if(meta.schema!=='adaptive-authored-padding-v1'||n(meta.spaces)!==64||!Array.isArray(meta.spans))
      throw new Error('invalid adaptive padding metadata');
    const patch=opts.layoutPatch;
    if(!patch||!Array.isArray(patch.writes)||!Array.isArray(patch.shadowRows)||!Array.isArray(patch.arenaRows)||!Array.isArray(meta.rows))
      throw new Error('adaptive padding requires patch source/arena/back evidence');
    const shadows=new Map(patch.shadowRows.map(r=>[n(r[0]),r.map(n)]));
    // 2026-09-17(발화 payload 넓은 배치): 한 출발지에 아레나 할당이 여럿일 수 있다(옛 행 블롭 · 다른 아레나의 payload · 4바이트 발판).
    //   마지막 것만 남기면 패딩 표식이 든 행 블롭 대신 발판과 대조해 멈춘다(v29 4434B6 → 7D380A) — 행 아레나 주소(meta row.arena)와 같은 할당을 고른다.
    const arenaRowsAll=new Map();
    for(const r of patch.arenaRows){const k=n(r[0]);if(!arenaRowsAll.has(k))arenaRowsAll.set(k,[]);arenaRowsAll.get(k).push(r.map(n));}
    const arenaRows={get:(k)=>{const list=arenaRowsAll.get(k);if(!list)return undefined;const want=n(rows.get(k)?.arena);return list.find(r=>r[1]===want)||list[list.length-1];}};
    const rows=new Map(meta.rows.map(r=>[n(r.source),r]));
    const sourceSpans=(patch.rowSpans||[]).map(r=>r.map(n));
    const writes=patch.writes.map(([at,data])=>({at:n(at),bytes:hexBytes(data)}));
    const seen=new Set();
    for(const raw of meta.spans){
      const authored=raw.provenance==='authored-prefix-after-original-wait';
      if(authored){
        const allocation=patch.sharedSentenceSpacingChild?.allocations?.find(a=>a.source===n(raw.source));
        if(raw.originalTokenOffset!==null||n(raw.source)!==0x71e9e3||!allocation?.marker
          ||allocation.marker.markerStart!==n(raw.markerStart)||allocation.newArena[1]!==n(raw.markerStart))
          throw new Error('authored prefix lacks validated three-source recipe');
      }
      const span={source:n(raw.source),originalTokenOffset:authored?null:n(raw.originalTokenOffset),markerStart:n(raw.markerStart),padStart:n(raw.padStart),padEnd:n(raw.padEnd),markerEnd:n(raw.markerEnd),...(authored?{provenance:raw.provenance}:{})};
      if(!Number.isInteger(span.source)||(!authored&&!Number.isInteger(span.originalTokenOffset))||!Number.isInteger(span.markerStart)
        ||(!authored&&span.originalTokenOffset<0)||span.padStart!==span.markerStart+2||span.padEnd!==span.padStart+64||span.markerEnd!==span.padEnd+2)
        throw new Error('malformed adaptive padding span');
      if(seen.has(span.markerStart)||layoutTokens.has(span.markerStart))throw new Error('duplicate adaptive padding marker');
      const row=rows.get(span.source),directShadow=shadows.get(span.source),directArena=arenaRows.get(span.source);
      const sourceSpan=directShadow||directArena?null:sourceSpans.find(r=>r[0]<=span.source&&span.source<r[1]&&r[1]<=n(row?.back)&&n(row?.back)-r[1]<=1);
      const owner=(directShadow||directArena)?span.source:sourceSpan?.[0],shadowRow=owner===undefined?null:shadows.get(owner),arenaRow=owner===undefined?null:arenaRows.get(owner);
      if(!row||owner===undefined||n(row.arena)>span.markerStart
        ||(shadowRow?(n(shadowRow[1])!==n(row.arena)||n(row.back)!==((owner&0xff0000)|n(shadowRow[2])))
          :(!arenaRow||n(arenaRow[1])!==n(row.arena))))
        throw new Error(`adaptive padding source/arena/back mismatch at ${span.markerStart.toString(16)}`);
      const write= writes.filter(w=>w.at===n(row.arena));
      if(write.length!==1||span.markerEnd>write[0].at+write[0].bytes.length
        ||!same(Array.from(rom.subarray(write[0].at,write[0].at+write[0].bytes.length)),Array.from(write[0].bytes)))
        throw new Error(`adaptive padding atomic arena write mismatch at ${span.markerStart.toString(16)}`);
      const backAt=write[0].at+write[0].bytes.length-4;
      if(!shadowRow&&(rom[backAt]!==0xff||word(backAt+1)!==(n(row.back)&0xffff)||rom[backAt+3]!==cpuBankOfFile(owner)))
        throw new Error(`adaptive padding direct-FE back mismatch at ${span.markerStart.toString(16)}`);
      const bytes=rom.subarray(span.markerStart,span.markerEnd);
      if(bytes[0]!==0xfd||bytes[1]!==0xfd||bytes[66]!==0xfd||bytes[67]!==0xfd||!Array.from(bytes.subarray(2,66)).every(b=>b===0x50))
        throw new Error(`adaptive padding marker bytes mismatch at ${span.markerStart.toString(16)}`);
      layoutTokens.set(span.markerStart,{kind:'adaptive-padding',len:68,...span,owner,back:n(row.back),arena:n(row.arena)});
      seen.add(span.markerStart);
    }
  };
  const makeF9dToken=()=>{
    const receipt=opts.f9dPadSkip;
    if(receipt===undefined||receipt===null)return;
    const source=Number.parseInt(String(receipt.sourcePc||''),16),last=Number.parseInt(String(receipt.lastPaddingFile||''),16),back=Number.parseInt(String(receipt.backPc||''),16),back16=back&0xffff;
    if(receipt.schema!=='f9d-pad17-overflow-skip-receipt-v1'||source!==0x73780a||back!==0x737816
      ||n(receipt.windowWidth)!==14||n(receipt.trailingSpaces)!==17||!Number.isInteger(last))throw new Error('invalid F9D pad-skip receipt');
    const patch=opts.layoutPatch;
    const shadowRow=patch?.shadowRows?.map(r=>r.map(n)).find(r=>r[0]===source);
    const arenaRow=patch?.arenaRows?.map(r=>r.map(n)).find(r=>r[0]===source);
    const writes=(patch?.writes||[]).map(([at,data])=>({at:n(at),bytes:hexBytes(data)})).filter(w=>w.at===shadowRow?.[1]);
    if(!shadowRow||!arenaRow||arenaRow[1]!==shadowRow[1]||writes.length!==1||last<writes[0].at||last+5>writes[0].at+writes[0].bytes.length
      ||!same(Array.from(rom.subarray(writes[0].at,writes[0].at+writes[0].bytes.length)),Array.from(writes[0].bytes))
      ||!Array.from(rom.subarray(last-16,last+1)).every(b=>b===0x50)||rom[last+1]!==0xff||word(last+2)!==back16||rom[last+4]!==cpuBankOfFile(source))
      throw new Error('F9D pad-skip ROM/source/back contract mismatch');
    layoutTokens.set(last,{kind:'conditional-skip-line-start',len:1,source,lastPaddingFile:last,back,headByte:0x50,requiredCols:14,nativeHalfPhase:0});
  };
  const makeConditionalLeadingTokens=()=>{
    const receipt=opts.conditionalLeadingSpace;
    if(receipt===undefined||receipt===null)return;
    if(receipt.schema!=='conditional-leading-space-receipt-v1'||!Array.isArray(receipt.rows)||![3,6,7].includes(receipt.rows.length))
      throw new Error('invalid conditional leading-space receipt');
    const expected=new Map([[0x72538a,[0x72538b,0x50]],[0x3b9bd1,[0x3b9bd7,0x50]],[0x3bce1e,[0x3bce23,0x50]],
      [0x3cdc33,[0x3cdc34,0x51]],[0x3cdc35,[0x3cdc37,0x51]],[0x3cdeba,[0x3cdebc,0x51]],[0x3cdec3,[0x3cdec9,0x51]]]);
    const legacy=receipt.rows.length===3;
    const patch=opts.layoutPatch,writes=(patch?.writes||[]).map(([at,data])=>({at:n(at),bytes:hexBytes(data)}));
    for(const raw of receipt.rows){
      const source=Number.parseInt(String(raw.sourcePc||''),16),arena=Number.parseInt(String(raw.arenaPc||''),16),back=Number.parseInt(String(raw.backPc||''),16);
      const spec=expected.get(source),head=Number.parseInt(String(raw.headByte||(legacy?'50':'')),16);
      if(!spec||spec[0]!==back||spec[1]!==head||(!legacy&&raw.headByte===undefined)||!Number.isInteger(arena)||layoutTokens.has(arena))throw new Error('conditional leading-space row identity mismatch');
      const shadow=patch?.shadowRows?.map(r=>r.map(n)).filter(r=>r[0]===source),row=patch?.arenaRows?.map(r=>r.map(n)).filter(r=>r[0]===source&&r[1]===arena);
      const write=writes.filter(w=>w.at===arena),end=arena+(row?.[0]?.[2]||0);
      if(shadow?.length!==1||shadow[0][1]!==arena||shadow[0][2]!==((back)&0xffff)||row?.length!==1||write.length!==1
        ||!same(Array.from(rom.subarray(arena,arena+write[0].bytes.length)),Array.from(write[0].bytes))||rom[arena]!==head
        ||end<arena+5||rom[end-4]!==0xff||word(end-3)!==(back&0xffff)||rom[end-1]!==cpuBankOfFile(source))
        throw new Error(`conditional leading-space ROM/source/BACK mismatch @${source.toString(16)}`);
      layoutTokens.set(arena,{kind:'conditional-skip-line-start',len:1,source,arena,back,headByte:head,nativeHalfPhase:0,
        modelAssumption:'Korean half-cell layout column 0 represents native whole-cell column 0 and half-phase 0'});
    }
  };
  // Prefix-separator v3 is a separate mechanism from the seven historical
  // source-owned 50/51 heads above. A later contextual-only child may retain
  // the raw v3 receipt: accept that only through its exact parent binding and
  // still prove every prefix payload/helper byte in the active child ROM.
  const makePrefixSeparatorTokens=()=>{
    const receipt=opts.prefixSeparator;
    if(receipt===undefined||receipt===null)return;
    const ROM_SHA='15BF449ED8C078FEF802B6C1B210EE14CE490FB3B0571B1BAAF99BCBDEF98E97';
    const V4_ROM_SHA='4CC2310E58EE06C09C4CEB214A40DBB2621F329376839ECE018C0060CC15B658';
    const V4R2_ROM_SHA='B03495EE03DD978000FE2C22D8D6A07AA2AFB5F898782D308F7D1F728624A7FA';
    const V4R3_ROM_SHA='936C3B8B00CB16952130FAC2297417A86DCA30130F325FA48A20972137D56D70';
    const V4R4_ROM_SHA='3944E38338CA29B82ADBC2248E761041046577E7E3E41B0E471F4FCE497ABE42';
    const V4R5_ROM_SHA='F93C40B341928179B1FB08F688BE6A5FA6640553861F023F838CCFA779F2CB6D';
    const POLICY_V5_ROM_SHA='0A67D9A5775F774B2060EA33A5D8AD1BB69C64C85041BC2C9994645CBC298DB0';
    const V4_PATCH_SHA='E4A51CF8995D494A948CD0851098942BE8AA9C1B6E3CC40D9190EBC48FECB7DD';
    const V4_PARENT_CTX_SHA='5BDB628DF67375740B809061D5FD3DFD64A83C1DB38F14414BA2F7C34A2EC252';
    const RECEIPT_SHA='55962B38949BE453A7B8EAB820A87CFF151FD273179520589D8F3C4305DEFFCD';
    const PLAN_SHA='DAEC1CD769DA8A84E0AB9B84A35018DC5BFCD1E43B9E9499BBD874AF43218A9D';
    const COLLAPSE_SHA='8025D4887CFE414E301ACABCB20315F108F332163E26C865AE191F869F9C2117';
    const digest=softValidated?.baselineSha256||createHash('sha256').update(rom).digest('hex').toUpperCase();
    if(receipt.schema!=='rs3-prefix-separator-overlay-v3'||![ROM_SHA,V4_ROM_SHA,V4R2_ROM_SHA,V4R3_ROM_SHA,V4R4_ROM_SHA,V4R5_ROM_SHA,POLICY_V5_ROM_SHA].includes(digest)
      ||String(opts.prefixSeparatorSha256||'').toUpperCase()!==RECEIPT_SHA
      ||receipt.candidateSha256!==ROM_SHA||receipt.prefixPlanSha256!==PLAN_SHA||receipt.collapsePlanSha256!==COLLAPSE_SHA
      ||!Array.isArray(receipt.entries)||receipt.entries.length!==36||!Array.isArray(receipt.registeredPadRows)||receipt.registeredPadRows.length!==40)
      throw new Error('unsupported prefix-separator receipt/ROM identity');
    const patch=softValidated?.parentPatch||opts.layoutPatch,ctx=patch?.contextualText;
    const child=ctx?.parentPrefixSeparator;
    const exactBase=digest===ROM_SHA&&ctx?.candidateSha256===ROM_SHA&&ctx?.entries?.length===138&&!child;
    const exactV4=digest===V4_ROM_SHA&&ctx?.candidateSha256===V4_ROM_SHA&&ctx?.entries?.length===144
      &&child?.schema==='rs3-prefix-separator-parent-binding-v1'&&child.parentRomSha256===ROM_SHA
      &&child.parentPatchSha256===V4_PATCH_SHA&&child.parentContextualReceiptSha256===V4_PARENT_CTX_SHA
      &&child.prefixV3ReceiptSha256===RECEIPT_SHA&&child.prefixV3PlanSha256===PLAN_SHA
      &&child.prefixV3CollapsePlanSha256===COLLAPSE_SHA&&n(child.parentEntries)===138
      &&n(child.preservedHelperFile)===n(receipt.helperFile)
      &&child.preservedHelperSha256===createHash('sha256').update(hexBytes(receipt.helperHex)).digest('hex').toUpperCase();
    const exactV4r2=digest===V4R2_ROM_SHA&&ctx?.candidateSha256===V4R2_ROM_SHA&&ctx?.entries?.length===157
      &&child?.schema==='rs3-prefix-separator-parent-binding-v1'&&child.parentRomSha256===ROM_SHA
      &&child.parentPatchSha256===V4_PATCH_SHA&&child.parentContextualReceiptSha256===V4_PARENT_CTX_SHA
      &&child.prefixV3ReceiptSha256===RECEIPT_SHA&&child.prefixV3PlanSha256===PLAN_SHA
      &&child.prefixV3CollapsePlanSha256===COLLAPSE_SHA&&n(child.parentEntries)===138
      &&n(child.preservedHelperFile)===n(receipt.helperFile)
      &&child.preservedHelperSha256===createHash('sha256').update(hexBytes(receipt.helperHex)).digest('hex').toUpperCase();
    const exactV4r3=((digest===V4R3_ROM_SHA&&ctx?.entries?.length===159)||(digest===V4R4_ROM_SHA&&ctx?.entries?.length===163)||([V4R5_ROM_SHA,POLICY_V5_ROM_SHA].includes(digest)&&ctx?.entries?.length===166))&&ctx?.candidateSha256===digest
      &&child?.schema==='rs3-prefix-separator-parent-binding-v1'&&child.parentRomSha256===ROM_SHA
      &&child.parentPatchSha256===V4_PATCH_SHA&&child.parentContextualReceiptSha256===V4_PARENT_CTX_SHA
      &&child.prefixV3ReceiptSha256===RECEIPT_SHA&&child.prefixV3PlanSha256===PLAN_SHA
      &&child.prefixV3CollapsePlanSha256===COLLAPSE_SHA&&n(child.parentEntries)===138
      &&n(child.preservedHelperFile)===n(receipt.helperFile)
      &&child.preservedHelperSha256===createHash('sha256').update(hexBytes(receipt.helperHex)).digest('hex').toUpperCase();
    if(!ctx||(!exactBase&&!exactV4&&!exactV4r2&&!exactV4r3)||!Array.isArray(ctx.entries))
      throw new Error('prefix-separator requires exact contextual metadata');
    const helper=hexBytes(receipt.helperHex),helperFile=n(receipt.helperFile),helperCpu=fileToCpu(helperFile);
    const gateRom=softValidated?.parentRom||rom;
    if(softValidated&&softValidated.fallbackCpu!==helperCpu)throw new Error('soft padding fallback differs from authenticated prefix helper');
    if(!helper.length||helperFile<0||helperFile+helper.length>rom.length||!same(Array.from(rom.subarray(helperFile,helperFile+helper.length)),Array.from(helper))
      ||n(receipt.gateCallFile)!==0xff28||gateRom[0xff28]!==0x22||gateRom[0xff29]!==((helperCpu)&255)||(gateRom[0xff2a]|gateRom[0xff2b]<<8)!==(helperCpu>>>8))
      throw new Error('prefix-separator installed helper/gate mismatch');
    const contextualById=new Map(ctx.entries.map(e=>[e.id,e]));
    if(contextualById.size!==ctx.entries.length)throw new Error('duplicate contextual receipt id');
    const padKeys=new Map();for(const r of receipt.registeredPadRows){const key=`${n(r.cpuBank)}:${n(r.address)}`;if(padKeys.has(key))throw new Error('duplicate prefix helper address');padKeys.set(key,r);}
    const prefixSources=new Set(),prefixTargets=new Set();let prefixCount=0,dedupCount=0;
    for(const raw of receipt.entries){
      const source=n(raw.source),sourceBack=n(raw.sourceBack),provider=n(raw.baselineProviderAt),target=n(raw.target),payload=hexBytes(raw.payloadHex),baseline=hexBytes(raw.baselinePayloadHex),ctxRow=contextualById.get(raw.id);
      if(!Number.isInteger(source)||!Number.isInteger(sourceBack)||!Number.isInteger(provider)||!Number.isInteger(target)||prefixSources.has(source)||prefixTargets.has(target)
        ||!ctxRow||ctxRow.source!==source||ctxRow.target!==target||ctxRow.back!==n(raw.relayBack)||ctxRow.scope!=='source'||ctxRow.operation!==raw.operation
        ||!Array.isArray(ctxRow.returnCursors)||ctxRow.returnCursors.length!==0||ctxRow.payloadHex!==raw.payloadHex
        ||!same(Array.from(rom.subarray(target,target+payload.length)),Array.from(payload))
        ||!same(Array.from(rom.subarray(provider,provider+baseline.length)),Array.from(baseline)))
        throw new Error('prefix-separator source/target/payload identity mismatch');
      prefixSources.add(source);prefixTargets.add(target);
      if(raw.baselineKind==='arena'){
        const arena=(patch.arenaRows||[]).map(r=>r.map(n)).filter(r=>r[0]===source&&r[1]===provider&&r[2]===baseline.length);
        if(arena.length!==1||baseline.length<4||baseline.at(-4)!==0xff)throw new Error('prefix-separator arena ownership/BACK mismatch');
        const baselineBack=cpuToFile((baseline.at(-3))|(baseline.at(-2)<<8)|(baseline.at(-1)<<16));
        if(baselineBack!==n(raw.actualBaselineBack))throw new Error('prefix-separator exact baseline BACK mismatch');
      }else if(raw.baselineKind==='direct'){
        if(provider!==source||baseline.length!==sourceBack-source)throw new Error('prefix-separator direct span mismatch');
      }else throw new Error('unknown prefix-separator baseline kind');
      if(raw.operation==='prepend-literal-ASCII-space'){
        const expected=raw.baselineKind==='arena'?Buffer.from([0x50,0xff,provider&255,(fileToCpu(provider)>>>8)&255,fileToCpu(provider)>>>16])
          :Buffer.from([0x50,...baseline,0xff,sourceBack&255,(fileToCpu(sourceBack)>>>8)&255,fileToCpu(sourceBack)>>>16]);
        const cpu=fileToCpu(target),registered=padKeys.get(`${cpu>>>16}:${target&0xffff}`);
        if(!payload.equals(expected)||!registered||n(registered.head)!==0x50||n(registered.source)!==source||layoutTokens.has(target))
          throw new Error('prefix-separator prepend recipe/helper identity mismatch');
        layoutTokens.set(target,{kind:'conditional-skip-line-start',len:1,source,arena:target,back:sourceBack,headByte:0x50,nativeHalfPhase:0,
          recipe:'prefix-separator-overlay-v3',modelAssumption:'installed S_pad consumes this exact prefix only at normalized line-head column 0 and half-phase 0'});prefixCount++;
      }else if(raw.operation==='remove-literal-duplicate-already-emitted-by-macro'){
        const removed=n(raw.removedBytes);if(!Number.isInteger(removed)||removed<=0||!payload.equals(baseline.subarray(removed))||layoutTokens.has(target))throw new Error('prefix-separator deduplicate recipe mismatch');dedupCount++;
      }else throw new Error('unknown prefix-separator recipe');
    }
    if(prefixCount!==33||dedupCount!==3)throw new Error('prefix-separator recipe count mismatch');
    const collapse=receipt.entry,collapseCtx=contextualById.get(collapse?.id),old=hexBytes(collapse?.baselinePayloadHex),payload=hexBytes(collapse?.payloadHex),marker=hexBytes(collapse?.markerHex),ms=n(collapse?.markerStart)-n(collapse?.baselineArena),me=n(collapse?.markerEnd)-n(collapse?.baselineArena);
    const rebuilt=Buffer.concat([old.subarray(0,ms),Buffer.from([0x50]),old.subarray(me)]);
    if(collapse?.id!=='prefix-019E-collapse-FD64'||n(collapse.source)!==0x4596a1||n(collapse.sourceBack)!==0x4596b1||n(collapse.baselineArena)!==0x6f9d45
      ||n(collapse.markerStart)!==0x6f9d52||n(collapse.markerEnd)!==0x6f9d96||marker.length!==68||marker[0]!==0xfd||marker[1]!==0xfd||marker[66]!==0xfd||marker[67]!==0xfd||!Array.from(marker.subarray(2,66)).every(b=>b===0x50)
      ||!payload.equals(rebuilt)||!same(Array.from(rom.subarray(n(collapse.target),n(collapse.target)+payload.length)),Array.from(payload))
      ||!collapseCtx||collapseCtx.source!==0x4596a1||collapseCtx.target!==n(collapse.target)||collapseCtx.back!==0x4596b1||collapseCtx.scope!=='source'||collapseCtx.payloadHex!==collapse.payloadHex)
      throw new Error('prefix-separator 019E collapse recipe mismatch');
  };
  const makeContextualV4r2MarkerToken=()=>{
    const digest=softValidated?.baselineSha256||createHash('sha256').update(rom).digest('hex').toUpperCase();
    const markerParents=new Map([['B03495EE03DD978000FE2C22D8D6A07AA2AFB5F898782D308F7D1F728624A7FA',157],['936C3B8B00CB16952130FAC2297417A86DCA30130F325FA48A20972137D56D70',159]]);
    markerParents.set('3944E38338CA29B82ADBC2248E761041046577E7E3E41B0E471F4FCE497ABE42',163);
    markerParents.set('F93C40B341928179B1FB08F688BE6A5FA6640553861F023F838CCFA779F2CB6D',166);
    markerParents.set('0A67D9A5775F774B2060EA33A5D8AD1BB69C64C85041BC2C9994645CBC298DB0',166);
    if(!markerParents.has(digest))return;
    const patch=softValidated?.parentPatch||opts.layoutPatch,ctx=patch?.contextualText,spans=ctx?.newMarkerSpans;
    if(ctx?.candidateSha256!==digest||ctx?.entries?.length!==markerParents.get(digest)||!Array.isArray(spans)||spans.length!==1)
      throw new Error('contextual-v4r2 marker requires exact contextual metadata');
    const raw=spans[0],source=n(raw.source),target=n(raw.target),back=n(raw.back),start=n(raw.markerStart),end=n(raw.markerEnd),padStart=n(raw.padStart),padEnd=n(raw.padEnd);
    const payload=hexBytes(raw.payloadHex),body=hexBytes(raw.bodyHex),marker=hexBytes(raw.markerHex),entry=ctx.entries.find(e=>e.id===raw.id);
    if(raw.id!=='source-literal-7BD660'||raw.kind!=='FD64'||source!==0x7bd660||back!==0x7bd673||n(raw.sourceBack)!==back
      ||!entry||entry.scope!=='source'||entry.source!==source||entry.target!==target||entry.back!==back||entry.payloadHex!==raw.payloadHex
      ||start!==target+body.length||end!==start+68||padStart!==start+2||padEnd!==start+66
      ||marker.length!==68||marker[0]!==0xfd||marker[1]!==0xfd||marker[66]!==0xfd||marker[67]!==0xfd||!Array.from(marker.subarray(2,66)).every(b=>b===0x50)
      ||!payload.equals(Buffer.concat([body,marker,Buffer.from([0xff,back&255,(fileToCpu(back)>>>8)&255,fileToCpu(back)>>>16])]))
      ||!same(Array.from(rom.subarray(target,target+payload.length)),Array.from(payload))||layoutTokens.has(start))
      throw new Error('contextual-v4r2 appended FD64 identity mismatch');
    layoutTokens.set(start,{kind:'adaptive-padding',len:68,source,originalTokenOffset:null,markerStart:start,padStart,padEnd,markerEnd:end,owner:source,back,arena:target,recipe:'contextual-v4r2-appended-FD64'});
  };
  const makeRemainingTextSupplementalMarkerTokens=()=>{
    const patch=opts.layoutPatch,receipt=patch?.remainingTextSpacingBatch;if(!receipt)return;
    // A verified later context-table overlay keeps these inherited payloads.
    // Authenticate their parent hash through the exact reversible receipt;
    // the checks below still compare every marker and entry to the actual ROM.
    if(!softValidated||softValidated.actualCandidateSha256!==validationBase.patch?.contextualText?.candidateSha256)throw new Error('remaining-text relocated markers require authenticated outer stream');
    const spans=receipt.contextual?.supplementalMarkerSpans;if(!Array.isArray(spans))throw new Error('remaining-text supplemental marker receipt missing');
    for(const raw of spans){
      const source=n(raw.source),target=n(raw.target),back=n(raw.back),start=n(raw.markerStart),end=n(raw.markerEnd),padStart=n(raw.padStart),padEnd=n(raw.padEnd),marker=hexBytes(raw.markerHex),payload=hexBytes(raw.payloadHex),body=hexBytes(raw.bodyHex),suffix=hexBytes(raw.suffixHex);
      const entry=receipt.contextual.newEntries.find(e=>n(e.source)===source&&n(e.target)===target&&e.payloadHex===raw.payloadHex),ctxEntry=patch.contextualText.entries.find(e=>n(e.source)===source&&n(e.target)===target&&e.payloadHex===raw.payloadHex),ctxSpan=patch.contextualText.newMarkerSpans.find(s=>s.id===raw.id);
      const offset=start-target,tail=payload.subarray(payload.length-4),backFile=tail.length===4&&tail[0]===0xff?cpuToFile(tail.readUIntLE(1,3)):null;
      if(raw.kind!=='FD64'||raw.typedTokenReceipt!=='remaining-text-supplemental-FD64'||!entry||!ctxEntry||!ctxSpan
        ||offset!==body.length||end!==start+68||padStart!==start+2||padEnd!==end-2||marker.length!==68
        ||marker[0]!==0xfd||marker[1]!==0xfd||marker[66]!==0xfd||marker[67]!==0xfd||!Array.from(marker.subarray(2,66)).every(b=>b===0x50)
        ||!payload.equals(Buffer.concat([body,marker,suffix,tail]))||backFile!==back||!same(Array.from(rom.subarray(target,target+payload.length)),Array.from(payload))
        ||n(ctxSpan.markerStart)!==start||n(ctxSpan.markerEnd)!==end||ctxSpan.markerHex!==raw.markerHex||layoutTokens.has(start))
        throw new Error(`remaining-text supplemental FD64 identity mismatch @${start.toString(16)}`);
      layoutTokens.set(start,{kind:'adaptive-padding',len:68,source,originalTokenOffset:null,markerStart:start,padStart,padEnd,markerEnd:end,owner:source,back,arena:target,recipe:'remaining-text-supplemental-relocated-FD64'});
    }
  };
  // 2026-09-15 (0x0F79 / 7BD660 실측): 정식 패킹은 C2 생성기가 payload 안에 FD64 마커를 굽고 `contextualText.markerSpans` 로만
  //   신고한다(newMarkerSpans/candidateSha256 없음). makeContextualV4r2MarkerToken 은 부모 ROM SHA 화이트리스트에 걸려 조기 반환하므로
  //   그 마커가 layoutTokens 에 없었고 decKo 가 0x50 64개를 공백 글리프로 풀어 전폭 빈 줄 + 고아 행이 생겼다(실코어에는 없다).
  //   ROM 단계 관문(build_julian_rom_v1)과 같은 조건으로만 등재한다: 생성기 신원 · 자기 payload 할당 안 · ROM 68바이트 정확한 모양 · entry.payloadHex 일치.
  const makeContextualGeneratorMarkerTokens=()=>{
    const patch=opts.layoutPatch,ctx=patch?.contextualText;
    if(ctx?.generator!=='bokuno-c2-text-generators-v1'||!Array.isArray(ctx.markerSpans)||!ctx.markerSpans.length)return;
    for(const raw of ctx.markerSpans){
      const start=n(raw.markerStart),end=n(raw.markerEnd),padStart=n(raw.padStart),padEnd=n(raw.padEnd),source=n(raw.source);
      if(layoutTokens.has(start))continue;
      const entry=(ctx.entries||[]).find(e=>e.id===raw.id);
      const alloc=(ctx.allocation||[]).find(a=>a.kind==='payload:'+raw.id);
      if(!entry||!alloc||n(entry.source)!==source)throw new Error(`contextual generator marker lacks its payload entry @${start.toString(16)}`);
      const target=n(entry.target),payload=hexBytes(entry.payloadHex),off=start-target;
      if(start<n(alloc.start)||end>n(alloc.end))throw new Error(`contextual generator marker outside its allocation @${start.toString(16)}`);
      if(end!==start+68||padStart!==start+2||padEnd!==end-2||off<0||off+68>payload.length)throw new Error(`contextual generator marker geometry mismatch @${start.toString(16)}`);
      const marker=payload.subarray(off,off+68);
      if(marker[0]!==0xfd||marker[1]!==0xfd||marker[66]!==0xfd||marker[67]!==0xfd||!Array.from(marker.subarray(2,66)).every(b=>b===0x50)
        ||!same(Array.from(rom.subarray(target,target+payload.length)),Array.from(payload)))throw new Error(`contextual generator marker shape mismatch in ROM @${start.toString(16)}`);
      const tail=payload.subarray(payload.length-4);
      const back=tail[0]===0xff?cpuToFile(tail.readUIntLE(1,3)):n(entry.back);
      if(back!==n(entry.back))throw new Error(`contextual generator marker BACK mismatch @${start.toString(16)}`);
      layoutTokens.set(start,{kind:'adaptive-padding',len:68,source,originalTokenOffset:null,markerStart:start,padStart,padEnd,markerEnd:end,owner:source,back,arena:target,recipe:'contextual-generator-payload-FD64'});
    }
  };
  // 2026-09-17: 정식 빌드(C2 생성기 rs3_c2_text_generators_v1, patch.textHelperChain)의 zero·soft·조건부 공백 행.
  //   이 모델은 옛 오버레이 영수증(patch.softPadding·조건부 공백 7행 영수증)만 읽어서, 정식 빌드 v26 전수 덤프에 soft 41·zero 3 이
  //   딱 개행(적응 패딩)으로, 조건부 공백 57 중 51 이 늘 공백으로 찍혔다(전체 본문 레이아웃 검사 거짓 결함 — 3C85E9 「이것은 대장군의|서신입니다.」).
  //   런타임 규칙은 생성기와 같다: soft = rs3_soft_padding_v3(strictFit: 구분 1 + 뒤 덩어리 반칸 < 남은 폭일 때만 한 칸 띄우고 이어 씀),
  //   zero = 구분 0 strictFit, 조건부 공백 = 표 주소의 50/51 머리 바이트를 줄 머리(열 0)에서만 건너뜀. 헬퍼 바이트·표지 바이트를 롬에서 확인한다.
  const makeFormalTextHelperChainTokens=()=>{
    const chain=opts.layoutPatch?.textHelperChain;
    if(!chain||softValidated)return;
    if(chain.schema!=='bokuno-c2-text-generators-v1:text-helper-chain')throw new Error('unsupported text helper chain schema');
    for(const [name,part] of [['conditional',chain.conditional],['soft',chain.soft],['zero',chain.zero]]){
      if(!part)continue;
      const bytes=hexBytes(part.hex);
      if(!same(Array.from(rom.subarray(n(part.file),n(part.file)+bytes.length)),Array.from(bytes)))throw new Error(`formal ${name} helper bytes differ in ROM`);
    }
    const marker=(row,kind)=>{
      const token=layoutTokens.get(n(row.markerStart));
      if(!token||token.kind!=='adaptive-padding'||token.source!==n(row.source)||token.markerEnd!==n(row.markerEnd)||n(row.padStart)!==n(row.markerStart)+2||n(row.padEnd)!==n(row.padStart)+64)
        throw new Error(`formal ${kind} marker lacks its adaptive padding owner @${n(row.markerStart).toString(16)}`);
      const suffix=n(row.suffixHalfCells);
      if(!Number.isInteger(suffix)||suffix<0||suffix>64)throw new Error(`formal ${kind} suffix width invalid @${n(row.markerStart).toString(16)}`);
      return {token,suffix};
    };
    for(const row of chain.soft?.rows||[]){
      const {token,suffix}=marker(row,'soft');
      layoutTokens.set(n(row.markerStart),{...token,soft:true,suffixHalfCells:suffix,strictFit:true,recipe:'formal-soft-v3'});
    }
    for(const row of chain.zero?.rows||[]){
      const {token,suffix}=marker(row,'zero');
      if(token.soft===true)throw new Error('formal zero-separator marker overlaps soft padding');
      layoutTokens.set(n(row.markerStart),{...token,soft:true,zeroSeparator:true,strictFit:true,suffixHalfCells:suffix,recipe:'formal-zero-separator'});
    }
    for(const row of chain.conditional?.rows||[]){
      const file=n(row.file),head=n(row.head);
      if(![0x50,0x51].includes(head)||rom[file]!==head)throw new Error(`formal conditional blank head byte mismatch @${file.toString(16)}`);
      const existing=layoutTokens.get(file);
      if(existing){
        if(existing.kind==='conditional-skip-line-start'&&existing.headByte===head)continue;
        throw new Error(`formal conditional blank collides with another layout token @${file.toString(16)}`);
      }
      layoutTokens.set(file,{kind:'conditional-skip-line-start',len:1,source:row.source===null||row.source===undefined?file:n(row.source),back:file+1,headByte:head,nativeHalfPhase:0,
        recipe:'formal-conditional-blank',position:row.position,provider:row.provider});
    }
  };
  makeAdaptiveTokens();
  makeF9dToken();
  makeConditionalLeadingTokens();
  makePrefixSeparatorTokens();
  makeContextualV4r2MarkerToken();
  makeRemainingTextSupplementalMarkerTokens();
  makeContextualGeneratorMarkerTokens();
  makeFormalTextHelperChainTokens();
  if(softValidated)for(const row of softValidated.rows){
    const token=layoutTokens.get(row.markerStart);
    if(!token||token.kind!=='adaptive-padding'||token.source!==row.source||token.markerEnd!==row.markerEnd)throw new Error('soft marker lacks authenticated original padding owner');
    layoutTokens.set(row.markerStart,{...token,soft:true,suffixHalfCells:row.suffixHalfCells,...(softValidated.helperVersion===3?{strictFit:true}:{})});
  }
  if(softValidated)for(const row of softValidated.zeroRows||[]){
    const token=layoutTokens.get(row.markerStart);
    if(!token||token.kind!=='adaptive-padding'||token.source!==row.source||token.markerEnd!==row.markerEnd)throw new Error('zero-separator marker lacks authenticated original padding owner');
    if(token.soft===true)throw new Error('zero-separator marker overlaps ordinary soft padding');
    layoutTokens.set(row.markerStart,{...token,soft:true,zeroSeparator:true,strictFit:true,suffixHalfCells:row.suffixHalfCells});
  }
  if(softValidated){
    const h=softValidated.head;
    if(layoutTokens.has(h.headFile))throw new Error('spacing head token collision');
    layoutTokens.set(h.headFile,{kind:'conditional-skip-line-start',len:1,source:h.headFile,back:h.headFile+1,headByte:h.headByte,nativeHalfPhase:0,recipe:'spacing-native-head-v1'});
    for(const e of softValidated.extraHeads){
      if(layoutTokens.has(e.headFile))throw new Error('additional spacing head token collision');
      layoutTokens.set(e.headFile,{kind:'conditional-skip-line-start',len:1,source:e.source,back:e.headFile+1,headByte:0x50,nativeHalfPhase:0,recipe:'spacing-additional-head-v1'});
    }
  }
  const layoutTokenAt=pc=>layoutTokens.get(pc)||null;
  const layoutSpanAt=createPaddingIntervalLookup(layoutTokens.values());
  // Contextual payloads live in free space outside the FF:E400/E600 bank ranges. On the CPU the
  // dispatcher HIT sets $7F:FE70 and the carrier gate (RL/RLN at FF:E297) accepts the carrier
  // before consulting the ranges (build_julian_rom_v1 RL_BODY). Payload bytes are reachable only
  // through a hit, so a static equivalent is: inside a receipt payload allocation => allowed.
  const contextualPayloadRanges=(opts.layoutPatch?.contextualText?.allocation||[])
    .filter(a=>typeof a.kind==='string'&&a.kind.startsWith('payload:'))
    .map(a=>[Number(a.start),Number(a.end)]).sort((x,y)=>x[0]-y[0]);
  const inContextualPayload=pc=>{let lo=0,hi=contextualPayloadRanges.length;while(lo<hi){const m=(lo+hi)>>1;const r=contextualPayloadRanges[m];if(pc<r[0])hi=m;else if(pc>=r[1])lo=m+1;else return true;}return false;};
  function carrierAllowed(pc) {
    const bank=fileToCpu(pc)>>>16;
    if(bank===0xe8)return true;
    // 2026-09-15: payload spans are NOT implicitly carrier-allowed -- the CPU gate only honours FF via the $FF:E600 region
    //   list (now registered by the packer) or the arena fast path. Keeping the model honest caught the missing regions.
    if(!ranges.has(bank)){
      const ix=word(0x3fe400+bank*2),rs=[];
      if(ix!==65535)for(let o=ix,n=0;n<4096;n++,o+=4){
        const start=word(0x3fe600+o),end=word(0x3fe602+o);if(!end)break;
        rs.push([start,end]);
      }
      ranges.set(bank,rs);
    }
    const lo=pc&65535;return ranges.get(bank).some(([s,e])=>s<=lo&&lo<e);
  }
  function opAt(pc){
    if(!Number.isInteger(pc)||pc<0||pc>=rom.length)return null;
    const layout=layoutTokenAt(pc);
    if(layout){
      if(layout.kind==='adaptive-padding')return {off:pc,len:layout.len,kind:'layout',note:'adaptive-padding',layout,hex:rom.subarray(pc,pc+layout.len).toString('hex')};
      return {off:pc,len:1,kind:'glyph',slot:layout.headByte-0x50,note:'conditional-skip-line-start',layout,hex:layout.headByte.toString(16).padStart(2,'0')};
    }
    const b=rom[pc],h=shadow.active(pc);
    if(h)return {off:pc,len:0,kind:'redirect',note:'shadow',target:h.target,directory:h,hex:''};
    if(b===0x4f&&rom[pc+1]===0x48){const q=shadow.lookup(pc+1);if(q)return {off:pc,len:0,kind:'redirect',note:'4F48-shadow',target:q.target,directory:q,hex:''};}
    // C0:1C8C -> FEE0 is the shared 4F no-op handler. The 4F dispatcher
    // has already advanced to the subopcode before FEE0 checks its shadow hook.
    if(b===0x4f&&word(0x3b36+rom[pc+1]*2)===0x1c8c){
      const q=shadow.lookup(pc+1);
      if(q)return {off:pc,len:0,kind:'redirect',note:'4F-nop-shadow',target:q.target,directory:q,hex:''};
      return {off:pc,len:2,kind:'nop',note:'4F-ROM-shared-nop',hex:rom.subarray(pc,pc+2).toString('hex')};
    }
    if(b>=0xfd&&carrierAllowed(pc)){
      if(b===0xfd)return {off:pc,len:1,kind:'nop',note:'candidate-FD',hex:'fd'};
      const len=b===0xfe?3:4;
      if(pc+len>rom.length)return {off:pc,len:0,kind:'cmd',note:'unknown',hex:'truncated-carrier'};
      const cb=b===0xfe?rom[0x3fe300+(fileToCpu(pc)>>>16)]:rom[pc+3];
      const targetCpu=cb*65536+word(pc+1),target=cpuToFile(targetCpu);
      return {off:pc,len,kind:'redirect',note:b===0xfe?'FE-warp':'FF-back',target,targetCpu,hex:rom.subarray(pc,pc+len).toString('hex')};
    }
    if(b>=0x50)return {off:pc,len:1,kind:'glyph',slot:b-0x50,note:'single-glyph',hex:''};
    const ext=rom[0x59e200+b];
    if(ext&&rom[pc+1]<0x10){
      if(b===0x46)return {off:pc,len:1,kind:'nop',note:'46-low-operand',hex:'46'};
      if(b===0x18)return {off:pc,len:2,kind:'cmd',note:'objOp',hex:rom.subarray(pc,pc+2).toString('hex').match(/../g).join(' ')};
    }
    if((b>=0x20&&b<=0x23)||(ext&&rom[pc+1]>=0x10)){
      if(pc+1>=rom.length)return {off:pc,len:0,kind:'cmd',note:'unknown',hex:'truncated-glyph'};
      return {off:pc,len:2,kind:'glyph',slot:((ext?ext:b)-0x20)<<8|rom[pc+1],note:'wide-glyph',hex:''};
    }
    if(b===0x4c&&![0x08,0x2e,0x4e].includes(rom[pc+1]))return {off:pc,len:2,kind:'cmd',note:'nativeCall',hex:rom.subarray(pc,pc+2).toString('hex').match(/../g).join(' ')};
    return native.opAt(pc);
  }
  const contextualOpAt=(pc,savedReturnFiles)=>{
    const hit=contextualDispatch?.resolve(pc,savedReturnFiles);
    return hit?{off:pc,len:0,kind:'redirect',note:'contextual-shadow',target:hit.target,directory:hit,hex:''}:null;
  };
  return {...native,opAt,contextualOpAt,contextualDispatch,carrierAllowed,shadow,layoutTokenAt,layoutSpanAt,source:'candidate-rom-single-token'};
}
