// 율리안 루트 반칸 정적 빌드 + 정적 전수 검수 (2026-08-24).
//
//   무엇: julian 원장 229행을 반칸(8x16 낱글자) 정적 패치로 짓는다.
//     · 배정: 빈도 상위 175자 → 1바이트 코드(0x51..0xFF, n=c-0x50),
//       나머지 → 와이드 [0x20|(n>>8), n&0xFF], n=0xB0.. (실측 산술:
//       [page,b] → n=((page-0x20)<<8)|b, probe_wide_code_slot_map_v1)
//     · 행 공백은 0x50(순정 빈칸 — 렌더 실증). 사전 이름 속 공백은 전용
//       블랭크 글리프 코드(0x50 은 이름 복사 루프의 종결자라 못 쓴다).
//     · 제자리 우선, 초과 행은 [FE lo hi](3B, 아레나 뱅크는 스텁 고정) 워프
//       → 아레나(뱅크 0x28, $E8:9000~)에서 전문 + [FF lo hi bk] 복귀.
//       예산 3B 행(11개)까지 수용. 남는 제자리 바이트는 불가달(점프 왕복) —
//       0x50 으로 덮어 눈에도 안전하게.
//     · 매크로 {M|이름}: 원문 바이트에서 [op idx] 추출(0x39/3A/3B/4A/4B),
//       호출 바이트는 그대로 흐름에 보존. 사전 항목(인명 3D1480/8 ·
//       아이템 3D0280/8 · 지명 3D1DC0/10)은 표를 자동 판별(순정 디코드가
//       그 행의 일본어에 나타나는지)해 한국어 코드로 재작성.
//     · 글리프: $EC 슬롯(base=((n>>3)<<8)|((n&7)<<4), 위/아래 +0x80)에
//       폰트 p0, p1=0 (p1 자리는 오른쪽 8px — 반칸에선 비운다, 실측).
//
//   검수(정적 전수): 패치를 사본에 적용 → 행마다 바이트를 도로 디코드
//     (워프 추적 포함) → 원장 텍스트와 대조. BACK 표적/뱅크, 아레나 경계,
//     사전 항목 왕복까지 판정. **못 재는 것**: 실기 렌더(런타임 러너 별도),
//     말풍선 폭 대비 트레일링 패드의 열 소비(폭 실측 밖 — 위험 표기만).
//
//   산출: out/halfcell_julian_patch_v1.json (쓰기 목록 + 게이트 구간 + 배정)
//
//   사용: node tools/build_halfcell_julian_v1.mjs
import path from 'path';
import { existsSync, mkdirSync, readFileSync as nativeReadFileSync, writeFileSync, readdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { createAdaptivePadding } from './adaptive_authored_padding_v1.mjs';
import {assertBokunoOriginal,createBokunoInputRecorder} from './bokuno_build_input_guard_v1.mjs';
import {createBuildTextLineage} from './rs3_build_text_lineage_v1.mjs';
import {planOutputEngine} from './rs3_integrated_output_engine_v1.mjs';
import {planC2TextGenerators} from './rs3_c2_text_generators_v1.mjs';
import { compileSpeechArms, payloadBacks } from './rs3_speech_arms_compiler_v1.mjs';
import { createHash } from 'node:crypto';
import {createNativeEnd16Guard} from './rs3_native_end16_guard_v1.mjs';
import {verifyReviewedLiteralGroups} from './rs3_reviewed_literal_groups_v1.mjs';
// 원천 표 수리 정식 생성기(2026-09-17): 전투 메시지 풀·메뉴 풀·술법 원장·C3 레코드 — 09-13~14 격리 후보 수리의 정식 이관.
import {nativeTableRanges, planNativeTableRepairs, nativeTableRepairGlyphs, c3StreamRowWrites} from './rs3_native_table_repairs_v1.mjs';
// 조사 런타임 선택 훅(2026-09-15): 문안 토큰 {J|은는}… → 마커 슬롯 0x410.. → FF:ED00 훅이 직전 글자 받침으로 팔을 고른다.
import { JOSA_TOKEN_RE, JOSA_PAIRS, JOSA_SLOT_BASE, josaPua, isJosaPua, ENTRY_PATCH as JOSA_ENTRY_PATCH, hookWrites as josaHookWrites, assertHookSpaceFree as assertJosaSpace } from './rs3_josa_hook_v1.mjs';
// 서술격 조사 「이」 훅(2026-09-15 라운드 5 스테이징 → 통합 초안): {J|이} → 마커 슬롯 0x415, 받침 있음 「이」·없음 폭 0(zero 변형). 진입 1FA0 → EF00 → 조사 훅 ED00.
import { COPULA_TOKEN_RE, COPULA_PUA, COPULA_SLOT, isCopulaPua, ENTRY_PATCH as COPULA_ENTRY_PATCH, hookWrites as copulaHookWrites, assertHookSpaceFree as assertCopulaSpace, assertLoaderEntries as assertCopulaLoaderEntries } from './rs3_copula_hook_v1.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');
const ROOT = path.resolve(PROJECT, '..');
const sourceInputs=createBokunoInputRecorder(PROJECT);
const textLineage=createBuildTextLineage();
const readFileSync=(file,...args)=>{const value=nativeReadFileSync(file,...args);sourceInputs.record(file,Buffer.isBuffer(value)?value:nativeReadFileSync(file));return value;};
for(const name of ['build_halfcell_julian_v1.mjs','build_julian_rom_v1.mjs','bokuno_build_input_guard_v1.mjs','adaptive_authored_padding_v1.mjs','rs3_build_text_lineage_v1.mjs','rs3_text_conservation_v1.mjs','rs3_integrated_output_engine_v1.mjs','rs3_c2_text_generators_v1.mjs','rs3_native_end16_guard_v1.mjs','rs3_contextual_text_engine_v1.mjs','rs3_soft_padding_v3.mjs','rs3_zero_separator_padding_v1.mjs','rs3_prefix_separator_v1.mjs','rs3_reviewed_literal_groups_v1.mjs','rs3_native_table_repairs_v1.mjs','rs3_battle_popup_pool_repair_v1.mjs','rs3_battle_wipe_message_repair_v1.mjs','rs3_contextual_text_plan_v1.mjs']){
  const file=path.join(HERE,name);sourceInputs.record(file,nativeReadFileSync(file));
}
const CANONICAL_OUT = path.join(PROJECT, 'out');
const BUILD_OUT = process.env.RS3_BUILD_OUT
  ? path.resolve(PROJECT, process.env.RS3_BUILD_OUT)
  : CANONICAL_OUT;
if (BUILD_OUT !== CANONICAL_OUT && !BUILD_OUT.startsWith(`${PROJECT}${path.sep}`)) {
  throw new Error(`RS3_BUILD_OUT은 프로젝트 안쪽만 허용: ${BUILD_OUT}`);
}
mkdirSync(BUILD_OUT, { recursive: true });
if(process.env.RS3_INPUT_AUDIT_ONLY==='1'&&BUILD_OUT===CANONICAL_OUT)throw new Error('Input audit requires an isolated output directory');
const rt = await import(pathToFileURL(path.join(HERE, 'run_screen_glyph_runtime_v1.mjs')).href);

const rom = Buffer.from(readFileSync(path.join(ROOT, 'bokuno_jp.smc')));
assertBokunoOriginal(rom);
// ---- 0B 조각 정의부 팔 재배열 (파이프라인 최상류) ----
//   빈 팔(게이트 직후 리턴)엔 글리프가 없어 트리거를 못 건다. 정의부 안에서
//   리턴·글리프 순서만 재배열(길이·제어 수·스킵 산수 불변)해 양 팔에 글자
//   자리를 만든다 — 사용자 지시 2026-09-01 "팔 자리 자체를 옮겨".
//   **rom 버퍼에 즉시 반영**해야 행 파서·런 계산이 새 스트림을 본다.
//   최종 쓰기는 아래 소비부(원본 관문은 여기서 이미 통과)가 담당한다.
const armRelayoutWrites = [];
try {
  const armRelayout = JSON.parse(readFileSync(path.join(PROJECT, 'runtime', 'fragment_arm_relayout_v1.json'), 'utf8'));
  const hexb = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).map((x) => parseInt(x, 16));
  for (const rw of armRelayout.writes || []) {
    const at = parseInt(rw.at, 16);
    const expected = hexb(rw.expected), replacement = hexb(rw.replacement);
    if (!expected.length || expected.length !== replacement.length) throw new Error(`팔 재배열 길이 불일치 ${rw.at}`);
    const actual = [...rom.subarray(at, at + expected.length)];
    if (actual.some((v, i) => v !== expected[i])) {
      throw new Error(`팔 재배열 원본 불일치 ${rw.at}: ${Buffer.from(actual).toString('hex')} != ${Buffer.from(expected).toString('hex')}`);
    }
    for (let i = 0; i < replacement.length; i += 1) rom[at + i] = replacement[i];
    armRelayoutWrites.push([at, replacement]);
  }
  if (armRelayoutWrites.length) console.log(`0B 조각 팔 재배열(상류 반영): ${armRelayoutWrites.length}건`);
} catch (e) { if (e.code !== 'ENOENT') throw e; }
const { font, index: fontIndex } = rt.loadFont();

// ---- 글자표 (원문 토크나이즈 + 사전 순정 디코드용) ----
const tblSingles = new Map(), tblPrefixes = new Set();
for (const ln of readFileSync(path.join(ROOT, 'r3_jp_extracted.tbl'), 'utf8').split('\n')) {
  const m = ln.match(/^([0-9A-Fa-f]{2,4})=(.*)/);
  if (!m) continue;
  if (m[1].length === 2) tblSingles.set(parseInt(m[1], 16), m[2]);
  else tblPrefixes.add(parseInt(m[1], 16) >> 8);
}
const tblWide = new Map();
for (const ln of readFileSync(path.join(ROOT, 'r3_jp_extracted.tbl'), 'utf8').split('\n')) {
  const m = ln.match(/^([0-9A-Fa-f]{4})=(.*)/);
  if (m) tblWide.set(parseInt(m[1], 16), m[2]);
}

// ---- 원장 ----
// 루트는 환경변수로 받는다 (기본 julian).  전엔 율리안 원장이 박혀 있어
// 다른 루트를 구우려면 파일을 고쳐야 했다.
//   예: RS3_ROUTE=segC800 node tools/build_halfcell_julian_v1.mjs
// RS3_ROUTE 는 폰트 로더(route_config)가 이미 쓰는 변수다 — 원장 선택은 따로 둔다.
//   RS3_LEDGERS=bank:3c  또는  RS3_LEDGERS=segC800,throne,war
const ROUTE = process.env.RS3_LEDGERS || process.env.RS3_ROUTE || 'julian';
const TAG = ROUTE.replace(/[:,]/g, '_');
// 여러 원장을 한 번에 구울 수 있다 — 쉼표로 잇거나  로 그 뱅크 전부.
//   왜: 원장 하나만 구우면 **같은 뱅크의 나머지 대사가 우리 글리프로 깨진다**
//   (segC800 만 굽고 옥좌 장면을 봤더니 「玉座히면레가」 가 나왔다).
//   글리프 슬롯은 롬 전체가 공유하므로, 덮은 이상 그 뱅크의 우리 대사는 전부
//   같이 구워야 화면이 맞는다.
// 원장은 **두 곳**에 있다.  runtime/ 은 옛 표, runtime/fresh/ 는 리마스터를
// 배제하고 다시 옮긴 판이다.  전엔 runtime/ 만 읽어서 새 번역 절반을 통째로
// 빠뜨렸다(실측: 한국어 행 11,908 로 셌는데 실제는 31,809).
// 겹치는 자리는 **fresh 가 이긴다** — 그게 지금의 번역 방침이다.
const LEDGER_DIRS = [
  { dir: path.join(PROJECT, 'runtime'), fresh: false },
  { dir: path.join(PROJECT, 'runtime', 'fresh'), fresh: true },
];
const ledgerFiles = [];                            // {rt, file, fresh}
for (const { dir, fresh } of LEDGER_DIRS) {
  for (const n of readdirSync(dir)) {
    if (!n.endsWith('_route_korean_by_address_v1.json')) continue;
    ledgerFiles.push({ rt: n.replace('_route_korean_by_address_v1.json', ''), file: path.join(dir, n), fresh });
  }
}
const bankOfFile = (f) => {
  const rows = JSON.parse(readFileSync(f, 'utf8')).rows || [];
  return rows.length ? (parseInt(rows[0].startPc, 16) >> 16) : -1;
};
const picked = ROUTE === 'all'
  ? ledgerFiles
  : ROUTE.startsWith('bank:')
    ? ledgerFiles.filter((e) => bankOfFile(e.file) === parseInt(ROUTE.slice(5), 16))
    : ledgerFiles.filter((e) => ROUTE.split(',').includes(e.rt));
if (!picked.length) throw new Error(`원장을 못 찾았다: ${ROUTE}`);
const L = { rows: [] };
const ppuConfirmedExpected = [];
for (const e of picked) {
  const d = JSON.parse(readFileSync(e.file, 'utf8'));
  for (const r of (d.rows || [])) {
    L.rows.push({ ...r, _fresh: e.fresh, _source: path.basename(e.file) });
    if (/^live-ppu-confirmed-/u.test(String(r.hole || ''))) {
      ppuConfirmedExpected.push({
        s: parseInt(r.startPc, 16), e: parseInt(r.finishPc, 16), source: path.basename(e.file),
      });
    }
  }
}
// 특수 선택창은 일반 번역행보다 전용 아레나 배치를 우선한다. 운임 창 앞 8행을
// 실제 폭인 22반칸(176px)으로 채워 0x26 직전에 자동 개행시킨다.
try {
  const d = JSON.parse(readFileSync(path.join(PROJECT, 'runtime', 'special_choice_layout_overrides_v1.json'), 'utf8'));
  const rows = (d.windows || []).flatMap((w) => w.rows || []);
  for (const r of rows) {
    L.rows.push({ ...r, _fresh: true, _layoutOverride: true,
      _source: 'special_choice_layout_overrides_v1.json' });
  }
} catch (e) { /* 선택창 원장이 없는 옛 체크아웃과의 호환 */ }
// 여러 원문 행을 한 번에 넘겨야 페이지 대기·개행이 보존되는 대사는
// fresh 원장의 세분화 행보다 이 고정 레이아웃 원장을 우선한다. 이 표는
// 이전 정상 ROM의 실제 아레나 본문과 BACK 주소를 되읽어 만든 것이므로,
// 원장 재생성으로 개별 조각이 생겨도 검증된 다행 구조가 사라지지 않는다.
{
  const d = JSON.parse(readFileSync(path.join(PROJECT, 'runtime', 'forced_newline_arena_overrides_v1.json'), 'utf8'));
  for (const r of (d.rows || [])) {
    L.rows.push({ ...r, _fresh: true, _layoutOverride: true,
      _source: 'forced_newline_arena_overrides_v1.json' });
  }
}
// 같은 자리를 두 원장이 가리키면 한 번만. 새 번역은 **번역문이 있을 때만**
textLineage.capture('loaded-with-layout-overrides',L.rows);
// 옛 표를 이긴다. fresh 원장의 빈칸은 "이번 패스가 아직 안 옮김" 또는
// 잘못 잡은 머리의 보류이지, 화면에 원문을 다시 그리라는 뜻은 아니다. 빈
// fresh 행이 예전의 유효한 한글 행을 가려 3B 대사 전체가 가비지가 된 실기
// 사례가 있었으므로, 실제 한글 문안 > fresh 여부 순서로 고른다.
{
  const seen = new Map();
  // deliberateBlank 는 "미번역 빈칸"이 아니라 opcode 피연산자/고정표 등
  // **대사가 아님을 확인한 스팬**이다. 예전 원장의 가짜 문안보다 반드시
  // 우선시켜야 하며, 아래에서 번역행과 분리해 원본 보존 대상으로 삼는다.
  const score = (r) => (r.deliberateBlank === true ? 16 : 0)
    + (r._layoutOverride ? 8 : 0)
    + (/[가-힣]/.test((r.lines || [r.korean || '']).join('')) ? 4 : 0)
    + (r._fresh ? 2 : 0);
  for (const r of L.rows) {
    const k = `${r.startPc}/${r.finishPc}`;
    const p = seen.get(k);
    if (!p || score(r) > score(p)) seen.set(k, r);
  }
  L.rows = [...seen.values()];
}
textLineage.capture('exact-span-precedence',L.rows);
// ---- 원천 표 소유 선언(2026-09-17, runtime/native_table_ownership_v1.json) ----
//   전투 메시지 풀(C2:0707/D16B)·C3 전쟁 메시지(C3:08A0) 레코드는 판독기가 바이트를 직접 읽는다 — 대사 VM(C0)은 이 주소를 읽지 않는다
//   (v30 전수 워커 덤프 참조 0). 옛 원장(fresh_rgn3D9000 등)이 여기를 대사 행으로 등록해 두어, 한국어는 아무도 안 읽는 그림자 아레나에만
//   들어가고 화면(원천 판독기)엔 일본어 바이트가 한국어 글꼴로 찍혔다. 선언된 레코드 안에 온전히 든 대사 행은 표 전용 위임(deliberateBlank,
//   주석 토큰 native-table-record)으로 돌리고, 표는 rs3_native_table_repairs_v1·전쟁 메시지 writer 가 쓴다. 경계를 가로지르는 대사 행은 멈춘다.
const nativeTableOwnershipDoc = JSON.parse(readFileSync(path.join(PROJECT, 'runtime', 'native_table_ownership_v1.json'), 'utf8'));
// rom 버퍼는 위에서 이미 0B 조각 팔 재배열 등을 반영했다 — 원천 표 계획은 순정 원본 파일을 따로 읽어 쓴다(정식 출력기와 같은 관행).
const nativeTableOriginalRom = readFileSync(path.join(ROOT, 'bokuno_jp.smc'));
const nativeTableOwnedRanges = nativeTableRanges(nativeTableOriginalRom, nativeTableOwnershipDoc);
const nativeTableOwnedAt = (a, z = a + 1) => nativeTableOwnedRanges.some((r) => a < r.end && r.start < z);
const nativeTableOwnership = { schema: 'bokuno-native-table-ownership-applied-v1',
  ranges: nativeTableOwnedRanges.map((r) => ({ ...r, start: r.start, end: r.end })), convertedRows: 0, bySource: {} };
{
  for (const r of L.rows) {
    const s = parseInt(r.startPc, 16), e = parseInt(r.finishPc, 16);
    if (!Number.isInteger(s) || !Number.isInteger(e)) continue;
    const hit = nativeTableOwnedRanges.find((x) => s < x.end && x.start < Math.max(e, s + 1));
    if (!hit) continue;
    if (r.deliberateBlank === true) continue;           // 이미 대사 아님(경계 걸침 허용 — 예: 3DA3F0 fresh skip)
    if (!(s >= hit.start && Math.max(e, s + 1) <= hit.end)) {
      throw new Error(`원천 표 레코드 경계를 가로지르는 대사 행 ${r.startPc}..${r.finishPc} (${r._source}) — ${hit.table}:${hit.ids} ${hit.start.toString(16)}..${hit.end.toString(16)}`);
    }
    r.deliberateBlank = true;
    r.note = `native-table-record ${hit.table}:${hit.ids} — ${hit.writer}`;
    nativeTableOwnership.convertedRows += 1;
    nativeTableOwnership.bySource[r._source] = (nativeTableOwnership.bySource[r._source] || 0) + 1;
  }
  console.log(`원천 표 소유 선언: 레코드 구간 ${nativeTableOwnedRanges.length} · 대사 행 → 표 전용 위임 ${nativeTableOwnership.convertedRows} ${JSON.stringify(nativeTableOwnership.bySource)}`);
}
// 대사가 아닌 것으로 확인된 스팬은 번역 패커에 절대 넣지 않는다. 이전 빌더는
// 빈 single-glyph 행으로 받아들여 원본 opcode 피연산자를 FD로 패딩했고, 실제
// 이벤트가 $00:0003으로 탈선했다($3C0801의 22 4F → FD FD). 이 목록은 빌드
// 끝의 전체 쓰기 계획과도 대조하여 다른 writer의 침범까지 실패 처리한다.
const deliberateBlankSpans = [];
const deliberateBlankDelegatedSpans = [];
let deliberateBlankEmptyMarkers = 0;
{
  for (const r of L.rows) {
    if (r.deliberateBlank !== true) continue;
    const s = parseInt(r.startPc, 16), e = parseInt(r.finishPc, 16);
    const authored = (r.lines || [r.korean || '']).join('');
    // fresh_frag55의 반복 데이터표 탐지기는 글자 구간이 전혀 없을 때
    // start==finish 메타 표식을 남긴다. 실제 보호 바이트가 없으므로, 이 세
    // 조건을 모두 만족하는 0길이 표식만 기록 후 제외한다. 다른 0길이는 오류다.
    if (e === s && authored === '' && String(r.note || '').includes('고정 간격 반복 데이터표')) {
      deliberateBlankEmptyMarkers += 1;
      continue;
    }
    if (!Number.isInteger(s) || !Number.isInteger(e) || !(e > s)
        || (s >> 16) !== ((e - 1) >> 16)) {
      throw new Error(`비대사 보존 스팬 불량 ${r.startPc}..${r.finishPc} (${r._source || 'unknown'})`);
    }
    const p = { s, e, source: r._source || 'unknown', note: String(r.note || r.hole || '') };
    // dialogue 원장에서만 제외하되 전용 표/폰트/사전 빌더가 소유한 구간은
    // 그 전용 writer까지 막지 않는다. 범위 밖임이 명시된 UI·라벨·이름표만
    // 위임하며, opcode/피연산자/이진 제어 구간은 기본적으로 무쓰기 보호한다.
    const delegated = /rs3-scope-is-dialogue-only|native-table-record|라벨|이름표|합성술 기술명|전투 어휘|행 전체가 이름 매크로|매크로.*색인|사전 조각|조각 idx|0B dictionary|앞 행에 합침|원장이 이미 지움|literal adjacent|숫자뿐|글리프 표/u.test(p.note);
    (delegated ? deliberateBlankDelegatedSpans : deliberateBlankSpans).push(p);
  }
  L.rows = L.rows.filter((r) => r.deliberateBlank !== true);
  textLineage.capture('non-dialogue-separated',L.rows);
  deliberateBlankSpans.sort((a, b) => a.s - b.s || a.e - b.e);
  deliberateBlankDelegatedSpans.sort((a, b) => a.s - b.s || a.e - b.e);
  console.log(`비대사 제외: 무쓰기 보호 ${deliberateBlankSpans.length}행 · 전용 표/사전 위임 ${deliberateBlankDelegatedSpans.length}행`
    + (deliberateBlankEmptyMarkers ? ` · 0길이 데이터표 표식 ${deliberateBlankEmptyMarkers}` : ''));
}
// 스팬이 **포개지는** 행은 하나만 남긴다.  같은 자리(정확히 일치)는 위에서
// 접었지만, 시작이 다르면서 겹치는 행이 남아 서로의 바이트를 덮는다 —
// 화면에 「북북쪽」·「내놓아내놓아라」 처럼 겹친 글이 나왔다(실측 65행).
// 레이아웃 관문은 시작 주소가 한 바이트 빠른 옛 조각보다 반드시 우선한다.
// 예전의 주소순 단일 패스는 3B9D5E의 잘못 잡힌 피연산자 행이 3B9D5F의
// 실기 확정 전체 문장을 가려 버렸다. 먼저 레이아웃 행을 고정한 뒤 나머지를
// 주소순으로 접어, 기존 비레이아웃 행끼리의 선택 규칙은 그대로 유지한다.
{
  const layouts = L.rows.filter((r) => r._layoutOverride)
    .sort((x, y) => parseInt(x.startPc, 16) - parseInt(y.startPc, 16));
  const ord = L.rows.filter((r) => !r._layoutOverride)
    .sort((x, y) => (parseInt(x.startPc, 16) - parseInt(y.startPc, 16))
    || ((y._fresh ? 1 : 0) - (x._fresh ? 1 : 0))
    || (parseInt(y.finishPc, 16) - parseInt(x.finishPc, 16)));
  const kept = layouts.slice(); let lastEnd = -1, lastBank = -1, dropped = 0;
  const overlapsLayout = (s, e) => layouts.some((r) => {
    const a = parseInt(r.startPc, 16), b = parseInt(r.finishPc, 16);
    return (a >> 16) === (s >> 16) && s < b && a < e;
  });
  for (const r of ord) {
    const s2 = parseInt(r.startPc, 16), e2 = parseInt(r.finishPc, 16);
    if (overlapsLayout(s2, e2)) { dropped += 1; continue; }
    if ((s2 >> 16) === lastBank && s2 < lastEnd) { dropped += 1; continue; }
    kept.push(r); lastBank = s2 >> 16; lastEnd = Math.max(lastEnd, e2);
  }
  if (dropped) console.log(`  겹치는 스팬 ${dropped}행 버림`);
  L.rows = kept.sort((x, y) => parseInt(x.startPc, 16) - parseInt(y.startPc, 16));
}
console.log(`원장 ${picked.length}개(fresh ${picked.filter((e) => e.fresh).length}) · 행 ${L.rows.length}`);
textLineage.capture('overlap-precedence',L.rows);
const MACRE = /\{M\|([^}]*)\}/g;
// 이름을 **찍는** op 만 넣는다.  실기 강제 타이핑으로 갈랐다
// (2026-08-24, probe_force_macro_op_v1 — 첫 말풍선 본문에 심고 화면·펼침 계수):
//   4A 인명 · 3B 지명 · 3A 아이템 → 펼쳐서 그린다
//   39 파티 슬롯 → **그린다**(동적 이름).  이름을 박으면 다른 루트에서
//      거짓말이 되므로 비워 둔다 ([[rs3-member-token-must-stay-nameless]])
//   4B → **아무것도 안 그린다**.  뒤에 4A 를 붙여 봤더니 그 이름들은 그대로
//      찍혔다(펼침 0 · 그린 칸 기여 0) — 흐름도 안 끊는 무동작 제어다.
//      그래서 매크로가 아니라 **제어 바이트**로 둔다(인수 1B, 자리 보존).
//      전엔 매크로로 세서 한국어에 없는 {M} 토큰을 요구했다.
const MACRO_OPS = new Set([0x39, 0x3a, 0x3b, 0x4a]);
// 원문 0x24 두 개를 한 아레나 문장으로 흡수한 대사는 원장 개행을 공백으로
// 평탄화하면 줄 제어 자체가 사라진다. 이 행은 개행을 바이트로 보존한다.
const FORCED_NEWLINE_ARENA_ROWS = new Set([
  0x3b148f,
  0x3b5660, 0x3b56a7, 0x3b56e8, 0x3b572f, 0x3b64ad,
  0x3b576a, 0x3b577f, 0x3b57c2,
  0x3b581a, 0x3b584d, 0x3b6884, 0x3b68a4, 0x3b693f,
  // 일본어 전각 폭에 맞춘 극단적인 2행 나눔을 반칸 글꼴 폭에 맞춰 재배분한다.
  // 내부 페이지 대기가 없는 순수 대사 스팬만 이 경로로 넣는다.
  0x3b4965, 0x3b6eaf, 0x3b7024,
  // FB:E5A1은 세 이름 매크로 뒤에 일본어 폭 기준 개행이 남아, 실제 화면에서
  // 「란스의 교역을 / 방해하고 있다.」만 따로 밀렸다. 두 원문 조각의
  // 매크로 순서는 보존한 채, 한 아레나 본문에서 두 줄로 다시 나눈다.
  0x3be5a1,
  // FC:8B73 / 55:BE4A는 한 줄이 정확히 폭에 닿은 뒤 원문 24가 다시 실행돼
  // 그 사이에 빈 행이 생긴 실기 확인 사례다. 각 문장을 명시 두 줄로 묶는다.
  0x3c8b73, 0x55be4a,
  0x7301e6, 0x737a6b,
  // 73:042F는 폭 끝의 「이」 뒤에 원래 공백이 다음 행 첫 칸으로 넘어가
  // 실제 PPU에서 「아이도…」가 한 칸 들여쓰기됐다. 같은 두 줄을 명시한다.
  0x73042f,
  // 볼카노/운디네 의뢰 거절 꼬리는 두 대사 뒤의 입력 대기까지 한 실행 묶음이다.
  // 행별 그림자 전환은 이 지점의 리더 커서를 $0007로 무너뜨렸으므로, 원래의
  // 개행·대기를 보존한 단일 아레나 스트림으로 교체한다.
  0x3bb948, 0x3bbdae,
  // FB:DB31은 원문이 다섯 칸짜리 일본어 자동 줄맞춤을 문장 한가운데에
  // 박아 두었다. 한국어 반칸 폭에서는 둘째 줄이 부자연스럽게 밀리므로,
  // 원래 마지막 0x2C 대기를 포함한 두 줄 본문으로 아레나에 보존한다.
  0x3bdb31,
  // FB:328A / 334E는 원장이 바로 다음 텍스트 op까지 번역해 놓고도
  // 짧은 첫 op 뒤로 복귀해 꼬리가 일본어 바이트로 다시 그려졌다. 두 op를
  // 한 아레나 본문으로 묶고, 뒤의 원래 pause/wait에서 이어 간다.
  0x3b328a, 0x3b334e,
  // FA:3269는 반칸 글꼴에서 첫 줄이 가득 찬 뒤 원문의 공백이
  // 「필요합니다」 앞에 넘어갔다. 실제 PPU가 확인한 두 줄로 고정한다.
  0x3a3269,
  // 73:7800은 앞의 짧은 원문 조각과 조건부 0B74 사이에서 어절 경계가
  // 사라지는 호출부다. 정상 경로는 하나의 아레나 본문으로 흡수한다.
  0x737800,
  // 0BB5 공유 접미사는 다른 호출부를 위해 선행 구분 공백을 유지한다.
  // 이 두 행은 원문 24 직후에 0BB5를 불러 공백이 줄 첫 칸에 찍히므로,
  // 확장된 행 끝까지 아레나로 건너뛰어 그 24만 흡수한다.
  0x3bc024, 0x3bc05a,
  // 실제 PPU에서 짧은 조사나 이름 뒤의 어절이 다음 줄로 떨어진 행.
  // raw-bridge 직접 FE 증거가 있는 머리는 아래 강제 아레나 처리에서도
  // 그 직접 진입을 유지한다.
  0x3b228c, 0x3b22bd, 0x3b2c31, 0x3b2ca3, 0x3b2f7a, 0x3b2fb9, 0x3b306d,
  0x3b4af5, 0x3b4b10, 0x3b4b40, 0x3b4b54, 0x3b4b5e,
  0x3b4c32, 0x3b4c53, 0x3b4c76, 0x3b61b6, 0x3b62d7,
  0x3b7f11, 0x3b9bfd, 0x73cad0,
  // Full-event live PPU sweep. Every range ends before its original pause;
  // 3B992C is also the real 05D9 event entry, so no event boundary is crossed.
  0x3b1523, 0x3b1538, 0x3b1542, 0x3b1560, 0x3b15ae, 0x3b15d5,
  0x3b1603, 0x3b161b, 0x3b1632, 0x3b1649, 0x3b166b,
  0x3b1686, 0x3b178a, 0x3b1798,
  0x3b0ba4,
  0x3b24c4, 0x3b24fa, 0x3b25d3, 0x3b25f8, 0x3b2620,
  0x3b29ee, 0x3b2a15, 0x3b2ada, 0x3b2af5,
  0x3b2b71, 0x3b2b8e, 0x3b2bad, 0x3b4f7c,
  0x3b6707, 0x3b6764, 0x3b67a0, 0x3b8614, 0x3b9921, 0x3b9934, 0x3b9943,
  0x3b9ceb, 0x3b9d5f, 0x3b9d97, 0x3b9db8, 0x3b9dcb, 0x3b9dec, 0x3bc496,
]);
// 실제 PPU 전수 검수에서 추가되는 행은 이 소스의 하드코딩 목록을 매번
// 손으로 고치지 않는다. 레이아웃 원장에서 `forceNewlineArena:true`를
// 명시한 행만 종전과 같은 엄격한 강제 개행 경로에 올린다.
{
  const d = JSON.parse(readFileSync(path.join(PROJECT, 'runtime', 'forced_newline_arena_overrides_v1.json'), 'utf8'));
  for (const row of (d.rows || [])) {
    if (row.forceNewlineArena !== true) continue;
    const start = parseInt(row.startPc, 16);
    if (!Number.isInteger(start)) throw new Error(`실제 PPU 강제 개행 주소 오류: ${row.startPc}`);
    FORCED_NEWLINE_ARENA_ROWS.add(start);
  }
}
// 강제 개행 아레나는 원문 스트림을 통째로 건너뛴다. 그 안에 0x2C(키 대기)가
// 있으면 두 페이지를 하나로 삼켜 앞쪽이 자동 스크롤된다. 기본적으로 내부
// 대기는 빌드에서 즉시 막되, 저작문 안의 form-feed(\f)가 원문 대기 수와 정확히
// 맞는 행만 그 대기를 새 아레나 스트림에 보존하도록 허용한다.
for (const s of FORCED_NEWLINE_ARENA_ROWS) {
  const owner = L.rows.find((r) => parseInt(r.startPc, 16) === s);
  if (!owner) throw new Error(`강제 개행 원장 행 없음: $${s.toString(16)}`);
  // `backPc`가 있으면 원문 행의 본문 범위와 별개로 이 지점까지 한 번에
  // 건너뛴다.  중간 팔은 독립 진입점으로도 쓰일 수 있어 원장 스팬은 짧게
  // 유지하되, 정상 순차 호출에서는 한 아레나 문장으로 이음매를 없앤다.
  const e = parseInt(owner.backPc || owner.finishPc, 16);
  const sourceWaits = [];
  for (let a = s + 1; a < e; a += 1) {
    if (rom[a] === 0x2c) sourceWaits.push(a);
  }
  const authored = (owner.lines || [owner.korean || '']).join(String.fromCharCode(10));
  const authoredWaits = [...authored].filter((ch) => ch === '\f').length;
  if (sourceWaits.length !== authoredWaits) {
    const where = sourceWaits.map((a) => `$${a.toString(16)}`).join(', ') || '없음';
    throw new Error(`강제 개행 페이지 대기 불일치: $${s.toString(16)} 원문 ${sourceWaits.length}(${where}) / 저작 ${authoredWaits}`);
  }
}
// 폰트에 없는 글자를 폰트에 있는 것으로 모은다.  이 폰트는 한글 2,350자 +
// ASCII 0x20..0x7E 뿐이다(실측 2,445자).  원장이 전각으로 적은 숫자·괄호·
// 말줄임표가 그대로 오면 빌드가 죽는다(전 롬 첫 시도에서 25종이 나왔다).
//   전각 공백 → 반칸 공백 · 가운뎃점 → 붙임표 · 전각 영숫자기호 → 반각
//   … ‥ → ..  (반칸 둘 = 전각 하나 폭이라 자리가 안 밀린다)
//   「」『』 → "  (폰트에 낫표가 없다)
const normText = (s) => s
  .replace(/　/g, ' ')
  // 가운데점은 '.' 로 (사용자 지시 — '-' 는 화면에서 어색하다)
  .replace(/[·・]/g, '.')
  .replace(/[…‥]/g, '..')
  .replace(/[「『]/g, '"').replace(/[」』]/g, '"')
  .replace(/[∼〜～]/g, '~')
  .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  // 쉼표 뒤 빈칸은 두지 않는다 (사용자 지시 — 레트로 조판).  전각을 반각으로
  //   누른 **뒤**에 걸어야 '，␣' 도 잡힌다.  마침표·물음표는 건드리지 않는다.
  .replace(/, +/g, ',');

// 동적 00xx/0Bxx 호출 직후의 1바이트 문장부호는 한글이 없고 원문도 한 글자라
// 아래 두 일반 휴리스틱에 걸린다. source-account가 호출 바이트와 분리된 정확한
// 1바이트 literal임을 증명한 이 49주소만 허용한다. hole 표식만 흉내 내거나 새
// 주소가 조용히 늘어나는 경우에는 빌드 중단으로 닫는다.
const SOURCE_ACCOUNT_DYNAMIC_PUNCTUATION_SUFFIX_ROWS = new Set([
  0x3b2391, 0x3b23f1, 0x3b242c, 0x3b271f, 0x3b277a, 0x3b27ba, 0x3b27c4,
  0x3b298c, 0x3b2b56, 0x3b2d6d, 0x3b336d, 0x3b339b, 0x3b5cba, 0x3b5dd6,
  0x3b5fb3, 0x3b71c5, 0x3b71d0, 0x3b71e3, 0x3b769d, 0x3b76a4, 0x3b76d5,
  0x3b99b8, 0x3baf55, 0x3bc5d2, 0x3bc5df, 0x442def, 0x4450eb, 0x4451b7,
  0x4488ac, 0x448c2d, 0x448c79, 0x449245, 0x449b01, 0x45170a, 0x4d7039,
  0x4d847d, 0x4dbfa3, 0x7342e2, 0x734323, 0x734368, 0x7344d8, 0x7344f1,
  0x7347ea, 0x73a88a, 0x73a896, 0x73a8a4, 0x73a954, 0x73a96b, 0x73c787,
]);
const rows = [];
let skipNoKo = 0, skipOrphan = 0;
for (const r of L.rows) {
  const s = parseInt(r.startPc, 16), e = parseInt(r.finishPc, 16);
  if (!(e > s)) { textLineage.exclude(r,'non-positive-span'); continue; }
  // 원장은 주인공 이름을 {PC} 로 쓴다 = 롬의 39(파티 슬롯) 매크로.
  // 이름은 엔진이 동적으로 그리므로 우리는 **자리만** 지킨다 — 사전 재작성 없음
  // (39 는 op 표가 없어 dictPlan 이 알아서 건너뛴다).
  // **{PC} 치환은 정규화 뒤에** — `＿`(U+FF3F)는 전각 ASCII 범위라 normText 가
  //   반각 `_` 로 눌러버린다.  그러면 디코더가 내는 `＿` 와 안 맞아 검수가 깨진다.
  let text = normText((r.lines || [r.korean || '']).join(String.fromCharCode(10)))
    .replace(/{PC}/g, '{M|＿}')
    // 조사 토큰 {J|은는} 등 → 사설 문자(빈도표·폰트 제외, 슬롯 0x410.. 수동 배정) — rs3_josa_hook_v1
    .replace(JOSA_TOKEN_RE, (m, p) => josaPua(JOSA_PAIRS.indexOf(p)))
    // 서술격 토큰 {J|이} → 사설 문자(슬롯 0x415 수동 배정) — rs3_copula_hook_v1. 조사 쌍 정규식과 겹치지 않는다({J|이가} 는 조사 쪽).
    .replace(COPULA_TOKEN_RE, COPULA_PUA)
    // **줄 머리 빈칸 소거** (사용자 지시 — 첫 칸이 비면 아주 보기 안 좋다):
    //   개행 뒤 공백은 무조건 지운다.  행 머리 공백은 앞 원본 바이트가 줄
    //   시작 제어(개행·창 열기·키 대기·선택지)일 때만 — 조각이 줄 중간에
    //   이어붙는 행의 머리 공백은 어절 경계라 지우면 안 된다
    //   ([[rs3-korean-fragments-need-spaces]]).
    .replace(new RegExp(String.fromCharCode(10) + ' +', 'g'), String.fromCharCode(10));
  {
    const LINE_START = new Set([0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2c, 0x4d]);
    if (LINE_START.has(rom[s - 1]) && !r.preserveLeadingSpace) text = text.replace(/^ +/, '');
  }
  const preserveTrailingSpace = r.preserveTrailingSpace === true;
  if (preserveTrailingSpace
      && (!text.endsWith(' ') || text.endsWith('  ') || !text.slice(0, -1).trim())) {
    throw new Error(`preserveTrailingSpace requires one trailing ASCII space on non-empty row: $${s.toString(16)}`);
  }
  // 실기 PPU가 원문 글리프를 실제로 그렸다고 확정한 bridge 행은 한 글자 조사나
  // 문장부호뿐일 수 있다. 이 증거 행을 일반 휴리스틱(no-Hangul / 1글자 고아)으로
  // 버리면 원장에는 수정이 있는데 ROM에는 전혀 안 굽는 거짓 성공이 된다.
  const ppuConfirmed = /^live-ppu-confirmed-/u.test(String(r.hole || ''));
  const sourceAccountDynamicPunctuation = r.hole === 'source-account-dynamic-punctuation-suffix';
  if (sourceAccountDynamicPunctuation) {
    const exactAllowed = SOURCE_ACCOUNT_DYNAMIC_PUNCTUATION_SUFFIX_ROWS.has(s)
      && e === s + 1
      && /^[.!?]$/u.test(text)
      && [...String(r.japanese || '')].length === 1;
    if (!exactAllowed) {
      throw new Error(`동적 문장부호 source-account 범위 불일치: $${s.toString(16)}..$${e.toString(16)}`);
    }
  }
  const explicitSingleGlyph = r.hole === 'single-glyph' || sourceAccountDynamicPunctuation;
  // 조사 마커({J|..} → 사설 문자)는 런타임 훅이 한글 조사 글리프를 그리므로 「한글 있음」이자 「의도적 1글자 덮기」다
  //   (2026-09-15 실측: 「{J|은는}?」 16행이 no-Hangul 휴리스틱에 걸려 통째로 안 구워져 원문 「は？」 바이트가 「지※」 괴문자로 떴다 — v19 diff 0x0022/0x0C27…).
  const hasJosaMarker = [...text].some((ch) => isJosaPua(ch) || isCopulaPua(ch));   // 서술격 마커도 「의도적 한글 조사 자리」(단독 「{J|이}」 행이 no-Hangul 휴리스틱에 버려지지 않게)
  if (!r.suppress && !explicitSingleGlyph && !ppuConfirmed && !hasJosaMarker && !/[가-힣]/.test(text)) { textLineage.exclude(r,'no-Hangul-heuristic'); skipNoKo += 1; continue; }
  // 1글자 고아 스킵 — 단, 의도적 1글자 덮기(hole:'single-glyph', 매크로 뒤
  //   、。と様は 잔재)는 통과시킨다 (2026-08-25).  조사 마커 행(「{J|은는}」 = 원문 「は」 덮기)도 의도적이다.
  if (!r.suppress && !explicitSingleGlyph && !ppuConfirmed && !hasJosaMarker && [...(r.japanese || '')].length <= 1) { textLineage.exclude(r,'single-Japanese-glyph-heuristic'); skipOrphan += 1; continue; }
  // 서술격 마커 문맥 관문(rs3_copula_hook_v1). 훅은 「직전에 실제로 그린 글자」(LAST $7F:FE72)의 받침으로 고르므로:
  //   ① 앞 = 같은 행의 한글·숫자·매크로 끝(})이거나, 행 머리면 원본 바로 앞 토큰이 이름/아이템/지명/대명사 조각(39·3A·3B·4A·0B xx, 4F 13 xx)
  //   ② 뒤 = 같은 행 안 한글 글리프(「이다·이군요·이지·이잖아·이여」 류). 공백·부호·개행·조사 마커 옆은 금지.
  //   zero 변형은 뒤 바이트를 읽지 않으므로 ②는 런타임 안전 조건이 아니라 문안 규칙이다(행을 넘는 어미가 필요해지면 행 플래그로 완화).
  //   못 재는 것: 행 머리 판정은 원본 두 바이트 모양만 본다(피연산자 우연 일치 가능) — 조사 계획기와 같은 수준.
  if ([...text].some(isCopulaPua)) {
    const chars = [...text];
    for (let i = 0; i < chars.length; i += 1) {
      if (!isCopulaPua(chars[i])) continue;
      const prevOk = i === 0
        ? ([0x39, 0x3a, 0x3b, 0x4a, 0x0b].includes(rom[s - 2]) || (rom[s - 3] === 0x4f && rom[s - 2] === 0x13))
        : /[가-힣0-9}]/.test(chars[i - 1]);
      if (!prevOk) throw new Error(`서술격 마커 {J|이} 앞 문맥 불가(공백·부호·개행·비매크로 행 머리): $${s.toString(16)} 「${text}」`);
      if (!(chars[i + 1] && /[가-힣]/.test(chars[i + 1]))) throw new Error(`서술격 마커 {J|이} 뒤가 같은 행 안 한글이 아니다: $${s.toString(16)} 「${text}」`);
    }
  }
  // **원장이 준 원문을 따로 붙들어 둔다.**  빌더가 text 를 고치면(깎기·이월·
  //   되감기) 정적 검수는 고친 뒤 텍스트와 대조하므로 **무조건 통과한다** —
  //   무엇을 바꿨는지는 이 원문과 대조해야만 보인다.
  textLineage.prepare(r,text);
  rows.push({ s, e, back: parseInt(r.backPc || r.finishPc, 16), text, origText: text,
    japanese: r.japanese || '', suppress: r.suppress === true,
    // 조건 팔의 조각 첫 공백은 문장 줄머리가 아니라 직전 팔 본문의 어절 경계일
    // 수 있다. 원장이 명시했을 때만 뒤 패커까지 이 의도를 전달한다.
    preserveLeadingSpace: r.preserveLeadingSpace === true,
    preserveTrailingSpace,
    hardNewlines: r.hardNewlines === true,
    ppuConfirmed });
}

// ---- 원문 토크나이저: 텍스트/매크로 추출.  미지 바이트에서 멈추고 그
const lineageReport=textLineage.report();
writeFileSync(path.join(BUILD_OUT,`halfcell_${TAG}_text_lineage_v1.json`),JSON.stringify(lineageReport,null,1));
const reviewedLiteralGroups = ROUTE === 'all' ? verifyReviewedLiteralGroups(
  readFileSync(path.join(ROOT, 'bokuno_jp.smc')), lineageReport,
  JSON.parse(readFileSync(path.join(PROJECT, 'runtime/reviewed_literal_source_groups_v1.json'), 'utf8')),
) : null;
if (reviewedLiteralGroups) writeFileSync(path.join(BUILD_OUT, 'reviewed_literal_source_groups_verification_v1.json'), JSON.stringify(reviewedLiteralGroups,null,2)+'\n');
if(process.env.RS3_INPUT_AUDIT_ONLY==='1'){
  const auditInputs=sourceInputs.receipt(Buffer.from(JSON.stringify(lineageReport,null,1)),ROUTE);
  auditInputs.schema='bokuno-input-lineage-inputs-v1';auditInputs.lineageSha256=auditInputs.patchSha256;delete auditInputs.patchSha256;
  writeFileSync(path.join(BUILD_OUT,`halfcell_${TAG}_text_lineage_v1.inputs.json`),JSON.stringify(auditInputs,null,2)+'\n');
  console.log(JSON.stringify({status:'INPUT_AUDIT_ONLY_NO_ROM_NO_APPROVAL',...lineageReport.summary}));process.exit(0);
}
if(process.env.RS3_FAIL_ON_LOSSY==='1'&&lineageReport.summary.selectedKoreanLinesConflicts>0)throw new Error(`Selected korean/lines content conflicts require adjudication: ${lineageReport.summary.selectedKoreanLinesConflicts}; see text_lineage_v1.json`);
//      지점(tEnd)을 텍스트 구간의 끝으로 삼는다 — 일부 행은 스팬에 꼬리
//      제어(48 00 03… 실측)가 끼어 있고, 그 바이트들은 건드리지 않는다.
//      개행 0x24 는 행 내 텍스트 토큰이다(다행 행 실측).
//      **2026-08-24 개정**: 첫 제어에서 멈추지 않고 **스팬 끝까지** 간다.
//      사용자 지적이 옳았다 — "본문만 번역해 두면 팔은 엔진이 알아서 찾는다".
//      일본어가 멀쩡히 나오는 이유는 팔마다 제 텍스트가 들어 있어서고, 우리가
//      첫 0x4E 에서 멈춰 뒤쪽 팔을 일본어로 남긴 게 화면 쓰레기의 정체였다
//      (실측: 3C20DF = [{4a:3}][4E 02][トム！] — 뒤 조각이 통째로 미번역).
//      제어 바이트는 위치·길이 그대로 보존하고 쓸 수 있는 자리만 모은다.
//      **0x4E NN 의 스킵 길이는 바이트**라 구간 길이를 바꾸면 팔이 어긋난다 —
//      제자리 인코딩(길이 보존)이 필수 조건이다.
const ACX = JSON.parse(readFileSync(path.join(ROOT, 'rs3steam', 'rs3_wiki_op_argcounts_v1.json'), 'utf8'));
const argMain0 = ACX.main00_4F, argSub0 = ACX.sub4F;
const NEWLEN_OFF = process.env.RS3_NEWLEN === '0';   // 이분용: 0D/49 모드 길이 끄기
const LEN0D_real = (m, nxt) => {  // 0x0D 모드 길이 — 출처: 포지 EventDecoder Extension0DLengths(엔진 유래), 45014B/450600 글리프 경계 실증 (2026-08-26)
  if (m === 0x20) return 3 + (nxt || 0) * 2;
  const T = { 0x00:4,0x01:4,0x02:4,0x03:4,0x04:3,0x05:3,0x06:3,0x07:3,0x08:3,0x09:3,0x0a:3,0x0b:2,0x0c:3,0x0d:3,0x0e:3,0x0f:5,
    0x10:3,0x11:6,0x12:2,0x13:2,0x14:2,0x15:3,0x16:4,0x17:5,0x18:5,0x19:3,0x1a:4,0x1b:3,0x1c:2,0x1d:3,0x1e:2,0x1f:3,
    0x2d:3,0x2f:2,0x30:4,0x31:4,0x32:3,0x33:3,0x3a:8,0x3b:2,0x3c:3,0x3d:3,0x3e:3,0x3f:2 };
  if (T[m] !== undefined) return T[m];
  if ((m >= 0x21 && m <= 0x2c) || m === 0x2e || (m >= 0x34 && m <= 0x39) || (m >= 0x40 && m <= 0x4f)) return 2;
  return 2;                                        // 미지 모드 — 종전 근사(2바이트) 유지
};
const LEN0D = (m, nxt) => (NEWLEN_OFF ? 2 : LEN0D_real(m, nxt));
const LEN49 = (m) => (NEWLEN_OFF ? 1 : (m <= 3 ? 4 : (m <= 5 ? 3 : (m === 0x40 ? 2 : 1)))); // 0x49 모드 길이 — 출처: 포지 EventDecoder Mode49(엔진 점프표 유래) + 73E12E/721376 글리프 경계 실증 (2026-08-26)
//      **개행(0x24)은 제어로 친다** — 자리를 그대로 둬야 줄 구조가 원문과
//      같아진다("행 수를 원문에 맞춰라").  우리가 개행 위치를 새로 정했더니
//      없던 줄이 생겨 말풍선이 밀렸다(유령 줄, 3C1B8F·3C14DF 실측).
//      **2026-08-24 되돌림 (사용자 지시)**: 스팬 전체를 워크해 팔 뒤 조각까지
//      짜는 판을 만들었으나(포기 4→0), 줄 구조가 원문과 어긋나 유령 줄이
//      생겼다.  화면이 검증된 판은 이 단순판이므로 여기로 되돌린다.
//      팔(0x4E) 뒤 조각은 미번역으로 남는다 — 알려진 4행, 별도 과제.
const parseOriginal = (s, e) => {
  const macros = [];
  let a = s;
  while (a < e) {
    const b = rom[a];
    if (MACRO_OPS.has(b) && a + 1 < e) { macros.push({ op: b, idx: rom[a + 1], bytes: [b, rom[a + 1]] }); a += 2; continue; }
    if (tblPrefixes.has(b) && a + 1 < e) { a += 2; continue; }
    if (tblSingles.has(b) || b === 0x50 || b === 0x24) { a += 1; continue; }
    break;                                         // 미지 = 텍스트 끝
  }
  return { macros, tEnd: a };
};

// ---- 스팬 전체 워크 (팔이 낀 행 전용 폴백) ----
//   위 단순판은 첫 제어(0x4E)에서 멈춘다.  그러면 팔 **뒤** 조각이 일본어로
//   남고, 글리프가 한글로 덮여 있어 화면에 뜻 없는 한글이 뜬다(사용자 보고
//   「톰」·이름 매크로 깨짐).  이 폴백은 스팬을 끝까지 워크해 제어 바이트는
//   위치·길이 그대로 두고 **쓸 수 있는 구간만** 모은다.
//   지켜야 할 것 둘:
//     · **0x24 는 제어로 둔다** — 줄 구조를 원문 그대로 유지한다(유령 줄 방지)
//     · **0x4E NN 의 스킵 길이는 바이트** — 구간 길이를 바꾸면 팔이 어긋난다
const parseSpanFull = (s, e) => {
  const macros = [], runs = [], skips = [];
  let a = s, runA = -1;
  const closeRun = () => { if (runA >= 0) { runs.push({ a: runA, n: a - runA }); runA = -1; } };
  while (a < e) {
    const b = rom[a];
    if (MACRO_OPS.has(b) && a + 1 < e) {
      if (runA < 0) runA = a;
      macros.push({ op: b, idx: rom[a + 1], bytes: [b, rom[a + 1]] }); a += 2; continue;
    }
    if (tblPrefixes.has(b) && a + 1 < e) { if (runA < 0) runA = a; a += 2; continue; }
    if (tblSingles.has(b) || b === 0x50) { if (runA < 0) runA = a; a += 1; continue; }
    closeRun();
    if (b === 0x24) { a += 1; continue; }           // 개행은 제어 — 자리 고정
    if (b === 0x4e) skips.push([a + 2, a + 2 + rom[a + 1]]);
    const n = (b === 0x4f) ? (2 + (argSub0[rom[a + 1]] || 0)) : (b === 0x49 ? LEN49(rom[a + 1]) : (b === 0x0d ? LEN0D(rom[a + 1], rom[a + 2]) : (1 + (argMain0[b] || 0))));
    if (n <= 0) break;
    a += n;
  }
  closeRun();
  // 같은 이름을 팔마다 부르면 매크로 수가 토큰 수보다 많다 — 순서대로 접는다
  return { macros, runs, skips };
};

// ---- 사전 표 (주소·간격은 핸들러 코드에서 읽었다) ----
const TABLES = [
  { name: '인명', base: 0x3d1480, size: 8 },
  { name: '아이템', base: 0x3d0280, size: 8 },
  { name: '지명', base: 0x3d1dc0, size: 10 },
];
const decodeStock = (off, size) => {
  let s = '', a = off;
  while (a < off + size) {
    const b = rom[a];
    if (b === 0x50 || b === 0x00) break;
    if (tblPrefixes.has(b)) { s += tblWide.get((b << 8) | rom[a + 1]) || '?'; a += 2; continue; }
    s += tblSingles.get(b) || '?'; a += 1;
  }
  return s;
};
// op → 표는 고정이다 (실측: 실패 9항목 전부 op별 표에서 완벽 디코드 —
// エル・ヌール(인명)·アクバー峠(지명)….  원장의 일본어는 축약형(ハリド)이라
// 부분일치 판별이 어긋났던 것).  디코드는 참고 기록으로만 남긴다.
const OP_TABLE = { '4a': TABLES[0], '3a': TABLES[1], '3b': TABLES[2] };
// **3A 의 인수는 표 색인이 아니다** (역어셈 $C0:32EC, 2026-08-24):
//     INC $78 · LDA [$78] · AND #$00FF · TAX · LDA $EF00,X · ASL×3 · TAX
//   인수는 스크립트 변수 번호($7E:EF00 배열의 첨자)고, **거기서 읽은 값**이
//   표 색인이 된다.  그러니 `3A 10` 을 "표 10번"으로 읽으면 안 된다 — 롬 슬롯
//   0x10 은 イビルアイ 지만 그 매크로가 쓰인 도난 장면 화면은 マスカレイド 다
//   (사용자 교정 두 번).  4A($C0:3216)와 3B($C0:30C1)는 인수가 곧 색인이라
//   직행한다.  → 3A 는 **표를 롬 원장으로만 채우고, 행 토큰과는 대조하지 않는다.**
const OP_INDEXED_DIRECT = new Set(['4a', '3b']);

// ---- 빈도 → 배정 ----
const freq = new Map();
// ---- 그림자 스트림 파일럿 (RS3_SHADOW_FC=1, 2026-08-26) ----
//   \$FC 의 단순 워프 행 중 (자막·계측 대역 밖) + (원문 머리가 글리프 ≥ 0x50)만:
//   제자리에 캐리어를 **안 쓰고** 원문 일본어를 보존한다. 아레나 블롭(본문+FF
//   복귀)은 지금과 동일. 발동은 STUB 이 표(rowStart→arena)를 보고 한다.
//   목적: 스트림 오염 제거 — 훅 안 거친 리더는 순정 일본어를 읽을 뿐이다.
const SHADOW_ON = process.env.RS3_SHADOW_FC === '1';
// 그림자 프리루드를 못 타는 행은 기존의 FE 직접 워프를 쓴다. 0x83(「イ」)로
// 시작하는 0BB5 호출자 3B9FDC는 실제 PPU에서 원문 바이트가 한글 슬롯으로
// 그려진 재현이 있으므로 기본 예외다. 환경변수에는 추가 파일 오프셋을 쉼표로
// 더할 수 있다(예: RS3_SHADOW_DIRECT_WARP_ROWS=3B9FDC,3BA000).
const SHADOW_DIRECT_WARP_ROWS = new Set([
  0x3b9fdc, // 0BB5 dolphin: JP 0x83 head bypassed the shadow trigger on real PPU.
]);
// Retain already-installed FE carriers while preserving terminal authored
// boundaries whose obsolete blank sentinel was removed. This is not evidence
// of a new shadow-hook failure and is kept separate from PPU exception lists.
const EXISTING_DIRECT_CARRIERS = new Map();
const EXISTING_DIRECT_PATH = path.join(PROJECT, 'runtime', 'static_existing_direct_arena_rows_v1.json');
if (existsSync(EXISTING_DIRECT_PATH)) {
  const d = JSON.parse(readFileSync(EXISTING_DIRECT_PATH, 'utf8'));
  if (d.schema !== 'preserved-existing-direct-carrier-v1') throw new Error('existing direct carrier schema');
  for (const row of d.rows) {
    const s = parseInt(row.source, 16), back = parseInt(row.back, 16);
    const original = Buffer.from(row.originalHex, 'hex'), tail = [...Buffer.from(row.carrierTailHex, 'hex')];
    if (EXISTING_DIRECT_CARRIERS.has(s) || !FORCED_NEWLINE_ARENA_ROWS.has(s)
        || back-s < 3 || back-s !== original.length || tail.length !== back-s-3
        || !Buffer.from(rom.slice(s,back)).equals(original)
        || tail.some(b=>b!==0x4f&&b!==0xfd)) throw new Error(`existing direct carrier mismatch: ${row.source}`);
    // These exact original ranges contain glyph tokens only; do not let this
    // carrier template conceal a wait, branch, newline or macro command.
    for (let i=0;i<original.length;) {
      const b=original[i],n=b>=0x20&&b<=0x23?2:1;
      if (!(b>=0x50||n===2) || i+n>original.length) throw new Error(`existing direct source control: ${row.source}`);
      i+=n;
    }
    EXISTING_DIRECT_CARRIERS.set(s,{back,tail}); SHADOW_DIRECT_WARP_ROWS.add(s);
  }
}
for (const s of String(process.env.RS3_SHADOW_DIRECT_WARP_ROWS || '').split(',')) {
  const t = s.trim();
  if (t) SHADOW_DIRECT_WARP_ROWS.add(parseInt(t.replace(/^0x/i, ''), 16));
}
// 그림자 표에 행이 있어도, 특정 리더 경로는 그 표를 보지 않고 원문 글리프를
// 곧장 그린다. 이 목록은 그런 사례를 **실제 AI-SNES PPU**에서 확인한 뒤에만
// 추가한다. 환경변수 임시 예외와 달리 다음 재빌드에도 증거와 함께 남긴다.
const PPU_DIRECT_ROWS_PATH = path.join(PROJECT, 'runtime', 'shadow_direct_warp_rows_v1.json');
if (existsSync(PPU_DIRECT_ROWS_PATH)) {
  const d = JSON.parse(readFileSync(PPU_DIRECT_ROWS_PATH, 'utf8'));
  let loaded = 0;
  for (const entry of (d.rows || [])) {
    const raw = typeof entry === 'object' ? entry.startPc : entry;
    const text = String(raw ?? '').trim();
    const at = /^0x/i.test(text) ? Number.parseInt(text.slice(2), 16) : Number.parseInt(text, 16);
    if (!Number.isInteger(at) || at < 0 || at >= rom.length) {
      throw new Error(`실기 직접 아레나 주소가 잘못됐다: ${raw}`);
    }
    SHADOW_DIRECT_WARP_ROWS.add(at);
    loaded += 1;
  }
  if (loaded) console.log(`실기 PPU 그림자 우회 직접 아레나 행 ${loaded}`);
}
// 전수 이벤트 PPU 검사가 실제 원문 글리프 누출과 fresh 원장의 한국어 문안을
// 함께 증명한 행은 별도 생성표로 받는다. 수동 사례표를 덮어쓰지 않고, 생성표도
// 없으면 기존 빌드와 완전히 같다. 생성기는 매크로·기존 스팬·미완료 배치를
// 승격하지 않으므로 여기서는 주소 형식만 다시 관문으로 둔다.
const PPU_RAW_BRIDGE_DIRECT_ROWS_PATH = path.join(PROJECT, 'runtime', 'ppu_live_raw_direct_warp_rows_v1.json');
if (existsSync(PPU_RAW_BRIDGE_DIRECT_ROWS_PATH)) {
  const d = JSON.parse(readFileSync(PPU_RAW_BRIDGE_DIRECT_ROWS_PATH, 'utf8'));
  let loaded = 0;
  for (const entry of (d.rows || [])) {
    const raw = typeof entry === 'object' ? entry.startPc : entry;
    const text = String(raw ?? '').trim();
    const at = /^0x/i.test(text) ? Number.parseInt(text.slice(2), 16) : Number.parseInt(text, 16);
    if (!Number.isInteger(at) || at < 0 || at >= rom.length) {
      throw new Error(`실기 PPU raw-bridge 직접 아레나 주소가 잘못됐다: ${raw}`);
    }
    SHADOW_DIRECT_WARP_ROWS.add(at);
    loaded += 1;
  }
  if (loaded) console.log(`실기 PPU raw-bridge 직접 아레나 행 ${loaded}`);
}
// 0Bxx의 화자별 말투는 실제 PPU에서 원문 머리 글리프를 먼저 읽을 여지가
// 있으면 안 된다. FB:9FDC(0x83 イ)의 가비지는 그림자 표가 해당 머리에서
// 건너뛰어진 실측 사례다. 따라서 클래스 조건 0B 조각을 부르는 번역 행은
// 기본적으로 FE 직접 아레나 워프를 쓴다. 사전 내부의 33/F319 분기 팔은 원래
// 제어 주소로 중간 진입하므로 절대 직접 워프하지 않는다. 이 방식은 원문
// 글리프가 한글 슬롯으로 새어 나오는 호출부만 제거한다.
const DYNAMIC_0B_DIRECT_ARENA_ROWS = new Set();
if (process.env.RS3_0B_DIRECT_ARENA !== '0') {
  try {
    const audit0b = JSON.parse(readFileSync(path.join(PROJECT, 'out', '0b_dictionary_audit_v1.json'), 'utf8'));
    const rowFor = (pc) => rows.find((r) => r.s <= pc && pc < r.e);
    const classFragments = (audit0b.fragments || []).filter((f) =>
      (f.conditions || []).some((c) => c.kind === 'classCondition'));
    for (const fragment of classFragments) {
      // 사전 내부 33/4E 팔은 그 주소로 직접 진입하는 제어 흐름이다. 팔 자체를
      // FE로 바꾸면 점프 중간 진입이 어긋나 `달라고→달고`처럼 끝 음절이
      // 잘린다. 직접 워프는 그 조각을 **부르는 대사 머리**에만 적용한다.
      // 내부 팔의 한글화·class 분기는 기존 제어 경로에 맡긴다.
      for (const call of (fragment.directCallSites || [])) {
        const callPc = parseInt(call.offset, 16);
        const r = rowFor(callPc);
        if (r) DYNAMIC_0B_DIRECT_ARENA_ROWS.add(r.s);
        // 0B 토큰은 보통 바로 앞 줄 끝의 제어 꼬리에 붙는다. FB:9FDC처럼
        // 토큰보다 5바이트 앞에서 끝나는 줄도 잡되, 전체 record를 워프하면
        // 무관한 줄 배치까지 바뀐다. 같은 은행에서 호출 직전 8바이트 안에
        // 끝나는 번역 줄 중, 실제 PPU 우회가 재현된 0x83(イ) 머리만 직접
        // 아레나로 보낸다. 다른 머리까지 추정으로 대량 전환하면 아레나 배치가
        // 흔들려 무관한 행을 잘라 버린다. 새 실기 증거가 생기면 이 집합에만
        // 바이트를 추가한다.
        for (const candidate of rows) {
          if ((candidate.s >> 16) === (callPc >> 16)
              && candidate.e <= callPc && callPc - candidate.e <= 8
              && rom[candidate.s] === 0x83) {
            DYNAMIC_0B_DIRECT_ARENA_ROWS.add(candidate.s);
          }
        }
      }
    }
    for (const at of DYNAMIC_0B_DIRECT_ARENA_ROWS) SHADOW_DIRECT_WARP_ROWS.add(at);
    console.log(`0B 화자 분기 직접 아레나 행 ${DYNAMIC_0B_DIRECT_ARENA_ROWS.size}`);
  } catch (e) {
    throw new Error(`0B 화자 분기 직접 아레나 목록을 만들지 못했다: ${e.message}`);
  }
}
// 2026-09-16 발화 컴파일러 v2(tools/utterance_compiler_v2.mjs) forceShadowRows: 제자리 행을 발화 payload 진입으로 쓰려고 컴파일러가 고른 행.
//   디스패처는 그림자 조회(TRG4)에서만 걸리므로 이 행들은 강제 개행 아레나와 같은 길(행 전체 아레나 + 그림자 트리거)로 굽는다.
const UTTERANCE_FORCE_SHADOW_ROWS = new Set();
// 2026-09-17 발화 컴파일러 v2i: directPayloadRows(머리 FE 가 발화 payload 를 가리킬 행) · directConvertRows(지금은 제자리 글인 행 —
//   FE 직접 워프로 바꾸고 행 글은 안 굽는다) · wideDirectRows(payload 는 여유 있는 다른 아레나에, 출발 뱅크 아레나엔 4바이트 발판 `FF lo hi bank`).
const UTTERANCE_DIRECT_ROWS = new Set(), UTTERANCE_CONVERT_ROWS = new Set(), UTTERANCE_WIDE_ROWS = new Set();
{
  const uttPathEarly = path.join(PROJECT, 'runtime', 'utterance_payloads_v1.json');
  if (existsSync(uttPathEarly) && process.env.RS3_UTTERANCES !== '0') {
    const uEarly = JSON.parse(readFileSync(uttPathEarly, 'utf8'));
    for (const h of (uEarly.forceShadowRows || [])) UTTERANCE_FORCE_SHADOW_ROWS.add(parseInt(h, 16));
    for (const h of (uEarly.directPayloadRows || [])) UTTERANCE_DIRECT_ROWS.add(parseInt(h, 16));
    for (const h of (uEarly.directConvertRows || [])) UTTERANCE_CONVERT_ROWS.add(parseInt(h, 16));
    for (const h of (uEarly.wideDirectRows || [])) UTTERANCE_WIDE_ROWS.add(parseInt(h, 16));
    for (const s of [...UTTERANCE_CONVERT_ROWS, ...UTTERANCE_WIDE_ROWS]) if (!UTTERANCE_DIRECT_ROWS.has(s)) throw new Error(`발화 payload 전환/넓은 배치 행 ${s.toString(16)} 이 directPayloadRows 에 없다`);
    if (UTTERANCE_FORCE_SHADOW_ROWS.size) console.log(`발화 payload 진입 그림자 전환 행 ${UTTERANCE_FORCE_SHADOW_ROWS.size}`);
    if (UTTERANCE_CONVERT_ROWS.size || UTTERANCE_WIDE_ROWS.size) console.log(`발화 payload 제자리→직접 전환 행 ${UTTERANCE_CONVERT_ROWS.size} · 넓은 배치 행 ${UTTERANCE_WIDE_ROWS.size}`);
  }
}
const SHADOW_EXCL = [
  [0x3c0000, 0x3c3000],   // 자작 오프닝·캐릭 소개 지대 — 시퀀서가 커서 위치로 자신을 조율한다.
                          //   실측(2026-08-26): 3C0B66 그림자 발동 직후 커서가 아레나에 박힌 채
                          //   교착(78:0167) — 스트림 내 FE 는 모든 리더가 보지만 표 발동은
                          //   STUB 만 알아서, 이중 리더 지대에선 그림자 금지.
  [0x3ccb00, 0x3ccf60],   // 대관식·에필로그 자작 연출/계측 일대(기존 자막·NOWARP 대역 병합)
  [0x3d9a90, 0x3d9b41],   // 전투 문자열 팩 — 렌더러 미훅(원래 워프 불가라 실제 대상 없음, 방벽)
];
const shadowRows = [];                               // [rowStartFile, arenaFile, tEndAddr16]
const shortDirectWarpRows = [];                      // FE 직접 워프가 스판(3바이트)에 안 들어가 그림자로 되돌린 행
// 한 글자 감격 연출 무늬 + 워프 조합 감시 목록(특수 렌더러 후보 17행) — 그림자 금지
let WATCH17 = new Set();
try {
  const wl = JSON.parse(readFileSync(path.join(PROJECT, 'out', 'percharacter_warp_watchlist_v1.json'), 'utf8'));
  WATCH17 = new Set((wl.rows || []).map((x) => parseInt(x, 16)));
} catch {}
// 머리 바이트 조건은 없앴다(2026-08-26): 훅은 토큰 머리마다 발화한다(진입
//   간격 실측 2·3·5바이트 = 피연산자 보폭). 매크로/와이드/확장 머리 전부
//   트리거가 디스패치 전에 커서를 채가므로 제자리 선두 토큰은 실행되지 않는다.
const shadowableAt = (a0) => SHADOW_ON
  && !SHADOW_DIRECT_WARP_ROWS.has(a0)
  && !WATCH17.has(a0)
  && !SHADOW_EXCL.some(([lo, hi]) => a0 >= lo && a0 < hi);
const shadowable = (r0) => shadowableAt(r0.s);
// ---- 전면 그림자 (2026-08-26) ----
//   훅이 심긴 8개 핸들러의 표 부류 = 트리거가 발동 가능한 머리 바이트.
//   (점프표 $C0:3AD6 실측: 글리프/와이드 4종=1C50 · 확46=1C8C · 확18=231A ·
//    매크로 39/3A/3B/4A/4B 각자. 제어 op 머리는 런 모델상 나오지 않는다.)
const HOOKABLE = (b) => b >= 0x50 || (b >= 0x20 && b <= 0x23) || b === 0x18 || b === 0x46
  || b === 0x39 || b === 0x3a || b === 0x3b || b === 0x4a || b === 0x4b;
const FULLSHADOW = SHADOW_ON && process.env.RS3_FULLSHADOW !== '0';
// ---- 33-블록 훅 사각 (2026-08-26) ----
//   33-선택자 팔 블록은 분류기 미경유 내부 리더가 통째 소비한다([[rs3-33-block-
//   internal-reader]]). 그 구간의 행은 트리거가 영영 안 발화하므로 **이중 커버**:
//   트리거는 그대로 두고(다른 상태에서 분류기로 지나갈 때 대비) 제자리에도
//   한국어 사본을 굽는다. 제자리 사본은 FE/FD 금지(내부 리더가 글리프로 그림),
//   패딩은 0x50. 경계는 harvest_33_block_extents_v1 실측(미실측 머리는 +0x100 보수 창).
let BLIND33 = [];
const in33unmeasured = [];
// **기본 OFF (2026-08-27 정정)**: 33 은 훅 사각이 아니었다 — `33 a9 XX b0 b1`은
//   가드+이벤트 호출로 커서를 팔 조각 주소로 점프시킬 뿐, 조각은 분류기(훅
//   먹힘)가 그린다(사용자 실기 상태 트레이스 실증: 5aafa4 페치 다수). 제자리
//   +트림은 조각 문장을 깎아 실플레이 대사를 망가뜨렸다. 재활성은 RS3_33FIX=1.
if (process.env.RS3_33FIX === '1') {
  try {
    const th = JSON.parse(readFileSync(path.join(PROJECT, 'out', 'thirtythree_block_extents_v1.json'), 'utf8'));
    for (const t of th.results) {
      // 실측(M)만 쓴다 — 미실측 보수 창(U)은 유령 행(행 머리가 피연산자 안)
      //   제자리 굽기로 저대역 호출을 밟았다(EventProof 실증 3건 전부 U).
      //   U 잔여는 in33.unmeasured 로 보고만 한다.
      if (t.resume > 0) { if (t.consumedTo > t.head + 3) BLIND33.push([t.head + 3, t.consumedTo]); }
      else in33unmeasured.push(t.head);
    }
    BLIND33.sort((x, y) => x[0] - y[0]);
  } catch { /* 수확물 없으면 비활성 */ }
}
const blind33At = (a0) => {
  let lo = 0, hi = BLIND33.length - 1, best = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (BLIND33[m][0] <= a0) { best = m; lo = m + 1; } else hi = m - 1; }
  for (let k = best; k >= 0 && k > best - 8; k -= 1) if (a0 >= BLIND33[k][0] && a0 < BLIND33[k][1]) return true;
  return false;
};
const in33 = { rows: 0, frags: 0, fragTrims: [], warpSkips: [], unmeasured: in33unmeasured };
// 어셈블러 NOWARP 대역(전투 팩·에필로그 계측 렌더러) — 조각이 넘쳐도 여기엔
//   제자리 FE 스텁을 못 박는다(렌더러 미훅 — 실기 소프트락). 트림으로 맞춘다.
//   (2026-08-26 실증: 배정표 재편→재인코딩 넘침→3CCE7A FE — EventProof 검거)
const NOWARP_BANDS = [[0x3d9a90, 0x3d9b41], [0x3ccd00, 0x3ccf60]];
const inNowarp = (a0) => NOWARP_BANDS.some(([lo, hi]) => a0 >= lo && a0 < hi);
const seenTrig = new Set();                        // 한 주소 한 트리거

const bump = (ch, w = 1) => freq.set(ch, (freq.get(ch) || 0) + w);
const dictNames = new Map();                       // 'op:idx' → 한국어 이름
for (const r of rows) {
  const toks = [...r.text.matchAll(MACRE)].map((m) => m[1]);
  const parsed = parseOriginal(r.s, r.e);
  const seq = parsed.macros;
  r.macros = seq; r.tEnd = parsed.tEnd; r.tokens = toks;
  // **워프가 불가능한 행**(쓸 수 있는 구간이 전부 3바이트 미만)은 글자가 전부
  // 1바이트여야만 제자리에 든다.  워프 캐리어 [FE lo hi]가 3바이트라 자리가
  // 없기 때문이다 — 실측 147행 전부 "구간 하나, 정확히 2바이트"였다.
  // 그 행의 글자는 1바이트 배정에서 우선권을 준다(안 주면 그 행은 통째로 죽는다).
  {
    const fp = parseSpanFull(r.s, r.e);
    const fr = fp.runs;
    // **그림자 가능 행은 tight 가 아니다** (2026-08-26): 전면 그림자에선 트리거+
    //   아레나가 전문을 들므로 제자리 FE 자리(3B)가 필요 없다. 옛 판정이 남아
    //   이월·깎기 기계가 248행을 불필요하게 줄이고 있었다(실측 3BA232 「으로」→
    //   「로」, 으는 앞 행으로 이월). 배정은 핀(1,145자 전원)이 동결하므로
    //   1바이트 우선권 변화의 부작용은 없다.
    r.tight = !fr.some((run) => run.n >= 3)
      && !(FULLSHADOW && (shadowableAt(r.s) || SHADOW_DIRECT_WARP_ROWS.has(r.s))
        && HOOKABLE(rom[r.s]));
    r.cap = fr.reduce((n, x) => n + x.n, 0);         // 이 행이 쓸 수 있는 총 바이트
    r.maxRun = fr.length ? Math.max(...fr.map((x) => x.n)) : 0;
    // **한 어절은 4E 스킵 경계를 넘을 수 없다** — 반쪽만 실행되면 글자가 깨진다.
    //   그래서 구간을 경계로 다시 쪼갠 **조각**이 어절이 들어갈 수 있는 실제 칸이다.
    //   2바이트 구간 한가운데를 경계가 지나면 실효 용량은 1바이트다(실측 13행).
    const bd = new Set();
    for (const [lo, hi] of fp.skips) { bd.add(lo); bd.add(hi); }
    const segs = [];
    for (const run of fr) {
      let st = run.a;
      for (let k = run.a + 1; k < run.a + run.n; k += 1) if (bd.has(k)) { segs.push(k - st); st = k; }
      segs.push(run.a + run.n - st);
    }
    r.maxSeg = segs.length ? Math.max(...segs) : 0;
  }
  for (const ch of r.text.replace(MACRE, '')) {
    if (ch !== '\n' && ch !== '\f' && ch !== ' ' && !isJosaPua(ch) && !isCopulaPua(ch)) bump(ch);
  }
  // 단순 파서가 팔 앞에서 멈춰 매크로를 덜 본 행은 스팬 전체에서 다시 센다 —
  // 안 그러면 팔 뒤 이름이 사전에 안 올라 폴백이 "사전 미판별"로 떨어진다
  let dictSeq = seq;
  if (dictSeq.length !== toks.length) {
    let f = parseSpanFull(r.s, r.e).macros;
    if (f.length !== toks.length) {
      const seen = new Set(), dd = [];
      for (const m of f) { const k = `${m.op}:${m.idx}`; if (!seen.has(k)) { seen.add(k); dd.push(m); } }
      f = dd;
    }
    if (f.length === toks.length) dictSeq = f;
  }
  if (dictSeq.length === toks.length) {
    r.dictSeq = dictSeq;                           // 표기 재맞춤(아래)에서 다시 쓴다
    for (let i = 0; i < toks.length; i += 1) {
      const key = `${dictSeq[i].op.toString(16)}:${dictSeq[i].idx}`;
      // 39(파티 슬롯)는 사전도 없고 이름도 우리 몫이 아니다. 자리표시 토큰이
      // 글리프 배정에 새면 "폰트에 없는 글자"로 빌드가 죽는다.
      if (dictSeq[i].op === 0x39) continue;
      // 3A 는 인수가 표 색인이 아니다(위 OP_INDEXED_DIRECT 주석).  행 토큰을
      // 표에 쓰면 **엉뚱한 슬롯을 덮는다** — 「마스커레이드」를 イビルアイ 칸에
      // 넣는 식이다.  3A 칸은 롬 원장(RS3_FULLDICT)으로만 채운다.
      if (dictSeq[i].op === 0x3a) continue;
      dictNames.set(key, toks[i]);
    }
  }
}
bump('␣', 1);                                 // 사전용 블랭크(빈 글리프)

// ---- 사전 807칸 전량 (RS3_FULLDICT=1) ----
//   왜: 표 자체가 한국어면 **원문 매크로 바이트를 손댈 필요가 없다** — 어느
//   행에서 불리든 그 색인은 한국어로 펼쳐진다.  행마다 토큰을 짚어 덮던 배선은
//   그 행에서 짚어낸 매크로만 덮으므로 못 감싼 행·다른 루트가 전부 일본어로
//   남는다(사용자 지적, 2026-08-24).
//
//   **출처는 롬이다.  리마스터는 배제한다** (사용자 지시, 2026-08-24: "사전은
//   롬에서 읽어서 한글화해야지 리마스터 배제해").  전엔 rs3_name_refs_bokuno.tsv
//   의 ko 칸을 썼는데 그건 리마스터 한국어를 **색인으로** 끌어온 것이다.
//   보쿠노가 칸을 재배정했고 아이템은 핸들러가 $EF00 으로 색인을 한 번 더
//   꺾으므로 색인이 가리키는 물건이 다르다 — 그 tsv 는 3A 10 을
//   「마스커레이드」로 적었지만 **롬 슬롯의 내용은 イビルアイ 다**(실측).
//   슬롯에는 그 슬롯의 일본어를 옮긴 것만 넣는다.  그러면 색인이 어디로
//   꺾이든 화면에 나오는 건 그 물건의 한국어다.
//   원장: runtime/bokuno_dictionary_korean_v1.tsv (767칸, jp 는 롬 디코드).
const FULLDICT = process.env.RS3_FULLDICT === '1';
const ledgerDictKeys = new Set(dictNames.keys());   // 사전 원장을 싣기 **전** = 행이 감싼 것
if (FULLDICT) {
  const PFX = { '4A': '4a', '3A': '3a', '3B': '3b' };
  const tbl = new Map();
  for (const raw of readFileSync(path.join(PROJECT, 'runtime', 'bokuno_dictionary_korean_v1.tsv'), 'utf8').split(String.fromCharCode(10))) {
    if (raw.startsWith('#')) continue;
    const f = raw.replace(/\r$/, '').split(String.fromCharCode(9));
    if (f.length < 4 || !PFX[f[0]]) continue;
    const ko = (f[3] || '').trim();
    if (!ko) continue;
    tbl.set(`${PFX[f[0]]}:${parseInt(f[1], 16)}`, ko);
  }
  let added = 0, differed = 0;
  for (const [key, ko] of tbl) {
    if (!dictNames.has(key)) added += 1;
    else if (dictNames.get(key) !== ko) differed += 1;
    dictNames.set(key, ko);
  }
  console.log(`사전 원장 ${tbl.size}칸(롬에서 옮김) · 행이 안 감쌌던 칸 ${added} · 행 토큰과 달라 덮은 것 ${differed}`);
}
for (const ko of dictNames.values()) for (const ch of ko) bump(ch === ' ' ? '␣' : ch, 1);

// ---- 보쿠노 확장 아이템 표($5B:2880 · 보폭12 · 256칸) 원장 ----
//   판독기 $5A:B250(0D/49군 슬롯6)이 레코드를 $D56D로 복사해 대사 엔진이 그린다
//   — 사전 표와 같은 소비처라 같은 인코딩으로 재작성한다. 획득창 가비지
//   (「음습임두습임」=バックパック) 의 원천. jpBytes 드리프트 관문은 아래 재작성부.
//   같은 꼴(고정 보폭 + 0x50 패딩 + jpBytes 드리프트 관문)의 확장 표 원장 묶음.
//   전부 판독기·소비 화면이 실측된 live 표다:
//     $5B:2880 아이템   ← $5A:B250 (0D/49군 슬롯6) → $D56D, 대사/획득창
//     $5A:2D00 몬스터   ← $5A:3620 (순정 $C2:05AD 제자리 교체, id>=0x140), 전투 적 이름
//     $5B:40C0 적 기술  · $5B:A000 술법 · $5F:B000 아군 기술, 전투 행동 배너
const EXT_TABLE_LEDGERS = [
  { file: 'bokuno_item_table_5b_korean_v1.json', name: '아이템' },
  { file: 'bokuno_monster_table_5a_korean_v1.json', name: '몬스터' },
  { file: 'bokuno_enemytech_table_5b40_korean_v1.json', name: '적기술' },
  { file: 'bokuno_spell_table_5ba0_korean_v1.json', name: '술법' },
  { file: 'bokuno_playertech_table_5fb0_korean_v1.json', name: '아군기술' },
  { file: 'bokuno_request_board_5e6970_korean_v1.json', name: '의뢰게시판' },   // 판독기 $5A:B95A/$5A:E91A
  { file: 'bokuno_bgm_names_683a00_korean_v1.json', name: '곡명' },             // 판독기 $68:18C0 (ADC #$3A00)
  // 2026-09-08 사용자 캡처(필드 메뉴 「이벤트」 항목 괴문자) → 의뢰 목록 표 $FD:4C40 보폭 26·64칸, 판독기 $C5:7C49(id*26+#$4C40, $06=#$1A → JSR $DE2D)
  { file: 'bokuno_quest_list_3d4c40_korean_v1.json', name: '이벤트목록' },
  // 마스 배틀 명령·진형·군단 이름 표 $FD:52C0 보폭 12·128칸(판독기 ADC #$52C0 ×4) · 전술/군단 나열 $FD:58C0
  { file: 'bokuno_war_names_3d52c0_korean_v1.json', name: '전쟁이름' },
  { file: 'bokuno_war_tactics_3d58c0_korean_v1.json', name: '전쟁전술' },
  { file: 'bokuno_war_armies_3d5960_korean_v1.json', name: '전쟁군단' },
];
const extTables = [];
for (const t of EXT_TABLE_LEDGERS) {
  try {
    const doc = JSON.parse(readFileSync(path.join(PROJECT, 'runtime', t.file), 'utf8'));
    extTables.push({ ...t, base: parseInt(doc.base, 16), stride: doc.stride, records: doc.records });
  } catch {}
}
for (const t of extTables) for (const r of t.records) for (const ch of (r.ko || '')) bump(ch === ' ' ? '␣' : ch, 1);

// ---- 기술·술법 설명문 아레나 원장 (2026-09-08) ----
//   64B 고정 레코드: [본문 길이 1B][본문][0x00 채움].  본문 안 0x50 = 줄 구분(원문 최대 2줄).
//   A $DB:B800 256칸(판독기 $DF:DD04 · $DA:9C5F=idx132 기준) · B $DE:1900 240칸(판독기 $F0:A9FC).
//   원장 records[].lines = 줄 배열(줄 안 공백은 ␣ 글리프 0x51, 줄 사이만 0x50), jpBytes 는 드리프트 관문.
const DESC_ARENA_LEDGERS = [
  { file: 'bokuno_desc_arena_5bb800_korean_v1.json', name: '설명문A' },
  { file: 'bokuno_desc_arena_5e1900_korean_v1.json', name: '설명문B' },
  // 확장 아이템 설명(개조롬 신규 아이템 ID 0xF0..0xFE 15칸, $5B:2480 보폭 0x40, 판독기 $55:C060/C0A0 이 ID-0xF0 ×64 로 직접 읽음).
  //   2026-09-15 디스코드 제보 「보물지도 설명 누락」: 09-13 의 rs3_extended_item_description_repair_v1 은 옛 부모 ROM SHA 에 잠긴
  //   별도 후처리라 정식 사슬(안전 빌드)에 한 번도 들어오지 않았다 → 같은 64B 레코드 형식이므로 이 writer 로 정식화.
  { file: 'bokuno_desc_arena_5b2480_korean_v1.json', name: '확장 아이템 설명' },
];
const descArenas = [];
for (const t of DESC_ARENA_LEDGERS) {
  try {
    const doc = JSON.parse(readFileSync(path.join(PROJECT, 'runtime', t.file), 'utf8'));
    descArenas.push({ ...t, base: parseInt(doc.base, 16), stride: doc.stride || 64, records: doc.records });
  } catch {}
}
for (const t of descArenas) for (const r of t.records) for (const ln of (r.lines || [])) for (const ch of ln) bump(ch === ' ' ? '␣' : ch, 1);

// ---- 대사 밖 이름 표 원장(TSV) ----
//   옛 asmhook 파이프라인이 만들어 둔 한국어 원장들 — 현행 빌더가 안 구워서
//   현행 롬에선 전부 일본어였다(글리프를 갈아치운 뒤라 화면엔 가비지).
//   TSV 열: idx · fileOffset · 일본어 · (출처) · 한국어.  jp 열은 **드리프트 관문**
//   으로만 쓴다 — 원장이 구자체(劍)로 적혀 있고 롬 글자표는 신자체(剣)라 자형을
//   접어서 비교한다(43쌍 실측 수확). 접어도 안 맞으면 그 칸은 굽지 않고 신고.
const KYUJI = '劍剣 擊撃 壞壊 拂払 斷断 腦脳 氣気 盜盗 碎砕 體体 惡悪 龍竜 靈霊 將将 殘残 卷巻 亂乱 雙双 稻稲 當当 强強 歸帰 姬姫 觀観 禮礼 亞亜 黃黄 變変 靑青 拔抜 巖岩 獸獣 獨独 發発 淸清 觸触 敎教 團団 孃嬢 讀読 乘乗 戰戦 學学 軟転';
const kyujiMap = new Map(KYUJI.split(' ').filter(Boolean).map((p) => [p[0], p[1]]));
//   원장의 [XX] 표기와 롬 디코드의 '?'(글자표에 없는 확장 글리프)는 서로
//   대응하는 같은 바이트다 — 둘 다 와일드카드 한 칸으로 접는다.
const foldJp = (s) => [...(s || '').normalize('NFKC').replace(/\[[0-9A-Fa-f]{2,4}\]/g, '?')]
  .map((c) => kyujiMap.get(c) ?? c)
  .join('').replace(/[ 　·]/g, '').replace(/\?/g, '\x00').trim();
const NAME_TABLES = [
  { name: '스톡 몬스터', base: 0x3d0a80, size: 8, tsv: 'monster_names_kr_v1.tsv', ko: 4 },
  { name: '스톡 기술', base: 0x3d27c0, size: 10, tsv: 'tech_names_kr_v1.tsv', ko: 4 },
  { name: '스톡 진형', base: 0x3d0000, size: 10, tsv: 'formation_names_kr_v1.tsv', ko: 4 },
  { name: '스톡 직업', base: 0x3d1c80, size: 10, tsv: 'job_titles_kr_v1.tsv', ko: 4 },
  { name: '무기술 라벨', base: 0x5b7960, size: 8, tsv: 'weapon_skill_labels_kr_v1.tsv', ko: 3 },
  // 교역 상회명 — 밖-대사 표 중 유일하게 빠져 있던 자리(240칸 전부 일본어였다, 2026-08-27).
  //   0x50 채움까지 포함해 한 칸이 14바이트다.
  { name: '교역 상회명', base: 0x3d3e40, size: 14, tsv: 'trade_shop_names_kr_v1.tsv', ko: 4 },
];
// 진형 확장 사본($5E:A047 · 보폭 0x80 · 55칸) — **화면이 읽는 건 이쪽**이다
//   (스톡 0x3D0000 을 갈아도 진형 화면은 안 바뀐다 — 선행 실측).
//   레코드 = 이름 + 0x50 + 설명1 + 0x50 + 설명2, **텍스트 칸은 46바이트 고정**.
//   46 이후는 진형 배치 바이너리(0x40/0x05/0x31 실측) — 한 바이트도 넘기면 배치가 깨진다.
//   ('첫 0x00 까지'로 재면 8레코드에서 47~53 으로 부풀어 배치를 밟는다 — 실측 반례.)
const FORM_EXT = { base: 0x5ea047, stride: 0x80, text: 46 };
let formExtLedger = null;
try { formExtLedger = JSON.parse(readFileSync(path.join(PROJECT, 'runtime', 'formation_ext_5ea047_korean_v1.json'), 'utf8')); } catch {}
if (formExtLedger) for (const r of formExtLedger.records) {
  for (const ch of `${r.name || ''}${r.line1 || ''}${r.line2 || ''}`) bump(ch === ' ' ? '␣' : ch, 1);
}

// 스탯 라벨 스트립(0x3DF830) — **자리 치환**. 스트립엔 별도 색인이 붙어 있어
//   문자열째 바꾸면 배열이 밀린다(v8 롤백의 원인). 한 자리 = 한 글자이고
//   **바이트 폭이 정확히 같을 때만** 쓴다(1바이트 칸에 와이드를 넣으면 뒤가 밀린다).
//   같은 한자라도 자리마다 뜻이 다르다(持ち物의 持=소 · 所持金의 持=지) — 그래서 자리별 원장.
// ---- 메뉴 풀 라벨 (바이트 보존 치환) ----
//   메뉴는 오프셋표(FD:F976) + 풀(FD:FA08) 구조이고 한 슬라이스에 여러 라벨이
//   이어 붙는다. 풀을 **문자 단위로 색인**해 라벨의 바이트 구간을 정확히 잡고
//   **같은 바이트 수**로 갈아끼운다(같은 길이 문자열 검색은 오매칭으로 배열을 깼다).
//   0x50 은 패딩 겸 구분자라 문자표에 없다 — '␣' 로 읽어 짝을 맞춘다.
//   글자표는 호환한자(U+F900)를 쓰므로 양쪽을 NFKC 로 접어 비교한다.
//   실패 사유: 원문없음 / 칸부족 / 선점충돌.
const LABEL_ZONES = [[0x3dfa08, 0x3dfe00], [0x3d9a00, 0x3d9c00], [0x3d6200, 0x3d7400]];
// **라벨 경계를 넘어 쓰면 다음 라벨이 2바이트 코드 한가운데서 시작한다** (2026-08-27 실측).
//   풀 전체를 indexOf 로 훑다 보니 두 라벨에 걸친 자리에도 썼고, 그러면 그 다음
//   라벨은 통째로 딴 글자가 된다(필드 메뉴 「이벤트」가 「에뿐트철」로 나온 진범).
//   판정: 오프셋표의 경계 주소가 KO 롬에서 코드 시작이 아니면 어긋난 것 — 실측 4건(JP 는 0).
//   오프셋표 $FD:F976 은 u16 73칸(0x0~0x33E, 풀 $FD:FA08 기준 상대). 단조 증가가 깨지는 곳이 끝이다.
//   **세 구역 모두 제 오프셋표를 가진다** (2026-08-27 실측 — 표 값 범위가 풀 크기에 딱 맞는다):
//     1구역 표 $FD:F976 · 풀 $FD:FA08 (73칸)   2구역 표 $FD:9800 · 풀 $FD:9A00 (62칸)
//     3구역 표 $FD:6000 · 풀 $FD:6200 (186칸)
//   2구역은 전투 메뉴 라벨(「退却」「劍・大劍」), 3구역은 숙성 목록 + 기술 설명문이다.
const ZONE_TABLES = [
  { table: 0x3df976, pool: 0x3dfa08, end: 0x3dfe00 },
  { table: 0x3d9800, pool: 0x3d9a00, end: 0x3d9c00 },
  { table: 0x3d6000, pool: 0x3d6200, end: 0x3d7400 },
];
const LABEL_BOUNDS = (() => {
  const out = [];
  for (const z of ZONE_TABLES) {
    let prev = -1;
    for (let i = 0; i < 600; i += 1) {
      const v = rom[z.table + i * 2] | (rom[z.table + i * 2 + 1] << 8);
      if (v < prev || v > z.end - z.pool) break;
      prev = v; out.push(z.pool + v);
    }
    out.push(z.end);
  }
  return [...new Set(out)].sort((a, b) => a - b);
})();
// **한 칸은 반드시 한 글자여야 한다** (2026-08-27 실측 진범).
//   글자표에 두 글자짜리 항목이 있다(슬롯 150 = 공백 두 칸, 코드 0xE6 · 0x3DFC2E 의 「！  殊」).
//   그 항목을 그대로 넣으면 poolChars(원소)와 poolText(문자) 인덱스가 어긋나서
//   그 뒤 라벨이 **한 글자 밀린 자리에 써진다** — 60번 이후 항목마다 앞에 낀
//   「언」「태」「여」「찰」「라」가 그 증거였고, 밀려 쓴 바이트가 다음 라벨의
//   코드 한가운데를 밟아 필드 메뉴가 통째로 깨졌다.
//   길이 1 이 아니면 **매치될 수 없는 한 글자**로 바꾼다(치환 대상에서 빠질 뿐 자리는 지킨다).
const fold1 = (c) => { const t = c ?? ''; const n = t.normalize('NFKC'); return n.length === 1 ? n : (t.length === 1 ? t : '\ufffd'); };
const foldS = (t) => [...t].map(fold1).join('');
const poolChars = [];
for (const [z0, z1] of LABEL_ZONES) {
  let i = z0;
  while (i < z1) {
    const b = rom[i];
    if (((b >= 0x20 && b <= 0x23) || b === 0x18 || b === 0x46) && i + 1 < z1) {
      const k = (b === 0x18 || b === 0x46) ? ((b << 8) | rom[i + 1]) : (0x2000 | ((b - 0x20) << 8) | rom[i + 1]);
      poolChars.push([fold1(tblWide.get(k) ?? '?'), i, 2]); i += 2;
    } else {
      poolChars.push([fold1(b === 0x50 ? '␣' : (tblSingles.get(b) ?? '?')), i, 1]); i += 1;
    }
  }
  //   **구분자는 반드시 한 글자**다. 빈 문자열로 두면 원소/문자 인덱스가 어긋나
  //   그 뒤 라벨이 밀린 자리에 써진다(위 fold1 주석과 같은 진범).
  //   전엔 한 글자로 끊었더니 성공이 284→272 로 줄어서 되돌렸는데, 그때 줄어든 12건은
  //   **구역을 넘겨 잘못된 주소에 쓰던 매치**였다 — 되돌린 게 잘못이었다.
  poolChars.push(['\ufffe', z1, 0]);      // 구역 경계 — 길이 0 이라 아무것도 안 덮는다
}
const poolText = poolChars.map((c) => c[0]).join('');
// 원소 하나 = 문자 하나. 어긋나면 그 뒤 전부가 밀린 자리에 써진다 — 여기서 죽는 게 낫다.
if (poolChars.length !== poolText.length) {
  throw new Error('메뉴 풀 색인 어긋남: 원소 ' + poolChars.length + ' vs 문자 ' + poolText.length);
}
let menuLabels = [];
try {
  for (const ln of readFileSync(path.join(PROJECT, 'runtime', 'menu_pool_labels_v1.tsv'), 'utf8').split('\n')) {
    if (!ln.trim() || ln.startsWith('#')) continue;
    const ps = ln.split('\t');
    if (ps.length < 2 || !ps[1].trim()) continue;
    // n 열(2026-09-08): "1"/빈칸 = 모든 출현(종전 동작) · "2" 또는 "1,3" = 그 출현 번호에만 쓴다(풀 전체 indexOf 순서, 1부터).
    //   弓 같은 한 글자 라벨이 대사 행 안(3D9BC9)까지 덮는 것을 막는다(검증자 시뮬레이션 실측).
    const nSpec = (ps[2] || '').trim();
    const only = (nSpec && nSpec !== '1') ? new Set(nSpec.split(',').map((x) => parseInt(x, 10)).filter((x) => x > 0)) : null;
    menuLabels.push({ jp: foldS(ps[0].trim()), ko: ps[1].trim(), only });
  }
} catch {}
// **긴 것부터** — 짧은 라벨이 먼저 들어가면 긴 라벨이 영영 안 잡힌다(退却 이 退却できない！ 를 먹었다)
menuLabels.sort((a, b) => b.jp.length - a.jp.length);
// 「⏎」(2026-09-17): 라벨 안 원천 줄 구분 0x50 표지 — 글자가 아니므로 빈도·배정에 안 올린다(아이템 설명 만능약/석화회복 두 줄).
for (const m of menuLabels) for (const ch of m.ko) if (ch !== '⏎') bump(ch === ' ' ? '␣' : ch, 1);

// ---- 전쟁(마스 배틀) 메시지 — 자리 치환 ----
//   지대 0x3DC200~0x3DD500. 레코드 = firstOffset 에서 시작하는 글자 자리 slots 개.
//   **0x3B 는 자간 제어라 절대 덮지 않는다** (사용자 지시). 0x3B 로 끊긴 구간이
//   바이트 칸(세그먼트)이고, 한 세그먼트 용량 = 그 안 글자들의 바이트 합이다.
//   한국어 j번째 음절 → j번째 자리. 세그먼트별 바이트 합이 용량을 넘으면 그 행은 포기.
//   남는 자리는 0x50 으로 채운다. (구조·의사코드 출처: 원장 머리 주석, 2026-08-27 실측)
const warRows = [];
try {
  for (const ln of readFileSync(path.join(PROJECT, 'runtime', 'war_messages_kr_v1.tsv'), 'utf8').split('\n')) {
    if (!ln.trim() || ln.startsWith('#')) continue;
    const ps = ln.split('\t');
    const off = parseInt(ps[0], 16), slots = Number(ps[1]), kr = (ps[3] || '').trim();
    if (off && slots && kr) warRows.push({ off, slots, jp: ps[2] || '', kr });
  }
} catch {}
// **대사 원장이 소유한 구간은 건드리지 않는다** — 전쟁 지대에 대사 행이 섞여 있어
//   자리 치환이 매크로 피연산자를 덮으면 사전 색인이 바뀐다(3DC47E 「요마」→「이리스마을」 실측).
const dialogueOwned = [];
for (const dir of ['runtime', 'runtime/fresh']) {
  let names = [];
  try { names = readdirSync(path.join(PROJECT, dir)).filter((x) => x.endsWith('_by_address_v1.json')); } catch {}
  for (const nm of names) {
    let doc;
    try { doc = JSON.parse(readFileSync(path.join(PROJECT, dir, nm), 'utf8')); } catch { continue; }
    const rs = Array.isArray(doc) ? doc : (doc.rows || []);
    for (const r of rs) {
      const a = parseInt(r.startPc || '0', 16), b = parseInt(r.finishPc || '0', 16);
      if (!(b > a && a >= 0x3d0000 && a < 0x3e0000)) continue;
      // **구워질 행만** 소유로 센다 — 한국어가 없는 행은 어차피 탈락하므로
      //   그것까지 양보하면 전쟁 메시지가 통째로 막힌다(122 → 14 실측).
      const koTxt = (r.lines && r.lines.length ? r.lines.join('') : (r.korean || ''));
      if (!/[가-힣]/.test(koTxt)) continue;
      dialogueOwned.push([a, b]);
    }
  }
}
const ownedByDialogue = (off) => dialogueOwned.some(([a, b]) => a <= off && off < b);
for (const r of warRows) for (const ch of r.kr) bump(ch === ' ' ? '␣' : ch, 1);

// ---- 마스 배틀 진형/작전 안내문 (오프셋표 풀 $FD:B000) ----
//   구조(실측): 표 0x3DB000 u16 LE 74칸 → 풀 바닥 0x3DB094, 길이 0x797.
//   레코드 길이 = tab[i+1]-tab[i] 라 **제자리**로만 쓴다(표는 안 건드린다).
//   레코드 안의 **0x50 은 줄바꿈**이다(폭 계산기 $C3:0E97 이 거기서 멈춘다) —
//   꼬리 패딩으로 쓰면 빈 줄이 생기므로 남는 자리는 원본 그대로 두고 짧게만 쓴다.
//   판독기 셋: $C5:BA85 · $C5:B368 · $C3:0E78 (전부 LDA $FD:B000,X + ADC #$B094).
let warBrief = null;
try { warBrief = JSON.parse(readFileSync(path.join(PROJECT, 'runtime', 'war_brief_3db000_korean_v1.json'), 'utf8')); } catch {}
if (warBrief) for (const r of warBrief.records) for (const ch of (r.ko || '')) if (ch !== '␣') bump(ch === ' ' ? '␣' : ch, 1);

// Trade UI: 566 offsets / 565 single-line strings. Extended glyphs require
// the TRADEFONT fetch hook installed by build_julian_rom_v1.mjs.
const tradeUiPath = path.join(PROJECT, 'runtime', 'trade_ui_3d7800_korean_v1.json');
const tradeUi = existsSync(tradeUiPath) ? JSON.parse(readFileSync(tradeUiPath, 'utf8')) : null;
if (tradeUi) for (const r of tradeUi.records) for (const ch of (r.ko || '')) bump(ch === ' ' ? '␣' : ch, 1);

// 원천 표 수리 계획(2026-09-17) — 검토된 전투 메시지 문안(v7 전체 검증·v8 반칸 여백)은 여기서 읽어 입력으로 기록하고, 글자는 배정 전에 빈도에 올린다.
const nativeTableRepairPlans = {
  popupV7: JSON.parse(readFileSync(path.join(PROJECT, 'runtime', 'battle_popup_korean_reviewed_v7.json'), 'utf8')),
  popupV8: JSON.parse(readFileSync(path.join(PROJECT, 'runtime', 'battle_popup_korean_reviewed_halfstride_v8.json'), 'utf8')),
  // C3 전쟁 메시지 255 레코드 선언(2026-09-17 군단전 묶음, tools/author_c3_war_messages_korean_v1.py 저작) — rs3_c3_war_messages_v1 가 컴파일한다.
  c3WarMessages: JSON.parse(readFileSync(path.join(PROJECT, 'runtime', 'c3_war_messages_korean_v1.json'), 'utf8')),
};
for (const ch of nativeTableRepairGlyphs(nativeTableRepairPlans)) if (ch !== ' ') bump(ch, 1);

const stripRows = [];
try {
  for (const ln of readFileSync(path.join(PROJECT, 'runtime', 'stat_strip_kr_v1.tsv'), 'utf8').split('\n')) {
    if (!ln.trim() || ln.startsWith('#')) continue;
    const ps = ln.split('\t');
    const off = parseInt(ps[0], 16), width = Number(ps[1]), kr = (ps[3] || '').trim();
    if (off && width && kr) stripRows.push({ off, width, jp: ps[2] || '', kr });
  }
} catch {}
for (const r of stripRows) for (const ch of r.kr) bump(ch === ' ' ? '␣' : ch, 1);
// **스트립 1바이트 칸이 요구하는 글자는 반드시 1바이트여야 한다** (2026-08-27 실측).
//   자리 치환은 바이트 폭이 **정확히 같을 때만** 쓴다. 2바이트 음절이 오면 그 자리는
//   원문 일본어로 남고, 폰트를 덮었으니 화면엔 랜덤 한글이 나온다
//   (「ペ」→「페」 2B>1B 실패로 「페이지」가 깨졌다 — 실기 목격).
//   판정 규칙: width 가 글자 수와 같은 행 = 모든 글자가 1바이트여야 하는 행.
const STRIP_ONEBYTE = new Set();
for (const r of stripRows) {
  if (r.width !== [...r.kr].length) continue;
  for (const ch of r.kr) STRIP_ONEBYTE.add(ch === ' ' ? '␣' : ch);
}
// 메뉴 풀에도 같은 조건의 라벨이 있다(원문이 1바이트 가나뿐이라 room == 글자수).
//   그건 원장에서 자동으로 알기 어려우니 **명시 목록**으로 받는다.
try {
  for (const ln of readFileSync(path.join(PROJECT, 'runtime', 'force_onebyte_v1.txt'), 'utf8').split(/\r?\n/)) {
    if (!ln.trim() || ln.startsWith('#')) continue;
    const ch = ln.split(/\t/)[0].trim();
    if ([...ch].length === 1) STRIP_ONEBYTE.add(ch);
  }
} catch {}

const nameTableRows = [];
for (const t of NAME_TABLES) {
  let txt = null;
  try { txt = readFileSync(path.join(PROJECT, 'runtime', t.tsv), 'utf8'); } catch { continue; }
  for (const ln of txt.split('\n')) {
    if (!ln.trim() || ln.startsWith('#')) continue;
    const ps = ln.split('\t');
    const off = parseInt(ps[1], 16);
    const ko = (ps[t.ko] || '').trim();
    if (!off || !ko) continue;
    nameTableRows.push({ t, off, jp: ps[2] || '', ko });
  }
}
for (const r of nameTableRows) for (const ch of r.ko) bump(ch === ' ' ? '␣' : ch, 1);
// 2026-09-16: 말투 팔 선언·발화 원본 payload 의 arms 글자도 빈도에 넣는다 — 배정은 mergeSpeechArms 보다 먼저 끝나므로,
//   arms 에만 쓰인 글자는 배정이 없어 compilePayload 가 「glyph not in assignment」로 빌드를 멈춘다(에이전트 작성 문안 대비).
//   이름 토큰 {X|..}·조사/서술격 토큰 {J|..}·개행·공백(0x50)·조사 사설 문자는 글리프가 아니다.
const ARM_TOKEN_RE = /[{]X[|][0-9A-F]+[|][^}]*[}]|[{]J[|][^}]*[}]|[^]/gu;
for (const armFile of ['speech_arms_declaration_v1.json', 'utterance_payloads_v1.json']) {
  const armPath = path.join(PROJECT, 'runtime', armFile);
  if (!existsSync(armPath)) continue;
  const armDoc = JSON.parse(readFileSync(armPath, 'utf8'));
  const armTexts = [];
  for (const set of Object.values(armDoc.armSets || {})) armTexts.push(...Object.values(set || {}));
  for (const e of armDoc.entries || []) if (!e.disabled) armTexts.push(...Object.values(e.arms || {}));
  for (const t of armTexts) for (const m of String(t).matchAll(ARM_TOKEN_RE)) {
    const ch = m[0];
    if (ch.length !== 1 || ch === String.fromCharCode(10) || ch === ' ' || isJosaPua(ch) || isCopulaPua(ch)) continue;
    bump(ch, 1);
  }
}

const assign = new Map();                          // ch → [bytes...]
// **코드 공간은 세 층이다** (2026-08-25, 역어셈 + 화면 실측):
//   1바이트 0x51..0xFC        → n 1..0xAC
//   선두 0x20..0x23           → n 0x000..0x3FF   글리프는 $EC(파일 0x2C0000)
//   선두 0x18 · 0x46          → n 0x400..0x5FF   글리프는 **$60(파일 0x600000)**
//     2007 확장패치(atwiki 「パッチ/文字追加」)가 넣은 층이고 보쿠노가 물려받았다.
//     $59:E200 이 선두 표다 — [0x18]=페이지 0x24 · [0x46]=페이지 0x25 둘뿐.
//     $59:E01B 가 `CPX #$7FFF · BCC → $EC:0000,X : else → $60:0000,X` 로 가른다.
//     실측: [18 10]=皇 [46 10]=蓮, 빈 슬롯에 한글을 넣으니 「한국어다」가 나왔다.
//   **저바이트 0x00..0x0F 는 못 쓴다** — 빈 슬롯이어도 장면이 튄다(실측).
//     위키 문자표도 0x10 부터 시작한다.
const codeOfN = (n) => (n <= 0xaf ? [0x50 + n]
  : n <= 0x3ff ? [0x20 | (n >> 8), n & 0xff]
    : [n <= 0x4ff ? 0x18 : 0x46, n & 0xff]);
// 1바이트는 172자까지 — 코드 0xFD/0xFE/0xFF 는 캐리어 몫이다(무동작·OUT·BACK).
// (내줬다가 BACK 오검출 2행 실측 — 캐리어와 글리프 코드는 한 대역을 나눈다.)
const ONEBYTE_BAND = 172;
// **기호 슬롯 영구 예약** (2026-08-27 실측 · 사용자 신고 「빈 술자리·아이템 자리가 다 깨졌다」):
//   원판 폰트의 구두점·기호가 이 슬롯에 들어 있고, 롬 스트림이 그 코드를
//   **바이트로 직접** 참조한다 — 한글을 앉히면 기호가 전부 그 글자로 나온다.
//     150 (표외) · 151 。 · 152 、 · 153 ‥ · 154 ！ · 155 ？ · **156 ・** · 164 ∼ · 268 々 · 667 ％
//   156(・)은 CJK 필터에 안 걸린다 — U+30FB 가 가타카나 블록 안이라서다.
//   옛 한글패치 롬(Romancing Saga 3 (K).smc)이 원판 그대로 남긴 슬롯을 뽑았더니
//   {0,150,153,155,156,164,667,768~783,966~983} 이었다 — 독립 검증으로 156 이 드러났다.
//   특히 **153(코드 0xE9)은 빈 아이템/술 칸 채움문자**다 — 메뉴 풀 0x3DFAAD 에 여섯,
//   0x3DFD02 에 넷이 그대로 있다(「‥‥‥‥」).  핀이 「께」를 앉혀 「께께께께」로 나왔다.
//   근거: r3_jp_extracted.tbl 로 슬롯 0..1023 전수를 훑어 CJK 아닌 칸만 남긴 목록
//   (0x300~0x30F 숫자 대역은 아래에서 따로 예약한다).
const SYMBOL_SLOTS = new Set([150, 151, 152, 153, 154, 155, 156, 164, 268, 667]);
const ONEBYTE = ONEBYTE_BAND - [...SYMBOL_SLOTS].filter((n) => n <= ONEBYTE_BAND).length;
// **1바이트 배정은 사전이 먼저 가져간다.**  사전 항목은 칸(8/8/10)을 넘으면
// 아예 못 들어가는 하드 실패지만, 대사는 넘쳐도 워프로 살릴 수 있어서다.
// 전엔 사전 글자에 가중치 50 을 주고 빈도로 줄 세웠는데, 그 방식은 "긴 이름
// 하나를 살리려면 그 이름의 글자를 **동시에** 여럿 승격해야 한다"를 못 본다
// (측정: 가중치 793/807 · 아래 결손 해법 806/807).
//   결손 = max(0, 항목 바이트수 - 칸).  한 글자를 1바이트로 올릴 때 총 결손을
//   가장 많이 줄이는 것부터 집고, 더 못 줄이면 나머지 슬롯은 대사 빈도로 채운다.
const dictFit = [...dictNames.entries()].map(([key, ko]) => {
  const t = OP_TABLE[key.split(':')[0]];
  return t ? { ch: [...ko].map((c) => (c === ' ' ? '␣' : c)), size: t.size } : null;
}).filter(Boolean);
const forced = new Set();
{
  const cur = dictFit.map((e) => e.ch.length * 2);   // 시작은 전부 와이드
  const occ = new Map();                             // ch → [[항목, 그 항목에서의 개수]]
  dictFit.forEach((e, i) => {
    const c = new Map();
    for (const ch of e.ch) c.set(ch, (c.get(ch) || 0) + 1);
    for (const [ch, k] of c) { if (!occ.has(ch)) occ.set(ch, []); occ.get(ch).push([i, k]); }
  });
  const defOf = (i, v) => Math.max(0, v - dictFit[i].size);
  while (forced.size < ONEBYTE && occ.size) {
    let best = null, bestGain = 0;
    for (const [ch, list] of occ) {
      let g = 0;
      for (const [i, k] of list) g += defOf(i, cur[i]) - defOf(i, cur[i] - k);
      if (g > bestGain) { bestGain = g; best = ch; }
    }
    if (!best) break;                                // 더 줄일 결손이 없다
    for (const [i, k] of occ.get(best)) cur[i] -= k;
    forced.add(best); occ.delete(best);
  }
}
// 배정 순서: ① 사전 적합 해법(강제) ② **사전에 쓰이는 나머지 글자**
//   ③ 대사 빈도.  ②를 빼면 사전 칸이 통째로 죽는다 — 「율리안」의 '율' 은
//   짧아서 강제분에 안 뽑히고 대사 빈도도 낮아 슬롯 밖으로 밀렸다(실측 40칸).
//   사전은 롬 어디서든 불리므로 대사 한 행보다 값이 크다.
const dictChars = new Set();
for (const ko of dictNames.values()) for (const ch of ko) dictChars.add(ch === ' ' ? '␣' : ch);
// 워프 불가 행의 글자 — 1바이트가 아니면 그 행은 살릴 방법이 없다
const tightChars = new Set();
for (const r of rows) {
  if (!r.tight) continue;
  for (const ch of r.text.replace(MACRE, '')) {
    if (ch === String.fromCharCode(10) || ch === '\f' || isJosaPua(ch) || isCopulaPua(ch)) continue;
    tightChars.add(ch === ' ' ? '␣' : ch);
  }
}
const byFreq = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
const rankedSeen = new Set(forced);
const take = (pred) => byFreq.filter((c) => !rankedSeen.has(c) && pred(c)).map((c) => { rankedSeen.add(c); return c; });
const ranked = [...forced,
  ...take((c) => tightChars.has(c)),               // ② 워프 불가 행 — 1바이트 아니면 죽는다
  ...take((c) => dictChars.has(c)),                // ③ 사전 — 롬 어디서든 불린다
  ...take(() => true)];                            // ④ 대사 빈도
// **슬롯이 모자라면 죽지 말고 못 실은 글자를 센다.**  코드 공간이 선두
// 0x20..0x23 뿐이라 와이드 n 은 0x3FF 가 끝이다($FF:1FC1 `AND #$07F8` 은 0x7FF
// 까지 받지만 그 위를 가리킬 코드가 없다).  1바이트 172 + 와이드 848 = 1,020자.
// 전 롬은 1,183자라 163자가 밖에 남는다 — 그 글자를 쓰는 행만 못 굽고, 나머지는
// 굽는다.  전엔 여기서 throw 해서 전 롬 빌드가 아예 안 됐다.
const EC = 0x2c0000;                               // 순정 폰트 뱅크 $EC
const slotBase = (n) => ((n >> 3) << 8) | ((n & 7) << 4);
// 쓸 수 있는 슬롯 번호를 **순서대로** 늘어놓는다.
//   ① 1바이트(바이트 예산이 제일 싸다) ② $EC 와이드
//   ③ 확장 폰트의 **빈 칸** (아무것도 안 깨진다) ④ 확장 폰트의 찬 칸(일본어를 덮는다)
const EXT_FILE = 0x600000;
const extFilled = (n) => {
  const b0 = EXT_FILE + slotBase(n);
  for (let h = 0; h < 2; h += 1) for (let i = 0; i < 16; i += 1) if (rom[b0 + h * 0x80 + i] !== 0) return true;
  return false;
};
const extFree = [], extUsed = [];
for (let n = 0x400; n <= 0x5ff; n += 1) {
  if ((n & 0xff) < 0x10) continue;                 // 저바이트 0x0F 이하는 못 쓴다
  (extFilled(n) ? extUsed : extFree).push(n);
}
const slotOrder = [];
for (let i = 1; i <= ONEBYTE_BAND; i += 1) { if (SYMBOL_SLOTS.has(i)) continue; slotOrder.push(i); }
// **0x300~0x30F 배정 풀에서 영구 예약** (2026-08-26 실측): 원판 전각 숫자 ０-９ + ＨＬＰ／←：.
//   상점 가격·여관 요금·HP/LP 가 이 슬롯을 **바이트로 직접**(23 0X) 참조한다 —
//   정적 스트림과 동적 숫자 렌더러 둘 다. 일반 한국어 배정은 계속 금지하되,
//   아래 글리프 쓰기 단계에서 0x300~0x309만 우리 0~9 모양으로 의도적으로 바꾼다.
//   0x30A~0x30F(HLP/←/:)는 원판을 그대로 둔다.
for (let n = 0xb0; n <= 0x3ff; n += 1) { if (n >= 0x300 && n <= 0x30f) continue; if (SYMBOL_SLOTS.has(n)) continue; slotOrder.push(n); }
// **찬 슬롯 덮기 금지** (2026-08-25): 덮기로 배정된 ~26자 슬롯이 보쿠노
//   자작 오프닝의 원본 자산(0x6082xx)이라 오프닝이 통째로 깨졌다(실기 목격).
//   빈 슬롯만 쓴다 — 부족분은 아래 '슬롯 밖' 보고로 드러나면 따로 다룬다.
// 조사 마커 슬롯 0x410..0x414 는 배정 풀에서 뺀다(rs3_josa_hook_v1 — 글리프가 아니라 런타임 선택 표지).
// 서술격 마커 슬롯 0x415 도 뺀다(rs3_copula_hook_v1). v10·v11·v12 배정에서 0x415 는 비어 있음(실측).
slotOrder.push(...extFree.filter((n) => (n < JOSA_SLOT_BASE || n >= JOSA_SLOT_BASE + JOSA_PAIRS.length) && n !== COPULA_SLOT));
// **구조 슬롯** (2026-08-26): 0x300~0x30F 숫자 예약으로 풀이 23 모자란다.
//   찬 칸 전면 금지의 근거는 오프닝 자산 파손(저슬롯 0x410대, 파일 0x6082xx) —
//   가장 먼 **끝쪽 찬 칸**만 정확히 부족분만큼 개방한다. 덮이는 건 확장 일본어
//   글리프(미번역 JP 의 확장 글자 일부가 깨짐 — 와이드 전면 덮기와 같은 등급).
//   판정 레일: 오프닝 픽셀 대조(결정론) — 자산이 덮이면 즉시 드러난다.
//   2026-08-27: 확장 아이템 표 원장이 새 글자를 들여오면 부족분이 더 생긴다 —
//   여유분까지 개방하되, 실제 배정된 슬롯만 덮여 쓰이므로 과개방은 무해하다.
const EXT_RESCUE = extUsed.slice().sort((a, b) => b - a).slice(0, 23 + 128);
slotOrder.push(...EXT_RESCUE);
// **배정 동결(핀)** (2026-08-26): 슬롯 배정이 굽기마다 돌면 **세이브에 박힌
//   글자 코드**(주인공 이름 등)가 다음 세대에서 딴 글자로 깨진다(카타리나→
//   천함리나 실기 목격 — 세대마다 다르게 깨짐). 핀 파일이 있으면 그 글자는
//   그 슬롯에 고정하고, 새 글자만 남은 슬롯을 랭크 순으로 받는다. 파일이
//   없으면 이번 배정을 동결로 저장한다. 핀 삭제 = 의도적 전면 재배정.
const PIN_PATH = path.join(PROJECT, 'out', 'glyph_assignment_pin_v1.json');
const PIN_OUTPUT_PATH = path.join(BUILD_OUT, 'glyph_assignment_pin_v1.json');
let PIN = new Map();
try { PIN = new Map(Object.entries(JSON.parse(readFileSync(PIN_PATH, 'utf8')).pins)); } catch {}
// **예약 슬롯에 앉아 있던 옛 핀은 옮긴다** (2026-08-27).  1바이트 대역이면
//   값이 가장 낮은 1바이트 핀과 자리를 **맞바꿔** 바이트 예산을 지킨다 —
//   그냥 풀로 돌리면 자주 쓰는 글자가 2바이트가 돼 사전 칸이 터진다.
//   와이드 예약분은 그대로 풀로 돌린다(와이드도 확장층도 2바이트라 예산 동일).
const pinMoves = [];
{
  const rankOf = new Map(ranked.map((c, i) => [c, i]));
  const victims = [...PIN.entries()]
    .filter(([, n]) => n <= ONEBYTE_BAND && !SYMBOL_SLOTS.has(n))
    .sort((a, b) => (rankOf.get(b[0]) ?? 1e9) - (rankOf.get(a[0]) ?? 1e9));   // 값 낮은 것부터
  const free = victims.filter(([c]) => !STRIP_ONEBYTE.has(c));   // 스트립이 붙잡은 글자는 못 내보낸다
  let vi = 0;
  for (const [ch, n] of [...PIN.entries()].filter(([, n2]) => SYMBOL_SLOTS.has(n2)).sort((a, b) => a[1] - b[1])) {
    if (n <= ONEBYTE_BAND && vi < free.length) {
      const [vch, vn] = free[vi];
      vi += 1;
      PIN.set(ch, vn); PIN.delete(vch);
      pinMoves.push(`${ch} ${n}→${vn} (${vch} 퇴출)`);
    } else { PIN.delete(ch); pinMoves.push(`${ch} ${n}→풀`); }
  }
  // 스트립이 1바이트를 요구하는 글자를 **강제 승격**한다(값 낮은 1바이트 핀과 맞바꿈).
  for (const ch of STRIP_ONEBYTE) {
    const n = PIN.get(ch);
    if (n !== undefined && n <= ONEBYTE_BAND && !SYMBOL_SLOTS.has(n)) continue;   // 이미 1바이트
    if (vi >= free.length) { pinMoves.push(`${ch} 승격실패(1바이트 자리 없음)`); continue; }
    const [vch, vn] = free[vi];
    vi += 1;
    PIN.set(ch, vn); PIN.delete(vch);
    pinMoves.push(`${ch} ${n === undefined ? '신규' : n}→${vn} (${vch} 퇴출·스트립)`);
  }
  if (pinMoves.length) console.log(`핀 이동(기호 슬롯 회수) ${pinMoves.length}: ${pinMoves.join(' · ')}`);
}
const pinnedSlots = new Set(PIN.values());
const unassigned = [];
const unassignedFreq = new Map();
{
  const pool = slotOrder.filter((n) => !pinnedSlots.has(n));
  let pi = 0, pinnedHit = 0;
  for (const ch of ranked) {
    const pn = PIN.get(ch);
    if (pn !== undefined) { assign.set(ch, { n: pn, bytes: codeOfN(pn) }); pinnedHit += 1; continue; }
    const n = pool[pi++];
    if (n === undefined) { unassigned.push(ch); unassignedFreq.set(ch, freq.get(ch) || 0); continue; }
    assign.set(ch, { n, bytes: codeOfN(n) });
  }
  // 조사 마커(사설 문자) 수동 배정 — 핀·풀과 무관하게 고정 슬롯. 다른 글자가 그 슬롯을 쥐면 죽인다(핀 파일 드리프트 관문).
  for (let i = 0; i < JOSA_PAIRS.length; i += 1) {
    const n = JOSA_SLOT_BASE + i;
    for (const [c, a] of assign) if (a.n === n) throw new Error(`조사 마커 슬롯 0x${n.toString(16)} 을 글자 「${c}」 가 쥐고 있다 — 핀 파일을 확인하라`);
    assign.set(josaPua(i), { n, bytes: codeOfN(n), josa: true });
  }
  // 서술격 마커(사설 문자) 수동 배정 — 고정 슬롯 0x415(18 15). 글리프 쓰기는 조사 마커와 같이 빈 픽셀(josa:true — 훅이 항상 「이」 로 바꾸거나 합성을 건너뛴다).
  for (const [c, a] of assign) if (a.n === COPULA_SLOT) throw new Error(`서술격 마커 슬롯 0x${COPULA_SLOT.toString(16)} 을 글자 「${c}」 가 쥐고 있다 — 핀 파일을 확인하라`);
  assign.set(COPULA_PUA, { n: COPULA_SLOT, bytes: codeOfN(COPULA_SLOT), josa: true, copula: true });
  if (PIN.size) console.log(`배정 동결: 핀 ${PIN.size} (적중 ${pinnedHit}) · 새 글자 ${pi}`);
  if (!PIN.size || pinMoves.length) {
    writeFileSync(PIN_OUTPUT_PATH, JSON.stringify({ note: '글리프 슬롯 동결 — 세이브 속 글자 코드(이름 등)가 세대를 넘어 살도록 고정. 지우면 전면 재배정(옛 세이브 이름 깨짐).', pins: Object.fromEntries([...assign.entries()].map(([c, a]) => [c, a.n])) }, null, 1));
    console.log(`배정 동결 파일 생성: ${assign.size}자 → ${PIN_OUTPUT_PATH}`);
  }
}
console.log(`슬롯: 1바이트 ${ONEBYTE} + $EC 와이드 848 + 확장 빈칸 ${extFree.length} + 확장 덮기 ${extUsed.length} = ${slotOrder.length}`);
console.log(`글자 ${ranked.length}자 · 배정 ${assign.size} (1바이트 ${Math.min(ONEBYTE, assign.size)}, 사전 확보 ${forced.size})`
  + (unassigned.length ? ` · **슬롯 밖 ${unassigned.length}자**: ${[...unassignedFreq.entries()].map(([c,f])=>c+'('+f+')').join(' ')}` : ''));

// ---- 글리프 쓰기 목록 ----
// **글리프 세로 정렬** (2026-08-27) — 원본 폰트는 잉크가 0~10행이고 아래가 5행 비어
//   글자가 행 위쪽에 붙어 보인다(사용자 신고). 16행 중 잉크 11행이니 위 2 · 아래 3 이 가운데다.
//   RS3_GLYPH_Y 로 조절한다(0 이면 예전 동작). **대사 말풍선에도 같이 적용된다.**
const GLYPH_Y = Number(process.env.RS3_GLYPH_Y ?? 2);
// **가로 8px 전진** (2026-08-27) — 우리 글리프는 16px 칸의 **왼쪽 8px**(p0)에 그려진다.
//   대사는 펜이 8px 씩 걸어 두 글자가 한 칸을 나눠 쓰지만, 메뉴는 16px 씩 걸어서
//   오른쪽 8px 이 빈 채로 벌어져 보인다. 1 이면 오른쪽 8px(p1)로 옮긴다.
//   **대사도 같이 8px 밀린다** — 펜이 p0 기준이라 시프터가 그만큼 더 민다.
const GLYPH_X = process.env.RS3_GLYPH_X === "1" ? 1 : 0;
const writes = [];                                 // [fileOff, [bytes...]]
let missingGlyph = [];
for (const [ch, a] of assign) {
  const gi = (ch === '␣' || a.josa) ? null : fontIndex.get(ch);   // 조사 마커 슬롯은 빈 픽셀(훅이 항상 다른 슬롯으로 바꾼다)
  if (ch !== '␣' && !a.josa && gi === undefined) { missingGlyph.push(ch); continue; }
  const base = (a.n < 0x400 ? EC : 0x600000) + slotBase(a.n);
  for (let half = 0; half < 2; half += 1) {
    const bytes = new Array(16).fill(0);
    for (let r = 0; r < 8; r += 1) {
      const y = half * 8 + r - GLYPH_Y;                                  // 행 안 세로 위치
      const row = (gi === null || y < 0 || y > 15) ? 0
        : font[gi * 32 + (y >> 3) * 16 + (y & 7) * 2];
      bytes[r] = GLYPH_X ? 0 : row;                                      // p0 = 왼쪽 8px
      bytes[8 + r] = GLYPH_X ? row : 0;                                  // p1 = 오른쪽 8px
    }
    writes.push([base + half * 0x80, bytes]);
  }
}
if (missingGlyph.length) throw new Error('폰트에 없는 글자: ' + missingGlyph.join(''));
// 슬롯 0 = 0x50(공백)의 글리프 — 순정 잔픽셀이 공백 칸에 비치지 않게 비운다
writes.push([EC + 0, new Array(16).fill(0)]);
writes.push([EC + 0x80, new Array(16).fill(0)]);

// ---- 원판 숫자 슬롯도 우리 숫자 모양으로 통일 ----
// 동적 인원수·요금은 한국어 대사 안에서도 원판 코드 23 00~23 09를 만든다.
// 원판 숫자는 14px 전각이라 반칸 대사의 8px 전진과 겹친다. 슬롯의 코드/폭 판정은
// 건드리지 않고 비트맵만 같은 8px 글리프로 바꾼다. 따라서 대사에서는 정상 8px,
// 메뉴에서는 스톡 14px 전진 간격으로 같은 숫자 모양이 나온다.
for (let d = 0; d <= 9; d += 1) {
  const ch = String(d);
  const gi = fontIndex.get(ch);
  if (gi === undefined) throw new Error(`폰트에 없는 숫자: ${ch}`);
  const base = EC + slotBase(0x300 + d);
  for (let half = 0; half < 2; half += 1) {
    const bytes = new Array(16).fill(0);
    for (let r = 0; r < 8; r += 1) {
      const y = half * 8 + r - GLYPH_Y;
      const row = (y < 0 || y > 15) ? 0
        : font[gi * 32 + (y >> 3) * 16 + (y & 7) * 2];
      bytes[r] = GLYPH_X ? 0 : row;
      bytes[8 + r] = GLYPH_X ? row : 0;
    }
    writes.push([base + half * 0x80, bytes]);
  }
}

// ---- 여관 요금의 세 자리 고정폭을 축약형으로 바꾼다 ----
// 두 여관 대사는 줄머리에서 $7E:EF00 값을 찍는데, 원문 3D EF 00은 값 6을
// [공백][공백][6]으로 만드는 3자리 고정폭 포맷터다. 한국어 말풍선에서는 그 두
// 공백이 32px 들여쓰기로 그대로 보인다. 4F 43 00은 같은 EF00 값을 읽으면서
// 선행 공백을 버리는 엔진 내장 축약형이고 길이도 3바이트라 뒤 스트림을 안 민다.
// 전역 0x3D 핸들러는 메뉴 정렬에도 쓰이므로 건드리지 않고 이 두 호출만 바꾼다.
for (const at of [0x3c3954, 0x3c4200]) {
  const before = Buffer.from([0x3d, 0xef, 0x00]);
  const actual = Buffer.from(rom.subarray(at, at + before.length));
  if (!actual.equals(before)) {
    throw new Error(`여관 요금 포맷터 원본 불일치 @0x${at.toString(16)}: ${actual.toString('hex')}`);
  }
  writes.push([at, [0x4f, 0x43, 0x00]]);
}

// ---- 사전 표 재작성 ----
const dictPlan = new Map();                        // 'op:idx' → {table, off, ko, stock}
const dictFail = [];
for (const [key, ko] of dictNames) {
  const [opHex, idxS] = key.split(':');
  const idx = parseInt(idxS, 10);
  const t = OP_TABLE[opHex];
  if (!t) { dictFail.push({ key, ko, why: 'op 표 없음(39/4B)' }); continue; }
  const hit = { ...t, stock: decodeStock(t.base + idx * t.size, t.size) };
  const bytes = [];
  let noSlot = null;
  for (const ch of ko) {
    const a = assign.get(ch === ' ' ? '␣' : ch);
    if (!a) { noSlot = ch; break; }                 // 슬롯 밖 글자 — 이 칸은 못 쓴다
    bytes.push(...a.bytes);
  }
  if (noSlot) { dictFail.push({ key, ko, why: `슬롯 밖 글자 「${noSlot}」` }); continue; }
  if (bytes.length > hit.size) { dictFail.push({ key, ko, over: bytes.length - hit.size }); continue; }
  while (bytes.length < hit.size) bytes.push(0x50);
  dictPlan.set(key, { table: hit.name, off: hit.base + idx * hit.size, ko, stock: hit.stock, bytes });
}
for (const d of dictPlan.values()) writes.push([d.off, d.bytes]);

// ---- 확장 아이템 표 재작성 ----
//   실패는 전부 치명: 원장은 손수 검수한 256칸이라, 인코딩 못 하면 원장이 낡은 것.
// ---- 확장 표 묶음 재작성 ----
//   실패는 전부 치명: 원장은 손수 검수한 칸이라, 인코딩 못 하면 원장이 낡은 것.
for (const t of extTables) {
  const fail = [];
  let written = 0, empty = 0;
  for (const r of t.records) {
    const off = t.base + r.idx * t.stride;
    const raw = [...rom.slice(off, off + t.stride)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (r.jpBytes && raw !== r.jpBytes) { fail.push(`idx ${r.idx} 원본 드리프트`); continue; }
    if (!r.ko) { empty += 1; continue; }
    const bytes = [];
    let noSlot = null;
    for (const ch of r.ko) {
      const a = assign.get(ch === ' ' ? '␣' : ch);
      if (!a) { noSlot = ch; break; }
      bytes.push(...a.bytes);
    }
    if (noSlot) { fail.push(`idx ${r.idx} 「${r.ko}」 슬롯 밖 「${noSlot}」`); continue; }
    if (bytes.length > t.stride) { fail.push(`idx ${r.idx} 「${r.ko}」 ${bytes.length}B>${t.stride}`); continue; }
    while (bytes.length < t.stride) bytes.push(0x50);
    writes.push([off, bytes]);
    written += 1;
  }
  if (fail.length) throw new Error(`확장 표(${t.name}) 재작성 실패:\n  ` + fail.join('\n  '));
  console.log(`확장 표 ${t.name}: ${written}/${t.records.length} 재작성 (빈 칸 ${empty})`);
}

// ---- 설명문 아레나 재작성 (2026-09-08) ----
//   레코드 = [len][줄1 0x50 줄2 …][0x00 채움]. len 은 본문 바이트 수(줄 구분 포함), 본문 ≤ 63B.
//   줄 수는 원문과 같아야 한다(원장 관문). 줄 안 공백은 ␣ 글리프(1바이트), 줄 구분만 0x50.
for (const t of descArenas) {
  const fail = [];
  let written = 0, empty = 0;
  for (const r of t.records) {
    const off = t.base + r.idx * t.stride;
    const raw = [...rom.slice(off, off + t.stride)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (r.jpBytes && raw !== r.jpBytes) { fail.push(`idx ${r.idx} 원본 드리프트`); continue; }
    const lines = (r.lines || []).filter((x) => typeof x === 'string');
    if (!lines.length || !lines.join('').trim()) { empty += 1; continue; }
    const jpLen = rom[off];
    // 원문 줄 수는 **토큰 단위**로 센다 — 2바이트 글리프(선두 20~23·18·46)의 둘째 바이트가 0x50 이면 줄 구분이 아니다
    //   (2026-09-15 실측: 확장 아이템 설명 idx 12 「踏破した証」 안 「20 50」 을 바이트 단위로 세어 2줄을 3줄로 오판).
    let jpLines = 1;
    if (jpLen > 0 && jpLen < t.stride) {
      for (let k = off + 1, end = off + 1 + jpLen; k < end;) {
        const b = rom[k];
        if (((b >= 0x20 && b <= 0x23) || b === 0x18 || b === 0x46) && k + 1 < end) { k += 2; continue; }
        if (b === 0x50) jpLines += 1;
        k += 1;
      }
    }
    if (lines.length !== jpLines) { fail.push(`idx ${r.idx} 줄 수 ${lines.length} ≠ 원문 ${jpLines}`); continue; }
    const body = [];
    let noSlot = null;
    lines.forEach((ln, i) => {
      if (i) body.push(0x50);
      for (const ch of ln) { const a = assign.get(ch === ' ' ? '␣' : ch); if (!a) { noSlot = ch; return; } body.push(...a.bytes); }
    });
    if (noSlot) { fail.push(`idx ${r.idx} 「${lines.join('/')}」 슬롯 밖 「${noSlot}」`); continue; }
    if (body.length > t.stride - 1) { fail.push(`idx ${r.idx} 「${lines.join('/')}」 ${body.length}B>${t.stride - 1}`); continue; }
    const bytes = [body.length, ...body];
    while (bytes.length < t.stride) bytes.push(0x00);
    writes.push([off, bytes]);
    written += 1;
  }
  if (fail.length) throw new Error(`설명문 아레나(${t.name}) 재작성 실패:\n  ` + fail.join('\n  '));
  console.log(`설명문 아레나 ${t.name}: ${written}/${t.records.length} 재작성 (빈 칸 ${empty})`);
}

// ---- 코드 뱅크 인라인 라벨 (2026-09-08, 사용자 캡처 「耐절」) ----
//   빌더 사각지대: 코드 사이에 박힌 즉치 문자열. 스테이터스 방어력 창 「耐性」 = $DE:FAB8 8B `20 00 20 00 18 93 21 F0`,
//   유일 참조 $DE:FB1B `LDX #$FAB8 · $AC=$5E · $4B=8(바이트) · JSL $FE:AADA`. $FE:AADA 는 0x50 에서 멈추고 글리프 수로 그리므로
//   2바이트 꼴(20 nn, 슬롯 ≤0x3FF)로 바꿔 바이트 수·글리프 수를 그대로 둔다(0x50 채움은 $1E bit4 대체 카운터 경로에서 위험).
//   재는 것: 원본 드리프트·슬롯 존재. 못 재는 것: 화면(실기).
//   mode 'wide' = 전부 20xx 2바이트(바이트 수 불변, 0x50 없음) · 'pack' = 1/2바이트 자연 인코딩 + 0x50 꼬리 채움
//   (라벨 렌더러가 원문 글자 수만큼 그리므로 글자 수만 같으면 된다 — 2구역 #114 「増幅力」 은 빌더 구역(0x3D9C00) 밖).
const INLINE_LABELS = [
  { off: 0x5efabc, jpBytes: '189321f0', ko: '내성', name: '스테이터스 방어력 창 耐性', mode: 'wide' },
  { off: 0x3da3f0, jpBytes: '223e23b2fa', ko: '증폭력', name: '전투 라벨 2구역 #114 増幅力', mode: 'pack' },
  // 성장 문구 「弓・銃」 (2026-09-10 사용자 캡처 「팡・銃 업!」).
  //   0x3D77FB 은 **어느 라벨 구역에도 안 든다** — LABEL_ZONES 는 3DFA08/3D9A00/3D6200 셋이고
  //   여기는 트레이드 UI 오프셋표(0x3D7800) 바로 앞, 0xFF 채움 꼬리에 홀로 앉아 있다.
  //   그래서 원장·풀 라벨 어느 쪽도 안 굽었고 글리프만 한국어로 갈려 「팡・銃」이 됐다
  //   (그림자 행 0 · rowSpans 피복 0바이트 실측). 가운데 `ec`(・)는 롬 본래 글자라 그대로 둔다.
  //   구분자는 슬래시로 통일한다(사용자 2026-09-10) — 전각 「・」는 16px 라 반칸 한글 사이에서 튄다.
  //   / 가 1바이트여야 5바이트에 들어간다: runtime/force_onebyte_v1.txt 참조.
  { off: 0x3d77fb, jpBytes: '21bdec18b4', ko: '활/총', name: '성장 문구 弓・銃', mode: 'pack' },
];
for (const il of INLINE_LABELS) {
  const raw = [...rom.slice(il.off, il.off + il.jpBytes.length / 2)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (raw !== il.jpBytes) throw new Error(`인라인 라벨 ${il.name}: 원본 드리프트 ${raw}`);
  const bytes = [];
  for (const ch of il.ko) {
    const a = assign.get(ch);
    if (!a) throw new Error(`인라인 라벨 ${il.name}: 슬롯 밖 「${ch}」`);
    if (il.mode === 'wide') {
      if (a.n > 0x3ff) throw new Error(`인라인 라벨 ${il.name}: 「${ch}」 슬롯 ${a.n} 은 20xx 꼴 불가`);
      bytes.push(0x20 | (a.n >> 8), a.n & 0xff);
    } else bytes.push(...a.bytes);
  }
  if (bytes.length > il.jpBytes.length / 2) throw new Error(`인라인 라벨 ${il.name}: ${bytes.length}B > ${il.jpBytes.length / 2}B`);
  while (bytes.length < il.jpBytes.length / 2) bytes.push(0x50);
  writes.push([il.off, bytes]);
  console.log(`인라인 라벨 ${il.name}: ${il.off.toString(16)} ← ${bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ')} (${il.ko})`);
}

// ---- 성장 문구 커서 전진 반칸화 (2026-09-10) ----
//   사용자 「업 앞에 공백이 왜 다 제각각이야」.  진범: 폭 측정기 `$FE:B585` 는 **글자 수 G**
//   를 센다(0x50 에서 멈춘다).  원문은 전각이라 한 글자가 2반칸이므로 `$C2:CE2E` 의 `ASL A`
//   (전진 = 2G 반칸)가 딱 맞았다.  한글은 반칸이라 실제로 그린 폭은 G 반칸뿐이고
//   **남은 G 반칸이 그대로 빈틈**이 된다 — 그래서 라벨 글자 수마다 빈틈이 달랐다
//   (검/대검 4 · 곤봉/도끼 5 · 창/소검 4 · 활/총 3).
//   ① `ASL A` → `NOP` 이면 전진 = G 반칸 = 그린 폭.
//   ② `$C2:CDB7`(技の力/術の力 경로)은 측정 없이 `ADC #$06`(=2×3, 원문 3글자) 고정이라
//      한글 「기력」·「술력」(둘 다 2글자)에 맞춰 `#$02` 로 줄인다.
//   ③ 사이 빈칸은 「がアップ！」 라벨 머리의 빈 글리프 **두 칸**(`␣␣업!␣`)으로 낸다.
//      **전진값으로 내는 방식은 안 통한다** — `$7E` 를 +1 해도(INC A) 화면이 NOP 과 똑같다(실측).
//      펜이 그 단위에서 잘리는 것으로 보이고, 빈 글리프는 반영된다.
//      또 라벨 글자 수의 **홀짝**에 따라 한 칸이 먹힌다(실측: 빈칸 1개면 G 짝수 라벨은 0칸, 홀수는 1칸).
//      그래서 두 칸을 두어 **모든 라벨이 최소 한 칸**은 띄게 했다(1칸 또는 2칸). 기전은 미해명.
//   판정: 실기 4장(검/대검·곤봉/도끼·창/소검·활/총)에서 빈틈이 같아야 한다.
const CODE_PATCHES = [
  { off: 0x02ce2e, was: '0a', now: 'ea', name: '$C2:CE2E ASL A → NOP (전진 2G→G)' },
  { off: 0x02cdd4, was: '06', now: '02', name: '$C2:CDD4 ADC #$06 → #$02 (기력/술력 전진)' },
  // ④ 꼬리 채움까지 세던 것을 뺀다.  칸 바이트가 남으면 풀 라벨 작성기가 0x50 으로 채우는데,
  //    폭 측정기 `$FE:B5BA` 는 그 0x50 도 한 글자로 센다(0x50 검사가 없다 — 다른 갈래 $FE:B596 엔 있다).
  //    그래서 「창/소검」(칸 7B·문안 6B)만 빈틈이 한 반칸 더 벌어졌다.  용어를 지키면서 칸을 딱 채우는
  //    문안은 없다(「소검」·「곤봉」이 이미 표준어) — 그래서 측정 쪽을 고친다.
  //    $FE:94C3 (빈 공간 256B, 원본·후보 모두 0xFF) 에 23바이트를 놓고 `JSR $B5F3` 를 이리로 돌린다:
  //      JSR $B5F3 · PHP · SEP #$20 · while($8A && [$AA]+$8A-1 == 0x50) $8A-- · PLP · RTS
  //    $8A 는 B5BA 가 들어올 때 PHX 로 저장하고 나갈 때 되돌리므로 이 깎기는 측정 안에서만 산다.
  { off: 0x3e94c3, was: 'ffffffffffffffffffffffffffffffffffffffffffffff',
    now: '20f3b508e220a48af00b88b7aac950d004848a80f12860',
    name: '$FE:94C3 폭 측정 꼬리 0x50 깎기 (23B)' },
  { off: 0x3eb5c0, was: '20f3b5', now: '20c394', name: '$FE:B5C0 JSR $B5F3 → $94C3' },
  // ---- 전투 기술 외침 풍선 「!」 앞 빈틈 (2026-09-15 사용자 제보: 「스네이크 샷      !」) ----
  //   z104 가 성장 문구에서 고친 것과 **같은 병**(전각 전제 2G 전진)이 꼬리 달린 외침 풍선에도 있다.
  //   `$C2:D0D4` 가 그 풍선을 그린다(역어셈 tools/disasm_65816_v1.mjs 2D0D4 70):
  //     JSR $05E9            기술명 표 포인터 $AA/$AC = FD:27C0 + $42*10 (10바이트 레코드)
  //     JSL $5E:0710         글자 수 G 측정 — $3C bit6 세트면 술법 표 5B:A000+$42*10 으로 갈아타고
  //                          $82=7, 아니면 기술 표 그대로 $82=10.  속은 `JSL $FE:B585`(0x50 에서 멈춤)
  //     INC A; CMP $82; BCS; LDA $82; STA $80     풍선 폭 $80 = max(G+1, $82)
  //     JSL $FE:A414 · JSL $FE:AADA               이름 그리기 (전투 문자열 렌더러 = BATTLEHALF 대상)
  //     JSL $FE:B585                              G 다시 측정
  //     $C2:D11A  ASL A                           ← **여기**: 커서 전진 = 2G 반칸
  //     CLC; ADC $7E; STA $7E
  //     JSL $5E:0740 → 라벨 $65 = #$1D(기술) / #$12(술법) → JSR $0707; JSL $FE:AADA   「!」 그리기
  //   원문 기술명은 전각(한 글자 = 2반칸)이라 2G 가 그린 폭과 같지만, 한글은 반칸(BATTLEHALF 훅 8px)
  //   이라 실제로 그린 폭은 G 반칸뿐이고 **남은 G 반칸이 그대로 빈틈**이 된다
  //   (「스네이크 샷」 G=6 → 6반칸 48px, 사용자 캡처와 일치).
  //   처방 후보는 `$C2:CE2E` 와 같은 `ASL A` → `NOP`(전진 = G 반칸 = 그린 폭)이었다.
  //
  //   **실측 결과 이 처방만으로는 안 된다 — 그래서 꺼 뒀다(2026-09-15).**
  //   실코어 프로브 tools/probe_tech_shout_native_v1.mjs 로 전투 스테이트에서 `$C2:D0D4` 를
  //   직접 그려 G=1..9 와 술법 3종을 패치 전/후로 찍었다(out/tech_shout_probe_v1/REPORT.md):
  //     · G=2,4,5,7,9 → 라벨이 이름 바로 뒤에 딱 붙는다(빈틈 0).  고쳐진다.
  //     · G=1,3       → 여전히 1반칸(8px) 빈틈이 남는다.
  //     · **G=6,8     → 라벨이 이름 안으로 들어가 마지막 글자를 통째로 덮는다**
  //                     (「스네이크 샷」→「스네이크 의」, 「스카이 드라이브」→「스카이 드라이의」).
  //   즉 전진값 G 자체는 그린 폭과 정확히 맞는데(픽셀로 확인: 이름 폭 = G×8px),
  //   **라벨을 그리는 쪽이 커서를 제 나름대로 정렬**해서 자리가 어긋난다 — z104 가 성장 문구에서
  //   「홀짝에 따라 한 칸이 먹힌다… 기전은 미해명」이라고 적어 둔 그 현상과 같은 뿌리로 보인다.
  //   커서→화면x 실측(시작 커서 5 = x32): 6·7→48, 8·9→64, 10→72, 12→88, 14→104.
  //   되살리려면 먼저 그 정렬 규칙을 밝히고(라벨 그리기 경로 $C2:0707 / $FE:AADA),
  //   전진을 규칙에 맞춘 값으로 바꾼 뒤 같은 프로브로 G=1..9 전부를 다시 찍어야 한다.
  //   { off: 0x02d11a, was: '0a', now: 'ea', name: '$C2:D11A ASL A → NOP (외침 풍선 라벨 전진 2G→G)' },
  // ---- 전투 기술 외침 꼬리 풍선 「(기술명)!」 (2026-09-15, 실측 out/tech_shout_probe_v1/_pen) ----
  //   사용자 캡처 「스네이크 샷      !」·「말풍선이 왜 쓸데없이 커지냐」의 정체는 위 `$C2:D0D4`(비전 창)가 아니라
  //   `$C2:CBFC`(꼬리 풍선; `$C2:CB79` 가 행동 id ≥ 0x0D 인 기술에서 고른다)다. 둘 다 전각 전제다:
  //     · 폭  $80 = G+2 (CC03/CC04 `INC A;INC A`, G = `$FE:B585` 글자 수) — 한글은 반칸이라 창이 두 배로 크다.
  //     · 라벨 「!」는 `$FE:AADA` 가 매 호출 AAE6~AAF3 에서 $72/$73/$74 를 $7E 로부터 다시 계산해 그린다.
  //       BATTLEHALF 아래서 라벨 타일 x8 = ($72&~1) + (idx≠1), idx = ($72>>1)&3 이라 전진값을 무엇으로 두든
  //       26(마지막 글자 겹침)·29(2반칸 빈틈)만 나오고 27(딱 붙음)은 못 만든다 — 전진값 처방(D11A/CC29 NOP)이 실패한 이유.
  //   처방(자연 발동 실측, 기술 레코드 갈아끼워 G=1..9 전부 「검!」「토마호크!」「장작패기 다이내믹!」 0칸·창 딱 맞음):
  //     ① 폭 = ceil(G/2)+2 — `$FE:94F0` 7B `JSL $FE:B585; INC A; LSR A; RTL` 로 CBFF 의 B585 호출을 바꿔치기.
  //     ② 라벨은 이름 런이 남긴 펜($72 idx=1 고정, $74 = 마지막 글리프 다음 타일)을 이어 그린다 —
  //        `$FE:94E0` 15B: AADA 프롤로그(LDX $AA;PHX;LDA $AC;PHA;LDA $1D;AND #$FB;STA $1D) 재현 뒤 `JMP $AAF5`
  //        (재계산 네 줄만 건너뜀). CC33 의 `JSL $FE:AADA` 를 이리로.
  //   전진 계산(CC25~CC31 → $7E)은 라벨 위치에 더는 영향이 없어 그대로 둔다. 창은 오른쪽 끝 고정이라 폭을 줄여도
  //   「!」가 밀려나지 않는다. CC3E(무기명)·D0D4·CEA0·D078 경로는 AADA 본체를 안 건드리므로 무영향.
  //   빈터 `$FE:94E0/94F0` 은 z104 의 `$FE:94C3`(23B) 바로 뒤, 원본·후보 모두 0xFF.
  { off: 0x3e94e0, was: 'ffffffffffffffffffffffffffffff', now: 'a6aadaa5ac48a51d29fb851d4cf5aa', name: '$FE:94E0 「!」 펜 이어 그리기 스텁 (15B)' },
  { off: 0x3e94f0, was: 'ffffffffffffff', now: '2285b5fe1a4a6b', name: '$FE:94F0 폭 = ceil(G/2) 측정 스텁 (7B)' },
  { off: 0x02cbff, was: '2285b5fe', now: '22f094fe', name: '$C2:CBFF JSL $FE:B585 → $FE:94F0 (꼬리 풍선 폭 ceil(G/2)+2)' },
  { off: 0x02cc33, was: '22daaafe', now: '22e094fe', name: '$C2:CC33 JSL $FE:AADA → $FE:94E0 (「!」 펜 이어 그리기)' },
  // 조사 런타임 선택 훅(2026-09-15, rs3_josa_hook_v1) + 서술격 「이」 훅(rs3_copula_hook_v1): 글리프 로더 진입(원본 a68d8a)을
  //   FF:EF00 으로 돌리고, 서술격 훅이 마커 아니면 FF:ED00(조사 훅, 바이트 무수정)으로 잇는다. 같은 3바이트라 조사 훅 ENTRY_PATCH 를 대체한다
  //   (CODE_PATCHES 의 was 는 원본 롬과 대조하므로 두 패치를 겹쳐 쓸 수 없다).
  { ...COPULA_ENTRY_PATCH },
];
// 훅 코드·받침 비트맵·마커표(뱅크 FF 빈 공간) — 원본이 FF 인지 관문 뒤에 쓴다.
assertJosaSpace(rom);
for (const w of josaHookWrites(Object.fromEntries([...assign.entries()].map(([c, a]) => [c, a.n])))) writes.push(w);
console.log(`조사 훅: 코드 FF:ED00 + 받침 비트맵 FF:EE00 + 마커표 FF:EED0 · 마커 슬롯 0x${JOSA_SLOT_BASE.toString(16)}..${(JOSA_SLOT_BASE + JOSA_PAIRS.length - 1).toString(16)}`);
// 서술격 훅 코드(zero 변형 79B)·「이」 슬롯 표 — 원본 FF:EF00..EFFF 가 FF 인지, 로더 진입이 JSL $FF:1F7C 2곳뿐인지(zero 의 전제) 관문 뒤에 쓴다.
assertCopulaSpace(rom);
assertCopulaLoaderEntries(rom);
for (const w of copulaHookWrites(Object.fromEntries([...assign.entries()].map(([c, a]) => [c, a.n])))) writes.push(w);
console.log(`서술격 훅: 코드 FF:EF00(zero) + 「이」 슬롯 표 FF:EFE0 · 마커 슬롯 0x${COPULA_SLOT.toString(16)} · 진입 1FA0 → EF00 → ED00`);
for (const cp of CODE_PATCHES) {
  const raw = [...rom.slice(cp.off, cp.off + cp.was.length / 2)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (raw !== cp.was) throw new Error(`코드 패치 ${cp.name}: 원본 드리프트 ${raw} (기대 ${cp.was})`);
  const bytes = [];
  for (let i = 0; i < cp.now.length; i += 2) bytes.push(parseInt(cp.now.slice(i, i + 2), 16));
  writes.push([cp.off, bytes]);
  console.log(`코드 패치 ${cp.name}: ${cp.off.toString(16)} ${cp.was} → ${cp.now}`);
}

// ---- 대사 밖 이름 표 재작성 ----
//   실패는 죽이지 않고 신고한다(원장이 롬보다 오래됐을 수 있고, 표 하나가
//   막혀도 나머지는 살아야 한다). 대신 통계를 남겨 회귀를 본다.
// ---- 메뉴 풀 라벨 재작성 ----
if (menuLabels.length) {
  const taken = [];
  let done = 0, skip = 0; const why = {};
  for (const m of menuLabels) {
    const body = [];
    let noSlot = null;
    for (const ch of m.ko) { if (ch === '⏎') { body.push(0x50); continue; } const a = assign.get(ch === ' ' ? '␣' : ch); if (!a) { noSlot = ch; break; } body.push(...a.bytes); }
    if (noSlot) { skip += 1; why['슬롯밖'] = (why['슬롯밖'] || 0) + 1; continue; }
    let hits = 0, start = 0, saw = 0, roomBad = 0, overBad = 0, crossBad = 0, packBad = 0, lastRoom = -1, benign = 0;
    for (;;) {
      const k = poolText.indexOf(m.jp, start);
      if (k < 0) break;
      start = k + 1;
      const lo = poolChars[k][1];
      const last = poolChars[k + m.jp.length - 1];
      const hi = last[1] + last[2];
      saw += 1;
      if (m.only && !m.only.has(saw)) continue;   // 지정 출현 번호가 아니면 건너뜀
      const room = hi - lo; lastRoom = room;
      if (body.length > room) { roomBad += 1; continue; }
      // 라벨 경계를 가로지르는 매치는 버린다 — 넘어 쓰면 다음 라벨이 통째로 깨진다
      if (LABEL_BOUNDS.some((bd) => lo < bd && bd < hi)) { crossBad += 1; continue; }
      // 이미 치환한 자리를 다시 덮지 않는다(긴 라벨 안을 짧은 라벨이 다시 쓰면 잘린다)
      const clash = taken.find(([a2, b2]) => a2 < hi && lo < b2);
      if (clash) {
        // **선점이 늘 결함인 건 아니다** (2026-08-28 실측). 두 가지 무해한 꼴이 있다:
        //   · 나를 **포함하는** 라벨이 이미 그렸다 — 라벨은 원문 글자 수만큼 그리므로
        //     그 라벨 한국어의 앞부분이 곧 내 문안이다(「これで」는 「これでいいですか?」→
        //     「이대로 하시겠소?」의 앞 3칸, 「ステータス」는 「ステータス畵面」의 앞 5칸).
        //   · **같은 원문이 표에 두 줄** 들어 있다(石突き…×2, これでいいですか 전각/반각).
        // 이걸 「실패」로 찍으면 매번 진짜 결함처럼 보인다. 갈라서 센다.
        const contains = clash[0] <= lo && hi <= clash[1] && clash[2].includes(m.jp);
        const sameText = clash[2] === m.jp;
        if (contains || sameText) benign += 1; else overBad += 1;
        if (process.env.RS3_MENU_WHY === '1') {
          console.log(`      ${contains || sameText ? '무해' : '선점'}: [0x${lo.toString(16)},0x${hi.toString(16)}) ← 「${clash[2]}」 [0x${clash[0].toString(16)},0x${clash[1].toString(16)})`);
        }
        continue;
      }
      // **표 항목 안에 라벨이 여럿 묶여 있으면 글자 수를 지켜야 한다** (2026-08-27 실측).
      //   0x50 패딩도 렌더러엔 **한 글자**다. 항목 하나가 「男女名前性別人物宿星」처럼
      //   여러 라벨을 담고 있으면, 패딩 한 칸이 뒤 라벨을 통째로 밀어 버린다
      //   (「名前」→「이름」이 「이」/「름성」/「별」로 흩어진 것이 이 부류).
      //   항목 전체를 차지한 매치만 패딩을 허용하고, 항목 **안쪽** 매치는
      //   글자 수를 맞추고 폭을 정확히 채운다(슬롯 0..0x3FF 는 1·2바이트 둘 다로 쓸 수 있다).
      const whole = LABEL_BOUNDS.includes(lo) && LABEL_BOUNDS.includes(hi);
      let out = null;
      if (whole) out = body.concat(new Array(room - body.length).fill(0x50));
      else {
        //   글자 수를 원문에 맞춘다 — 짧으면 **공백 글자**로 채운다(0x50 도 한 글자다).
        //   그 다음 폭을 정확히 room 에 맞춘다: 슬롯 >0xAF 는 2바이트 고정,
        //   0..0xAF 는 1·2바이트 둘 다 되니 필요한 만큼만 와이드로 올린다.
        const chars = [...m.ko];
        while (chars.length < m.jp.length) chars.push('␣');
        if (chars.length === m.jp.length) {
          const sl = chars.map((ch) => assign.get(ch === ' ' ? '␣' : ch));
          if (!sl.some((x) => !x)) {
            const forced = sl.filter((x) => x.n > 0xaf).length;
            const opt = sl.length - forced;
            const k = room - 2 * forced - opt;                 // 1바이트 대역에서 와이드로 올릴 개수
            if (k >= 0 && k <= opt) {
              let up = k; const acc = [];
              for (const x of sl) {
                const w = x.n > 0xaf ? 2 : (up > 0 ? (up -= 1, 2) : 1);
                acc.push(...(w === 2
                  ? (x.n <= 0x3ff ? [0x20 | (x.n >> 8), x.n & 0xff] : [x.n <= 0x4ff ? 0x18 : 0x46, x.n & 0xff])
                  : [0x50 + x.n]));
              }
              if (acc.length === room) out = acc;
            }
          }
        }
        if (!out) { packBad += 1; continue; }
      }
      taken.push([lo, hi, m.jp]);
      writes.push([lo, out]);
      hits += 1;
    }
    if (hits) done += 1;
    else if (benign && !roomBad && !overBad && !crossBad && !packBad) {
      // 포함 라벨/중복 항목이 이미 그린 자리 — 화면은 맞다
      why['이미그려짐'] = (why['이미그려짐'] || 0) + 1;
    }
    else { skip += 1; const w = saw === 0 ? '원문없음'
      : (packBad >= roomBad && packBad >= overBad && packBad >= crossBad ? '글자수불일치'
        : (crossBad > roomBad && crossBad > overBad ? '경계넘김' : (roomBad >= overBad ? '칸부족' : '선점충돌'))); why[w] = (why[w] || 0) + 1;
      if (process.env.RS3_MENU_WHY === '1') console.log(`  [라벨실패:${w}] 「${m.jp}」(${m.jp.length}자)→「${m.ko}」(${[...m.ko].length}자 ${body.length}B) room=${lastRoom} saw=${saw}`); }
  }
  console.log(`메뉴 풀 라벨: 성공 ${done} · 실패 ${skip} ${JSON.stringify(why)}`);
  // **경계 관문** — 세 구역의 최종 바이트를 세워서 오프셋표 경계가 전부 코드 시작인지 본다.
  //   어긋나면 그 라벨은 2바이트 코드 한가운데서 시작해 통째로 딴 글자가 된다.
  {
    const off = [];
    for (const z of ZONE_TABLES) {
      const buf = Buffer.from(rom.subarray(z.pool, z.end));
      for (const [at, bytes] of writes) {
        if (at + bytes.length <= z.pool || at >= z.end) continue;
        for (let i = 0; i < bytes.length; i += 1) {
          const k = at + i - z.pool;
          if (k >= 0 && k < buf.length) buf[k] = bytes[i];
        }
      }
      const starts = new Set();
      for (let i = 0; i < buf.length;) { starts.add(z.pool + i); const b = buf[i]; i += ((b >= 0x20 && b <= 0x23) || b === 0x18 || b === 0x46) ? 2 : 1; }
      for (const a of LABEL_BOUNDS) if (a >= z.pool && a < z.end && !starts.has(a)) off.push(a);
    }
    if (off.length) throw new Error(`메뉴 풀 라벨 경계 어긋남 ${off.length}: ` + off.map((a) => '0x' + a.toString(16)).join(' '));
    console.log(`  경계 관문: ${LABEL_BOUNDS.length}칸(3구역) 전부 코드 시작`);
  }
}


// ---- 진형/작전 안내문 재작성 (오프셋표 재작성) ----
//   한국어가 원문보다 짧으면 제자리 쓰기는 **꼬리에 원문 바이트가 남아** 그대로
//   화면에 샌다(51레코드·147B 실측 — 0x50 으로 채우면 이번엔 빈 줄이 생긴다).
//   판독기가 길이를 표에서 빼므로(len = tab[i+1]-tab[i]) **표를 같이 다시 쓰는 게 설계된 방식**이다.
if (warBrief) {
  const TAB = 0x3db000, N = 74, BASE = TAB + N * 2, POOL = 0x797;
  const fail = [];
  const enc = [];
  for (const r of warBrief.records) {
    const off = parseInt(r.off, 16);
    const raw = [...rom.subarray(off, off + r.budget)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (r.bytes && raw !== r.bytes) { fail.push(`idx ${r.idx} 원본 드리프트`); continue; }
    const segs = (r.lines || []).map((l) => l.ko ?? '');
    const by = [];
    let bad = null;
    segs.forEach((t, k) => {
      if (k) by.push(0x50);                          // 줄바꿈 — 세그먼트 수를 원본과 같게
      for (const ch of t) {
        const a = assign.get(ch === ' ' ? '␣' : ch);
        if (!a) { bad = ch; return; }
        by.push(...a.bytes);
      }
    });
    if (bad) { fail.push(`idx ${r.idx} 슬롯 밖 「${bad}」`); continue; }
    enc[r.idx] = by;
  }
  if (fail.length) throw new Error('진형 안내문 재작성 실패:\n  ' + fail.join('\n  '));
  let cur = 0;
  for (let i = 0; i < 72; i += 1) {
    const by = enc[i] || [];
    writes.push([TAB + i * 2, [cur & 0xff, (cur >> 8) & 0xff]]);
    if (by.length) writes.push([BASE + cur, by]);
    cur += by.length;
  }
  writes.push([TAB + 72 * 2, [cur & 0xff, (cur >> 8) & 0xff]]);
  writes.push([TAB + 73 * 2, [cur & 0xff, (cur >> 8) & 0xff]]);
  if (cur > POOL) throw new Error(`진형 안내문 풀 넘침 ${cur} > ${POOL}`);
  // 남는 꼬리는 원본 여백과 같은 0xFF (0x50 이면 빈 줄로 읽힌다)
  if (cur < POOL) writes.push([BASE + cur, new Array(POOL - cur).fill(0xff)]);
  console.log(`진형/작전 안내문($FD:B000 표 재작성): 72칸 · 풀 ${cur}/${POOL}B`);
}

if (tradeUi) {
  const TAB = 0x3d7800, BASE = 0x3d7d00, END = 0x3d9800, COUNT = 565;
  if (tradeUi.records.length !== COUNT) throw new Error('트레이드 UI 레코드 수 불일치');
  const bodies = [], offsets = [0];
  for (let i = 0; i < COUNT; i++) {
    const r = tradeUi.records[i];
    const start = BASE + rom.readUInt16LE(TAB + i * 2);
    const end = BASE + rom.readUInt16LE(TAB + (i + 1) * 2);
    if (r.idx !== i || parseInt(r.off, 16) !== start || end < start || end > END
        || rom.subarray(start, end).toString('hex') !== r.jpBytes)
      throw new Error(`트레이드 UI idx ${i} 원본/색인 드리프트`);
    if (typeof r.ko !== 'string' || /[\r\n\t]/.test(r.ko) || (end === start) !== (r.ko.length === 0))
      throw new Error(`트레이드 UI idx ${i} 빈칸/단일행 계약 위반`);
    // The interchangeable goods/group-name fields support their source
    // category's longest name (C4 ADC #0182 / ADC #00BB -> JSR $3AA8).
    const glyphLimit = i >= 386 && i <= 449 ? 6 : i >= 186 && i <= 234 ? 10 : [...r.jp].length;
    if ([...r.ko].length > glyphLimit)
      throw new Error(`트레이드 UI idx ${i} 필드 글자 수 초과 ${glyphLimit}`);
    const bytes = [];
    for (const ch of r.ko) {
      const a = assign.get(ch === ' ' ? '␣' : ch);
      if (!a || a.n > 0x5ff || a.bytes[0] === 0x50)
        throw new Error(`트레이드 UI idx ${i} 지원하지 않는 글자 ${ch}`);
      bytes.push(...a.bytes);
    }
    // CPU verification confirms BOTH dynamic helpers select 551+suffix:
    // CPX #$0032 sets carry before ADC #13. No padding is necessary.
    if (bytes.length > 255) throw new Error(`트레이드 UI idx ${i} 길이 넘침`);
    bodies.push(bytes); offsets.push(offsets.at(-1) + bytes.length);
  }
  const used = offsets.at(-1);
  if (used > END - BASE) throw new Error(`트레이드 UI 풀 넘침 ${used}/${END - BASE}`);
  for (let i = 0; i <= COUNT; i++) writes.push([TAB + i * 2, [offsets[i] & 255, offsets[i] >> 8]]);
  writes.push([BASE, bodies.flat().concat(new Array(END - BASE - used).fill(0xff))]);
  console.log(`트레이드 UI: ${COUNT}칸 · 풀 ${used}/${END - BASE}B · TRADEFONT 판독기`);
}

// ---- 스탯 스트립 색인 고침 ----
//   색인은 「칸번호 + 0x10」 목록이고 라벨끼리 칸을 **공유**한다 — 공유를 끊어야
//   한 칸의 한국어가 다른 라벨을 망가뜨리지 않는다(所持金 → 「소소금」이 그 부류).
//   바꾸기 전에 원본 바이트가 기대값인지 확인하고, 아니면 빌드를 죽인다.
{
  const idxFix = [];
  try {
    for (const ln of readFileSync(path.join(PROJECT, 'runtime', 'strip_index_fix_v1.tsv'), 'utf8').split(/\r?\n/)) {
      if (!ln.trim() || ln.startsWith('#')) continue;
      const p = ln.split(/\t/);
      const off = parseInt(p[0], 16), from = parseInt(p[1], 16), to = parseInt(p[2], 16);
      if (Number.isFinite(off) && Number.isFinite(from) && Number.isFinite(to)) {
        idxFix.push({ off, from, to, why: p[3] || '' });
      }
    }
  } catch {}
  const bad = idxFix.filter((r) => rom[r.off] !== r.from);
  if (bad.length) {
    throw new Error('스트립 색인 고침: 원본 바이트 불일치 '
      + bad.map((r) => '0x' + r.off.toString(16) + ' 기대 ' + r.from.toString(16)
        + ' 실제 ' + rom[r.off].toString(16)).join(' / '));
  }
  for (const r of idxFix) writes.push([r.off, [r.to]]);
  if (idxFix.length) console.log(`스트립 색인 고침: ${idxFix.length}자리`);
}

if (stripRows.length) {
  let done = 0; const widthBad = [], slotBad = [];
  // **스트립은 글자 개수로 색인된다** (2026-08-27 실기 목격).
  //   전엔 남는 폭을 0x50 으로 채웠는데, 0x50 도 **한 글자**라서 2바이트 칸이
  //   「한글+빈칸」 두 글자가 됐고 그 뒤 라벨이 통째로 밀렸다
  //   (「所」 자리 글자가 「陣形」 칸에 떴다).
  //   고침: 칸 폭에 **정확히 맞는 코드 형태**를 골라 쓴다 — 슬롯 0..0x3FF 는
  //   1바이트(0x50+n)로도 2바이트(0x20|n>>8, n&0xFF)로도 같은 글자를 가리킨다.
  //   그래서 2바이트 칸엔 와이드 형태를 써서 **패딩 없이 한 칸 = 한 글자**를 지킨다.
  const codeW = (n, want) => {
    if (want === 1) return n <= 0xaf ? [0x50 + n] : null;          // 1바이트 칸은 1바이트 대역만
    if (want === 2) return n <= 0x3ff ? [0x20 | (n >> 8), n & 0xff]
      : [n <= 0x4ff ? 0x18 : 0x46, n & 0xff];                     // 확장층도 2바이트
    return null;
  };
  for (const r of stripRows) {
    const chars = [...r.kr];
    let bad = null, bytes = null;
    // 글자 수가 칸 수와 같아야 한다 — 한 글자에 폭 1 또는 2 를 배분한다.
    const slots = chars.map((ch) => assign.get(ch === ' ' ? '␣' : ch));
    if (slots.some((x) => !x)) { bad = chars[slots.findIndex((x) => !x)]; }
    else if (chars.length === 1) {
      const e = codeW(slots[0].n, r.width);
      if (e) bytes = e;
    } else {
      // 여러 글자면 폭 합이 정확히 맞아야 한다(각 글자는 1 또는 2).
      const min = chars.length, max = chars.length * 2;
      if (r.width >= min && r.width <= max) {
        let wide = r.width - min;                                  // 2바이트로 쓸 글자 수
        const out = [];
        for (const sl of slots) {
          const w = (wide > 0 || sl.n > 0xaf) ? 2 : 1;
          if (w === 2) wide -= 1;
          const e = codeW(sl.n, w);
          if (!e) { bytes = null; break; }
          out.push(...e);
        }
        if (out.length === r.width && wide === 0) bytes = out;
      }
    }
    if (bad) { slotBad.push(`${r.off.toString(16)} 「${r.kr}」 슬롯 밖 「${bad}」`); continue; }
    if (!bytes) { widthBad.push(`${r.off.toString(16)} 「${r.jp}」→「${r.kr}」 폭 ${r.width} 에 못 맞춤`); continue; }
    writes.push([r.off, bytes]);
    done += 1;
  }
  console.log(`스탯 스트립: ${done}/${stripRows.length} 자리 치환`
    + (widthBad.length ? ` · **폭 불일치 ${widthBad.length}**: ${widthBad.slice(0, 5).join(' / ')}` : '')
    + (slotBad.length ? ` · 슬롯 밖 ${slotBad.length}` : ''));
}

if (formExtLedger) {
  const fail = [];
  let done = 0;
  for (const r of formExtLedger.records) {
    const off = FORM_EXT.base + r.idx * FORM_EXT.stride;
    const raw = [...rom.slice(off, off + FORM_EXT.text)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (r.jpBytes && raw !== r.jpBytes) { fail.push(`idx ${r.idx} 원본 드리프트`); continue; }
    const bytes = [];
    let bad = null;
    const put = (s) => { for (const ch of s) { const a = assign.get(ch === ' ' ? '␣' : ch); if (!a) { bad = ch; return; } bytes.push(...a.bytes); } };
    put(r.name || '');
    if (!bad) { bytes.push(0x50); put(r.line1 || ''); }
    if (!bad) { bytes.push(0x50); put(r.line2 || ''); }
    if (bad) { fail.push(`idx ${r.idx} 슬롯 밖 「${bad}」`); continue; }
    if (bytes.length > FORM_EXT.text) { fail.push(`idx ${r.idx} ${bytes.length}B>${FORM_EXT.text}`); continue; }
    while (bytes.length < FORM_EXT.text) bytes.push(0x50);
    writes.push([off, bytes]);
    done += 1;
  }
  if (fail.length) throw new Error('진형 확장 사본 재작성 실패:\n  ' + fail.join('\n  '));
  console.log(`진형 확장 사본($5E:A047): ${done}/${formExtLedger.records.length} 재작성`);
}

if (nameTableRows.length) {
  const stat = new Map();
  const gateFail = [], overFail = [], slotFail = [];
  for (const r of nameTableRows) {
    const s = stat.get(r.t.name) || { done: 0, skip: 0 };
    stat.set(r.t.name, s);
    if (foldJp(decodeStock(r.off, r.t.size)) !== foldJp(r.jp)) {
      gateFail.push(`${r.t.name} ${r.off.toString(16)} 원장「${r.jp}」vs 롬「${decodeStock(r.off, r.t.size)}」`);
      s.skip += 1; continue;
    }
    const bytes = [];
    let noSlot = null;
    for (const ch of r.ko) {
      const a = assign.get(ch === ' ' ? '␣' : ch);
      if (!a) { noSlot = ch; break; }
      bytes.push(...a.bytes);
    }
    if (noSlot) { slotFail.push(`${r.t.name} 「${r.ko}」 슬롯 밖 「${noSlot}」`); s.skip += 1; continue; }
    if (bytes.length > r.t.size) { overFail.push(`${r.t.name} 「${r.ko}」 ${bytes.length}B>${r.t.size}`); s.skip += 1; continue; }
    while (bytes.length < r.t.size) bytes.push(0x50);
    writes.push([r.off, bytes]);
    s.done += 1;
  }
  console.log('밖-대사 이름 표: ' + [...stat.entries()].map(([k, v]) => `${k} ${v.done}/${v.done + v.skip}`).join(' · '));
  for (const [tag, list] of [['드리프트', gateFail], ['칸 초과', overFail], ['슬롯 밖', slotFail]]) {
    if (list.length) console.log(`  **${tag} ${list.length}**: ${list.slice(0, 6).join(' / ')}${list.length > 6 ? ' …' : ''}`);
  }
}

// 원장 토큰의 표기를 **표의 이름으로 맞춘다**.  표가 정본이라 화면에 나오는 건
// 표의 이름이다 — 원장이 「피드너」라 적었어도 롬은 「피드나」를 그린다.
// 안 맞추면 정적 검수가 제 그림자를 결함으로 신고한다(실측: 뱅크 3C 10행).
{
  let retag = 0; const shown = new Set();
  for (const r of rows) {
    if (!r.dictSeq || !r.tokens || r.dictSeq.length !== r.tokens.length) continue;
    let i = 0, changed = false;
    const next = r.text.replace(MACRE, (m, name) => {
      const d = r.dictSeq[i]; i += 1;
      // 인수가 곧 색인인 op 만 재맞춤한다.  3A 는 $EF00 을 거치므로 인수로는
      // 어느 슬롯이 나올지 정적으로 모른다 — 억지로 맞추면 거짓말이 된다.
      if (!d || !OP_INDEXED_DIRECT.has(d.op.toString(16))) return m;
      const plan = dictPlan.get(`${d.op.toString(16)}:${d.idx}`);
      if (!plan || plan.ko === name) return m;
      changed = true; shown.add(`${name}→${plan.ko}`);
      return `{M|${plan.ko}}`;
    });
    if (changed) { r.text = next; r.tokens = [...next.matchAll(MACRE)].map((x) => x[1]); retag += 1; }
  }
  if (retag) console.log(`표기 재맞춤 ${retag}행 — ${[...shown].join(' · ')}`);
}

// **쓰기 소유 경계** (2026-08-27) — 여기까지가 표·메뉴 패스, 그 뒤가 대사 행이다.
//   전투 메시지처럼 **두 원장이 같은 문장을 가진** 자리가 있어서 겹침이 생긴다
//   (「オーラムを手に入れた」「陣形を亂された！」 실측 50바이트).
//   그때는 **대사 행이 이긴다** — 문장 전체를 가진 쪽이 조각 라벨보다 낫다.
//   실행 순서에 기대지 않고 여기서 선언해 둔다. 이 경계를 벗어난 겹침은 결함이다.
const WRITES_TABLE_END = writes.length;

// ---- 자동 접힘 보상: 원문이 창 폭으로 접던 자리에 개행을 박는다 ----
//   원문 줄바꿈의 상당수는 스트림의 0x24 가 아니라 **창 폭 자동 접힘**이었다
//   (실측: 3C1FC0 뒤 틈은 0x2C 키대기뿐, 0x24 없음).  반칸은 같은 폭에 두 배가
//   들어가므로 그 자리에서 안 접히고 다음 행이 같은 줄에 붙는다 — 사용자 보고
//   「난 선금을 받아야만」이 앞줄 꼬리에 붙던 증상.
//   그래서 행 뒤 틈을 정식 워크(인수 길이표)해서 판정한다:
//     0x24 를 만나면            → 이미 개행 있음, 안 붙임
//     0x2A/0x29/0x4D 를 만나면  → 말풍선이 닫히거나 새로 열림, 안 붙임
//     그 외(0x2C 대기 등)뿐     → 우리가 0x24 를 붙인다
//   패딩은 개행 **앞**에 둔다(뒤에 두면 다음 줄 머리에 공백이 찍힌다).
const AC = JSON.parse(readFileSync(path.join(ROOT, 'rs3steam', 'rs3_wiki_op_argcounts_v1.json'), 'utf8'));
const argMain = AC.main00_4F, argSub = AC.sub4F;
const ENABLE_WRAP_NL = process.env.RS3_WRAPNL === '1';
const PAD4F = process.env.RS3_PAD4F === '1';
const flowMoveStats = [];                          // 빌더가 문안을 이웃 행으로 옮긴 자리
const sorted = rows.slice().sort((a, b) => a.s - b.s);
const BALLOON_OPS = new Set([0x2a, 0x29, 0x4d]);
for (let i = 0; i < sorted.length; i += 1) {
  const r = sorted[i], next = sorted[i + 1];
  r.needNL = false;
  if (!next || (next.s >> 16) !== (r.s >> 16)) continue;
  let a = r.tEnd, hasNL = false, newBalloon = false;
  while (a < next.s) {
    const b = rom[a];
    if (b === 0x24) { hasNL = true; break; }
    if (BALLOON_OPS.has(b)) { newBalloon = true; break; }
    if (b > 0x4f) break;                            // 글리프 — 워크 종료(판정 불가)
    if (b === 0x4f) { a += 2 + (argSub[rom[a + 1]] || 0); continue; }
    if (b === 0x49) { a += LEN49(rom[a + 1]); continue; }
    if (b === 0x0d) { a += LEN0D(rom[a + 1], rom[a + 2]); continue; }
    a += 1 + (argMain[b] || 0);
  }
  // **꺼 둔다 (사용자 지시, 2026-08-24)**: 이 규칙은 "행 뒤에 개행이 없으면
  // 원문이 폭에서 접힌 것"이라는 **추론**이고, 실제로는 접히지 않던 자리에도
  // 개행을 박아 **유령 줄**을 만든다(실측: 3C14DF 뒤 3C14F2 에 없던 0x24 가
  // 생겨 말풍선이 밀리고 앞줄이 화면 밖으로 나갔다).  접힘 여부는 창 폭과
  // 누적 칸 수로 판정해야 하는 값이라 지금 자료로는 못 정한다 — 미측정으로
  // 남기고 원문 구조를 그대로 둔다.
  r.needNL = ENABLE_WRAP_NL && !hasNL && !newBalloon;
}
console.log(`자동 접힘 보상 개행: ${sorted.filter((r) => r.needNL).length}행`);

// ---- 좁은 행 구제: 넘치는 음절을 **앞 행으로 넘긴다** ----
//   원장이 자른 자리가 원문 한 글자(2바이트)인데 한국어가 세 음절인 행이 있다
//   (「나간다」·「싸운다」).  글자를 잘라내면 뜻이 상하므로 **같은 줄에 붙어 있는
//   앞 행**으로 앞 음절을 넘긴다 — 화면에서는 이어져 보이므로 잃는 것이 없다.
//   조건: 같은 뱅크 · 사이에 원문 개행(0x24)이나 말풍선 제어가 없을 것 ·
//         앞 행이 워프 가능(구간 >=3바이트)해서 얼마든지 받을 수 있을 것.
{
  const costOf = (t) => {
    let n = 0, i = 0;
    while (i < t.length) {
      if (t.startsWith('{M|', i)) { const j = t.indexOf('}', i); if (j < 0) return Infinity; n += 2; i = j + 1; continue; }
      const ch = t[i];
      if (ch === String.fromCharCode(10) || ch === ' ') { n += 1; i += 1; continue; }
      const a2 = assign.get(ch);
      if (!a2) return Infinity;
      n += a2.bytes.length; i += 1;
    }
    return n;
  };
  // 넘기지 못하는 경계: 말풍선 여닫이(29/2A/4D)와 팔(4E).
  //   **개행(0x24)은 넘어도 된다** — 한국어는 낱말 중간에서 줄이 바뀌어도
  //   정상이다(일본어와 달리 음절 단위로 끊어 읽는다).  개행까지 막았더니
  //   줄 머리 조각이 통째로 일본어로 남았다.
  const BAL = new Set([0x29, 0x2a, 0x4d, 0x4e]);
  const ord2 = rows.slice().sort((x, y) => x.s - y.s);
  let movedRows = 0, movedChars = 0;
  for (let i = 1; i < ord2.length; i += 1) {
    const r = ord2[i], pv = ord2[i - 1];
    if ((r.s >> 16) !== (pv.s >> 16)) continue;
    if (!r.tight) continue;                          // 워프로 풀리는 행은 건드리지 않는다
    const capE = r.maxSeg;                          // 어절이 들어갈 수 있는 실제 칸
    if (!(capE > 0) || costOf(r.text) <= capE) continue;
    if (!(pv.maxRun >= 3)) continue;                 // 앞 행이 아레나로 못 넘긴다
    if (r.s < pv.e || r.s - pv.e > 64) continue;     // 붙어 있지 않다
    let broken = false;
    for (let k = pv.e; k < r.s; k += 1) if (BAL.has(rom[k])) broken = true;
    if (broken) continue;                            // 줄/말풍선이 바뀐다
    let n = 0;
    while (costOf(r.text) > capE && [...r.text].length > 1 && !r.text.startsWith('{M|')) {
      const ch = [...r.text][0];
      pv.text += ch;
      r.text = [...r.text].slice(1).join('');
      n += 1;
      if (n > 8) break;
    }
    if (n) {
      movedRows += 1; movedChars += n;
      flowMoveStats.push({ direction: 'to-previous', from: r.s.toString(16), to: pv.s.toString(16), count: n });
    }
  }
  // 앞 행이 못 받으면 **뒷 행**으로 넘긴다 — 줄 머리 조각은 이쪽이 자연스럽다.
  let fwdRows = 0, fwdChars = 0;
  for (let i = 0; i < ord2.length - 1; i += 1) {
    const r = ord2[i], nx = ord2[i + 1];
    if (!r.tight) continue;
    const capE = r.maxSeg;
    if (!(capE > 0) || costOf(r.text) <= capE) continue;
    if ((r.s >> 16) !== (nx.s >> 16)) continue;
    if (!(nx.maxRun >= 3)) continue;
    if (nx.s < r.e || nx.s - r.e > 64) continue;
    let broken = false;
    for (let k = r.e; k < nx.s; k += 1) if (BAL.has(rom[k])) broken = true;
    if (broken) continue;
    let n = 0;
    while (costOf(r.text) > capE && [...r.text].length > 1 && !r.text.endsWith('}')) {
      const cs = [...r.text];
      nx.text = cs[cs.length - 1] + nx.text;
      r.text = cs.slice(0, -1).join('');
      n += 1;
      if (n > 8) break;
    }
    if (n) {
      fwdRows += 1; fwdChars += n;
      flowMoveStats.push({ direction: 'to-next', from: r.s.toString(16), to: nx.s.toString(16), count: n });
    }
  }
  if (fwdRows) console.log(`  뒷 행으로 넘김: ${fwdRows}행 ${fwdChars}음절`);
  if (movedRows) console.log(`좁은 행 구제: ${movedRows}행에서 ${movedChars}음절을 앞 행으로 넘김`);
}

const RE_WS = new RegExp('[ ' + String.fromCharCode(10) + ']');
// ---- 행 인코드 ----
const ARENA_BANK_CPU = 0xe8, ARENA_FILE = 0x289000, ARENA_LIMIT = 0x28c800;
// **파일 뱅크 → CPU 뱅크** (BACK 캐리어의 뱅크 바이트가 이걸 쓴다).
//   ExHiROM 8MB 실측 대응 — `$C0:FF10`=파일 0x00FF10, `$FF:E1C0`=파일 0x3FE1C0,
//   `$00:FFC0`=파일 0x40FFC0, 대사 `$70:7190`=파일 0x707190:
//     파일 0x00..0x3F ↔ CPU $C0..$FF        파일 0x40..0x7D ↔ CPU $40..$7D(번호 그대로)
//     파일 0x7E..0x7F ↔ CPU $7E/$7F = WRAM  → 롬 뱅크가 아니다
//   전엔 `0xc0 + 파일뱅크` 하나였다.  율리안(파일 0x3C)만 다뤄서 안 드러났지만
//   파일 0x40 이상에서 0x100 을 넘어 **뱅크 바이트가 잘린다**(0x70 → 0x130 → 0x30).
//   전 뱅크 확대 전에 반드시 이 분기라야 한다.
const cpuBankOfFile = (fb) => {
  if (fb <= 0x3f) return 0xc0 + fb;
  if (fb <= 0x7d) return fb;
  throw new Error(`파일 뱅크 ${fb.toString(16)} 는 CPU 롬 뱅크가 아니다($7E/$7F=WRAM)`);
};
if (cpuBankOfFile(ARENA_FILE >> 16) !== ARENA_BANK_CPU) {
  throw new Error(`아레나 뱅크 불일치: 파일 ${(ARENA_FILE >> 16).toString(16)} → CPU ${cpuBankOfFile(ARENA_FILE >> 16).toString(16)}, 표기는 ${ARENA_BANK_CPU.toString(16)}`);
}

// ---- 아레나: **출발 뱅크마다 하나** ----
//   OUT 캐리어 [FE lo hi] 는 뱅크를 안 싣는다.  스텁이 `LDA $7A`(출발 뱅크)로
//   `$FF:E300,X` 를 찾아 아레나 뱅크를 얻으므로 **출발 뱅크별로 다른 아레나**를
//   줄 수 있다.  전엔 전 롬이 뱅크 0x28 하나(14KB)를 나눠 써서 전량 빌드에서
//   7,463행이 '아레나 초과'로 떨어졌다(실측).
//   풀은 롬 자유 런 실측(같은 바이트 0xFF/0x00 이 8KB 이상 이어지는 자리).
//   파일 0x7E/0x7F 는 CPU 에서 WRAM 이라 롬 뱅크가 아니다 — 넣지 않는다.
const ARENA_POOL = (() => {
  const out = [];
  for (let fb = 0; fb <= 0x7d; fb += 1) {          // 0x7E/0x7F 는 CPU 에서 WRAM
    const s0 = fb * 0x10000, e0 = s0 + 0x10000;
    let best = [0, 0], cur = -1, val = -1;
    for (let a = s0; a <= e0; a += 1) {
      const v = a < e0 ? rom[a] : -2;
      if (v === 0xff || v === 0x00) {
        if (cur < 0 || v !== val) { if (cur >= 0 && a - cur > best[1]) best = [cur, a - cur]; cur = a; val = v; }
      } else { if (cur >= 0 && a - cur > best[1]) best = [cur, a - cur]; cur = -1; val = -1; }
    }
    // 가장자리는 남겨 둔다(경계 데이터가 그 값과 겹칠 수 있다)
    if (best[1] >= 0x2000) out.push({ fb, lo: best[0] + 0x40, hi: best[0] + best[1] - 0x40 });
  }
  return out;
})();
console.log(`아레나 풀: 뱅크 ${ARENA_POOL.length}개 · ${(ARENA_POOL.reduce((n, p2) => n + p2.hi - p2.lo, 0) / 1024).toFixed(0)}KB`);

// 출발 뱅크를 **필요량 큰 순**으로, 풀을 **큰 순**으로 짝짓는다.
const needByBank = new Map();
for (const r of rows) {
  const fb = r.s >> 16;
  needByBank.set(fb, (needByBank.get(fb) || 0) + [...r.text].length * 2 + 8);
}
// **그림자 전역 트리거 표 전용 구역** — 최대 풀 구역 꼬리에서 예약(고정 베이스
//   이진 탐색을 위해 단일 연속 구역이어야 한다). 아레나 용량은 수요의 4배라 무해.
const SHADOW_TBL_RESERVE = 0xe800;                 // 58KB — 6B/항목 ≈ 9,900행 수용(전 머리 전환분)
const shadowTblRegion = (() => {
  if (process.env.RS3_SHADOW_FC !== '1') return null;
  if (process.env.RS3_FULLSHADOW !== '0') return null;   // 전면 그림자: 부표는 풀 할당 — 예약 불필요
  const p0 = ARENA_POOL.slice().sort((a, b) => (b.hi - b.lo) - (a.hi - a.lo))[0];
  const at = p0.hi - SHADOW_TBL_RESERVE;
  p0.hi = at;                                      // 아레나 몫 축소 — **정렬 전에** 깎아야 짝짓기가 옳다
  return { at, hi: at + SHADOW_TBL_RESERVE };
})();
const poolSorted = ARENA_POOL.slice().sort((a, b) => (b.hi - b.lo) - (a.hi - a.lo));
const arenaOf = new Map();                         // 출발 파일뱅크 → 풀 항목(객체 공유 가능)
const arenaCommitted = new Map();                  // 풀 객체 → 이미 잡아 둔 수요 합(예약 장부)
const arenaShared = [];
[...needByBank.entries()].sort((a, b) => b[1] - a[1]).forEach(([fb, need], i) => {
  const p = poolSorted[i];
  if (p) { const A = { ...p, cur: p.lo, frags: [] }; arenaOf.set(fb, A); arenaCommitted.set(A, need); return; }
  // **풀 소진 — 남는 공간이 가장 많은 구역을 나눠 쓴다.**  전엔 여기서 return 해
  //   그 뱅크가 통째로 워프 불가였다(뱅크 0x47·0x76 이 그래서 원문으로 남았다).
   //   캐리어 [FE lo hi] 는 뱅크를 안 싣고 스텁이 출발 뱅크로 `$FF:E300,X` 를 찾는데,
  //   그 표는 출발 뱅크마다 바이트 한 칸이라 여러 출발 뱅크가 같은 아레나 뱅크를
  //   가리켜도 무해하다.  **같은 객체**를 넣어 `cur` 커서를 공유해야 할당이 안 겹친다.
  let best = null, bestFree = -1;
  for (const [A, used] of arenaCommitted) {
    const free = (A.hi - A.lo) - used;
    if (free > bestFree) { bestFree = free; best = A; }
  }
  if (!best || bestFree < need) return;            // 정말로 자리가 없다 — 그 뱅크는 워프 불가
  arenaOf.set(fb, best);
  arenaCommitted.set(best, arenaCommitted.get(best) + need);
  arenaShared.push([fb, best.fb, need]);
});
if (arenaShared.length) {
  console.log(`아레나 나눠 쓰기 ${arenaShared.length}뱅크: ` + arenaShared.map(([fb, af, n]) => `${fb.toString(16)}→${af.toString(16)}(${n}B)`).join(' '));
}
const arenaFor = (srcFile) => arenaOf.get(srcFile >> 16) || null;
// 길이 n 을 그 출발 뱅크의 아레나에 잡는다.  못 잡으면 null.
// 아레나 할당을 **전부** 기록한다 — shadowRows 는 일부 경로에서만 쌓여(21,794 / 구운 행 24,201)
//   나머지 행의 문안이 다른 행의 블롭 안에 있는 것처럼 보인다. 그러면 실기 화면의 글자를
//   원본 행으로 되짚을 때 블롭 머리 행으로 뭉쳐진다(2026-09-04: 1바이트 행 3B3CC3 이 문장
//   전체의 주인처럼 보였다). [행 시작, 아레나 주소, 길이] 를 남기면 구간이 정확해진다.
const arenaRows = [];
const adaptiveOwnership = JSON.parse(readFileSync(path.join(PROJECT,'runtime','adaptive_newline_ownership_v1.json'),'utf8'));
const keepTailBreakSources = JSON.parse(readFileSync(path.join(PROJECT,'runtime','row_text_fix_flags_v1.json'),'utf8')).rows.filter((e) => e.hardNewlines === true).map((e) => parseInt(e.at, 16));
const adaptivePlanner = createAdaptivePadding(rom, { enabled: process.env.RS3_ADAPTIVE_PADDING !== '0', ownership: adaptiveOwnership.rows, keepTailBreakSources });
// ---- native end16 관문 (2026-09-15) ----
//   활성 이벤트의 종료 sentinel(하위 16비트)을 아레나/문맥 payload 의 어떤 바이트도 밟지 않게 잡는다.
//   후보의 nativeBoundaryArenaRepair(주소별 재배치 receipt)를 정식 할당 규칙으로 대체한다. RS3_END16_GUARD=0 이면 끔(진단 전용).
const end16OwnershipRel = 'runtime/native_end16_context_ownership_v1.json';
const end16Guard = createNativeEnd16Guard({ rom, ownership: JSON.parse(readFileSync(path.join(PROJECT, end16OwnershipRel), 'utf8')), enabled: process.env.RS3_END16_GUARD !== '0', ownershipPath: end16OwnershipRel });
console.log(`native end16 관문: ${end16Guard.enabled ? '켜짐' : '꺼짐(RS3_END16_GUARD=0)'} · 주소 소속 범위 ${end16Guard.home.ranges.length}(감김 ${end16Guard.home.wrapped}·빈 ${end16Guard.home.empty})`);
const arenaAlloc = (srcFile, n, blob = null, sourceEntry = srcFile) => {
  if (blob) { adaptivePlanner.prepare(sourceEntry, blob); n = blob.length; }
  const A = arenaFor(srcFile);
  if (!A) return null;
  const at = end16Guard.allocate(A, blob ? srcFile : null, n);   // native end16 관문: 커서가 지나는 blob 만(그림자 부표는 규칙 밖)
  if (at === null) return null;
  arenaRows.push([srcFile, at, n]);
  return at;
};
const gates = [];                                  // 게이트 구간(파일 오프셋)
let inline = 0, warped = 0, skipped = [];
const armDiag = [];                                // '자리 부족' 행의 구간 모양(진단)
const trimStats = [];                              // 문장부호를 깎은 행
let spaceDropped = 0;                              // 자리가 없어 뺀 어절 앞 공백
let rewrap = 0;                                    // 평문 이름을 매크로로 다시 감싼 행
let drop39 = 0;
const drop39Rows = [];                                    // 39(파티 슬롯)를 덮어 이름이 빠진 행
const cutStats = [];                               // 마지막 수단으로 음절을 깎은 행
// 한국어를 토큰(글리프 코드 · 매크로 호출 · 공백 · 개행)으로 — 쪼개지면 안 된다
const tokenize = (text, macros) => {
  const parts = text.split(MACRE);
  const toks = []; let ok = true, mi = 0;
  for (let i = 0; i < parts.length; i += 1) {
    if (i % 2 === 1) {
      if (!macros[mi]) { ok = false; break; }
      toks.push(macros[mi].bytes.slice()); mi += 1; continue;
    }
    for (const ch of parts[i]) {
      if (ch === '\n') { toks.push([0x24]); continue; }
      if (ch === '\f') { toks.push([0x2c]); continue; }
      if (ch === ' ') { toks.push([0x50]); continue; }
      const a = assign.get(ch);
      if (!a) { ok = false; break; }
      toks.push(a.bytes.slice());
    }
    if (!ok) break;
  }
  return ok ? toks : null;
};
// ---- 팔 조각별 한국어 (조각의 **제 일본어**에서 옮긴 것) ----
//   팔은 조각마다 다른 문장을 갖는다.  원장의 한국어는 행 하나뿐이라 양쪽에
//   같은 걸 넣으면 실행되는 쪽이 원문과 달라진다(실측: 원문은 「トム」인데
//   우리가 「토마스」를 넣어 다르게 나왔다).  그래서 조각별로 그 조각의
//   일본어를 옮겨 적는다 — 아래 출처는 전부 롬 바이트 디코드다.
//   조각 = 쓸 수 있는 구간을 스킵 경계(4E)로 다시 자른 것, 주소 순.
//   **2026-08-28 — 여기 있던 셋(3c1b8f · 3c20df · 3c2264)은 걷어냈다.**
//   그 자리는 이제 원장이 스스로 조각마다 행을 갖는다(split_row_at_address_v1 로
//   4E 착지에서 쪼갬). 하드코딩을 남겨 두면 「조각 수 불일치 (롬 1 vs 저작 3)」로
//   머리 조각이 통째로 버려진다 — 실측으로 그렇게 됐다. 원장이 정본이다.
//   남은 0x3c22a8 은 아직 원장이 한 행이라 여기가 필요하다.
const ARM_TEXT = {
  0x3c22a8: ['{M|토마스}', ','],                 // {토마스} / 、
};
// **0x4F 는 칸을 안 먹는 1바이트 무동작이다 (2026-08-24 실측)**
//   대사 VM 점프표($C0:3B36)에서 0x4F 만 핸들러가 `JMP $1C7A`(제 바이트만 먹고
//   다음으로)다.  화면으로도 확인: 4F 로 채운 자리는 칸을 전혀 안 먹는다.
//   커뮤니티 도구가 `4F xx` 로 적던 것도 실은 4F 를 엔진이 그냥 넘기고 xx 가
//   진짜 명령이었던 것.  → **남는 자리는 4F 로 채운다**(0x50 은 진짜 빈칸이라
//   칸을 먹어 접힘을 부른다).  워프는 텍스트가 예산을 **넘칠 때만** 쓴다.
//   **단 4F 는 2바이트를 먹는다** — 디스패처($C0:1C8F)가 `INC $78` 뒤에 읽고,
//   핸들러(1C8C→1C7A)가 또 `INC $78` 한다.  그래서 홀수 개로 채우면 마지막
//   4F 가 **뒤 제어를 삼킨다**(실측: 5개로 채웠더니 개행 0x24 가 먹혀 다음
//   행이 앞줄에 붙었다 — 「몬스터가안 오는」).  커뮤니티 도구의 `4F xx` 표기가
//   바로 이 성질이다.  → 패딩은 **짝수 개**로, 홀수면 반칸 하나(0x50)를 먼저.
const PAD = 0x4f;
// **패딩 런의 마지막 바이트는 항상 FD** (2026-08-26 실측 수리) — mes 표 진입점이
//   패딩 런 한가운데에 떨어지는 자리가 있다(0x000C 항목이 0x3A0948 로 직접 진입,
//   run 시작과 짝이 어긋남).  4F 는 2바이트를 먹으므로 진입 짝에 따라 마지막
//   4F 가 런 밖 실바이트(개행 등)를 삼킨다.  꼬리가 FD 면 어느 짝으로 걸어도
//   마지막 4F 는 기껏해야 FD 를 먹고 경계에서 끝난다 — 진입 짝 불변.
const padTo = (buf, n) => {
  const left = n - buf.length;
  if (left <= 0) return buf;
  if (process.env.RS3_OLDPAD === '1') {             // 이분용: 옛 패딩(선두 FD + 4F 짝)
    if (left % 2 === 1) buf.push(0xfd);
    while (buf.length < n) buf.push(PAD);
    return buf;
  }
  if (left % 2 === 0 && left >= 2) buf.push(0xfd);  // 4F 짝수 유지용 선두 FD
  while (buf.length < n - 1) buf.push(PAD);
  buf.push(0xfd);                                   // 꼬리 FD — 진입 짝 무관 안전
  return buf;
};
// 아레나 블롭 선두 바이트 조회(writes 에서 역참조 — 매크로 머리 그림자 판정용)
const arenaBytesOf = (at0, n0) => {
  for (let i2 = writes.length - 1; i2 >= 0; i2 -= 1) {
    const [wAt, wB] = writes[i2];
    if (wAt === at0) return wB.slice(0, n0);
  }
  return [];
};
let armFixed = 0;
let asIs = 0;
const fragCut = [];                                // 조각을 깎은 자리                                      // 원문 매크로를 그대로 둔 행
// 조각별 저작용: 한국어 이름 → 매크로 바이트 (조각마다 순서가 달라 위치로는 못 푼다)
const macroByName = new Map();
for (const [key, d] of dictPlan) {
  const [op, ix] = key.split(':');
  if (!macroByName.has(d.ko)) macroByName.set(d.ko, [parseInt(op, 16), parseInt(ix, 10)]);
}
// 행 앞 구간 워크용: 주소 순 이전 행의 끝
const prevEndOf = new Map();
{
  const byAddr = rows.slice().sort((a, b) => a.s - b.s);
  for (let i = 1; i < byAddr.length; i += 1) {
    if ((byAddr[i].s >> 16) === (byAddr[i - 1].s >> 16)) prevEndOf.set(byAddr[i].s, byAddr[i - 1].e);
  }
}
for (const r of rows) {
  // 2026-09-17 발화 컴파일러 v2i 제자리→직접 전환: 행 글은 발화 payload 가 대신하므로 굽지 않고 머리에 FE 자리만 둔다.
  //   피연산자는 아래 발화 payload 직접 행 단계가 payload(넓은 배치면 발판) 주소로 채운다. 스팬 3바이트 미만·훅 못 거는 머리면 멈춘다.
  if (UTTERANCE_CONVERT_ROWS.has(r.s)) {
    if (r.e - r.s < 3 || !HOOKABLE(rom[r.s]) || r.suppress) throw new Error(`발화 payload 제자리→직접 전환 행 ${r.s.toString(16)} 조건 불충족(스팬 ${r.e - r.s}·머리 ${rom[r.s].toString(16)})`);
    if (rows.some((q) => q !== r && q.mode && q.s < r.e && r.s < Math.max(q.e, q.s + 1))) throw new Error(`발화 payload 제자리→직접 전환 행 ${r.s.toString(16)} 이 이미 구운 행과 겹친다`);
    writes.push([r.s, [0xfe, 0x00, 0x00]]);
    gates.push([r.s, r.e]);
    r.mode = 'utterance-convert'; r.runs = [];
    continue;
  }
  // 다른 행으로 합친 본문을 원문 자리에서 조용히 소비한다.  공백만 넣어
  // 숨기면 한 칸을 먹거나 끝 공백이 증발하므로, 그림자 BACK으로만 되돌린다.
  if (r.suppress) {
    if (!(FULLSHADOW && shadowableAt(r.s) && HOOKABLE(rom[r.s]) && !seenTrig.has(r.s))) {
      skipped.push([r.s, '본문 흡수 그림자 조건 불충족']); continue;
    }
    const blobS = [0xff, r.back & 0xff, (r.back >> 8) & 0xff, cpuBankOfFile(r.s >> 16)];
    const atS = arenaAlloc(r.s, blobS.length, blobS);
    if (atS === null) { skipped.push([r.s, '본문 흡수 아레나 초과']); continue; }
    writes.push([atS, blobS]);
    shadowRows.push([r.s, atS, r.back & 0xffff]); seenTrig.add(r.s);
    gates.push([r.s, r.back]);
    r.mode = 'suppress'; r.runs = [];
    continue;
  }
  let done = false;
  // ---- 기본 경로 은퇴 (2026-08-24) ----
  //   단순판은 0x24 를 **텍스트로 먹어** 원문 개행을 덮어썼다(실측: 3C14B4 의
  //   개행이 사라져 「몬스터가안 오는」처럼 붙었다).  이제 모든 행이 스팬
  //   워크를 타고 — 개행은 제어라 제자리를 지키고, 남는 자리는 0x4F 로 채운다.
  do {
    break;
    if (r.macros.length !== (r.tokens || []).length) break;
    if (r.tokens.length && r.tokens.some((t, i) => !dictPlan.has(`${r.macros[i].op.toString(16)}:${r.macros[i].idx}`))) break;
    const body0 = tokenize(r.text, r.macros);
    if (!body0) break;
    const body = [].concat(...body0);
    const budget = r.tEnd - r.s;
    if (budget < 1) break;
    // **남는 바이트를 공백으로 채우면 안 된다** — 0x50 은 진짜 빈칸이라 칸을
    // 먹고, 그 칸들이 창 폭에 닿아 자동 접힘을 일으킨다.  원문 개행까지 겹치면
    // 가운데 빈 줄이 생긴다(사용자 보고: 「왜 번개가 치면 몬스터가」 뒤 빈 줄).
    // 그래서 딱 맞을 때만 제자리, 남으면 **워프로 건너뛴다**(남는 바이트는
    // 커서가 뛰어넘어 아예 안 읽힌다 — 칸을 안 먹는다).
    if (body.length === budget) {
      writes.push([r.s, body.slice()]);
      gates.push([r.s, r.tEnd]);
      inline += 1; r.mode = 'inline'; done = true; break;
    }
    // RS3_PAD4F=1 — 남는 자리를 **0x4F** 로 채워 본다.  대사 VM 점프표에서
    // 0x4F 만 핸들러가 JMP $1C7A(제 바이트만 먹고 다음으로)라 칸을 안 먹을
    // 후보다.  실측 전엔 기본 꺼둔다(워프가 이미 되는 길이므로).
    if (PAD4F && body.length < budget) {
      const buf = body.slice();
      while (buf.length < budget) buf.push(0x4f);
      writes.push([r.s, buf]);
      gates.push([r.s, r.tEnd]);
      inline += 1; r.mode = 'inline'; done = true; break;
    }
    if (budget < 3) {
      if (body.length > budget) break;
      const buf = body.slice();
      padTo(buf, budget);                           // 2바이트 이하는 워프 불가
      writes.push([r.s, buf]);
      gates.push([r.s, r.tEnd]);
      inline += 1; r.mode = 'inline'; done = true; break;
    }
    const blob = [...body, 0xff, r.tEnd & 0xff, (r.tEnd >> 8) & 0xff, cpuBankOfFile(r.s >> 16)];
    const at = arenaAlloc(r.s, blob.length, blob);
    if (at === null) break;
    const target = at & 0xffff;
    writes.push([at, blob]);
    if (shadowable(r)) {                             // 그림자: 제자리 원문 보존, 발동은 표
      shadowRows.push([r.s, at, r.tEnd & 0xffff]);
      gates.push([r.s, r.tEnd]);
      r.mode = 'shadow'; r.arena = at;
      warped += 1; done = true; break;
    }
    const inplace = [0xfe, target & 0xff, (target >> 8) & 0xff];
    while (inplace.length < budget) inplace.push(0x50);
    writes.push([r.s, inplace]);
    gates.push([r.s, r.tEnd]);
    r.mode = 'warp'; r.arena = at;
    warped += 1; done = true;
  } while (false);
  if (done) continue;

  // ---- 폴백: 팔이 낀 행 — 스팬 전체의 쓸 수 있는 구간에 어절 단위로 흘린다 ----
  const full = parseSpanFull(r.s, r.e);
  // 행을 삼키는 팔은 **행 밖**에 있을 수 있다(실측 3C20DF: `4E 04`가 20DD).
  // 앞 행 끝부터 이 행 머리까지 정식 워크해서 그런 팔의 스킵 구간도 모은다.
  {
    const prevEnd = prevEndOf.get(r.s);
    if (prevEnd !== undefined && r.s - prevEnd <= 64) {
      let a = prevEnd;
      while (a < r.s) {
        const b2 = rom[a];
        if (b2 === 0x4e) { full.skips.push([a + 2, a + 2 + rom[a + 1]]); a += 2; continue; }
        if (b2 > 0x4f) { a += (tblPrefixes.has(b2) ? 2 : 1); continue; }
        const n2 = (b2 === 0x4f) ? (2 + (argSub0[rom[a + 1]] || 0)) : (b2 === 0x49 ? LEN49(rom[a + 1]) : (b2 === 0x0d ? LEN0D(rom[a + 1], rom[a + 2]) : (1 + (argMain0[b2] || 0))));
        if (n2 <= 0) break;
        a += n2;
      }
    }
  }
  let seq = full.macros;
  if (seq.length !== r.tokens.length) {              // 팔마다 같은 이름 호출 → 접는다
    const seen = new Set(), dedup = [];
    for (const m of seq) { const k = `${m.op}:${m.idx}`; if (!seen.has(k)) { seen.add(k); dedup.push(m); } }
    if (dedup.length === r.tokens.length) seq = dedup;
  }
  if (seq.length !== r.tokens.length) {
    // **원장이 이름을 평문으로 적은 행**: 한국어에 {M} 토큰이 하나도 없다.
    //   (「서브맵 육에프가 어디 있는지,」 처럼 번역자가 이름을 글로 풀어 썼다.)
    //   이때는 매크로 호출 바이트를 우리 글자로 덮어써도 된다 — 이름이 이미
    //   글 안에 들어 있기 때문이다.  단 **39(파티 슬롯)는 예외**다: 동적 이름을
    //   덮으면 다른 루트에서 거짓말이 된다([[rs3-member-token-must-stay-nameless]]).
    // **평문으로 적힌 이름을 다시 매크로로 감싼다.**  사전이 정본이므로 감싸
    //   두는 편이 낫다 — 표기가 한 곳에서 관리되고 색인이 바뀌어도 따라간다.
    //   조건은 빡빡하게: 사전 표기와 **글자 그대로** 같고 **순서까지** 맞을 것.
    //   (「야머스」인데 원장이 「야마스」라 적었으면 감싸지 않는다 — 엉뚱한
    //   매크로에 다른 이름을 붙이면 화면이 거짓말한다.)
    if (r.tokens.length === 0 && seq.length && seq.every((m) => m.op !== 0x39)) {
      let t2 = r.text, cur = 0, okAll = true;
      for (const m of seq) {
        const nm = dictPlan.get(`${m.op.toString(16)}:${m.idx}`)?.ko;
        if (!nm) { okAll = false; break; }
        const at2 = t2.indexOf(nm, cur);
        if (at2 < 0) { okAll = false; break; }
        t2 = t2.slice(0, at2) + `{M|${nm}}` + t2.slice(at2 + nm.length);
        cur = at2 + nm.length + 4;
      }
      if (okAll) {
        r.text = t2; r.tokens = [...t2.matchAll(MACRE)].map((x) => x[1]);
        rewrap += 1;
      }
    }
    if (r.tokens.length === 0) {
      // 39(파티 슬롯)가 껴 있으면 그 **이름이 화면에서 빠진다**.  거짓 이름을
      // 박는 게 아니라 안 그리는 것이라 다른 루트를 속이진 않는다
      //   ([[rs3-member-token-must-stay-nameless]] 는 "박지 마라"이지 "빼지 마라"가 아니다).
      //   행이 통째로 일본어로 남는 것보다 낫다(사용자 지시 2026-08-25).
      if (seq.some((m) => m.op === 0x39)) { drop39 += 1; drop39Rows.push([r.s.toString(16), r.text]); }
      seq = [];
    } else if (seq.length !== r.tokens.length) {
      // 되감기로 수가 맞았으면 그냥 정상 경로로 간다
      skipped.push([r.s, '매크로 수 불일치']); continue;
    }
  }
  // 39(파티 슬롯)는 사전 항목이 없다 — 엔진이 동료 이름을 직접 그린다.
  // 사전에 없다고 행을 버리면 {PC} 낀 행이 통째로 일본어로 남는다.
  if (r.tokens.some((t, i) => seq[i].op !== 0x39 && !dictPlan.has(`${seq[i].op.toString(16)}:${seq[i].idx}`))) {
    skipped.push([r.s, '사전 미판별']); continue;
  }
  // **자리가 모자라면 문장부호부터 버린다** (사용자 지시 2026-08-25: 어떻게든 넣어라).
  //   워프 캐리어 [FE lo hi]는 3바이트다.  구간이 전부 3바이트 미만인 행은
  //   제자리에 다 넣는 수밖에 없으므로, 뜻을 가장 덜 다치는 것부터 깎는다:
  //   ① 끝 문장부호(「르라.」→「르라」)  ② 앞 공백(아래 패킹에서)
  //   그래도 안 들어가면 그 행은 포기한다 — 어절을 잘라내진 않는다.
  // **그림자 가능 행은 깎지 않는다** (2026-08-26): 트리거+아레나가 전문을 든다.
  //   이 게이트가 없어서 「으로→으」「싫다→싫」 등 268행이 불필요하게 잘렸다.
  if (full.runs.length && !full.runs.some((x) => x.n >= 3)
      && !(FULLSHADOW && (shadowableAt(r.s) || SHADOW_DIRECT_WARP_ROWS.has(r.s))
        && HOOKABLE(rom[r.s]))) {
    const cap = full.runs.reduce((n, x) => n + x.n, 0);
    const need = (t) => { const tk = tokenize(t, seq); return tk ? tk.reduce((n, x) => n + x.length, 0) : Infinity; };
    // **어절 하나는 조각(4E 경계로 자른 칸)보다 클 수 없다** — 반쪽만 실행되면
    //   글자가 깨지기 때문이다.  총량만 보면 「거야」(2B)가 2바이트 구간에
    //   드는 것처럼 보이지만, 한가운데를 경계가 지나면 실효 칸은 1바이트다.
    const wordBytes = (w) => {
      let n2 = 0, i2 = 0;
      while (i2 < w.length) {
        if (w.startsWith('{M|', i2)) { const j = w.indexOf('}', i2); if (j < 0) return Infinity; n2 += 2; i2 = j + 1; continue; }
        const a2 = assign.get(w[i2]); if (!a2) return Infinity; n2 += a2.bytes.length; i2 += 1;
      }
      return n2;
    };
    // 조각은 **이 자리의 full.skips 로** 다시 잰다.  빈도 루프에서 잰 값과
    // 어긋난 적이 있어(451E9D: 저기선 2, 여기선 1) 판정이 헛돌았다.
    const segsHere = [];
    {
      const bdH = new Set();
      for (const [lo, hi] of full.skips) { bdH.add(lo); bdH.add(hi); }
      for (const run of full.runs) {
        let st = run.a;
        for (let k = run.a + 1; k < run.a + run.n; k += 1) if (bdH.has(k)) { segsHere.push(k - st); st = k; }
        segsHere.push(run.a + run.n - st);
      }
    }
    const maxSegHere = segsHere.length ? Math.max(...segsHere) : 0;
    const fits = (t) => need(t) <= cap
      && t.split(RE_WS).every((w) => !w || wordBytes(w) <= maxSegHere);
    let trimmed = 0;
    while (!fits(r.text) && /[.,!?;:~…]$/.test(r.text)) { r.text = r.text.slice(0, -1); trimmed += 1; }
    // **마지막 수단: 끝 음절을 깎는다** (사용자 지시 2026-08-25 "어떻게든 집어넣어").
    //   여기까지 왔다는 건 이웃으로도 못 넘겼다는 뜻이다.  그냥 두면 그 행은
    //   일본어 바이트로 남는데, 글리프를 덮었으므로 화면엔 **엉뚱한 한글**이 뜬다.
    //   음절 하나 잃는 쪽이 낫다.  매크로는 못 쪼개므로 건드리지 않는다.
    let cut = 0;
    while (!fits(r.text) && [...r.text].length > 1 && !r.text.endsWith('}')) {
      r.text = [...r.text].slice(0, -1).join(''); cut += 1;
      if (cut > 6) break;
    }
    if (cut) cutStats.push([r.s, cut, r.text]);
    if (trimmed) trimStats.push([r.s, trimmed]);
  }
  const toks = tokenize(r.text, seq);
  if (!toks) { skipped.push([r.s, '배정 없는 글자']); continue; }
  if (!full.runs.length) { skipped.push([r.s, '쓸 자리 없음']); continue; }
  if (FORCED_NEWLINE_ARENA_ROWS.has(r.s) || UTTERANCE_FORCE_SHADOW_ROWS.has(r.s)) {
    const directForced = SHADOW_DIRECT_WARP_ROWS.has(r.s) && !UTTERANCE_FORCE_SHADOW_ROWS.has(r.s);
    if (!(FULLSHADOW && (shadowableAt(r.s) || directForced) && HOOKABLE(rom[r.s]) && !seenTrig.has(r.s))) {
      skipped.push([r.s, '강제 개행 아레나 조건 불충족']); continue;
    }
    const backS = r.back;
    const blobS = [...toks.flat(), 0xff, backS & 0xff, (backS >> 8) & 0xff, cpuBankOfFile(r.s >> 16)];
    const atS = arenaAlloc(r.s, blobS.length, blobS);
    if (atS === null) { skipped.push([r.s, '강제 개행 아레나 초과']); continue; }
    writes.push([atS, blobS]);
    // 2026-09-07 실기 근거: FE 직접 워프는 `FE lo hi` 3바이트다. 스판이 그보다
    //   짧으면 세 번째 바이트가 **다음 행 머리를 덮어** 그 행의 훅이 영영 안 뜬다
    //   (0x0E71 4544EC 스판 2바이트 → 4544EE 머리가 0x61→0x3D, 화면에 괴문자.
    //    자연 발동 트레이스로 45:44EE→45:44F1 확인, 6F:3DDF 로 안 뜀).
    //   이 경우엔 직접 워프를 포기하고 그림자 행으로 되돌린다 — 머리가 HOOKABLE
    //   인 것은 위에서 이미 확인했으므로 표 발동이 성립한다.
    const directFits = directForced && (r.e - r.s) >= 3;
    if (directForced && !directFits) shortDirectWarpRows.push([r.s, r.e - r.s]);
    if (directFits) {
      // 그림자 표를 건너뛴다고 실증된 머리는 소스에 FE를 직접 심는다.
      // 스판 전체는 아레나에서 그린 뒤 backS로 복귀하므로, 중간의
      // 1바이트 조사를 따로 FE로 덮으려다 깨지던 문제도 피한다.
      const existingCarrier=EXISTING_DIRECT_CARRIERS.get(r.s);
      if(existingCarrier&&(existingCarrier.back!==backS||r.e!==backS))throw new Error(`existing direct BACK changed: ${r.s.toString(16)}`);
      writes.push([r.s, [0xfe, atS & 0xff, (atS >> 8) & 0xff,...(existingCarrier?.tail||[])]]);
      r.mode = 'forced-newline-direct-arena'; r.arena = atS;
    } else {
      shadowRows.push([r.s, atS, backS & 0xffff]); seenTrig.add(r.s);
      r.mode = 'forced-newline-arena';
    }
    gates.push([r.s, r.back]);
    r.runs = full.runs; armFixed += 1;
    continue;
  }
  // 우리 개행 토큰은 **공백으로 바꾼다** — 줄은 원문 0x24(제어)가 그대로
  // 나누되, 원장이 줄을 나눴던 자리는 어절 경계이므로 공백은 살려야 한다
  // (그냥 버렸더니 「전통이라남자는」처럼 붙었다 — 실측).
  const flat = toks.map((t) => (t.length === 1 && t[0] === 0x24 ? [0x50] : t));
  // 어절 묶음: [선행 공백?] + 낱말.  구간 경계에서 낱말이 쪼개지지 않게 한다
  // 어절 묶기는 **글자에서** 한다(바이트로는 문장부호를 못 가른다).
  //   · 매크로 호출은 제 몫의 어절 — 뒤 부호와 묶으면 2바이트 조각에 못 들어감
  //   · **문장부호도 제 몫** — 「,나도」로 묶었더니 쉼표가 앞줄(원문 자리)에
  //     못 들어가고 통째로 다음 줄로 내려갔다(실측 3C2101: 원문은
  //     `[언니][、][개행][나도 갈래]` 인데 우리는 쉼표를 뒤로 밀었다)
  const PUNCT = new Set([',', '.', '!', '?', ';', ':', '·', '…', '~']);
  const words = [];
  {
    const parts2 = r.text.split(/(\{M\|[^}]*\})/);
    let lead = false, mi2 = 0, bad2 = false, nlNext = false;
    const pushWord = (bytes) => { words.push({ lead, nl: nlNext, bytes }); lead = false; nlNext = false; };
    for (const part of parts2) {
      if (!part) continue;
      if (/^\{M\|[^}]*\}$/.test(part)) {
        if (!seq[mi2]) { bad2 = true; break; }
        pushWord(seq[mi2].bytes.slice()); mi2 += 1; continue;
      }
      let acc = [];
      for (const ch of part) {
        if (ch === ' ' || ch === '\n') {              // 개행도 어절 경계(공백 취급)
          if (acc.length) { pushWord(acc); acc = []; }
          lead = true;
          // 저작 개행 옵트인(hardNewlines): 다음 어절 앞 경계를 실제 0x24로 방출
          //   (2026-09-02 도난 장면 — NOWARP 제자리 행의 아이템명 절단·행 붙음 처방.
          //    전 롬 기본은 종전대로 공백 취급 — 행이 명시했을 때만.)
          if (ch === '\n' && r.hardNewlines === true) nlNext = true;
          continue;
        }
        if (PUNCT.has(ch)) {
          if (acc.length) { pushWord(acc); acc = []; }
          const a4 = assign.get(ch);
          if (!a4) { bad2 = true; break; }
          pushWord(a4.bytes.slice()); continue;
        }
        const a4 = assign.get(ch);
        if (!a4) { bad2 = true; break; }
        acc.push(...a4.bytes);
      }
      if (bad2) break;
      if (acc.length) pushWord(acc);
    }
    if (bad2) { skipped.push([r.s, '배정 없는 글자']); continue; }
    // 행 끝 저작 개행(hardNewlines): 위 루프는 개행을 「다음 어절 앞 0x24」로만 방출해서, 문안이 개행으로 끝나면
    //   뒤 어절이 없어 조용히 버려졌다(2026-09-15 v10 실측: 705A23·710417·7BDCDB·3B33A9 — 선택지 항목 경계가
    //   사라져 「습격당하고 있어....구하자」「이걸로 전력 상승이다!몫이 줄어드/는 건 싫다」). 빈 어절로 0x24 만 낸다.
    if (nlNext && r.hardNewlines === true) words.push({ lead: false, nl: true, bytes: [] });
    if (lead && r.preserveTrailingSpace === true) {
      words.push({ lead: false, nl: false, bytes: [0x50] });
    }
  }
  // 스킵 경계(4E 가 건너뛰는 자리)에 토큰이 걸치지 않게 — 걸치면 팔이 글자를
  // 반쪽만 지운다.  경계에 닿으면 공백으로 메워 정렬한다.
  const bounds = new Set();
  for (const [lo, hi] of full.skips) { bounds.add(lo); bounds.add(hi); }
  // 구간 사이에 원문 개행이 있으면 줄이 바뀐 것 — 그 자리에선 어절 공백을
  // 넣지 않는다.  개행이 없으면 같은 줄이라 공백을 꼭 살려야 한다(안 살리면
  // 「율리안노르다.」처럼 붙는다 — 실측).
  const nlBefore = full.runs.map((run, ri) => {
    if (ri === 0) return true;                       // 첫 구간은 줄 머리 취급
    const prev = full.runs[ri - 1];
    for (let k = prev.a + prev.n; k < run.a; k += 1) if (rom[k] === 0x24) return true;
    return false;
  });
  // ---- 조각별 저작이 있는 행: 구간을 스킵 경계로 다시 자르고 하나씩 채운다 ----
  if (ARM_TEXT[r.s]) {
    const cuts = new Set();
    for (const [lo, hi] of full.skips) { cuts.add(lo); cuts.add(hi); }
    const regions = [];
    for (const run of full.runs) {
      let a2 = run.a;
      const inner = [...cuts].filter((c) => c > run.a && c < run.a + run.n).sort((x, y) => x - y);
      for (const c of inner) { regions.push({ a: a2, n: c - a2 }); a2 = c; }
      regions.push({ a: a2, n: run.a + run.n - a2 });
    }
    const texts = ARM_TEXT[r.s];
    if (regions.length !== texts.length) {
      skipped.push([r.s, `조각 수 불일치 (롬 ${regions.length} vs 저작 ${texts.length})`]); continue;
    }
    let bad = null;
    const plan = [];
    regions.forEach((reg, ri) => {
      // 조각별 저작은 매크로를 **이름으로** 푼다(조각마다 순서가 달라 위치로는 못 푼다)
      // 조각이 넘치면 **끝 문장부호부터, 그다음 끝 음절**을 깎는다 —
      //   손으로 박아 둔 조각 저작이라 원장을 못 고친다(사용자 지시: 어떻게든 넣어라).
      const encFrag = (t) => {
        const out2 = []; let fine = true;
        for (const part of t.split(/(\{M\|[^}]*\})/)) {
          if (!part) continue;
          const m3 = part.match(/^\{M\|([^}]*)\}$/);
          if (m3) { const mb2 = macroByName.get(m3[1]); if (!mb2) { fine = false; break; } out2.push(...mb2); continue; }
          for (const ch of part) {
            if (ch === ' ') { out2.push(0x50); continue; }
            // 저작 개행: NOWARP 제자리 대역에서도 원장 \n 을 실 개행 바이트로 굽는다
            //   (2026-09-02 도난 장면 — 아이템명 중간 절단·행 붙음의 유일한 처방)
            if (ch === '\n') { out2.push(0x24); continue; }
            const a4 = assign.get(ch);
            if (!a4) { fine = false; break; }
            out2.push(...a4.bytes);
          }
          if (!fine) break;
        }
        return fine ? out2 : null;
      };
      {
        let cur2 = encFrag(texts[ri]);
        let n3 = 0;
        // 워프할 자리(3바이트)가 있으면 깎지 않는다 — 아레나에 전문을 둔다.
        // **그림자로 갈 조각도 깎지 않는다** (2026-08-26): 트리거+아레나는 예산
        //   무한인데 트림이 먼저 돌아 「으로」가 「로」로 깎였다(실측 3BA232).
        const canShadow2 = FULLSHADOW && shadowableAt(reg.a) && HOOKABLE(rom[reg.a]) && !seenTrig.has(reg.a);
        while (!canShadow2 && reg.n < 3 && cur2 && cur2.length > reg.n && [...texts[ri]].length > 1
               && !texts[ri].endsWith('}') && n3 < 8) {
          texts[ri] = [...texts[ri]].slice(0, -1).join('');
          cur2 = encFrag(texts[ri]); n3 += 1;
        }
        if (n3) fragCut.push([r.s, ri, n3, texts[ri]]);
      }
      const bytes = [];
      let ok2 = true;
      for (const part of texts[ri].split(/(\{M\|[^}]*\})/)) {
        if (!part) continue;
        const m2 = part.match(/^\{M\|([^}]*)\}$/);
        if (m2) {
          const mb = macroByName.get(m2[1]);
          if (!mb) { ok2 = false; break; }
          bytes.push(...mb); continue;
        }
        for (const ch of part) {
          if (ch === ' ') { bytes.push(0x50); continue; }
          const a3 = assign.get(ch);
          if (!a3) { ok2 = false; break; }
          bytes.push(...a3.bytes);
        }
        if (!ok2) break;
      }
      if (!ok2) { bad = `조각 ${ri} 배정/이름 미해결`; return; }
      if (FULLSHADOW && shadowableAt(reg.a) && HOOKABLE(rom[reg.a]) && !seenTrig.has(reg.a)) {
        // 조각 그림자: 제자리 무기록 — 길이 제약(넘침·홀수·2바이트 미만) 전부 소멸
        const backS = reg.a + reg.n;
        const blobS = [...bytes, 0xff, backS & 0xff, (backS >> 8) & 0xff, cpuBankOfFile(r.s >> 16)];
        const atS = arenaAlloc(r.s, blobS.length, blobS, reg.a);
        if (atS !== null) {
          writes.push([atS, blobS]);
          shadowRows.push([reg.a, atS, backS & 0xffff]); seenTrig.add(reg.a);
          gates.push([reg.a, reg.a + reg.n]);
          reg.warpTo = atS;
          if (blind33At(reg.a)) {
            // 33-사각 조각: 내부 리더용 제자리 사본 — 넘치면 글자를 깎는다
            let txt2 = texts[ri], ipb = encFrag(txt2), cut2 = 0;
            while (ipb && ipb.length > reg.n && [...txt2].length > 1 && cut2 < 12) {
              txt2 = [...txt2].slice(0, -1).join(''); ipb = encFrag(txt2); cut2 += 1;
            }
            if (ipb && ipb.length <= reg.n) {
              while (ipb.length < reg.n) ipb.push(0x50);
              writes.push([reg.a, ipb]);
              in33.frags += 1;
              if (cut2) in33.fragTrims.push([reg.a, cut2, txt2]);
            }
          }
          return;
        }
      }
      if (bytes.length > reg.n && reg.n < 3) { bad = `조각 ${ri} 넘침 (${bytes.length}>${reg.n})`; return; }
      if (bytes.length !== reg.n && reg.n >= 3 && (inNowarp(reg.a) || blind33At(reg.a))) {
        // NOWARP 대역·33 사각: 워프 금지 — 글자를 깎아서라도 제자리에 맞춘다
        //   (33 사각의 제자리 FE 는 내부 리더가 글리프 3개로 읽는다 — 실측 3행)
        let txtN = texts[ri], ipN = encFrag(txtN), cutN = 0;
        while (ipN && ipN.length > reg.n && [...txtN].length > 1 && cutN < 12) {
          txtN = [...txtN].slice(0, -1).join(''); ipN = encFrag(txtN); cutN += 1;
        }
        if (!ipN || ipN.length > reg.n) { bad = `조각 ${ri} NOWARP 넘침`; return; }
        while (ipN.length < reg.n) ipN.push(0x50);
        plan.push([reg.a, ipN]);
        if (cutN) fragCut.push([r.s, ri, cutN, txtN]);
        return;
      }
      if (bytes.length !== reg.n && reg.n >= 3) {
        // 조각도 남는 바이트를 공백으로 못 채운다(칸을 먹어 접힘을 부른다) —
        // 워프로 건너뛰고 본문은 아레나에 둔다
        const back2 = reg.a + reg.n;
        const blob2 = [...bytes, 0xff, back2 & 0xff, (back2 >> 8) & 0xff, cpuBankOfFile(r.s >> 16)];
        const at2 = arenaAlloc(r.s, blob2.length, blob2, reg.a);
        if (at2 === null) { bad = `조각 ${ri} 아레나 초과`; return; }
        writes.push([at2, blob2]);
        const tgt = at2 & 0xffff;
        const ip = [0xfe, tgt & 0xff, (tgt >> 8) & 0xff];
        if (process.env.RS3_OLDPAD === '1') { while (ip.length < reg.n) ip.push(PAD); }
        else {
          while (ip.length < reg.n - 1) ip.push(PAD);  // 뒤는 불가달(선형으로는)
          if (ip.length < reg.n) ip.push(0xfd);        // 꼬리 FD — mes 직접 진입 짝 안전
        }
        plan.push([reg.a, ip]);
        reg.warpTo = at2;   // 파일 오프셋(검수 디코드가 그대로 쓴다)
        return;
      }
      padTo(bytes, reg.n);
      plan.push([reg.a, bytes]);
    });
    if (bad) { skipped.push([r.s, bad]); continue; }
    for (const w of plan) { writes.push(w); gates.push([w[0], w[0] + w[1].length]); }
    r.mode = 'armtext'; r.regions = regions; r.texts = texts;
    armFixed += 1;
    continue;
  }

  // **대체 팔**: 스킵 구간이 어떤 구간을 통째로 삼키고 그 뒤에 또 구간이
  // 있으면, 둘은 "이거 아니면 저거"다(실측 3C20DF: `4E 04`가 매크로+안쪽 팔을
  // 통째로 건너뛰고 뒤 조각만 그린다 — 그래서 뒤 조각이 이름을 제 몫으로
  // 갖고 있어야 한다).  삼켜진 구간은 순차 흐름에서 빼고 **본문 전체를 따로**
  // 채운다.  스킵이 구간을 일부만 물면 그건 선택 삽입이라 순차 그대로 둔다.
  const altIdx = new Set();
  full.runs.forEach((run, ri) => {
    const swallowed = full.skips.some(([lo, hi]) => run.a >= lo && run.a + run.n <= hi);
    if (swallowed && full.runs.some((o, oi) => oi > ri
      && !full.skips.some(([lo, hi]) => o.a >= lo && o.a + o.n <= hi))) altIdx.add(ri);
  });
  // **원문이 이미 그 매크로면 손대지 않는다.**  사전이 한국어가 됐으므로
  //   바이트를 그대로 둬도 화면엔 한국어 이름이 나온다.  2바이트 칸 한가운데를
  //   4E 경계가 갈라 우리가 못 쓰는 자리에서도 원문은 원래 그렇게 놓여 있으니
  //   그대로가 정답이다(실측 7행: {M|포돌리}·{M|타프탄 산}…).
  if (words.length === 1 && seq.length === 1 && r.tokens.length === 1
      && r.text.trim() === `{M|${r.tokens[0]}}`
      && full.runs.length === 1 && full.runs[0].n === 2) {
    // 구간이 딱 2바이트일 때만이다.  더 길면 매크로 뒤 원문 바이트가 우리
    // 글리프로 깨져 나온다(실측 53행: 「{M|타우루스}알」).
    const runA = full.runs[0].a;
    if (rom[runA] === seq[0].op && rom[runA + 1] === seq[0].idx) {
      gates.push([r.s, r.tEnd]);
      r.mode = 'arm'; r.runs = full.runs; r.altIdx = new Set(); r.warpOf = new Map();
      asIs += 1; armFixed += 1; continue;             // 쓰기 없음
    }
  }
  let wi = 0, wrote = false;
  const runBufs = [];
  full.runs.forEach((run, ri) => {
    if (altIdx.has(ri)) {                            // 대체 조각 — 뒤에서 따로 채운다
      runBufs.push({ run, buf: [], lastRun: false, alt: true });
      return;
    }
    const lastRun = ri === full.runs.length - 1;
    const buf = [];
    while (wi < words.length) {
      const w = words[wi];
      // 보통 첫 런의 선행 공백은 말풍선 줄머리이므로 버린다. 다만 조건 팔은
      // 제 런만 보면 첫 런이어도, 직전 `33 AD`가 이미 앞 조각을 그린 같은
      // 화면 줄에 이어진다. 그 경우 원장이 명시한 preserveLeadingSpace만
      // 예외로 0x50을 실제로 낸다. (그렇지 않으면 "색이초록"처럼 붙는다.)
      const keepFragmentHeadSpace = r.preserveLeadingSpace === true
        && ri === 0 && buf.length === 0 && !wrote;
      const hardNl = r.hardNewlines === true && w.nl === true;   // 저작 개행 — 행 머리에서도 산다
      let useSp = hardNl || (w.lead && (buf.length > 0 || (wrote && !nlBefore[ri]) || keepFragmentHeadSpace));
      let need2 = (useSp ? 1 : 0) + w.bytes.length;
      // 자리가 모자라면 **앞 공백을 뺀다** — 단 **워프가 불가능한 행에서만**.
      //   워프로 풀리는 행에서까지 빼면 띄어쓰기가 통째로 사라진다
      //   (실측: 넓게 걸었더니 2,875곳, 화면에 「괴물에게제물을」).
      //   워프되는 행은 낱말이 다음 구간/아레나로 밀려도 글이 온전하다.
      if (r.tight && buf.length + need2 > run.n && useSp && !hardNl && buf.length + w.bytes.length <= run.n) {
        useSp = false; need2 = w.bytes.length; spaceDropped += 1;
      }
      if (buf.length + need2 > run.n) break;
      const needSp = useSp;
      const at = run.a + buf.length + (needSp ? 1 : 0);
      let crosses = false;
      for (const b2 of bounds) if (b2 > at && b2 < at + w.bytes.length) crosses = true;
      if (crosses) { buf.push(process.env.RS3_OLDPAD === '1' ? PAD : 0xfd); continue; }  // 경계 밀기 — FD 는 짝 무관(이분용 스위치)
      if (needSp) buf.push(hardNl ? 0x24 : 0x50);
      buf.push(...w.bytes);
      if (w.bytes.length) wrote = true;
      wi += 1;
    }
    runBufs.push({ run, buf, lastRun });
  });
  // 남은 어절이 있으면 **마지막 구간만** 워프로 돌린다 — 앞 구간과 그 사이의
  // 원문 개행은 그대로라 줄 구조가 안 흔들린다(전체 워프는 유령 줄을 만든다)
  let armWarp = null;
  if (wi < words.length && ((blind33At(runBufs[runBufs.length - 1].run.a)
      && shadowableAt(runBufs[runBufs.length - 1].run.a))
      || inNowarp(runBufs[runBufs.length - 1].run.a))) {
    // (제외 대역은 손대지 않는다 — 단 NOWARP 대역은 FE 워프 자체가 금지라
    //  넘치면 여기서 트림한다. 3CCE83 제자리 FE 사고 실증)
    // 33-실측 사각 마지막 구간: FE 워프 스텁을 심으면 내부 리더가 글리프로 그린다 —
    // 남은 어절은 **글자 단위**로 되는 만큼 채우고(빈 풍선 방지) 나머지는 버린다.
    // 트리거 블롭도 같은 트림(사각이라 분류기 경로는 원래 안 온다).
    {
      const lastB2 = runBufs[runBufs.length - 1];
      let space2 = lastB2.run.n - lastB2.buf.length;
      const ATOM2 = (b) => (b === 0x18 || b === 0x46 || (b >= 0x20 && b <= 0x23)
        || b === 0x39 || b === 0x3a || b === 0x3b || b === 0x4a || b === 0x4b) ? 2 : 1;
      for (let wj = wi; wj < words.length && space2 > 0; wj += 1) {
        const w2 = words[wj];
        // 저작 개행(hardNewlines)은 흘림 경로에서도 산다 — 제자리 런에 든 낱말만 0x24 를 받고 아레나로 흘린 낱말은
        //   0x50 이 되던 사각(2026-09-08 z67 실측: 편집 34행 중 11행이 개행 낱말이 제자리 용량 밖이라 공백으로 구워짐)
        const nl2 = r.hardNewlines === true && w2.nl === true;
        if ((nl2 || w2.lead) && lastB2.buf.length && space2 > 0) { lastB2.buf.push(nl2 ? 0x24 : 0x50); space2 -= 1; }
        let k2 = 0, part = false;
        while (k2 < w2.bytes.length) {
          const n2b = ATOM2(w2.bytes[k2]);
          if (n2b > space2) { part = true; break; }
          // 4E 경계(bounds)를 원자가 가로지르면 안 된다 — 스킵 착지가 원자
          //   중간이 되어 런타임·워커가 다 어긋난다. 경계까지 0x50 으로 민다.
          const at2 = lastB2.run.a + lastB2.buf.length;
          let cross2 = false;
          for (const b3 of bounds) if (b3 > at2 && b3 < at2 + n2b) cross2 = true;
          if (cross2) { lastB2.buf.push(0x50); space2 -= 1; continue; }
          for (let q2 = 0; q2 < n2b; q2 += 1) lastB2.buf.push(w2.bytes[k2 + q2]);
          space2 -= n2b; k2 += n2b;
        }
        if (part) break;
      }
    }
    in33.warpSkips.push([r.s, words.length - wi]);
    r.trim33 = true;
    wi = words.length;
  }
  if (wi < words.length) {
    const lastB = runBufs[runBufs.length - 1];
    if (lastB.run.n < 3) {
      // 진단: 앞 구간에서 워프할 수 있는지 보려면 **뒤에 뭐가 남는지**를 알아야 한다.
      //   k = 워프를 심을 수 있는 마지막 구간(>=3B) · 그 뒤 구간들의 크기 ·
      //   그 사이 원문에 개행(0x24)이 있는지.  개행이 있으면 BACK 뒤에 빈 줄이 생긴다.
      const idx3 = runBufs.map((x, i) => (x.run.n >= 3 && !x.alt ? i : -1)).filter((i) => i >= 0);
      const k = idx3.length ? idx3[idx3.length - 1] : -1;
      const tail = k >= 0 ? runBufs.slice(k + 1) : [];
      let nlAfter = 0;
      if (k >= 0) {
        for (let t = k; t < runBufs.length - 1; t += 1) {
          const g0 = runBufs[t].run.a + runBufs[t].run.n, g1 = runBufs[t + 1].run.a;
          for (let q = g0; q < g1; q += 1) if (rom[q] === 0x24) nlAfter += 1;
        }
      }
      // **그림자 구조** (2026-08-26): 전면 그림자에선 제자리 바이트가 필요 없다 —
      //   n<3 짧은 런이라도 머리가 표에 걸리면 아레나 전문+복귀로 세운다.
      //   (실증: 획득문 「を」 1바이트 런에 와이드 「를」(2B)이 안 들어가 381행이
      //   '자리 부족'으로 침묵 — 트리거는 바이트 예산과 무관하다.)
      if (FULLSHADOW && shadowableAt(lastB.run.a) && HOOKABLE(rom[lastB.run.a])
          && !seenTrig.has(lastB.run.a) && !blind33At(lastB.run.a)) {
        const restS = [];
        for (let wj = wi; wj < words.length; wj += 1) {
          const w3 = words[wj];
          // 이미 제자리 버퍼에 앞 어절이 있으면, 첫 이월 어절의 공백도
          // 본문 내부 공백이다.  restS만 보면 빈 배열이라 사라져
          // 「자네일행」처럼 붙었다.
          // 짧은 조건 팔은 통째로 그림자 아레나로 이월된다. 첫 어절이어도
          // 원장이 명시한 조각 선행 공백이면 앞 팔 본문과 같은 줄의 경계이므로
          // 보존한다. (색 구슬: "색이 초록")
          const nl3 = r.hardNewlines === true && w3.nl === true;   // 저작 개행은 흘림 경로에서도 0x24 (2026-09-08)
          if (nl3 || (w3.lead && (restS.length || lastB.buf.length
              || (r.preserveLeadingSpace === true && !restS.length && !lastB.buf.length)))) restS.push(nl3 ? 0x24 : 0x50);
          restS.push(...w3.bytes);
        }
        const backS2 = lastB.run.a + lastB.run.n;
        const blobS2 = [...lastB.buf, ...restS, 0xff, backS2 & 0xff, (backS2 >> 8) & 0xff, cpuBankOfFile(r.s >> 16)];
        const atS2 = arenaAlloc(r.s, blobS2.length, blobS2, lastB.run.a);
        if (atS2 !== null) {
          writes.push([atS2, blobS2]);
          armWarp = { runA: lastB.run.a, arena: atS2 };
          lastB.buf = [];                            // 제자리 무기록 — 원문 그대로
          wi = words.length;
        }
      }
      if (wi < words.length) {
      armDiag.push({ at: r.s.toString(16), left: words.length - wi, runs: runBufs.map((x) => x.run.n),
        runA: runBufs.map((x) => x.run.a.toString(16)), bounds: [...bounds].map((x) => x.toString(16)),
        skips: full.skips.map(([lo, hi]) => lo.toString(16) + '..' + hi.toString(16)),
        words: words.map((x) => x.bytes.length),
        k, tail: tail.map((x) => x.run.n), nlAfter, ko: r.text.split(String.fromCharCode(10)).join(' / ') });
      skipped.push([r.s, `자리 부족 (남은 어절 ${words.length - wi})`]); continue;
      }
    }
    if (wi >= words.length) { armWarp = armWarp; } else {
    const rest = [];
    for (let k = 0; k < lastB.buf.length; k += 1) rest.push(lastB.buf[k]);
    for (; wi < words.length; wi += 1) {
      const w = words[wi];
      const nlW = r.hardNewlines === true && w.nl === true;   // 저작 개행은 흘림 경로에서도 0x24 (2026-09-08)
      if (nlW || (w.lead && (rest.length
          || (r.preserveLeadingSpace === true && !rest.length && !lastB.buf.length)))) rest.push(nlW ? 0x24 : 0x50);
      rest.push(...w.bytes);
    }
    const back = lastB.run.a + lastB.run.n;
    const blob = [...rest, 0xff, back & 0xff, (back >> 8) & 0xff, cpuBankOfFile(r.s >> 16)];
    const at3 = arenaAlloc(r.s, blob.length, blob, lastB.run.a);
    if (at3 === null) { skipped.push([r.s, '아레나 초과']); continue; }
    writes.push([at3, blob]);
    armWarp = { runA: lastB.run.a, arena: at3 };
    lastB.buf = [0xfe, at3 & 0xff, (at3 >> 8) & 0xff];
    }
  }
  // **홀수 남은 자리는 워프로 넘긴다** — 4F 는 2바이트씩이라 홀수면 반칸(0x50)
  // 하나가 남는데, 그 한 칸이 창 폭에 닿으면 자동 접힘이 일어나고 뒤이어 원문
  // 개행까지 터져 **빈 줄**이 된다(실측: 「마스터 말대로 혼자서는 위험해.」).
  // 워프하면 남는 바이트를 커서가 통째로 뛰어넘어 칸을 하나도 안 먹는다.
  // 스킵 구간과 겹치는 구간은 제외 — 팔이 캐리어를 반쯤 자를 수 있다.
  const hitsSkip = (run) => (r.skips || full.skips || [])
    .some(([lo, hi]) => run.a < hi && run.a + run.n > lo);
  for (const rb of runBufs) {
    if (rb.alt || armWarp && rb.run.a === armWarp.runA) continue;
    const left = rb.run.n - rb.buf.length;
    if (true) continue;   // FD(1바이트 무동작)가 홀수를 메우므로 워프 불필요
    if (left <= 0 || left % 2 === 0) continue;
    if (rb.run.n < 3 || hitsSkip(rb.run)) continue;
    const back3 = rb.run.a + rb.run.n;
    const blob3 = [...rb.buf, 0xff, back3 & 0xff, (back3 >> 8) & 0xff, cpuBankOfFile(r.s >> 16)];
    const at4 = arenaAlloc(r.s, blob3.length, blob3, rb.run.a);
    if (at4 === null) continue;
    writes.push([at4, blob3]);
    rb.warpTo = at4;
    rb.buf = [0xfe, at4 & 0xff, (at4 >> 8) & 0xff];
  }
  // 대체 조각은 본문 전체를 어절 단위로 다시 채운다(안 들어가는 어절은 뺀다)
  for (const rb of runBufs) {
    if (!rb.alt) continue;
    for (const w of words) {
      const nlA = r.hardNewlines === true && w.nl === true && rb.buf.length > 0;   // 저작 개행 (2026-09-08)
      const needSp = nlA || (w.lead && rb.buf.length > 0);
      if (rb.buf.length + (needSp ? 1 : 0) + w.bytes.length > rb.run.n) continue;
      if (needSp) rb.buf.push(nlA ? 0x24 : 0x50);
      rb.buf.push(...w.bytes);
    }
  }
  const warpOf = new Map();
  for (const rb of runBufs) {
    // **그림자 런** (파일럿): 워프 런의 제자리 캐리어를 안 쓰고 원문을 보존한다.
    //   발동은 STUB 의 표(TRG)가 하고, 아레나 블롭·FF 복귀는 기존과 동일.
    const arenaAt = rb.warpTo !== undefined ? rb.warpTo
      : (armWarp && rb.run.a === armWarp.runA ? armWarp.arena : undefined);
    // 트리거 위치 결정 — 훅은 **글리프 토큰만** 본다(실기: 매크로 머리는 발화하지
    //   않아 제자리 매크로 뒤 JP 꼬리가 오염 글자로 샜다). 머리가 매크로면:
    //   JP 선두 매크로열을 제자리에 남기고(사전이 한국어 이름을 그림 — 무해),
    //   트리거를 그 뒤 첫 글리프에 두되, KO 블롭 선두가 같은 매크로 바이트열일
    //   때만 그만큼 잘라 낸다. 아니면 캐리어 폴백.
    let shTrig = null;
    if (arenaAt !== undefined && shadowableAt(rb.run.a) && HOOKABLE(rom[rb.run.a]) && !seenTrig.has(rb.run.a)) {
      shTrig = { at: rb.run.a, cut: 0, arena: arenaAt };
    } else if (arenaAt === undefined && FULLSHADOW && shadowableAt(rb.run.a)
        && HOOKABLE(rom[rb.run.a]) && !seenTrig.has(rb.run.a)) {
      // 제자리 기록이던 런 — 아레나+트리거로. 몸통은 무패딩 rb.buf 그대로,
      //   빈 몸통(지움 행)이면 순수 복귀 워프가 된다.
      const backR = rb.run.a + rb.run.n;
      const blobR = [...rb.buf, 0xff, backR & 0xff, (backR >> 8) & 0xff, cpuBankOfFile(r.s >> 16)];
      const atR = arenaAlloc(r.s, blobR.length, blobR, rb.run.a);
      if (atR !== null) { writes.push([atR, blobR]); shTrig = { at: rb.run.a, cut: 0, arena: atR }; }
    }
    if (shTrig !== null) {
      shadowRows.push([shTrig.at, shTrig.arena + shTrig.cut, (rb.run.a + rb.run.n) & 0xffff]); seenTrig.add(shTrig.at);
      gates.push([rb.run.a, rb.run.a + rb.run.n]);
      warpOf.set(rb.run.a, shTrig.arena);            // 자체 검수·덤프는 런 머리 기준 아레나 전체를 읽는다
      if (process.env.RS3_SHADOW_FILL === '50') {
        writes.push([rb.run.a, new Array(rb.run.n).fill(0x50)]);
      }
      if (blind33At(rb.run.a)) {
        // 33-사각 런: 내부 리더용 제자리 사본 — FD(우리 무동작)는 0x50 으로,
        // FE 스텁이면 비운다(사각에선 armWarp 를 안 만드니 이중 안전), 패딩 0x50.
        let ipr = rb.buf[0] === 0xfe ? [] : rb.buf.slice();
        // FD(우리 무동작) → 0x50 — 단 **원자 단위로 걷는다**: 매크로/확장 접두의
        //   피연산자 0xFD 를 밟으면 사전 색인이 바뀐다(EventProof 실증 4A FD→4A 50).
        for (let q3 = 0; q3 < ipr.length; q3 += 1) {
          const b3 = ipr[q3];
          if (b3 === 0x18 || b3 === 0x46 || (b3 >= 0x20 && b3 <= 0x23)
            || b3 === 0x39 || b3 === 0x3a || b3 === 0x3b || b3 === 0x4a || b3 === 0x4b) { q3 += 1; continue; }
          if (b3 === 0xfd) ipr[q3] = 0x50;
        }
        while (ipr.length < rb.run.n) ipr.push(0x50);
        writes.push([rb.run.a, ipr]);
        in33.rows += 1;
        continue;
      }
      if (process.env.RS3_SHADOW_KEEPFE !== '1')
        continue;                                    // 기본: 제자리 무기록 — 원문 일본어 보존(선두 매크로 포함)
    }
    padTo(rb.buf, rb.run.n);
    writes.push([rb.run.a, rb.buf]);
    gates.push([rb.run.a, rb.run.a + rb.run.n]);
    if (rb.warpTo !== undefined) warpOf.set(rb.run.a, rb.warpTo);
  }
  if (armWarp && !warpOf.has(armWarp.runA)) warpOf.set(armWarp.runA, armWarp.arena);
  r.mode = 'arm'; r.runs = full.runs; r.armWarp = armWarp; r.altIdx = altIdx;
  r.warpOf = warpOf;
  armFixed += 1;
}
// 아레나 구간: 뱅크마다 하나씩 (게이트 = 반칸 활성 구간)
for (const A of arenaOf.values()) if (A.cur > A.lo) gates.push([A.lo, A.cur]);

// ---- 이벤트 경계 관문 (2026-08-27) ----
//   행이 이벤트 표 몸 경계를 걸치면 트리거 복귀가 경계 자동 복귀를 뛰어넘어
//   **흐름이 다음 이벤트로 낙수한다**(실증: 잡기 소녀 서커스 워프 — 원판은
//   영입인데 우리만 워프. 89행 전수 분할로 완치). 재발은 빌드 실패로 막는다.
{
  const evBodies = new Set();
  for (let id = 1; id < 0xC00; id += 1) {
    const z = id - 1, bi = (z / 0x400) | 0, slot = z % 0x400, base = 0x3A0000 + bi * 0x10000;
    const off = base + slot * 2;
    evBodies.add(base + 0x800 + ((rom[off]) | (rom[off + 1] << 8)));
  }
  // 0xC00 이상 — 24비트 포인터 표 3벌 (포지 BokunoLayout)
  for (const [lo24, hi24, tbl] of [[0xC00, 0xD00, 0x5AA970], [0xE00, 0xF00, 0x5AF800], [0xF00, 0x1000, 0x5EF500]]) {
    for (let id = lo24; id < hi24; id += 1) {
      const off = tbl + (id & 0xff) * 3;
      const raw = rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
      if (raw === 0) continue;
      const bank = (raw >> 16) & 0xff;
      let b3;
      if (bank >= 0x40 && bank <= 0x7d) b3 = 0x400000 + ((bank - 0x40) << 16) | (raw & 0xffff);
      else if (bank >= 0xc0) b3 = ((bank - 0xc0) << 16) | (raw & 0xffff);
      else b3 = raw & 0x3fffff;
      if (b3 > 0 && b3 < rom.length) evBodies.add(b3);
    }
  }
  const bad = [];
  for (const r of rows) {
    if (!r.mode) continue;
    for (const b of evBodies) { if (b > r.s && b < r.e) { bad.push(`${r.s.toString(16)}..${r.e.toString(16)}@${b.toString(16)}`); break; } }
  }
  if (bad.length) {
    writeFileSync(path.join(BUILD_OUT, 'event_boundary_straddle_v1.json'), JSON.stringify(bad, null, 1));
    throw new Error(`이벤트 경계 걸침 행 ${bad.length} — 분할 필수(전량 → out/event_boundary_straddle_v1.json): ${bad.slice(0, 8).join(' ')}`);
  }
}

// ---- 구간 선언 (R 이 읽을 표) ----
//   R 은 "커서가 우리 구간인가"를 묻는다.  전엔 뱅크 하나($FC)와 주소창 하나가
//   어셈에 박혀 있었다 — 율리안 파일럿이라 그걸로 됐지만, 다른 뱅크의 대사는
//   전부 스톡 14px 로 떨어지고 캐리어(FD/FE/FF)도 안 돌았다.
//   **구간은 패치가 선언한다** — 우리가 실제로 옮긴 자리만 반칸이 된다.
//   안 옮긴 일본어가 창 안에 들어오면 반칸으로 렌더돼 글자가 뭉개지므로,
//   틈 허용치는 크게 잡되 **행이 있는 범위 밖으로는 절대 안 나간다**.
const REGION_GAP = 4096;
// 2026-09-16 근본 수리: 구간은 **모든 아레나 배치가 끝난 뒤** 한 번 유도한다.
//   예전에는 여기서 const 로 굳혀 놓고 뒤에서 payload 를 더 구웠다 — 그러면 나중에 구운 것이
//   구간에서 빠지고, 엔진의 RL/RLN 캐리어 관문이 그 payload 의 끝 `FF BACK` 을 순정 opcode 로 읽어
//   이벤트가 복귀하지 못한다. 같은 결함이 두 번 났다(2026-09-15 문맥 payload 뱅크 C4 · 2026-09-16
//   발화 payload 뱅크 77/78, 이벤트 0x0685 실기 확인). 경로마다 수동으로 regions.push 하는 방식은
//   새 레일이 생길 때마다 또 빠지므로, 배치 결과(rows + arenaOf)에서 자동으로 유도한다.
const computeRegions = () => {
  const byBank = new Map();
  for (const r of rows.slice().sort((a, b) => a.s - b.s)) {
    const fb = r.s >> 16;
    const l = byBank.get(fb) || [];
    if (l.length && r.s - l[l.length - 1][1] <= REGION_GAP) l[l.length - 1][1] = Math.max(l[l.length - 1][1], r.e);
    else l.push([r.s, r.e]);
    byBank.set(fb, l);
  }
  const out = [];
  for (const [fb, l] of [...byBank].sort((a, b) => a[0] - b[0])) {
    for (const [s, e] of l) out.push({ bank: cpuBankOfFile(fb), lo: s & 0xffff, hi: e & 0xffff });
  }
  // **아레나도 구간이다.**  R(구간 판정)은 어셈에 아레나 뱅크 하나만 박아
  // 두고 나머지는 표로 본다 — 뱅크가 23개가 됐으니 전부 표에 실어야 한다.
  // 안 실으면 그 뱅크의 워프된 본문이 스톡 14px 로 떨어진다.
  for (const A of arenaOf.values()) {
    if (A.cur > A.lo) out.push({ bank: cpuBankOfFile(A.fb), lo: A.lo & 0xffff, hi: A.cur & 0xffff });
  }
  // 아레나 밖 자유 공간에 놓인 payload(문맥 치환 등)도 같은 규칙으로 합친다 — 뱅크별 gap<=64 병합.
  //   이 목록에 담기만 하면 구간에 들어가므로, 새 레일이 생겨도 수동 등록을 잊어 빠질 일이 없다.
  {
    const byBank2 = new Map();
    for (const [s, e] of extraRegionSpans.slice().sort((a, b) => a[0] - b[0])) {
      const fb = s >>> 16; const l = byBank2.get(fb) || [];
      if (l.length && s - l[l.length - 1][1] <= 64) l[l.length - 1][1] = Math.max(l[l.length - 1][1], e);
      else l.push([s, e]);
      byBank2.set(fb, l);
    }
    for (const [fb, l] of byBank2) for (const [s, e] of l) out.push({ bank: cpuBankOfFile(fb), lo: s & 0xffff, hi: e & 0xffff });
  }
  return out;
};
// 아레나 밖에 놓인 payload 구간(문맥 치환 등). computeRegions 가 마지막에 합친다.
const extraRegionSpans = [];
// ---- 그림자 전역 트리거 표 방출 ----
//   키 = (CPU 뱅크, addr16) 오름차순. [N u16][addr16 ×N][bank ×N][arena 3B ×N]
//   전용 예약 구역(고정 베이스)에 실어 TRG 가 절대 롱,X 로 이진 탐색한다.
let shadowTable = null;
let shadowDir = null;
if (shadowRows.length && !shadowTblRegion) {
  // g24b: 뱅크별 부표(아레나 풀 할당) + $FF:E400 디렉토리. 부표 =
  //   [addr16×N][아레나 lo,hi,bank ×N] · 키는 뱅크 내 addr16 오름차순 유일.
  const byBank2 = new Map();
  for (const row of shadowRows) {
    const cb = cpuBankOfFile(row[0] >> 16);
    if (!byBank2.has(cb)) byBank2.set(cb, []);
    byBank2.get(cb).push(row);
  }
  const banksOut = {};
  let tblBytes = 0;
  for (const [cb, list] of [...byBank2].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => (a[0] & 0xffff) - (b[0] & 0xffff));
    for (let i = 1; i < list.length; i += 1) {
      if ((list[i][0] & 0xffff) === (list[i - 1][0] & 0xffff)) throw new Error(`트리거 키 중복 ${cb.toString(16)}:${(list[i][0] & 0xffff).toString(16)}`);
    }
    const sub = [];
    for (const [s2] of list) sub.push(s2 & 0xff, (s2 >> 8) & 0xff);
    for (const [, at2] of list) sub.push(at2 & 0xff, (at2 >> 8) & 0xff, cpuBankOfFile(at2 >> 16));
    let at = arenaAlloc(list[0][0], sub.length);
    if (at === null) {
      for (const A of arenaOf.values()) if (A.cur + sub.length <= A.hi) { at = A.cur; A.cur += sub.length; break; }
    }
    if (at === null) throw new Error(`부표 자리 없음 (뱅크 ${cb.toString(16)} ${sub.length}B)`);
    if (((at + sub.length - 1) >> 16) !== (at >> 16)) throw new Error('부표가 뱅크를 넘음');
    writes.push([at, sub]);
    banksOut[cb.toString(16)] = { n: list.length, at };
    tblBytes += sub.length;
  }
  shadowDir = { fmt: 'g24b', banks: banksOut };
  const banks3 = new Set(shadowRows.map(([s2]) => s2 >> 16));
  console.log(`그림자 행 ${shadowRows.length} (뱅크 ${banks3.size}개) · 부표 ${Object.keys(banksOut).length}개 ${tblBytes}B + 디렉토리 1280B`);
}
if (shadowRows.length && shadowTblRegion) {
  shadowRows.sort((a, b) => {
    const ka = (cpuBankOfFile(a[0] >> 16) << 16) | (a[0] & 0xffff);
    const kb = (cpuBankOfFile(b[0] >> 16) << 16) | (b[0] & 0xffff);
    return ka - kb;
  });
  const N = shadowRows.length;
  const tbl = [N & 0xff, (N >> 8) & 0xff];
  for (const [s2] of shadowRows) tbl.push(s2 & 0xff, (s2 >> 8) & 0xff);
  for (const [s2] of shadowRows) tbl.push(cpuBankOfFile(s2 >> 16));
  for (const [, at2] of shadowRows) tbl.push(at2 & 0xff, (at2 >> 8) & 0xff, cpuBankOfFile(at2 >> 16));
  if (tbl.length > SHADOW_TBL_RESERVE) throw new Error(`그림자 표 초과 ${tbl.length}B > ${SHADOW_TBL_RESERVE}`);
  writes.push([shadowTblRegion.at, tbl]);
  shadowTable = { at: shadowTblRegion.at, n: N, fmt: 'g24' };
  const banks = new Set(shadowRows.map(([s2]) => s2 >> 16));
  console.log(`그림자 행 ${N} (뱅크 ${banks.size}개) · 표 ${tbl.length}B @ ${shadowTblRegion.at.toString(16)}`);
}
// 구간 선언 로그는 모든 배치가 끝난 뒤(patch 적재 직전)로 옮겼다 — 여기서는 아직 payload 를 안 구웠다.

// ---- 산출 ----
const singles175 = ranked.slice(0, Math.min(175, ranked.length));
// (행이 확정된 뒤로 옮겼다 — '구워질 것 같은 행'이 아니라 **실제로 구운 행**에만 양보해야
//  버려진 행에 자리를 내주고 일본어가 남는 일이 없다. 3DC21D 실측.)
const bakedSpans = rows.filter((r) => r.mode).map((r) => [r.s, r.e])
  .filter(([a]) => a >= 0x3d0000 && a < 0x3e0000);
const bakedOwned = (off) => bakedSpans.some(([a, b]) => a <= off && off < b);
const warMessageWriteKeys = new Set();
// ---- 전쟁 메시지 재작성 ----
if (warRows.length) {
  let done = 0, ownBad = 0, streamRows = 0, nativeOwned = 0; const budBad = [], slotBad = [], walkBad = [];
  for (const r of warRows) {
    // 2026-09-17: C3 레코드 0..254 전부 원천 표 소유 — c3-war-records(runtime/c3_war_messages_korean_v1.json)가 레코드를 통째로 다시 쓴다.
    //   이 표(war_messages_kr_v1.tsv)는 그 선언의 문안 후보(표 원안·표 문안)로만 쓰인다.
    if (nativeTableOwnedAt(r.off)) { nativeOwned += 1; continue; }
    // 자리 걷기 — 0x3B 는 건너뛰되 세그먼트를 끊는다
    const slot = [], segOf = [];
    let o = r.off, i = 0, seg = 0, broke = false;
    while (i < r.slots) {
      const b = rom[o];
      if (b === 0x3b) { o += 1; if (i > 0) seg += 1; continue; }
      if (b === 0x18 || b === 0x46 || (b >= 0x20 && b <= 0x23)) { slot.push([o, 2]); segOf.push(seg); o += 2; i += 1; continue; }
      if (b >= 0x51) { slot.push([o, 1]); segOf.push(seg); o += 1; i += 1; continue; }
      broke = true; break;
    }
    if (broke || slot.length !== r.slots) { walkBad.push(`${r.off.toString(16)} 자리 ${slot.length}/${r.slots}`); continue; }
    if (slot.some(([off2]) => bakedOwned(off2))) { ownBad += 1; continue; }
    const ko = [...r.kr];
    if (ko.length > r.slots) { budBad.push(`${r.off.toString(16)} 음절 ${ko.length}>${r.slots}`); continue; }
    // 세그먼트 용량
    const cap = new Map();
    slot.forEach(([, w], k) => cap.set(segOf[k], (cap.get(segOf[k]) || 0) + w));
    const use = new Map();
    let bad = null;
    const bytesOf = ko.map((ch) => { const a = assign.get(ch === ' ' ? '␣' : ch); if (!a) bad = ch; return a ? a.bytes : []; });
    if (bad) { slotBad.push(`${r.off.toString(16)} 슬롯 밖 「${bad}」`); continue; }
    ko.forEach((_, k) => { const sgi = segOf[k]; use.set(sgi, (use.get(sgi) || 0) + bytesOf[k].length); });
    let over = null;
    for (const [sgi, u] of use) if (u > (cap.get(sgi) || 0)) over = `seg${sgi} ${u}>${cap.get(sgi) || 0}`;
    // **칸마다도 봐야 한다** — 아래 쓰기가 `slice(0, w)` 로 칸 폭에 맞춰 자르므로,
    //   세그먼트 합만 보면 1바이트 칸에 와이드 글자를 통과시켜 놓고 **반토막을 쓴다**
    //   (실측 2026-08-28 3DC5A1: 「됐습니다.」가 6칸 6바이트 합으로는 통과했는데
    //    「됐」이 1바이트 칸에서 잘려 화면이 깨졌다).
    if (!over) for (let k = 0; k < ko.length; k += 1) {
      if (bytesOf[k].length > slot[k][1]) { over = `칸${k} 「${ko[k]}」 ${bytesOf[k].length}>${slot[k][1]}`; break; }
    }
    if (over) {
      // C3 연속 인코딩 폴백(2026-09-17): 칸 모형이 안 맞으면 0x3B 세그먼트마다 글자 수·바이트 수를 원문 그대로 두고 연속으로 쓴다
      //   (격리 수리 war_opening_messages_v1 과 같은 계약, 레코드 6/58/59 바이트 동일 — test_native_table_repairs_v1).
      const stream = c3StreamRowWrites({ original: rom, off: r.off, slots: r.slots, kr: r.kr,
        assignment: Object.fromEntries([...assign.entries()].map(([c, a]) => [c, a.n])) });
      if (!stream.ok) { budBad.push(`${r.off.toString(16)} 「${r.kr}」 ${over} · 연속 ${stream.why}`); continue; }
      for (const [off2, bytes] of stream.writes) {
        warMessageWriteKeys.add(`${off2}:${Buffer.from(bytes).toString('hex')}`);
        writes.push([off2, bytes]);
      }
      streamRows += 1; done += 1;
      continue;
    }
    // 자리마다 써 넣고 남는 자리는 0x50
    slot.forEach(([off2, w], k) => {
      const by = k < bytesOf.length ? bytesOf[k] : [];
      const pad = by.concat(new Array(Math.max(0, w - by.length)).fill(0x50)).slice(0, w);
      warMessageWriteKeys.add(`${off2}:${Buffer.from(pad).toString('hex')}`);
      writes.push([off2, pad]);
    });
    done += 1;
  }
  console.log(`전쟁 메시지: ${done}/${warRows.length} 자리 치환`
    + (budBad.length ? ` · **예산 초과 ${budBad.length}**: ${budBad.slice(0, 4).join(' / ')}` : '')
    + (walkBad.length ? ` · 걷기 실패 ${walkBad.length}: ${walkBad.slice(0, 3).join(' / ')}` : '')
    + (slotBad.length ? ` · 슬롯 밖 ${slotBad.length}` : '')
    + (ownBad ? ` · 대사 원장 소유라 양보 ${ownBad}` : '')
    + (streamRows ? ` · C3 연속 인코딩 ${streamRows}` : '')
    + (nativeOwned ? ` · 원천 표 소유(c3-war-records 가 씀) ${nativeOwned}` : ''));
}

// ---- 0B 사전 조건 조각의 한국어 제어 재배선 ----
// 0B74는 단순 문자열이 아니라 WRAM F319를 보고 단수/복수를 가른다. 몸통을
// 통째로 지우면 화면 가비지는 없어져도 원판 의미가 사라진다. 검증된 미사용
// 조각만 재사용하며, 원본 바이트가 한 바이트라도 다르면 빌드를 중단한다.
const dictControlRewritePath = path.join(PROJECT, 'runtime', '0b_dictionary_control_rewrites_v1.json');
const dictControlRewrite = JSON.parse(readFileSync(dictControlRewritePath, 'utf8'));
const bytesFromHex = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).map((x) => parseInt(x, 16));
for (const rw of dictControlRewrite.writes || []) {
  const at = parseInt(rw.at, 16);
  const expected = bytesFromHex(rw.expected);
  const replacement = bytesFromHex(rw.replacement);
  if (expected.length !== replacement.length) {
    throw new Error(`0B 사전 재배선 길이 불일치 ${rw.at}: ${expected.length} != ${replacement.length}`);
  }
  const actual = [...rom.subarray(at, at + expected.length)];
  if (actual.some((v, i) => v !== expected[i])) {
    throw new Error(`0B 사전 재배선 원본 불일치 ${rw.at}: `
      + `${Buffer.from(actual).toString('hex')} != ${Buffer.from(expected).toString('hex')}`);
  }
  writes.push([at, replacement]);
}
console.log(`0B 사전 조건 재배선: ${dictControlRewrite.writes.length}건 (원본 바이트 관문 통과)`);

// ---- 0B 조각 정의부 팔 재배열 — 최종 쓰기 반영 ----
//   원본 관문·rom 버퍼 반영은 파일 상단(armRelayoutWrites)에서 끝났다.
for (const w of armRelayoutWrites) writes.push(w);
if (armRelayoutWrites.length) console.log(`0B 조각 팔 재배열(쓰기): ${armRelayoutWrites.length}건`);

// ---- 실기 확인 일본어 선두 여백 제거 ----
// 한국어 그림자 행의 시작 바로 앞에 남아 있던 일본어 0x50 레이아웃 패딩은
// 번역문 자체의 공백이 아니므로, 한 바이트 무동작 FD로만 바꾼다. 원본 바이트
// 관문과 쓰기 충돌 관문을 모두 통과해야 하며, 단어 사이의 0x50에는 절대 쓰지 않는다.
const leadingPaddingElisionPath = path.join(PROJECT, 'runtime', 'leading_padding_elisions_v1.json');
const leadingPaddingElision = JSON.parse(readFileSync(leadingPaddingElisionPath, 'utf8'));
for (const rw of leadingPaddingElision.writes || []) {
  const at = parseInt(rw.at, 16);
  const expected = bytesFromHex(rw.expected);
  const replacement = bytesFromHex(rw.replacement);
  if (!expected.length || expected.length !== replacement.length) {
    throw new Error(`선두 여백 제거 길이 불일치 ${rw.at}: ${expected.length} != ${replacement.length}`);
  }
  if (expected.some((b) => b !== 0x50) || replacement.some((b) => b !== 0xfd)) {
    throw new Error(`선두 여백 제거는 50→FD만 허용 ${rw.at}`);
  }
  const actual = [...rom.subarray(at, at + expected.length)];
  if (actual.some((v, i) => v !== expected[i])) {
    throw new Error(`선두 여백 제거 원본 불일치 ${rw.at}: `
      + `${Buffer.from(actual).toString('hex')} != ${Buffer.from(expected).toString('hex')}`);
  }
  // 원천 표 레코드 안의 0x50 은 대사 VM 여백이 아니다 — C3 판독기에서 FD 는 글자(者)로 찍힌다(격리 수리 war_opening_messages_v1).
  if (nativeTableOwnedAt(at, at + expected.length)) {
    throw new Error(`선두 여백 제거가 원천 표 소유 레코드 안이다 ${rw.at} — runtime/leading_padding_elisions_v1.json 에서 철회할 것`);
  }
  writes.push([at, replacement]);
}
console.log(`실기 확인 선두 여백 제거: ${leadingPaddingElision.writes.length}건 (50→FD 원본 바이트 관문 통과)`);

// ---- 원천 표 수리(2026-09-17, rs3_native_table_repairs_v1) ----
//   표 writer(WRITES_TABLE_END 앞)의 같은 자리 쓰기만 대체한다(겹침 관문의 「표 → 뒤 writer」 선언 겹침). 그 밖 겹침·점유 구간은 계획이 멈춘다.
//   위임 스팬(표 전용) 소유권 관문은 nativeTableWriteKeys 의 정확한 쓰기만 허용한다.
const nativeTableRepairs = ROUTE === 'all' ? planNativeTableRepairs({
  original: nativeTableOriginalRom,
  assignment: Object.fromEntries([...assign.entries()].map(([c, a]) => [c, a.n])),
  writes, tableWriteEnd: WRITES_TABLE_END,
  occupied: [...arenaOf.values()].map((A) => [A.lo, A.cur])
    .concat(arenaRows.map(([, at, size]) => [at, at + size]))
    .concat(rows.filter((r) => r.mode).map((r) => [r.s, Math.max(r.e, r.back)])),
  plans: nativeTableRepairPlans,
}) : null;
const nativeTableWriteKeys = new Set();
if (nativeTableRepairs) {
  for (const w of nativeTableRepairs.writes) {
    const bytes = [...Buffer.from(w.hex, 'hex')];
    nativeTableWriteKeys.add(`${w.at}:${w.hex.toLowerCase()}`);
    writes.push([w.at, bytes]);
  }
  const c3r = nativeTableRepairs.receipts['c3-war-records'];
  console.log(`원천 표 수리: ${nativeTableRepairs.families.length}계열 · ${nativeTableRepairs.writes.length}쓰기 · ${nativeTableRepairs.bytes}B · 표 writer 쓰기 대체 ${nativeTableRepairs.supersededTableWrites} · 전투 메시지 풀 끝 ${nativeTableRepairs.receipts['battle-popup-pool'].newTerminal.toString(16)}`
    + (c3r ? ` · C3 전쟁 메시지 ${c3r.records}레코드 ${c3r.poolBytes}B 끝 ${c3r.newEnd.toString(16)} ${JSON.stringify(c3r.bySource)}` : ''));
}

// 실기 확정 bridge가 일반 필터나 겹침 정리에서 조용히 사라지지 않았는지 최종
// 산출 직전에 다시 증명한다. 해당 행 자체가 구워졌거나, 더 큰 검증 레이아웃
// 스팬에 완전히 흡수된 경우만 통과한다.
{
  const baked = rows.filter((r) => r.mode).map((r) => [r.s, Math.max(r.e, r.back)]);
  const missing = ppuConfirmedExpected.filter((x) =>
    !baked.some(([s, e]) => (s >> 16) === (x.s >> 16) && s <= x.s && x.e <= e));
  if (missing.length) {
    const sample = missing.slice(0, 20).map((x) => `$${x.s.toString(16)}..$${x.e.toString(16)}(${x.source}; skip=${(skipped.find(([q]) => q === x.s) || [])[1] || '?'}; text=${(rows.find((r) => r.s === x.s) || {}).text ?? '?'})`).join(' ');
    const bridgeDiag = missing.slice(0, 20).map((x) => {
      const A = arenaFor(x.s);
      return { at: x.s.toString(16), arena: A ? { fb: (x.s >> 16).toString(16), lo: A.lo.toString(16), cur: A.cur.toString(16), hi: A.hi.toString(16), free: A.hi - A.cur } : null,
        armDiag: armDiag.filter((d) => d.at === x.s.toString(16)) };
    });
    console.error('bridgeDiag ' + JSON.stringify(bridgeDiag));
    throw new Error(`실기 PPU 확정 bridge 미반영 ${missing.length}행: ${sample}`);
  }
  const changed = rows.filter((r) => r.ppuConfirmed && r.mode && r.text !== r.origText);
  if (changed.length) {
    const sample = changed.slice(0, 20)
      .map((r) => `$${r.s.toString(16)}「${r.origText}」→「${r.text}」`).join(' ');
    throw new Error(`실기 PPU 확정 bridge 문안 변형 ${changed.length}행: ${sample}`);
  }
  if (ppuConfirmedExpected.length) console.log(`실기 PPU 확정 bridge 반영 관문: ${ppuConfirmedExpected.length}/${ppuConfirmedExpected.length}`);
}

// Common output-engine families are compiled from source in the normal full
// build, before the same ownership/control gates as every other writer.
// No historical candidate or sequential repair replay is an input.
const integratedOutputEngine = ROUTE === 'all' ? planOutputEngine({
  original: readFileSync(path.join(ROOT, 'bokuno_jp.smc')),
  writes,
  occupied: [...arenaOf.values()].map(A => [A.lo, A.cur])
    .concat(arenaRows.map(([, at, size]) => [at, at + size]))
    .concat(rows.filter(r => r.mode).map(r => [r.s, Math.max(r.e, r.back)])),
}) : null;
if (integratedOutputEngine) {
  writes.push(...integratedOutputEngine.writes.map(w => [w.at, [...Buffer.from(w.afterHex, 'hex')]]));
  console.log(`정식 출력기 통합: ${integratedOutputEngine.families.length}계열 · ${integratedOutputEngine.writes.length}쓰기`);
}

// ---- v3② C2: 문맥 치환·조건부 공백·soft/zero 패딩 정식 생성 (2026-09-14) ----
// 선언(runtime/conditional_blank_rows_v1 · soft_padding_rows_v1 · contextual_text_entries_v1)을 이번 배치의
// shadow/arena/adaptive 주소에 결속하고, 코드·표·payload 를 원본 빈 공간에 할당한다. 과거 후보 ROM/receipt 는 입력이 아니다.
// ROM 단계가 $FE:9500 체인 진입(JML)과 문맥 훅을 설치·검증한다. RS3_C2_TEXT=0 이면 생략(정식 전체 빌드에서는 끄지 않는다).
// v3② 말투 팔 선언(runtime/speech_arms_declaration_v1.json) → 문맥 치환 항목 병합 (2026-09-15).
// 팔 행/줄기 행에 등급 관문(33 A9)이 들어간 payload 를 글자 선언에서 만든다. 같은 키(source:return)는 선언이 기존 항목을 대체한다(기록 남김).
function mergeSpeechArms(contextualDecl, assignment) {
  const declPath = path.join(PROJECT, 'runtime', 'speech_arms_declaration_v1.json');
  if (!existsSync(declPath) || process.env.RS3_SPEECH_ARMS === '0') return contextualDecl;
  const decl = JSON.parse(readFileSync(declPath, 'utf8'));
  // 발화 원본 컴파일 결과(2026-09-15 밤, tools/utterance_compiler_v1.mjs → runtime/utterance_payloads_v1.json): supersedes 에 적힌 옛 stem 만 빼고
  //   발화 stem 을 더한다. 대체 목록에 없는 선언이 같은 source 를 쥐면 아래 compile/문맥 검증의 중복 키 관문에서 멈춘다(마지막 선언 우선 없음).
  let utterance = null;
  const uttPath = path.join(PROJECT, 'runtime', 'utterance_payloads_v1.json');
  if (existsSync(uttPath) && process.env.RS3_UTTERANCES !== '0') {
    const u = JSON.parse(readFileSync(uttPath, 'utf8'));
    if (u.schema !== 'bokuno-utterance-payloads-v1') throw new Error(`발화 payload schema ${u.schema}`);
    const drop = new Set(u.supersedes || []);
    const have = new Set(decl.entries.map((e) => e.id));
    for (const id of drop) if (!have.has(id)) throw new Error(`발화 payload 가 대체한다는 선언 ${id} 가 말투 팔 선언에 없다`);
    const dropCtx = new Set(u.supersedesContextual || []);
    if (dropCtx.size) {
      const haveCtx = new Set(contextualDecl.entries.map((e) => e.id));
      for (const id of dropCtx) if (!haveCtx.has(id)) throw new Error(`발화 payload 가 대체한다는 문맥 치환 ${id} 가 문맥 치환 선언에 없다`);
      contextualDecl = { ...contextualDecl, entries: contextualDecl.entries.filter((e) => !dropCtx.has(e.id)) };
      console.log(`발화 payload 가 대체한 손 문맥 치환 ${dropCtx.size}: ${[...dropCtx].join(',')}`);
    }
    const directSrc = new Set((u.directPayloadRows || []).map((h) => parseInt(h, 16)));
    decl.entries = [...decl.entries.filter((e) => !drop.has(e.id)), ...(u.entries || []).filter((e) => !directSrc.has(parseInt(e.source, 16)))];
    utterance = { sha256: createHash('sha256').update(readFileSync(uttPath)).digest('hex').toUpperCase(), entries: (u.entries || []).length, superseded: [...drop] };
    console.log(`발화 원본 payload: 항목 ${utterance.entries} · 대체 ${drop.size}`);
  }
  const compiled = compileSpeechArms(decl, assignment);
  const key = e => `${String(e.source).toUpperCase()}:${(e.returnCursors || []).map(r => String(r).toUpperCase()).join('/')}`;
  const mine = new Map(compiled.map(e => [key(e), e]));
  const replaced = contextualDecl.entries.filter(e => mine.has(key(e))).map(e => e.id);
  const entries = [...contextualDecl.entries.filter(e => !mine.has(key(e))), ...compiled];
  console.log(`말투 팔 선언: 항목 ${compiled.length} (기존 대체 ${replaced.length}${replaced.length ? ': ' + replaced.slice(0, 8).join(',') + (replaced.length > 8 ? '…' : '') : ''})`);
  return { ...contextualDecl, entries, speechArms: { declarationSha256: createHash('sha256').update(readFileSync(declPath)).digest('hex').toUpperCase(), compiled: compiled.length, replaced, utterance } };
}
// 2026-09-16 발화 payload 직접 행(tools/utterance_compiler_v2 directPayloadRows): 실기 PPU 증거로 직접 FE 워프를 쓰는 행은 그림자 조회(TRG4)를
//   안 거쳐 디스패처가 못 건다. 그 행 머리 FE 가 가리키는 곳을 아레나에 새로 굽는 발화 payload(주인공 관문+팔+FF BACK)로 바꾼다.
// 2026-09-17 v2i: rows [출발, payload 주소, 길이] · stubs [출발, 발판 주소, payload 주소](넓은 배치) · convertRows(제자리→직접 전환 출발).
//   관문(audit_carrier_region_coverage_v1)은 발판 FF 가 선언된 payload 시작을 가리키는지, 문안 관문(audit_full_candidate_post0704_targets_v1)은
//   이 행들의 TSV 문안 대신 FE→(발판)→payload 구조를 본다.
const utteranceDirectPayload = { rows: [], stubs: [], convertRows: [], bytes: 0 };
const utteranceDirectBytes = new Map();             // 출발 → 컴파일 payload 바이트(되읽기 검수용, patch 에는 안 싣는다)
{
  const uttPathD = path.join(PROJECT, 'runtime', 'utterance_payloads_v1.json');
  if (existsSync(uttPathD) && process.env.RS3_UTTERANCES !== '0') {
    const u = JSON.parse(readFileSync(uttPathD, 'utf8'));
    const directSet = new Set((u.directPayloadRows || []).map((h) => parseInt(h, 16)));
    if (directSet.size) {
      const assignmentObj = Object.fromEntries([...assign.entries()].map(([c, a]) => [c, a.n]));
      const dEntries = (u.entries || []).filter((e) => directSet.has(parseInt(e.source, 16)));
      if (dEntries.length !== directSet.size) throw new Error(`발화 payload 직접 행 ${directSet.size} 인데 항목 ${dEntries.length}`);
      const compiledD = compileSpeechArms({ schema: u.declarationSchema, entries: dEntries }, assignmentObj);
      for (const c of compiledD) {
        const src = parseInt(c.source, 16);
        let head = null;
        for (let wi = writes.length - 1; wi >= 0; wi -= 1) { const w = writes[wi]; if (Number(w[0]) === src) { head = w; break; } }
        if (!head || head[1][0] !== 0xfe || head[1].length < 3) throw new Error(`발화 payload 직접 행 ${c.source} 머리의 마지막 쓰기가 FE 직접 워프가 아니다`);
        if (UTTERANCE_CONVERT_ROWS.has(src) !== ((rows.find((r) => r.s === src) || {}).mode === 'utterance-convert')) throw new Error(`발화 payload 제자리→직접 전환 행 ${c.source} 전환 기록 불일치`);
        const bytes = [...Buffer.from(c.payloadHex, 'hex')];
        let at, entryAt;
        if (UTTERANCE_WIDE_ROWS.has(src)) {
          // 넓은 배치: payload 는 출발 뱅크 아레나 밖, 남은 자리가 가장 많은 아레나에(native end16 관문은 출발지 소유 이벤트 기준 그대로).
          const own = arenaFor(src);
          if (!own) throw new Error(`발화 payload 넓은 배치 행 ${c.source} 출발 아레나 미배정`);
          adaptivePlanner.prepare(`utterance-direct:${c.source}`, bytes);
          const pool = [...new Set(arenaOf.values())].filter((A) => A.fb !== own.fb).sort((x, y) => (y.hi - y.cur) - (x.hi - x.cur) || x.fb - y.fb);
          at = null;
          for (const A of pool) { const got = end16Guard.allocate(A, src, bytes.length); if (got !== null) { at = got; break; } }
          if (at === null) throw new Error(`발화 payload 넓은 배치 행 ${c.source} 둘 아레나 없음(${bytes.length}B)`);
          arenaRows.push([src, at, bytes.length]);
          writes.push([at, bytes]);
          const stub = [0xff, at & 0xff, (at >> 8) & 0xff, cpuBankOfFile(at >> 16)];
          entryAt = arenaAlloc(src, stub.length, stub, `utterance-direct-stub:${c.source}`);
          if (entryAt === null) throw new Error(`발화 payload 넓은 배치 행 ${c.source} 발판 아레나 초과`);
          writes.push([entryAt, stub]);
          utteranceDirectPayload.stubs.push([src, entryAt, at]);
        } else {
          at = arenaAlloc(src, bytes.length, bytes, `utterance-direct:${c.source}`);
          if (at === null) throw new Error(`발화 payload 직접 행 ${c.source} 아레나 초과`);
          writes.push([at, bytes]);
          entryAt = at;
        }
        if ((entryAt >> 16) !== arenaFor(src).fb) throw new Error(`발화 payload 직접 행 ${c.source} 진입 주소 ${entryAt.toString(16)} 가 출발 아레나 뱅크가 아니다`);
        head[1][1] = entryAt & 0xff;
        head[1][2] = (entryAt >> 8) & 0xff;
        utteranceDirectPayload.rows.push([src, at, bytes.length]);
        utteranceDirectBytes.set(src, bytes.slice());
        if (UTTERANCE_CONVERT_ROWS.has(src)) utteranceDirectPayload.convertRows.push(src);
        utteranceDirectPayload.bytes += bytes.length;
      }
      for (const s of UTTERANCE_CONVERT_ROWS) if (!utteranceDirectPayload.rows.some((x) => x[0] === s)) throw new Error(`발화 payload 제자리→직접 전환 행 ${s.toString(16)} 에 payload 가 없다`);
      console.log(`발화 payload 직접 FE 행 ${utteranceDirectPayload.rows.length} · ${utteranceDirectPayload.bytes}B · 넓은 배치 ${utteranceDirectPayload.stubs.length} · 제자리→직접 전환 ${utteranceDirectPayload.convertRows.length}`);
    }
  }
}
let c2Text = null;
if (ROUTE === 'all' && process.env.RS3_C2_TEXT !== '0') {
  const c2Decl = (n) => JSON.parse(readFileSync(path.join(PROJECT, 'runtime', n), 'utf8'));
  c2Text = planC2TextGenerators({ end16Guard,
    original: readFileSync(path.join(ROOT, 'bokuno_jp.smc')),
    patch: {
      shadowRows, arenaRows, shadowDir,
      assignment: Object.fromEntries([...assign.entries()].map(([c, a]) => [c, a.n])),
      rowSpans: rows.filter((r) => r.mode).map((r) => [r.s, r.e]),
      adaptivePadding: adaptivePlanner.metadata(writes),
    },
    writes,
    occupied: [...arenaOf.values()].map(A => [A.lo, A.cur])
      .concat(arenaRows.map(([, at, size]) => [at, at + size]))
      .concat(rows.filter(r => r.mode).map(r => [r.s, Math.max(r.e, r.back)]))
      .concat(deliberateBlankSpans.map((p) => [p.s, p.e]))
      .concat(deliberateBlankDelegatedSpans.map((p) => [p.s, p.e])),
    declarations: {
      conditionalBlanks: c2Decl('conditional_blank_rows_v1.json'),
      softPadding: c2Decl('soft_padding_rows_v1.json'),
      contextualEntries: mergeSpeechArms(c2Decl('contextual_text_entries_v1.json'),
        Object.fromEntries([...assign.entries()].map(([c, a]) => [c, a.n]))),
    },
  });
  writes.push(...c2Text.writes.map((w) => [w.at, [...w.bytes]]));
  // 2026-09-15 malto: contextual payloads live in free space (bank C4), outside every arena region. The RL/RLN carrier gate
  //   (build_julian_rom_v1 RL_scan over $FF:E400/E600) therefore read a payload's trailing FF BACK as the stock opcode and the pen
  //   typed payload glyphs at stock stride -- real-core cursor-jump on 0x0672/0x0F60 showed junk right after the payload.
  //   Register the payload spans (merged per bank, gap <= 64) as regions so FF BACK and half-cell rendering hold inside payloads.
  // 2026-09-16: 여기서 regions 에 직접 밀어 넣지 않는다. 구간은 모든 배치가 끝난 뒤 computeRegions 가
  //   한 번에 유도한다 — 경로마다 수동 등록하던 방식이 발화 payload 를 빠뜨려 0x0685 가 깨졌다.
  {
    const payloads = c2Text.contextualText.allocation.filter((a) => String(a.kind).startsWith('payload:')).map((a) => [Number(a.start), Number(a.end)]).sort((x, y) => x[0] - y[0]);
    for (const [s, e] of payloads) { if ((e - 1) >>> 16 !== (s >>> 16)) throw new Error(`contextual payload crosses a bank @${s.toString(16)}`); extraRegionSpans.push([s, e]); }
    console.log(`문맥 payload 캐리어 구간 후보: ${payloads.length}개`);
  }
  console.log(`C2 문맥/공백 생성기: 조건부 공백 ${c2Text.summary.conditionalRows} · soft ${c2Text.summary.softRows} · zero ${c2Text.summary.zeroRows} · 문맥 치환 ${c2Text.summary.contextualEntries} · ${c2Text.summary.bytes}B`);
}

// ---- 비대사/제어 스트림 원본 보존 관문 ----
// 모든 writer가 확정된 뒤 검사한다. 한 바이트라도 deliberateBlank 스팬에 닿으면
// 결과가 우연히 원본과 같더라도 실패한다. 이 영역은 애초에 빌드 쓰기 대상이
// 아니어야 하며, 같은 값 허용은 나중 변경이 제어 바이트를 조용히 덮는 길을 남긴다.
{
  const intrusions = [];
  const delegatedOwnershipViolations = [];
  let guardedControlIntrusions = 0;
  let delegatedTableWrites = 0;
  const guardedControlWrites = (dictControlRewrite.writes || []).map((rw) => ({
    at: parseInt(rw.at, 16), bytes: bytesFromHex(rw.replacement),
  }));
  for (let wi = 0; wi < writes.length; wi += 1) {
    const [at, bs] = writes[wi];
    const end = at + bs.length;
    if (!(end > at)) continue;
    // 의미 복원을 위해 명시한 0B 제어 재배선만 예외다. 위에서 원본 바이트를
    // exact guard로 확인했고, 여기서도 주소·길이·replacement가 전부 같은
    // writer인지 재확인한다. 일반 대사 writer에는 이 예외가 적용되지 않는다.
    const guardedControl = guardedControlWrites.some((g) => g.at === at
      && g.bytes.length === bs.length && g.bytes.every((v, i) => v === bs[i]));
    for (const p of deliberateBlankSpans) {
      if (p.s >= end) break;
      if (at < p.e && p.s < end) {
        if (guardedControl) { guardedControlIntrusions += 1; continue; }
        intrusions.push({ wi, at, end, protectedStart: p.s, protectedEnd: p.e,
          source: p.source, note: p.note });
        if (intrusions.length >= 100) break;
      }
    }
    for (const p of deliberateBlankDelegatedSpans) {
      if (p.s >= end) break;
      if (at < p.e && p.s < end) {
        // 위임 스팬은 표·폰트·사전 writer가 모이는 WRITES_TABLE_END 앞쪽 또는
        // exact-original 0B 재배선만 소유한다. 일반 대사/아레나 writer가 닿으면
        // "위임"을 빌미로 제어·UI 바이트를 삼킬 수 있으므로 실패한다.
        const guardedWarMessage = warMessageWriteKeys.has(`${at}:${Buffer.from(bs).toString('hex')}`);
        const guardedNativeTable = nativeTableWriteKeys.has(`${at}:${Buffer.from(bs).toString('hex')}`);
        if (wi < WRITES_TABLE_END || guardedControl || guardedWarMessage || guardedNativeTable) {
          delegatedTableWrites += 1; continue;
        }
        delegatedOwnershipViolations.push({ wi, at, end, delegatedStart: p.s,
          delegatedEnd: p.e, source: p.source, note: p.note });
        if (delegatedOwnershipViolations.length >= 100) break;
      }
    }
    if (intrusions.length >= 100 || delegatedOwnershipViolations.length >= 100) break;
  }
  if (intrusions.length) {
    const sample = intrusions.slice(0, 12).map((x) =>
      `write#${x.wi} $${x.at.toString(16)}..$${x.end.toString(16)} → `
      + `보존 $${x.protectedStart.toString(16)}..$${x.protectedEnd.toString(16)}(${x.source})`).join(' / ');
    throw new Error(`비대사·제어 스팬 쓰기 침범 ${intrusions.length}${intrusions.length >= 100 ? '+' : ''}건: ${sample}`);
  }
  if (delegatedOwnershipViolations.length) {
    const sample = delegatedOwnershipViolations.slice(0, 12).map((x) =>
      `write#${x.wi} $${x.at.toString(16)}..$${x.end.toString(16)} → `
      + `위임 $${x.delegatedStart.toString(16)}..$${x.delegatedEnd.toString(16)}(${x.source})`).join(' / ');
    throw new Error(`전용 표/사전 스팬 소유권 위반 ${delegatedOwnershipViolations.length}`
      + `${delegatedOwnershipViolations.length >= 100 ? '+' : ''}건: ${sample}`);
  }
  console.log(`비대사·제어 스팬 무쓰기 관문: ${deliberateBlankSpans.length}/${deliberateBlankSpans.length}`
    + ` · 전용 표/사전 소유권 ${deliberateBlankDelegatedSpans.length}/${deliberateBlankDelegatedSpans.length}`
    + (delegatedTableWrites ? ` (허용 겹침 ${delegatedTableWrites})` : '')
    + (guardedControlIntrusions ? ` · 원본검증 0B 재배선 예외 ${guardedControlIntrusions}` : ''));
}

const adaptivePadding = adaptivePlanner.metadata(writes);
const adaptiveIntent = new Map([...adaptivePadding.spans, ...adaptivePadding.handoffs].map(p => [p.markerStart, p]));
console.log(`동적 저작 패딩: ${adaptivePadding.rows.length} 아레나 · 채움 ${adaptivePadding.spans.length} · 원문 개행 이양 ${adaptivePadding.handoffs.length} · 문맥 보류 ${adaptivePadding.deferred.length}`);
// 2026-09-15 malto: contextual sources must own a shadow trigger (the dispatcher hooks TRG4; an in-place row is never dispatched)
if (c2Text) { const trigSet = new Set(shadowRows.map((x) => x[0])); const untriggered = c2Text.contextualText.entries.filter((e) => !trigSet.has(Number(e.source)));
  if (untriggered.length) throw new Error(`문맥 치환 source 가 그림자 행이 아님(디스패처 불도달) ${untriggered.length}: ` + untriggered.slice(0, 8).map((e) => `${e.id}@${Number(e.source).toString(16)}`).join(' ')); }
const end16Audit = end16Guard.audit({ arenaRows, shadowDir, contextualEntries: c2Text ? c2Text.contextualText.entries : [] });
{ const st = end16Guard.metadata().stats; console.log(`native end16 관문: 아레나 ${end16Audit.arenaChecked} · 문맥 payload ${end16Audit.contextualChecked} · 충돌 ${end16Audit.collisions.length} · 행 이동 ${st.rowsBumped}(건너뜀 ${st.bytesSkipped}B) · 틈 재사용 ${st.fragmentsReused}(${st.fragmentBytesReused}B) · 소유 선언 없는 행 ${st.sourcesWithoutOwnership}`); }
if (end16Guard.enabled && end16Audit.collisions.length) throw new Error(`native end16 충돌 ${end16Audit.collisions.length}: ` + end16Audit.collisions.slice(0, 5).map(c => `${c.kind} ${c.source}@${c.at}+${c.offset}=${c.end16}`).join(' '));
// 모든 아레나·payload 배치가 끝난 지금 구간을 유도한다(근본 수리 — computeRegions 주석 참고).
const regions = computeRegions();
console.log(`구간 선언: ${regions.length}개 — ${regions.map((g) => `$${g.bank.toString(16)}:${g.lo.toString(16)}..${g.hi.toString(16)}`).join(' ')}`);
// 구운 것이 전부 구간 안인지 여기서 바로 막는다 — ROM 을 만들기 전에 잡아야 실기까지 새지 않는다.
{
  const byBankR = new Map();
  for (const g of regions) { if (!byBankR.has(g.bank)) byBankR.set(g.bank, []); byBankR.get(g.bank).push([g.lo, g.hi]); }
  const inRegion = (fileAddr) => (byBankR.get(cpuBankOfFile(fileAddr >>> 16)) || [])
    .some(([lo, hi]) => (fileAddr & 0xffff) >= lo && (fileAddr & 0xffff) < hi);
  const escaped = [];
  for (const [src, at, n] of arenaRows) { if (n > 512) continue; if (!inRegion(at) || !inRegion(at + n - 1)) escaped.push([src, at, n]); }
  for (const [src, at, n] of utteranceDirectPayload.rows) { if (!inRegion(at) || !inRegion(at + n - 1)) escaped.push([src, at, n]); }
  if (escaped.length) {
    throw new Error(`캐리어 구간 밖 payload ${escaped.length}: `
      + escaped.slice(0, 6).map(([s, a, n]) => `${s.toString(16)}→${a.toString(16)}(${n}B)`).join(' ')
      + ' — 엔진이 이 payload 의 FF BACK 을 순정 opcode 로 읽어 이벤트가 복귀하지 못한다');
  }
}
  const out = {
  schema: 'rs3-halfcell-julian-patch-v1',
  built: new Date().toISOString(),
  arenaBankCpu: ARENA_BANK_CPU,
  // 출발 CPU 뱅크(hex) → 아레나 CPU 뱅크.  롬 빌더가 $FF:E300 표를 이걸로 채운다.
  arenaBanks: Object.fromEntries([...arenaOf.entries()]
    .map(([fb, A]) => [cpuBankOfFile(fb).toString(16), cpuBankOfFile(A.fb)])),
  arenaFile: [...arenaOf.values()].map((A) => [A.lo, A.cur]),
  regions,
  stats: { rows: rows.length, inline, warped, skipped: skipped.length, chars: ranked.length,
    singles: Math.min(175, ranked.length), wides: Math.max(0, ranked.length - 175),
    dict: dictPlan.size, dictFail: dictFail.length,
    arenaBytes: [...new Set(arenaOf.values())].reduce((n, A) => n + (A.cur - A.lo), 0) },
  // 안전 전체 빌드는 이 중 하나라도 있으면 ROM 생성을 막는다. 예전에는 빌더가
  // 문장부호/음절/공백/동적 이름을 조용히 버린 뒤 자기 결과와만 대조해 통과했다.
  lossy: {
    skipped: skipped.map(([s, why]) => [s.toString(16), why]),
    fragmentCuts: fragCut.map(([s, region, count, text]) => [s.toString(16), region, count, text]),
    syllableCuts: cutStats.map(([s, count, text]) => [s.toString(16), count, text]),
    punctuationTrims: trimStats.map(([s, count]) => [s.toString(16), count]),
    leadingSpacesDropped: spaceDropped,
    dynamicPartyNamesDropped: drop39Rows,
    crossRowTextMoves: flowMoveStats,
  },
  assignment: Object.fromEntries([...assign.entries()].map(([c, a]) => [c, a.n])),
  shadowRows, arenaRows, shadowTable, shadowDir, shortDirectWarpRows, utteranceDirectPayload, adaptivePadding,
  integratedOutputEngine,
  // 2026-09-17 원천 표 소유 선언 적용 결과(QC 문안 재현 관문이 이 구간의 TSV 행을 원천 표 소유로 센다)·원천 표 수리 계획(ROM 단계가 되읽는다)
  nativeTableOwnership, nativeTableRepairs,
  nativeEnd16Guard: end16Guard.metadata(end16Audit),
  ...(c2Text ? { contextualText: c2Text.contextualText, textHelperChain: c2Text.textHelperChain, c2TextGenerators: { schema: 'bokuno-c2-text-generators-v1', summary: c2Text.summary } } : {}),
  reviewedLiteralGroups,
  dynamic0bDirectArenaRows: [...DYNAMIC_0B_DIRECT_ARENA_ROWS].sort((a, b) => a - b),
  protectedNonTextSpans: deliberateBlankSpans.map((p) =>
    [p.s, p.e, p.source, p.note]),
  delegatedNonDialogueSpans: deliberateBlankDelegatedSpans.map((p) =>
    [p.s, p.e, p.source, p.note]),
  protectedNonTextEmptyMarkers: deliberateBlankEmptyMarkers,
  in33,
  // 표에 실린 색인 — 그중 fromLedger 는 이 원장이 실제로 감싼 것,
  // 나머지는 정답지에서만 온 것이다(그 칸이 되면 "표가 정본"이 실증된다).
  dict: Object.fromEntries([...dictPlan.entries()].map(([k, d]) => [k, d.ko])),
  dictFromLedger: [...ledgerDictKeys],
  // **실제로 구운 행**의 스팬 — 검수 덤프가 이걸 써야 한다.  원장을 그대로 읽으면
  //   겹쳐서 버린 스팬까지 읽어 남의 행 중간이 나온다(실측: 걸린 행 143 중 대부분).
  rowSpans: rows.filter((r) => r.mode).map((r) => [r.s, r.e]),
  gates, skipped, dictFail,
  writes: writes.map(([o, b]) => [o, Buffer.from(b).toString('hex')]),
};
const patchInputReceipt=sourceInputs.receipt(Buffer.from(JSON.stringify(out,null,1)),ROUTE);
writeFileSync(path.join(BUILD_OUT, `halfcell_${TAG}_patch_v1.json`), JSON.stringify(out, null, 1));
writeFileSync(path.join(BUILD_OUT, `halfcell_${TAG}_patch_v1.inputs.json`),JSON.stringify(patchInputReceipt,null,2)+'\n');
if (fragCut.length) console.log(`조각 깎음: ${fragCut.length}자리 — ${fragCut.map((x) => x[0].toString(16) + '#' + x[1] + '「' + x[3].slice(-8) + '」').join(' ')}`);
if (asIs) console.log(`원문 매크로 그대로 둔 행: ${asIs}`);
if (cutStats.length) console.log(`마지막 수단으로 음절 깎음: ${cutStats.length}행 (${cutStats.reduce((n, x) => n + x[1], 0)}음절) — ${cutStats.slice(0, 8).map((x) => x[0].toString(16) + '「' + x[2] + '」').join(' ')}`);
if (spaceDropped) console.log(`자리가 없어 뺀 앞 공백: ${spaceDropped}곳`);
if (rewrap) console.log(`평문 이름을 매크로로 되감은 행: ${rewrap}`);
if (drop39Rows.length) console.log(`  39 빠진 자리: ` + drop39Rows.map((x) => x[0] + " 「" + x[1] + "」").join(" · "));
if (drop39) console.log(`파티 슬롯(39)이 빠진 행: ${drop39}`);
if (trimStats.length) console.log(`자리 맞추려 끝 문장부호 깎음: ${trimStats.length}행 (총 ${trimStats.reduce((n, x) => n + x[1], 0)}자)`);
console.log(`빌드: 행 ${rows.length} = 제자리 ${inline} + 워프 ${warped} + 팔 ${armFixed} + 포기 ${skipped.length}`);
console.log(`배정: ${ranked.length}자 (1B ${Math.min(175, ranked.length)} · 와이드 ${Math.max(0, ranked.length - 175)}) · 사전 ${dictPlan.size}/${dictNames.size}항목`);
console.log(`아레나: ${[...arenaOf.values()].reduce((n, A) => n + (A.cur - A.lo), 0)}B`
  + ` · 뱅크 ${[...arenaOf.entries()].filter(([, A]) => A.cur > A.lo).length}개`
  + ` (${[...arenaOf.entries()].filter(([, A]) => A.cur > A.lo)
      .map(([fb, A]) => `$${cpuBankOfFile(fb).toString(16)}→$${cpuBankOfFile(A.fb).toString(16)} ${((A.cur - A.lo) / 1024).toFixed(1)}K`).join(' ')})`);
if (skipped.length) console.log('포기:', skipped.map(([s, why]) => s.toString(16) + '(' + why + ')').join(' '));
if (dictFail.length) console.log('사전 실패:', JSON.stringify(dictFail));
// 못 구운 행을 파일로 남긴다 — 손볼 대상 목록이다(사유별로 할 일이 다르다).
{
  const byRow = new Map(rows.map((r) => [r.s, r]));
  const rep = skipped.map(([s2, why]) => {
    const r = byRow.get(s2);
    const NLC = String.fromCharCode(10);
    const bad = r ? [...r.text].filter((c) => c !== NLC && c !== ' ' && !assign.has(c === ' ' ? '␣' : c)) : [];
    return { at: s2.toString(16), why, ko: r ? r.text.split(NLC).join(' / ') : '', slotless: [...new Set(bad)].join('') };
  });
  writeFileSync(path.join(BUILD_OUT, `halfcell_${TAG}_skipped_v1.json`), JSON.stringify({
    total: rep.length,
    byReason: rep.reduce((m, x) => { const k = x.why.replace(/[0-9]+/g, 'N'); m[k] = (m[k] || 0) + 1; return m; }, {}),
    slotlessChars: [...new Set(rep.flatMap((x) => [...x.slotless]))].join(''),
    rows: rep,
  }, null, 1));
  writeFileSync(path.join(BUILD_OUT, `halfcell_${TAG}_armdiag_v1.json`), JSON.stringify(armDiag, null, 1));
  console.log(`못 구운 행 목록 → out/halfcell_${TAG}_skipped_v1.json · 자리부족 진단 ${armDiag.length}행`);
}

// ---- 정적 전수 검수: 사본 적용 → 도로 디코드 → 원장 대조 ----
let noMode = 0;
const patched = Buffer.from(rom);
// **겹쳐 쓰기 관문** (2026-08-27) — 한 바이트에 두 writer 가 **다른 값**을 쓰면 나중 것이
//   조용히 이긴다. 메뉴 풀 라벨이 남의 라벨 바이트를 덮어 그 라벨을 통째로 깬 게 이 부류다.
//   같은 값 중복은 무해하니 세기만 하고, **값이 다른 겹침**만 결함으로 본다.
{
  const owner = new Map();            // 오프셋 → [쓴 값, 몇 번째 write]
  const clash = []; let yielded = 0;
  writes.forEach(([o, bs], wi) => {
    for (let i = 0; i < bs.length; i += 1) {
      const at = o + i, v = bs[i] & 0xff;
      const prev = owner.get(at);
      // 선언된 겹침: 표·메뉴(앞) → 대사 행(뒤). 그 외는 결함이다.
      const declared = prev !== undefined && prev[1] < WRITES_TABLE_END && wi >= WRITES_TABLE_END;
      if (prev !== undefined && prev[0] !== v && !declared) clash.push([at, prev[0], v, prev[1], wi]);
      if (declared && prev[0] !== v) yielded += 1;
      owner.set(at, [v, wi]);
    }
  });
  const dup = writes.reduce((t, [, bs]) => t + bs.length, 0) - owner.size;
  console.log(`쓰기 계획: ${writes.length}건 · 바이트 ${owner.size} · 같은 값 중복 ${dup} · 대사 행에 양보 ${yielded} · **미선언 충돌 ${clash.length}**`);
  if (clash.length) {
    const head = clash.slice(0, 8).map(([at, x, y, i1, i2]) => `0x${at.toString(16)} ${x.toString(16)}→${y.toString(16)} (write ${i1}→${i2})`);
    console.log("  " + head.join(" / ") + (clash.length > 8 ? ` … 외 ${clash.length - 8}` : ""));
    writeFileSync(path.join(PROJECT, "out", "write_clashes_v1.json"), JSON.stringify(
      clash.map(([at, x, y, i1, i2]) => ({ off: "0x" + at.toString(16), from: x, to: y, writeA: i1, writeB: i2,
        spanA: "0x" + writes[i1][0].toString(16) + "+" + writes[i1][1].length,
        spanB: "0x" + writes[i2][0].toString(16) + "+" + writes[i2][1].length })), null, 1));
    // 기본 켜짐 — 미선언 겹침은 결함이다(RS3_CLASH_STRICT=0 으로만 끈다).
    if (process.env.RS3_CLASH_STRICT !== "0") throw new Error(`미선언 쓰기 충돌 ${clash.length}건 — out/write_clashes_v1.json`);
  }
}
for (const [o, b] of writes) for (let i = 0; i < b.length; i += 1) patched[o + i] = b[i];
const rev = new Map();                             // n → ch
for (const [c, a] of assign) rev.set(a.n, c);
const macroName = (op, idx) => dictPlan.get(`${op.toString(16)}:${idx}`)?.ko;
const decodeRun = (buf, a, end, stopAtFF) => {
  let s = '';
  while (a < end) {
    // Decode registered author intent for text-loss QC. The live helper decides
    // whether the pad consumes cells; this is not a screen/line-count claim.
    const padIntent = adaptiveIntent.get(a);
    if (padIntent && padIntent.markerEnd <= end) { s += '\n'; a = padIntent.markerEnd; continue; }
    const b = buf[a];
    if (b === 0xff && stopAtFF) return { s, a };
    if (b === 0x4f || b === 0xfd) { a += 1; continue; }  // 무동작 패딩(스톡 4F · 우리 FD)
    if (b === 0x50) { s += ' '; a += 1; continue; }
    if (b === 0x24) { s += '\n'; a += 1; continue; }
    if (b === 0x2c) { s += '\f'; a += 1; continue; }
    // 3A 는 인수가 $EF00 을 거치므로 **정적으로 어느 이름이 나오는지 모른다**.
    // 표 색인으로 읽어 이름을 적으면 거짓 대조가 된다 — 자리표시로 남긴다.
    if (b === 0x3a) { s += '{M|＊}'; a += 2; continue; }
    if (MACRO_OPS.has(b)) { const nm = b === 0x39 ? '＿' : macroName(b, buf[a + 1]); s += nm ? `{M|${nm}}` : '{M|?}'; a += 2; continue; }
    if (b === 0x18 || b === 0x46) { const n = (b === 0x18 ? 0x400 : 0x500) | buf[a + 1]; s += rev.get(n) ?? '?'; a += 2; continue; }
    if (b >= 0x20 && b <= 0x23) { const n = ((b - 0x20) << 8) | buf[a + 1]; s += rev.get(n) ?? '?'; a += 2; continue; }
    if (b >= 0x51) { s += rev.get(b - 0x50) ?? '?'; a += 1; continue; }
    return { s: s + `[${b.toString(16)}]`, a };
  }
  return { s, a };
};
let pass = 0; const fails = [];
let utteranceDirectVerified = 0;
for (const r of rows) {
  if (!r.mode) { noMode += 1; continue; }
  // 2026-09-17 발화 payload 직접 행: 행 글(원장·TSV)은 발화 payload 가 대신한다 — 글 대조 대신 머리 FE → (넓은 배치면 발판 FF) → payload 바이트·팔 복귀를 되읽는다.
  //   (전엔 'arm' 모드 행만 옛 warpOf 아레나를 읽어 우연히 통과했고, 강제 개행 직접 행은 FE 피연산자 ≠ 행 아레나로 실패했다.)
  if (UTTERANCE_DIRECT_ROWS.has(r.s) && utteranceDirectBytes.size) {
    const u = utteranceDirectPayload.rows.find((x) => x[0] === r.s), stub = utteranceDirectPayload.stubs.find((x) => x[0] === r.s), A = arenaFor(r.s);
    if (!u || !A) { fails.push([r.s, '발화 payload 직접 행 설치 기록 없음']); continue; }
    const entryAt = stub ? stub[1] : u[1];
    if (patched[r.s] !== 0xfe || (patched[r.s + 1] | (patched[r.s + 2] << 8)) !== (entryAt & 0xffff) || (entryAt >> 16) !== A.fb) { fails.push([r.s, '발화 payload 직접 행 FE 진입 불일치']); continue; }
    if (stub && [0xff, stub[2] & 0xff, (stub[2] >> 8) & 0xff, cpuBankOfFile(stub[2] >> 16)].some((b, i) => patched[stub[1] + i] !== b)) { fails.push([r.s, '발화 payload 발판 불일치']); continue; }
    const want = utteranceDirectBytes.get(r.s) || [];
    if (want.length !== u[2] || want.some((b, i) => patched[u[1] + i] !== b)) { fails.push([r.s, '발화 payload 직접 행 바이트 불일치']); continue; }
    const backs = payloadBacks(patched.subarray(u[1], u[1] + u[2]));
    if (!backs || [...backs].some((b) => !(b >= r.e && b - r.s <= 0x1000))) { fails.push([r.s, `발화 payload 직접 행 복귀 불일치 ${backs ? [...backs].map((b) => b.toString(16)).join('/') : '걷기 실패'}`]); continue; }
    pass += 1; utteranceDirectVerified += 1;
    continue;
  }
  let decoded;
  if (r.mode === 'inline') {
    decoded = decodeRun(patched, r.s, r.tEnd, false).s;
  } else if (r.mode === 'armtext') {
    // 조각별 저작: 조각마다 그 조각의 저작문과 대조한다(행 단위 대조는 무의미 —
    // 조각들은 서로 대체 관계라 하나의 문장으로 이어지지 않는다)
    let allOk = true;
    r.regions.forEach((reg, ri) => {
      const g = (reg.warpTo !== undefined
        ? decodeRun(patched, reg.warpTo, arenaFor(r.s) ? arenaFor(r.s).hi : 0, true).s
        : decodeRun(patched, reg.a, reg.a + reg.n, false).s).replace(/\s+$/g, '');
      const w2 = r.texts[ri].replace(/\s+$/g, '');
      if (g !== w2) { allOk = false; fails.push([r.s, `조각${ri} 「${g}」≠「${w2}」`]); }
    });
    if (allOk) pass += 1;
    continue;
  } else if (r.mode === 'suppress') {
    const hit = shadowRows.find((x) => x[0] === r.s);
    if (!hit) { fails.push([r.s, '본문 흡수 그림자 없음']); continue; }
    const A = arenaFor(r.s);
    if (!A) { fails.push([r.s, '본문 흡수 아레나 미배정']); continue; }
    const d = decodeRun(patched, hit[1], A.hi, true);
    const bo = patched[d.a + 1] | (patched[d.a + 2] << 8), bb = patched[d.a + 3];
    if (bo !== (r.back & 0xffff) || bb !== cpuBankOfFile(r.s >> 16)) {
      fails.push([r.s, `본문 흡수 BACK 불일치 ${bo.toString(16)}/${bb.toString(16)}`]); continue;
    }
    pass += 1;
    continue;
  } else if (r.mode === 'forced-newline-arena') {
    const hit = shadowRows.find((x) => x[0] === r.s);
    if (!hit) { fails.push([r.s, '강제 개행 그림자 없음']); continue; }
    const A = arenaFor(r.s);
    if (!A) { fails.push([r.s, '강제 개행 아레나 미배정']); continue; }
    const d = decodeRun(patched, hit[1], A.hi, true);
    decoded = d.s;
    const bo = patched[d.a + 1] | (patched[d.a + 2] << 8), bb = patched[d.a + 3];
    if (bo !== (r.back & 0xffff) || bb !== cpuBankOfFile(r.s >> 16)) {
      fails.push([r.s, `강제 개행 BACK 불일치 ${bo.toString(16)}/${bb.toString(16)}`]); continue;
    }
  } else if (r.mode === 'forced-newline-direct-arena') {
    if (patched[r.s] !== 0xfe) { fails.push([r.s, '강제 개행 직접 FE 없음']); continue; }
    const target = patched[r.s + 1] | (patched[r.s + 2] << 8);
    const A = arenaFor(r.s);
    if (!A || ((r.arena || 0) & 0xffff) !== target) {
      fails.push([r.s, '강제 개행 직접 아레나 불일치']); continue;
    }
    const d = decodeRun(patched, r.arena, A.hi, true);
    decoded = d.s;
    const bo = patched[d.a + 1] | (patched[d.a + 2] << 8), bb = patched[d.a + 3];
    if (bo !== (r.back & 0xffff) || bb !== cpuBankOfFile(r.s >> 16)) {
      fails.push([r.s, `강제 개행 직접 BACK 불일치 ${bo.toString(16)}/${bb.toString(16)}`]); continue;
    }
  } else if (r.mode === 'arm') {
    // 팔 경로: 구간을 이어 읽는다.  사이 제어는 화면에 글자를 안 내므로 그냥
    // 붙인다(원문 개행은 줄만 나눈다).  마지막 구간이 워프면 아레나를 따라간다
    decoded = r.runs.map((run, ri) => {
      // 대체 조각은 본문의 사본이라 이어 읽지 않는다(읽으면 두 번 센다)
      if (r.altIdx && r.altIdx.has(ri)) return '';
      // 앞 구간과 사이에 원문 개행이 있으면 줄바꿈으로 되살려 읽는다
      let pre = '';
      if (ri > 0) {
        const prev = r.runs[ri - 1];
        for (let k = prev.a + prev.n; k < run.a; k += 1) if (patched[k] === 0x24) { pre = '\n'; break; }
      }
      if (r.warpOf && r.warpOf.has(run.a)) {
        const d2 = decodeRun(patched, r.warpOf.get(run.a), arenaFor(r.s) ? arenaFor(r.s).hi : 0, true);
        const bo = patched[d2.a + 1] | (patched[d2.a + 2] << 8);
        if (bo !== ((run.a + run.n) & 0xffff)) fails.push([r.s, 'BACK 불일치(팔)']);
        return pre + d2.s;
      }
      return pre + decodeRun(patched, run.a, run.a + run.n, false).s;
    }).join('');
  } else {
    if (patched[r.s] !== 0xfe) { fails.push([r.s, 'FE 없음']); continue; }
    const t = patched[r.s + 1] | (patched[r.s + 2] << 8);
    const A = arenaFor(r.s);
    if (!A) { fails.push([r.s, '아레나 미배정']); continue; }
    const fileT = (A.lo & 0xff0000) | t;
    const d = decodeRun(patched, fileT, A.hi, true);
    decoded = d.s;
    const bo = patched[d.a + 1] | (patched[d.a + 2] << 8), bb = patched[d.a + 3];
    if (bo !== (r.tEnd & 0xffff) || bb !== cpuBankOfFile(r.s >> 16)) { fails.push([r.s, `BACK 불일치 ${bo.toString(16)}/${bb.toString(16)}`]); continue; }
  }
  // 우리가 붙인 접힘 보상 개행은 대조에서 뗀다(원장 텍스트엔 없다)
  // 팔 경로는 구간이 흩어져 패딩이 사이에 끼므로 공백류를 접어서 대조한다
  // 줄 나눔은 **원문이 정한다**(개행은 제어로 제자리 고정).  원장이 한 줄로
  // 적은 자리에 원문 개행이 들어 있을 수 있으므로(3C2101: 이름 뒤 개행),
  // 대조는 공백류를 무시한다 — 글자 순서·누락은 그대로 잡힌다.
  const norm = (x) => (r.mode === 'arm' ? x.replace(/\s+/g, '') : x.replace(/ +$/g, ''));
  // 3A 가 낀 행은 양쪽의 매크로 토큰을 **전부** 자리표시로 접어 대조한다.
  // ($EF00 을 거치는 3A 의 이름은 실기 몫이다.  자리·개수·본문은 그대로 검사된다.)
  const opaque = (x) => x.replace(MACRE, '{M|＊}');
  const anyEF = decoded.includes('{M|＊}');
  const want = norm(anyEF ? opaque(r.text) : r.text);
  const got = norm(anyEF ? opaque(decoded) : decoded);
  if (got === want) pass += 1;
  else if (r.trim33 && got.length > 0 && want.startsWith(got)) { pass += 1; in33.verifyTrims = (in33.verifyTrims || 0) + 1; }
  else fails.push([r.s, `대조 실패 「${got}」≠「${want}」`]);
}
// 사전 왕복
let dictPass = 0; const dictBad = [];
for (const [key, d] of dictPlan) {
  const got = decodeRun(patched, d.off, d.off + d.bytes.length, false).s.replace(/ +$/g, '')
    .replaceAll('␣', ' ');
  if (got === d.ko) dictPass += 1; else dictBad.push([key, got, d.ko]);
}
{
  const byMode = {};
  for (const r of rows) byMode[r.mode || 'none'] = (byMode[r.mode || 'none'] || 0) + 1;
  console.log('모드 분포', JSON.stringify(byMode), '· pass', pass, '· fail', fails.length);
}
if (noMode) console.log(`검수에서 빠진 행(모드 없음): ${noMode}`);
console.log(`검수: 본문 ${pass}/${pass + fails.length} 통과(실패 ${fails.length}) · 사전 ${dictPass}/${dictPlan.size} 통과`);
if (UTTERANCE_DIRECT_ROWS.size) console.log(`  발화 payload 직접 행 되읽기 ${utteranceDirectVerified}/${UTTERANCE_DIRECT_ROWS.size}(행 글 대조 대신 FE→발판→payload 바이트·복귀)`);
// 우리가 원장 문장을 고친 자리 전량 — 검수는 이걸 못 잡는다(고친 뒤와 대조하므로)
{
  const ch = rows.filter((r) => r.mode && r.text !== r.origText)
    .map((r) => ({ at: r.s.toString(16), before: r.origText, after: r.text }));
  writeFileSync(path.join(BUILD_OUT, `halfcell_${TAG}_textchanges_v1.json`), JSON.stringify(ch, null, 1));
  const shrunk = ch.filter((x) => [...x.after.replace(MACRE, '')].length < [...x.before.replace(MACRE, '')].length);
  console.log(`원장 문장을 고친 행 ${ch.length} (그중 **짧아진 행 ${shrunk.length}**) → out/halfcell_${TAG}_textchanges_v1.json`);
}
if (fails.length) { console.log('실패:'); fails.slice(0, 10).forEach(([s, m]) => console.log(' ', s.toString(16), m)); }
if (dictBad.length) console.log('사전 실패:', JSON.stringify(dictBad.slice(0, 5)));
if (fails.length || dictBad.length) process.exit(1);
if (process.env.RS3_FAIL_ON_LOSSY === '1') {
  const lossy = [
    ['포기', skipped.length],
    ['조각 깎음', fragCut.length],
    ['음절 깎음', cutStats.length],
    ['문장부호 깎음', trimStats.length],
    ['앞 공백 제거', spaceDropped],
    ['동적 파티 이름 제거', drop39],
    ['이웃 행으로 문안 이동', flowMoveStats.length],
  ].filter(([, count]) => count > 0);
  if (lossy.length) {
    // 어느 행인지 같이 낸다 — 수리 배치가 커지면 수치만으로는 못 찾는다(2026-09-03).
    const hex = (v) => (typeof v === 'number' ? v.toString(16) : String(v));
    const detail = [
      ['포기', skipped.slice(0, 8).map((x) => `${hex(x[0])}(${x[1]})`)],
      ['조각 깎음', fragCut.slice(0, 8).map((x) => hex(x[0]))],
      ['음절 깎음', cutStats.slice(0, 8).map((x) => `${hex(x[0])}×${x[1]}`)],
      ['문장부호 깎음', trimStats.slice(0, 8).map((x) => `${hex(x[0])}×${x[1]}`)],
      ['이웃 행으로 문안 이동', flowMoveStats.slice(0, 8).map((x) => (x && typeof x === 'object' && !Array.isArray(x)) ? JSON.stringify(x).slice(0, 160) : hex(Array.isArray(x) ? x[0] : x))],
    ].filter(([, arr]) => arr.length).map(([n, arr]) => `${n}: ${arr.join(' ')}`).join(' | ');
    throw new Error(`손실 없는 전체 빌드 관문 실패: ${lossy.map(([name, count]) => `${name} ${count}`).join(' · ')} — ${detail}`);
  }
  console.log('손실 없는 전체 빌드 관문: 포기/자동축약/공백삭제/동적이름삭제 0');
}
