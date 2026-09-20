#!/usr/bin/env node
// utterance_compiler_v2.mjs — 발화 원본(주인공별 완성 문장) → stem 선언 컴파일러 v2 (2026-09-16, 사용자 「0Bxx 부터 다 처리해」).
//   v1f(tools/utterance_compiler_v1.mjs)를 잇는다. 같은 입력에서 v1f 가 통과시킨 발화는 같은 항목을 낸다(회귀 대조). 남은 동적 대사 이관에서 거부된 원인군을 받는다:
//   ① 조각 본문 발화: 발화 표 srcKind 'F'(08~0B 조각 행만 있는 공용 메시지 — utterance_table_v1 09-16). 조각 행 자체를 source 범위 진입으로 쓴다.
//   ② 구간 나눔: 끝 대기가 있는 발화에서 걷기가 조건 검사·점프·반환·연출 op(분기 없는 op 목록 밖)에서 멈추면 발화 표 키가 이어지는 주소부터 다시 걷는다.
//      구간마다 진입·복귀·하위 구간이 따로다. 이어지는 키가 조각 행이면 앞 구간 끝 뒤에서 그 조각을 부르는 op 를 찾아 거기서 걷는다.
//   ③ E형(끝 대기 없음)은 첫 구간만 쓰고 그 밖(앞으로 뛴 주소 포함) 키부터 꼬리(v1e — 작성 문장은 꼬리로 끝나야 함).
//   ④ 비등급 갈래: 같은 주인공·진입에서 글이 다른 경로를 경로마다 따로 걷는다. 발화 원본 variant 는 migrated-unchanged 면 글 일치로, 작성본은 was(그 경로 옛 한국어)로 가린다.
//      같은 구간을 두 갈래가 지나면 키·고친 글이 같을 때만 하나로 합친다.
//   ⑤ 여러 곳 고침: 진입 하나로 못 덮으면 주인공마다 고친 문장을 옛 키 글에 정렬(안 바뀐 키 = 닻)해 바뀐 곳마다 진입을 둔다.
//      진입 후보: 최상위 그림자 행(source 범위) → 부른 조각 안 그림자 행(호출 자리 복귀 키 depth 1·2 = stem callers) → 그림자 아닌 제자리 행 중
//      빌더가 아레나+그림자로 바꿀 수 있는 행(forceShadowRows — 머리 HOOKABLE·그림자 금지 지대 밖·WATCH17 밖·행 안 33/4E 없음).
//   ⑥ 발화 원본이 있는 다른 발화 경로가 진입을 지나면 그 경로 문장도 정렬로 잘라 팔에 넣는다(v1f 는 거부).
//   ⑦ 발화 원본 supersedesContextual: 같은 source 의 손으로 만든 source 범위 문맥 치환을 이 payload 가 대신한다(빌더 mergeSpeechArms 가 그 항목을 뺀다).
//   ⑧ 이름 토큰이 원본 범위에 없어도 그 경로 현재 한국어에 이미 있으면 경고.
//   디스패처 규칙(rs3_contextual_text_stream_v1): 한 source 에 source 범위 항목 하나, 또는 호출 자리 항목들만 — 섞이면 거부한다.
//   ⟦|⟧ 없이 작성한 문장은 정렬로 하위 구간을 나눠 보고(경고), 경계가 바뀐 글 한가운데면 거부한다.
//   v2h(2026-09-17, 조각 틀): 걷기를 엔진 조각 틀과 맞춘다 — 34 chkBit(A9) 등급 검사, 검사 참·거짓 착지 호출 모두 꼬리 이송, 조각 몸통 출발은 그 조각 끝에서 멈춤,
//      조각 호출 안에서 멈추면 그 호출 op 로 돌아가 호출 안 글은 원래 행에 맡김. 마지막 관문: 복귀가 진입과 다른 조각 틀이면 거부(frameOk).
//      계기: v2g 가 최상위 진입 payload 를 조각 몸통으로 돌려보내 0x0CF0 율리안 대사가 「돌아오겠」에서 끊겼다(U-3A1082·U-3A109C, 실코어 PNG),
//      0x084E 3C2499 payload 가 0850 몸통으로 돌아가 옆 조각 글이 이어 찍혔다.
//   v2i(2026-09-17, 사용자 「남은것 너무 큰문젠데」): 구조 거부 29 중 진입·용량 부류를 연다 — ① 직접 FE 행의 강제 개행·TSV 제외 해제 ② 제자리 행(실기 PPU 직접 워프 행·
//      그림자 금지 지대, 스팬≥3)을 FE 직접 워프로 바꾸는 진입(directConvertRows) ③ 출발 뱅크 아레나에 안 들어가는 직접 payload 는 넓은 배치(wideDirectRows,
//      아레나엔 FF 발판 4B·payload 는 빌더가 여유 구역에). 예전 통과 항목은 먼저 같은 순서로 채워 배치가 안 바뀐다.
// 못 재는 것: v1 과 같음(워커 미도달 경로·교차 이벤트 정적 점프·실제 화면·문안 의미) + 닻 글이 겹치면 정렬이 틀릴 수 있음(되읽기·CPU·빌드 뒤 검증이 잡음),
//   조각 이어짐 호출 자리를 48 op 안에서 못 찾는 경로, 빌더가 forceShadowRows 를 실제로 바꿨는지(빌드 관문).
// 사용: node tools/utterance_compiler_v2.mjs --build <후보> --table <jsonl> --table-all <jsonl> --index <json> --specs <json> --out <json> --report <json>
//        [--dry] [--describe <json>] [--propagated-specs <json>]
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'fs';
import { execFileSync } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { createNativeOps } from './rs3_native_ops_v30.mjs';
import { compilePayload, renderForClass, parseRange, CLASS_NAMES } from './rs3_speech_arms_compiler_v1.mjs';
import { JOSA_PAIRS } from './rs3_josa_hook_v1.mjs';
import { COPULA_PUA } from './rs3_copula_hook_v1.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');
const ROOT = path.resolve(PROJECT, '..');
const H = (n) => Number(n).toString(16).toUpperCase().padStart(6, '0');
const arg = (k, d = null) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const sha = (buf) => createHash('sha256').update(buf).digest('hex').toUpperCase();
const SEP = '⟦|⟧';
const VERSION = 'v2i';

const build = arg('build'), tablePath = arg('table'), tableAllPath = arg('table-all'), indexPath = arg('index'), specsPath = arg('specs');
const outPath = arg('out'), reportPath = arg('report'), dry = process.argv.includes('--dry');
const describeOut = arg('describe'), propagatedSpecsOut = arg('propagated-specs');
const describe = {};
if (!build || !tablePath || !tableAllPath || !indexPath || !specsPath || !outPath || !reportPath) {
  console.error('usage: node tools/utterance_compiler_v2.mjs --build <id> --table <jsonl> --table-all <jsonl> --index <json> --specs <json> --out <json> --report <json> [--dry] [--describe <json>] [--propagated-specs <json>]');
  process.exit(2);
}

const rom = readFileSync(path.join(ROOT, 'bokuno_jp.smc'));
const ops = createNativeOps(rom);
const patchBuf = readFileSync(path.join(PROJECT, 'out', 'full_build_candidates', build, 'halfcell_all_patch_v1.json'));
const patch = JSON.parse(patchBuf.toString('utf8'));
const shadow = new Set(patch.shadowRows.map((r) => Number(r[0])));
const rowEndOf = new Map(patch.rowSpans.map((r) => [Number(r[0]), Number(r[1])]));
const rowStart = new Set(rowEndOf.keys());
const arenaRowSet = new Set((patch.arenaRows || []).map((r) => Number(r[0])));
// 직접 FE 워프 행(실기 PPU 증거로 그림자 조회를 안 거치는 행 — runtime/ppu_live_raw_direct_warp_rows_v1 등): 후보 롬에서 행 머리가 FE 인지로 가린다.
//   디스패처는 못 걸지만 빌더가 그 머리 FE 의 목적지를 발화 payload 로 바꾼다(v2d directPayloadRows). 옛 캐리어 꼬리 행은 뺀다.
const candRom = readFileSync(path.join(PROJECT, 'out', 'full_build_candidates', build, 'bokuno_korean_all_halfcell_v1.smc'));
let existingDirectCarriers = new Set();
try { existingDirectCarriers = new Set((JSON.parse(readFileSync(path.join(PROJECT, 'runtime', 'static_existing_direct_arena_rows_v1.json'), 'utf8')).rows || []).map((r) => parseInt(r.source, 16))); } catch {}
// v2i(2026-09-17, 사용자 「남은것 너무 큰문젠데」): 강제 개행 아레나 행·승인 TSV 문안 행도 직접 payload 진입으로 쓴다.
//   두 제외는 도구 한계였다 — 빌더 되읽기는 발화 직접 행의 FE 목적지를 payload 기록과 대조하고(강제 개행 직접 아레나 불일치 해소),
//   TSV 감사는 발화 payload 가 대체한 행을 「발화 대체」로 따로 세며 롬 payload 바이트가 컴파일 결과와 같은지 본다.
const directHeadRow = (a) => arenaRowSet.has(a) && !shadow.has(a) && candRom[a] === 0xfe && (rowEndOf.get(a) - a) >= 3 && !existingDirectCarriers.has(a);
const assignment = patch.assignment;
const hasCopula = Object.prototype.hasOwnProperty.call(assignment, COPULA_PUA);
const psrc = new Map(((patch.contextualText || {}).entries || []).map((e) => [String(e.id), Number(e.source)]));
const pkeysBySource = new Map();
for (const [id, s] of psrc) { if (!pkeysBySource.has(s)) pkeysBySource.set(s, []); pkeysBySource.get(s).push('P:' + id); }
const tableBuf = readFileSync(tablePath);
const table = new Map(tableBuf.toString('utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return [r.uid, r]; }));
const index = JSON.parse(readFileSync(indexPath, 'utf8')).keys;
const specsBuf = readFileSync(specsPath);
const specs = JSON.parse(specsBuf.toString('utf8'));
if (specs.schema !== 'bokuno-utterance-specs-v1') throw new Error(`발화 원본 schema ${specs.schema}`);
const specByUid = new Map((specs.utterances || []).map((s) => [s.uid, s]));
// v2i 두 단계: 새 진입 종류(TSV·강제 개행 직접 행, 제자리 FE 전환)는 **예전(v2h) 진입 종류로 통과하지 못한 발화에만** 연다.
//   한 번에 열면 이미 통과하던 발화가 더 앞의 새 진입을 골라 payload 가 바뀌었다(U-3CDCA5@3B9A70 → 3B9A65 직접 행으로 바뀌고 용량에 밀려 거부 등, 실측).
//   --legacy-report <--no-new-kinds 로 만든 보고서> 가 없으면 스스로 한 번 --no-new-kinds --dry 로 돌려 만든다.
const NO_NEW_KINDS = process.argv.includes('--no-new-kinds');
let legacyOkUids = null;
if (!NO_NEW_KINDS) {
  let legacyPath = arg('legacy-report');
  if (!legacyPath) {
    legacyPath = path.join(mkdtempSync(path.join(os.tmpdir(), 'utt-v2i-')), 'legacy_report.json');
    const passArgs = ['build', 'table', 'table-all', 'index', 'specs'].flatMap((k) => ['--' + k, arg(k)]);
    execFileSync(process.execPath, ['--max-old-space-size=8192', fileURLToPath(import.meta.url), ...passArgs,
      '--out', legacyPath + '.payload.json', '--report', legacyPath, '--dry', '--no-new-kinds'], { stdio: ['ignore', 'ignore', 'inherit'] });
  }
  legacyOkUids = new Set(JSON.parse(readFileSync(legacyPath, 'utf8')).utterances.filter((u) => u.ok).map((u) => u.uid));
}
let currentUid = null;
const newKindsOn = () => !NO_NEW_KINDS && !(legacyOkUids && legacyOkUids.has(currentUid));
const newKindsOnFor = (uid) => !NO_NEW_KINDS && !(legacyOkUids && legacyOkUids.has(uid));
// 진단: UTT_BRANCH_CHECK_ALL=1 이면 갈래 경로 검사를 예전 통과 발화에도 건다(현재 롬에 같은 결함이 있는지 보려고).
const UTT_BRANCH_CHECK_ALL = process.env.UTT_BRANCH_CHECK_ALL === '1';
const decl = JSON.parse(readFileSync(path.join(PROJECT, 'runtime', 'speech_arms_declaration_v1.json'), 'utf8'));
const ctxDecl = JSON.parse(readFileSync(path.join(PROJECT, 'runtime', 'contextual_text_entries_v1.json'), 'utf8'));

const allCache = new Map();
function loadAll(uids) {
  const want = [...uids].filter((u) => !allCache.has(u) && !table.has(u));
  if (!want.length) return;
  const need = new Set(want);
  const text = readFileSync(tableAllPath, 'utf8');
  let pos = 0;
  while (pos < text.length && need.size) {
    let end = text.indexOf('\n', pos);
    if (end < 0) end = text.length;
    if (text.startsWith('{"uid": "', pos)) {
      const q = text.indexOf('"', pos + 9);
      const uid = text.slice(pos + 9, q);
      if (need.has(uid)) { allCache.set(uid, JSON.parse(text.slice(pos, end))); need.delete(uid); }
    }
    pos = end + 1;
  }
}
const recOf = (uid) => table.get(uid) || allCache.get(uid) || null;

const stemBySource = new Map();
for (const e of decl.entries || []) {
  if (e.disabled || e.kind !== 'stem') continue;
  const s = parseInt(e.source, 16);
  if (!stemBySource.has(s)) stemBySource.set(s, []);
  stemBySource.get(s).push(e);
}
const fileOfCursor = (r) => { const v = parseInt(r, 16); return v >= 0xc00000 ? v - 0xc00000 : v; };
const ctxBySource = new Map();
for (const e of ctxDecl.entries || []) {
  const s = parseInt(e.source, 16);
  if (!ctxBySource.has(s)) ctxBySource.set(s, []);
  ctxBySource.get(s).push({ id: e.id, rc: (e.returnCursors || []).map(fileOfCursor) });
}
// 말투 팔 선언의 호출 자리 항목(kind arm, callers "RET" 또는 "OUTER/INNER"): 같은 키면 대체, source 범위와는 공존 못 함(v2b).
const armByKey = new Map(), armSources = new Set(), armDeclById = new Map();
for (const e of decl.entries || []) {
  if (e.disabled || e.kind === 'stem') continue;
  const s = parseInt(e.source, 16);
  armSources.add(s);
  armDeclById.set(String(e.id), e);
  for (const c of e.callers || []) {
    const key = `${s}|${String(c).split('/').map((x) => H(parseInt(x, 16))).join('/')}`;
    if (!armByKey.has(key)) armByKey.set(key, []);
    armByKey.get(key).push(e);
  }
}

const FRAG_LO = 0x3c0000, FRAG_HI = 0x3d0000;
const isFragBank = (a) => a !== null && a !== undefined && a >= FRAG_LO && a < FRAG_HI;
// v2g: 아레나로 옮겨 간 개행 키(N:) — 원문 자리엔 개행 op 가 없고 후보 롬 그 주소에만 24 가 있다(77BDDF 등).
//   빌더가 행을 아레나로 옮기며 생긴 자리라 원문 흐름의 구간 경계가 아니다 → 걷기 밖이어도 그 구간 글로 둔다.
const isArenaNlKey = (k) => { if (!k.startsWith('N:')) return false; const a = parseInt(k.slice(2), 16); return rom[a] !== 0x24 && candRom[a] === 0x24; };
function elemAddr(k) {
  if (k.startsWith('R:') || k.startsWith('N:') || k.startsWith('J:')) return parseInt(k.slice(2), 16);
  if (k.startsWith('P:')) return psrc.has(k.slice(2)) ? psrc.get(k.slice(2)) : null;
  return null;
}
function fileBase(bank) { return bank >= 0xc0 ? (bank - 0xc0) << 16 : bank << 16; }
function fragSpan(lead, b1) {
  const code = (lead << 8) | b1, bank = (0xfa + (lead >> 2)) & 0xff, base = fileBase(bank), idx = code & 0x3ff;
  const start = idx === 0 ? 0x800 : ((rom[base + 2 * (idx - 1)] | (rom[base + 2 * idx - 1] << 8)) + 0x800);
  const end = (rom[base + 2 * idx] | (rom[base + 2 * idx + 1] << 8)) + 0x800;
  return [base + start, base + end];
}
// v2h(2026-09-17): 조각 틀 판정. 엔진은 커서가 블록 끝 $7B(16비트)와 **같아질 때** 틀을 푼다(C0:1BB6 → 3756).
//   payload 복귀가 진입 자리와 다른 조각 몸통이면: 최상위(이벤트 본문) 진입이 조각 몸통으로 돌아가면 그 조각의 2E 가 이벤트 틀을 풀어
//   대사가 끊기고(0x0CF0 「돌아오겠」 뒤 빈 쪽, 실코어 PNG), 조각 A 안 진입이 조각 B 몸통으로 돌아가면 A 의 끝과 영영 안 같아져 옆 조각 몸통으로
//   흐른다(0x084E 3C2499 → 0850 몸통 3C24CB). 색인표에 몸통 전체를 덮는 이상 항목 둘(09D0·0BF9)이 있어 가장 작은 구간을 그 주소의 조각으로 본다.
const FRAG_SPANS = [];
for (let idx = 0; idx < 0x400; idx += 1) {
  const start = FRAG_LO + (idx === 0 ? 0x800 : ((rom[FRAG_LO + 2 * (idx - 1)] | (rom[FRAG_LO + 2 * idx - 1] << 8)) + 0x800));
  const end = FRAG_LO + (rom[FRAG_LO + 2 * idx] | (rom[FRAG_LO + 2 * idx + 1] << 8)) + 0x800;
  if (end > start) FRAG_SPANS.push([start, end]);
}
function fragSpanAt(a) {
  let best = null;
  for (const s of FRAG_SPANS) if (a >= s[0] && a < s[1] && (!best || s[1] - s[0] < best[1] - best[0])) best = s;
  return best;
}
// 복귀 B 가 진입 S 와 같은 틀인가: S 가 조각 몸통이면 B 는 그 조각 [시작, 끝](끝과 같으면 엔진이 곧바로 틀을 푼다), 아니면 B 도 조각 몸통 밖.
const frameOk = (S, B) => { const fs = fragSpanAt(S); return fs ? (B >= fs[0] && B <= fs[1]) : !fragSpanAt(B); };
const NAME_LEADS = new Set([0x39, 0x3a, 0x3b, 0x4a]);
// 3D.... = 금액 매크로(3바이트, 본문 행 안 `3D EF 01`) — 이름 토큰은 아니지만 payload 에 그대로 실을 수 있다(v2g, 팔 컴파일러 nameTokenLenAt 과 짝).
const NAME_HEX_RE = /^(?:(?:39|3A|3B|4A)[0-9A-F]{2}|0D06[0-9A-F]{2}|4F11|4F1[23][0-9A-F]{2}|3D[0-9A-F]{4})$/;
const hexOf = (a, n) => Array.from(rom.subarray(a, a + n)).map((x) => x.toString(16).toUpperCase().padStart(2, '0')).join('');
const softOp = (b, b1) => b === 0x2b || (b >= 0x19 && b <= 0x1e) || b <= 0x07 || b === 0x40 || b === 0x41 || b === 0x4d ||
  (b === 0x0d && (b1 === 0x12 || b1 === 0x13 || b1 === 0x18)) || (b === 0x4f && ![0x11, 0x12, 0x13].includes(b1));

// 빌더(build_halfcell_julian_v1) 그림자 조건 사본 — 제자리 행을 진입으로 쓰려면 빌더가 그 행을 아레나+그림자로 바꿀 수 있어야 한다.
const SHADOW_EXCL = [[0x3c0000, 0x3c3000], [0x3ccb00, 0x3ccf60], [0x3d9a90, 0x3d9b41]];
let WATCH17 = new Set();
try { WATCH17 = new Set((JSON.parse(readFileSync(path.join(PROJECT, 'out', 'percharacter_warp_watchlist_v1.json'), 'utf8')).rows || []).map((x) => parseInt(x, 16))); } catch {}
// v2g(2026-09-16): 실기 PPU 로 확정된 직접 워프 행 — 빌더가 그 행을 FE 직접 아레나로 굽는다(실기 확정이 권위).
//   발화 진입으로 그림자 전환(force)을 요구하면 빌더가 `(shadowableAt || directForced)` 둘 다 막혀 「강제 개행 아레나 조건 불충족」으로 멈춘다
//   (빌드 utterances_20260916_v16 실측: 3B23EA·3B6D6E·3B75AC·3B9A6C·3B9A7C·3B9AA4·3B9BEE·3BC76C 8행). 그래서 진입 후보에서 뺀다.
// v2g: 빌더가 강제 개행 아레나로 굽는 행 — 그 행 머리 FE 의 목적지를 발화 payload 로 바꾸면 빌더 되읽기 검수가
//   「강제 개행 직접 아레나 불일치」로 멈춘다(utterances_20260916_v18 실측 4434B6). 직접 payload 후보에서 뺀다.
const FORCED_NL_ROWS = new Set();
for (const [f, pick] of [['forced_newline_arena_rows_builtin_v1.json', (r) => r], ['forced_newline_arena_overrides_v1.json', (r) => (r && r.forceNewlineArena === true ? r.startPc : null)]]) {
  try {
    for (const r of (JSON.parse(readFileSync(path.join(PROJECT, 'runtime', f), 'utf8')).rows || [])) {
      const t = pick(typeof r === 'object' && r !== null && !Array.isArray(r) ? r : { startPc: r, forceNewlineArena: true });
      const s = String((typeof t === 'object' && t !== null) ? t.startPc : t ?? '').trim();
      const at = /^0x/i.test(s) ? parseInt(s.slice(2), 16) : parseInt(s, 16);
      if (Number.isInteger(at)) FORCED_NL_ROWS.add(at);
    }
  } catch {}
}
// v2g: 손으로 승인한 문안 수정(runtime/row_text_fix_v1.tsv)이 소유한 행 — 그 행을 발화 직접 payload 로 덮으면 빌드 마지막 관문
//   (audit_full_candidate_post0704_targets_v1)이 그 문안을 못 찾아 「absent」로 멈춘다(utterances_20260916_v19 실측 3B5107).
//   감사기는 등급 관문(33 A9)을 모르고 선형으로 읽으므로 payload 가 옳아도 관문은 통과 못 한다 → 승인 문안 쪽을 남긴다.
const TSV_FIXED_ROWS = new Set();
try {
  for (const l of readFileSync(path.join(PROJECT, 'runtime', 'row_text_fix_v1.tsv'), 'utf8').split(/\r?\n/)) {
    const c = l.split('\t')[0];
    if (/^[0-9A-Fa-f]{6}$/.test(c)) TSV_FIXED_ROWS.add(parseInt(c, 16));
  }
} catch {}
const PPU_DIRECT_ROWS = new Set([0x3b9fdc]);
for (const f of ['ppu_live_raw_direct_warp_rows_v1.json', 'shadow_direct_warp_rows_v1.json']) {
  try {
    for (const e of (JSON.parse(readFileSync(path.join(PROJECT, 'runtime', f), 'utf8')).rows || [])) {
      const t = String((typeof e === 'object' ? e.startPc : e) ?? '').trim();
      const at = /^0x/i.test(t) ? parseInt(t.slice(2), 16) : parseInt(t, 16);
      if (Number.isInteger(at)) PPU_DIRECT_ROWS.add(at);
    }
  } catch {}
}
const HOOKABLE = (b) => b >= 0x50 || (b >= 0x20 && b <= 0x23) || b === 0x18 || b === 0x46 || b === 0x39 || b === 0x3a || b === 0x3b || b === 0x4a || b === 0x4b;
const armOpsCache = new Map();
function rowHasArmOps(s) {
  if (armOpsCache.has(s)) return armOpsCache.get(s);
  const e = rowEndOf.get(s);
  let has = e === undefined;
  for (let a = s; !has && a < e;) {
    const op = ops.opAt(a);
    if (!op || !op.len) { has = true; break; }
    if (rom[a] === 0x4e || (rom[a] === 0x33 && rom[a + 1] === 0xa9)) has = true;
    a += op.len;
  }
  armOpsCache.set(s, has);
  return has;
}
const convertibleRow = (a) => rowStart.has(a) && !shadow.has(a) && !arenaRowSet.has(a) && HOOKABLE(rom[a]) && !WATCH17.has(a)
  && !PPU_DIRECT_ROWS.has(a) && !SHADOW_EXCL.some(([lo, hi]) => a >= lo && a < hi) && !rowHasArmOps(a);
// v2i: 그림자로 못 바꾸는 제자리 행(실기 PPU 직접 워프 행·그림자 금지 지대)을 FE 직접 워프로 바꿔 진입으로 쓴다.
//   FE 는 스트림 안 명령이라 모든 리더가 본다(그림자 금지 지대의 금지 사유는 TRG 표 발동이었다 — 3C08F9 제자리 지대 FE 마커 성공).
//   스팬이 3바이트(FE lo hi) 이상이어야 다음 행 머리를 안 덮는다(0x0E71 4544EC 실측). 행 안에 33/4E 가 있으면 payload 가 건너뛰므로 뺀다.
const directConvertRow = (a) => rowStart.has(a) && !shadow.has(a) && !arenaRowSet.has(a) && candRom[a] !== 0xfe && HOOKABLE(rom[a]) && !WATCH17.has(a)
  && (rowEndOf.get(a) - a) >= 3 && !rowHasArmOps(a) && !existingDirectCarriers.has(a)
  && (PPU_DIRECT_ROWS.has(a) || SHADOW_EXCL.some(([lo, hi]) => a >= lo && a < hi));

const walkCache = new Map();
function walkSegment(source, grade) {
  const key = source + ':' + grade;
  if (walkCache.has(key)) return walkCache.get(key);
  let pc = source, fragEnd = null, afterGate = false, gateAt = null, result = null, chain = [];
  const stack = [], names = [], softs = [], calls = [];
  // v2h: 출발이 조각 몸통이면 그 조각 틀 안에서 걷는다 — 엔진은 끝($7B)에 닿으면 틀을 풀어 부른 곳으로 가므로 거기가 구간 끝이다
  //   (v2g 까지는 바닥 틀 끝을 몰라 끝에 2E 없는 조각(0850 등)에서 옆 조각 몸통으로 흘렀다).
  const baseSpan = fragSpanAt(source);
  const baseEnd = baseSpan ? baseSpan[1] : null;
  // 멈춘 자리의 틀 정보: depth = 걷기가 쌓은 조각 틀 수, frameCalls[k]/frameRets[k] = k 번째 틀을 연 호출 op 주소·복귀 주소.
  const frameInfo = () => (fragEnd !== null ? { depth: stack.length, frameCalls: stack.map((f) => f[3]), frameRets: stack.map((f) => f[0]) } : { depth: 0, frameCalls: [], frameRets: [] });
  const stopAt = (back, boundary) => { result = { back, boundary, topBack: back, names, softs, calls, depth: 0, frameCalls: [], frameRets: [] }; };
  for (let step = 0; step < 3000 && !result; step += 1) {
    if (fragEnd !== null && pc >= fragEnd) {
      if (!stack.length) { result = { error: `조각 스택 바닥 @${H(pc)}` }; break; }
      [pc, fragEnd, chain] = stack.pop();
      continue;
    }
    if (fragEnd === null && baseEnd !== null && pc >= baseEnd) { stopAt(baseEnd, 'fragEnd'); break; }
    const b = rom[pc];
    const gate = afterGate;
    afterGate = false;
    const op = ops.opAt(pc);
    if (!op || !op.len) { result = { error: `미지 op ${b === undefined ? '?' : b.toString(16)} @${H(pc)}` }; break; }
    if (op.kind === 'text') { pc += op.len; continue; }
    if (b === 0x24 || b === 0x50) { pc += 1; continue; }
    // v2h: 검사 op 뒤 착지 바이트가 0x0C 미만(조각·이벤트 호출)이면 엔진은 **참·거짓 두 착지 모두** 꼬리 이송한다(C0:2F8C·2FA5 → 1B4C, 틀을 안 쌓음).
    //   v2g 는 참 착지만 꼬리로 봤다(거짓 착지 호출은 이 컴파일 입력에 조각 안 0건·바닥 1건(4DC1ED, 뒤가 2E 라 결과 같음)).
    if (b === 0x33 && rom[pc + 1] === 0xa9) {
      const r = rom[pc + 2], pass = (r >> 4) <= grade && grade <= (r & 15);
      gateAt = pc;
      pc += pass ? 3 : 5;
      afterGate = true;
      continue;
    }
    // v2h: 34 = chkBit(C0:2FC1) — (변수 니블 & 인자 하위 4비트) ≠ 0 이 참, 인자 최상위 비트면 뒤집음, 거짓이면 뒤 2바이트 건너뜀. 착지 호출은 33 과 같이 꼬리 이송.
    //   A9(말투 등급)만 등급으로 푼다. 비트 3(8)은 문맥 표지(A9|8, 0x0F2B)라 등급 0..7 로 못 가르므로 그런 검사·다른 변수 검사는 v2g 처럼 구간 경계로 둔다.
    //   v2g 는 34 를 몰라 조각 0BAB·0BAC 의 `34 a9 02` 에서 멈췄고, 그 멈춘 자리(조각 몸통)를 최상위 진입의 복귀로 썼다(U-3A1082·U-3A109C).
    if (b === 0x34 && rom[pc + 1] === 0xa9 && !(rom[pc + 2] & 0x08)) {
      const r = rom[pc + 2], pass = ((grade & (r & 15)) !== 0) !== !!(r & 0x80);
      gateAt = pc;
      pc += pass ? 3 : 5;
      afterGate = true;
      continue;
    }
    if (b === 0x4e) { pc += 2 + rom[pc + 1]; continue; }
    if (b >= 0x08 && b <= 0x0b) {
      const [s, e] = fragSpan(b, rom[pc + 1]);
      // v2h: 바닥 틀(이벤트 본문·출발 조각)에서 검사 착지 호출은 바닥 틀을 그 조각으로 **바꾼다** — 그 조각이 끝나면 바닥 틀째 풀린다.
      //   바로 뒤가 2E 거나 바닥 조각 끝이면 「쌓고 돌아와 틀 풀기」와 결과가 같아 그대로 걷고, 아니면 검사 op 를 구간 끝으로 둔다(엔진이 그 자리부터 원래대로 간다).
      if (gate && fragEnd === null && !(rom[pc + 2] === 0x2e || (baseEnd !== null && pc + 2 >= baseEnd))) { stopAt(gateAt, 'gateTail'); break; }
      const tail = gate && fragEnd !== null;
      const nextChain = tail ? chain : [...chain, pc + 2];
      if (!tail) stack.push([pc + 2, fragEnd, chain, pc]);
      calls.push({ at: pc, start: s, end: e, chain: nextChain });
      pc = s;
      fragEnd = e;
      chain = nextChain;
      continue;
    }
    // v2h: 검사 착지가 저대역 이벤트 호출(00..07)이면 엔진은 그 이벤트로 꼬리 이송한다 — 걷기가 따라갈 수 없으니 바닥 틀이면 검사 op 에서,
    //   조각 틀 안이면 그 자리에서 끊는다(조각 틀 안 멈춤은 아래 진입 선택이 호출 op 복귀로 풀거나 거부한다).
    if (gate && b <= 0x07) {
      if (fragEnd === null) stopAt(gateAt, 'gateTailEvent');
      else result = { back: pc, boundary: 'gateTailEvent', topBack: stack.length ? stack[0][0] : pc, names, softs, calls, ...frameInfo() };
      break;
    }
    if (b === 0x2e && fragEnd !== null) {
      if (!stack.length) { result = { error: `조각 반환 스택 바닥 @${H(pc)}` }; break; }
      [pc, fragEnd, chain] = stack.pop();
      continue;
    }
    if (NAME_LEADS.has(b) || (b === 0x0d && rom[pc + 1] === 0x06) || (b === 0x4f && [0x11, 0x12, 0x13].includes(rom[pc + 1]))) {
      names.push({ at: pc, hex: hexOf(pc, op.len) });
      pc += op.len;
      continue;
    }
    // v2f(2026-09-16): 파티 인원 대명사 조각(0B2B 3CC54F·0B74 3CD85F) 관용구 `41 aa 19 F3`(검사 인자 스크래치 쓰기) `45 00 01`(chkMem).
    //   chkMem 은 등급과 무관한 조건(통과면 다음 op, 실패면 +2 — 33 과 같은 건너뛰기)이라 등급별 걷기는 통과 갈래를 따른다.
    //   0B2B 통과 = 4E 07 → 0B75 호출(「나/저」 등급 팔, 복귀 3CC561), 실패 = 3CC558 「우리」 글 → 2E. 실패 갈래 행도 조각 범위 겹침(callOf)으로 같은 호출에 귀속된다.
    //   40/41 스크래치 쓰기는 글이 없어 걷기에서 그냥 지난다(원래 스트림을 그대로 두는 조각 호출이라 부작용은 실행 때 그대로).
    if (fragEnd !== null && (b === 0x40 || b === 0x41)) { pc += op.len; continue; }
    if (fragEnd !== null && b === 0x45) { pc += 3; continue; }
    // v2g(2026-09-16): 조각 몸통도 보통 스트림이다 — 대기(2C)·창 닫기·분기 같은 op 가 조각 안에 있으면 최상위와 똑같이 다룬다
    //   (연출 op 는 하위 구간 경계, 그 밖은 구간 끝). payload 복귀 주소가 조각 안이 되는데, 0B75 팔이 3CC561 로 돌아오는 것과 같은 자리라 실행에 문제가 없다.
    //   조각은 여러 곳에서 부르므로 진입 행은 entryKind 가 호출 사슬(rc)을 달아 그 호출자에서만 바뀌게 한다.
    // v2g: 하위 구간 경계(연출 op)는 최상위 자리만 센다 — 조각 안 연출은 공유 코드라 경계로 삼지 않고 지난다(경계 주소 단조성 유지).
    if (softOp(b, rom[pc + 1])) { if (fragEnd === null) softs.push({ at: pc, len: op.len, note: op.note }); pc += op.len; continue; }
    // v2g: 조각 안에서 끝나면 복귀(back)는 조각 안 주소다. 최상위 스트림이 닿은 끝(topBack = 바깥 틀의 복귀 자리)은 따로 둔다 — 키 범위 판정은 topBack 으로 한다.
    result = { back: pc, boundary: op.note, topBack: fragEnd !== null && stack.length ? stack[0][0] : pc, names, softs, calls, ...frameInfo() };
  }
  if (!result) result = { error: '걸음 상한' };
  walkCache.set(key, result);
  return result;
}
// v2i(2026-09-17): 걷기는 원본 롬 스트림을 따라가 호출 틀(체인)을 만들지만 디스패처 키는 **한국어 롬의 실제 호출 구조**여야 한다.
//   사전 제어 재작성(runtime/0b_dictionary_control_rewrites_v1)이 호출 자리 `0B 75 · 0B 74` 를 `0B 2B · 0B 06` 으로 바꾼 곳 27개에서는
//   대명사 행(0B75 몸통 3CD86D 등)이 한국어 롬에서 0B2B 안 bare `0B 75`(복귀 3CC561)로 불려 틀이 한 겹 더 쌓인다. 걷기 체인 [호출자 복귀] 로
//   키를 만들면 실기에서 절대 안 맞는다(v29 덤프: 72A039·446638·459888·58A91A·58A990·7BE551 카타리나·모니카 「저」 그대로, 3BB687 「저나의」).
//   체인의 각 호출 자리 op 가 한국어 롬에서 바뀌었고 다음 대상(다음 틀의 호출 op 또는 키 행)이 그 조각 몸통 밖이면, 그 조각 안에서 대상을 부르는
//   bare 호출을 찾아 그 복귀를 한 겹 끼운다.
function koChain(chain, a) {
  if (!chain || chain === UNMODELED || !chain.length || a === null) return chain;
  const out = [];
  for (let i = 0; i < chain.length; i += 1) {
    const r = chain[i];
    out.push(r);
    const op = candRom[r - 2], id = candRom[r - 1];
    if (op === rom[r - 2] && id === rom[r - 1]) continue;
    if (!(op >= 0x08 && op <= 0x0b)) continue;
    const [s, e] = fragSpan(op, id);
    const target = i + 1 < chain.length ? chain[i + 1] - 2 : a;
    if (target >= s && target < e) continue;
    for (let p = s; p + 1 < e; p += 1) {
      const b = candRom[p];
      if (b >= 0x20 && b <= 0x23) { p += 1; continue; }            // 2바이트 글자 피연산자는 호출로 안 읽는다
      if (b >= 0x08 && b <= 0x0b) { const [s2, e2] = fragSpan(b, candRom[p + 1]); if (target >= s2 && target < e2) { out.push(p + 2); break; } }
    }
  }
  return out;
}
// 키 주소 a 가 걷기의 조각 호출 안인지 — 한국어 행은 조각 경계를 걸쳐 시작할 수 있어(3CD884 행이 0B76 몸통 3CD886 머리를 덮음) 행 범위 겹침으로 본다(v2b).
function callOf(walk, a) {
  if (a === null) return null;
  const e = rowEndOf.get(a);
  for (const c of walk.calls || []) if ((a >= c.start && a < c.end) || (e !== undefined && a < c.end && e > c.start)) return c;
  return null;
}
const inCalls = (walk, a) => !!callOf(walk, a);
// 걷기가 부르지 않은 조각 행(원문 호출 op 와 행 경계 어긋남·callL 안 등): 그 구간 글로 두되 진입·복귀로는 쓰지 않는다(v1 과 같은 관용).
const UNMODELED = Object.freeze(['unmodeled']);
const chainKey = (c) => (c === UNMODELED ? '?' : (c && c.length ? c.map(H).join('/') : ''));

function keyChains(walk, keys) {
  const out = [];
  let ci = 0;
  for (const [k] of keys) {
    const a = elemAddr(k);
    let found = null;
    if (a !== null) {
      const e = rowEndOf.get(a);
      const hit = (c) => (a >= c.start && a < c.end) || (e !== undefined && a < c.end && e > c.start);
      for (let i = ci; i < walk.calls.length; i += 1) { if (hit(walk.calls[i])) { found = walk.calls[i]; ci = i; break; } }
      if (!found) for (let i = 0; i < ci; i += 1) { if (hit(walk.calls[i])) { found = walk.calls[i]; break; } }
    }
    out.push(found);
  }
  return out;
}

// 조건 검사 뒤 이어지는 키가 조각 행이면 앞 구간 끝 op 뒤에서 그 조각을 부르는 op 를 찾는다.
function contStart(prevBack, target) {
  let a = prevBack;
  for (let n = 0; n < 48; n += 1) {
    const op = ops.opAt(a);
    if (!op || !op.len) break;
    const b = rom[a];
    if (b >= 0x08 && b <= 0x0b) { const [s, e] = fragSpan(b, rom[a + 1]); if (target >= s && target < e) return a; }
    a += op.len;
  }
  return null;
}
// 분기 없는 연출·창·플래그 쓰기 op — 한국어 행 머리가 이 op 주소에 있는 일이 흔하다(4B 00·28·29 뒤 글). 구간 시작에서 건너뛰고 그 주소의 키는 그 구간 글로 둔다(v2b).
const PASS_NOTES = new Set(['winSelf', 'winOther', 'opponent', 'fill', 'objOp', 'setFlag', 'set4', 'op35', 'set1B']);
function segmentPath(v, g, rec) {
  const keys = v.keys || [];
  const segs = [];
  let pc = parseInt(v.src, 16), ki = 0;
  const topFrag = v.srcKind === 'F';
  const endAddr = rec.end ? parseInt(rec.end, 16) : null;
  for (let guard = 0; guard < 24; guard += 1) {
    const head = pc;
    for (let n = 0; n < 8; n += 1) { const op = ops.opAt(pc); if (!op || !op.len || op.kind === 'text' || !PASS_NOTES.has(op.note)) break; pc += op.len; }
    const walk = walkSegment(pc, g);
    if (walk.error) return { error: `범위 해독 실패(걷기 시작 ${H(pc)}) ${walk.error}` };
    const walkTop = walk.topBack ?? walk.back; // v2g: 최상위 스트림이 닿은 끝(조각 안에서 끝났으면 그 조각을 부른 자리 다음)
    const start = ki;
    const unmodeled = new Set();
    while (ki < keys.length) {
      const a = elemAddr(keys[ki][0]);
      if (a === null || (a >= head && a < walkTop) || inCalls(walk, a)) { ki += 1; continue; }
      if (isArenaNlKey(keys[ki][0])) { ki += 1; continue; } // v2g: 아레나 개행은 구간을 나누지 않는다
      if (!topFrag && isFragBank(a)) {
        let nxt = null;
        for (let x = ki + 1; x < keys.length; x += 1) { const b = elemAddr(keys[x][0]); if (b !== null && !isFragBank(b)) { nxt = b; break; } }
        if ((nxt !== null && nxt >= head && nxt < walkTop) || (nxt === null && endAddr !== null && (walk.back === endAddr || walkTop === endAddr))) { unmodeled.add(ki); ki += 1; continue; }
      }
      break;
    }
    const segKeys = keys.slice(start, ki);
    const calls = keyChains(walk, segKeys);
    segs.push({ entry: pc, head, walk, keys: segKeys.map((kt, i) => [kt[0], kt[1], unmodeled.has(start + i) ? UNMODELED : (calls[i] ? koChain(calls[i].chain, elemAddr(kt[0])) : null), calls[i]]) });
    if (ki >= keys.length) return { segments: segs, tail: [] };
    if (!rec.end) return { segments: segs, tail: keys.slice(ki) };
    const an = elemAddr(keys[ki][0]);
    if (an === null) return { error: `이어짐 키 ${keys[ki][0]} 주소 없음` };
    let next = an;
    if (!topFrag && isFragBank(an)) { const cs = contStart(walkTop, an); if (cs !== null) next = cs; }
    if (start === ki && next === head) return { error: `구간 나눔이 ${H(head)} 에서 멈춤(${walk.boundary} @${H(walk.back)})` };
    pc = next;
  }
  return { error: '구간 나눔 상한 24' };
}
const segCache = new Map();
function segOf(rec, g, v) {
  const key = `${rec.uid}|${g}|${v.src}|${v.lead}|${v.ko}`;
  if (!segCache.has(key)) segCache.set(key, segmentPath(v, g, rec));
  return segCache.get(key);
}
function pathSubspans(seg, rec) {
  const subs = [];
  for (const [si, sg] of seg.segments.entries()) {
    const bounds = [];
    const rangeEnd = sg.walk.topBack ?? sg.walk.back; // v2g: 키 범위 판정용 끝(복귀 bounds[마지막][1] 은 조각 안 주소일 수 있다)
    let s = sg.head ?? sg.entry;
    for (const sf of sg.walk.softs) { bounds.push([s, sf.at]); s = sf.at + sf.len; }
    // v2h: 마지막 하위 구간 끝에는 걷기가 멈춘 자리의 조각 틀 정보를 붙인다(진입 선택이 틀 밖 복귀를 막는 데 쓴다).
    bounds.push([s, sg.walk.back, { depth: sg.walk.depth || 0, frameCalls: sg.walk.frameCalls || [], frameRets: sg.walk.frameRets || [], boundary: sg.walk.boundary }]);
    const spans = bounds.map(() => []);
    let cur = 0;
    for (const kt of sg.keys) {
      // v2h(2026-09-17): 조각 호출 안 키(체인 있음)는 키 주소(조각 몸통)가 아니라 **바깥 호출 op 자리**(체인 첫 복귀 −2)로 하위 구간을 가른다.
      //   v2g 는 체인 키를 가르지 않고 지금 하위 구간에 넣어, 연출 op(대기 2B) 뒤에서 부르는 대명사 조각 글이 앞 하위 구간 payload 에도 들어갔다 —
      //   payload 는 대기 앞에서 돌아오고 조각이 또 찍어 실기 화면 「내내가 휘말리게」(0x0FA1, 733853.733871).
      const chainArr = Array.isArray(kt[2]) && kt[2] !== UNMODELED && kt[2].length ? kt[2] : null;
      const a = chainArr ? chainArr[0] - 2 : elemAddr(kt[0]);
      if (a !== null && (chainArr || !kt[2]) && !isArenaNlKey(kt[0])) {
        const hiOf = (i) => (i === bounds.length - 1 ? rangeEnd : bounds[i][1]);
        while (cur < bounds.length - 1 && a >= hiOf(cur)) cur += 1;
        if (a < bounds[cur][0] || a >= hiOf(cur)) return { error: `키 ${kt[0]} 가 구간 ${si} 하위 구간 ${cur} [${H(bounds[cur][0])},${H(hiOf(cur))}) 밖` };
      }
      spans[cur].push(kt);
    }
    let last = spans.length - 1;
    if (!rec.end && si === seg.segments.length - 1) { while (last > 0 && !spans[last].length) last -= 1; }
    for (let k = 0; k <= last; k += 1) subs.push({ si, k, keys: spans[k], bound: bounds[k] });
  }
  return { subs };
}

const normalizeRendered = (s) => String(s).replace(/\{X\|([0-9A-F]+)\|[^}]*\}/g, '{X|$1}');
const joinTexts = (arr) => arr.map((e) => e[1]).join('');
const eqEl = (x, y) => !!x && !!y && x[0] === y[0] && normalizeRendered(x[1]) === normalizeRendered(y[1]);
const tokenize = (text) => String(text).match(/\{X\|[0-9A-F]+\|[^}]*\}|\{J\|[^}]*\}|[\s\S]/gu) || [];
const tokWidth = (t) => (t.startsWith('{X|') ? Math.max(1, [...t.split('|').slice(2).join('|').slice(0, -1)].length) : 1);
const isHangul = (ch) => /^[가-힣]$/u.test(ch);
const isShadowRowKeyV1 = (k) => !k.startsWith('N:') && (() => { const a = elemAddr(k); return a !== null && !isFragBank(a) && rowStart.has(a) && shadow.has(a); })();
const isBackKeyV1 = (k) => k.startsWith('N:') || (k.startsWith('R:') && (() => { const a = elemAddr(k); return a !== null && !isFragBank(a) && rowStart.has(a); })());
// v2g: 왜 진입으로 못 쓰는지 남긴다(거부 메시지에 붙여 A 부류 — 「진입 행 없음」 — 을 눈으로 볼 수 있게).
let entryWhy = [];
function entryKind(e) {
  const [k, , chain, call] = e;
  const no = (r) => { entryWhy.push(`${k} ${r}`); return null; };
  // v2h(2026-09-17): 말투 팔 선언이 설치한 호출 자리 문맥 키(P:<선언 id>@<호출 복귀>)도 호출 자리 진입으로 쓴다 — 이 발화 payload 가 그 선언을 대신한다(아래 oldAtKey supersedes).
  //   선언 source 가 부른 조각 안 그림자 행이고, 키 체인이 선언 호출자와 같을 때만. 손 문맥 치환(contextual_text_entries) 키는 여전히 안 된다.
  //   계기: 0x0FA1 733853.733871 엘렌·카타리나 「제가」 — 대명사는 대기 뒤 0B75 가 찍는 글이라 앞 구간에 못 넣고(「내내가」), 선언 키는 진입 후보가 아니라 거부됐다.
  if (k.startsWith('P:') && chain !== UNMODELED && chain && chain.length) {
    const d = armDeclById.get(k.slice(2).split('@')[0]);
    if (!d) return no('손 문맥 치환 키(말투 팔 선언 아님)');
    const a = elemAddr(k);
    let rc = chain.slice(-2);
    if (a === null || !rowStart.has(a) || !shadow.has(a) || !call || a < call.start) return no('선언 source 가 부른 조각 안 그림자 행이 아님');
    // v2i: 0B2B→0B75 처럼 조각 안 bare 호출이 틀을 하나 더 쌓는 대명사 행은 걷기 체인이 한 겹 얕다(0.44D80C: 걷기 [44D7F4], 선언·디스패처 키 44D7F4/3CC561).
    //   표 키 이름에 적힌 실제 디스패처 키(@바깥_안)가 걷기 체인으로 시작하면 그 키를 쓴다.
    const keyRc = (k.split('@')[1] || '').split('_').filter(Boolean).map((x) => parseInt(x, 16));
    if (newKindsOn() && keyRc.length > rc.length && keyRc.length <= 2 && rc.every((x, i) => x === keyRc[i])) rc = keyRc;
    if (!(d.callers || []).some((c) => String(c).split('/').map((x) => H(parseInt(x, 16))).join('/') === chainKey(rc))) return no('키 체인이 선언 호출자와 다름');
    return { rc, force: false };
  }
  if (!k.startsWith('R:') || chain === UNMODELED) return no(chain === UNMODELED ? '걷기가 못 본 조각 행' : '행 키가 아님');
  const a = elemAddr(k);
  if (a === null || !rowStart.has(a)) return no('원장 행 시작이 아님');
  // v2i: 행 머리가 1바이트 op(개행 24·창 28)이면 빌더는 트리거 키를 그 **다음 바이트**에 둔다(v14a·v28 전수: 24 머리 148행·28 머리 8행 모두 +1 키).
  //   그 op 는 원래대로 실행되고 디스패처는 +1 키에서 걸리므로 진입 source 는 +1 이다(70F2B0 「!!⟦|⟧\n뭘 하고 있는…」·443432 winSelf 머리 거부 해소).
  if (newKindsOn() && (rom[a] === 0x24 || rom[a] === 0x28) && !shadow.has(a) && shadow.has(a + 1) && !(chain && chain.length)) return { rc: [], force: false, shift: 1 };
  const hop = ops.opAt(a);
  if (hop && hop.kind !== 'text' && PASS_NOTES.has(hop.note)) return no(`행 머리가 ${hop.note} op`);
  if (chain && chain.length) return shadow.has(a) && call && a >= call.start ? { rc: chain.slice(-2), force: false } : no('조각 호출 안인데 그림자 행이 아님');
  if (shadow.has(a)) return { rc: [], force: false };
  if (directHeadRow(a) && (newKindsOn() || (!FORCED_NL_ROWS.has(a) && !TSV_FIXED_ROWS.has(a)))) return { rc: [], force: false, direct: true };
  if (convertibleRow(a)) return { rc: [], force: true };
  if (newKindsOn() && directConvertRow(a)) return { rc: [], force: false, direct: true, convert: true };
  return no(`그림자·직접FE·전환 모두 불가(아레나=${arenaRowSet.has(a) ? 1 : 0} 머리=${(rom[a] || 0).toString(16)} 스팬=${(rowEndOf.get(a) || a) - a}${SHADOW_EXCL.some(([lo, hi]) => a >= lo && a < hi) ? ' 제자리지대' : ''}${PPU_DIRECT_ROWS.has(a) ? ' 실기PPU직접워프행' : ''})`);
}
const isBackKeyIn = (e, frame) => chainKey(e[2]) === frame && (e[0].startsWith('N:') || (e[0].startsWith('R:') && rowStart.has(elemAddr(e[0]))));

function wrapIssues(text, cols, startCol) {
  if (!cols) return [];
  const cap = cols * 2;
  let col = Number(startCol || 0), prev = '\n';
  const issues = [];
  for (const t of tokenize(text)) {
    if (t === '\n') { col = 0; prev = '\n'; continue; }
    const w = tokWidth(t);
    if (col > 0 && col + w > cap) {
      if (prev !== ' ' && t !== ' ') issues.push(`어절 한가운데 자동 줄바꿈 「…${prev.startsWith('{') ? '이름' : prev}|${t.startsWith('{') ? '이름' : t}…」`);
      col = 0;
    }
    col += w;
    prev = t;
  }
  return issues;
}

// 안 바뀐 키(닻)를 가장 많이 두는 정렬. 닻은 키 글 토큰 전체가 그 자리 토큰과 같아야 하고, 바뀐 키는 아무 토큰 열(빈 것 포함)을 먹는다.
// v2i(2026-09-17): 바뀐 키가 이어질 때 경계는 **각 키의 옛 글과 앞·뒤로 겹치는 토큰이 많은 쪽**으로 정한다(아주 작은 가중 — 닻 수·바뀐 키 수 판정은
//   그대로). 전엔 앞 키가 가장 짧게 먹어, 두 키에 걸친 어절 「저|의 차례다」 → 「나의 차례네」 가 「|나의 차례네」 로 갈려 조각 호출 자리(저)가 비고
//   공통 행이 「나의 차례네」 가 됐다 — 복수 파티 갈래(우리+공통 행)에서 「우리나의 차례네!」(v29 3BB687 카타리나 실코어 PNG).
const ALIGN_EDGE_WEIGHT = 1e-6;
// v2i(2026-09-17): U: 키(행에 안 든 원본 op — 등급·플래그 갈래 안 이름 매크로 등)는 payload 가 바꿀 대상이 아니다 — 닻으로 잡을 수 있으면 먼저 잡는다.
//   전엔 「{대령} 안전한 곳으로!」 → 「{대령}{J|을를} 안전한 곳으로!」 에서 긴 행(9토큰)을 닻으로 두고 이름 키(1토큰)를 바뀐 키로 봐,
//   이름+조사를 앞 구간 payload 에 넣고 갈래 op 앞으로 복귀해 실기에 「대령을대령 안전한 곳으로!」(0.715D62, v28·v29 덤프).
const U_ANCHOR_BONUS = 100;
function alignKeys(keyTexts, text, keyIds = null) {
  const Wraw = tokenize(text), W = Wraw.map(normalizeRendered);
  const K = keyTexts.map((t) => tokenize(t).map(normalizeRendered));
  const n = K.length, L = W.length, NEG = -1e9;
  const best = Array.from({ length: n + 1 }, () => new Float64Array(L + 1).fill(NEG));
  const how = Array.from({ length: n + 1 }, () => new Int32Array(L + 1).fill(-2));
  const edge = (k, p, q) => {   // 옛 키 토큰 k 와 새 토큰 W[p..q) 의 공통 앞머리 + 공통 꼬리 길이
    const len = q - p; let a = 0;
    while (a < k.length && a < len && k[a] === W[p + a]) a += 1;
    let z = 0;
    while (z < k.length - a && z < len - a && k[k.length - 1 - z] === W[q - 1 - z]) z += 1;
    return a + z;
  };
  best[n][L] = 0;
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let p = L; p >= 0; p -= 1) {
      let b = NEG, h = -2;
      const len = K[i].length;
      if (len > 0 && p + len <= L && best[i + 1][p + len] > NEG) {
        let same = true;
        for (let x = 0; x < len; x += 1) if (K[i][x] !== W[p + x]) { same = false; break; }
        // 가중은 이름 매크로가 든 U: 키에만 — 공백 한 칸 같은 흔한 토큰 U: 키(715006 「엇, 정말」 사이 71502B)에 주면 엉뚱한 공백에 닻을 박아 정렬 전체가 뒤틀린다.
        if (same) { b = best[i + 1][p + len] + len + (keyIds && String(keyIds[i]).startsWith('U:') && K[i].some((t) => t.startsWith('{X|')) ? U_ANCHOR_BONUS : 0); h = -1; }
      }
      for (let q = p; q <= L; q += 1) { const val = best[i + 1][q]; if (val > NEG) { const v = val - 0.01 + (len ? edge(K[i], p, q) * ALIGN_EDGE_WEIGHT : 0); if (v > b) { b = v; h = q; } } }
      best[i][p] = b;
      how[i][p] = h;
    }
  }
  if (best[0][0] <= NEG) return null;
  const res = [];
  let p = 0;
  for (let i = 0; i < n; i += 1) {
    const h = how[i][p];
    if (h === -1) { res.push({ anchor: true, from: p, to: p + K[i].length }); p += K[i].length; }
    else { res.push({ anchor: false, from: p, to: h }); p = h; }
  }
  return { res, W: Wraw };
}
function autoSplit(flat, nonEmpty, text) {
  const allKeys = [], owner = [];
  flat.forEach((s, si) => s.keys.forEach((e) => { allKeys.push(e); owner.push(si); }));
  const al = alignKeys(allKeys.map((e) => e[1]), text, allKeys.map((e) => e[0]));
  if (!al) return null;
  const parts = flat.map(() => '');
  let prevCut = 0;
  for (let n = 0; n < nonEmpty.length; n += 1) {
    const si = nonEmpty[n];
    const lastIdx = owner.lastIndexOf(si);
    let cut;
    if (n === nonEmpty.length - 1) cut = al.W.length;
    else if (al.res[lastIdx].anchor || (al.res[lastIdx + 1] && al.res[lastIdx + 1].anchor)) cut = al.res[lastIdx].to;
    else return null;
    parts[si] = al.W.slice(prevCut, cut).join('');
    prevCut = cut;
  }
  return parts;
}

// 하위 구간 한 진입(mode 'v1' = v1f 규칙 그대로, 'ext' = 조각 안 호출 자리·최상위 조각 행·바꿀 수 있는 제자리 행까지).
function chooseSpanCore(seqs, grades, want, bound, mode) {
  entryWhy = [];
  const g0 = grades[0], s0 = seqs.get(g0);
  const lens = grades.map((g) => seqs.get(g).length);
  const minLen = Math.min(...lens);
  let i = 0;
  while (i < minLen && grades.every((g) => eqEl(seqs.get(g)[i], s0[i]))) i += 1;
  const identicalNow = i === minLen && lens.every((l) => l === minLen);
  const changed = grades.some((g) => normalizeRendered(want.get(g)) !== normalizeRendered(joinTexts(seqs.get(g))));
  // (v2i 에서 「안 바뀐 하위 구간은 갈래가 있어도 건너뜀」을 시험했으나 옛 말투 팔 선언을 대체하던 설치 발화 175개가 한꺼번에 빠져 되돌렸다 —
  //   이름 두 번 찍힘 부류는 아래 후보 생성의 키 주소 순서 관문이 정확히 막는다.)
  if (identicalNow && !changed) return { skip: true };
  if (!minLen) return { error: '하위 구간에 행이 없음' };
  const jMax = identicalNow ? minLen - 1 : Math.min(i, minLen - 1);
  let j = -1, kind = null;
  for (let x = jMax; x >= 0; x -= 1) {
    const e0 = s0[x], k0 = e0[0];
    if (!grades.every((g) => seqs.get(g)[x] && seqs.get(g)[x][0] === k0 && chainKey(seqs.get(g)[x][2]) === chainKey(e0[2]))) continue;
    const ek = mode === 'v1' ? (isShadowRowKeyV1(k0) && !(e0[2] && e0[2].length) ? { rc: [], force: false } : null) : entryKind(e0);
    if (!ek) continue;
    if (!grades.every((g) => want.get(g).startsWith(joinTexts(seqs.get(g).slice(0, x))))) continue;
    j = x;
    kind = ek;
    break;
  }
  if (j < 0) return { error: `고친 글 앞에서 모든 주인공이 지나는 그림자 진입 행이 없음 [${[...new Set(entryWhy)].slice(0, 3).join(' · ') || '후보 자리 자체가 없음'}]` };
  const frame = chainKey(s0[j][2]);
  let mMax = 0;
  for (;;) {
    const ok = grades.every((g) => {
      const s = seqs.get(g), idx = s.length - 1 - mMax, idx0 = s0.length - 1 - mMax;
      return idx > j && idx0 > j && eqEl(s[idx], s0[idx0]);
    });
    if (!ok) break;
    mMax += 1;
  }
  // v2h: 걷기가 진입 틀보다 깊은 조각 호출 안에서 멈췄으면(구간 끝 대기가 여러 곳이 부르는 조각 몸통 안) payload 는 그 호출 op 로 돌아간다 —
  //   엔진이 호출을 원래대로 실행해 틀을 쌓고, 호출 안 키 글은 원래 행이 찍는다(0x084E 3C2499 「나오다니」 + 0850 「..」 대기). 그러려면 호출 안 키가
  //   끝까지 이어지고 주인공마다 같으며 작성 글 끝과 맞아야 한다. 못 맞추면 틀 밖으로 돌아가는 복귀를 만들지 않고 거부한다.
  const D = frame === '' ? 0 : frame.split('/').length;
  const fi = bound[2] || { depth: 0, frameCalls: [], frameRets: [] };
  const cut = fi.depth > D ? { at: fi.frameCalls[D], prefix: (frame ? frame + '/' : '') + H(fi.frameRets[D]) } : null;
  const inCut = (e) => !!cut && (chainKey(e[2]) === cut.prefix || chainKey(e[2]).startsWith(cut.prefix + '/'));
  let m = 0, back = null;
  for (let y = mMax; y > 0; y -= 1) {
    const eb = s0[s0.length - y];
    const cutKey = !!cut && grades.every((g) => { const s = seqs.get(g); const at = s.length - y; return at > j && inCut(s[at]) && !inCut(s[at - 1]) && s.slice(at).every(inCut); });
    const okKey = cutKey || (mode === 'v1' ? (isBackKeyV1(eb[0]) && !(eb[2] && eb[2].length)) : isBackKeyIn(eb, frame));
    if (!okKey) continue;
    if (!grades.every((g) => { const s = seqs.get(g); const suf = joinTexts(s.slice(s.length - y)); const w = want.get(g); return w.endsWith(suf) && w.length >= joinTexts(s.slice(0, j)).length + suf.length; })) continue;
    if (kind.rc.length && !grades.every((g) => { const s = seqs.get(g); return s.slice(j, s.length - y).every((e) => chainKey(e[2]).startsWith(frame)); })) continue;
    m = y;
    back = cutKey ? cut.at : elemAddr(eb[0]);
    break;
  }
  if (back === null) {
    if (cut) return { error: `구간 끝(${fi.boundary || '?'} @${H(bound[1])})이 조각 호출(${H(cut.at)}) 안인데 호출 안 글을 원래 행에 남길 수 없음 — 조각 틀 밖으로 돌아가는 복귀는 만들지 않는다` };
    if (!kind.rc.length) back = bound[1];
    else {
      if (!grades.every((g) => seqs.get(g).slice(j).every((e) => chainKey(e[2]).startsWith(frame)))) return { error: '문맥 진입 구간이 조각 호출 밖으로 이어짐' };
      const last = s0[s0.length - 1];
      if (!grades.every((g) => { const s = seqs.get(g); return s.length && s[s.length - 1][0] === last[0]; })) return { error: '문맥 진입 끝 키가 주인공마다 다름' };
      // v2h: 끝 키가 진입 틀보다 깊은 호출 안이면 그 행 끝은 다른 조각 몸통이다 — 거기로 돌아가면 틀이 어긋난다.
      if (chainKey(last[2]) !== frame) return { error: '문맥 진입 끝 키가 더 깊은 조각 호출 안 — 그 행 끝은 진입과 다른 조각 틀' };
      const la = elemAddr(last[0]);
      back = (last[0].startsWith('R:') || last[0].startsWith('P:')) ? rowEndOf.get(la) : (last[0].startsWith('N:') ? la + 1 : undefined);
      if (back === undefined) return { error: '문맥 진입 복귀(조각 안 행 끝)를 못 정함' };
    }
  }
  return { j, m, back, rc: kind.rc, force: kind.force, direct: !!kind.direct, convert: !!kind.convert, shift: kind.shift || 0 };
}

// 여러 곳 고침(v2b): 주인공마다 고친 문장을 옛 키 글에 정렬해 바뀐 곳마다 진입을 둔다. 같은 자리 키는 종류만 같으면 되고 주소는 주인공마다 달라도 된다
//   (조각 안 팔 행 — 대명사 너/그대/자네). 바뀐 곳이 조각 호출 경계를 걸치면 바깥 틀(최상위 행)로 끌어올려 호출째 payload 로 덮는다.
//   진입(행·호출 자리 키)·복귀가 같은 주인공끼리 묶어 항목을 만든다(바뀐 주인공이 없는 묶음은 건너뜀).
function chooseRegions(seqs, grades, want, bound, avoid = null) {
  entryWhy = [];
  const n = seqs.get(grades[0]).length;
  if (!n) return { error: '행 없음' };
  for (const g of grades) if (seqs.get(g).length !== n) return { error: '주인공마다 키 수가 다름' };
  for (let i = 0; i < n; i += 1) {
    const e0 = seqs.get(grades[0])[i];
    const kindOf = (k) => (k.startsWith('N:') ? 'N' : 'T');
    for (const g of grades) { const e = seqs.get(g)[i]; if (kindOf(e[0]) !== kindOf(e0[0])) return { error: '주인공마다 키 종류가 다름' }; }
  }
  const al = new Map();
  for (const g of grades) { const x = alignKeys(seqs.get(g).map((e) => e[1]), want.get(g), seqs.get(g).map((e) => e[0])); if (!x) return { error: '정렬 실패' }; al.set(g, x); }
  const changedBy = new Map(grades.map((g) => [g, al.get(g).res.map((r) => !r.anchor)]));
  const changed = Array.from({ length: n }, (_, i) => grades.some((g) => changedBy.get(g)[i]));
  const commonFrame = (fr) => {
    let common = fr[0] === '' ? [] : fr[0].split('/');
    for (const fk of fr.slice(1)) { const p = fk === '' ? [] : fk.split('/'); let q = 0; while (q < common.length && q < p.length && common[q] === p[q]) q += 1; common = common.slice(0, q); }
    return common.join('/');
  };
  // 바뀐 곳 [i..j] 한 덩어리 계획. alOf(g) = 그 주인공 정렬, chOf(g) = 키별 바뀜. 못 걸면 { error }.
  const planBlock = (i, j, floor, alOf, chOf) => {
    const plan = new Map(), out = [];
    // v2e: 진입·복귀는 이 바뀐 곳에서 글이 바뀐 주인공만 찾는다(안 바뀐 주인공은 같은 진입을 지나면 사용자 경로로 팔을 받는다).
    const changedGrades = grades.filter((g) => chOf(g).slice(i, j + 1).some(Boolean));
    // 한 주인공의 바뀐 곳 [gi..gj] 계획(진입 x·복귀). 못 걸면 { error }.
    const planRange = (s, gi, gj) => {
      const fr = s.slice(gi, gj + 1).map((e) => chainKey(e[2]));
      if (fr.includes('?')) return { error: `바뀐 곳에 걷기가 못 본 조각 행(${s[gi][0]})` };
      const outer = commonFrame(fr);
      const within = (fk) => fk !== '?' && (outer === '' || fk === outer || fk.startsWith(outer + '/'));
      if (!fr.every(within)) return { error: `바뀐 글의 틀을 모을 수 없음(${s[gi][0]}…${s[gj][0]})` };
      let x = gi, ek = null;
      for (; x >= floor; x -= 1) {
        const fx = chainKey(s[x][2]);
        if (!within(fx)) break;
        if (fx !== outer) continue;
        ek = entryKind(s[x]);
        if (ek) break;
      }
      if (!ek) return { error: `바뀐 곳 ${s[gi][0]} 앞에 걸 수 있는 행이 없음 [${[...new Set(entryWhy)].slice(0, 3).join(' · ') || '후보 자리 자체가 없음'}]` };
      let y = gj + 1, back = null;
      for (; y < n; y += 1) {
        const fy = chainKey(s[y][2]);
        if (!within(fy)) break;
        if (fy !== outer) continue;
        if (isBackKeyIn(s[y], outer)) { back = elemAddr(s[y][0]); break; }
      }
      if (back === null) {
        if (outer === '' && y >= n) {
          // v2h: 걷기가 조각 호출 안에서 멈춘 구간 끝을 최상위 틀 복귀로 쓰면 틀이 어긋난다(chooseSpanCore 의 호출 op 복귀는 한 진입일 때만).
          if ((bound[2] || {}).depth > 0) return { error: `여러 곳: 구간 끝(${H(bound[1])})이 조각 호출 안 — 조각 틀 밖으로 돌아가는 복귀는 만들지 않는다` };
          back = bound[1];
        } else if (outer !== '') {
          let li = y - 1;
          while (li > x && chainKey(s[li][2]) !== outer) li -= 1;
          // v2h: 바뀐 곳 끝에 더 깊은 호출 안 키가 남으면 그 행 끝 복귀가 그 호출을 원래대로 다시 실행해 글이 겹친다 — 거부.
          if (li !== y - 1) return { error: '여러 곳: 바뀐 곳 끝이 더 깊은 조각 호출 안 — 행 끝 복귀는 그 호출 글을 한 번 더 찍는다' };
          const last = s[li], la = elemAddr(last[0]);
          back = (last[0].startsWith('R:') || last[0].startsWith('P:')) ? rowEndOf.get(la) : (last[0].startsWith('N:') ? la + 1 : undefined);
          if (back === undefined) return { error: '조각 안 복귀를 못 정함' };
        } else return { error: '복귀 키 없음(최상위 틀을 벗어남)' };
      }
      return { x, y, back, ek, source: elemAddr(s[x][0]) };
    };
    for (const g of changedGrades) {
      const s = seqs.get(g);
      let p = planRange(s, i, j);
      // v2h(2026-09-17): 여러 주인공 변경을 합친 범위로 못 걸면 **그 주인공이 바꾼 키 범위**로 다시 잡는다 — 한 주인공은 조각 안 대명사만 바꿨는데
      //   옆 주인공이 바꾼 최상위 행까지 걸쳐 바깥 틀 진입을 찾다 못 찾았다(0x0E90 0.4D8EF9 — 미카엘 「네놈」 대명사 · 모니카 「쓰러뜨리겠어요」 행).
      //   합친 범위로 되는 곳은 그대로 둔다(기존 payload 바이트 동일).
      // v2i: 합친 범위 계획이 그 주인공의 갈래 글 덩어리(avoid)를 덮어도 그 주인공 범위로 다시 잡는다
      //   (3BB687 카타리나 대명사+전원 어미를 합친 범위가 공통 머리 행까지 거슬러 복수 갈래를 덮음).
      if (p.error || (avoid && avoid(g, p.x, p.y))) {
        const cb = chOf(g);
        let gi = i, gj = j;
        while (gi < j && !cb[gi]) gi += 1;
        while (gj > gi && !cb[gj]) gj -= 1;
        if (gi !== i || gj !== j) { const q = planRange(s, gi, gj); if (!q.error && (p.error || !avoid(g, q.x, q.y))) p = q; }
      }
      if (p.error) return p;
      let ps = [p];
      // v2i: 그래도 갈래 글 덩어리를 덮으면 그 주인공의 바뀐 키를 **틀이 같은 연속 구간마다** 나눠 따로 잡는다
      //   (3BB687 카타리나 — 0B75 호출 안 「저→나」 는 호출 자리 진입, 최상위 「의 차례다→의 차례네」 는 그 뒤 행 진입).
      if (avoid && avoid(g, p.x, p.y)) {
        const cb = chOf(g), runs = [];
        for (let x2 = i; x2 <= j; x2 += 1) {
          if (!cb[x2]) continue;
          const fk = chainKey(s[x2][2]), last = runs[runs.length - 1];
          if (last && last.fk === fk && last.gj === x2 - 1) last.gj = x2; else runs.push({ gi: x2, gj: x2, fk });
        }
        if (runs.length > 1) {
          const sub = runs.map((r) => planRange(s, r.gi, r.gj));
          if (sub.every((q) => !q.error && !avoid(g, q.x, q.y))) ps = sub;
        }
      }
      plan.set(g, ps);
    }
    const groups = new Map();
    for (const g of changedGrades) for (const p of plan.get(g)) { const key = `${p.source}|${chainKey(p.ek.rc)}|${p.back}|${p.x}|${p.y}`; if (!groups.has(key)) groups.set(key, { p, gs: [] }); groups.get(key).gs.push(g); }
    let yMax = j + 1;
    for (const { p, gs } of groups.values()) {
      yMax = Math.max(yMax, p.y);
      if (!gs.some((g) => chOf(g).slice(p.x, Math.max(p.y, j + 1)).some(Boolean))) continue;
      const texts = new Map(), prefixTexts = new Map();
      for (const g of gs) {
        const r = alOf(g).res, W = alOf(g).W;
        texts.set(g, W.slice(r[p.x].from, r[Math.max(p.x, p.y - 1)].to).join(''));
        prefixTexts.set(g, W.slice(0, r[p.x].from).join(''));
      }
      out.push({ j: p.x, m: n - p.y, back: p.back, rc: p.ek.rc, force: p.ek.force, direct: !!p.ek.direct, convert: !!p.ek.convert, shift: p.ek.shift || 0, grades: gs, texts, prefixTexts });
    }
    return { regions: out, yMax };
  };
  // v2h(2026-09-17): 바뀐 곳이 사이에 최상위 키 없이 **나란한 조각 호출 둘 이상**에 걸쳐 바깥 틀 진입이 없으면, 호출마다 나눠 각 호출 자리 진입으로 계획한다
  //   (0x0019 3A0DF6 미카엘 「너희가→네놈들이」 — 0B7A 대명사 호출 + 0B7C 복수 접미 호출, 앞은 개행 키뿐).
  //   두 호출 키가 모두 바뀌어 정렬이 글을 어디서 가를지 모르면, **그 자리 키가 안 바뀐 다른 주인공의 글**(0B7C 「들이 」)로만 가른다 — 한 가지로 안 정해지면 나누지 않는다.
  const splitSiblingCalls = (i, j, floor) => {
    const frameOf = (g, x) => chainKey(seqs.get(g)[x][2]);
    const sibling = (a, b) => a !== '' && b !== '' && a !== '?' && b !== '?' && a !== b && !a.startsWith(b + '/') && !b.startsWith(a + '/');
    const cuts = [];
    for (let x = i; x < j; x += 1) if (grades.every((g) => sibling(frameOf(g, x), frameOf(g, x + 1)))) cuts.push(x);
    if (!cuts.length) return null;
    const toks = (t) => tokenize(t).map(normalizeRendered);
    const alt = new Map(), ch = new Map();
    for (const g of grades) {
      const src = al.get(g), W = src.W, WN = W.map(normalizeRendered);
      const res = src.res.map((r) => ({ ...r }));
      for (const c of cuts) {
        if (res[c].anchor || res[c + 1].anchor) continue;
        const lo = res[c].from, hi = res[c + 1].to;
        const tryAt = (k, rightSide) => {
          const cand = new Set(grades.filter((h) => h !== g && al.get(h).res[k].anchor).map((h) => toks(seqs.get(h)[k][1]).join('')));
          if (cand.size !== 1) return null;
          const T = [...cand][0].split('').filter((t) => t !== '');
          if (T.length > hi - lo) return null;
          const at = rightSide ? hi - T.length : lo + T.length;
          const seg = rightSide ? WN.slice(at, hi) : WN.slice(lo, at);
          return seg.length === T.length && seg.every((t, q) => t === T[q]) ? at : null;
        };
        const at = tryAt(c + 1, true) ?? tryAt(c, false);
        if (at === null) return null;
        res[c].to = at;
        res[c + 1].from = at;
      }
      alt.set(g, { res, W });
      ch.set(g, res.map((r, x) => !r.anchor && normalizeRendered(W.slice(r.from, r.to).join('')) !== normalizeRendered(seqs.get(g)[x][1])));
    }
    const out = [];
    let fl = floor, yMax = j + 1;
    const bounds = [i, ...cuts.map((c) => c + 1)];
    for (let b = 0; b < bounds.length; b += 1) {
      const a0 = bounds[b], b0 = b + 1 < bounds.length ? bounds[b + 1] - 1 : j;
      if (!grades.some((g) => ch.get(g).slice(a0, b0 + 1).some(Boolean))) continue;
      const r = planBlock(a0, b0, fl, (g) => alt.get(g), (g) => ch.get(g));
      if (r.error) return null;
      out.push(...r.regions);
      fl = r.yMax;
      yMax = Math.max(yMax, r.yMax);
    }
    return { regions: out, yMax };
  };
  const regions = [];
  let floor = 0;
  for (let i = 0; i < n;) {
    if (!changed[i]) { i += 1; continue; }
    let j = i;
    while (j + 1 < n && changed[j + 1]) j += 1;
    let res = planBlock(i, j, floor, (g) => al.get(g), (g) => changedBy.get(g));
    if (res.error) { const alt = splitSiblingCalls(i, j, floor); if (alt) res = alt; }
    if (res.error) return res;
    regions.push(...res.regions);
    floor = res.yMax;
    i = Math.max(res.yMax, j + 1);
  }
  if (!regions.length) return { error: '바뀐 곳 없음' };
  return { regions };
}
// v2i: 여러 곳 계획 + (키 모양이 다른 주인공이 섞이면) 모양 무리별 계획. avoid 는 chooseRegions 로 넘긴다.
function chooseRegionsAny(seqs, grades, want, bound, avoid = null) {
  const c = chooseRegions(seqs, grades, want, bound, avoid);
  if (!c.error || !/키 수가 다름|키 종류가 다름/.test(c.error)) return c;
  const sig = (g) => seqs.get(g).map((e) => (e[0].startsWith('N:') ? 'N' : 'T')).join('');
  const groups = new Map();
  for (const g of grades) { const key = sig(g); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(g); }
  if (groups.size < 2) return c;
  const all = [];
  for (const gs of groups.values()) {
    if (!gs.some((g) => normalizeRendered(want.get(g)) !== normalizeRendered(joinTexts(seqs.get(g))))) continue;
    const r = chooseRegions(seqs, gs, want, bound, avoid);
    if (r.error) return { error: `${c.error} / 무리 ${gs.map((g) => CLASS_NAMES[g]).join('·')}: ${r.error}` };
    for (const reg of r.regions) all.push({ ...reg, grades: reg.grades || gs });
  }
  return all.length ? { regions: all } : c;
}
function chooseSpanV2(seqs, grades, want, bound) {
  const a = chooseSpanCore(seqs, grades, want, bound, 'v1');
  if (a.skip) return a;
  if (!a.error) return { regions: [a] };
  const b = chooseSpanCore(seqs, grades, want, bound, 'ext');
  if (!b.error && !b.skip) return { regions: [b] };
  // v2c: 글이 하나도 안 바뀌었으면(주인공마다 팔 행만 다름) 한 진입으로 못 옮길 때 옛 조각 팔을 그대로 둔다.
  if (!grades.some((g) => normalizeRendered(want.get(g)) !== normalizeRendered(joinTexts(seqs.get(g))))) return { skip: true, keptArms: a.error };
  const c = chooseRegions(seqs, grades, want, bound);
  if (!c.error) return c;
  // v2i: 원문 갈래(등급 관문·조각 팔)로 주인공마다 키 모양이 다르면 **모양(키 수·개행/글 종류)이 같은 무리끼리** 따로 여러 곳 계획을 세운다.
  //   무리마다 바뀐 곳에 진입을 두고, 같은 진입을 지나는 다른 무리 주인공은 뒤의 source 묶음이 사용자 경로로 팔을 채운다(705FFD 여성 갈래 「응,꼭/들려줘」,
  //   3C5660 조각 팔 「가버렸어/가버렸는데」). 바뀐 곳이 없는 무리는 건너뛴다. 예전 통과 발화에는 쓰지 않는다.
  if (newKindsOn() && /키 수가 다름|키 종류가 다름/.test(c.error)) {
    const cg = chooseRegionsAny(seqs, grades, want, bound);
    if (!cg.error) return cg;
    return { error: `${a.error} / 확장 진입: ${b.error || '-'} / 여러 곳(무리별): ${cg.error}` };
  }
  return { error: `${a.error} / 확장 진입: ${b.error || '-'} / 여러 곳: ${c.error}` };
}

// 정적 중간 진입(v1d 그대로)
let farIndex = null;
function farJumpsInto(S, B) {
  if (!farIndex) {
    farIndex = [];
    for (let a = 0; a + 4 < rom.length; a += 1) {
      if (rom[a] !== 0x0d) continue;
      const m = rom[a + 1];
      if (m === 0x17 || m === 0x18) {
        const v = rom[a + 2] | (rom[a + 3] << 8) | (rom[a + 4] << 16);
        const t = v >= 0xc00000 ? v - 0xc00000 : (v >= 0x400000 && v < 0x7e0000 ? v : -1);
        if (t >= 0) farIndex.push([t, a, m === 0x17 ? 'jumpL-pattern' : 'callL-pattern']);
      } else if (m === 0x16) {
        farIndex.push([(a & 0xff0000) | rom[a + 2] | (rom[a + 3] << 8), a, 'jump16-pattern']);
      }
    }
    farIndex.sort((x, y) => x[0] - y[0]);
  }
  let lo = 0, hi = farIndex.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (farIndex[mid][0] <= S) lo = mid + 1; else hi = mid; }
  const out = [];
  for (let i = lo; i < farIndex.length && farIndex[i][0] < B; i += 1) {
    const [t, a, kind] = farIndex[i];
    if (!(a >= S && a < B)) out.push([a, t, kind]);
  }
  return out;
}
const staticCache = new Map();
function staticTargets(lo, hi) {
  const key = lo + ':' + hi;
  if (staticCache.has(key)) return staticCache.get(key);
  const t = [];
  let a = lo;
  while (a < hi) {
    const op = ops.opAt(a);
    if (!op || !op.len) { a += 1; continue; }
    const b = rom[a];
    if (b === 0x4e) t.push([a, a + 2 + rom[a + 1], 'skip']);
    else if (b === 0x33 || b === 0x34) t.push([a, a + op.len + 2, 'check-fail']);
    else if (b === 0x0d && [0x00, 0x01, 0x10].includes(rom[a + 1])) t.push([a, a + op.len + 2, 'check-fail']);
    else if (b === 0x49 && rom[a + 1] <= 0x01) t.push([a, a + op.len + 2, 'check-fail']);
    else if (b === 0x0d && (rom[a + 1] === 0x17 || rom[a + 1] === 0x18)) {
      const v = rom[a + 2] | (rom[a + 3] << 8) | (rom[a + 4] << 16);
      t.push([a, v >= 0xc00000 ? v - 0xc00000 : v, 'jumpL']);
    } else if (b === 0x0d && rom[a + 1] === 0x16) t.push([a, (a & 0xff0000) | rom[a + 2] | (rom[a + 3] << 8), 'jump16']);
    a += op.len;
  }
  staticCache.set(key, t);
  return t;
}

function specVariants(spec) {
  const out = [], seen = new Set();
  for (const v of spec.variants || []) {
    const set = parseRange(v.grades);
    const gs = set === null ? [...Array(8).keys()] : [...set];
    const src = v.src ? String(v.src).toUpperCase() : '';
    const was = v.was === undefined ? undefined : String(v.was);
    for (const g of gs) {
      const k = `${g}|${src}|${was === undefined ? '' : normalizeRendered(was)}`;
      if (seen.has(k) && spec.status !== 'migrated-unchanged') throw new Error(`등급 ${g} 진입 ${src || '공통'}${was !== undefined ? '(was)' : ''} 이 두 번 정의됨`);
      seen.add(k);
    }
    out.push({ gs: new Set(gs), src, was, text: v.text, review: v.review || spec.status });
  }
  return out;
}
function pickVariant(variants, g, srcKey, v, status) {
  const exact = variants.filter((x) => x.gs.has(g) && x.src === srcKey);
  const common = variants.filter((x) => x.gs.has(g) && x.src === '');
  const pool = exact.length ? exact : common;
  if (!pool.length) return { error: '발화 원본에 문장 없음(작성 누락 — 공용 기본값으로 떨어뜨리지 않는다)' };
  // v2g: 이름 토큰의 표시 이름은 등급마다 다르게 찍힌다({X|3900|율리안} vs {X|3900|토마스}) — 같은 토큰이면 같은 글로 본다(구간 경계 ⟦|⟧ 도 뺀다).
  const plain = (s) => normalizeRendered(String(s).split(SEP).join(''));
  if (status === 'migrated-unchanged') return pool.find((x) => plain(x.text) === plain(v.ko)) || { error: `migrated-unchanged 인데 문장이 현재 한국어와 다름(현재 「${v.ko}」)` };
  const byWas = pool.filter((x) => x.was !== undefined && normalizeRendered(x.was) === normalizeRendered(v.ko));
  if (byWas.length === 1) return byWas[0];
  if (byWas.length > 1) return { error: 'was 가 같은 문장이 둘' };
  const noWas = pool.filter((x) => x.was === undefined);
  if (noWas.length === 1) return noWas[0];
  if (!noWas.length) return { error: '이 갈래(현재 한국어)에 맞는 was 문장이 없음' };
  return { error: '같은 진입에 문장이 여럿 — was(옛 한국어)로 가를 것' };
}
function rangeString(gs) {
  const s = [...gs].sort((a, b) => a - b), runs = [];
  for (const g of s) { const last = runs[runs.length - 1]; if (last && last[1] === g - 1) last[1] = g; else runs.push([g, g]); }
  return runs.map(([a, b]) => (a === b ? String(a) : `${a}-${b}`)).join(',');
}
function splitUser(user) { const cut = user.lastIndexOf(':'); return [user.slice(0, cut), Number(user.slice(cut + 1))]; }

// v2h: 복귀 B 가 조각 호출 op(08..0B)면 그 호출 안 키의 틀 접두(틀/B+2) — 그 키부터는 payload 밖(원래 행이 찍는 글)이다.
const callCutPrefix = (frame, B) => (rom[B] >= 0x08 && rom[B] <= 0x0b && ops.opAt(B) && ops.opAt(B).kind !== 'text' ? (frame ? frame + '/' : '') + H(B + 2) : null);
// v2h(2026-09-17): 꼬리 키(구간 밖이라 호출 체인을 모름)가 호출 자리 진입 rc 의 호출에서 온 글일 수 있는지 — 꼬리에서 그 키 앞 최상위 키 뒤를 op 단위로 따라가
//   rc 바깥 호출 op(rc[0]−2)를 만나면 true, 다른 뱅크거나 그 주소를 지나치면 false, 해독이 끊기거나 48 op 안에 못 가리면 true(모르면 영향 경로로 둔다).
//   계기: 0x017D 58A990.E3CD876(끝 대기 없음, 뱅크 58)의 꼬리 대명사 행 3CD876 이 0x0FA1 호출 자리 733864 진입의 사용자로 잡혀 「엘렌 문장 둘」 거부.
function tailCallMayMatch(seg, ti, rc) {
  const keys = [...seg.segments.flatMap((sg) => sg.keys), ...(seg.tail || [])];
  const base = seg.segments.reduce((n, sg) => n + sg.keys.length, 0);
  let from = null;
  for (let x = base + ti - 1; x >= 0 && from === null; x -= 1) {
    const k = keys[x][0], a = elemAddr(k);
    if (a === null || isFragBank(a) || k.startsWith('P:')) continue;
    from = k.startsWith('R:') ? (rowEndOf.get(a) ?? a + 1) : a + 1;
  }
  if (from === null) return true;
  const want = rc[0] - 2;
  if ((from >> 16) !== (want >> 16)) return false;
  let a = from;
  for (let n = 0; n < 48; n += 1) {
    if (a === want) return rom[a] >= 0x08 && rom[a] <= 0x0b;
    if (a > want) return false;
    const op = ops.opAt(a);
    if (!op || !op.len) return true;
    a += op.len;
  }
  return true;
}
// 색인 사용자 경로 중 S 를 지나는 경로(호출 자리 진입이면 같은 복귀 키로 오는 경로만).
function userPathsAt(rec2, g, S, rc) {
  const out = [];
  for (const v of (rec2.grades || {})[CLASS_NAMES[g]] || []) {
    if (!(v.keys || []).some(([k]) => (k.startsWith('R:') || k.startsWith('P:')) && elemAddr(k) === S)) continue;
    if (!v.src || !['R', 'P', 'F'].includes(v.srcKind)) { if (!rc.length) out.push({ v, error: '진입 행 없음' }); continue; }
    const seg = segOf(rec2, g, v);
    if (seg.error) { if (!rc.length) out.push({ v, error: seg.error }); continue; }
    let hit = null;
    seg.segments.forEach((sg, si) => sg.keys.forEach((e, ki) => { if (!hit && (e[0].startsWith('R:') || e[0].startsWith('P:')) && elemAddr(e[0]) === S) hit = { si, ki, chain: e[2] }; }));
    // v2g: 끝 대기가 없는 발화(rec.end 없음)는 첫 구간 뒤 키가 꼬리로 간다 — 그 자리 글은 그 발화 payload 밖이라 행 그대로 찍힌다.
    //   우리 payload 가 그 행을 바꾸면 이 발화에도 그대로 비치므로, 「해독 실패」로 진입을 버리지 말고 꼬리 글로 대조한다(뒤에서 현재 글·작성 글과 맞춰 본다).
    if (!hit) {
      const ti = (seg.tail || []).findIndex(([k]) => (k.startsWith('R:') || k.startsWith('P:')) && elemAddr(k) === S);
      if (ti >= 0) { if (!rc.length || tailCallMayMatch(seg, ti, rc)) out.push({ v, seg, si: -1, ki: ti, chain: null, tail: true }); continue; }
      if (!rc.length) out.push({ v, error: '진입 키가 구간 밖 꼬리에 있음' });
      continue;
    }
    if (rc.length && chainKey((hit.chain || []).slice(-2)) !== chainKey(rc)) continue;
    out.push({ v, seg, ...hit });
  }
  return out;
}
function currentRunTextV2(affected, g, S, B, rc) {
  const outs = new Set(), nexts = new Set();
  for (const a of affected) {
    if (a.error) return { error: `${CLASS_NAMES[g]} 경로 해독 실패(${a.error})` };
    const keys = a.tail ? (a.seg.tail || []).map((kt) => [kt[0], kt[1], null]) : a.seg.segments[a.si].keys; // v2g: 꼬리 키도 현재 글로 읽는다
    const frame = chainKey(keys[a.ki][2]);
    const cutPrefix = callCutPrefix(frame, B);
    let text = '', stop = -1, stopReason = 'end';
    for (let i = a.ki; i < keys.length; i += 1) {
      const [k, t, ch] = keys[i];
      const ad = elemAddr(k), fk = chainKey(ch);
      if (i > a.ki && ad !== null && fk === frame && ad >= B) { stop = ad; stopReason = 'key'; break; }
      if (i > a.ki && cutPrefix && (fk === cutPrefix || fk.startsWith(cutPrefix + '/'))) { stop = B; stopReason = 'key'; break; } // v2h: 호출 op 복귀면 호출 안 키부터는 원래 행 글
      if (i > a.ki && rc.length && !fk.startsWith(frame)) { stopReason = 'frame'; break; }
      text += t;
    }
    let reach;
    // v2i(2026-09-17): 복귀 자리가 글 행·개행 키인데 이 경로에 그 키가 없고 더 뒤 키로 이어지면 이 경로는 복귀 자리를 **안 지난다**(원문 등급 관문이
    //   건너뜀) — 복귀를 그 다음 키로 돌려준다(next). 걷기 추정보다 키가 확실하다(722E93 남성 → 722EBF).
    const skipsBack = stopReason === 'key' && stop > B && pathSkipsBackKey(keys, a.ki, frame, B);
    if (stop === B) reach = true;
    else if (skipsBack) reach = true;
    else if (!rc.length) { const w = walkSegment(S, g); reach = !w.error && (w.back === B || w.softs.some((s) => s.at === B) || (w.depth > 0 && w.frameCalls[0] === B)); }
    else reach = stopReason !== 'key';
    if (!reach) return { error: `${CLASS_NAMES[g]} 경로가 복귀 ${H(B)} 에 닿는지 확인 못 함` };
    outs.add(text);
    nexts.add(skipsBack ? stop : B);
  }
  if (!outs.size) return { error: `${CLASS_NAMES[g]} 경로 키에 진입 ${H(S)} 없음` };
  if (outs.size > 1) return { error: `${CLASS_NAMES[g]} 같은 진입에서 현재 글 ${outs.size}가지` };
  if (nexts.size > 1) return { error: `${CLASS_NAMES[g]} 같은 진입에서 이어지는 자리 ${nexts.size}가지(${[...nexts].map(H).join('/')})` };
  return { text: [...outs][0], next: [...nexts][0] };
}
// v2i: 복귀 자리 B 가 글 행 머리·개행 키 자리인데 경로 키에 B 가 없으면 그 경로는 B 를 안 지난다.
function pathSkipsBackKey(keys, ki, frame, B) {
  if (!(rowStart.has(B) || rom[B] === 0x24)) return false;
  for (let i = ki; i < keys.length; i += 1) { const [k, , ch] = keys[i]; if (chainKey(ch) === frame && elemAddr(k) === B) return false; }
  return true;
}
function authoredPieceAt(spec2, g, a, B, rc, strictEdges = true) {
  let variants2;
  try { variants2 = specVariants(spec2); } catch (e) { return { error: String(e.message || e) }; }
  const st = pickVariant(variants2, g, String(a.v.src || '').toUpperCase(), a.v, spec2.status);
  if (st.error) return { error: st.error };
  const want = String(st.text).split(SEP).join('');
  const allKeys = a.seg.segments.flatMap((sg) => sg.keys).concat((a.seg.tail || []).map((kt) => [kt[0], kt[1], null]));
  // v2g: 꼬리에서 맞은 경로는 allKeys 뒤쪽(구간 키 전부 다음)이 시작이다.
  const segCount = a.seg.segments.reduce((n, sg) => n + sg.keys.length, 0);
  const offset = a.tail ? segCount : a.seg.segments.slice(0, a.si).reduce((n, sg) => n + sg.keys.length, 0);
  const i0 = offset + a.ki;
  const frame = chainKey(allKeys[i0][2]);
  const cutPrefix = callCutPrefix(frame, B);
  let i1 = allKeys.length;
  for (let i = i0 + 1; i < allKeys.length; i += 1) {
    const ad = elemAddr(allKeys[i][0]), fk = chainKey(allKeys[i][2]);
    if (ad !== null && fk === frame && ad >= B) { i1 = i; break; }
    if (cutPrefix && (fk === cutPrefix || fk.startsWith(cutPrefix + '/'))) { i1 = i; break; } // v2h: 호출 op 복귀
    if (rc.length && !fk.startsWith(frame)) { i1 = i; break; }
  }
  const al = alignKeys(allKeys.map((e) => e[1]), want, allKeys.map((e) => e[0]));
  if (!al) return { error: '정렬 실패' };
  const r = al.res;
  const startOk = i0 === 0 || r[i0 - 1].anchor || r[i0].anchor;
  const endOk = i1 === allKeys.length || (r[i1] && r[i1].anchor) || r[i1 - 1].anchor;
  // strictEdges=false: 같은 발화의 갈래 경로 대조용 — 앞뒤 키가 바뀌어도(다른 항목이 맡음) 이 구간에 정렬된 조각만 본다.
  if (strictEdges && (!startOk || !endOk)) return { error: '진입·복귀 경계가 바뀐 글 한가운데' };
  // v2i: 이 경로가 복귀 자리 B 를 안 지나고 더 뒤 키로 이어지면(원문 등급 관문이 건너뜀) 그 키 주소를 next 로 돌려준다.
  let next = B;
  if (i1 < allKeys.length) {
    const ad = elemAddr(allKeys[i1][0]), fk = chainKey(allKeys[i1][2]);
    if (ad !== null && fk === frame && ad > B && pathSkipsBackKey(allKeys, i0, frame, B)) next = ad;
  }
  return { text: al.W.slice(r[i0].from, r[i1 - 1].to).join(''), next };
}

const report = { schema: 'bokuno-utterance-compile-report-v1', version: VERSION, build, patchSha256: sha(patchBuf), tableSha256: sha(tableBuf), specsSha256: sha(specsBuf),
  hasCopula, utterances: [], counts: {} };
const uttByUid = new Map();
const candidates = [];
const splitDecls = new Map();   // v2i: 부분 대체하는 여러 호출 자리 선언 id → 선언
const realizedByChecks = [];    // v2i: [U, 형제 uid 목록]
const tailByOther = [];         // v2i: [U, 주인공, 꼬리 첫 행 주소, 누가] — 꼬리를 같은 발화 다른 경로 진입이 고친다
const carriedBackMismatch = []; // v2i: 예전 통과 항목에서 옛 선언 팔을 옮겼는데 옛 복귀 ≠ 새 복귀(바이트는 안 바꾸고 기록만)

for (const spec of specs.utterances || []) {
  currentUid = spec.uid;
  const rec = table.get(spec.uid);
  const U = { uid: spec.uid, status: spec.status, ok: false, errors: [], warnings: [], entries: [], supersedes: [], midEntry: [], staticMidEntry: [], carried: [], spans: [] };
  report.utterances.push(U);
  uttByUid.set(spec.uid, U);
  // v2i: 원문 등급 팔 행(제자리·그림자)이 이미 주인공별로 갈라져 있어 **행 문안(TSV)만 고쳐 실현한** 발화 — payload 를 만들지 않는다.
  //   발화 표(v14a)는 그 뒤 행 수리를 모르므로 여기서 비교하면 같은 수리를 payload 로 한 번 더 만들려다 겹침으로 거부된다(3C2440 「사실 일까」·3C4FC5 「노렴」).
  //   realizedRows 에 적힌 행이 TSV 에 있는지만 확인한다(글이 화면에 맞는지는 빌드 뒤 전체 본문 검사·실코어 PNG).
  if (spec.status === 'realized-rows') {
    const missing = (spec.realizedRows || []).filter((r) => !TSV_FIXED_ROWS.has(parseInt(r, 16)));
    if (!(spec.realizedRows || []).length || missing.length) U.errors.push(`행 문안 실현 발화인데 TSV 에 없는 행: ${missing.join(',') || '(realizedRows 비어 있음)'}`);
    else U.warnings.push(`행 문안(TSV ${spec.realizedRows.join(',')})으로 실현 — payload 없음`);
    continue;
  }
  // v2i: 같은 행을 쓰는 **형제 발화의 payload 가 이 발화 글을 그대로 싣는** 경우(걷기가 반복 루프를 한 기록에 이어 붙인 3CCA5C.3A484E 「가득해…/…이다!」 —
  //   3CCA5C.E3CCA70·3CCA74.3A484E 가 같은 주인공별 글을 이미 설치). 형제가 모두 통과했는지는 끝에서 확인한다.
  if (spec.status === 'realized-by') {
    if (!(spec.realizedBy || []).length) U.errors.push('형제 발화 실현인데 realizedBy 비어 있음');
    else { U.warnings.push(`형제 발화(${spec.realizedBy.join(',')}) payload 로 실현 — payload 없음`); realizedByChecks.push([U, spec.realizedBy]); }
    continue;
  }
  if (!rec) { U.errors.push('발화 표에 uid 없음'); continue; }
  if (rec.pairingUnresolved) U.warnings.push('짝짓기 미확정 경로 포함');
  let variants;
  try { variants = specVariants(spec); } catch (err) { U.errors.push(String(err.message || err)); continue; }
  const cols = Number((rec.w || [])[0]) || 0;
  // v2i: 주인공·경로마다 고른 원본 문장이 **모두 지금 한국어와 같으면** 바꿀 것이 없다 — 진입을 잡지 않는다.
  //   전엔 같은 글인데도 갈래 경로(단수/복수·호칭 유무)마다 진입을 잡다가 「문장이 둘」·「작성 형제 경로 글이 둘」로 거부했다
  //   (55B271.55B2B2 되돌린 작성본, 7BEFBA.7BF082 migrated-unchanged — 원본과 표 글 16/15 경로 전부 같음 실측). 거부돼도 화면은 같았지만 보고가 틀렸다.
  if (newKindsOn()) {   // 예전 통과 발화는 건드리지 않는다(같은 글이어도 옛 선언을 대체하는 항목일 수 있다)
    const plainSame = (s) => normalizeRendered(String(s).split(SEP).join(''));
    let allSame = true, any = false;
    for (let g = 0; g < 8 && allSame; g += 1) for (const v of (rec.grades || {})[CLASS_NAMES[g]] || []) {
      any = true;
      const st = pickVariant(variants, g, String(v.src || '').toUpperCase(), v, spec.status);
      if (st.error || plainSame(st.text) !== plainSame(v.ko)) { allSame = false; break; }
    }
    if (any && allSame) { U.warnings.push('원본 문장이 모든 주인공·경로에서 지금 한국어와 같음 — 진입을 잡지 않는다'); continue; }
  }
  const paths = [];
  for (let g = 0; g < 8; g += 1) {
    const uniq = [], seen = new Set();
    for (const v of (rec.grades || {})[CLASS_NAMES[g]] || []) {
      const dk = `${String(v.src || '').toUpperCase()}|${v.lead}|${normalizeRendered(v.ko)}`;
      if (seen.has(dk)) continue;
      seen.add(dk);
      uniq.push(v);
    }
    const perSrc = new Map();
    for (const v of uniq) { const s = String(v.src || '').toUpperCase(); perSrc.set(s, (perSrc.get(s) || 0) + 1); }
    for (const v of uniq) {
      const srcKey = String(v.src || '').toUpperCase();
      const who = `${CLASS_NAMES[g]}@${srcKey || '-'}${perSrc.get(srcKey) > 1 ? '「' + String(v.ko).slice(0, 10) + '」' : ''}`;
      const st = pickVariant(variants, g, srcKey, v, spec.status);
      if (st.error) { U.errors.push(`${who}: ${st.error}`); continue; }
      if (!srcKey || !['R', 'P', 'F'].includes(v.srcKind)) { U.errors.push(`${who}: 이벤트 스트림 진입 행 없음`); continue; }
      const seg = segOf(rec, g, v);
      if (seg.error) { U.errors.push(`${who}: ${seg.error}`); continue; }
      const ps = pathSubspans(seg, rec);
      if (ps.error) { U.errors.push(`${who}: ${ps.error}`); continue; }
      const flat = ps.subs.map((s, i) => ({ ...s, flat: i }));
      const tailText = joinTexts(seg.tail || []);
      const full = String(st.text).split(SEP).join('');
      let parts;
      if (spec.status === 'migrated-unchanged') {
        parts = flat.map((s) => joinTexts(s.keys));
        if (parts.join('') + tailText !== v.ko) { U.errors.push(`${who}: 표 키로 재구성한 문안이 본문과 다름`); continue; }
      } else {
        const stToks = tokenize(String(st.text)), tailToks = tokenize(tailText);
        const tailOk = !tailToks.length || (stToks.length >= tailToks.length
          && tailToks.every((t, i) => normalizeRendered(stToks[stToks.length - tailToks.length + i]) === normalizeRendered(t)));
        const lastWalk = seg.segments[seg.segments.length - 1].walk;
        // v2i: 꼬리 첫 행에서 시작하는 **같은 발화의 다른 경로 문장**(같은 주인공)이 작성 글의 끝과 같으면, 그 경로 진입 payload 가 꼬리 행을 고친다 —
        //   이 경로는 머리만 계획하고 꼬리는 그 진입에 맡긴다(0.E3CDB86 여성 「분명 멋진 」 경로의 꼬리 「그 사람이겠죠→겠지」 = 3CDB7B 경로 문장). 진입이 실제로 생겼는지는 끝에서 본다.
        let headOverride = null;
        if (!tailOk && newKindsOn() && (seg.tail || []).length) {
          const tailSrc = elemAddr(seg.tail[0][0]);
          const other = tailSrc === null ? null : variants.find((x) => x.gs.has(g) && x.src === H(tailSrc));
          const otherText = other ? String(other.text).split(SEP).join('') : null;
          if (otherText && normalizeRendered(String(st.text).split(SEP).join('')).endsWith(normalizeRendered(otherText))) {
            const oToks = tokenize(otherText);
            headOverride = stToks.slice(0, stToks.length - oToks.length).join('') + tailText;
            tailByOther.push([U, g, tailSrc, who]);
          }
        }
        if (!tailOk && headOverride === null) { U.errors.push(`${who}: 구간 끝(${lastWalk.boundary} @${H(lastWalk.back)}) 뒤 꼬리 「${tailText}」 는 이 발화 payload 밖이라 고칠 수 없다 — 문장 끝에 그대로 둘 것`); continue; }
        const stTextUse = headOverride !== null ? headOverride : String(st.text);
        const stToksUse = tokenize(stTextUse);
        const headText = tailToks.length ? stToksUse.slice(0, stToksUse.length - tailToks.length).join('') : stTextUse;
        const authored = headText.split(SEP);
        const nonEmpty = flat.map((s, i) => (s.keys.length ? i : -1)).filter((i) => i >= 0);
        parts = flat.map(() => '');
        if (authored.length === nonEmpty.length) {
          nonEmpty.forEach((si, n) => { parts[si] = authored[n]; });
          // v2h(2026-09-17): 작성자가 준 ⟦|⟧ 경계가 **안 바뀐 원래 행 글(닻)** 을 가로지르면 그 글이 payload 와 원래 행에서 두 번 찍히거나 빠진다.
          //   실측: 733853.733871 「,코델리아.\n내⟦|⟧{J|이가}…」 — 「내」는 다음 하위 구간의 대명사 조각(P-0FA1-makikoma)이 원래대로 찍는 글인데
          //   앞 구간 payload 에도 들어가 실기 화면이 「내내가 휘말리게」(모니카 「제제가」). 정렬로 닻 자리를 구해 경계가 닻 앞뒤와 맞는지 본다.
          if (nonEmpty.length > 1) {
            const allKeys = [], owner = [];
            flat.forEach((s, si) => s.keys.forEach((e) => { allKeys.push(e); owner.push(si); }));
            const al = alignKeys(allKeys.map((e) => e[1]), authored.join(''), allKeys.map((e) => e[0]));
            let cut = 0, bad = null;
            // 이웃 하위 구간이 안 바뀌면(payload 없이 원래 행이 찍음) 그 구간 닻 글이 경계 너머 작성 글에 들어가면 안 된다.
            //   이웃도 바뀌면(둘 다 payload) 글을 경계 너머로 옮기는 것은 작성 판단이라 허용(55B182.55B323 「다」 이동).
            const unchangedPart = (n) => normalizeRendered(authored[n]) === normalizeRendered(joinTexts(flat[nonEmpty[n]].keys));
            for (let n = 0; al && n + 1 < nonEmpty.length && !bad; n += 1) {
              cut += tokenize(authored[n]).length;
              const la = owner.lastIndexOf(nonEmpty[n]), fb = owner.indexOf(nonEmpty[n + 1]);
              if (unchangedPart(n + 1) === false && unchangedPart(n) === false) continue;
              if (al.res[fb] && al.res[fb].anchor && cut > al.res[fb].from && unchangedPart(n + 1)) bad = `다음 구간 첫 키 ${allKeys[fb][0]}「${allKeys[fb][1]}」 글이 앞 구간 작성 글에 들어감`;
              else if (al.res[la] && al.res[la].anchor && cut < al.res[la].to && unchangedPart(n)) bad = `앞 구간 끝 키 ${allKeys[la][0]}「${allKeys[la][1]}」 글이 뒤 구간 작성 글에 들어감`;
            }
            if (bad) { U.errors.push(`${who}: ⟦|⟧ 경계가 안 바뀐 원래 행 글과 어긋남 — ${bad} (payload 와 원래 행이 같은 글을 두 번 찍거나 빼먹는다)`); continue; }
          }
        } else if (authored.length === 1 && nonEmpty.length > 1) {
          const auto = autoSplit(flat, nonEmpty, headText);
          if (!auto) { U.errors.push(`${who}: 글이 있는 하위 구간 ${nonEmpty.length}개인데 ⟦|⟧ 가 없고 정렬로도 못 나눔 — 지금 글 ${nonEmpty.map((i) => `「${joinTexts(flat[i].keys)}」`).join(' ⟦|⟧ ')}`); continue; }
          parts = auto;
          U.warnings.push(`${who}: ⟦|⟧ 없이 정렬로 하위 구간 ${nonEmpty.length}개를 나눔`);
        } else { U.errors.push(`${who}: 글이 있는 하위 구간 ${nonEmpty.length}개인데 ⟦|⟧ 구분 ${authored.length - 1}개 — 지금 글 ${nonEmpty.map((i) => `「${joinTexts(flat[i].keys)}」`).join(' ⟦|⟧ ')}`); continue; }
      }
      const lines = full.split('\n');
      if (v.jpNl !== null && v.jpNl !== undefined && lines.length - 1 > Number(v.jpNl)) (spec.status === 'migrated-unchanged' ? U.warnings : U.errors).push(`${who}: 개행 ${lines.length - 1} > 원문 본문 개행 ${v.jpNl}`);
      const wrap = wrapIssues(full, cols, v.startCol);
      if (wrap.length) (spec.status === 'migrated-unchanged' ? U.warnings : U.errors).push(`${who}: ${wrap.join(' / ')}`);
      const nameSet = new Set(seg.segments.flatMap((s) => s.walk.names.map((nm) => nm.hex)));
      const koNorm = normalizeRendered(String(v.lead || '') + String(v.ko || ''));
      for (const t of tokenize(full)) {
        if (!t.startsWith('{X|')) continue;
        const hex = t.split('|')[1];
        if (!NAME_HEX_RE.test(hex)) U.errors.push(`${who}: 지원하지 않는 이름 토큰 ${hex}`);
        else if (!nameSet.has(hex)) {
          if (koNorm.includes(`{X|${hex}}`)) U.warnings.push(`${who}: 이름 토큰 ${hex} 는 원본 범위 밖이지만 현재 한국어에 이미 있음`);
          else U.errors.push(`${who}: 이름 토큰 ${hex} 가 원본 범위에 없음`);
        }
      }
      if (describeOut) {
        const D = (describe[spec.uid] ||= { uid: spec.uid, events: rec.events || [], w: rec.w, flags: rec.flags || [], branch: rec.branch || null, grades: {} });
        (D.grades[CLASS_NAMES[g]] ||= []).push({ src: srcKey, ...(perSrc.get(srcKey) > 1 ? { was: v.ko } : {}), segments: seg.segments.length,
          parts: flat.map((s) => joinTexts(s.keys)), nonEmpty: flat.filter((s) => s.keys.length).length, tail: tailText,
          jp: v.jp, flags: v.flags || [], startCol: v.startCol, jpNl: v.jpNl, lead: v.lead });
      }
      paths.push({ g, srcKey, v, seg, flat, parts });
    }
  }
  if (describeOut) { (describe[spec.uid] ||= { uid: spec.uid, events: rec.events || [], grades: {} }).errors = U.errors.slice(); }
  if (U.errors.length) continue;
  const groups = new Map();
  for (const p of paths) p.seg.segments.forEach((sg, si) => {
    const key = `${sg.entry}|${sg.walk.softs.map((s) => s.at).join(',')}|${sg.walk.back}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ p, si, sg });
  });
  // v2f(2026-09-16): 같은 주인공·같은 구간을 비등급 갈래(파티 인원 대명사 0B2B·0B74 등) 경로 둘이 지날 때, 키가 한 덩어리(첫~끝 다른 색인)만 다르고
  //   그 덩어리의 옛 글이 두 경로 작성 문장에 같은 자리에 그대로 있으며 앞뒤 작성 글이 같으면 한 payload 로 두 갈래를 덮는다.
  //   그 덩어리 색인은 고정(fixed)으로 기록하고, 고른 payload 구간이 고정 색인과 겹치면 거부한다(갈래 글은 원래 스트림이 낸다).
  //   한쪽 경로만 덩어리 글을 고쳤으면(카타리나 「저→나」 — 대명사 조각 행) 계획은 그 경로로 하고, payload 구간이 덩어리 안에만 있으면 허용한다
  //   (그 행은 그 갈래에서만 실행되는 조각 안 행이라 호출 자리 키 payload 가 그 갈래에만 걸린다).
  const nonGradeFixed = (prev, m, hereB) => {
    const hereA = prev.here;
    if (hereA.length !== hereB.length) return null;
    const out = [];
    let swap = null;
    const split = (keptWant, keptBlock, otherWant) => {
      for (let p = keptBlock ? keptWant.indexOf(keptBlock) : -1; p >= 0; p = keptWant.indexOf(keptBlock, p + 1)) {
        const X = keptWant.slice(0, p), Y = keptWant.slice(p + keptBlock.length);
        if (otherWant.length >= X.length + Y.length && otherWant.startsWith(X) && otherWant.endsWith(Y)) return otherWant.slice(X.length, otherWant.length - Y.length);
      }
      return null;
    };
    for (let k = 0; k < hereA.length; k += 1) {
      const ka = hereA[k].keys, kb = hereB[k].keys;
      if (ka.length !== kb.length) return null;
      const wantA = prev.m.p.parts[hereA[k].flat] || '', wantB = m.p.parts[hereB[k].flat] || '';
      const diff = [];
      for (let i = 0; i < ka.length; i += 1) if (ka[i][0] !== kb[i][0] || normalizeRendered(ka[i][1]) !== normalizeRendered(kb[i][1])) diff.push(i);
      if (!diff.length) { if (normalizeRendered(wantA) !== normalizeRendered(wantB)) return null; out.push({ idx: [], changed: false }); continue; }
      const lo = diff[0], hi = diff[diff.length - 1];
      const blockA = joinTexts(ka.slice(lo, hi + 1)), blockB = joinTexts(kb.slice(lo, hi + 1));
      const tA = split(wantB, blockB, wantA), tB = split(wantA, blockA, wantB);
      let side = null;
      if (tA !== null && normalizeRendered(tA) === normalizeRendered(blockA)) side = null;
      else if (tB !== null && normalizeRendered(tB) === normalizeRendered(blockB)) side = null;
      else if (tA !== null) side = 'A';
      else if (tB !== null) side = 'B';
      else return null;
      if (side) { const s = side === 'B'; if (swap !== null && swap !== s) return null; swap = s; }
      const idx = [];
      for (let i = lo; i <= hi; i += 1) idx.push(i);
      out.push({ idx, changed: !!side });
    }
    return { out, swap: !!swap };
  };
  for (const members of groups.values()) {
    const byG = new Map(), allByG = new Map();
    let bad = null;
    for (const m of members) {
      const here = m.p.flat.filter((s) => s.si === m.si);
      if (!allByG.has(m.p.g)) allByG.set(m.p.g, []);
      allByG.get(m.p.g).push({ m, here });
      const sig = here.map((s) => s.keys.map((e) => e[0] + '=' + normalizeRendered(e[1])).join('|') + '→' + normalizeRendered(m.p.parts[s.flat])).join('#');
      const prev = byG.get(m.p.g);
      if (prev) {
        if (prev.sig !== sig) {
          // v2g: 두 갈래 다 고친 글이 없으면 payload 를 만들 일이 없다 — 갈래를 못 합친다고 거부하지 않고 원문 그대로 둔다(7BEFBA 「루트비히님/루트비히」 부류).
          const changedIn = (mm) => (mm.p.flat || []).some((s) => normalizeRendered(mm.p.parts[s.flat] || '') !== normalizeRendered(joinTexts(s.keys)));
          const fx = (changedIn(prev.m) || changedIn(m)) ? nonGradeFixed(prev, m, here) : { out: [], swap: false };
          if (!fx) { bad = `${CLASS_NAMES[m.p.g]}: 비등급 갈래가 같은 구간 ${H(m.sg.entry)} 에서 다른 글`; break; }
          if (fx.swap) { prev.m = m; prev.sig = sig; prev.here = here; }
          prev.fixed = fx.out.map((o, k) => {
            const old = (prev.fixed || [])[k] || { idx: [], changed: false };
            return { idx: [...new Set([...old.idx, ...o.idx])], changed: old.changed || o.changed };
          });
        }
        continue;
      }
      byG.set(m.p.g, { m, sig, here });
    }
    if (bad) { U.errors.push(bad); continue; }
    const grades = [...byG.keys()];
    const nSub = Math.max(...grades.map((g) => byG.get(g).here.length));
    const siTag = byG.get(grades[0]).m.si;
    for (let k = 0; k < nSub; k += 1) {
      const seqs = new Map(grades.map((g) => [g, (byG.get(g).here[k] || { keys: [] }).keys]));
      const want = new Map(grades.map((g) => { const h = byG.get(g).here[k]; return [g, h ? byG.get(g).m.p.parts[h.flat] : '']; }));
      const bound = (byG.get(grades[0]).here[k] || byG.get(grades[0]).here[0]).bound;
      let R = chooseSpanV2(seqs, grades, want, bound);
      if (R.skip) { if (R.keptArms) U.warnings.push(`${siTag ? `구간 ${siTag} ` : ''}하위 구간 ${k}: 글이 같아 옛 조각 팔 그대로 둠(${R.keptArms})`); continue; }
      if (R.error) { U.errors.push(`${siTag ? `구간 ${siTag} ` : ''}하위 구간 ${k}: ${R.error}`); continue; }
      const fixBadOf = (regions) => {
        let bad = null;
        for (const F of regions) for (const g of (F.grades || grades)) {
          const fx = (byG.get(g).fixed || [])[k];
          if (!fx || !fx.idx.length) continue;
          const lo = F.j, hi = seqs.get(g).length - F.m, bLo = Math.min(...fx.idx), bHi = Math.max(...fx.idx) + 1;
          if (lo < bHi && hi > bLo && !(fx.changed && lo >= bLo && hi <= bHi)) bad = `${CLASS_NAMES[g]}: 비등급 갈래(파티 인원 등)가 가르는 글과 payload 구간이 겹침`;
        }
        return bad;
      };
      const fixBad = fixBadOf(R.regions);
      // v2f: 겹치면 갈래(층)마다 따로 계획 — 층 L 은 주인공마다 L 번째 경로(없으면 마지막)를 쓴다. 갈래마다 진입이 다른 행(0B75 「나」 행 / 0B2B 「우리」 행)이라
      //   디스패처 키가 달라 한 주인공에게 두 payload 가 공존한다. 같은 source 에서 글·복귀가 다르면 뒤의 source 묶음 검사가 거부한다.
      let plans = [{ R, seqs, want, pathOf: (g) => byG.get(g) }];
      let layerErr = null;
      if (fixBad) {
        plans = [];
        const layers = Math.max(...grades.map((g) => (allByG.get(g) || []).length));
        for (let L = 0; L < layers && !layerErr; L += 1) {
          const pathOf = (g) => { const arr = allByG.get(g); return arr[Math.min(L, arr.length - 1)]; };
          const seqsL = new Map(grades.map((g) => [g, (pathOf(g).here[k] || { keys: [] }).keys]));
          const wantL = new Map(grades.map((g) => { const P = pathOf(g); const h = P.here[k]; return [g, h ? P.m.p.parts[h.flat] : '']; }));
          const RL = chooseSpanV2(seqsL, grades, wantL, bound);
          if (RL.skip) continue;
          if (RL.error) layerErr = RL.error;
          else plans.push({ R: RL, seqs: seqsL, want: wantL, pathOf });
        }
      }
      // v2i(2026-09-17): 갈래 층 계획이 **최상위 진입(호출 자리 키 없음)으로 갈래 글 덩어리를 덮는** 결함 — 그 진입 행은 다른 갈래도 지나므로
      //   다른 갈래(단수↔복수)도 이 층 글로 찍힌다. v28 설치본 8발화가 그랬다(U-7067C6 「타티아나는 내 동료다」 — 복수 파티도 「내 동료」, 0.44D80C·3A0EA0·446638·
      //   459888·72A039·734C18·7BE551). 주인공마다 대명사 행 주소가 달라 한 진입 계획이 공통 머리 행까지 거슬러 올라간 탓이다.
      //   이 모양이 나오면 **바뀐 키만 덮는 여러 곳 계획**으로 바꾸고(갈래 글을 안 바꾸면 갈래 덩어리를 비켜 간다), 그것도 갈래를 덮으면 거부한다.
      const layerCovers = (PL, F) => !F.rc.length && (F.grades || grades).some((g) => {
        const fx = (byG.get(g).fixed || [])[k];
        if (!fx || !fx.idx.length) return false;
        const lo = F.j, hi = PL.seqs.get(g).length - F.m, bLo = Math.min(...fx.idx), bHi = Math.max(...fx.idx) + 1;
        return lo < bHi && hi > bLo;
      });
      if (fixBad && (layerErr || plans.some((PL) => PL.R.regions.some((F) => layerCovers(PL, F))))) {
        const avoid = (g, x, y) => { const fx = (byG.get(g).fixed || [])[k]; if (!fx || !fx.idx.length) return false; const bLo = Math.min(...fx.idx), bHi = Math.max(...fx.idx) + 1; return x < bHi && y > bLo && !(fx.changed && x >= bLo && y <= bHi); };
        const R2 = chooseRegionsAny(seqs, grades, want, bound, avoid);
        if (!R2.error && !fixBadOf(R2.regions)) { plans = [{ R: R2, seqs, want, pathOf: (g) => byG.get(g) }]; layerErr = null; }
        else if (!layerErr) { U.errors.push(`${siTag ? `구간 ${siTag} ` : ''}하위 구간 ${k}: ${fixBad} · 갈래 층 계획이 최상위 진입으로 다른 갈래 글까지 덮고, 바뀐 키만 덮는 계획도 갈래와 겹침(${R2.error || 'fixBad'})`); continue; }
      }
      if (layerErr) { U.errors.push(`${siTag ? `구간 ${siTag} ` : ''}하위 구간 ${k}: ${fixBad} · 갈래별 계획 실패: ${layerErr}`); continue; }
      for (const PL of plans) {
      const seqs = PL.seqs, want = PL.want, pathOf = PL.pathOf;
      for (const F0 of PL.R.regions) {
        const gradesF = F0.grades || grades;
        const s0 = seqs.get(gradesF[0]);
        // v2i(2026-09-17): 한 행 안에 개행 op 가 있으면 발화 표가 같은 행 주소 키를 두 번 적는다(55B195 「그대로 못 본」·「척할 수는 」).
        //   둘째 키에서 진입을 잡으면 트리거는 행 머리(첫 키 자리)에서 떠 첫 줄이 사라진다 — 진입을 같은 주소 첫 키로 당긴다(두 줄을 payload 가 함께 가져감).
        let F = F0;
        if (!F0.texts && !F0.shift) {
          const sEntry = elemAddr(s0[F0.j][0]), fr = chainKey(s0[F0.j][2]);
          let j2 = F0.j;
          for (let x = F0.j - 1; x >= 0; x -= 1) { const e = s0[x]; if (e[0].startsWith('R:') && chainKey(e[2]) === fr && elemAddr(e[0]) === sEntry) j2 = x; }
          if (j2 !== F0.j && gradesF.every((g) => { const s = seqs.get(g); return s[j2] && s[j2][0] === s0[j2][0] && want.get(g).startsWith(joinTexts(s.slice(0, j2))); })) F = { ...F0, j: j2 };
        }
        const source = elemAddr(s0[F.j][0]) + (F.shift || 0);   // v2i: 1바이트 op 머리 행은 트리거 키가 +1
        // v2i(2026-09-17): 키 주소 순서 관문 — payload 는 진입에서 가로채 복귀로 돌아간다. 같은 틀에서
        //   · 진입 앞에 남긴 키가 [진입, 복귀) 안이면 그 글이 안 찍힌다(55B182 한 행 안 개행 → 같은 행 키 둘, 둘째 키 진입이라 첫 줄 「그대로 못 본」 이 사라짐)
        //   · payload 가 가져간 키가 [진입, 복귀) 밖이면 두 번 찍힌다(「대령을대령」「사라사라를」「율리안율리안」 — U: 이름 op 가 갈래 op 뒤)
        //   · 뒤에 남긴 키가 [진입, 복귀) 안이면 안 찍힌다.
        {
          const keyAddr = (kid) => (kid.startsWith('U:') ? parseInt(kid.slice(2), 16) : elemAddr(kid));
          let orderBad = null;
          for (const g of gradesF) {
            const s = seqs.get(g), n = s.length, frame = chainKey(s[F.j][2]);
            const lo = source - (F.shift || 0), hi = F.back;
            for (let x = 0; x < n && !orderBad; x += 1) {
              const [kid, , ch] = s[x];
              if (ch === UNMODELED || chainKey(ch) !== frame || isArenaNlKey(kid)) continue;
              const a = keyAddr(kid);
              if (a === null || Number.isNaN(a)) continue;
              // 진입 앞 키는 트리거 주소(source) 앞이면 된다 — +1 트리거 행의 머리 op(24·28, source−1)는 트리거보다 먼저 실행된다(70F2B0).
              if (x < F.j) { if (a >= source && a < hi) orderBad = `${CLASS_NAMES[g]} 진입 앞 키 ${kid} 가 진입 ${H(source)}~복귀 ${H(hi)} 안`; }
              else if (x < n - F.m) { if (a < lo || a >= hi) orderBad = `${CLASS_NAMES[g]} payload 키 ${kid} 가 진입 ${H(source)}~복귀 ${H(hi)} 밖`; }
              else if (a >= lo && a < hi) orderBad = `${CLASS_NAMES[g]} 복귀 뒤 키 ${kid} 가 진입 ${H(source)}~복귀 ${H(hi)} 안`;
            }
          }
          if (orderBad) { U.errors.push(`${siTag ? `구간 ${siTag} ` : ''}하위 구간 ${k}: 키 주소 순서 — ${orderBad}(payload 가 그 글을 지우거나 두 번 찍는다)`); continue; }
        }
        const texts = new Map(), oldTexts = new Map();
        for (const g of gradesF) {
          const s = seqs.get(g), w = want.get(g);
          let body, prefix;
          if (F.texts) { body = F.texts.get(g); prefix = F.prefixTexts.get(g); }
          else {
            prefix = joinTexts(s.slice(0, F.j));
            const suffix = F.m > 0 ? joinTexts(s.slice(s.length - F.m)) : '';
            body = w.slice(prefix.length, w.length - suffix.length);
          }
          texts.set(g, body);
          oldTexts.set(g, joinTexts(s.slice(F.j, s.length - F.m)));
          const h = pathOf(g).here[k];
          const before = tokenize((pathOf(g).m.p.v.lead || '') + pathOf(g).m.p.parts.slice(0, h ? h.flat : 0).join('') + prefix);
          const btoks = tokenize(body);
          for (let i = 0; i < btoks.length; i += 1) {
            const t = btoks[i];
            if (!t.startsWith('{J|')) continue;
            const pair = t.slice(3, -1);
            if (pair === '이') { if (!hasCopula) U.errors.push(`${CLASS_NAMES[g]}: {J|이} 인데 후보 배정에 서술격 사설 문자 없음`); }
            else if (!JOSA_PAIRS.includes(pair)) { U.errors.push(`${CLASS_NAMES[g]}: 미지원 조사 마커 ${t}`); continue; }
            const prev = i > 0 ? btoks[i - 1] : (before[before.length - 1] || '');
            if (!(prev.startsWith('{X|') || isHangul(prev))) U.errors.push(`${CLASS_NAMES[g]}: 조사 마커 ${t} 앞이 이름·한글이 아님(「${prev}」)`);
            if (prev.startsWith('{X|39')) U.warnings.push(`${CLASS_NAMES[g]}: 파티 이름 토큰 뒤 조사 — 빈 이름 가능성`);
          }
        }
        candidates.push({ uid: spec.uid, si: siTag, k, source, back: F.back, rc: F.rc, force: F.force, direct: !!F.direct, convert: !!F.convert, grades: new Set(gradesF), texts, oldTexts, seqs, F, events: rec.events || [], open: rec.open });
        U.spans.push({ subspan: k, ...(siTag ? { segment: siTag } : {}), source: H(source), back: H(F.back), grades: gradesF.slice().sort(), prefixElements: F.j, suffixElements: F.m,
          ...(F.rc.length ? { callers: F.rc.map(H).join('/') } : {}), ...(F.force ? { forceShadow: true } : {}), ...(F.direct ? { direct: true } : {}), ...(F.convert ? { directConvert: true } : {}) });
      }
      }
    }
  }
}

const bySource = new Map();
for (const c of candidates) {
  if (uttByUid.get(c.uid).errors.length) continue;
  const SK = `${c.source}|${chainKey(c.rc)}`;
  if (!bySource.has(SK)) bySource.set(SK, []);
  bySource.get(SK).push(c);
}
const needUsers = new Set();
for (const cands of bySource.values()) { const S = cands[0].source; for (const key of ['R:' + H(S), ...(pkeysBySource.get(S) || [])]) for (const user of index[key] || []) needUsers.add(splitUser(user)[0]); }
loadAll(needUsers);

const entries = [];
const failSource = (cands, msg) => { for (const c of cands) uttByUid.get(c.uid).errors.push(`진입 ${H(c.source)}${c.rc.length ? '@' + chainKey(c.rc) : ''}: ${msg}`); };
for (const cands of bySource.values()) {
  const S = cands[0].source, rc = cands[0].rc;
  const backs = new Set(cands.map((c) => c.back));
  // v2i(2026-09-17): 같은 진입에서 **주인공 무리마다 원문 복귀 자리가 다르면**(3A0F59 「고마워/살았어」 — 율리안 무리는 `24 2E` 개행·복귀,
  //   모니카는 조각 끝; 「살았」 뒤 어미는 무리마다 다른 `2E`) 팔마다 제 복귀로 돌아간다(payload 관용구는 팔마다 끝에 FF BACK 이 이미 있다).
  //   항목 back 은 가장 많은 주인공의 복귀(같으면 앞 주소), 나머지는 armBacks. 전엔 「후보마다 복귀가 다름」으로 거부했다.
  if (backs.size > 1 && !cands.every((c) => newKindsOnFor(c.uid))) { failSource(cands, `후보마다 복귀가 다름 ${[...backs].map(H).join('/')}`); continue; }
  const backOfG = new Map();
  let backClash = null;
  for (const c of cands) for (const g of c.grades) { if (backOfG.has(g) && backOfG.get(g) !== c.back) backClash = `${CLASS_NAMES[g]} 에게 복귀가 둘(${H(backOfG.get(g))}/${H(c.back)})`; backOfG.set(g, c.back); }
  if (backClash) { failSource(cands, backClash); continue; }
  const B = (() => { const n = new Map(); for (const b of backOfG.values()) n.set(b, (n.get(b) || 0) + 1); return [...n].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0][0]; })();
  const backFor = (g) => (backOfG.has(g) ? backOfG.get(g) : B);
  const arms = new Map();
  let bad = null;
  const setArm = (g, text, from) => {
    if (arms.has(g) && normalizeRendered(arms.get(g).text) !== normalizeRendered(text)) bad = `${CLASS_NAMES[g]} 에게 문장이 둘(${arms.get(g).from} / ${from}) — 모호한 겹침`;
    else if (!arms.has(g)) arms.set(g, { text, from });
  };
  for (const c of cands) for (const g of c.grades) setArm(g, c.texts.get(g), c.uid);
  const users = new Set(), propagatedAt = [];
  for (const key of ['R:' + H(S), ...(pkeysBySource.get(S) || [])]) for (const user of index[key] || []) users.add(user);
  for (const user of users) {
    if (bad) break;
    const [u2, gg] = splitUser(user);
    if (cands.some((c) => c.uid === u2 && c.grades.has(gg))) {
      // v2i: 같은 발화·같은 주인공의 **다른 갈래 경로**(파티 인원 단수/복수 등)도 이 진입을 지나는데 진입~복귀 사이 지금 글이 다르면,
      //   한 payload(주인공마다 팔 하나)가 두 갈래를 같은 글로 덮어 한 갈래 글이 틀린다(3BB687 「이번에야말로, 나의/우리의 차례」 — 단수 층 진입 3BB688 이
      //   복수 갈래도 지나 복수 파티에 「나의 차례」). 전엔 같은 발화면 검사 없이 넘어갔다.
      const rec2 = recOf(u2);   // 모든 발화(예전 통과 포함) — 설치본 8발화가 이 결함이었다
      const affected = rec2 ? userPathsAt(rec2, gg, S, rc) : [];
      if (affected.length > 1) {
        const seenTexts = new Set();
        for (const a of affected) { const run = currentRunTextV2([a], gg, S, backFor(gg), rc); seenTexts.add(run.error ? `?${run.error}` : normalizeRendered(run.text)); }
        if (seenTexts.size > 1) { bad = `${CLASS_NAMES[gg]}: 진입 ${H(S)} 를 지나는 같은 발화(${u2})의 갈래 경로 글이 ${seenTexts.size}가지라 한 payload 로 못 덮음(${[...seenTexts].join(' / ').slice(0, 120)})`; break; }
        // v2i(2026-09-17): 지금 글이 같아도 **갈래마다 작성 글 조각**이 이 팔과 같아야 한다 — 한 payload 가 두 갈래를 덮는다.
        //   3BB687 카타리나: 단수 「저|의 차례다」·복수 「우리|의 차례다」 에서 공통 행 팔이 「나의 차례네」 로 잡혀 복수 파티에 「우리나의 차례네!」(v29 실코어).
        const spec2 = specByUid.get(u2), own = arms.get(gg);
        if (own && spec2 && spec2.status !== 'migrated-unchanged') {
          // 경계가 닻으로 확정되는 경로만 비교한다 — 앞뒤 키가 바뀐 경로(다른 틀 호출 키 등)는 정렬 경계가 흔들려 거짓 차이가 난다
          //   (0.7BF143 은 v29 덤프 대조에서 두 갈래 모두 원본과 같았는데 경계 없는 비교가 대명사를 조각에 섞어 거부했다).
          for (const a of affected) {
            if (a.error) continue;
            const pc = authoredPieceAt(spec2, gg, a, backFor(gg), rc, true);
            if (pc.error) continue;
            if (normalizeRendered(pc.text) !== normalizeRendered(own.text)) { bad = `${CLASS_NAMES[gg]}: 진입 ${H(S)} 를 지나는 같은 발화(${u2}) 갈래 경로의 작성 글 조각이 팔과 다름(「${pc.text}」 ≠ 「${own.text}」) — 한 payload 로 두 갈래를 못 덮음`; break; }
          }
          if (bad) break;
        }
      }
      continue;
    }
    const rec2 = recOf(u2);
    if (!rec2) { bad = `진입을 지나는 ${u2} 가 전체 발화 표에 없음`; break; }
    const affected = userPathsAt(rec2, gg, S, rc);
    if (!affected.length) continue;
    const spec2 = specByUid.get(u2);
    // v2i(2026-09-17): 다른 발화 경로가 복귀 자리를 안 지나고 더 뒤 키로 이어지면(원문 등급 관문이 건너뜀) 그 주인공 팔은 그 키로 돌아간다.
    //   722E93 여성 발화 payload(722EA1→722EB3)를 지나는 남성 경로는 원문 `33 A9 03 · 4E 0C` 로 722EBF 로 가는데 전엔 722EB3 으로 돌려보내
    //   남성에게 여성 글 「어쩐지 가여워..」 가 떴다(v29 덤프). 이 진입이 가진 팔 복귀와 다르면 거부한다.
    const takeNext = (N) => {
      if (N === undefined || N === backFor(gg)) return true;
      if (cands.some((c) => c.grades.has(gg))) { bad = `${CLASS_NAMES[gg]}: ${u2} 경로가 복귀 ${H(backFor(gg))} 를 안 지나고 ${H(N)} 로 이어지는데 이 진입의 같은 주인공 팔 복귀와 다름`; return false; }
      backOfG.set(gg, N);
      return true;
    };
    if (spec2 && spec2.status !== 'migrated-unchanged') {
      const pieces = [], nexts = new Set();
      for (const a of affected) {
        if (a.error) { bad = `발화 원본이 있는 ${u2}(${CLASS_NAMES[gg]}) 경로 해독 실패: ${a.error}`; break; }
        const pc = authoredPieceAt(spec2, gg, a, backFor(gg), rc);
        if (pc.error) { bad = `발화 원본이 있는 ${u2}(${CLASS_NAMES[gg]}) 경로가 이 진입을 지나는데 그 문장을 이 구간에 대응시키지 못함(${pc.error})`; break; }
        pieces.push(pc.text); nexts.add(pc.next);
      }
      if (bad) break;
      if (new Set(pieces.map(normalizeRendered)).size > 1) { bad = `${u2}(${CLASS_NAMES[gg]}) 작성 형제 경로 글이 둘`; break; }
      if (nexts.size > 1) { bad = `${u2}(${CLASS_NAMES[gg]}) 작성 형제 경로가 이어지는 자리가 둘(${[...nexts].map(H).join('/')})`; break; }
      if (!takeNext([...nexts][0])) break;
      setArm(gg, pieces[0], u2 + '(작성 형제)');
      continue;
    }
    const run = currentRunTextV2(affected, gg, S, backFor(gg), rc);
    if (run.error) { bad = run.error + ` (${u2})`; break; }
    if (!takeNext(run.next)) break;
    const own = arms.get(gg);
    const oldOf = cands.map((c) => (c.grades.has(gg) ? c.oldTexts.get(gg) : undefined)).find((t) => t !== undefined);
    if (own && oldOf !== undefined && normalizeRendered(run.text) === normalizeRendered(oldOf)) {
      if (normalizeRendered(own.text) !== normalizeRendered(run.text)) propagatedAt.push({ user: u2, grade: gg, text: own.text, old: run.text });
      continue;
    }
    setArm(gg, run.text, u2 + '(현재 문안)');
  }
  if (bad) { failSource(cands, bad); continue; }
  const hand = ctxBySource.get(S) || [];
  const allowSup = new Set(cands.flatMap((c) => (specByUid.get(c.uid) || {}).supersedesContextual || []));
  const handSource = hand.filter((e) => !e.rc.length), handCtx = hand.filter((e) => e.rc.length);
  const blocking = handSource.filter((e) => !allowSup.has(e.id));
  if (blocking.length) { failSource(cands, `말투 팔 밖 문맥 치환(source 범위) ${blocking.map((e) => e.id).join(',')}`); continue; }
  const supersededCtx = handSource.filter((e) => allowSup.has(e.id)).map((e) => e.id);
  let oldAtKey = [];
  if (rc.length) {
    if (handCtx.some((e) => chainKey(e.rc) === chainKey(rc))) { failSource(cands, '같은 호출 자리 키의 손 문맥 치환이 이미 있음'); continue; }
    if ((stemBySource.get(S) || []).length) { failSource(cands, `옛 source 범위 말투 팔 선언 ${(stemBySource.get(S) || []).map((o) => o.id).join(',')} 과 호출 자리 키는 한 source 에 공존 못 함`); continue; }
    oldAtKey = armByKey.get(`${S}|${rc.map(H).join('/')}`) || [];
    const multi = oldAtKey.filter((o) => (o.callers || []).length !== 1);
    if (multi.length) {
      // v2i: 여러 호출 자리를 묶은 옛 선언은 **이 호출 자리만 떼어** 대체한다 — 옛 선언은 통째로 빠지고(supersedes) 나머지 호출 자리는 뒤에서
      //   `<id>~rest` 선언으로 그대로 다시 넣는다(0.44D80C 모니카 44D7F4 「저→나」, 같은 선언의 3A0EA9 자리는 「저」 그대로).
      if (!cands.every((c) => newKindsOnFor(c.uid))) { failSource(cands, `옛 호출 자리 선언 ${multi.map((o) => o.id).join(',')} 가 여러 호출 자리를 묶음 — 부분 대체 불가`); continue; }
      for (const o of multi) { if (!splitDecls.has(o.id)) splitDecls.set(o.id, o); }
    }
  } else {
    if (handCtx.length) { failSource(cands, `손 문맥 치환 호출 자리 항목 ${handCtx.map((e) => e.id).join(',')} 과 source 범위는 한 source 에 공존 못 함`); continue; }
    if (armSources.has(S)) { failSource(cands, '옛 호출 자리 말투 팔 선언이 있는 source 에 source 범위 항목은 공존 못 함'); continue; }
  }
  // v2i: 팔은 (글, 복귀) 로 묶는다 — 같은 글이라도 복귀가 다르면 다른 팔이다.
  const byText = new Map();
  const addArm = (text, back, g) => { const key = `${back}|${text}`; if (!byText.has(key)) byText.set(key, { text, back, gs: [] }); byText.get(key).gs.push(g); };
  for (const [g, a] of arms) addArm(a.text, backFor(g), g);
  const covered = new Set(arms.keys());
  const supers = [], carried = [];
  let refused = false;
  {
    for (const o of (rc.length ? oldAtKey : (stemBySource.get(S) || []))) {
      if (o.armSet) { refused = true; failSource(cands, `옛 선언 ${o.id} 가 armSet 사용 — 부분 대체 불가`); break; }
      const oldReach = o.reach ? parseRange(o.reach) : new Set([...Array(8).keys()]);
      const oBack = parseInt(o.back, 16);
      for (const g of oldReach) {
        if (covered.has(g)) continue;
        let text = null;
        for (const [spec2, t] of Object.entries(o.arms || {})) {
          const set = parseRange(spec2);
          if (set === null) { if (text === null) text = t; } else if (set.has(g)) text = t;
        }
        if (text === null) continue;
        // v2i: 옛 선언에서 그대로 옮기는 팔은 **옛 선언의 복귀**로 돌아가야 같은 글이다(옛 back ≠ 새 back 이면 사이 글이 겹치거나 빠진다).
        //   예전 통과 항목은 바이트를 안 바꾸고 기록만 남긴다.
        let gBack = B;
        if (Number.isInteger(oBack) && oBack !== B) {
          if (cands.every((c) => newKindsOnFor(c.uid))) gBack = oBack;
          else carriedBackMismatch.push({ source: H(S), from: o.id, grade: g, oldBack: H(oBack), back: H(B),
            reached: [...users].some((u) => splitUser(u)[1] === g) });   // 걷기 경로가 이 진입을 그 주인공으로 지나는가(아니면 닿지 않는 팔이라 화면 영향 없음)
        }
        addArm(text, gBack, g);
        if (gBack !== B) backOfG.set(g, gBack);
        covered.add(g);
        carried.push({ from: o.id, grade: g, ...(gBack !== B ? { back: H(gBack) } : {}) });
      }
      supers.push(o.id);
    }
  }
  if (refused) continue;
  // v2g: 팔 컴파일러(rs3_speech_arms_compiler_v1)는 back > source 를 요구한다 — payload 는 앞으로만 되돌린다.
  //   조각 안에서 끝나 복귀가 진입보다 앞 주소면 그 항목은 구울 수 없다(실기 CPU 검사에서 'bad source/back'). 조용히 내보내지 말고 거부한다.
  // v2h: 마지막 관문 — 복귀가 진입과 다른 조각 틀이면 절대 내보내지 않는다(위 진입 선택이 놓친 경로가 있어도 여기서 막는다).
  // v2i: 팔마다 복귀가 다르면 복귀마다 본다.
  {
    const allBacks = [...new Set([B, ...[...byText.values()].map((a) => a.back)])];
    const behind = allBacks.find((b) => !(b > S));
    if (behind !== undefined) { failSource(cands, `복귀 ${H(behind)} 가 진입 ${H(S)} 보다 앞 — 조각 안으로 되돌아가는 진입은 못 굽는다`); continue; }
    const otherFrame = allBacks.find((b) => !frameOk(S, b));
    if (otherFrame !== undefined) { failSource(cands, `복귀 ${H(otherFrame)} 가 진입 ${H(S)} 와 다른 조각 틀 — 엔진이 틀을 못 풀어 대사가 끊기거나 옆 조각으로 흐른다`); continue; }
  }
  const armObj = {}, armBacks = {};
  for (const a of byText.values()) { const spec = rangeString(a.gs); armObj[spec] = a.text; if (a.back !== B) armBacks[spec] = H(a.back); }
  const uids = [...new Set(cands.map((c) => c.uid))];
  const entry = {
    id: `U-${H(S)}${rc.length ? '@' + rc.map(H).join('_') : ''}`, kind: 'stem', source: H(S), back: H(B), reach: rangeString(covered), arms: armObj,
    ...(Object.keys(armBacks).length ? { armBacks } : {}),
    ...(rc.length ? { callers: [rc.map(H).join('/')] } : {}),
    note: `발화 원본 ${uids.join(',')} — utterance_compiler_v1c`,
    utterance: { uids, subspans: cands.map((c) => ({ uid: c.uid, subspan: c.k, ...(c.si ? { segment: c.si } : {}), grades: [...c.grades].sort() })),
      users: [...users].sort(), supersedes: supers, carried, propagated: propagatedAt,
      ...(supersededCtx.length ? { supersedesContextual: supersededCtx } : {}), ...(cands.some((c) => c.force) ? { forceShadow: true } : {}), ...(cands.some((c) => c.direct) ? { direct: true } : {}), ...(cands.some((c) => c.convert) ? { directConvert: true } : {}) },
  };
  try {
    const payload = compilePayload({ arms: armObj, back: B, assignment, reach: covered, armBacks: Object.keys(armBacks).length ? armBacks : null });
    for (const [g, a] of arms) {
      const got = normalizeRendered(renderForClass(payload, g, assignment));
      if (got !== normalizeRendered(a.text)) { refused = true; failSource(cands, `${CLASS_NAMES[g]} 되읽기 불일치 「${got}」 ≠ 「${a.text}」`); break; }
    }
    entry.utterance.payloadBytes = payload.length;
  } catch (err) {
    failSource(cands, `인코딩 실패: ${err.message || err}`);
    continue;
  }
  if (refused) continue;
  for (const c of cands) {
    const U = uttByUid.get(c.uid);
    for (const g of c.grades) {
      const s = c.seqs.get(g);
      for (const [key] of s.slice(c.F.j + 1, s.length - c.F.m)) {
        const a = elemAddr(key);
        if (a === null || isFragBank(a) || a <= S || a >= c.back) continue;
        for (const user of index[key] || []) if (!uids.includes(splitUser(user)[0])) U.midEntry.push({ key, user });
      }
    }
    // v2i: 중간 진입은 이 후보(주인공 무리)의 복귀까지 본다.
    const CB = c.back;
    const open = /^[0-9A-F]{6}$/i.test(String(c.open || '')) ? parseInt(c.open, 16) : null;
    if (open !== null && open <= S && !rc.length) {
      for (const [from, to, kind] of staticTargets(open, CB)) if (to > S && to < CB && !(from >= S && from < CB)) U.staticMidEntry.push({ scope: 'window', from: H(from), to: H(to), kind });
    } else {
      U.warnings.push(`창 열기 주소 미상(${c.open}) — 창 안 선형 해독 중간 진입 미측정`);
    }
    for (const [from, to, kind] of farJumpsInto(S, CB)) U.staticMidEntry.push({ scope: 'rom-pattern', from: H(from), to: H(to), kind });
  }
  entry.pendingUids = uids;
  entries.push(entry);
}
// 한 source 에 source 범위와 호출 자리 항목이 섞이면 디스패처 표가 모호하다(rs3_contextual_text_stream_v1 관문).
{
  const bySrc = new Map();
  for (const e of entries) { if (!bySrc.has(e.source)) bySrc.set(e.source, []); bySrc.get(e.source).push(e); }
  for (const [s, list] of bySrc) if (list.some((e) => !e.callers) && list.some((e) => e.callers)) for (const e of list) for (const u of e.pendingUids) uttByUid.get(u).errors.push(`진입 ${s}: source 범위와 호출 자리 항목이 한 source 에 섞임`);
}

// v2g(2026-09-16): 아레나 예산. 직접 FE 행의 payload 와 그림자 전환 행의 글은 **출발 뱅크마다 정해진 아레나 뱅크 하나**에만 들어간다
//   (캐리어 [FE lo hi] 가 뱅크를 안 싣고 스텁이 `$FF:E300,X` 로 출발 뱅크별 아레나 뱅크를 찾는다). 기준 빌드 patch.arenaRows 로 뱅크별
//   남은 자리를 재고 넘치면 여기서 거부한다 — 안 그러면 빌드가 「발화 payload 직접 행 … 아레나 초과」로 멈춘다(utterances_20260916_v17 실측).
//   작은 항목부터 채워 살릴 수 있는 발화를 최대로 남긴다.
{
  const arenaTop = new Map();
  for (const r of (patch.arenaRows || [])) {
    const src = Number(r[0]), at = Number(r[1]), n = Number(r[2] || 0), fb = src >>> 16;
    const cur = arenaTop.get(fb);
    if (!cur || at + n > cur.end) arenaTop.set(fb, { bank: at >>> 16, end: at + n });
  }
  const MARGIN = 192;                                // 기준 빌드와 이번 빌드의 원장 차이 여유
  const free = new Map();
  const freeOf = (fb) => {
    if (!free.has(fb)) { const a = arenaTop.get(fb); free.set(fb, a ? (((a.bank << 16) | 0xffc0) - a.end - MARGIN) : Number.MAX_SAFE_INTEGER); }
    return free.get(fb);
  };
  // v2i(2026-09-17): 직접 FE 행 payload 가 출발 뱅크 아레나에 안 들어가면 **넓은 배치(wide)** — 아레나엔 4바이트 발판 `FF lo hi bank` 만 두고
  //   payload 는 빌더가 여유 있는 아레나 구역(24비트)에 굽는다. 엔진의 FF(BACK) 캐리어는 오퍼랜드에 뱅크를 싣는 24비트 이동이라 새 코드가 필요 없다
  //   (C0:FF10 S_back · 워커 rs3_candidate_stream_v32 FF-back 도 같은 뜻). 뱅크 3B 아레나(0x77) 49B 부족으로 거부되던 5발화가 이 부류다.
  //   예전에 통과하던 항목(v2h 가 보던 진입 종류)을 먼저 같은 순서로 채워 그 배치가 안 바뀌게 하고, 새 진입 종류(제자리 전환·TSV/강제 개행 행)는 뒤에 채운다.
  const STUB = 4;
  const legacyKind = (e) => !e.utterance.directConvert && !TSV_FIXED_ROWS.has(parseInt(e.source, 16)) && !FORCED_NL_ROWS.has(parseInt(e.source, 16));
  const live = entries.filter((e) => (e.utterance.direct || e.utterance.forceShadow)
    && e.pendingUids.every((u) => !uttByUid.get(u).errors.length))
    .sort((a, b) => (Number(legacyKind(b)) - Number(legacyKind(a))) || ((a.utterance.payloadBytes || 0) - (b.utterance.payloadBytes || 0)));
  // 새로 여는 발화(예전 v2h 로 통과 못 한 것)의 직접 payload 는 **언제나 넓은 배치** — 출발 뱅크 아레나는 발판 4B 만 쓴다(뱅크 3B 아레나 0x77 은 v28 빌드에서
  //   약 285B 남음, 여기 추정은 v14a 기준 아레나 끝 + 여유 192B 라 보수적이다). 발판은 작아서 그 여유의 절반까지 쓴다.
  const STUB_MARGIN_USE = MARGIN / 2;
  for (const e of live) {
    const fb = parseInt(e.source, 16) >>> 16, need = (e.utterance.payloadBytes || 0) + 4;
    const newlyOpened = !NO_NEW_KINDS && !(legacyOkUids && e.pendingUids.every((u) => legacyOkUids.has(u)));
    if (!(e.utterance.direct && newlyOpened) && freeOf(fb) >= need) { free.set(fb, freeOf(fb) - need); continue; }
    if (e.utterance.direct && !NO_NEW_KINDS && freeOf(fb) + STUB_MARGIN_USE >= STUB) { free.set(fb, freeOf(fb) - STUB); e.utterance.wide = true; continue; }
    for (const u of e.pendingUids) uttByUid.get(u).errors.push(`진입 ${e.source}: 출발 뱅크 ${fb.toString(16).toUpperCase()} 아레나 남은 자리 ${freeOf(fb)}B 에 payload ${need}B(넓은 배치 발판 ${STUB}B)가 안 들어감`);
  }
}
const okEntries = [];
// v2i: 꼬리를 같은 발화 다른 경로 진입에 맡긴 경로 — 그 꼬리 첫 행에서 시작하는 이 발화 항목이 실제로 있어야 한다.
for (const [U, g, tailSrc, who] of tailByOther) {
  const has = entries.some((e) => e.pendingUids.includes(U.uid) && parseInt(e.source, 16) === tailSrc && parseRange(e.reach) && parseRange(e.reach).has(g));
  if (!has) U.errors.push(`${who}: 꼬리 행 ${H(tailSrc)} 를 고칠 같은 발화 진입이 안 생김 — 꼬리는 이 발화 payload 밖`);
}
for (const U of report.utterances) U.ok = U.errors.length === 0 && U.spans.length > 0;
for (const U of report.utterances) if (!U.errors.length && !U.spans.length) U.errors.push('주인공별로 갈리거나 고친 하위 구간이 없음 — 발화 payload 가 필요 없다');
for (const e of entries) {
  if (!e.pendingUids.every((u) => uttByUid.get(u).ok)) continue;
  delete e.pendingUids;
  okEntries.push(e);
  for (const u of e.utterance.uids) { const U = uttByUid.get(u); U.entries.push(e.id); U.supersedes.push(...e.utterance.supersedes); U.carried.push(...e.utterance.carried); (U.propagated ||= []).push(...(e.utterance.propagated || []).map((p) => ({ entry: e.id, user: p.user, grade: p.grade }))); }
}
for (const U of report.utterances) if (U.ok && !U.entries.length) { U.ok = false; U.errors.push('같은 진입을 쓰는 다른 발화가 거부되어 이 발화 항목도 뺌'); }
for (const [U, sibs] of realizedByChecks) {
  const bad = sibs.filter((u) => !(uttByUid.get(u) || {}).ok);
  if (bad.length) U.errors.unshift(`형제 발화 ${bad.join(',')} 가 통과하지 못해 이 발화 글이 실현되지 않음`);
}

const finalSupersedes = [...new Set(okEntries.flatMap((e) => e.utterance.supersedes))];
// v2i: 부분 대체한 여러 호출 자리 선언의 나머지 자리를 `<id>~rest` 로 되살린다(통과한 항목이 실제로 대체한 호출 자리만 뺀다).
const restEntries = [];
for (const [id, o] of splitDecls) {
  if (!finalSupersedes.includes(id)) continue;
  const replaced = new Set(okEntries.filter((e) => (e.utterance.supersedes || []).includes(id) && e.callers).flatMap((e) => e.callers));
  const norm = (c) => String(c).split('/').map((x) => H(parseInt(x, 16))).join('/');
  const rest = (o.callers || []).filter((c) => !replaced.has(norm(c)));
  if (rest.length) restEntries.push({ ...o, id: `${id}~rest`, callers: rest, note: `${o.note || ''} | v2i 부분 대체 — ${[...replaced].join(',')} 자리는 발화 payload 가 대신함`,
    utterance: { uids: [], restOf: id, supersedes: [], carried: [], propagated: [] } });
}
report.counts = {
  utterances: report.utterances.length, ok: report.utterances.filter((u) => u.ok).length,
  refused: report.utterances.filter((u) => !u.ok).length, entries: okEntries.length, supersedes: finalSupersedes.length,
  midEntryUtterances: report.utterances.filter((u) => u.ok && u.midEntry.length).length,
  staticMidEntryUtterances: report.utterances.filter((u) => u.ok && u.staticMidEntry.length).length,
  payloadBytes: okEntries.reduce((a, e) => a + (e.utterance.payloadBytes || 0), 0),
  propagatedPaths: okEntries.reduce((a, e) => a + (e.utterance.propagated || []).length, 0),
  contextEntries: okEntries.filter((e) => e.callers).length,
  forceShadowRows: okEntries.filter((e) => e.utterance.forceShadow).length,
  supersedesContextual: okEntries.reduce((a, e) => a + (e.utterance.supersedesContextual || []).length, 0),
  directPayloadRows: okEntries.filter((e) => e.utterance.direct).length,
  directConvertRows: okEntries.filter((e) => e.utterance.directConvert).length,
  wideDirectRows: okEntries.filter((e) => e.utterance.wide).length,
  armBackEntries: okEntries.filter((e) => e.armBacks).length,
  carriedBackMismatch: carriedBackMismatch.length,
  carriedBackMismatchReached: carriedBackMismatch.filter((m) => m.reached).length,
};
report.carriedBackMismatch = carriedBackMismatch;
if (propagatedSpecsOut) {
  const bySib = new Map(), unresolved = [];
  for (const e of okEntries) for (const p of e.utterance.propagated || []) {
    const rec2 = recOf(p.user);
    for (const v of ((rec2 && rec2.grades) || {})[CLASS_NAMES[p.grade]] || []) {
      const ko = v.ko || '', at = ko.indexOf(p.old);
      if (at < 0 || at !== ko.lastIndexOf(p.old)) { unresolved.push({ user: p.user, grade: p.grade, entry: e.id }); continue; }
      if (!bySib.has(p.user)) bySib.set(p.user, { uid: p.user, status: 'propagated', events: (rec2 && rec2.events) || [], why: 'v2 전파 ' + e.id, variants: [] });
      bySib.get(p.user).variants.push({ grades: String(p.grade), src: v.src, text: ko.slice(0, at) + p.text + ko.slice(at + p.old.length), review: 'propagated' });
    }
  }
  writeFileSync(propagatedSpecsOut, JSON.stringify({ schema: 'bokuno-utterance-specs-v1', note: 'utterance_compiler v2 전파 형제 발화(레이아웃 검사용 — 컴파일 입력 아님)', utterances: [...bySib.values()], unresolved }, null, 1));
}
const out = {
  schema: 'bokuno-utterance-payloads-v1', declarationSchema: 'bokuno-speech-arms-declaration-v1', generator: `utterance_compiler_${VERSION}`,
  build, tableSha256: report.tableSha256, specsSha256: report.specsSha256, supersedes: finalSupersedes,
  supersedesContextual: [...new Set(okEntries.flatMap((e) => e.utterance.supersedesContextual || []))],
  forceShadowRows: [...new Set(okEntries.filter((e) => e.utterance.forceShadow).map((e) => e.source))].sort(),
  directPayloadRows: [...new Set(okEntries.filter((e) => e.utterance.direct).map((e) => e.source))].sort(),
  // v2i: 빌더가 제자리 글 대신 FE 직접 워프로 구울 행(payload 가 대체하므로 행 글 아레나는 안 잡는다) · 넓은 배치 행.
  directConvertRows: [...new Set(okEntries.filter((e) => e.utterance.directConvert).map((e) => e.source))].sort(),
  wideDirectRows: [...new Set(okEntries.filter((e) => e.utterance.wide).map((e) => e.source))].sort(),
  entries: [...okEntries, ...restEntries],
};
mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 1));
if (describeOut) writeFileSync(describeOut, JSON.stringify(describe, null, 1));
if (!dry) writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(JSON.stringify(report.counts));
