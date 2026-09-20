// 율리안 반칸 한국어 **독립 롬** 빌더 (2026-08-24).
//
//   Lua 에이전트 없이 굽는다.  열쇠는 게이팅을 호스트(JS/Lua)에서 **롬 안의
//   어셈 주소 검사**로 옮긴 것: 다섯 패치 자리마다 "커서가 우리 구간인가"를
//   묻고, 아니면 스톡 코드를 그대로 태운다.  그래서 일본어 진행이 안 깨진다.
//     우리 구간 = $E8:**** (아레나) 또는 $FC:142B..23C0 (율리안 스크립트)
//
//   패치 다섯 (전부 3바이트 치환 — 스톡 명령 경계에 맞춘 실측 좌표):
//     0x3F2780  18 69 0E     CLC:ADC #$0E   → JSR TPEN    (걸음 8/14 분기)
//     0x3F27B6  AC A5 D5     LDY $D5A5      → JMP T27B6   (dest/col 이양)
//     0x3F23EF  20 21 29     JSR $2921      → JSR T23EF   (캔버스 슬라이드)
//     0x3F246A  20 48 29     JSR $2948      → JMP T246A   (펜8 꼬리)
//     0x001C29  85 8D 64 8E  STA/STZ        → JMP STUB    (FE/FF 워프 캐리어)
//   루틴은 뱅크별 자유 공간에: $FF:E1C0(합성기 쪽) · $C0:FF10(VM 쪽).
//   각 뱅크에 R(구간 판정, 캐리 반환) 사본을 둔다 — JSR 는 뱅크 로컬이다.
//
//   **일본어는 깨진다**(의도): 글리프 슬롯 0x51+·와이드 0x20~0x23 페이지가
//   한글로 덮여 우리 구간 밖 일본어가 한글 글자로 보인다.  게임 진행·메뉴
//   조작·이벤트 흐름은 그대로다(코드 경로가 스톡이므로).
//
//   산출: out/bokuno_korean_julian_halfcell_v1.smc  (읽기 전용 원본은 안 건드림)
//   사용: node tools/build_julian_rom_v1.mjs
import path from 'path';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolveConditionalLeadingSpaceRows, buildCombinedPadSkipWrapper } from './rs3_conditional_leading_space_v1.mjs';
import {verifyBokunoPatchInputs} from './bokuno_build_input_guard_v1.mjs';
import {verifyOutputEngine} from './rs3_integrated_output_engine_v1.mjs';
import {verifyNativeTableRepairs} from './rs3_native_table_repairs_v1.mjs';
import {installC2Hooks, verifyC2Install} from './rs3_c2_text_generators_v1.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');
const ROOT = path.resolve(PROJECT, '..');
const CANONICAL_OUT = path.join(PROJECT, 'out');
const BUILD_OUT = process.env.RS3_BUILD_OUT
  ? path.resolve(PROJECT, process.env.RS3_BUILD_OUT)
  : CANONICAL_OUT;
if (BUILD_OUT !== CANONICAL_OUT && !BUILD_OUT.startsWith(`${PROJECT}${path.sep}`)) {
  throw new Error(`RS3_BUILD_OUT은 프로젝트 안쪽만 허용: ${BUILD_OUT}`);
}
mkdirSync(BUILD_OUT, { recursive: true });

const rom = Buffer.from(readFileSync(path.join(ROOT, 'bokuno_jp.smc')));
// 루트는 환경변수로 (기본 julian).  RS3_ROUTE=segC800 이면 카타리나 루트.
// 패치 빌더와 **같은 변수**를 봐야 한다 — 안 그러면 옛 패치를 굽는다.
const ROUTE = process.env.RS3_LEDGERS || process.env.RS3_ROUTE || 'julian';
const TAG = ROUTE.replace(/[:,]/g, '_');
const patchFile=path.join(BUILD_OUT, `halfcell_${TAG}_patch_v1.json`),patchBytes=readFileSync(patchFile);
const patchInputIdentity=verifyBokunoPatchInputs({rom,patchBytes,patchFile,project:PROJECT});
console.log(`Bokuno input identity: ${patchInputIdentity.status}`);
const patch = JSON.parse(patchBytes.toString('utf8'));
const PAD_OVERRIDE_PATH = path.join(PROJECT, 'runtime', 'forced_newline_arena_overrides_v1.json');
const padOverrides = JSON.parse(readFileSync(PAD_OVERRIDE_PATH, 'utf8')).rows || [];

// ---- ① 데이터 패치 (글리프·사전·행·아레나) ----
for (const [off, hex] of patch.writes) {
  const b = Buffer.from(hex, 'hex');
  b.copy(rom, off);
}

// Authored line breaks that do not own a source 0x24 are represented as an
// arena-only FD FD + 0x50x64 + FD FD span.  The renderer-side helper proves
// the same bounded pattern before eliding its post-wrap blanks; ordinary
// spaces, source 0x24, FE and FF retain their stock paths.
const ADAPTIVE_PAD_SPACES = 64;
const ADAPTIVE_PAD_FILE = 0x3efe00;
const ADAPTIVE_PAD_CAP = 0x180;                     // $FE:FE00..FF7F, verified free by source policy
const cpuBankOfFile = (bank) => bank <= 0x3f ? bank + 0xc0 : bank;
const adaptivePadding = patch.adaptivePadding ?? null;
let ADAPTIVE_PADDING = null;
if (adaptivePadding !== null) {
  if (adaptivePadding.schema !== 'adaptive-authored-padding-v1'
      || Number(adaptivePadding.spaces) !== ADAPTIVE_PAD_SPACES
      || !Array.isArray(adaptivePadding.spans)) {
    throw new Error('adaptive authored-padding manifest contract mismatch');
  }
  const spans = adaptivePadding.spans;
  // An empty, route-local manifest is a normal partial-ledger result: omit
  // both helpers.  Nonempty manifests must prove every marker belongs to one
  // atomic arena allocation that ends in its own FF/BACK record.
  if (spans.length) {
    if (!Array.isArray(adaptivePadding.rows)) throw new Error('adaptive padding rows missing');
    const expected = new Set();
    const writeAt = new Map();
    for (const [off, hex] of patch.writes || []) {
      writeAt.set(off, Buffer.from(hex, 'hex'));
    }
    for (const span of spans) {
    const fields = ['source', 'markerStart', 'padStart', 'padEnd', 'markerEnd'];
    if (fields.some(k => !Number.isInteger(span[k]))) throw new Error('adaptive padding span has non-integer offset');
    const { markerStart, padStart, padEnd, markerEnd } = span;
    if (markerStart < 0 || markerEnd > rom.length || padStart !== markerStart + 2
        || padEnd !== padStart + ADAPTIVE_PAD_SPACES || markerEnd !== padEnd + 2
        || (markerStart >>> 16) !== ((markerEnd - 1) >>> 16)) {
      throw new Error(`adaptive padding span shape mismatch @${markerStart.toString(16)}`);
    }
    if (expected.has(markerStart)) throw new Error(`duplicate adaptive padding marker @${markerStart.toString(16)}`);
    if (rom[markerStart] !== 0xfd || rom[markerStart + 1] !== 0xfd
        || rom[padEnd] !== 0xfd || rom[padEnd + 1] !== 0xfd
        || !rom.subarray(padStart, padEnd).every(byte => byte === 0x50)) {
      throw new Error(`adaptive padding bytes mismatch @${markerStart.toString(16)}`);
    }
    const row = adaptivePadding.rows.filter(r => Number(r.source) === span.source
      && Number.isInteger(r.arena) && r.arena <= markerStart && markerEnd <= r.arena + (writeAt.get(r.arena)?.length ?? -1));
    if (row.length !== 1) throw new Error(`adaptive padding marker has no unique atomic arena row @${markerStart.toString(16)}`);
    if ((patch.writes || []).filter(([off]) => off === row[0].arena).length !== 1) {
      throw new Error(`adaptive padding arena write is not unique @${row[0].arena.toString(16)}`);
    }
    const arena = writeAt.get(row[0].arena), recordEnd = arena.length - 4;
    if (recordEnd < 0 || arena[recordEnd] !== 0xff
        || !rom.subarray(row[0].arena, row[0].arena + arena.length).equals(arena)) {
      throw new Error(`adaptive padding atomic arena record mismatch @${markerStart.toString(16)}`);
    }
    const backBank = arena[recordEnd + 3] >= 0xc0 ? arena[recordEnd + 3] - 0xc0 : arena[recordEnd + 3];
    const back = (backBank << 16) | arena[recordEnd + 1] | (arena[recordEnd + 2] << 8);
    if (!Number.isInteger(row[0].back) || row[0].back !== back) {
      throw new Error(`adaptive padding BACK/source linkage mismatch @${markerStart.toString(16)}`);
    }
    const tokenBoundaries = new Set([0]);
    for (let p = 0; p < recordEnd;) {
      const byte = arena[p];
      if (byte === 0xfe || byte === 0xff) throw new Error(`adaptive padding control inside arena @${(row[0].arena + p).toString(16)}`);
      const two = (byte >= 0x20 && byte <= 0x23) || [0x18, 0x39, 0x3a, 0x3b, 0x46, 0x4a, 0x4b].includes(byte);
      if (p + (two ? 2 : 1) > recordEnd) throw new Error(`adaptive padding token crosses BACK @${(row[0].arena + p).toString(16)}`);
      p += two ? 2 : 1; tokenBoundaries.add(p);
    }
    const relativeStart = markerStart - row[0].arena, relativeEnd = markerEnd - row[0].arena;
    if (!tokenBoundaries.has(relativeStart) || !tokenBoundaries.has(relativeEnd)) {
      throw new Error(`adaptive padding marker is not glyph-token aligned @${markerStart.toString(16)}`);
    }
    expected.add(markerStart);
    }
    // v3② C2: FD64 markers authored inside generator-owned contextual payloads are not adaptive arena rows.
    // Admit only markers recorded by the generator and lying inside its own allocation.
    if (patch.contextualText?.generator === 'bokuno-c2-text-generators-v1') {
      for (const m of patch.contextualText.markerSpans || []) {
        const inAllocation = patch.contextualText.allocation.some((a) => m.markerStart >= a.start && m.markerEnd <= a.end);
        if (!inAllocation || expected.has(m.markerStart)) throw new Error(`C2 contextual marker outside its allocation @${m.markerStart.toString(16)}`);
        expected.add(m.markerStart);
      }
    }
  // The runtime matcher has no range table: it accepts only this exact marker
  // shape in a real ROM bank.  Search the baked bytes now so an accidental
  // FD/50 sequence can never become a renderer control path.
    const discovered = new Set();
    for (let at = rom.indexOf(0xfd); at >= 0; at = rom.indexOf(0xfd, at + 1)) {
    const markerEnd = at + 2 + ADAPTIVE_PAD_SPACES + 2;
    if (markerEnd > rom.length || rom[at + 1] !== 0xfd
        || (at >>> 16) !== ((markerEnd - 1) >>> 16)) continue;
    const cpuBank = cpuBankOfFile(at >>> 16);
    if (cpuBank < 0x40 || cpuBank === 0x7e || cpuBank === 0x7f) continue;
    const padStart = at + 2, padEnd = padStart + ADAPTIVE_PAD_SPACES;
    if (rom[padEnd] !== 0xfd || rom[padEnd + 1] !== 0xfd
        || !rom.subarray(padStart, padEnd).every(byte => byte === 0x50)) continue;
      discovered.add(at);
    }
    if (discovered.size !== expected.size || [...expected].some(at => !discovered.has(at))) {
      throw new Error(`adaptive padding matcher census mismatch manifest=${expected.size} rom=${discovered.size}`);
    }
    const overlapsHelper = (patch.writes || []).some(([off, hex]) => {
    const end = off + Buffer.from(hex, 'hex').length;
    return off < ADAPTIVE_PAD_FILE + ADAPTIVE_PAD_CAP && end > ADAPTIVE_PAD_FILE;
    });
    if (overlapsHelper) throw new Error('adaptive padding helper overlaps a patch write');
    ADAPTIVE_PADDING = { spans: spans.length, spaces: ADAPTIVE_PAD_SPACES };
  }
}

// One opt-in F9D padding row needs a renderer-side elision only when its
// seventeenth blank has already crossed a 14-cell line.  Derive its concrete
// arena terminal from the just-baked patch; never match a generic 0x50.
const padRows = padOverrides.filter(row => row.autoWrapPadding?.skipOverflowAtLineStart === true);
if (padRows.length > 1) throw new Error(`overflow padding rows ${padRows.length} (one registered row only)`);
let PAD_SKIP = null;
if (padRows.length === 1) {
  const row = padRows[0], source = Number.parseInt(row.startPc, 16);
  const width = Number(row.autoWrapPadding.windowWidth), spaces = Number(row.autoWrapPadding.trailingSpaces);
  if (source !== 0x73780a || row.backPc !== '737816' || row.forceNewlineArena !== true || width !== 14 || spaces !== 17) throw new Error('unrecognized F9D overflow-padding contract');
  const match = (patch.shadowRows || []).filter(entry => entry[0] === source);
  // A legacy partial ledger can omit this F9D arena completely.  It must then
  // retain its pre-helper renderer, while an all-ledger build must still fail
  // closed if the registered row disappears.
  if (match.length === 0 && ROUTE !== 'all') {
    console.log(`  F9D overflow-pad helper 생략 — ${ROUTE} patch에 $73780A 그림자 행 없음`);
  } else {
    if (match.length !== 1 || match[0][2] !== 0x7816) throw new Error('F9D shadow return contract mismatch');
    const arena = match[0][1];
    const arenaRow = (patch.arenaRows || []).filter(entry => entry[0] === source && entry[1] === arena);
    if (arenaRow.length !== 1) throw new Error('F9D atomic arena row missing');
    const recordEnd = arena + arenaRow[0][2];
    const atomic = (patch.writes || []).filter(([off, hex]) => {
      const bytes = Buffer.from(hex, 'hex');
      return off <= arena && off + bytes.length >= recordEnd;
    });
    if (atomic.length !== 1) throw new Error(`F9D atomic arena write count ${atomic.length}`);
    const [writeAt, writeHex] = atomic[0], writeBytes = Buffer.from(writeHex, 'hex');
    if (!rom.subarray(writeAt, writeAt + writeBytes.length).equals(writeBytes)) throw new Error('F9D arena write/readback mismatch');
    let at = arena;
    while (at < recordEnd) {
      const token = rom[at];
      if (token === 0xff) break;
      if (token === 0xfd || token === 0xfe) throw new Error(`F9D carrier inside padding record @${at.toString(16)}`);
      if (token >= 0x50) { at += 1; continue; }
      if (token >= 0x20 && token <= 0x23) { at += 2; continue; }
      throw new Error(`F9D arena token parse rejected ${token.toString(16)} @${at.toString(16)}`);
    }
    const last = at - 1;
    if (at + 4 !== recordEnd || rom[at] !== 0xff || !rom.subarray(at, recordEnd).equals(Buffer.from([0xff, 0x16, 0x78, 0x73]))) throw new Error('F9D arena FF/BACK mismatch');
    if (at - spaces <= arena || !rom.subarray(at - spaces, at).every(byte => byte === 0x50) || rom[at - spaces - 1] === 0x50) throw new Error('F9D exact trailing-space contract mismatch');
    const bank = last >>> 16, cpuBank = bank <= 0x3f ? bank + 0xc0 : bank;
    PAD_SKIP = { source, arena, last, cpuBank, address: last & 0xffff, backPc: 0x737816, width, spaces };
  }
}
const CONDITIONAL_LEADING_ROWS = resolveConditionalLeadingSpaceRows(rom, patch, { allowMissing: ROUTE !== 'all' });
const PAD_RUNTIME = PAD_SKIP !== null || ADAPTIVE_PADDING !== null || CONDITIONAL_LEADING_ROWS.length !== 0;

// ---- 미니 어셈블러 (라벨 2패스) ----
// 항목: 숫자 = 리터럴 바이트 · {r8:'라벨'} = 상대분기 · {a16:'라벨'} = 절대주소
const assemble = (items, orgCpu) => {
  const labels = new Map();
  let pc = 0;
  for (const it of items) {
    if (typeof it === 'string') { labels.set(it, orgCpu + pc); continue; }
    pc += (typeof it === 'number') ? 1 : (it.r8 !== undefined ? 1 : 2);
  }
  const out = [];
  pc = 0;
  for (const it of items) {
    if (typeof it === 'string') continue;
    if (typeof it === 'number') { out.push(it & 0xff); pc += 1; continue; }
    if (it.r8 !== undefined) {
      const target = labels.get(it.r8);
      if (target === undefined) throw new Error(`라벨 없음: ${it.r8}`);
      const d = target - (orgCpu + pc + 1);
      if (d < -128 || d > 127) throw new Error(`분기 범위 초과: ${it.r8} (${d})`);
      out.push(d & 0xff); pc += 1; continue;
    }
    const target = it.a16 !== undefined
      ? (labels.has(it.a16) ? labels.get(it.a16) : (() => { throw new Error(`라벨 없음: ${it.a16}`); })())
      : it.w;
    out.push(target & 0xff, (target >> 8) & 0xff); pc += 2;
  }
  return { bytes: out, labels };
};
const W = (v) => ({ w: v });                        // 리터럴 16비트 워드

// ---- R: 커서가 우리 구간인가 (캐리=예).  A 파괴, 플래그폭 보존 ----
//   buffer=true 면 뱅크 0x7E(WRAM 버퍼 렌더)도 우리 것으로 친다.  매크로 이름은
//   사전 항목을 D56D 큐로 복사한 뒤 **뱅크를 0x7E 로 갈아** 그리기 때문이다
//   (실측: 합성 시점 커서 뱅크 fc 122 · e8 62 · **7e 2**).  단 이 완화는
//   **합성기 쪽에만** 준다 — 워프 훅까지 넓히면 버퍼 안의 0xFE/0xFF 바이트가
//   워프로 오독돼 폭주한다.  생산판은 프레임(D51F,X)의 바깥 뱅크까지 봐서
//   메뉴 버퍼와 대사 버퍼를 가르는 게 정답(지금은 파일럿이라 뭉뚱그린다).
//   **전엔 뱅크 하나와 주소창 하나가 어셈에 박혀 있었다** (`CMP #$FC` +
//   `$142B..$23C0`).  율리안 파일럿엔 충분했지만 확대하면 다른 대사 뱅크가
//   전부 스톡 14px 로 떨어지고, 캐리어(FD/FE/FF)도 R 통과 때만 도니 워프가
//   통째로 죽는다.  → **구간을 표로 뺀다.**  표는 패치가 선언한다(우리가
//   실제로 옮긴 자리만 반칸).
//
//   자료 구조 (둘 다 뱅크 $FF, 롱주소라 어느 뱅크에서 불러도 같은 걸 읽는다):
//     $FF:E400  색인 512B — 뱅크당 16비트, 목록 오프셋. 0xFFFF = 구간 없음
//     $FF:E600  목록      — [lo16][hi16] 4B 항목, 뱅크별 목록 끝은 hi=0
//   훑기는 **그 뱅크 목록만** 돈다(색인이 바로 짚어 준다) — 글자마다 도는
//   자리라 전체 선형 훑기(114구간)는 프레임을 넘긴다.
//
//   RL/RLN 은 롱콜(RTL)이고, 각 뱅크의 R 은 `JSL RL : RTS` 5바이트 트램펄린이다.
//   JSR 는 뱅크 로컬이라 사본이 필요한데, 본체까지 복제하면 $C0 자유 런(163B)이
//   넘친다 — 트램펄린이면 오히려 줄어든다.
const RL_BODY = (arenaBank) => [
  'RL',                                            // 버퍼($7E) 인정 — 합성기 쪽
  0x08,                                            // PHP
  0xe2, 0x20,                                      // SEP #$20
  // 커서 커밋 중(NMI가 다중 바이트 갱신을 찢은 순간) — 커밋은 항상 우리
  //   구간↔우리 구간이라 정답은 '우리'다. 찢긴 값 판정 금지(레이스 실증 2026-08-26).
  0xaf, 0x70, 0xfe, 0x7f,                          // LDA $7F:FE70 (커밋 플래그)
  0xd0, { r8: 'RL_hit0' },                         // BNE hit0
  0xa5, 0x7a,                                      // LDA $7A
  0xc9, arenaBank,                                 // CMP #아레나 뱅크 (빠른 길)
  0xf0, { r8: 'RL_hit0' },                         // BEQ hit0
  0xc9, 0x7e,                                      // CMP #$7E   WRAM 버퍼(이름 렌더)
  0xf0, { r8: 'RL_hit0' },                         // BEQ hit0
  0x80, { r8: 'RL_scan' },                         // BRA scan
  'RLN',                                           // 버퍼 미인정 — VM(워프) 쪽
  0x08,                                            // PHP
  0xe2, 0x20,                                      // SEP #$20
  0xaf, 0x70, 0xfe, 0x7f,                          // LDA $7F:FE70 (커밋 플래그)
  0xd0, { r8: 'RL_hit0' },                         // BNE hit0
  0xa5, 0x7a,                                      // LDA $7A
  0xc9, arenaBank,                                 // CMP #아레나 뱅크
  0xf0, { r8: 'RL_hit0' },                         // BEQ hit0
  'RL_scan',
  0xc2, 0x30,                                      // REP #$30   A/X 16비트
  0xda,                                            // PHX        (폭 통일 후라 2B)
  0x29, 0xff, 0x00,                                // AND #$00FF (상위는 B 레지스터)
  0x0a,                                            // ASL A      뱅크×2
  0xaa,                                            // TAX
  0xbf, 0x00, 0xe4, 0xff,                          // LDA $FF:E400,X   목록 오프셋
  0xc9, 0xff, 0xff,                                // CMP #$FFFF
  0xf0, { r8: 'RL_miss' },                         // BEQ miss   구간 없는 뱅크
  0xaa,                                            // TAX
  'RL_loop',
  0xbf, 0x02, 0xe6, 0xff,                          // LDA $FF:E602,X   hi
  0xf0, { r8: 'RL_miss' },                         // BEQ miss   hi=0 → 목록 끝
  0xc5, 0x78,                                      // CMP $78
  0x90, { r8: 'RL_next' },                         // BCC next   hi < 커서
  0xf0, { r8: 'RL_next' },                         // BEQ next   hi = 커서 (상한 배타)
  0xa5, 0x78,                                      // LDA $78
  0xdf, 0x00, 0xe6, 0xff,                          // CMP $FF:E600,X   lo
  0xb0, { r8: 'RL_ok' },                           // BCS ok     커서 >= lo
  'RL_next',
  0xe8, 0xe8, 0xe8, 0xe8,                          // INX ×4
  0x80, { r8: 'RL_loop' },                         // BRA loop
  'RL_ok',
  0xfa, 0x28, 0x38, 0x6b,                          // PLX : PLP : SEC : RTL
  'RL_miss',
  0xfa, 0x28, 0x18, 0x6b,                          // PLX : PLP : CLC : RTL
  'RL_hit0',
  0x28, 0x38, 0x6b,                                // PLP : SEC : RTL
];

// ---- 뱅크 $FF 루틴 ($FF:E1C0) ----
const FF_ORG = 0xe1c0, FF_FILE = 0x3fe1c0;
const ARENA_BANK = patch.arenaBankCpu || 0xe8;
const ffItems = [
  'R',                                             // 합성기 쪽: 버퍼 인정판
  0x22, { a16: 'RL' }, 0xff,                       // JSL $FF:RL
  0x60,                                            // RTS

  // TPEN — 걸음: 우리면 +8, 아니면 +14 (A=현재 펜, M=8)
  'TPEN',
  0x48,                                            // PHA
  0x20, { a16: 'R' },                              // JSR R
  0x68,                                            // PLA        (캐리 보존)
  0x90, { r8: 'TPEN_stock' },                      // BCC stock
  0x18, 0x69, 0x08,                                // CLC : ADC #$08
  0x60,                                            // RTS
  'TPEN_stock',
  0x18, 0x69, 0x0e,                                // CLC : ADC #$0E
  0x60,                                            // RTS

  // T27B6 — dest/col 이양 (JMP 로 들어옴, 스택 안 씀)
  'T27B6',
  0x20, { a16: 'R' },                              // JSR R
  0x90, { r8: 'T27B6_stock' },                     // BCC stock
  0xac, 0xa5, 0xd5,                                // LDY $D5A5
  0xe2, 0x20,                                      // SEP #$20
  0xb9, 0xb1, 0xd5,                                // LDA $D5B1,Y   (스텝 후 펜)
  0xf0, { r8: 'T27B6_full' },                      // BEQ full      (펜0=char1)
  0x4c, ...[0x1b, 0x28],                           // JMP $281B     (char0: 건너뜀)
  'T27B6_full',
  0x4c, ...[0xb9, 0x27],                           // JMP $27B9
  'T27B6_stock',
  0xac, 0xa5, 0xd5,                                // LDY $D5A5     (원본 명령)
  0x4c, ...[0xb9, 0x27],                           // JMP $27B9

  // T23EF — 캔버스 슬라이드: 우리면 건너뜀 (JSR 로 들어옴)
  'T23EF',
  0x20, { a16: 'R' },                              // JSR R
  0xb0, { r8: 'T23EF_skip' },                      // BCS skip
  0x4c, ...[0x21, 0x29],                           // JMP $2921     (꼬리호출)
  'T23EF_skip',
  0x60,                                            // RTS

  // T246A — 펜8 꼬리 (JMP 로 들어옴). 스톡: 2948+2987+2846+293C, 우리: 2948+293C
  'T246A',
  0x20, ...[0x48, 0x29],                           // JSR $2948
  0x20, { a16: 'R' },                              // JSR R
  0x90, { r8: 'T246A_stock' },                     // BCC stock
  0x20, ...[0x3c, 0x29],                           // JSR $293C
  0x4c, ...[0x7a, 0x27],                           // JMP $277A
  'T246A_stock',
  0x20, ...[0x87, 0x29],                           // JSR $2987
  0x20, ...[0x46, 0x28],                           // JSR $2846
  0x20, ...[0x3c, 0x29],                           // JSR $293C
  0x4c, ...[0x7a, 0x27],                           // JMP $277A

  // RREC — 선택지 옵션 기록 게이트 v3 (칸 중복 제거).
  //   스톡은 글리프마다 [$D5B8(색 원형)|$AE(타일)] 을 레코드에 추가한다.
  //   반칸에선 $AE 가 합성 잔값이라 못 쓰고, '칸 완성(char1)에서만 기록'은
  //   반칸 꼬리·공백 낀 칸을 빠뜨려 빨강이 덜 덮인다(실기 목격).
  //   v3: 워드 = (D5C6 타일) | (D5B8 색), **직전 기록과 같은 칸이면 스킵** —
  //   char0/char1/공백 어느 박자로 불려도 칸마다 정확히 한 번 기록된다.
  //   실측 근거: D5C6 은 char0 시점에 이미 제 칸 엔트리다(rrec_probe).
  'RREC',                                          // 진입 M=16 (REP #$20 직후) · Y=행 색인
  0xad, 0xc0, 0xd3,                                // LDA $D3C0 (원본 재현)
  0xd0, { r8: 'RREC_on' },                         // BNE on
  0x60,                                            // RTS — 기록 모드 꺼짐 (A=0)
  'RREC_on',
  // **경계 가드** (2026-08-25 실기 이등분: RREC 가 월드맵 축출의 원인).
  //   커서가 WRAM 버퍼(뱅크 >= 0x7E, 이름 렌더)거나 옵션 카운터 D3C1 이
  //   0/과대이면 손대지 않는다 — 그 문맥의 기록은 VM 콜 프레임을 밟는다.
  // 가드 완화 (2026-08-26): 16칸 캡이 쓰기 안전을 보장하므로,
  //   기록 구멍을 내던 두 가드를 푼다 — 재생(커서 이동 재그리기)은 기록이
  //   빠진 칸을 쓰레기로 칠한다(들-·파란 블록, 실기 신고 4건의 뿌리).
  //   · 버퍼 렌더(커서 7E, 매크로 이름 칸)도 기록한다
  //   · 옵션 상한 5→16 (크레인 튜토리얼 메뉴 9개 실물)
  0x08,                                            // PHP
  0xe2, 0x20,                                      // SEP #$20
  0xad, 0xc1, 0xd3,                                // LDA $D3C1
  0xf0, { r8: 'RREC_bail' },                       // BEQ bail — 옵션 0개인데 기록 모드
  0xc9, 0x10,                                      // CMP #$10
  0xb0, { r8: 'RREC_bail' },                       // BCS bail — 진짜 폭주만
  0x28,                                            // PLP (M=16 복원)
  0x20, { a16: 'R' },                              // JSR R (캐리=우리 구간, A 파괴)
  0x90, { r8: 'RREC_stock' },                      // BCC stock — 스톡 구간은 그대로
  // W = (제 칸 타일) | (색 원형 속성) — 스택에 둔다
  0xb9, 0xc6, 0xd5,                                // LDA $D5C6,Y
  0x29, 0xff, 0x03,                                // AND #$03FF
  0x48,                                            // PHA
  0xb9, 0xb8, 0xd5,                                // LDA $D5B8,Y
  0x29, 0x00, 0xfc,                                // AND #$FC00
  0x03, 0x01,                                      // ORA $01,S
  0x83, 0x01,                                      // STA $01,S  (W)
  // 레코드 베이스 → $8D
  0xad, 0xc1, 0xd3,                                // LDA $D3C1
  0x29, 0xff, 0x00,                                // AND #$00FF
  0x3a,                                            // DEC A
  0x0a, 0x0a, 0x0a, 0x0a, 0x0a,                    // ASL ×5
  0x85, 0x8d,                                      // STA $8D
  0xaa,                                            // TAX
  0xbd, 0xc2, 0xd3,                                // LDA $D3C2,X (글리프/칸 수)
  0xf0, { r8: 'RREC_app' },                        // BEQ 첫 기록
  0x3a, 0x0a,                                      // DEC : ASL
  0x18, 0x65, 0x8d,                                // CLC : ADC $8D
  0xaa,                                            // TAX
  0xbd, 0xc4, 0xd3,                                // LDA $D3C4,X (마지막 기록)
  0xc3, 0x01,                                      // CMP $01,S
  0xf0, { r8: 'RREC_skip' },                       // BEQ — 같은 칸, 기록 없음
  'RREC_app',
  0xa6, 0x8d,                                      // LDX $8D (베이스)
  0xbd, 0xc2, 0xd3,                                // LDA $D3C2,X
  // **기록 상한 = 슬롯 용량(16칸)** (2026-08-26 실기 검거: 기록 모드가 대화로
  //   새면 카운터가 무한 증가, 기록 포인터가 D3C4→D5xx 로 행진하며 대화
  //   상태(업로드 목적지·활성창 $D5A5·$9F)를 밟는다 — 스프라이트 오염→
  //   시프터0 베이스 붕괴→커서 00:AA00→VM 폭주(freeze_789 전체 사슬).
  //   선택지 라벨은 16칸을 안 넘으니 정상 기록엔 영향 없다.
  0xc9, 0x10, 0x00,                                // CMP #$0010
  0xb0, { r8: 'RREC_skip' },                       // BCS — 가득참, 버리고 끝
  0x1a,                                            // INC A
  0x9d, 0xc2, 0xd3,                                // STA $D3C2,X
  0x3a, 0x0a,                                      // DEC : ASL
  0x18, 0x65, 0x8d,                                // CLC : ADC $8D
  0xaa,                                            // TAX
  0x68,                                            // PLA (W)
  0x9d, 0xc4, 0xd3,                                // STA $D3C4,X
  0xa9, 0x00, 0x00,                                // LDA #$0000 — 스톡 기록 건너뜀
  0x60,                                            // RTS
  'RREC_skip',
  0x68,                                            // PLA (버림)
  0xa9, 0x00, 0x00,                                // LDA #$0000
  0x60,                                            // RTS
  'RREC_bail',
  0x28,                                            // PLP
  'RREC_stock',
  0xad, 0xc0, 0xd3,                                // LDA $D3C0 — 스톡 경로 원값
  0x60,                                            // RTS

  ...RL_BODY(ARENA_BANK),                          // 표 기반 구간 판정 (롱콜)
];
const ff = assemble(ffItems, FF_ORG);
// $FF:E1C0 블록은 $FF:E300 뱅크 표 앞에서 끝나야 한다 — 넘치면 표 검사가
//   나중에 던지며 **롬 파일을 안 쓰고 죽는다**(실측: 6:53 이후 네 번 헛굽기).
if (ff.bytes.length > 0xe300 - FF_ORG) throw new Error(`$FF 루틴 블록 ${ff.bytes.length}B — E300 표 침범`);

// ---- 뱅크 $C0 루틴 ($C0:FF10) ----
const C0_ORG = 0xff10, C0_FILE = 0x00ff10;
// 캐리어 세 개를 글리프 대역에서 빌린다: FD=1바이트 무동작 · FE=OUT · FF=BACK.
//   스톡엔 1바이트 무동작이 없다 — 대사 VM 점프표에서 무동작은 0x4F 하나뿐인데
//   그건 **2바이트**를 먹는다(디스패처 INC + 핸들러 INC).  그래서 홀수 자리를
//   메울 코드가 없었고, 반칸(0x50) 하나가 남아 접힘·빈 줄을 만들었다.
//   → 우리가 하나 찍는다.  FD 핸들러는 `INC $78` 하고 RTS — 제 바이트만 먹고
//   칸은 안 먹는다.  전부-한글화 전제라 글리프 코드 하나를 내주면 그만이다.
// ---- 그림자 트리거 프리루드 (파일럿, 2026-08-26) ----
//   커서 뱅크가 $FC 이면 $FF:TRG 에게 "여기가 그림자 행 머리인가" 를 묻는다.
//   TRG 가 캐리 세트로 돌아오면 커서가 이미 한국어 아레나로 옮겨져 있다 —
//   새 바이트를 다시 읽어 본 디스패치로 진입한다. 스트림엔 우리 바이트가
//   전혀 없으므로, 이 프리루드를 못 거치는 리더는 순정 일본어를 읽는다.
const SHADOW = patch.shadowTable || patch.shadowDir || null;
// 홑글리프 트리거는 1C29 프리루드가 정답이다(실측 2026-08-26: 홑글리프는
//   점프표 1C50 을 지나지 않는다 — 1C50 은 와이드 전용). 와이드/확장/매크로
//   머리는 핸들러 7지점 훅이 발동한다. 프리루드 뒤 S_disp 는 캐리어 전담.
const TRGADDR = patch.shadowDir ? 0xfd00 : 0xeac0;
const shadowPrelude = SHADOW ? [
  'STUB',
  0x48,                                            // PHA (원 바이트 보관)
  0xa9, 0x00, 0x8f, 0x70, 0xfe, 0x7f,              // 커밋 플래그 OFF (글리프 머리 관문)
  0x22, W(TRGADDR), 0xff,                          // JSL TRG
  0x90, { r8: 'T_no' },                            // BCC — 미발동
  0x68,                                            // PLA (옛 바이트 버림)
  0x60,                                            // RTS — 재분류 계약
  'T_no',
  0x68,                                            // PLA (원 바이트 복원)
  'S_disp',
] : ['STUB', 'S_disp'];
const c0Items = [
  ...shadowPrelude,
  ...(PAD_RUNTIME ? [
    0xc9, 0x50, 0xf0, { r8: 'S_padCheck' },          // literal or registered dedicated blank
    0xc9, 0x51, 0xd0, { r8: 'S_padNormal' },
    'S_padCheck',
    0x22, 0x00, 0x95, 0xfe,                          // JSL $FE:9500 exact overflow-pad guard
    0xb0, { r8: 'S_noop' },                          // BCS: consume this registered blank without rendering
    'S_padNormal',
  ] : []),
  0xc9, 0xfd,                                      // CMP #$FD
  0x90, { r8: 'S_normal' },                        // BCC normal  (0x50..0xFC = 글리프)
  0x48,                                            // PHA
  0x20, { a16: 'R' },                              // JSR R
  0x68,                                            // PLA
  0x90, { r8: 'S_normal' },                        // BCC normal  (우리 구간 밖)
  0xc9, 0xfd,                                      // CMP #$FD
  0xf0, { r8: 'S_noop' },                          // BEQ noop
  0xc9, 0xff,                                      // CMP #$FF
  0xf0, { r8: 'S_back' },                          // BEQ back
  // OUT [FE lo hi] — 아레나 **뱅크는 표에서 찾는다**
  //   캐리어를 3바이트로 유지하려고 뱅크를 오퍼랜드에 안 싣는다.  대신
  //   출발 뱅크($7A)로 표($FF:E300,X)를 찾아 아레나 뱅크를 얻는다.
  //   왜: 전 원장 확대 시 아레나 수요가 ~90KB · 출발 뱅크가 18개라 한 뱅크
  //   (0x28, 41KB)로는 못 담는다.  뱅크 고정판은 확대하면 첫 행부터 어긋난다.
  0xc2, 0x20,                                      // REP #$20
  0xe6, 0x78,                                      // INC $78
  0xa7, 0x78,                                      // LDA [$78]   목적지
  0x85, 0x8d,                                      // STA $8D
  0xe2, 0x20,                                      // SEP #$20
  0xa9, 0x01, 0x8f, 0x70, 0xfe, 0x7f,              // 커밋 플래그 ON (NMI 찢김 가드)
  0x08,                                            // PHP        폭 보존
  0xc2, 0x10,                                      // REP #$10   X=16
  0xda,                                            // PHX
  0xa5, 0x7a,                                      // LDA $7A    출발 뱅크
  0xc2, 0x20,                                      // REP #$20
  0x29, 0xff, 0x00,                                // AND #$00FF
  0xaa,                                            // TAX
  0xe2, 0x20,                                      // SEP #$20
  0xbf, 0x00, 0xe3, 0xff,                          // LDA $FF:E300,X
  0x85, 0x7a,                                      // STA $7A    아레나 뱅크
  0xfa,                                            // PLX
  0x28,                                            // PLP
  0xc2, 0x20,                                      // REP #$20
  0xa5, 0x8d,                                      // LDA $8D
  0x85, 0x78,                                      // STA $78
  0xe2, 0x20,                                      // SEP #$20
  0x60,                                            // RTS
  'S_noop',                                        // FD — 제 바이트만 먹고 끝
  0xc2, 0x20,                                      // REP #$20
  0xe6, 0x78,                                      // INC $78
  0xe2, 0x20,                                      // SEP #$20
  0x60,                                            // RTS
  'S_back',                                        // BACK [FF lo hi bk]
  0xe2, 0x20,                                      // SEP #$20 (플래그는 8비트로)
  0xa9, 0x01, 0x8f, 0x70, 0xfe, 0x7f,              // 커밋 플래그 ON
  0xc2, 0x20,                                      // REP #$20
  0xe6, 0x78,                                      // INC $78
  0xa7, 0x78,                                      // LDA [$78]
  0x85, 0x8d,                                      // STA $8D
  0xe6, 0x78, 0xe6, 0x78,                          // INC $78 ×2
  0xe2, 0x20,                                      // SEP #$20
  0xa7, 0x78,                                      // LDA [$78]
  0x85, 0x7a,                                      // STA $7A
  0xc2, 0x20,                                      // REP #$20
  0xa5, 0x8d,                                      // LDA $8D
  0x85, 0x78,                                      // STA $78
  0xe2, 0x20,                                      // SEP #$20
  0x60,                                            // RTS
  'S_normal',
  0x85, 0x8d,                                      // STA $8D    (원본 재현)
  0x64, 0x8e,                                      // STZ $8E
  0x4c, ...[0x2d, 0x1c],                           // JMP $1C2D
  // VM 쪽 R 은 **버퍼 미인정판**(RLN)을 부른다 — 워프 훅까지 뱅크 $7E 를
  // 우리 것으로 치면 버퍼 안 0xFE/0xFF 가 워프로 오독돼 폭주한다.
  'R',
  0x22, W(ff.labels.get('RLN')), 0xff,             // JSL $FF:RLN
  0x60,                                            // RTS
];
if (ff.labels.get('RLN') === undefined) throw new Error('RLN 라벨 없음');
const c0 = assemble(c0Items, C0_ORG);
if (c0.bytes.length > 0xa3) throw new Error(`$C0:FF10 block ${c0.bytes.length}B exceeds verified 163B free run`);

// Generic authored-padding gate.  Only a current 0x50 within the exact
// FD FD + 64x50 + FD FD marker can be consumed, and only after stock drawing
// has already moved the live window to a fresh line.  The scan never mutates
// the VM cursor: it switches DB to the cursor bank and walks a private X.
// Only the positive path commits $78=padEnd-1 under the existing NMI guard.
let adaptivePaddingHelper = null;
if (ADAPTIVE_PADDING) {
  const helper = assemble([
    0x08, 0xc2, 0x30, 0x48, 0xda, 0x5a,              // PHP; REP #$30; PHA/PHX/PHY
    0xa5, 0x78, 0xaa,                                // X = private copy of original $78/$79
    0xe0, 0x02, 0x00, 0x90, { r8: 'noEarly' },      // cannot scan back across address zero
    0xe2, 0x20,
    0xa5, 0x7a, 0xc9, 0x40, 0x90, { r8: 'noEarly' }, // reject low-bank/buffer cursors
    0xc9, 0x7e, 0xf0, { r8: 'noEarly' },
    0xc9, 0x7f, 0xf0, { r8: 'noEarly' },
    0xc2, 0x10, 0xac, 0xa5, 0xd5,                    // Y = live window offset
    0xc0, 0x00, 0x01, 0xb0, { r8: 'noEarly' },
    0xe2, 0x20,
    0xb9, 0xb1, 0xd5, 0xd0, { r8: 'noEarly' },      // phase must be line-start phase
    0xb9, 0xc2, 0xd5, 0xd0, { r8: 'noEarly' },      // whole-cell column must be zero
    0xb9, 0xc0, 0xd5, 0xf0, { r8: 'noEarly' },      // valid nonzero live width
    0xc9, 0x21, 0xb0, { r8: 'noEarly' },            // 64 half-cells prove a wrap only for <=32 cells
    0x8b, 0xa5, 0x7a, 0x48, 0xab,                   // preserve DB; DB = cursor bank for absolute,X reads
    0x80, { r8: 'scan' },
    'noEarly', 0xc2, 0x30, 0x7a, 0xfa, 0x68, 0x28, 0x18, 0x6b, // no DB switch: restore; CLC; RTL
    'scan',
    0xa0, 0x00, 0x00,
    'back',
    0xe0, 0x00, 0x00, 0xf0, { r8: 'noDb' },        // bounded backward scan: no underflow
    0xca, 0xe2, 0x20, 0xbd, 0x00, 0x00, 0xc9, 0x50,
    0xd0, { r8: 'backStop' },
    0xc2, 0x20, 0xc8, 0xc0, 0x40, 0x00, 0x90, { r8: 'back' },
    0x80, { r8: 'noDb' },
    'backStop',
    0xc9, 0xfd, 0xd0, { r8: 'noDb' },
    0xe0, 0x00, 0x00, 0xf0, { r8: 'noDb' },
    0xca, 0xe2, 0x20, 0xbd, 0x00, 0x00, 0xc9, 0xfd, 0xd0, { r8: 'noDb' },
    0xc2, 0x10, 0xe0, 0xbd, 0xff, 0xb0, { r8: 'noDb' }, // markerStart <= $FFBC ensures all 68 bytes fit this bank
    0xe8, 0xe8,                                      // X = padStart
    0xa0, 0x40, 0x00,                                // exactly 64 literal spaces must follow
    0x80, { r8: 'forward' },
    'noDb', 0xc2, 0x30, 0xab, 0x7a, 0xfa, 0x68, 0x28, 0x18, 0x6b, // restore DB/registers; CLC; RTL
    'forward',
    0xe2, 0x20, 0xbd, 0x00, 0x00, 0xc9, 0x50, 0xd0, { r8: 'noDb' },
    0xc2, 0x10, 0xe8, 0x88, 0xd0, { r8: 'forward' },
    0xe2, 0x20, 0xbd, 0x00, 0x00, 0xc9, 0xfd, 0xd0, { r8: 'noDb' },
    0xc2, 0x10, 0xe8, 0xe2, 0x20, 0xbd, 0x00, 0x00, 0xc9, 0xfd, 0xd0, { r8: 'noDb' },
    0xc2, 0x10, 0xca, 0xca,                         // X = padEnd-1
    0xe2, 0x20, 0xa9, 0x01, 0x8f, 0x70, 0xfe, 0x7f, // NMI guard before the atomic cursor commit
    0xc2, 0x20, 0x8a, 0x85, 0x78,
    'yes', 0xc2, 0x30, 0xab, 0x7a, 0xfa, 0x68, 0x28, 0x38, 0x6b, // restore DB/registers; SEC; RTL
  ], 0xfe00);
  if (helper.bytes.length > ADAPTIVE_PAD_CAP) throw new Error(`adaptive padding helper ${helper.bytes.length}B exceeds $FE:FE00 run`);
  adaptivePaddingHelper = helper.bytes;
}

// The FE:9500 entry keeps F9D's exact single-byte contract as a fallback.
// Generic marked padding runs first and returns C=1 directly to S_noop.
let padSkipHelper = null;
if (PAD_RUNTIME && patch.textHelperChain) {
  // v3② C2: the patch stage generated the zero -> soft -> conditional-blank chain from declarations.
  // $FE:9500 becomes a JML to its head; the chain keeps the generic FE:FE00 and F9D fallbacks.
  const chain = patch.textHelperChain, f = chain.f9d;
  if (!PAD_SKIP || f.cpuBank !== PAD_SKIP.cpuBank || f.address !== PAD_SKIP.address || f.width !== PAD_SKIP.width) throw new Error('C2 chain F9D contract differs from ROM-stage PAD_SKIP');
  if (!adaptivePaddingHelper) throw new Error('C2 chain requires the generic adaptive helper at $FE:FE00');
  const declared = new Set(chain.conditional.rows.map((r) => r.file));
  for (const r of CONDITIONAL_LEADING_ROWS) if (!declared.has(r.arena)) throw new Error(`C2 chain misses formal conditional leading row @${r.source.toString(16)}`);
  padSkipHelper = Buffer.from(chain.padSkipEntryHex, 'hex');
} else if (PAD_RUNTIME) {
  padSkipHelper = buildCombinedPadSkipWrapper(CONDITIONAL_LEADING_ROWS, {
    adaptive: adaptivePaddingHelper !== null, f9d: PAD_SKIP, org: 0x9500,
  });
  if (padSkipHelper.length > 0xc0) throw new Error(`combined pad-skip helper ${padSkipHelper.length}B exceeds $FE:9500 run`);
}

// ---- 자작 오프닝 프롤로그: 패딩을 공백으로 (2026-08-25) ----
//   3C0A73..3C0B63 프롤로그는 대사 VM 이 아닌 자체 렌더러가 그린다 —
//   FD/4F 를 몰라 FD 가 「者」로 찍힌다(실기 목격). 원본 패딩은 0x50 공백.
{
  // 자막/시네마틱 스팬 목록 — 프롤로그 + 대관식 틀없는 줄 + 數日後 카드(2026-08-25).
  //   이 구간 행이 워프(FE)로 구워지면 렌더러가 탈선한다(멈춤 실기 목격) —
  //   그런 행은 빌드 실패로 막는다. 패딩(FD/4F)은 공백으로.
  //   FC 자막 렌더러($FF:398F 재읽기)에는 CAPFIX 훅(아래 ③)을 심어 FE/FD/FF
  //   캐리어를 본편과 동일하게 처리한다 — 워프 허용. 전투 팩(3D)만 미훅이라
  //   워프 금지 유지. 패딩 4F 는 자막 경로(0x24..0x4F 분기)가 미지라 50 으로.
  const CAPTION = [[0x3c0a73, 0x3c0b63], [0x3ccbe7, 0x3ccbfb], [0x3ccc40, 0x3ccc48], [0x3cccd1, 0x3cccd7], [0x3cce03, 0x3cce12]];
  const NOWARP = [
    [0x3d9a90, 0x3d9b41],                              // 전투 문자열 팩 — 렌더러 미훅
    [0x3ccd00, 0x3ccf60],                              // 에필로그 계측 렌더러 대역($5A 선독 · 한 글자 감격 연출) — 완전 훅 불가 소비자로 판명(2026-08-26): CAPFIX2 는 M=16 진입에서 혼돈 실행이었고, 옳게 고치면 커서 소비 부작용이 계측을 깨뜨린다. 워프가 구워지면 소프트락 대신 여기서 빌드가 죽는 게 맞다
  ];
  let n = 0;
  for (const [s2, e2] of patch.rowSpans) {
    if (NOWARP.some(([lo, hi]) => s2 >= lo && s2 < hi)) {
      if (rom[s2] === 0xfe) throw new Error(`전투 팩 스팬 ${s2.toString(16)} 워프 금지 — 렌더러 미훅`);
      // 행 내부 FE 도 잡는다 — 조각 워프 스텁이 행 중간에 박힌 사고 실증(3CCE7A)
      for (let a3 = s2 + 1; a3 < e2 - 2; a3 += 1) {
        if (rom[a3] === 0xfe) throw new Error(`NOWARP 스팬 ${s2.toString(16)} 내부 FE @${a3.toString(16)} — 렌더러 미훅`);
      }
    }
    if (!CAPTION.some(([lo, hi]) => s2 >= lo && s2 < hi) && !NOWARP.some(([lo, hi]) => s2 >= lo && s2 < hi)) continue;
    if (rom[s2] === 0xfe) continue;                  // 워프 행 — 아레나 쪽은 본편 규약 그대로
    for (let a2 = s2; a2 < e2; a2 += 1) {
      if (rom[a2] === 0xfd || rom[a2] === 0x4f) { rom[a2] = 0x50; n += 1; }
    }
  }
  console.log(`  자막 스팬 패딩→공백 ${n}B`);
}

// ---- ①.5 자막 렌더러 캐리어 훅 (CAPFIX, 2026-08-25) ----
//   보쿠노 자작 연출(프롤로그·전환 자막·한 글자 감격)은 본편 VM 을 안 쓰지만
//   **커서는 같은 DP $78** 를 쓴다($FF:398F 재읽기 실측). 그 재읽기 4바이트를
//   JSL CAPFIX 로 바꿔 FD/FE/FF 캐리어를 본편 STUB 과 동일 의미로 처리한다 —
//   자막 구간도 워프 가능해져 번역이 바이트 예산에 안 짓눌린다.
{
  const CAPFIX_CPU = 0xe980;                        // $FF:E780 (자유 공간, put 가드)
  const items = [
    'LOOP',
    0xa7, 0x78,                                      // LDA [$78] (M=8)
    0xc9, 0xfd,                                      // CMP #$FD
    0x90, { r8: 'DONE' },                            // BCC done — 글리프/제어는 원래 흐름
    0xc9, 0xfd, 0xf0, { r8: 'NOOP' },                // FD → 제 바이트만
    0xc9, 0xff, 0xf0, { r8: 'BACK' },                // FF → 복귀
    // FE OUT — 본편 STUB 과 동일(뱅크는 $FF:E300 표)
    0xc2, 0x20, 0xe6, 0x78, 0xa7, 0x78,              // REP; INC $78; LDA [$78] 목적지
    0x85, 0x8d, 0xe2, 0x20,                          // STA $8D; SEP
    0x08, 0xc2, 0x10, 0xda,                          // PHP; REP #$10; PHX
    0xa5, 0x7a, 0xc2, 0x20, 0x29, 0xff, 0x00, 0xaa,  // 출발 뱅크→X
    0xe2, 0x20, 0xbf, 0x00, 0xe3, 0xff, 0x85, 0x7a,  // 표에서 아레나 뱅크
    0xfa, 0x28,                                      // PLX; PLP
    0xc2, 0x20, 0xa5, 0x8d, 0x85, 0x78, 0xe2, 0x20,  // $78=목적지; SEP
    0x80, { r8: 'LOOP' },                            // BRA loop
    'NOOP', 0xc2, 0x20, 0xe6, 0x78, 0xe2, 0x20, 0x80, { r8: 'LOOP' },
    'BACK',
    0xc2, 0x20, 0xe6, 0x78, 0xa7, 0x78, 0x85, 0x8d,  // 목적지
    0xe6, 0x78, 0xe6, 0x78, 0xe2, 0x20,              // +2 → 뱅크 바이트
    0xa7, 0x78, 0x85, 0x7a,                          // $7A=복귀 뱅크
    0xc2, 0x20, 0xa5, 0x8d, 0x85, 0x78, 0xe2, 0x20,  // $78=복귀 주소
    0x80, { r8: 'LOOP' },
    'DONE',
    0xc2, 0x20,                                      // REP #$20   (원본 재현)
    0xa7, 0x78,                                      // LDA [$78]
    0x6b,                                            // RTL
  ];
  const cap = assemble(items, CAPFIX_CPU);
  globalThis.__capfix = cap.bytes;
  // 훅 사이트: $FF:398F  C2 20 A7 78 → JSL $FF:E780
  const site = 0x3f398f;
  const want = [0xc2, 0x20, 0xa7, 0x78];
  for (let i = 0; i < 4; i += 1) if (rom[site + i] !== want[i]) throw new Error('CAPFIX 사이트 바이트 불일치');
  rom[site] = 0x22; rom[site + 1] = CAPFIX_CPU & 0xff; rom[site + 2] = (CAPFIX_CPU >> 8) & 0xff; rom[site + 3] = 0xff;
  console.log(`  CAPFIX ${cap.bytes.length}B @ $FF:E780 · 훅 $FF:398F`);
}

// ---- ①.6 셀 폭 0 나눗셈 가드 (DIVGUARD, 2026-08-25) ----
//   자막계 렌더러의 모듈로 루프($C0:585C: $99 -= $D0D1 반복)는 D0D1=0 이면
//   무한루프다 — 39 00 슬롯 이름이 빈 채 그려지면 글자 폭이 0 이 되어 실기
//   멈춤(사용자 스테이트 재현). 루프 머리를 JSL 로 바꿔 0 이면 8(기본 셀)로.
{
  const DIV_CPU = 0xea00;                            // $FF:EA00 자유 공간
  const items = [
    0xad, 0xd1, 0xd0,                                // LDA $D0D1
    0xd0, { r8: 'OK1' },                             // BNE ok1
    0xa9, 0x08,                                      // LDA #$08
    0x8d, 0xd1, 0xd0, 0x8d, 0xc4, 0xd0,              // D0D1/D0C4 = 8
    'OK1',
    0xad, 0xcd, 0xd0,                                // LDA $D0CD
    0xd0, { r8: 'OK2' },                             // BNE ok2
    0xa9, 0x08,                                      // LDA #$08
    0x8d, 0xcd, 0xd0, 0x8d, 0xc3, 0xd0,              // D0CD/D0C3 = 8
    'OK2',
    0xa5, 0x99, 0x38, 0xed, 0xd1, 0xd0,              // 원본 재현
    0x6b,                                            // RTL
  ];
  const g = assemble(items, DIV_CPU);
  globalThis.__divguard = g.bytes;
  const site = 0x585c;
  const want = [0xa5, 0x99, 0x38, 0xed, 0xd1, 0xd0];
  for (let i = 0; i < 6; i += 1) if (rom[site + i] !== want[i]) throw new Error('DIVGUARD 사이트 불일치');
  rom[site] = 0x22; rom[site + 1] = DIV_CPU & 0xff; rom[site + 2] = (DIV_CPU >> 8) & 0xff; rom[site + 3] = 0xff;
  rom[site + 4] = 0xea; rom[site + 5] = 0xea;        // NOP NOP
  console.log(`  DIVGUARD ${g.bytes.length}B @ $FF:EA00 · 훅 $C0:585C`);
}

// ---- ①.7 5A 선독기 캐리어 훅 (CAPFIX2, 2026-08-26) ----
//   보쿠노 확장 코드($5A:AFA2)의 선독/분류기도 커서 $78 로 원고를 읽는다 —
//   워프 이정표를 날로 읽어 계측이 깨지던 마지막 미훅 리더. LDA [$78]+JSL
//   분류기(6B)를 JSL CAPFIX2 로 교체, 캐리어를 소비(멱등)한 뒤 원본 재현.
{
  const C2_CPU = 0xea40;                             // $FF:EA40
  //   **진입 폭 주의(2026-08-26 실측)**: 이 사이트는 두 진입이 있다 — 오프닝
  //   경로는 $5A:AFA0 의 REP #$20 을 지나 **M=16** 으로 들어오고(캐릭 선택 후
  //   부팅 멈춤의 진범: M=8 가정 코드가 CMP #$FD 를 2바이트 즉치로 오독),
  //   에필로그 경로는 M=8. PHP/SEP 로 폭을 고정해 소비하고, PLP 후 호출자
  //   폭 그대로 원본(LDA [$78]+JSL)을 재현한다.
  const items = [
    0x08,                                            // PHP — 진입 폭 보존
    0xe2, 0x20,                                      // SEP #$20 — 캐리어 소비는 8비트로
    'LOOP',
    0xa7, 0x78, 0xc9, 0xfd, 0x90, { r8: 'DONE' },
    0xc9, 0xfd, 0xf0, { r8: 'NOOP' },
    0xc9, 0xff, 0xf0, { r8: 'BACK' },
    0xc2, 0x20, 0xe6, 0x78, 0xa7, 0x78, 0x85, 0x8d, 0xe2, 0x20,
    0x08, 0xc2, 0x10, 0xda,
    0xa5, 0x7a, 0xc2, 0x20, 0x29, 0xff, 0x00, 0xaa,
    0xe2, 0x20, 0xbf, 0x00, 0xe3, 0xff, 0x85, 0x7a,
    0xfa, 0x28,
    0xc2, 0x20, 0xa5, 0x8d, 0x85, 0x78, 0xe2, 0x20,
    0x80, { r8: 'LOOP' },
    'NOOP', 0xc2, 0x20, 0xe6, 0x78, 0xe2, 0x20, 0x80, { r8: 'LOOP' },
    'BACK',
    0xc2, 0x20, 0xe6, 0x78, 0xa7, 0x78, 0x85, 0x8d,
    0xe6, 0x78, 0xe6, 0x78, 0xe2, 0x20,
    0xa7, 0x78, 0x85, 0x7a,
    0xc2, 0x20, 0xa5, 0x8d, 0x85, 0x78, 0xe2, 0x20,
    0x80, { r8: 'LOOP' },
    'DONE',
    0x28,                                            // PLP — 호출자 폭 복원(M=16/8 양쪽)
    0xa7, 0x78,                                      // LDA [$78]   (원본 재현, 호출자 폭)
    0x22, 0x00, 0xe1, 0x59,                          // JSL $59:E100 (분류기)
    0x6b,                                            // RTL
  ];
  const g2 = assemble(items, C2_CPU);
  globalThis.__capfix2 = g2.bytes;
  // **기본 비활성 (2026-08-26)**: 이 사이트는 $5A:AFA0 의 REP #$20 을 지나 M=16
  //   으로 들어오는 진입이 있고(캐릭 선택→오프닝), 계측기가 커서 소비 부작용을
  //   견디지 못한다 — 완전 훅 불가 소비자. 에필로그는 계측 경로 행을 예산 내
  //   인라인으로 되돌려 해결(8/24 검증 방식). 재활성은 RS3_CAPFIX2=1.
  if (process.env.RS3_CAPFIX2 !== '1') { console.log('  CAPFIX2 훅 비활성(기본) — 계측 경로는 인라인 문안'); }
  else {
  const site2 = 0x5aafa2;
  const want2 = [0xa7, 0x78, 0x22, 0x00, 0xe1, 0x59];
  for (let i = 0; i < 6; i += 1) if (rom[site2 + i] !== want2[i]) throw new Error('CAPFIX2 사이트 불일치');
  rom[site2] = 0x22; rom[site2 + 1] = C2_CPU & 0xff; rom[site2 + 2] = (C2_CPU >> 8) & 0xff; rom[site2 + 3] = 0xff;
  rom[site2 + 4] = 0xea; rom[site2 + 5] = 0xea;
  console.log(`  CAPFIX2 ${g2.bytes.length}B @ $FF:EA40 · 훅 $5A:AFA2`);
  }
}

// ---- ①.7b 나레이션 합성기 반칸 포장 (NARRHALF, 2026-09-08) ----
//   부팅 무입력 프롤로그(死食 나레이션 4구간)와 전환 자막을 그리는 $FF:3971 루프는 대사 창
//   밖의 자체 합성기다: 글리프마다 16x16 타일 한 항목(D5C2+=2, D51B+=2)이라 반폭 한글이
//   16px 간격으로 벌어지고(사용자 「반칸 전진해야」), 2바이트 코드는 저자의 $55:D400→$59:E200
//   표로 매핑돼 확장 페이지 0x18/0x46 이 엉뚱한 슬롯(0x0C/0x20 페이지)이 되어 빈칸으로 찍힌다
//   (「사식」의 식 = 4631, 실기 Snes9x 목격).  훅 넷(전부 $FF, 코드는 $FF:EB00 자유 공간):
//   ① $FF:39A2 `XBA STA $8D` → 접두 0x18→$24xx · 0x46→$25xx (대사 경로와 같은 슬롯 0x400~0x5FF)
//   ② $FF:3A22 쿼드 복사 진입 → 짝수 글리프 colA→왼 타일($2000/$2100,Y, 오른 타일은 0으로),
//      홀수 글리프 colA→오른 타일($2010/$2110,Y) 뒤에만 원본 전진(3AA6: Y+0x20·플러시)과 타일맵
//      기록(39B0)을 탄다. 기울임(3A6D~3AA4 LSR/ROR)은 건너뛴다 — 쌍에서는 왼 글리프 열이 오른
//      글리프로 흘러 든다. 펜딩 플래그 = $D51B bit0(타일 번호는 항상 짝수).
//   ③ $FF:39D4 개행 앞 · ④ $FF:397A 종료 앞: 미완 셀(왼쪽만 찬 것)을 닫는다(타일맵 기록+전진).
//   재는 것: ai_snes·Snes9x 부팅 캡처에서 4구간 전부 8px 간격, 확장 글리프 표시, 16칸 넘던 줄
//   (「…그 아이는」의 는) 복원. 못 재는 것: 전각(JP) 글리프가 이 경로로 오면 반쪽씩 뭉개진다 —
//   이 경로의 문안은 전부 한국어(숫자도 반폭으로 구움). RS3_NARRHALF=0 이면 비활성.
if (process.env.RS3_NARRHALF === '0') { console.log('  NARRHALF 비활성(RS3_NARRHALF=0)'); }
else {
  const NH_CPU = 0xeb00;
  const items = [
    // ① 진입 M=16. A 는 믿지 않는다 — 저자 $55:D440 이 PHA/PHX 뒤 PLA/PLX 순서로 A·X 를 뒤바꿔
    //    $8D 하위에 옛 X 의 상위 바이트가 들어온다(4631 이 2539=꽂 로, 실측). 스트림을 직접 다시 읽는다.
    'NH_H1', 0xa7, 0x78, 0xeb, 0x85, 0x8d,                                   // LDA [$78]; XBA; STA $8D ($8D=xx,$8E=접두)
    0xe2, 0x20, 0xa5, 0x8e,                                                  // SEP; LDA $8E
    0xc9, 0x18, 0xf0, { r8: 'NH_E18' }, 0xc9, 0x46, 0xf0, { r8: 'NH_E46' },   // 접두 판별
    0xc2, 0x20, 0x60,                                                        // REP; RTS (스톡 페이지 0x20~0x23 은 그대로)
    'NH_E18', 0xa9, 0x24, 0x80, { r8: 'NH_SETP' },
    'NH_E46', 0xa9, 0x25,
    'NH_SETP', 0x85, 0x8e, 0xc2, 0x20, 0x60,                                 // STA $8E; REP; RTS
    // ② 쌍 포장 (진입 M=8 X=16, 스택 [ret3A25][savedY][ret39AD])
    'NH_H2', 0xfa, 0x7a, 0x5a,                                               // PLX(ret 버림); PLY; PHY (Y=셀)
    0xad, 0x1b, 0xd5, 0x29, 0x01, 0xd0, { r8: 'NH_RIGHT' },                  // 펜딩이면 오른쪽
    0xc2, 0x20, 0xbb, 0xa9, 0x00, 0x00,                                      // REP; TYX; LDA #0 — 오른 타일 0
    0x9d, 0x10, 0x20, 0x9d, 0x12, 0x20, 0x9d, 0x14, 0x20, 0x9d, 0x16, 0x20, 0x9d, 0x18, 0x20, 0x9d, 0x1a, 0x20, 0x9d, 0x1c, 0x20, 0x9d, 0x1e, 0x20,
    0x9d, 0x10, 0x21, 0x9d, 0x12, 0x21, 0x9d, 0x14, 0x21, 0x9d, 0x16, 0x21, 0x9d, 0x18, 0x21, 0x9d, 0x1a, 0x21, 0x9d, 0x1c, 0x21, 0x9d, 0x1e, 0x21,
    0xa2, 0x00, 0x00,
    'NH_L1', 0xbd, 0x3f, 0xd3, 0x99, 0x00, 0x20, 0xc8, 0xc8, 0xe8, 0xe8, 0xe0, 0x10, 0x00, 0xd0, { r8: 'NH_L1' },   // colA 위 → $2000,Y
    0x7a, 0x5a,
    'NH_L2', 0xbd, 0x3f, 0xd3, 0x99, 0x00, 0x21, 0xc8, 0xc8, 0xe8, 0xe8, 0xe0, 0x20, 0x00, 0xd0, { r8: 'NH_L2' },   // colA 아래 → $2100,Y
    0x7a, 0xe2, 0x20, 0xad, 0x1b, 0xd5, 0x09, 0x01, 0x8d, 0x1b, 0xd5,       // PLY; SEP; D51B |= 1
    0xfa, 0x4c, W(0x39d0),                                                   // PLX(ret39AD 버림); JMP $39D0 (루프 계속)
    'NH_RIGHT', 0xc2, 0x20, 0xa2, 0x00, 0x00,
    'NH_R1', 0xbd, 0x3f, 0xd3, 0x99, 0x10, 0x20, 0xc8, 0xc8, 0xe8, 0xe8, 0xe0, 0x10, 0x00, 0xd0, { r8: 'NH_R1' },   // colA 위 → $2010,Y
    0x7a, 0x5a,
    'NH_R2', 0xbd, 0x3f, 0xd3, 0x99, 0x10, 0x21, 0xc8, 0xc8, 0xe8, 0xe8, 0xe0, 0x20, 0x00, 0xd0, { r8: 'NH_R2' },   // colA 아래 → $2110,Y
    0xe2, 0x20, 0xad, 0x1b, 0xd5, 0x29, 0xfe, 0x8d, 0x1b, 0xd5,             // SEP; D51B &= ~1
    0x4c, W(0x3aa6),                                                         // JMP $3AA6 (스택 [savedY][ret39AD] 그대로 → 원본 전진·타일맵)
    // ③④ 미완 셀 닫기 (어느 M 이든 진입, 반환 M=16 · A=$D5C2)
    'NH_CLOSE', 0xe2, 0x20, 0xad, 0x1b, 0xd5, 0x29, 0x01, 0xf0, { r8: 'NH_CTR' },
    0xad, 0x1b, 0xd5, 0x29, 0xfe, 0x8d, 0x1b, 0xd5,
    0xc2, 0x20, 0xad, 0x1b, 0xd5, 0xae, 0xc2, 0xd5, 0x9d, 0x00, 0x40,       // REP; 타일맵 항목 = D51B
    0x1a, 0x1a, 0x89, 0x10, 0x00, 0xf0, { r8: 'NH_NW' }, 0x18, 0x69, 0x10, 0x00,
    'NH_NW', 0x8d, 0x1b, 0xd5, 0xee, 0xc2, 0xd5, 0xee, 0xc2, 0xd5,           // D51B 전진; D5C2 += 2
    0x98, 0x18, 0x69, 0x20, 0x00, 0x89, 0x00, 0x01, 0xf0, { r8: 'NH_NY' }, 0x18, 0x69, 0x00, 0x01,   // Y+0x20(원본 3AA6 규칙)
    'NH_NY', 0xc9, 0x00, 0x02, 0xd0, { r8: 'NH_NOFL' }, 0x20, W(0x3abf), 0x80, { r8: 'NH_CTR' },       // 0x200 이면 플러시(Y=0)
    'NH_NOFL', 0xa8,                                                         // TAY
    // 줄 가운데 정렬(사용자 「가운데 정렬시켜」): 방금 끝난 타일맵 행(7E:4000 + (D5C2&~3F), n=D5C2&3F 바이트)을
    //   오른쪽으로 ((32-n)/2)&~1 바이트 옮기고 왼쪽을 0 으로. 보이는 폭 16칸(32B) 기준, 넘는 줄은 그대로.
    //   스택 프레임: [row][sh][n][Y] — 스택 상대 주소로만 임시값을 둔다(DP 무사용).
    'NH_CTR', 0xc2, 0x20, 0x5a,                                              // REP; PHY
    0xad, 0xc2, 0xd5, 0x29, 0x3f, 0x00, 0xf0, { r8: 'NH_C0' },              // n = D5C2 & 3F; 0 → 끝
    0x48,                                                                    // PHA n
    0xa9, 0x20, 0x00, 0x38, 0xe3, 0x01, 0x30, { r8: 'NH_C1' }, 0xf0, { r8: 'NH_C1' },   // 32-n ≤ 0 → 끝
    0x4a, 0x29, 0xfe, 0xff, 0xf0, { r8: 'NH_C1' },                           // sh = ((32-n)>>1)&~1; 0 → 끝
    0x48,                                                                    // PHA sh
    0xad, 0xc2, 0xd5, 0x29, 0xc0, 0xff, 0x48,                                // PHA row
    0xa3, 0x01, 0x18, 0x63, 0x05, 0x3a, 0x3a, 0xaa,                          // X = row + n - 2 (마지막 항목)
    0x8a, 0x18, 0x63, 0x03, 0xa8,                                            // Y = X + sh
    'NH_MV', 0xbd, 0x00, 0x40, 0x99, 0x00, 0x40, 0x8a, 0xc3, 0x01, 0xf0, { r8: 'NH_MVE' },   // 뒤에서 앞으로 복사
    0xca, 0xca, 0x88, 0x88, 0x80, { r8: 'NH_MV' },
    'NH_MVE', 0xa3, 0x03, 0xa8, 0xa3, 0x01, 0xaa, 0xa9, 0x00, 0x00,          // Y = sh(카운터); X = row; A = 0
    'NH_ZL', 0x9d, 0x00, 0x40, 0xe8, 0xe8, 0x88, 0x88, 0xd0, { r8: 'NH_ZL' },   // 왼쪽 sh 바이트 0
    0x68, 0x68, 0x68, 0x80, { r8: 'NH_C0' },                                 // PLA row, sh, n
    'NH_C1', 0x68,                                                           // PLA n
    'NH_C0', 0x7a,                                                           // PLY
    'NH_DONE', 0xc2, 0x20, 0xad, 0xc2, 0xd5, 0x60,                           // REP; LDA $D5C2; RTS
    'NH_EXIT', 0x20, { a16: 'NH_CLOSE' }, 0xe2, 0x20, 0x60,                  // JSR close; SEP; RTS (397A 대체)
  ];
  const nh = assemble(items, NH_CPU);
  globalThis.__narrhalf = nh.bytes;
  const L = (n) => nh.labels.get(n);
  const sites = [
    [0x3f39a2, [0xeb, 0x85, 0x8d], [0x20, L('NH_H1') & 0xff, L('NH_H1') >> 8]],
    [0x3f3a22, [0x7a, 0x5a, 0xc2, 0x20, 0xa2, 0x00, 0x00], [0x20, L('NH_H2') & 0xff, L('NH_H2') >> 8, 0xea, 0xea, 0xea, 0xea]],
    [0x3f39d4, [0xc2, 0x20, 0xad, 0xc2, 0xd5], [0x20, L('NH_CLOSE') & 0xff, L('NH_CLOSE') >> 8, 0xea, 0xea]],
    [0x3f397a, [0xe2, 0x20, 0x60], [0x4c, L('NH_EXIT') & 0xff, L('NH_EXIT') >> 8]],
  ];
  for (const [site, want, repl] of sites) {
    for (let i = 0; i < want.length; i += 1) if (rom[site + i] !== want[i]) throw new Error(`NARRHALF 사이트 ${site.toString(16)} 스톡 불일치 +${i} (${rom[site + i].toString(16)})`);
    for (let i = 0; i < repl.length; i += 1) rom[site + i] = repl[i];
  }
  globalThis.__narrhalfLabels = Object.fromEntries(nh.labels);
  console.log(`  NARRHALF ${nh.bytes.length}B @ $FF:EB00 · 훅 $FF:39A2/3A22/39D4/397A · 줄 가운데 정렬`);
}

// ---- ①.7c 전투·메뉴 문자열 렌더러 반칸 전진 (BATTLEHALF, 2026-09-10) ----
//   $FE:AAE0 문자열 루프(전투 말풍선·명판·메뉴 라벨, 4분면 16x16 드로 AC41 + 전진 C343)는 14px 비례
//   배치라 서수별 시프트 스크립트(D7:E618[($72>>1)&3] → 6/4/2/0px, 두 타일 걸침)로 그린다. 반폭 한글을
//   그대로 두면 16px 로 벌어지고(「사 라」), 전진만 8px 로 줄이면 이웃 글리프의 왼쪽 외곽선이 앞 글자
//   마지막 잉크 열을 덮어 겹쳐 보인다(사용자 「왜 폰트가 겹치는거야」). 훅 둘(코드는 $FE:8E00 자유 공간):
//   ① $FE:AB1C `JSR AC41` → BH_DRAW: AC41 프롤로그(C22F/C305/C324) 재현 → 글리프 오른쪽 절반(TR/BR 행)
//      잉크가 없으면 한글: 스크립트 서수가 시프트 0(idx 1)이 아니면 한 타일 오른쪽에서 시작하고 $72 를
//      idx 1 로 고정, $6C = D7:E624(시프트 0 스크립트 00 FF FF 00: TL→X, TR→X+1, 걸침 없음) → AC4A.
//   ② $FE:AB1F `JSR C343; INC $72 x2` → BH_ADV: 한글이면 TL/BL 타일(캔버스 $74, +0x200)의 외곽선을
//      대사 창처럼 오른쪽·아래 그림자로 다시 계산(잉크=p0&~p1, 옛외곽=p0&p1, 체커=p1&~p0 을 행 홀짝
//      0x55/0xAA 로 복원; 스크래치는 소비된 글리프 스테이징 $0A77..) 하고 $74 += 0x10(8px), $72 유지.
//      전각이면 원본 그대로(C343 + INC $72 x2).
//   재는 것: ai_snes 전투 스테이트(rs3steam/ai_snes_battle_a3_v15)에서 명판「사라」「지랑」·기술 풍선
//   「사냥꾼의 활」이 8px 균일·외곽선 안 겹침, WP 창 불변. 못 재는 것: 커맨드 메뉴·아이템 목록·전투 뒤
//   풍선의 전수(미측정), 한 문자열 안 한글 뒤의 전각(위치가 14px 표와 어긋남 — 문안은 전부 한글).
//   RS3_BATTLEHALF=0 이면 비활성.
if (process.env.RS3_BATTLEHALF === '0') { console.log('  BATTLEHALF 비활성(RS3_BATTLEHALF=0)'); }
else {
  const BH_CPU = 0x8e00;
  const items = [
    'BH_DRAW',
    0x5a,
    0xda,
    0x20, 0x2f, 0xc2,
    0x20, 0x05, 0xc3,
    0x20, 0x24, 0xc3,
    0xc2, 0x20,
    0xa5, 0x6a,
    0x18,
    0x69, 0x08, 0x00,
    0xaa,
    0xe2, 0x20,
    0x20, { a16: 'BH_READ' },
    0x48,
    0xc2, 0x20,
    0xa5, 0x6a,
    0x18,
    0x69, 0x88, 0x00,
    0xaa,
    0xe2, 0x20,
    0x20, { a16: 'BH_READ' },
    0x03, 0x01,
    0x83, 0x01,
    0x68,
    0xd0, { r8: 'BH_GO' },
    0xa5, 0x72,
    0x4a,
    0x29, 0x03,
    0xc9, 0x01,
    0xf0, { r8: 'BH_ALIGNED' },
    0xc2, 0x20,
    0xa5, 0x74,
    0x18,
    0x69, 0x10, 0x00,
    0x85, 0x74,
    0x85, 0x66,
    0xe2, 0x20,
    0xa5, 0x72,
    0x29, 0xf9,
    0x09, 0x02,
    0x85, 0x72,
    'BH_ALIGNED',
    0xc2, 0x20,
    0xa9, 0x24, 0xe6,
    0x85, 0x6c,
    0xe2, 0x20,
    'BH_GO',
    0x20, 0x4a, 0xac,
    0xfa,
    0x7a,
    0x60,
    'BH_ADV',
    0x5a,
    0xda,
    0xc2, 0x20,
    0xa5, 0x6a,
    0x38,
    0xe9, 0x80, 0x00,
    0xaa,
    0xe2, 0x20,
    0x20, { a16: 'BH_READ' },
    0x48,
    0xc2, 0x20,
    0xa5, 0x6a,
    0xaa,
    0xe2, 0x20,
    0x20, { a16: 'BH_READ' },
    0x03, 0x01,
    0x83, 0x01,
    0x68,
    0xd0, { r8: 'BH_FULL' },
    0xa6, 0x74,
    0xa9, 0x00,
    0x20, { a16: 'BH_FIX' },
    0x48,
    0xc2, 0x20,
    0xa5, 0x74,
    0x18,
    0x69, 0x00, 0x02,
    0xaa,
    0xe2, 0x20,
    0x68,
    0x20, { a16: 'BH_FIX' },
    0xc2, 0x20,
    0xa5, 0x74,
    0x18,
    0x69, 0x10, 0x00,
    0x85, 0x74,
    0xe2, 0x20,
    0xfa,
    0x7a,
    0x60,
    'BH_FULL',
    0x20, 0x43, 0xc3,
    0xe6, 0x72,
    0xe6, 0x72,
    0xfa,
    0x7a,
    0x60,
    'BH_READ',
    0xa9, 0x00,
    0x48,
    0xa0, 0x08, 0x00,
    'BH_RLOOP',
    0xe0, 0xff, 0x7f,
    0x90, { r8: 'BH_RLO' },
    0xbf, 0x00, 0x00, 0x60,
    0x80, { r8: 'BH_RJ' },
    'BH_RLO',
    0xbf, 0x00, 0x00, 0xec,
    'BH_RJ',
    0x03, 0x01,
    0x83, 0x01,
    0xe8,
    0x88,
    0xd0, { r8: 'BH_RLOOP' },
    0x68,
    0x60,
    'BH_FIX',
    0x8f, 0x77, 0x0a, 0x7e,
    0x8b,
    0xa9, 0x7e,
    0x48,
    0xab,
    0x8e, 0x7b, 0x0a,
    0xa9, 0x00,
    0x8f, 0x78, 0x0a, 0x7e,
    0x8f, 0x7a, 0x0a, 0x7e,
    0xa9, 0x55,
    0x8f, 0x79, 0x0a, 0x7e,
    0xa0, 0x08, 0x00,
    'BH_PLOOP',
    0xbf, 0x00, 0x00, 0x7e,
    0x49, 0xff,
    0x3f, 0x01, 0x00, 0x7e,
    0xf0, { r8: 'BH_PNEXT' },
    0x2f, 0x79, 0x0a, 0x7e,
    0xf0, { r8: 'BH_PAA' },
    0xa9, 0x55,
    0x80, { r8: 'BH_PSET' },
    'BH_PAA',
    0xa9, 0xaa,
    'BH_PSET',
    0x8f, 0x78, 0x0a, 0x7e,
    0xa9, 0xff,
    0x8f, 0x7a, 0x0a, 0x7e,
    0x80, { r8: 'BH_PDONE' },
    'BH_PNEXT',
    0xaf, 0x79, 0x0a, 0x7e,
    0x49, 0xff,
    0x8f, 0x79, 0x0a, 0x7e,
    0xe8,
    0xe8,
    0x88,
    0xd0, { r8: 'BH_PLOOP' },
    'BH_PDONE',
    0xae, 0x7b, 0x0a,
    0xaf, 0x78, 0x0a, 0x7e,
    0x8f, 0x79, 0x0a, 0x7e,
    0xa0, 0x08, 0x00,
    'BH_TLOOP',
    0xbf, 0x01, 0x00, 0x7e,
    0x49, 0xff,
    0x3f, 0x00, 0x00, 0x7e,
    0x8f, 0x7d, 0x0a, 0x7e,
    0xbf, 0x00, 0x00, 0x7e,
    0x3f, 0x01, 0x00, 0x7e,
    0x8f, 0x7e, 0x0a, 0x7e,
    0xbf, 0x00, 0x00, 0x7e,
    0x49, 0xff,
    0x3f, 0x01, 0x00, 0x7e,
    0x8f, 0x7f, 0x0a, 0x7e,
    0xaf, 0x7d, 0x0a, 0x7e,
    0x4a,
    0x0f, 0x77, 0x0a, 0x7e,
    0x8f, 0x80, 0x0a, 0x7e,
    0xaf, 0x7d, 0x0a, 0x7e,
    0x49, 0xff,
    0x2f, 0x80, 0x0a, 0x7e,
    0x8f, 0x80, 0x0a, 0x7e,
    0xaf, 0x80, 0x0a, 0x7e,
    0x0f, 0x7d, 0x0a, 0x7e,
    0x49, 0xff,
    0x2f, 0x7e, 0x0a, 0x7e,
    0x2f, 0x79, 0x0a, 0x7e,
    0x2f, 0x7a, 0x0a, 0x7e,
    0x8f, 0x81, 0x0a, 0x7e,
    0xaf, 0x7d, 0x0a, 0x7e,
    0x0f, 0x80, 0x0a, 0x7e,
    0x9f, 0x00, 0x00, 0x7e,
    0xaf, 0x80, 0x0a, 0x7e,
    0x0f, 0x7f, 0x0a, 0x7e,
    0x0f, 0x81, 0x0a, 0x7e,
    0x9f, 0x01, 0x00, 0x7e,
    0xaf, 0x7d, 0x0a, 0x7e,
    0x8f, 0x77, 0x0a, 0x7e,
    0xaf, 0x79, 0x0a, 0x7e,
    0x49, 0xff,
    0x8f, 0x79, 0x0a, 0x7e,
    0xe8,
    0xe8,
    0x88,
    0xf0, { r8: 'BH_TDONE' },
    0x4c, { a16: 'BH_TLOOP' },
    'BH_TDONE',
    0xab,
    0xaf, 0x77, 0x0a, 0x7e,
    0x60
  ];
  const bh = assemble(items, BH_CPU);
  globalThis.__battlehalf = bh.bytes;
  const L = (n) => bh.labels.get(n);
  const sites = [
    [0x3eab1c, [0x20, 0x41, 0xac], [0x20, L('BH_DRAW') & 0xff, L('BH_DRAW') >> 8]],
    [0x3eab1f, [0x20, 0x43, 0xc3, 0xe6, 0x72, 0xe6, 0x72], [0x20, L('BH_ADV') & 0xff, L('BH_ADV') >> 8, 0xea, 0xea, 0xea, 0xea]],
  ];
  for (const [site, want, repl] of sites) {
    for (let i = 0; i < want.length; i += 1) if (rom[site + i] !== want[i]) throw new Error('BATTLEHALF 사이트 ' + site.toString(16) + ' 스톡 불일치 +' + i + ' (' + rom[site + i].toString(16) + ')');
    for (let i = 0; i < repl.length; i += 1) rom[site + i] = repl[i];
  }
  for (let i = 0; i < bh.bytes.length; i += 1) if (rom[0x3e8e00 + i] !== 0xff) throw new Error('BATTLEHALF 코드 자리 $FE:' + (0x8e00 + i).toString(16) + ' 가 비어 있지 않음');
  console.log('  BATTLEHALF ' + bh.bytes.length + 'B @ $FE:8E00 · 훅 $FE:AB1C/AB1F · 한글 8px 타일 정렬 + 오른쪽·아래 그림자');
}

// ---- ①.8 그림자 트리거 판정기 (TRG v3, $FF:EAC0) — 전역 무상태 이진 탐색 ----
//   키 = (커서 뱅크 $7A, 커서 주소 $78) 24비트, 표는 전용 예약 구역(고정 베이스).
//   v2 교훈 그대로: WRAM 상태 금지(커서 교차 폭주 실측), 프레임은 전부 스택.
//   미스: 캐리 클리어. 적중: 커서를 아레나로 옮기고 캐리 세트.
if (patch.shadowTable) {
  const T = patch.shadowTable;
  if (T.fmt !== 'g24') throw new Error('그림자 표 형식 불일치(g24 아님)');
  const fb = T.at >> 16;
  const tbBank = fb <= 0x3f ? fb + 0xc0 : fb;
  const addrBase = (T.at + 2) & 0xffff;
  const bankBase = (addrBase + 2 * T.n) & 0xffff;
  const arenaBase = (bankBase + T.n) & 0xffff;
  if (((T.at + 2 + 6 * T.n) >> 16) !== fb) throw new Error('그림자 표가 뱅크를 넘음');
  const UNWIND = [0x68, 0x68, 0x68, 0x7a, 0xfa, 0x28, 0xeb, 0x68, 0xeb];  // PLA lo·hi·bank; PLY; PLX; PLP; B복원
  const items = [
    'TRG',                                           // 진입 M=8
    0xeb, 0x48, 0xeb,                                // B 보존
    0x08,                                            // PHP
    0xc2, 0x30,                                      // REP #$30 (M=16, X=16)
    0xda, 0x5a,                                      // PHX; PHY
    0xa5, 0x7a, 0x29, W(0x00ff),                     // A = 커서 뱅크
    0x48,                                            // PHA (bank @5,S)
    0xa9, W(T.n - 1), 0x48,                          // PHA (hi @3,S)
    0xa9, W(0), 0x48,                                // PHA (lo @1,S)
    'LOOP',
    0xa3, 0x01, 0xc3, 0x03,                          // lo vs hi
    0xf0, { r8: 'BODY' },
    0xb0, { r8: 'MISS' },                            // lo > hi → 미스
    'BODY',
    0xa3, 0x01, 0x18, 0x63, 0x03, 0x4a,              // mid = (lo+hi)>>1
    0xa8,                                            // TAY (mid 보관)
    0xaa,                                            // TAX (mid — bank 배열 색인)
    0xbf, W(bankBase), tbBank, 0x29, W(0x00ff),      // bank[mid]
    0xc3, 0x05,                                      // vs 커서 뱅크(@5,S)
    0xd0, { r8: 'BNEQ' },                            // 뱅크 다르면 대소 분기
    0x98, 0x0a, 0xaa,                                // X = mid×2
    0xbf, W(addrBase), tbBank,                       // addr[mid]
    0xc5, 0x78,                                      // vs 커서 주소
    0xf0, { r8: 'FOUND' },
    'BNEQ',                                          // 캐리 = (mid키 >= 커서키)
    0x90, { r8: 'GOR' },
    0x98, 0x3a, 0x83, 0x03, 0x80, { r8: 'LOOP' },    // hi = mid-1
    'GOR',
    0x98, 0x1a, 0x83, 0x01, 0x80, { r8: 'LOOP' },    // lo = mid+1
    'MISS',
    ...UNWIND, 0x18, 0x6b,                           // CLC; RTL
    'FOUND',                                         // Y=mid, M=16
    0x5a, 0x98, 0x0a, 0x18, 0x63, 0x01, 0x7a,        // A = 3·mid
    0xaa,                                            // TAX
    0xbf, W(arenaBase), tbBank, 0x85, 0x8d,          // lo16 → $8D
    0xe2, 0x20,
    0xbf, W(arenaBase + 2), tbBank, 0x85, 0x7a,      // 뱅크 → $7A
    0xc2, 0x20, 0xa5, 0x8d, 0x85, 0x78,              // $78 ← lo16
    ...UNWIND, 0x38, 0x6b,                           // SEC; RTL
  ];
  const g3 = assemble(items, 0xeac0);
  globalThis.__trg = g3.bytes;
  console.log(`  TRG(v3) ${g3.bytes.length}B @ $FF:EAC0 · 전역 표 ${T.n}행 @ ${T.at.toString(16)}`);

  // ---- 제2 훅 SHIM ($FF:EB80) — 디스패처 루프 머리(분류 전) ----
  //   원본 $C0:1C93 `A7 78 29 FF 00`(LDA [$78]; AND #$00FF, M=16) 을 JSL 로 교체.
  //   TRG 는 폭 불가지(B 보존 XBA쌍·PHP/PLP 대칭)라 M=16 진입도 안전.
  //   발동이든 미발동이든 현재 커서에서 원본을 재현하면 끝 — 분류가 아직
  //   안 일어났으므로 재진입 함정(와이드 오분류)이 원리적으로 없다.
  globalThis.__shim = assemble([
    'SHIM',
    0x22, W(0xeac0), 0xff,                           // JSL TRG (커서 이동은 TRG 몫)
    0xa7, 0x78,                                      // LDA [$78] (M=16 — 원본 재현)
    0x29, W(0x00ff),                                 // AND #$00FF
    0x6b,                                            // RTL
  ], 0xeb80).bytes;
}

// ---- ①.9 TRG v4 ($FF:FD00) — 뱅크 디렉토리($FF:F800) + 뱅크별 부표 이진 탐색 ----
//   전면 그림자용. 키 = (커서 뱅크, addr16). 디렉토리 항목 5B = [n u16][부표 addr16][부표 뱅크].
//   부표 = [addr16×N][아레나 lo,hi,bank ×N] — 어느 뱅크든 됨(아레나 풀 할당).
//   v3 규율 유지: 무상태·전 프레임 스택·폭 불가지(B 보존 XBA쌍 + PHP/PLP 대칭).
//   탐색 중 DBR 을 부표 뱅크로 바꿔 `LDA $0000,X`(가변 기저)로 읽고 PLB 복원.
//   $8D 은 FOUND(=행 포기·RTS 스킵)에서만 건드린다 — 미스 경로는 무부작용.
if (patch.shadowDir) {
  const D = patch.shadowDir;
  if (D.fmt !== 'g24b') throw new Error('그림자 디렉토리 형식 불일치');
  const dir = new Array(0x500).fill(0);
  for (const [cb, e] of Object.entries(D.banks)) {
    const x = parseInt(cb, 16) * 5;
    dir[x] = e.n & 0xff; dir[x + 1] = (e.n >> 8) & 0xff;
    dir[x + 2] = e.at & 0xff; dir[x + 3] = (e.at >> 8) & 0xff;
    dir[x + 4] = (e.at >> 16) <= 0x3f ? (e.at >> 16) + 0xc0 : (e.at >> 16);
  }
  globalThis.__shdir = dir;
  const items4 = [
    'TRG4',
    0xeb, 0x48, 0xeb,                              // B 보존
    0x08,                                          // PHP
    0xc2, 0x30,                                    // REP #$30
    0xda, 0x5a,                                    // PHX; PHY
    0x8b,                                          // PHB
    0xa5, 0x7a, 0x29, W(0x00ff),                   // A = 커서 뱅크
    0x48, 0x0a, 0x0a, 0x63, 0x01, 0xaa, 0x68,      // X = 뱅크×5 (스택 균형)
    0xbf, W(0xf800), 0xff,                         // n
    0xf0, { r8: 'MISS_E' },
    0x3a, 0x48,                                    // hi = n-1 [hi]
    0xbf, W(0xf802), 0xff, 0x48,                   // base [base]
    0xa3, 0x03, 0x1a, 0x0a, 0x18, 0x63, 0x01, 0x48, // abase = base + 2n [abase]
    0xe2, 0x20,
    0xbf, W(0xf804), 0xff, 0x48, 0xab,             // DBR = 부표 뱅크
    0xc2, 0x20,
    0xa9, W(0), 0x48,                              // [lo]
    'LOOP4',                                       // 프레임: lo@1 abase@3 base@5 hi@7
    0xa3, 0x01, 0xc3, 0x07,
    0xf0, { r8: 'BODY4' },
    0xb0, { r8: 'MISS_F' },
    'BODY4',
    0x18, 0x63, 0x07, 0x4a, 0xa8,                  // mid → Y
    0x0a, 0x18, 0x63, 0x05, 0xaa,                  // X = base + 2·mid
    0xbd, W(0x0000),                               // addr16[mid]
    0xc5, 0x78,
    0xf0, { r8: 'FOUND4' },
    0x90, { r8: 'GOR4' },
    0x98, 0xf0, { r8: 'MISS_F' },                  // mid==0 → 미스 (hi 언더플로 방지)
    0x3a, 0x83, 0x07, 0x80, { r8: 'LOOP4' },       // hi = mid-1
    'GOR4',
    0x98, 0x1a, 0x83, 0x01, 0x80, { r8: 'LOOP4' }, // lo = mid+1
    'MISS_F',
    0x68, 0x68, 0x68, 0x68,
    'MISS_E',
    0xab, 0x7a, 0xfa, 0x28, 0xeb, 0x68, 0xeb,
    0x18, 0x6b,                                    // CLC; RTL
    'FOUND4',                                      // Y=mid · DBR=부표 뱅크 · M=16
    0x98, 0x0a, 0x18, 0x63, 0x03, 0x83, 0x01,      // (2mid+abase) → lo 슬롯(스크래치)
    0x98, 0x18, 0x63, 0x01, 0xaa,                  // X = abase + 3·mid
    0xbd, W(0x0000), 0x85, 0x8d,                   // 아레나 lo16
    0xe2, 0x20,
    0xa9, 0x01, 0x8f, 0x70, 0xfe, 0x7f,            // 커밋 플래그 ON (NMI 찢김 가드)
    0xbd, W(0x0002), 0x85, 0x7a,                   // 아레나 뱅크
    0xc2, 0x20, 0xa5, 0x8d, 0x85, 0x78,
    0x68, 0x68, 0x68, 0x68, 0xab, 0x7a, 0xfa, 0x28, 0xeb, 0x68, 0xeb,
    0x38, 0x6b,                                    // SEC; RTL
  ];
  const g4 = assemble(items4, 0xfd00);
  globalThis.__trg4 = g4.bytes;
  console.log(`  TRG(v4) ${g4.bytes.length}B @ $FF:FD00 · 디렉토리 뱅크 ${Object.keys(D.banks).length}개`);

  // ---- 훅 스텁 8종 ($FF:ED00 + C0 트램폴린 $C0:FEE0) ----
  //   전부 분류 후 핸들러 머리(점프표 $C0:3AD6 실측). 진입 M=8·X=16.
  //   발동: PLA(A 복원) 후 JSL 프레임 3B 버리고 RTS — 1C29 프리루드와 같은
  //   재분류 계약(행 포기, 루프가 아레나 머리를 정식 분류). 미스: 절취 원본
  //   재현 후 RTL(절대 주소 명령은 DBR 불변이라 위치 무관).
  // C0 트램폴린 + 공용 발동 꼬리 — RTS 는 PB 를 못 바꾸므로 발동 복귀는
  //   반드시 C0 에서 해야 한다(FF 스텁에서 RTS 하면 $FF:06B6 로 떨어져 죽는다,
  //   실측). CTAIL: 사이트 JSL 프레임 3B 버리고 펌프 JSR 프레임으로 RTS.
  const trBlock = assemble([
    'TR46',
    0x48,                                          // PHA
    0xa9, 0x00, 0x8f, 0x70, 0xfe, 0x7f,            // 커밋 플래그 OFF
    0x22, W(0xfd00), 0xff,                         // JSL TRG4
    0x90, { r8: 'TR_m' },
    0x68, 0x60,                                    // PLA; RTS — JMP 진입이라 제 프레임 없음
    'TR_m',
    0x68, 0x4c, W(0x1c7a),                         // PLA; JMP $1C7A
    'CTAIL',
    0xfa, 0x68, 0x60,                              // PLX; PLA; RTS (사이트 JSL 프레임 폐기 후 펌프 복귀)
  ], 0xfee0);
  globalThis.__tr46 = trBlock.bytes;
  const CTAIL = trBlock.labels.get('CTAIL');
  const stub = (label, stolen, tail) => [
    label,
    0x48,                                          // PHA
    0xa9, 0x00, 0x8f, 0x70, 0xfe, 0x7f,            // 커밋 플래그 OFF
    0x22, W(0xfd00), 0xff,                         // JSL TRG4
    0x90, { r8: label + '_m' },
    0x68, 0x5c, W(CTAIL), 0xc0,                    // PLA; JML $C0:CTAIL (발동)
    label + '_m',
    0x68,                                          // PLA
    ...stolen,
    ...(tail || [0x6b]),                           // RTL (기본)
  ];
  const g8 = assemble([
    ...stub('H_GLY', [0xac, 0xa5, 0xd5, 0xb9, 0xa7, 0xd5]),          // 1C50: LDY $D5A5; LDA $D5A7,Y
    ...stub('H_E18', [0xee, 0x16, 0xd0], [0x5c, W(0x1c7a), 0xc0]),   // 231A: INC $D016; JML $C0:1C7A
    ...stub('H_M39', [0xa2, W(0x0000), 0xc2, 0x20]),                 // 31F2: LDX #0; REP #$20
    ...stub('H_M3A', [0xc2, 0x20, 0xe6, 0x78]),                      // 32EC: REP; INC $78
    ...stub('H_M3B', [0xa9, 0xfd, 0x85, 0x8f]),                      // 30B4: LDA #$FD; STA $8F
    ...stub('H_M4A', [0xc2, 0x20, 0xe6, 0x78]),                      // 3188
    ...stub('H_M4B', [0xc2, 0x20, 0xe6, 0x78]),                      // 2095
  ], 0xfe00);
  globalThis.__hooks8 = g8;
}

// ---- ② 루틴 상주 (자유 공간 실측 대조) ----
const put = (file, bytes, label) => {
  for (let i = 0; i < bytes.length; i += 1) {
    if (rom[file + i] !== 0xff) throw new Error(`${label}: 자유 공간 아님 +${i} (${rom[file + i].toString(16)})`);
  }
  for (let i = 0; i < bytes.length; i += 1) rom[file + i] = bytes[i];
};
put(FF_FILE, ff.bytes, '$FF:E1C0');
put(C0_FILE, c0.bytes, '$C0:FF10');
if (padSkipHelper) put(0x3e9500, padSkipHelper, 'conditional/F9D pad-skip helper $FE:9500');
if (adaptivePaddingHelper) put(ADAPTIVE_PAD_FILE, adaptivePaddingHelper, 'adaptive authored-padding helper $FE:FE00');
put(0x3fe980, globalThis.__capfix, 'CAPFIX');
put(0x3fea00, globalThis.__divguard, 'DIVGUARD');
put(0x3fea40, globalThis.__capfix2, 'CAPFIX2');
if (globalThis.__narrhalf) put(0x3feb00, globalThis.__narrhalf, 'NARRHALF');
if (globalThis.__battlehalf) put(0x3e8e00, globalThis.__battlehalf, 'BATTLEHALF');
// Trade's C4:39A3 masks the glyph index to 10 bits before this font fetch.
// Recover the extended Korean font bank from the original prefix in DP $18.
// n=0x4xx loses 0x400 (font displacement 0x8000); n=0x5xx becomes
// 0x2xx, losing 0x300 (font displacement 0x6000). Keep save glyph IDs fixed.
{
  const site = 0x55d290, expected = [0xa5, 0x18, 0xc9, 0x18];
  if (!expected.every((b, i) => rom[site + i] === b)) throw new Error('TRADEFONT 원본 드리프트');
  const tf = assemble([
    0xa5, 0x18, 0xc9, 0x18, 0xf0, { r8: 'TF18' },
    0xc9, 0x46, 0xf0, { r8: 'TF46' },
    0xc9, 0x18, // Restore the original comparison's carry for stock prefixes.
    0xbf, 0x00, 0x00, 0xec, 0x85, 0x17, 0xbf, 0x08, 0x00, 0xec, 0x6b,
    'TF18', 0xbf, 0x00, 0x80, 0x60, 0x85, 0x17, 0xbf, 0x08, 0x80, 0x60, 0x6b,
    'TF46', 0xbf, 0x00, 0x60, 0x60, 0x85, 0x17, 0xbf, 0x08, 0x60, 0x60, 0x6b,
  ], 0xec80);
  if (tf.bytes.length > 0x80) throw new Error('TRADEFONT 공간 초과');
  put(0x3fec80, tf.bytes, 'TRADEFONT');
  rom.set([0x5c, 0x80, 0xec, 0xff], site);
  console.log(`  TRADEFONT $FF:EC80 ${tf.bytes.length}B`);
}
if (globalThis.__trg) put(0x3feac0, globalThis.__trg, 'TRG');
if (globalThis.__trg4) {
  put(0x3ff800, globalThis.__shdir, 'SHADOW_DIR');
  put(0x3ffd00, globalThis.__trg4, 'TRG4');
  put(0x3ffe00, globalThis.__hooks8.bytes, 'HOOKS8');
  put(0x00fee0, globalThis.__tr46, 'TR46');
  if (patch.textHelperChain) {
    const hooked = installC2Hooks(rom, patch);
    console.log(`  C2 문맥 치환 훅 ${hooked.length}곳 -> dispatcher $${patch.contextualText.dispatcherFile.toString(16)}`);
  }
}


// ---- 옵션 기록 게이트: 0x3F278A `LDA $D3C0` → `JSR RREC` ----
{
  const site = 0x3f278a;
  const stock = [0xad, 0xc0, 0xd3];
  for (let i = 0; i < 3; i += 1) {
    if (rom[site + i] !== stock[i]) throw new Error(`RREC 사이트: 스톡 불일치 +${i} (${rom[site + i].toString(16)})`);
  }
  const at = ff.labels.get('RREC');
  rom[site] = 0x20; rom[site + 1] = at & 0xff; rom[site + 2] = (at >> 8) & 0xff;
  console.log(`  RREC 훅 (RREC=$FF:${at.toString(16)})`);
}

// ---- 아레나 뱅크 표 ($FF:E300,X — X = 출발 뱅크) ----
//   스텁은 `LDA $7A`(출발 뱅크) 를 16비트 X 로 넣고 `LDA $FF:E300,X` 한다.
//   X 는 0x00..0xFF 전부 나올 수 있으므로 표는 **256칸**($FF:E300..E3FF,
//   파일 0x3FE300..0x3FE3FF)이다.
//   전엔 0xC0..0xFF 만 채웠다(64칸, 0x3FE3C0~).  율리안이 파일 뱅크 0x3C
//   = CPU $FC 라 그 범위에 들어와서 안 드러났지만, 대사는 CPU $40..$7D
//   (파일 0x40..0x7D — flow70/71/72/73/7b) 에도 있고 그쪽은 표가 비어
//   **0xFF 가 아레나 뱅크로 읽힌다**.  확대 전에 반드시 전 범위를 채워야 한다.
//   (0x3FE300..0x3FE3FF 256B 가 전부 FF 로 비어 있음을 롬에서 확인했다.)
const BANKTBL_FILE = 0x3fe300;
const BANKTBL_LEN = 0x100;
const arenaBanks = patch.arenaBanks || {};         // 키 = 출발 **CPU** 뱅크 hex
const defBank = patch.arenaBankCpu || 0xe8;
for (let i = 0; i < BANKTBL_LEN; i += 1) {
  if (rom[BANKTBL_FILE + i] !== 0xff) throw new Error(`뱅크 표 자리 자유 공간 아님 +${i}`);
}
for (let i = 0; i < BANKTBL_LEN; i += 1) {
  rom[BANKTBL_FILE + i] = arenaBanks[i.toString(16)] ?? defBank;
}
const mapped = Object.keys(arenaBanks).length;

// ---- 구간 표 ($FF:E400 색인 512B · $FF:E600 목록) ----
//   패치가 선언한 구간만 반칸이 된다.  선언이 없으면 옛 율리안 창으로 떨어진다
//   (그 값은 어셈에 박혀 있던 것과 같다 — 회귀 대조용).
const REGIDX_FILE = 0x3fe400, REGTBL_FILE = 0x3fe600, REGTBL_END = 0x3ff200;
const regions = patch.regions && patch.regions.length
  ? patch.regions : [{ bank: 0xfc, lo: 0x142b, hi: 0x23c0 }];
for (let i = 0; i < 0x200; i += 1) {
  if (rom[REGIDX_FILE + i] !== 0xff) throw new Error(`구간 색인 자리 자유 공간 아님 +${i}`);
}
const regByBank = new Map();
for (const g of regions) {
  if (!(g.hi > g.lo)) throw new Error(`빈 구간 $${g.bank.toString(16)}:${g.lo.toString(16)}..${g.hi.toString(16)}`);
  if (!regByBank.has(g.bank)) regByBank.set(g.bank, []);
  regByBank.get(g.bank).push(g);
}
const regBytes = [];
for (const [bank, list] of [...regByBank].sort((a, b) => a[0] - b[0])) {
  const off = regBytes.length;
  if (off === 0xffff) throw new Error('구간 오프셋이 종결값과 충돌');
  rom[REGIDX_FILE + bank * 2] = off & 0xff;
  rom[REGIDX_FILE + bank * 2 + 1] = (off >> 8) & 0xff;
  for (const g of list.sort((a, b) => a.lo - b.lo)) {
    // hi=0 은 목록 끝 표시라 실제 상한으로 못 쓴다 — 뱅크 끝은 0xFFFF 로 민다
    const hi = (g.hi & 0xffff) === 0 ? 0xffff : (g.hi & 0xffff);
    regBytes.push(g.lo & 0xff, (g.lo >> 8) & 0xff, hi & 0xff, (hi >> 8) & 0xff);
  }
  regBytes.push(0, 0, 0, 0);                        // 목록 끝
}
if (REGTBL_FILE + regBytes.length > REGTBL_END) throw new Error('구간 목록이 자유 공간을 넘는다');
for (let i = 0; i < regBytes.length; i += 1) {
  if (rom[REGTBL_FILE + i] !== 0xff) throw new Error(`구간 목록 자리 자유 공간 아님 +${i}`);
  rom[REGTBL_FILE + i] = regBytes[i];
}

// ---- ③ 다섯 자리 치환 (원본 대조 후) ----
const site = (file, orig, next, label) => {
  for (let i = 0; i < orig.length; i += 1) {
    if (rom[file + i] !== orig[i]) throw new Error(`${label}: 원본 불일치 +${i}`);
  }
  for (let i = 0; i < next.length; i += 1) rom[file + i] = next[i];
};
const lo = (v) => v & 0xff, hi = (v) => (v >> 8) & 0xff;
const L = (n) => ff.labels.get(n), C = (n) => c0.labels.get(n);
site(0x3f2780, [0x18, 0x69, 0x0e], [0x20, lo(L('TPEN')), hi(L('TPEN'))], '걸음');
site(0x3f27b6, [0xac, 0xa5, 0xd5], [0x4c, lo(L('T27B6')), hi(L('T27B6'))], 'dest/col');
site(0x3f23ef, [0x20, 0x21, 0x29], [0x20, lo(L('T23EF')), hi(L('T23EF'))], '슬라이드');
site(0x3f246a, [0x20, 0x48, 0x29], [0x4c, lo(L('T246A')), hi(L('T246A'))], '펜8 꼬리');
site(0x001c29, [0x85, 0x8d, 0x64], [0x4c, lo(C('STUB')), hi(C('STUB'))], '워프 훅');
if (globalThis.__trg4 && process.env.RS3_NO_NEWHOOKS !== '1') {
  const H = (n) => globalThis.__hooks8.labels.get(n);
  const jsl = (n, pad) => [0x22, lo(H(n)), hi(H(n)), 0xff, ...new Array(pad).fill(0xea)];
  site(0x001c50, [0xac, 0xa5, 0xd5, 0xb9, 0xa7, 0xd5], jsl('H_GLY', 2), '글리프 핸들러 훅');
  site(0x001c8c, [0x4c, 0x7a, 0x1c], [0x4c, 0xe0, 0xfe], '확46 훅');
  site(0x00231a, [0xee, 0x16, 0xd0, 0x4c, 0x7a, 0x1c], jsl('H_E18', 2), '확18 훅');
  site(0x0031f2, [0xa2, 0x00, 0x00, 0xc2, 0x20], jsl('H_M39', 1), '매39 훅');
  site(0x0032ec, [0xc2, 0x20, 0xe6, 0x78], jsl('H_M3A', 0), '매3A 훅');
  site(0x0030b4, [0xa9, 0xfd, 0x85, 0x8f], jsl('H_M3B', 0), '매3B 훅');
  site(0x003188, [0xc2, 0x20, 0xe6, 0x78], jsl('H_M4A', 0), '매4A 훅');
  site(0x002095, [0xc2, 0x20, 0xe6, 0x78], jsl('H_M4B', 0), '매4B 훅');
}
// 1C93(루프 머리) 훅은 철회(2026-08-26): 그 루프는 타이핑 디스패처가 아니고,
//   타이핑 페치는 $5A:AFA0→분류기다. 페치 지점 훅은 계측 선독 패스까지
//   발화시켜 에필로그 부류를 깨뜨린다(CAPFIX2 교훈) — 트리거는 분류 후
//   핸들러(홑글리프=1C29 프리루드)에만 건다.

// RS3_OUT_SUFFIX: 개발/캠페인 굽기는 접미사 파일로 — 표준 이름은 배터리 통과
//   승격 전용(사용자 Mesen 이 표준 이름을 연다. 중간판·찢긴 파일 사고 2회 실측).
const outPath = path.join(BUILD_OUT, `bokuno_korean_${TAG}_halfcell_v1${process.env.RS3_OUT_SUFFIX || ''}.smc`);
// Detect any later core writer overwriting integrated engine code before ROM
// publication. Legacy input metadata remains readable; it is not integration.
const outputEngineVerification = patch.integratedOutputEngine
  ? verifyOutputEngine(rom, patch.integratedOutputEngine) : null;
// 2026-09-17 원천 표 수리: 모든 ROM 단계 코드·표 설치가 끝난 뒤 계획한 표·포인터·분류기 바이트가 그대로인지(뒤 writer 덮어쓰기 검출).
const nativeTableRepairVerification = patch.nativeTableRepairs
  ? verifyNativeTableRepairs(rom, patch.nativeTableRepairs, {
    original: readFileSync(path.join(PROJECT, '..', 'bokuno_jp.smc')),
    c3WarMessages: JSON.parse(readFileSync(path.join(PROJECT, 'runtime', 'c3_war_messages_korean_v1.json'), 'utf8')),
    assignment: patch.assignment,
  }) : null;
if (nativeTableRepairVerification) writeFileSync(path.join(BUILD_OUT, 'native_table_repairs_verification_v1.json'), JSON.stringify(nativeTableRepairVerification, null, 2) + '\n');
if (patch.textHelperChain && !globalThis.__trg4) throw new Error('C2 contextual hooks need the TRG4 hook layer');
const c2Verification = patch.textHelperChain ? verifyC2Install(rom, patch) : null;
writeFileSync(outPath, rom);
if (c2Verification) writeFileSync(path.join(BUILD_OUT, 'c2_text_generators_verification_v1.json'), `${JSON.stringify(c2Verification, null, 2)}
`);
if (outputEngineVerification) writeFileSync(path.join(BUILD_OUT, 'integrated_output_engine_verification_v1.json'), JSON.stringify(outputEngineVerification, null, 2) + '\n');
if (PAD_SKIP && padSkipHelper) {
  writeFileSync(path.join(BUILD_OUT, 'f9d_pad17_overflow_skip_receipt_v1.json'), `${JSON.stringify({
    schema: 'f9d-pad17-overflow-skip-receipt-v1',
    sourcePc: PAD_SKIP.source.toString(16).toUpperCase(),
    lastPaddingFile: PAD_SKIP.last.toString(16).toUpperCase(),
    lastPaddingCpu: `${PAD_SKIP.cpuBank.toString(16).toUpperCase().padStart(2, '0')}:${PAD_SKIP.address.toString(16).toUpperCase().padStart(4, '0')}`,
    backPc: PAD_SKIP.backPc.toString(16).toUpperCase(), helperCpu: 'FE:9500',
    helperBytes: padSkipHelper.length, windowWidth: PAD_SKIP.width, trailingSpaces: PAD_SKIP.spaces,
    contract: 'only exact final 0x50 at line-start state is routed to existing S_noop; all other tokens use S_normal',
  }, null, 2)}\n`);
}
if (CONDITIONAL_LEADING_ROWS.length && padSkipHelper) {
  writeFileSync(path.join(BUILD_OUT, 'conditional_leading_space_receipt_v1.json'), `${JSON.stringify({
    schema: 'conditional-leading-space-receipt-v1', helperCpu: 'FE:9500', helperBytes: padSkipHelper.length,
    rows: CONDITIONAL_LEADING_ROWS.map(r => ({ sourcePc: r.source.toString(16).toUpperCase(), arenaPc: r.arena.toString(16).toUpperCase(),
      headCpu: `${r.cpuBank.toString(16).toUpperCase()}:${r.address.toString(16).toUpperCase().padStart(4, '0')}`,
      backPc: r.back.toString(16).toUpperCase(), sourceBytes: r.sourceBytes, headByte: r.head.toString(16).toUpperCase().padStart(2,'0') })),
    predicate: 'exact registered arena-head 50/51 and live half-cell cursor column=0 phase=0',
    contract: 'only registered leading 50/51 uses existing S_noop; native 24, BACK, following glyphs, and nonzero cursor positions are unchanged',
  }, null, 2)}\n`);
}
if (ADAPTIVE_PADDING && adaptivePaddingHelper) {
  writeFileSync(path.join(BUILD_OUT, 'adaptive_authored_padding_receipt_v1.json'), `${JSON.stringify({
    schema: 'adaptive-authored-padding-receipt-v1',
    helperCpu: 'FE:FE00', helperBytes: adaptivePaddingHelper.length,
    marker: 'FD FD + 50x64 + FD FD', spans: ADAPTIVE_PADDING.spans,
    contract: 'only marked 0x50 at live B1=0/C2=0 with 1<=C0<=32 is skipped to padEnd; source 0x24 remains stock',
  }, null, 2)}\n`);
}
console.log(`롬: ${outPath}`);
console.log(`  데이터 쓰기 ${patch.writes.length}건 · 행 제자리 ${patch.stats.inline} + 워프 ${patch.stats.warped}`);
console.log(`  $FF:E1C0 ${ff.bytes.length}B (TPEN=${L('TPEN').toString(16)} T27B6=${L('T27B6').toString(16)}`
  + ` T23EF=${L('T23EF').toString(16)} T246A=${L('T246A').toString(16)})`);
console.log(`  $C0:FF10 ${c0.bytes.length}B (STUB=${C('STUB').toString(16)} R=${C('R').toString(16)})`);
