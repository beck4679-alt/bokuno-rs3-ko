import { splitFlagDomain, constrainFlag, randomEventAlternatives, gateSuccessor, selectionCallAlternatives } from './rs3_static_conditions_v32.mjs';
// v32-static.2: candidate-byte control flow; no frame execution.
import { createCandidateStream } from './rs3_candidate_stream_v32.mjs';
import { nativePaddingDecision } from './rs3_native_padding_guard_v1.mjs';
// v30: ROM-buffer macros, explicit unknown glyphs, state-aware flag writes.
// See v30 report; no full-event or pixel completion claim.
// v29: --state-policy preserve-party keeps the supplied protagonist and party flags.
// Default class-probe preserves v28 behavior. Neither mode is a full emulator.
import { configureStatePolicy } from './rs3_state_policy_v1.mjs';
import { parseWalkerState } from './rs3_state_file_v30.mjs';
import { readFlagValue, flagDomain, testFlagDomain, mutateFlag } from './rs3_state_effects_v30.mjs';
import { createRuntimeTextModel, TEXT_COMMANDS, TEXT_4F } from './rs3_runtime_text_v30.mjs';
import { createShadowDispatch } from './rs3_shadow_dispatch_v30.mjs';
// v28 repair: native block ends/calls/tail transfers, isolated per-slot windows, exact text layout.
// See WALKER_V28_REPAIR_REPORT.md for evidence and remaining unmeasured behavior.
// 램 단 정적 워커 v1 — 상태 벡터(주인공 클래스)를 들고 이벤트 op 스트림을 걸어
// 주인공별 말풍선 문안을 예측한다.  "정적은 팔을 판정 못 한다"의 전제(상태 없음)를
// 제거하는 실험이다(사용자 발안 2026-09-03: "vm에 램을 달아").
//
//   상태 벡터(실기 하네스 scan_event_screen_ppu_v1 의 강제 상태와 동일):
//     · 클래스 0..7 (율리안0 토마스1 미카엘2 하리드3 사라4 엘렌5 카타리나6 모니카7)
//       = 변수169(a9) 값. 수정된 실기 fixture는 D519와 F4BE 하위니블을 강제한다.
//       1F7B는 공유PLA 스택이다(2026-09-14 cursor 하네스 오염 수리); 워커는 그 훅을 쓰지 않는다.
//     · v1 은 클래스와 주입 state/forced flag 를 읽는다.  값이 없는 게이트는 한쪽으로
//       단정하지 않고 unknown fork 로 남긴다.
//
//   게이트 규칙 — 실기 4계급 출력(0x0CD7 「거짓~」 클러스터)으로 역산·전부 재현 검증:
//     33 <var> <range> : var==169 → 클래스가 [상니블..하니블] 안이면 다음 op 계속,
//                        밖이면 **고정 2바이트 건너뜀**(v16: 7BA72A `33 a9 47 / しら？` 거짓 경로 7BA72F 착지 실측.
//                        옛 '다음 op 하나' 규칙은 `33 / 2e / 2e` 보호문·`33 / 글리프 / 2e` 팔 사슬에서 실패 갈래를 죽였다).
//     4e NN (실행 시)  : 커서 = op 끝 + NN.
//   (메모리 [[rs3-dialogue-name-arms-are-gated]]의 "$78 통과+1/실패+3"과 동치)
//
//   v28 (2026-09-07): block-end equality, normal/far call frames, per-slot window selection;
//     25/26/27 never fabricate line breaks; 3C0933 is NOT a next-page label.
//   v16~v19 (2026-09-06) — **롬 직독**: 계정서(rs3steam/bokuno_event_accounts_v1) 없이 tools/rs3_native_ops_v1.mjs 가 진입 표·op 길이·피연산자를
//     롬 바이트에서 낸다(WALK_ACCOUNTS=1 = 옛 계정 경로). visited 는 (pc | 경로 플래그 상태), 변수 쓰기(36/37/38/35·0D 02~05·49) 전부 반영,
//     피호출 이벤트(00~0C·04 NN)는 호출자 상태로 걷고 쓴 변수를 돌려준다. 관문 = 33/34/45/0D 00/0D 01/49 00·01 + 42·0D 07/09/0F/10/3C/3D·4F 0F/21/32/42/56·41 01…4C,
//     0D 3F 여성 분기, 0D 16 같은 뱅크 점프, 0D 19 는 40/41 로 쓴 EF00 포인터면 정적 해결, 30 은 end/+2/+4 근사, `00 00` 채움은 종료.
//     계정 없는 구역은 이벤트 목록의 `raw_XXXXXX` 씨앗(tools/find_static_entry_seeds_v1.py, 포인터 역탐색)으로 걷고 status 'seed' 로 낸다.
//     피복(구운 행 중 덤프에 닿은 행)은 tools/check_static_dump_coverage_v1.py — 메모리 [[rs3-rom-native-walker]].
//
//   재는 것: 이벤트·클래스별 말풍선 문안. KO 원장이 아니라 현재 후보의 구운
//     텍스트 바이트를 해독하므로 미피복/괴문자도 그대로 드러난다.
//     --score <balloons.jsonl> 을 주면 실기 8주인공 덤프와 재현율을 채점한다.
//   제한: unknown fork 는 정적 근사이고, 저대역/이벤트 호출은 bounded depth 로 걷는다.
//     layout/page/window 는 static_window_flow_index_v1 또는 source op 근거가 있을 때만
//     confirmed 이며, 나머지는 approximate/unknown 으로 남긴다.
//
//   사용: node tools/static_state_walker_v1.mjs --events 0x0CD7[,..] [--score PATH] [--out PATH]
import path from 'path';
import { BalloonJournal, buildBalloonGraph, executionStateKey } from './rs3_balloon_graph_v32r3.mjs';
import {createEventStepBudget} from './rs3_walk_step_budget_v1.mjs';
const EVENT_STEP_BUDGET=process.env.WALK_EVENT_STEP_BUDGET==='1';
const BALLOON_GRAPH = process.env.WALK_BALLOON_GRAPH === '1';
const DISTINCT_STATES = process.env.WALK_DISTINCT_STATES === '1';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync, openSync, writeSync, closeSync, renameSync } from 'fs';
import { fileURLToPath } from 'url';
import { assertPackedReadHelper, packedNibble } from './rs3_packed_flags_v1.mjs';
import { createNativeOps } from './rs3_native_ops_v30.mjs';
import { layoutBalloon } from './rs3_balloon_layout_v2.mjs';
import { auditAutowrapResidues } from './autowrap_residue_audit_v2.mjs';
import { makeGeometryResolver } from './rs3_measured_geometry_v2.mjs';
import { nativeWindowOverlap } from './rs3_window_overlap_v1.mjs';
import { createIndirectState, cloneIndirectState, indirectStateKey, activeActorRecordIndices, applyIndirectCommand } from './rs3_indirect_calls_v33.mjs';
import {advanceChoiceCount,choiceContractAtSelection,proveEv0153ChoiceContract} from './rs3_native_choice_rules_v1.mjs';
import {inspectSmallWindowPresetContract} from './rs3_window_preset_geometry_v1.mjs';
// v32-static.4 (2026-09-15): 조사 마커 슬롯(0x410..0x414, rs3_josa_hook_v1)은 글리프가 아니라 런타임 선택 표지 —
//   실기 훅(FF:ED00)과 같은 규칙으로 직전에 그린 글자의 받침으로 은/는·이/가·을/를·과/와·아/야를 고른다.
import { JOSA_PAIRS, josaIdxOfSlot, hasBatchim } from './rs3_josa_hook_v1.mjs';
// v32-static.5 초안(2026-09-15 라운드 5): 서술격 마커 슬롯 0x415(rs3_copula_hook_v1 zero 변형) — 직전에 그린 글자에 받침이 있으면 「이」 를 내고
//   LAST 를 「이」 로, 없으면 아무것도 내지 않고(폭 0, 글리프 트레이스 토큰도 없음) LAST 를 그대로 둔다. 실코어 대조: out/round5_staging/copula_hook/.
import { COPULA_SLOT, walkerCopula } from './rs3_copula_hook_v1.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');
const ROOT = path.resolve(PROJECT, '..');
const ACCOUNT_DIR = path.join(ROOT, 'rs3steam', 'bokuno_event_accounts_v1');
let rom; // Candidate-only mode: no original ROM is read.
// v27 (2026-09-07): 0B 사전 조건 재배선(runtime/0b_dictionary_control_rewrites_v1.json)을 원본 롬 사본에 적용한다.
//   빌더는 후보 롬의 호출 op(`0b xx` → `0b 00`/`0b 06`, 관문 범위 `33 a9 XX` 등)를 이 등록부로 다시 쓰는데, 워커가 제어 흐름을
//   원본 롬에서 읽으면 무음된 조각이 옛 조립 그대로 덤프에 나타나 이미 수리된 자리가 결함으로 보인다(2026-09-07 설계 워크플로 실측:
//   4514E5·457C61·3C9087·3C5565·44343B 등 유령). 원본 바이트가 등록부의 expected 와 다르면 그 항목은 건너뛰고 경고한다.
//   WALK_NO_REWRITES=1 이면 옛 동작(원본 그대로).
// 매크로 사전 — 이름 매크로(4A/3B/3A)가 그리는 한국어. 현행 빌드의 배정표에서.
const argEarly = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
// --build <BuildId>: 워커가 읽는 구운 롬·배정표. 기본은 인증 후보 segd805final_20260903_05.
const BUILD_DIR = path.join(PROJECT, 'out', 'full_build_candidates', argEarly('--build', 'segd805final_20260903_05'));
const patchBytes=readFileSync(path.join(BUILD_DIR,'halfcell_all_patch_v1.json'));
// 지원 패치 SHA(배정표 형식 핀): … z65 405992…, z66 bf6bd2…, z67 c078f0… (2026-09-08 배치 결함 일괄 수리 후보)
const _P=['debaf6061bb96145594089cce60c532672e968ead026213fff1e28f3e66df88d','aa3debf9ec8779ada3d34ecafa91f212b7351ac495bec6835a14f6c8046c655e','3d510b3d6a0af00a8686531479e9e891b9830858c77efcdb21419f847aaf1e0d','1a8eb03c6bb773180fc789f9fab4cc6aea8f7e64e37165eca8d3fd9963abc3df','66f101a3320ae1e719688e6b5b37fc140f7ade036d70dd90042d71136cb8a4c0','6af683682f1baa87d1dfd0bb37b34fa1a4067689a62400eba19e358861864f26','33668bf3672b720fe634a7048edfbd3db086dbc8e36521eb3420fbfb9ff0a48c','e583ecf4587bf38c8e3061f28c0e34f62d3097d65c5d56eae88df21ca64e4e3c','86719ab2a2dcea00780b66fded5af09e8036e6243747b8c7cf89761eac21528f','405992e923e55798685fd5c52d0b33193607daf6a41c2ae09a2641f82f668f53','bf6bd2deae159c2c89805a06172233bbace13db73b672fed798c3d7bff5ec8b4','c078f0a2b2247fc6ca118e1b9556a94b2f6916a53a42768f20eabb11ed415f2e','9bb6821cf0fb89c9ae5fd5e3fc113498957de672bc79203ac08efafedb86201b','23610c850036d343b84e61872f676f31f1980e1b6a8eba43703eb3379690436f','64359375a8ac8f009fc2a5d27a8ea9591b933623e6d53cf67d345b243850f846','e30e032398dc5b654aff1e68731758e5e76e65c0371fdb3abc78c6586bf18532','d32dbec34176ae7b392bb5033e89bb119dcb221c07f16be045b3ada2d2a53853','b9d2a2a8d6c2a46077e0b75d6e1c5c11f741398520365f7fe7a0d38c82a55512','bbd9994f703f83da749255d5d6e4e65aa06dca6e0734dde3be1c1bbaa66cf52b','c7ba28005e1f94a37ddb4dc5bb3a1153515b6ee5dbc7a60f1ec37fe45ce28855','888e87c4337b6526518fe60f7092dd5b0da2a30bf1ac0f889dce889384b00ce2','6ad52fb9c769223bc86e2b8005b958171d76bf9c7e348d3f0428d6f3ce4311d6','698dec0b27d6903699e47ab6032f9c79b77b34d666abee4a6d37164c203d52f7','10da6b7e22559ebf5956f4cea7edfb6a442f027e132e5d91d27709355f329d02','f08d4b2d40a2b6e8f38c060ae5b5688a1f4268e8fa91f0b49c4d64eeaede328a','3206e1cdb7d245918721f1b0ce32d3d8f75563528a288a3d0aa6042464838fd4','be0b28afc0570940cb5a0ea5603b9fef2ab23e16a19cc91947b4243c7266781c','8a42a2d735ffe0f001532e0029c0d0be31ebfcc771f28a1dfb05418f13a01aaa','5264992c45f9fdcc9126f655d2bd8aa9e25b49577013848ff816bd4ec5b41922','3f9d2a14a74bd1923147ce58a684094fff531eb2b43fc9c0fda912b022fcc759','a3f139d906a5f9529427bc196af3dc7da6c8e4b0c5f8a1be912d0f4aade3d9ba','ceb335a3bc37d6b6e5f5847c1d2681d076e20b1a466637c4c7f2d0f58d616e40','dea2ab3ce70e2e80bf85302f9130ec3dcc9ac25e8bc4aac12a7404fdf4458e2f'];
_P.push('0faa2256d2d8c27aebc92e0f6d0bfd20b133615c1205c1d9beeb38a05032e7ee'); // residue_v2 exact text/padding/ROM proof
_P.push('a43a9178875ef88bc81c33956a15263ba4a29042683238944770b1472c138926'); // residue_v4 conditional-leading-space helper + exact text proof
_P.push('04b2fadce072925f3e7073211e81919ce659f8aea59df6eadcf37d9ea790d238'); // residue_v6: 155 exact intended source edits, helper proof
_P.push('3c09ef0b838ff44a2e4bc5387d714299ac72a1ec82be825eafa7228bf03973e6'); // residue_v7: withdraw 3A102B layout experiment, 154 source proof
_P.push('d93836d5c6cd97bb551db71af06150b4ee736b7bea626184063108453a37ec11'); // residue_v10: 176 exact source changes, blank sentinel removal and preserved native boundaries
_P.push('4b561ba3ce6f072ad95ee5ec64ebdc2a1d8032cae9f98ecb64bce33457eca269'); // residue_v12: exact source/BACK and installed padding proof passed
_P.push('1f119cab2b5ace2157e63f81926b45a1714b3f6990b18f7b42ab2e0f7eae75bf'); // residue_v13: 213-source and seven-row helper byte proof
_P.push('b58604ab31ecceddea88aa40fe735ce58b4a68b25cdf93c50090a06c0f625cb5'); // residue_v14: exact 217-source and native byte proof
_P.push('0c9ecde9405c950d092196464c1f0ebb2f9b1465119fcc29c2371ec3b498b9e9'); // residue_v15: exact source/BACK/layout byte proof
_P.push('c7d8ec769c8628fcf527cec8b5f271a76a5d3198cc593ab96dec550292c45122'); // residue_v16: exact two menu-source byte changes
_P.push('d4c8a65e7b9f16052be6ccb276e0fe106c9f4ebd69c439e8b56dabad6fab88a0'); // residue_v17: exact 46 reviewed speech-owner changes
_P.push('28bf96e431114245a89626925c30d0fba054d1e18cc75616e4e53168747f331d'); // residue_v18: 44 reviewed changes, two unsafe terminal blanks reverted
_P.push('2e5d2b7c0e47e86dc52626551a267da0f41139f68b111ec67a4f1bfd45bcaae1'); // contextual_v1: exact overlay/CPU proof, ROM table interpreted with native saved frames
_P.push('d6a91577e27cfa9a36edf86c9d0726e1929633ffb6b063c845788b5a04d42bd5'); // contextual_v2: 46 reviewed caller/arm entries, 1138-byte exact overlay and CPU proof
_P.push('a9892c782a3c307f159b336663153949b76e02db1e73bd9b88cb16ae2926c37a'); // remaining_grammar_v1: 89 variants, exact ROM proof and installed CPU verification
_P.push('e73a7995b1d6d8d6ee5667e8e231efbc45b773f11c0566ff72beb2a575263bfd'); // full_audit_literals_v1: 101 variants; 2,303-byte independent proof and installed CPU passed
_P.push('e4a51cf8995d494a948cd0851098942be8aa9c1b6e3cc40d9190ebc48fecb7dd'); // prefix_separator_v3: 101+36+019E, independent whole-ROM/table/helper proof
_P.push('c2885609dc5bb438fac6d7d120f68d09cc3a89d875e7bad8db4a10c284d5eda0'); // contextual_v4: prefix-v3 parent binding + six source-global literal routes
_P.push('69b147d44e957924a1502a9a71b91ec27e611d2be625d5070d6e8f1c8fec6adf'); // contextual_v4r2: exact 157-entry child + one authenticated appended FD64 marker
_P.push('31b5bdcf452d508f57b142c42923e6a936c8f6d8c34d2676063703c0237199fe'); // exact spacing helper chain; parent metadata reconstructed by stream verifier
_P.push('66a8289d2099e24128088a17db23f404a96a6188fc22072f85aa948357f819f2'); // v4r3 exact 159-entry + inline literal proof
_P.push('e92b8affcf592f93bae6a6d97ca8037b190ac9fffdb0861c18f341e29a780844'); // spacing final v2 strict-fit chain; exact parent reconstruction
_P.push('3eebb7e8e992bb40abcaee246e0be8b4aaf29c03870ea45f25ded01223261558'); // v4r4 byte-proven 163-entry parent
_P.push('bd81a6ca6e9285ef0c64544e99747c049d6e6a7df14ef26ffd42e1fb12c711fc'); // spacing final v3 exact five-head chain and parent reconstruction
_P.push('fad92ef9afe288fc5f80e169d153a883dba9449752ba213f5931e77fbd5fbe0a'); // v4r5 exact 166-entry and terminal removals
_P.push('181e5b189822517bf94190ab49e8aa8ee873060d30519277858a3607bfd08163'); // spacing final v4 exact 36-row strict-soft chain
_P.push('ca02646f292b94e5e06e5b80094849ace1b8c6270f49bd749951fd94e562283c'); // v5 exact four comma-policy rollbacks + remaining three heads
_P.push('f2446637cfc07830858b9edcdc606448c21a0b0e8c95df908a6a9603c555525c'); // text_integrity_v1 exact v5 unwrap/typed native proof + 226 installed CPU entries
_P.push('3d7fa7c347b209265b363247442e842524f92de44212dc5a92da55f91fd6dff2'); // text_integrity_v2 existing226 exact + Kane final selector, installed CPU227
_P.push('d44a64bad002c4f953b0ad6e2c7caf7243974267e69a67e4feccf2cbe36e155d'); // battle_popup_v1 independent ROM/patch replay, inherited dialogue providers preserved
_P.push('67a3497bc24a429164865b73e1cf13325020a6d14858d4a6cf3e47c71dd78e38'); // absolute repair v3, strict reversible derivative validation
_P.push('32dce6dbdda520219bfee937ec9877e232525d137189aea9b99a663ea7c3452f'); // final reviewed plan v4, ROM identical to measured v3
_P.push('3964a6e927c516c7b7f5a1274cf69319c3c662a03926644a121875ff89af50ca'); // v5 fixes separator inside Godwin/title macro sequence
_P.push('ca393205979e770c6a7ca07b440d8b53c5098078ff9775c6d7e70f21da45ffcf'); // remaining-dialogue v1 exact receipt
_P.push('43f41b7184978440ad3e89ab3b245b20c70eb9b9efc5222970db3633585450fa'); // remaining-dialogue v5 exact parent BACK
_P.push('b0a5ced43d2a79d91752f2530ce1015e452f9bee257bac929ea4d148698ecd57'); // v6 shared branch boundary space
_P.push('edd4de00714b05380bddba7f09aac8de1b572e77bfe3608f1a3282bc24780f97'); // v7_exact native punctuation glyphs
_P.push('081c09f71cb0b9a1542a30b0517b776e4fc088bcb2ae3f46d419962e8f61ef46'); // exact 3BB4EF literal reconstruction
_P.push('dbc75c1401d4471b4788636beca6f71edafb42b65fe8eff9fc2d47452ffdf978'); // exact two-arena 442E grammar derivative
_P.push('0ada88e6355193d8b05e98c163bf58571ffc7cee4ad07fb08925b57a1983a44f'); // eight exact word separators, frozen parent reconstruction
_P.push('1c01dee9be794e1c58ff09b5bb252354a201921f6ffd1e5ffa92e9bb58e6f6fe'); // v2: branch-specific 하나 prefix preserves other class ellipsis
_P.push('6d2d94ebe0ec38a3df585e4757de119f0ba25965b69a2b391e9f0efec614cc7b'); // exact name-independent vocative/letter grammar
_P.push('61258ab18a0861b88887743c157c41337cea501068d37c7ed8cb312473234478'); // exact 4535A3 source-only head, frozen parent reconstruction
_P.push('50c0b3e34960746fd07ddcb9126b880158ce427c7fa69eeaae164fc5f52806e2'); // native boundary arena v5 exact reconstruction
_P.push('315dd4af5d15781c3b978ff5115b1eb4fe33651e683c7197547633f9f195d3fb'); // shared sentence child exact reconstruction; static-only candidate
_P.push('a4fcbf1540df5a63b2bf3085b43e95425e9537a30afa2b7f98f2daddd6c9a6ae'); // exact warehouse/empty-line-flush reconstruction; dialogue bytes preserved
_P.push('0c919ab09328d1a8f41b04d71354fb4b2a6acc43ba5ec9d3026ed8548da7f37a'); // wording batch02 v2: three atomic arena writes, strict parent reconstruction
_P.push('1541aea9e0ffbaad500143a0ad48fa3607a8ca5d6cf4cab6410096c2406cfe22'); // batch03 connected repairs; strict existing-pool reconstruction
_P.push('a52001a2ab22822952be8b8a6dc9b126863c96bc81a9ad5b0299c06a7ba251be'); // normal item reflow v2 receipt; only two separators changed
_P.push('e1770315810fdf612ec45580e2a842e7e6596053512541591a981e2904717162'); // native description exhaustion guard exact reconstruction
_P.push('f4572606fbe7eb8037f22a34ad206ab15e73f15f711e74eec1c91206b4915b43'); // exact soul-thanks ellipsis/C6-list derivative
_P.push('37faa053bc984c3f7b6ba457193373725421e12fe29916cb955b9b1a352555b1'); // exact negative reply two-source derivative
_P.push('5485a82562cd8e0c72fa3a9f6683b021c0deb3ee2d52e84e4120a5d5c1415091'); // local batch08 exact word-boundary and ending derivative
_P.push('1a575264b1bb1124852b2db5625bbfb59b1b96d2fffb1a490dcc9cb4fd271117'); // exact 45358E subject/modifier restoration and pointer relocation
_P.push('f5275ffc9afcfde1116f8788c7b8058a92179c395938aaa5c034e5864ecc3bc1'); // exact 4425BA guardian subject and pointer relocation
_P.push('b514842bee2f0c51e21d62c975c565fa702b804dcbe25ea9e64a16cc921d2cee'); // local batch08 nine-source exact reversible proof
_P.push('9f5db14a63109b6e7c264be2a927b6c943c1d26762d853bd3e408e750212b6c8'); // exact nativeC3 records6/58/59 literal and space repair
_P.push('e38aa89fe5270f280815d4b3b7a70f75ac344850eae15fd85bb34dada70330b7'); // exact nativeC3 record235 strength glyph cells
_P.push('42b5d51eb529f33dd393138a1d1343464022d6733c2fede45ed2405c918605fd'); // exact sixteen reported-danger baseline derivatives
_P.push('3122221eafb46ed072e47cc2a5cf5062ad4b36c88cbfe79a7e91540c726729b3'); // exact unknown-person one-return-context derivative
_P.push('b09f555a870bdd2491c40fc9897fd8eae2ca1bee0fde5ed09b1198b43e916f97'); // completion followup v2, four reviewed payloads
_P.push('400d97e81637486f1d9a983a20481794a070c0f969af7208af61548985a33aa5'); // battle padding halfstride v2; exact frozen reconstruction
_P.push('55acb3df14b0ab028a47eefe33acd86489f011ee919c1cbb4e401a593e038a58'); // fixed battle 8px stride; exact frozen parent reconstruction
_P.push('a28093d5300444f0b560f059a9b21dd9a93724503b14f8d05595c951b6969603'); // completion followup v1; five source-only reviewed text repairs
_P.push('034b947a5d3f80138a22560218b8d042d37d952dac78fe404f9c6c966c73cd38'); // ROM-stage diagnostic qc_romdiag_20260914_v2: formal C2 generators, NO end16 guard — regression baseline only, not a candidate (2026-09-15)
_P.push('d33a541c9b8271e9a25a231c93fdc7431ee8df3d88658aa78e887aec60aa64fc'); // ROM-stage diagnostic qc_romdiag_20260915_v3: formal C2 generators + native end16 guard — regression only, not a candidate (2026-09-15)
_P.push('f2e18796edee3de68666a515f70447724ebcdd67b3ba4aa81fe72ea9d0cf4fbe'); // ROM-stage diagnostic qc_romdiag_20260915_speech_v1: speech-arms declaration 168 entries (formal inputs, 260 contextual) -- regression only, not a candidate (2026-09-15)
_P.push('009d90b3338c6774c85446cfdfa2b8018958fa4f122ee9df1a70561d1d6fb4f8'); // ROM-stage diagnostic qc_romdiag_20260915_speech_v2: speech-arms 177 entries incl. depth-2 0B2B pronoun keys + 0BE7 space payloads -- regression only, not a candidate (2026-09-15)
_P.push('89cbcfcf08cb5330650ba00b7a932b61dcbfcaf71e502e4c3cc88392b85ce808'); // ROM-stage diagnostic qc_romdiag_20260915_speech_v3b: speech-arms 187 entries (+0BC1 monika yeyo sweep) -- regression only, not a candidate (2026-09-15)
_P.push('437095784e0f2a3ab6f99aa0792b866404ef143167d1c46c21b345fde99a13f5'); // ROM-stage diagnostic qc_romdiag_20260915_speech_v4: speech-arms 187 entries + 0x0E40 stem -- regression only, not a candidate (2026-09-15)
_P.push('e56e78232833eb8d9a29bf00a2c2d8f2050d229ecb4061e50977ec1beb3a995b'); // speech_arms_20260915_v2: integrated safe full build (7 gates, 31 seeds) with speech-arms formal inputs -- candidate, not promoted (2026-09-15)
_P.push('8a49f0aeb27aceda0d5f6d3ffcf24e7c37740932638bcf8159b6bc88fd901bc3'); // ROM-stage diagnostic qc_romdiag_20260915_speech_v5: + contextual payload carrier regions (real-core FF BACK fix) -- regression only, not a candidate (2026-09-15)
_P.push('d3ea5c808410c686362b65e2b8300913e5c5eef5a2539cfeefe864f11ffd9168'); // ROM-stage diagnostic qc_romdiag_20260915_speech_v6: + 순조로워/카타리나 나·내 arms, jp punctuation residue rows (264 fresh + TSV 9 + rehead 459769) -- regression only, not a candidate (2026-09-15)
_P.push('5b04434f5ea676d5dd0861db3d6560aeaeb85fbcaf4104079922bdfb06b397e0'); // ROM-stage diagnostic qc_romdiag_20260915_speech_v7: v6 + dangling-stem terminal payloads (8 stem + 3BF447 unmute), doubled punctuation strips, 오셨군요~ -- regression only, not a candidate (2026-09-15)
_P.push('30fc4d30d8c1830980579db3d8666678e8e2047eb4d563f731107e64629b6840'); // ROM-stage diagnostic qc_romdiag_20260915_speech_v8: v7 + 0x09D2 「바다의 주인인가?/이야?/인가요?」(원문 직역, 사용자 지시) -- regression only, not a candidate (2026-09-15)
_P.push('fdd5b9dfc28a9ea822c65da738305bf9dc1025b4bd91daaf9000c7e76e60ee32'); // _FAILED_speech_arms_20260915_v3_post0704: safe build stopped at post0704 fixture (4434B6 target kept translator '?'); ROM byte-identical to speech_arms_20260915_v4 -- regression dumps reused, not a candidate (2026-09-15)
_P.push('0eabf8120477c20577b85d1797b5beb640c027ed2bd65365d42698fb3ad26712'); // _FAILED_speech_arms_20260915_v4_post0704: safe build stopped at post0704 fixture (candidates[] 4434B6 still expected translator '?'); ROM byte-identical to speech_arms_20260915_v5 -- not a candidate (2026-09-15)
_P.push('f942345e0caa75ff82691d6e6d2f5514319f11ec7e82209a2f60aefeefc1946b'); // speech_arms_20260915_v5: integrated safe full build -- superseded by speech_arms_20260915_v6 (user wording 0x09D2 sea-master literal), not a candidate (2026-09-15)
_P.push('916e579dd08d2f27f8c11b76c2a9bcd344fcb7ae02e90fe5abeeb3f3f98ae5c2'); // speech_arms_20260915_v6: integrated safe full build (7 gates, 31 seeds) -- v5 + 0x09D2 「바다의 주인인가/이야/인가요?」(원문 직역, 사용자 지시) -- candidate, not promoted (2026-09-15)
_P.push('95e5bb7d00246ae095638bd7c8a8a048eeb0f3ac75b3d309d1ad36d3564479f4'); // ROM-stage diagnostic qc_romdiag_20260915_round1_v16: v6 + round1(dangling-stem static sweep 38 stems, register restore, name-particle stems, S3/S4 junction fixes, missing-space TSV 100, fresh residue rows 16, reheads 4CDE14/7BDF0B, respan 736282) -- regression only, not a candidate (2026-09-15)
_P.push('751fd64a0b82f31b68c75cde93a4558b6a605449a0b32397f9b91e6f230c5dc1'); // speech_arms_20260915_v9: v8 + 3C289D three lines (hard 0x24, in-place single context; user 'source is three lines') -- candidate, not promoted (2026-09-15)
_P.push('13c3e1e81442ea7449d0718852469a6247e6e3b0bf7b5ae451b905d63c55a1f5'); // speech_arms_20260915_v10: round5 (REPORT 288·용어 76·선택지·강제 스크롤·띄어쓰기·말투·꼬리 풍선 「!」 코드 패치 4) — candidate, not promoted (2026-09-15)
_P.push('2026f1d5a784e4c763baeb7bd93a70fabb57d598930acdfdf6ded8fc18dae079'); // speech_arms_20260915_v11: round5k 이음새 문법·행 끝 하드 개행 — candidate, not promoted (2026-09-15)
_P.push('b8aa29a1aa4fc6f428560b284096574fbc6311656a0f58bc046b56b7f8034c12'); // speech_arms_20260915_v12: round5l·m 보류 문안·선택지 경계 강제 개행 — candidate, not promoted (2026-09-15)
_P.push('cb2fd2163e22e4fd83a13625293874c234d626f3e53b418ee8343e1945d1efc9'); // speech_arms_20260915_v8: round4 safe full build candidate (particle hook v4, builder marker-row fix, orphan-punct paddings, 0B89 stems, 4B false-positive reverts) -- candidate, not promoted (2026-09-15)
_P.push('e327d7445a723e88c5161ccdcc57a95984ae16e6bf62dcef5d4e3fdac11c8f8d'); // ROM-stage diagnostic qc_romdiag_20260915_round4_v24: v23 + 21 markers after the 4B window op reverted (false positives) + 0x0845 one-line wording -- regression only, not a candidate (2026-09-15)
_P.push('e2787ff5137e2de23ce8f0274a65cf685aa2f661cbc90bf4157bd1ef138e3d5c'); // ROM-stage diagnostic qc_romdiag_20260915_round4_v23: v22 + particle hook v4 (PLX before AND: batchim bit drives the branch; v3 always picked by marker index) -- regression only, not a candidate (2026-09-15)
_P.push('9a6d076bdf47a45944ef57fe218a15ce1abb0aaf0608461ae04e202cb79664c9'); // ROM-stage diagnostic qc_romdiag_20260915_round4_v22: v21 + 3C08F9 marker (FE warp in SHADOW_EXCL zone) + 0x0CEB padding moved to 734301 -- regression only, not a candidate (2026-09-15)
_P.push('0c7be30cfe35a5a41471ef8e8886ae18504c260850f86538ff252684145fdb83'); // ROM-stage diagnostic qc_romdiag_20260915_round4_v21: v20 + hardNewlines flags so the row-head paddings of 3C8062/7342FD survive the encoder -- regression only, not a candidate (2026-09-15)
_P.push('03598f47cc4321d5afecaad77972d89cd854966ba8e010675a16ee3ffac15057'); // ROM-stage diagnostic qc_romdiag_20260915_round4_v20: v19 + builder keeps particle-marker rows (no-Hangul/single-JP heuristics), round4 orphan-punct paddings / comma move / 0B89 stems / 3C08F9 static, residue rows -- regression only, not a candidate (2026-09-15)
_P.push('c5f47abafc3f435a8aee1806e91897d727a464e2390873c201cc76b5a127dc0a'); // ROM-stage diagnostic qc_romdiag_20260915_round3c_v19: v18 + hook entry FF:1FA0 (small windows), 76 particle rows revived (bridge 17 static), walker marker decode, bullet dot convention -- regression only, not a candidate (2026-09-15)
_P.push('3b5bd037bb1894e89f758dee8716333ac8fdb384bac2981443c0fff7be2e08f2'); // ROM-stage diagnostic qc_romdiag_20260915_round3b_v18: v17 + particle runtime hook (FF:ED00, markers 0x410..0x414, {J|..} tokens 537), bullet blanks, 7BC650, 0C38 marker arms -- regression only, not a candidate (2026-09-15)
_P.push('be4e51a938eb2de8b06ef4ce1423162216180afa17b3aea4966ff5c47929dc85'); // ROM-stage diagnostic qc_romdiag_20260915_round3_v17: v16 + applier layout-copy repair, round3(row-tail residue 25, punct 93, newline deficits, macro+noun junctions, stems 3) -- regression only, not a candidate (2026-09-15)
_P.push('90a2cb81148b53e459c41c2795e3061c44fc47ef8d79df8d5a75a0bea37ec136'); // jp_reference_20260915_v1: 원본 JP 롬 기준 덤프용 합성 패치(빈 writes/arena/rowSpans; 배정은 기동용) -- JP reference only, not a candidate (2026-09-15)
_P.push('25949442e953f41c60e645045c8fc281629438e5a698dfcbcffee70e027d1952'); // speech_arms_20260915_v13: round5n 원문 등급 팔 복원(G-* 170)·모니카 존대·너가·린·부호 겹침·보류 C — candidate, not promoted (2026-09-15)
_P.push('92b25d887154e38fa22ce9dd34fe7846c90c476687d5dada23818328a747e6a5'); // speech_arms_20260915_v14a: 서술격 「이」 훅 통합·사설 문자 상수 수정 기준 빌드(문안 변경 없음) — candidate, not promoted (2026-09-15)
_P.push('1f4a39ada77d55a3980c0b09ccaa40515073183a0000ca53a3745d1b68e7d6a5'); // speech_arms_20260915_v14b: 발화 원본 레일 1단계(파일럿 발화 현재 문안 그대로 새 payload 경로) — candidate, not promoted (2026-09-15)
_P.push('018e4f68b4b11840e5c293e5f5862f42e4944ab26b7c7a80750e9d7eb015a828'); // utterances_20260917_v28: v27 + 레이아웃 m3(3C5C82·3C69B8 soft·7162FD/716308 어절 이동) — 재덤프·전체 본문 검사용, candidate, not promoted (2026-09-17)
_P.push('4970690393bc465d1fda472223352b48eb90a7dd6dac64a1840fe5e7a5e435fe'); // utterances_20260917_v30: v29 + 발화 b19 v4(경로별 글 대조 결함 수리 — 갈래 겹침·이름 두 번·첫 줄·팔별 복귀·0B2B 호출 틀) — 재덤프·전체 본문 검사용, candidate, not promoted (2026-09-17)
_P.push('e1514791d42445627069e025ca8bd8fe759070fe1efd16fda752c6ef5c33ed4a'); // utterances_20260917_v29: v28 + 발화 b19 v3(컴파일러 v2i 구조 거부 0·팔별 복귀·넓은 배치·제자리→직접 전환)·0x084E 행 수리 — 재덤프·전체 본문 검사용, candidate, not promoted (2026-09-17)
_P.push('df982d5b58df907fb6dace57ca1767935ff8a4c093bb6f13e68ea872f07c6739'); // utterances_20260917_v27: 발화 payload b18(대명사 호출 자리·흐름 결함 수리)·레이아웃 m1/m2·표 먼저 할당(표 1,027) — 재덤프·전체 본문 검사용, candidate, not promoted (2026-09-17)
_P.push('6e48f2192c426679440f359caf93592889f7a30a941b8d9397c963819bbc1933'); // utterances_20260917_v26: 발화 payload b16·이진 탐색 디스패처(표 1,015) — 전체 본문 레이아웃 검사용, candidate, not promoted (2026-09-17)
_P.push('3abff207eb6b80e1de704053ae7892f6cbdedaaba7f3e5034cd1d307089f1194'); // speech_arms_20260916_v15: 원문 말투 발화 원본 208(파일럿 17 포함)·컴파일러 v1f — candidate, not promoted (2026-09-16)
if(!_P.includes(createHash('sha256').update(patchBytes).digest('hex')))throw new Error('지원하지 않는 patch/assignment SHA');
const PATCH=JSON.parse(patchBytes.toString('utf8'));
const DICT = PATCH.dict || {};
// 구운 롬 — 화면 문안의 원천. 원장이 아니라 **이 바이트의 해독**을 방출해야
//   괴문자가 예측에 그대로 뜬다(사용자 지시 2026-09-03: 순환을 끊는 열쇠).
const baked = readFileSync(path.join(BUILD_DIR, 'bokuno_korean_all_halfcell_v1.smc'));
rom = baked; // All control operands and pointer tables use the actual candidate.
const ACTIVE_INDIRECT_RECORDS = activeActorRecordIndices(baked);
const ENUMERATE_INDIRECT_RECORDS = process.env.WALK_INDIRECT_ENUMERATE === '1';
const EV0153_CHOICE_CONTRACT=proveEv0153ChoiceContract(baked);
// 후보의 행 스팬(원문 주소) — 스팬 밖의 글리프 바이트는 화면에서 한글 CHR 을 통해 괴문자로 찍힌다(미피복 머리). 워커도 같은 바이트를 읽으므로 그대로 예측한다.
let ROWSPANS = [];
try { const pj = JSON.parse(readFileSync(path.join(BUILD_DIR, 'halfcell_all_patch_v1.json'), 'utf8')); ROWSPANS = (pj.rowSpans || []).map((r) => [r[0], r[1]]).sort((x, y) => x[0] - y[0]); } catch {}
const RS_STARTS = ROWSPANS.map((r) => r[0]);
const coveredAt = (a) => { let lo = 0, hi = RS_STARTS.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (RS_STARTS[m] <= a) { r = m; lo = m + 1; } else hi = m - 1; } return r >= 0 && a < ROWSPANS[r][1]; };
const spanAt = (a) => { let lo = 0, hi = RS_STARTS.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (RS_STARTS[m] <= a) { r = m; lo = m + 1; } else hi = m - 1; } return (r >= 0 && a < ROWSPANS[r][1]) ? ROWSPANS[r] : null; };
const textModel = createRuntimeTextModel(baked, PATCH.assignment || {});
const F9D_PAD_SKIP_PATH=path.join(BUILD_DIR,'f9d_pad17_overflow_skip_receipt_v1.json');
const F9D_PAD_SKIP=existsSync(F9D_PAD_SKIP_PATH)?JSON.parse(readFileSync(F9D_PAD_SKIP_PATH,'utf8')):null;
const CONDITIONAL_LEADING_PATH=path.join(BUILD_DIR,'conditional_leading_space_receipt_v1.json');
const CONDITIONAL_LEADING=existsSync(CONDITIONAL_LEADING_PATH)?JSON.parse(readFileSync(CONDITIONAL_LEADING_PATH,'utf8')):null;
const PREFIX_SEPARATOR_PATH=path.join(BUILD_DIR,'prefix_separator_overlay_receipt_v3.json');
const PREFIX_SEPARATOR_BYTES=existsSync(PREFIX_SEPARATOR_PATH)?readFileSync(PREFIX_SEPARATOR_PATH):null;
const PREFIX_SEPARATOR=PREFIX_SEPARATOR_BYTES?JSON.parse(PREFIX_SEPARATOR_BYTES.toString('utf8')):null;
const PREFIX_SEPARATOR_SHA=PREFIX_SEPARATOR_BYTES?createHash('sha256').update(PREFIX_SEPARATOR_BYTES).digest('hex'):null;
let currentTextContext = null;
let currentTextIssues = null;
let currentTextResolutions = null;
let currentGlyphTokens=null;
let currentMacroRecord=null;
const TRACE_GLYPHS=process.env.WALK_GLYPH_TRACE==='1';
const TRACE_NL=TRACE_GLYPHS&&process.env.WALK_TRACE_NL==='1';
const LAYOUT_AUDIT=process.argv.includes('--layout-audit');
if(LAYOUT_AUDIT&&TRACE_GLYPHS)throw new Error('--layout-audit refuses WALK_GLYPH_TRACE: adaptive zero-width controls require placement coordinates, not legacy text-index coordinates');
if(BALLOON_GRAPH&&!TRACE_GLYPHS)throw new Error('Balloon graph requires WALK_GLYPH_TRACE=1 for raw-slot identity');
const traceGlyph=(slot,at,sourceAt,sourceKind='stream')=>{if(TRACE_GLYPHS)currentGlyphTokens?.push({slot,at:hxA(at),sourceAt:hxA(sourceAt??at),sourceKind});};
const reportTextIssue = issue => { currentDecoderWarnings?.push(issue); currentTextIssues?.push(issue); };
// 마지막으로 그린 글자(실기 훅의 $7F:FE72 LAST 슬롯과 같은 뜻) — 글리프·매크로 이름 글자·공백이 갱신하고, 개행·제어는 안 건드린다.
let lastGlyphText = '';
const glyphText = (slot, pc, sourceAt) => {
  if (slot === COPULA_SLOT) {   // 서술격 「이」 마커: 실기 훅 FF:EF00 과 같은 규칙(받침 비트맵 = hasBatchim)
    const r = walkerCopula(lastGlyphText);
    if (r.text) traceGlyph(slot, pc, sourceAt);   // 폭 0 이면 그린 글리프가 없으므로 트레이스 토큰도 없다(emit 의 글자 수 대조와 맞춘다)
    lastGlyphText = r.last; return r.text;
  }
  const ji = josaIdxOfSlot(slot);
  if (ji >= 0) {   // 조사 마커: 직전에 그린 글자의 받침으로 팔 선택(rs3_josa_hook_v1 과 같은 표)
    const t = JOSA_PAIRS[ji][hasBatchim(lastGlyphText) ? 0 : 1];
    traceGlyph(slot, pc, sourceAt); lastGlyphText = t; return t;
  }
  const token = textModel.glyph(slot, hxA(pc));
  traceGlyph(slot,pc,sourceAt);
  if(token.text === null) reportTextIssue({kind:'unmapped-glyph-slot', slot, at:hxA(pc), sourceAt:hxA(sourceAt??pc), layoutOmitted:false, displaySurrogate:'U+FFFD'});
  lastGlyphText = token.display;
  return token.display;
};
const resolveText = (op,args,pc,sourceAt) => {
  const result = textModel.resolve(op,args,currentTextContext||{});
  if(!result) return null;
  for(const token of result.tokens)traceGlyph(token.slot,pc,sourceAt,'native-buffer');
  if (result.text) lastGlyphText = result.text[result.text.length - 1];   // 이름·사전 문안의 마지막 글자가 조사 마커의 받침 기준

  for(const issue of result.issues) reportTextIssue({...issue,at:hxA(pc),sourceAt:hxA(sourceAt??pc)});
  currentMacroRecord={kind:'runtime-text',at:hxA(pc),sourceAt:hxA(sourceAt??pc),opcode:op,arguments:args,source:result.source,bytes:result.bytes,slots:result.tokens.map(t=>t.slot),resolvedIndex:result.resolvedIndex,numericValue:result.numericValue,complete:result.complete,issues:result.issues,assumptions:result.assumptions||[]};
  currentTextResolutions?.push(currentMacroRecord);
  return result.text;
};
// 실효 피복: rowSpans 에 있어도 빌더가 조용히 버린 행(바이트가 JP 그대로, 그림자/아레나 없음)은 화면에 JP 바이트가 찍힌다(QC 인수인계 3.1).
const spanChangedCache = new Map();
const spanEffective = (sp) => { if (!sp) return false; if (shadowD.has(sp[0]) || arenaOwners.has(sp[0])) return true; let v = spanChangedCache.get(sp[0]); if (v === undefined) { v = false; for (let q = sp[0]; q < sp[1]; q += 1) if (baked[q] !== rom[q]) { v = true; break; } spanChangedCache.set(sp[0], v); } return v; };
const effectiveCoveredAt = (a) => spanEffective(spanAt(a));
const shadowD = new Map((PATCH.shadowRows || []).map(([rs, at, e16]) => [rs, [at, e16]]));
const shadowDispatch=createShadowDispatch(baked);
for(const [a,[target]] of shadowD){const actual=shadowDispatch.lookup(a);if(!actual||actual.target!==target)throw new Error(`shadow manifest/directory mismatch at ${a.toString(16)}`);}
const arenaOwners = new Set((PATCH.arenaRows || []).map(([rs]) => rs));
const arenaRowD = new Map((PATCH.arenaRows || []).map(r=>[Number(r[0]),r.map(Number)]));
const arenaBanks = PATCH.arenaBanks || {};
const cpuBankOfFile = (fb) => (fb <= 0x3f ? 0xc0 + fb : fb);
const fileBankOfCpu = (cb) => (cb >= 0xc0 ? cb - 0xc0 : cb);
const MACROSET = new Set([0x39, 0x3a, 0x3b, 0x4a]);
const arenaBackAt = (s0, e0) => {
  let a = s0;
  while (a < e0) {
    const b = baked[a];
    if (b === 0xff) return a;
    if (b === 0xfe) { a += 3; continue; }
    if (b === 0x4f || b === 0xfd || b === 0x50 || b === 0x24 || b === 0x2c) { a += 1; continue; }
    if (MACROSET.has(b) || b === 0x18 || b === 0x46 || (b >= 0x20 && b <= 0x23)) { a += 2; continue; }
    if (b >= 0x51) { a += 1; continue; }
    a += 1 + (argMain[b] || 0);
  }
  return -1;
};
// 구운 롬 해독 — dump_balloons_jp_ko_v1 의 decKo 이식(그림자 발동·FE 워프·확장문자)
let lastShadowResume = 0;
let currentDecoderWarnings = null;
const pushDecodeSegment = (segments, pc, text, raw = false) => {
  if (!segments || !text) return;
  const key = pc.toString(16).toUpperCase().padStart(6, '0');
  const last = segments.length ? segments[segments.length - 1] : null;
  if (last && last[0] === key && !!last[2] === raw) last[1] += text;
  else segments.push(raw ? [key, text, 'raw'] : [key, text]);
};
function decKo(s0, e0, srcBank, depth = 0, segments = null, sourceAt = null, controls = null, controlOffset = 0) {
  let out = '', a = s0;
  while (a < e0) {
    const declaredShadow=shadowD.get(a);
    const sh=shadowDispatch.active(a)?declaredShadow:undefined;
    if(declaredShadow&&!sh) currentDecoderWarnings?.push({kind:"dormant-shadow-unhooked-opcode",at:hxA(a),bakedOpcode:baked[a],declaredTarget:hxA(declaredShadow[0]),action:"decode-actual-baked-command"});
    if (sh !== undefined && depth < 3) {
      out += decKo(sh[0], (sh[0] & 0xff0000) + 0x10000, srcBank, depth + 1, segments, a, controls, controlOffset + out.length);
      a = (a & 0xff0000) | sh[1];
      if (a > lastShadowResume) lastShadowResume = a;   // 아레나가 원문 [rs,e16) 를 대체 — 그 안의 nl/pause op 는 실행되지 않는다
      continue;
    }
    const layoutToken=NOPS.layoutSpanAt(a)||NOPS.layoutTokenAt(a);
    if(layoutToken?.kind==='adaptive-padding'){
      reportTextIssue({kind:'HOLD_NATIVE_PADDING_DISPATCH',at:hxA(a),source:hxA(layoutToken.source),
        reason:'bulk-decoder-has-no-active-native-frame',evidenceScope:'non-execution-prefix-only'});
      return out;
    }
    const b = baked[a];
    if (b === 0xff) return out;
    if (b === 0xfe) {
      // FE is also a valid one-byte source glyph in old event text.  Treat it as
      // an arena warp when the current decoded span owns the two target operand
      // bytes, or when the patch manifest proves this source byte owns an arena.
      // Otherwise command bytes after a one-byte glyph can be misread as a huge
      // arena target and exhaust the heap (ev03f1 3B013A).  Keep a warning so
      // the missing coverage is not mistaken for clean output.
      if (a + 2 >= e0 && !arenaOwners.has(a)) {
        currentDecoderWarnings?.push({ pc: a.toString(16).toUpperCase().padStart(6, '0'), kind: 'unowned-or-truncated-FE', spanEnd: e0.toString(16).toUpperCase().padStart(6, '0') });
        a += 1; continue;
      }
      const tgt = baked[a + 1] | (baked[a + 2] << 8);
      const ab = arenaBanks[cpuBankOfFile(srcBank).toString(16)];
      if (ab !== undefined && depth < 3) {
        const fb = fileBankOfCpu(ab);
        const as0 = (fb << 16) | tgt, ae0 = (fb << 16) + 0x10000;
        out += decKo(as0, ae0, srcBank, depth + 1, segments, a, controls, controlOffset + out.length);
        const backAt = arenaBackAt(as0, ae0);
        if (backAt >= 0 && baked[backAt + 3] === cpuBankOfFile(srcBank)) {
          a = (a & 0xff0000) | (baked[backAt + 1] | (baked[backAt + 2] << 8));
          if (a > lastShadowResume) lastShadowResume = a;   // 아레나 복귀점도 행 끝이다(3B975D: 행 안 둘째 텍스트 op 를 죽은 바이트로 풀던 워커 결함)
          continue;
        }
      }
      a += 3; continue;
    }
    if (TEXT_COMMANDS.has(b) || (b===0x4f && TEXT_4F.has(baked[a+1]))) {
      const length=b===0x3d||b===0x3e||(b===0x4f&&baked[a+1]!==0x11)?3:2;
      const text=resolveText(b,[...baked.subarray(a+1,a+length)],a,sourceAt);
      out+=text||'';pushDecodeSegment(segments,sourceAt??a,text||'');a+=length;continue;
    }
    if (b === 0x4f) { a += 2 + (AC.sub4F[baked[a + 1]] || 0); continue; }
    if (b === 0xfd) { a += 1; continue; }
    if (b === 0x50) {
      if(layoutToken?.kind==='conditional-skip-line-start')controls?.push({kind:'skipSpaceIfLineStart',index:controlOffset+out.length,at:hxA(a),source:hxA(layoutToken.source),back:hxA(layoutToken.back),
        ...(layoutToken.requiredCols===undefined?{}:{requiredCols:layoutToken.requiredCols}),nativeHalfPhase:layoutToken.nativeHalfPhase,
        modelAssumption:layoutToken.modelAssumption||'half-cell layout column 0 corresponds to native line-start phase'});
      traceGlyph(0,a,sourceAt);out += ' '; lastGlyphText = ' '; pushDecodeSegment(segments, sourceAt ?? a, ' '); a += 1; continue;
    }
    if (b === 0x24) { const text = (process.env.WALK_NL === '1' || LAYOUT) ? '\n' : ' '; if(TRACE_NL&&text==='\n')traceGlyph(-1,a,sourceAt,'newline'); out += text; pushDecodeSegment(segments, sourceAt ?? a, text); a += 1; continue; }
    if (b === 0x2c && LAYOUT) { out += '\f'; pushDecodeSegment(segments, sourceAt ?? a, '\f'); a += 1; continue; }   // 페이지 경계(키 대기)  // WALK_NL=1: 개행 보존(행 복원용)
    // 원문 자리에서 글리프로 풀리는 바이트가 ①어느 행 스팬에도 없거나 ②그림자 행의 머리(FE 워프)를 지나 안쪽에서 읽힌 죽은 JP 바이트면 화면 괴문자다
    //   (제자리 행은 원문 자리에 한글 바이트가 구워져 있어 정상). shadowD 는 행 머리 주소 → 아레나 사상.
    // v23: '죽은 바이트'는 행 머리에 트리거가 실제로 있을 때만(그림자 디렉토리 등재 또는 구운 머리 바이트 FE/FD). 아레나 등재 행이라도 제자리에 한국어를
    //   구운 행(3C1B95 `51 5e 20 ef …`)은 머리 뒤 바이트가 살아 있다 — 옛 규칙은 그런 행의 정상 문안 「가문의 전통이지,」를 괴문자로 찍었다.
    // v25: 그림자 행의 복귀점(e16)이 행 끝보다 앞이면 복귀점부터는 살아 있는 제자리 바이트다(3B3225 행: 아레나 → 322D 복귀 → `24` + 제자리 한국어 「호위해라.」).
    //   죽은 바이트 = 머리 뒤 ~ 복귀점 앞. FE/FD 머리 행은 복귀점을 모르니 행 끝까지로 둔다.
    const rawG = sourceAt === null && ROWSPANS.length && (() => { const sp = spanAt(a); if (!sp || !spanEffective(sp)) return true; const sh = shadowD.get(sp[0]); const trig = !!sh || baked[sp[0]] === 0xfe || baked[sp[0]] === 0xfd; const ret = sh ? ((sp[0] & 0xff0000) | sh[1]) : sp[1]; return trig && a > sp[0] && a < ret; })();
    if (b === 0x18 || b === 0x46) { const text = glyphText((b === 0x18 ? 0x400 : 0x500) | baked[a + 1],a,sourceAt); out += text; pushDecodeSegment(segments, sourceAt ?? a, text, rawG); a += 2; continue; }
    if (b >= 0x20 && b <= 0x23) { const text = glyphText(((b - 0x20) << 8) | baked[a + 1],a,sourceAt); out += text; pushDecodeSegment(segments, sourceAt ?? a, text, rawG); a += 1 + 1; continue; }
    if (b >= 0x51) { const text = glyphText(b - 0x50,a,sourceAt); out += text; pushDecodeSegment(segments, sourceAt ?? a, text, rawG); a += 1; continue; }
    a += 1 + (argMain[b] || 0);
  }
  return out;
}
const decKoWithSegments = (s0, e0, srcBank) => {
  const segments = [],controls=[];
  const text = decKo(s0, e0, srcBank, 0, segments,null,controls);
  return { text, segments, controls };
};

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
// v14: `raw_XXXXXX` = 계정 없는 진입점(파일 오프셋, 씨앗). 계정 op 대신 앵커 정렬 롬 op(romOps)를 그 자리부터 읽는다.
//   z42 정적 덤프 전수 대조(2026-09-06): 구운 행 24,795 중 3,922행이 어느 계정에도 없어 풍선에 안 나왔다(bank 70~73 flow/frag·rgn 구역·raw_ 26 진입).
//   씨앗의 진입 문맥(앞서 열린 창)은 알 수 없으므로 출력 status 는 'static' 이 아니라 'seed' 로 낸다.
//   `07db_route_npc` 같은 이름 붙은 토큰은 앞 4자리 id 로 읽고, 같은 id 가 이미 있으면 조용히 건너뛴다.
const RAW_BASE = 0x1000000;
const evName = (e) => e >= RAW_BASE ? 'raw_' + (e - RAW_BASE).toString(16).toUpperCase().padStart(6, '0') : '0x' + e.toString(16).toUpperCase().padStart(4, '0');
const parseEventToken = (x) => {
  const t = String(x || '').trim();
  const rm = /^raw_([0-9a-f]{5,6})$/i.exec(t);
  if (rm) return RAW_BASE + Number.parseInt(rm[1], 16);
  const nm = /^([0-9a-f]{4})_[A-Za-z0-9_]*$/i.exec(t);
  if (nm) return Number.parseInt(nm[1], 16);
  if (!/^(?:0x)?[0-9a-f]{1,4}$/i.test(t)) throw new Error(`invalid event id token: ${t}`);
  return Number.parseInt(t.replace(/^0x/i, ''), 16);
};
const parseEventList = (tokens) => {
  const out = [], seen = new Set();
  for (const token of tokens.filter(Boolean)) {
    const ev = parseEventToken(token);
    if (seen.has(ev) && /_/.test(String(token))) continue;
    if (seen.has(ev)) throw new Error(`duplicate event id: 0x${ev.toString(16).toUpperCase().padStart(4, '0')}`);
    seen.add(ev); out.push(ev);
  }
  return out;
};
let EVENTS = parseEventList((arg('--events', '') || '').split(','));
const EVENTS_FILE = arg('--events-file', '');
if (EVENTS_FILE) EVENTS = parseEventList(readFileSync(EVENTS_FILE, 'utf8').split(/[\s,]+/));
const HAS_RAW = EVENTS.some((e) => e >= RAW_BASE);
let ONLY_CLASSES = (arg('--classes', '') || '').split(',').filter(Boolean).map(Number);
const SCORE = arg('--score', '');
if(SCORE || arg('--decode-at','') || process.env.WALK_ROM_OPS==='1' || process.env.WALK_INLINE_CALLS==='0' || process.env.WALK_SEED_ALL==='1') throw new Error('v32 refuses legacy decoder/account/scoring/seed modes; use candidate entry traversal');
// Inventory mode retains unknown-gate/coverage metadata and full flagged balloons.
// Unflagged balloons are counted, not silently mistaken for measured/clean ones.
const COMPACT = process.argv.includes('--compact');
if (COMPACT && SCORE) throw new Error('--compact cannot be combined with --score');
if(LAYOUT_AUDIT&&!COMPACT)throw new Error('--layout-audit requires --compact to avoid page/graph dumps');
// 디버그: --decode-at 0xADDR[:LEN] — 그 창의 구운 바이트를 decKo 로 풀어 보여준다(계정서 무시)
// --from <hex>: 이벤트 **진입점 대신** 그 주소부터 걷는다(중첩 호출은 제 진입점 유지).
//   보스전·선택지 뒤라 자연 도달이 안 되는 자리를 계급 평가까지 살린 채 보기 위한 것.
//   (커서 유도 하네스의 RS3_OPEN 과 같은 뜻 — 그쪽은 진짜 코어, 이쪽은 정적 워커)
const FROM_AT = arg('--from', '');
// --poke <파일주소>=<hex 바이트>[,...] : **걷기 전에 롬 바이트를 찍는다.**
//   왜: 계정서가 이 이벤트 것이라 하는 구간에 워커가 안 들어가는 자리가 있다
//   (079E: 진입 3BFE05 에서 3B95xx 미도달). 게이트도 호출 깊이도 원인이 아니었다 —
//   그 경로가 애초에 안 흐른다. 원거리 점프를 찍어 흐름을 몰면 그 구간 문안을 정적으로 본다.
//   예) --poke 3BFE05=0d17ee94fb   (0d 17 = jumpL, CPU $FB:94EE = 파일 3B94EE)
//   **원본·구운 롬 둘 다** 찍는다(제어 흐름은 원본, 문안 해독은 구운 롬을 읽는다).
//   잰다: 그 구간이 실행되면 무엇이 찍히는가. 못 잰다: 실제 게임에서 그 흐름이 일어나는가.
const POKES = arg('--poke', '').split(',').map((t) => {
  const m = t.trim().match(/^([0-9a-f]{4,6})=([0-9a-f]+)$/i);
  return m ? { at: Number.parseInt(m[1], 16), by: m[2].match(/../g).map((x) => Number.parseInt(x, 16)) } : null;
}).filter(Boolean);
for (const q of POKES) {
  const was = Array.from(rom.subarray(q.at, q.at + q.by.length)).map((x) => x.toString(16).padStart(2, '0')).join(' ');
  q.by.forEach((b, k) => { rom[q.at + k] = b; baked[q.at + k] = b; });
  console.log(`poke ${q.at.toString(16).toUpperCase()}: ${was} -> ${q.by.map((x) => x.toString(16).padStart(2, '0')).join(' ')}`);
}
// --flags all[=N] | v<id>=<n>,e<id>=<n>,p<id>=<n> : 이야기 플래그를 씨앗으로 세운다.
//   --state 를 물렸을 때만 뜻이 있다(상태 없이는 워커가 이미 모든 갈래를 연다 — 실측 무변화).
//   계급(169)·주인공 플래그(48..55)는 건드리지 않는다. 걷는 중 setFlag 가 채운 ov 가 우선한다.
const FLAG_FORCE = (() => {
  const s = arg('--flags', '');
  if (!s) return null;
  const out = { all: null, v: {}, e: {}, p: {} };
  for (const t of s.split(',')) {
    const a = t.match(/^all(?:=(\d+))?$/i);
    if (a) { out.all = a[1] === undefined ? 15 : Number(a[1]); continue; }
    const b = t.match(/^([vep])(\d+)=(\d+)$/i);
    if (b) { out[b[1].toLowerCase()][Number(b[2])] = Number(b[3]); }
  }
  return out;
})();
const flagForced = (kind, id) => {
  if (!FLAG_FORCE) return undefined;
  const t = FLAG_FORCE[kind];
  if (t && t[id] !== undefined) return t[id];
  if (FLAG_FORCE.all !== null && !(kind === 'v' && (id === 169 || (id >= 48 && id <= 55)))) return FLAG_FORCE.all;
  return undefined;
};
// --call-depth N: 중첩 이벤트 호출 추적 깊이(기본 2).
const CALL_DEPTH = Number(arg('--call-depth', '8'));
if (!Number.isInteger(CALL_DEPTH) || CALL_DEPTH < 0 || CALL_DEPTH > 32) throw new RangeError('--call-depth must be 0..32');
const DECODE_AT = arg('--decode-at', '');
const OUT = arg('--out', path.join(PROJECT, 'out', 'static_state_walk_v1.json'));
// --state PATH: 하네스와 같은 AI-SNES 씨앗 상태(AISNES1)의 WRAM/SRAM 을 달아 게이트를 실기처럼 한쪽만 탄다.
//   램 지도(2026-09-02): 바닐라 플래그 7E:F46A+(id>>1) 니블(짝수=상위) · 확장 플래그(0D 00/01/03) 7F:FF90+(id>>1) = wram[0x1FF90+…]
//   · 보쿠노 packed4(49) CPU/SRAM $37:7F90+(id>>1), SRAM 크기에 따라 미러링.
//   · chkMem(45 AA NN) = wram[(work[AA+1]<<8)|work[AA]] == NN, work 는 EF00 스크래치(41 AA lo hi 가 채움).
//   주인공은 하네스처럼 플래그 48~55 를 덮고(활성 0x0C) 계급 169 를 덮는다. 없으면 종전대로 미지 게이트 fork.
const STATE_PATH = arg('--state', '');
let STATE = null;
if (STATE_PATH) {
  STATE = parseWalkerState(readFileSync(STATE_PATH));
  assertPackedReadHelper(rom, baked);
  console.error(`state: wram ${STATE.wram.length} sram ${STATE.sram.length} (${STATE_PATH})`);
}
// 엔진이 이벤트 시작 때 넣는 디스패처 변수(말 건 오브젝트 번호 등) — 씨앗값이 무의미하므로 분기로 남긴다(실기 보정 2026-09-02)
const ENGINE_SET_FLAGS = new Set([134, 136, 140, 163, 173, 176, 206]);
const nib = (buf, base, id) => { const b = buf[base + (id >> 1)]; return (id & 1) ? (b & 0xf) : ((b >> 4) & 0xf); };
const STATE_POLICY = configureStatePolicy(arg('--state-policy', 'class-probe'), STATE, ONLY_CLASSES);
ONLY_CLASSES = STATE_POLICY.classes;
const flagOptions=(space,id,cls,ov)=>({space,id,cls,overlay:ov,state:STATE,rom:baked,scratch:currentTextContext?.scratch,policy:STATE_POLICY.name,forced:flagForced});
const vanillaFlag = (id, cls, ov) => readFlagValue(flagOptions('v',id,cls,ov));
// 클래스(변수 A9) → 4A 인명표 번호. cursor_jump_harness_v1 PROTAG_TABLE 과 같다(율리안0 토마스3 미카엘5 하리드4 사라2 엘렌1 카타리나7 모니카6).
//   인명표 순서는 id0 율리안·1 엘렌·2 사라·3 토마스·4 하리드·5 미카엘·6 모니카·7 카타리나 (KO 표 폭 3·2·2·3·3·3·3·4 로 교차 확인).
const NAME_ID_BY_CLASS = [0, 3, 5, 4, 2, 1, 7, 6];


const LAYOUT = process.env.WALK_LAYOUT !== '0';
// 창 크기를 정하는 출처(실험 스위치). **기본을 바꾸지 마라** — 4D→9x3 은 전수 말풍선 트레이스
// 역추적으로 확정된 것이다([[rs3-balloon-size-is-a-rom-preset]]). 2026-09-04 에 이걸 끄면 정확도가
// 오르는 것처럼 보였는데, 그 정답지가 RS3_OPEN 강제 점프(여는 op 를 뒤로 훑어 찾음)로 오염된 것이었다.
// 채점은 하네스의 **자연 후보 말풍선**으로만 해라.
const GEOM_SRC = new Set((process.env.WALK_GEOM ?? 'win4D,4F_1D,4F_1A,4F_1B').split(',').filter(Boolean));
const GEOM_3C = process.env.WALK_GEOM_3C !== '0';   // 기본 ON: 줄(24)·페이지(2C) 구조 보존
// 창 기하 — 심볼릭 말풍선 VM 의 실측 프리셋(sizeIndex→cols×rows), 3C X Y SS 는 $3D:EB00+(SS&7F)*16 의 +9/+10
const PRESETS = { win4D: [0x08, 9, 3], '4F_1D': [0x00, 14, 4], '4F_1A': [0x10, 8, 2], '4F_1B': [0x18, 7, 1] };
// ROM-backed mode -> D599 -> mode*8+native-constructor-selector -> size-record proof.
// This selector is the constructor's 0..7 window quadrant input, not player class.  The helper
// authenticates the dispatcher, handler, constructor, width load and all
// eight actor records; a first-record-only check is not sufficient.
const SMALL_PRESET_CONTRACT=inspectSmallWindowPresetContract(baked);
const VERIFIED_SMALL_PRESETS=new Set(SMALL_PRESET_CONTRACT.pass?SMALL_PRESET_CONTRACT.presets.filter(p=>p.pass).map(p=>p.name):[]);
// **확정 창 색인** — 전수 말풍선 트레이스 코퍼스의 static_window_flow_v1.json 에서
//   `flowWindow.status === 'static'`(모든 계정 CFG 경로에서 창이 하나로 확정된 노드)만 뽑은 것.
//   나머지 64%(trace-required)는 실행 중에 정해져 정적으로는 **알 수 없다** — 그 자리에서
//   창을 추측하면 배치 판정이 통째로 유령이 된다(2026-09-04: 9→14 오판 99건의 정체).
//   색인은 [시작 → [끝, cols, rows]] 인 **구간**이다. 정확 주소로만 찾으면 원장 행 주소와
//   어긋나 하나도 안 잡힌다(2026-09-04 실측: 실기 결함 16곳 전부 확정 창이 있는데 재현율 0%).
let WINSPANS = [];
try {
  const j = JSON.parse(readFileSync(path.join(PROJECT, 'out', 'static_window_flow_index_v1.json'), 'utf8'));
  WINSPANS = Object.entries(j).map(([k, v]) => [Number.parseInt(k, 16), v[0], v[1], v[2]])
    .sort((a, b) => a[0] - b[0]);
} catch {}
const winAt = (a) => {                                   // 구간 이분 탐색
  let lo = 0, hi = WINSPANS.length - 1, r = null;
  while (lo <= hi) { const m = (lo + hi) >> 1;
    if (WINSPANS[m][0] <= a) { r = WINSPANS[m]; lo = m + 1; } else hi = m - 1; }
  return (r && a < r[1]) ? r : null;
};
const sizeRecord = (idx) => { const t = 0x3DEB00 + idx * 16; return { cols: baked[t + 9], rows: baked[t + 10], outerWidth: baked[t + 2], outerHeight: baked[t + 3] }; };
// ---- 창 상태 v2 (사용자 설계 2026-09-06) ----
//   크기 상태(D599 모드 → $FD:EB00 레코드)와 열림/닫힘은 별개다. 2A 는 창만 닫고 크기는 남긴다 → 다음 대사가
//   창 op 없이 열리면 직전 크기를 상속한다. 경로 위에서 4D/4F1D/4F1A/4F1B/3C 로 정해진 창(호출자→피호출자 상속,
//   피호출자가 바꾼 창의 복귀 포함)은 **확정**이고 출처(창 설정 주소·이벤트·sizeIndex)를 같이 흘린다.
//   실측: 하네스 5,400캡처 여는 op 집계 4D→18칸 63/64·4F1D/28/29→28칸 전부, `T 4D S T` (28→18) = 활성 창 안의 4D 도
//   9x3 로 바꾼다(450836). 4D 뒤 문안이 앞 풍선 끝에 이어지는 「4d 이음」은 코덱스 Mesen + 실기 4곳(3B685E·3B8801·3B8815·3BC510).
//   이벤트 루트에서 창 op 없이 시작하는 풍선(src 'default' 14x4)은 진입 시 D599 잔존값이라 WALK_DEFAULT_CONFIRMED=1 일 때만 확정.
//   compact 레코드(메뉴·UI 창, WRAM $7E:0F02+6n → sizeByte=ROM[E6:E400+idx] / idx>=0x140 → 5A:2980+idx, 폭 원시 1→8·2→10·3→16·4→22자)는
//   대사 창 경로가 아니다(런타임 인수인계 §15) — 전투·파티·필드 창은 동적 항목으로 남긴다. 헬퍼만 둔다.
const PATH_CONFIRMED = new Set(['win4D', '4F_1D', '4F_1A', '4F_1B', '3C', 'state-D599']);
// WALK_WINDOW_SETTERS=<json> (2026-09-07): 이벤트 진입점 **앞**에 있는 창 설정을 못 봐서
//   default 14x4/unconfirmed 로 남는 창을, 후보 설정 주소에서 --from 으로 걸어 **그 창에 실제로
//   닿는 것을 확인한** 결과로 채운다(tools/resolve_window_setter_v1.py). 바이트상 가까운 op 를
//   고르는 역방향 검색이 아니라 실행 경로 증명이다. 도달성 증명은 아니므로 src 를 따로 표기한다.
const WINDOW_SETTERS = (() => {
  const f = process.env.WALK_WINDOW_SETTERS;
  if (!f) return null;
  const j = JSON.parse(readFileSync(path.isAbsolute(f) ? f : path.join(PROJECT, f), 'utf8'));
  const m = new Map();
  for (const [openAt, v] of Object.entries(j.rows || {})) {
    const r = (v.resolved || [])[0];
    if (r) m.set(String(openAt).toUpperCase(), r);
  }
  return m.size ? m : null;
})();
const DEFAULT_CONFIRMED = process.env.WALK_DEFAULT_CONFIRMED === '1';   // opt-in only: root inherited D599 is not established by a row address
const JOIN4D = process.env.WALK_JOIN_4D !== '0';
const MISS_FLAG = process.env.WALK_MISS_FLAG !== '0';
const COMPACT_W = { 1: 8, 2: 10, 3: 16, 4: 22 };
export const compactSize = (idx) => { const at = idx < 0x140 ? 0x26E400 + idx : 0x5A2980 + idx; const b = baked[at] ?? 0; return { sizeByte: b, rawW: b & 0x0f, rawH: b >> 4, cols: COMPACT_W[b & 0x0f] ?? null, from: idx < 0x140 ? 'E6:E400' : '5A:2980' }; };
let measuredGeometry = null;
try {
  if (process.env.WALK_MEASURED_GEOMETRY !== '1') throw new Error('v32: observations are validation data, not extraction input');
  const gd = JSON.parse(readFileSync(path.join(PROJECT, 'out', 'hw_window_geometry_context_v2.json'), 'utf8'));
  if (gd.romSha256 !== createHash('sha256').update(baked).digest('hex')) throw new Error('candidate ROM hash does not match geometry observations');
  measuredGeometry = makeGeometryResolver(gd, rom);
}
catch (e) { console.error('Measured geometry unavailable: ' + e.message); }
const calleeGeomOut = new Map();
let ENTRY_EVENT = null;   // entry 주소 → 이벤트 id (계정 경계 낙수: 엔진은 계정을 모르고 바이트를 계속 읽는다 — 3B685E→3B6869 실기 이음)
const entryEventAt = (a) => {
  if (!ENTRY_EVENT) { ENTRY_EVENT = new Map(); for (const f of readdirSync(ACCOUNT_DIR)) { const m = /^ev_([0-9a-fA-F]{4})\.json$/.exec(f); if (!m) continue;
    try { const e = JSON.parse(readFileSync(path.join(ACCOUNT_DIR, f), 'utf8')).entry; if (e) ENTRY_EVENT.set(Number.parseInt(String(e), 16), Number.parseInt(m[1], 16)); } catch {} } }
  return ENTRY_EVENT.get(a);
};   // `${callee}|${cls}|${in}` → 피호출자가 남긴 창 (같은 피호출자 두 번째 호출 자리에도 복귀 창을 적용)
const geomKey = (g) => g ? `${g.cols}x${g.rows}` : '-';
const hxA = (a) => (a === undefined || a === null) ? null : a.toString(16).toUpperCase();
const CLASSES = ['율리안', '토마스', '미카엘', '하리드', '사라', '엘렌', '카타리나', '모니카'];
// 주인공 플래그 id (실기 하네스 PROTAGONISTS 표와 동일) — 활성만 0x0C, 나머지 0x00
const FLAGID = [48, 51, 53, 52, 50, 49, 55, 54];

// ---- 병합 승자 원장 (빌더와 같은 점수) ----
const best = new Map();
// v32 does not load translation ledgers to drive execution.

// ---- 조각 주소 공식 (메모리 rs3-low-band-tokens-are-dictionary-words) ----
//   bank = 0xFA + (리드>>2)  (0B→FC) · bank:0000 의 u16 누적표 · idx = 코드&0x3FF · 데이터 +0x800
const fragAddr = (lead, second) => {
  const bank = 0xfa + (lead >> 2);                  // CPU 뱅크 (FA..) → 파일도 같은 값(3F 이하 아님)
  const fileBank = bank >= 0xc0 ? bank - 0xc0 : bank;
  const base = fileBank << 16;
  const idx = ((lead << 8) | second) & 0x3ff;
  const lo = rom[base + idx * 2] | (rom[base + idx * 2 + 1] << 8);
  return base + 0x800 + lo;
};

// ---- 원시 롬 워커 (조각 내부 — 계정서 밖) ----
//   조각 안에도 33/4e 게이트가 있다.  같은 규칙으로 걷고, 텍스트는 원장 행으로 바꾼다.
const AC = JSON.parse(readFileSync(path.join(ROOT, 'rs3steam', 'rs3_wiki_op_argcounts_v1.json'), 'utf8'));
const argMain = AC.main00_4F;
// v16: op 길이·글자 대역·진입 표·한 op 해독은 tools/rs3_native_ops_v1.mjs 하나가 원전이다(계정서 op 1,203,885 개와 길이 1,203,878 일치 검증).
//   WALK_ACCOUNTS=1 이면 옛 계정서 op 지도를 쓴다(A/B 대조용). 기본은 롬 직독 — 사용자 2026-09-06: 「엔진이 롬의 어디를 읽는지 다 아는데 계정서가 왜 필요한가」.
let OPNOTE_EARLY = {}; try { OPNOTE_EARLY = JSON.parse(readFileSync(path.join(PROJECT, 'out', 'op_note_table_v1.json'), 'utf8')); } catch {}
const NOPS = createCandidateStream(baked, { argMain, sub4F: AC.sub4F, opNote: OPNOTE_EARLY,
  adaptivePadding:PATCH.adaptivePadding,layoutPatch:PATCH,f9dPadSkip:F9D_PAD_SKIP,conditionalLeadingSpace:CONDITIONAL_LEADING,
  prefixSeparator:PREFIX_SEPARATOR,prefixSeparatorSha256:PREFIX_SEPARATOR_SHA });
const NATIVE = true;
if (process.env.WALK_ACCOUNTS==='1') throw new Error('v32 candidate stream does not support account-driven decoding');
const opLenAt = (a) => NOPS.opLenAt(a) ?? 1;
const isText = NOPS.isText;

// 행 목록(주소순) — 구간 조회용.  머리 정확일치만 보면 행 머리가 op 경계와
//   어긋난 자리(행이 토큰 중간에서 시작/끝나는 실측 부류)를 전부 놓친다.
const rowsSorted = [...best.values()].sort((a, b) => a.s - b.s);
const rowStarts = rowsSorted.map((r) => r.s);
const koAtOffset = (off) => {
  const r = best.get(off);
  if (r) return r;                                   // 머리 일치 우선
  // off 를 덮는 행: starts 에서 off 이하 최대 머리 → 스팬 검사
  let lo = 0, hi = rowStarts.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (rowStarts[m] <= off) { k = m; lo = m + 1; } else hi = m - 1; }
  if (k >= 0) { const c = rowsSorted[k]; if (off < c.e) return c; }
  return null;
};

function walkRaw(startA, cls, emit, depth, guard) {
  // 조각/0D18 내부: 종결(2e·ff·2a) 또는 캡까지
  let a = startA, steps = 0;
  while (steps++ < 96) {
    if (guard.has(a)) return; guard.add(a);
    const b = rom[a];
    if (b === 0x2e || b === 0xff || b === 0x2a) return;
    if (b === 0x33) {
      const varId = rom[a + 1], range = rom[a + 2];
      const lo = range >> 4, hi = range & 0xf;
      // class-fork(2026-09-07): 조각 안 말투 팔도 갈라야 한다. 클래스를 고정값으로 비교하면
      //   팔 하나만 나오고 나머지 등급의 어미가 통째로 빠진다(실측: 「미안하다/미안합니다/미안해」 계열 16줄 누락).
      //   여기서는 큐가 없으므로 실패 경로를 재귀로 먼저 훑고 통과 경로를 이어 간다.
      if (varId === 0xa9 && STATE_POLICY.name === 'class-fork') {
        const skipAt = a + 3 + opLenAt(a + 3);
        walkRaw(skipAt, cls, emit, depth, new Set(guard));
        a += 3;
        continue;
      }
      const pass = varId === 0xa9 ? (cls >= lo && cls <= hi) : true;
      a += 3;
      if (!pass) a += opLenAt(a);                    // 다음 op 하나 건너뜀
      continue;
    }
    if (b === 0x4e) { a += 2 + rom[a + 1]; continue; }
    if (isText(b)) {
      const e2 = a + opLenAt(a);
      const d = decKoWithSegments(a, e2, a >> 16);
      emit(d.text || null, a, d.segments, d.controls);          // 화면 = 구운 바이트의 해독
      a = e2; continue;
    }
    a += opLenAt(a);
  }
}

// ---- 계정서 워커 (심볼릭 VM 명세 이식: build_symbolic_balloon_vm_v2.py) ----
//   00..0B XX = 복귀형 이벤트 호출 · 32 0X XX = 꼬리 이양(복귀 없음)
//   0d 17 = jumpL(무조건 장거리 점프) · 0d 18 = callL(복귀형 호출, 2E 가 리턴)
//   2E = 리턴 · 43 = 스택 전체 종료
//   far_target: addr16 = b2|b3<<8, b4 = CPU 뱅크 (40..7D → +0x400000, C0..FF → -0xC0)
//   미지 변수 게이트(var≠169)는 가정하지 않고 **분기 탐색** — 두 경로 다 걷는다.
const farTarget = (hexStr) => {
  const h = hexStr.split(' ').map((x) => Number.parseInt(x, 16));
  if (h.length !== 5) return null;
  const addr = h[2] | (h[3] << 8), bank = h[4];
  if (bank >= 0x40 && bank <= 0x7d) return 0x400000 + (((bank - 0x40) << 16) | addr);
  if (bank >= 0xc0 && bank <= 0xff) return ((bank - 0xc0) << 16) | addr;
  return null;
};

// ── 0B XX 사전 조각 = 유계 미니 스크립트 ──────────────────────────────────────────
//   표: bank = 0xFA + (lead>>2) (0B → FC), FC:0000 u16 누적 오프셋, idx = code & 0x3FF,
//   [start,end) = table[idx-1]+0x800 .. table[idx]+0x800 (decode_dict_fragments_v1.py 머리글).
//   본문은 글자만이 아니라 33 a9 XX 계급 게이트·4E·2E·중첩 0B 로 짜인 말투 팔이다.
//   실기 페치 실측: 0x0CAC `0b 75`·`0b 74` → 「저들」, 0x011C `0b bf` → (계급 0..3) `0b c0` → 「대어스」
//   (0BC0 だろう 행이 deliberateBlank 라 일본어 바이트 c2 7a 53 이 한글 폰트로 찍힘). WALK_FRAG=0 이면 끔.
function fragRange(code) {
  const lead = code >> 8, bank = 0xfa + (lead >> 2), idx = code & 0x3ff, base = (bank - 0xc0) << 16;
  const t = (i) => rom[base + 2 * i] | (rom[base + 2 * i + 1] << 8);
  return [base + (idx ? t(idx - 1) : 0) + 0x800, base + t(idx) + 0x800];
}
const FRAG_LEN = (b, b1) => b === 0x0d ? (b1 === 0x18 ? 5 : (b1 === 0x17 || b1 === 0x00) ? 4 : 2)
  : b < 0x10 ? 2 : b < 0x24 ? 2 : b === 0x2b ? 2
  : [0x33, 0x34, 0x35, 0x36, 0x45].includes(b) ? 3
  : [0x37, 0x39, 0x3a, 0x3b, 0x4a, 0x4b, 0x4e, 0x4f].includes(b) ? 2
  : (b === 0x3c || b === 0x41 || b === 0x49) ? 4 : 1;
const isGlyphByte = (b) => b >= 0x50 || (b >= 0x20 && b <= 0x23) || b === 0x18 || b === 0x46;
// ---- 롬 바이트 직접 op 스트림 (WALK_ROM_OPS=1) ----
//   계정서(rs3steam/bokuno_event_accounts_v1)는 **스팀 이식용으로 만든 산물**이라 대사 분석이
//   거기 얹힐 이유가 없다(사용자 지적 2026-09-04). 계정을 거치면 두 가지를 잃는다:
//     · 계정이 안 덮은 자리를 못 본다
//     · 진입점 하나에서 제어 흐름만 따라가 **안 지나는 갈래**가 생긴다(실기 결함 16곳 중 9곳 미도달)
//   길이는 opLenAt(위키 argcounts + 실측 보정), note 는 계정에서 뽑은 표(out/op_note_table_v1.json,
//   명령 키 137개·일의적)를 쓴다. 계정 경계와 99% 일치 검증됨(tools/rom_op_parser_probe_v1.mjs).
// **옛 WALK_ROM_OPS 구간 선형 모드의 상태: 미완성. 켜지 마라(NATIVE 이벤트 직독과 별개).** 앵커 정렬까지 붙여도 한 구간에서 가짜 flag 12,778개가 나오고
//   표적 말풍선은 못 찾는다. 계정서가 담은 것은 op 경계만이 아니라 **검증된 제어 흐름**
//   (entry·edges·coverage)이고, 그걸 바이트에서 다시 세우려면 계정 생성기를 새로 만들어야 한다.
//   지금 쓸 수 있는 대안은 WALK_SEED_ALL=1 — 계정 op 위에서 여는 op 마다 씨앗을 심어
//   도달성 의존만 걷어내는 것이다(실측: 못 보던 말풍선을 찾고 판정도 화면과 일치).
const ROM_OPS = process.env.WALK_ROM_OPS === '1';
let ROM_SPANS = [], OPNOTE = {};
if (ROM_OPS || HAS_RAW) {
  try { ROM_SPANS = JSON.parse(readFileSync(path.join(PROJECT, 'out', 'rom_dialogue_spans_v1.json'), 'utf8'))
    .map(([a, b]) => [Number.parseInt(a, 16), Number.parseInt(b, 16)]); } catch {}
  try { OPNOTE = JSON.parse(readFileSync(path.join(PROJECT, 'out', 'op_note_table_v1.json'), 'utf8')); } catch {}
}
const hx = (x) => x.toString(16).padStart(2, '0');
const noteOf = (a) => {
  const b = rom[a];
  const k = (b === 0x4f || b === 0x0d || b === 0x49) ? `${hx(b)} ${hx(rom[a + 1] || 0)}` : hx(b);
  const e = OPNOTE[k]; return e ? e[1] : '';
};
let ROM_ANCHORS = [];
if (ROM_OPS || HAS_RAW) { try { ROM_ANCHORS = JSON.parse(readFileSync(path.join(PROJECT, 'out', 'rom_op_anchors_v1.json'), 'utf8'))
  .map((x) => Number.parseInt(x, 16)).sort((a, b) => a - b); } catch {} }
function romOps(lo, hi) {
  // **앵커에서 정렬을 다시 잡는다** — 길이 하나만 어긋나도 그 뒤가 전부 가짜 op 가 된다
  //   (2026-09-04: 앵커 없이 22KB 를 선형 파싱했더니 한 구간에서만 가짜 flag 13,499개).
  //   앵커 = 원장 행 시작 21,794개, 빌더가 쓰는 보장된 op 경계다.
  const out = []; let a = lo;
  let ai = 0; while (ai < ROM_ANCHORS.length && ROM_ANCHORS[ai] <= lo) ai += 1;
  while (a < hi) {
    while (ai < ROM_ANCHORS.length && ROM_ANCHORS[ai] <= a) ai += 1;
    const nextAnchor = ai < ROM_ANCHORS.length ? ROM_ANCHORS[ai] : Infinity;
    const b = rom[a];
    if (isText(b)) { let q = a; while (q < hi && q < nextAnchor && isText(rom[q])) q += Math.max(1, opLenAt(q));
      if (q > nextAnchor) q = nextAnchor;
      out.push({ off: a, len: q - a, kind: 'text', note: '', hex: '' }); a = q; continue; }
    let len = Math.max(1, opLenAt(a));
    if (a + len > nextAnchor) len = nextAnchor - a;           // 앵커를 넘지 않는다
    const op = { off: a, len, kind: 'cmd', note: noteOf(a),
      hex: Array.from(rom.subarray(a, a + len)).map(hx).join(' ') };
    if (b === 0x33) op.operand = { space: 'flag.vanilla', id: rom[a + 1],
      rangeStart: rom[a + 2] >> 4, rangeEnd: rom[a + 2] & 0xf };
    out.push(op); a += len;
  }
  return out;
}

// v20: 조각 본문도 롬 직독 해독기로 읽는다(구운 롬 — 빌드가 0B 대역 제어를 고쳐 쓴다). 옛 FRAG_LEN 표는 48(3+count)·40(3)·42(2)·4F 부호 길이를 틀려
//   조각 안에서 정렬이 깨졌고, 0B 14 같은 시스템 조각(`33 86 ee 4e 02 2e 2e 11 f2 48 00 04 …`)의 뒷바이트가 글자로 풀려 3CB/3CC 괴문자 4,800건을 냈다(000A 실측 추적).
const NOPS_BAKED = createNativeOps(baked, { argMain, sub4F: AC.sub4F, opNote: OPNOTE_EARLY });
function fragOps(s, e) {
  const out = []; let a = s;
  while (a < e) {
    const op = NOPS_BAKED.opAt(a);
    if (!op || op.note === 'unknown' || !op.len) break;
    if (a + op.len > e) { if (op.kind === 'text') out.push({ ...op, len: e - a }); break; }
    out.push(op); a += op.len;
  }
  return out;
}

let currentRootEvent = null;
function walkEvent(eventId, cls, depth = 0, calledEvents = new Set(), geomIn = null, inherit = null, ovIn = null) {
  // v17: ovIn = 호출자의 경로 플래그 상태(피호출자 관문을 같은 지식으로 판정). 반환 writes = 이 이벤트(중첩 포함)가 쓴 변수 키 —
  //   호출자는 복귀 뒤 그 변수의 지식을 버린다(0014: 3A0B3D `33 86 11` → `00 1c` → 3A0C57 `33 86 05` 를 호출 전 값으로 확정하던 오판).
  if (depth === 0) currentRootEvent = evName(eventId);
  const writes = new Set();
  let acc, ops;
  if (NATIVE || eventId >= RAW_BASE) {              // v16 롬 직독: 진입 = 롬 표(또는 raw_ 씨앗), op = pc 자리 지연 해독
    const e = eventId >= RAW_BASE ? eventId - RAW_BASE : NOPS.entryOf(eventId);
    if (e === null || e === undefined) return { error: 'no-entry' };
    ops = [];
    acc = { entry: e.toString(16) };
  } else if (ROM_OPS) {                                     // 구간 색인 = eventId
    const sp = ROM_SPANS[eventId];
    if (!sp) return { error: 'no-span' };
    ops = romOps(sp[0], sp[1]);
    acc = { entry: sp[0].toString(16) };
  } else {
    const accPath = path.join(ACCOUNT_DIR, `ev_${eventId.toString(16).padStart(4, '0')}.json`);
    if (!existsSync(accPath)) return { error: 'no-account' };
    acc = JSON.parse(readFileSync(accPath, 'utf8'));
    ops = acc.ops || [];
  }
  const prevDecoderWarnings = currentDecoderWarnings, previousTextContext=currentTextContext, previousTextIssues=currentTextIssues, previousTextResolutions=currentTextResolutions,previousGlyphTokens=currentGlyphTokens;
  const decoderWarnings = [], stateEffectTrace=[], runtimeTextResolutions=[], inactiveControls=[],traceNodes=[],tracePaths=[],decisionNodes=[];let stateEffectCount=0,traceTail=-1,traceCapHit=0,decisionTail=-1;
  const journal = BALLOON_GRAPH ? new BalloonJournal() : null;
  let flowPc = null, visitedReason = null;
  const decision = (parent,record) => {decisionNodes.push({parent,...record});return decisionNodes.length-1;};
  currentDecoderWarnings = decoderWarnings;currentTextResolutions=runtimeTextResolutions;
  // v16: 롬 직독 = pc 자리에서 그때그때 해독(메모). 엔진도 착지한 자리에서 그대로 읽으므로 '경계로 당기기'(snapForward)는 하지 않는다.
  const byOff = (NATIVE || eventId >= RAW_BASE) ? (() => {
    const memo = new Map();
    return { get: (pc) => { if (pc === undefined || pc === null) return undefined; let o = memo.get(pc); if (o === undefined) { o = NOPS.opAt(pc); if (!o || o.note === 'unknown') o = null; memo.set(pc, o); } return o || undefined; },
             has: (pc) => memo.get(pc) !== undefined && memo.get(pc) !== null, set: (pc, o) => memo.set(pc, o) };
  })() : new Map(ops.map((o) => [o.off, o]));
  const LAZY = NATIVE || eventId >= RAW_BASE;
  const offs = LAZY ? [] : [...byOff.keys()].sort((x, y) => x - y);
  const unknownStops = []; const choiceStops=[]; const indirectStops = []; let indirectStopCount=0; let padStops = 0; const fragCalls = new Set(); let retPaths = 0, endAllPaths = 0;
  const addIndirectStop=d=>{indirectStopCount++;const key=`${d.at}|${d.reason}|${d.callAt||''}|${d.offset??''}`;const old=indirectStops.find(x=>x._key===key);if(old){old.occurrences++;return;}indirectStops.push({...d,occurrences:1,_key:key});};
  // v23: 행 중간 착지 — 관문 실패(+2)·4E 스킵·선택지 셀·30 분기의 착지가 트리거 행(그림자/FE 머리)의 머리가 아닌 안쪽이면 트리거가 잠들어 실기에서 원문 바이트가 찍힌다
  //   (메모리 rs3-skip-lands-mid-row). 착지점을 기록해 행 분할(tools/split_row_at_address_v1.mjs) 대상으로 낸다.
  const midRowLandings = new Map();
  // v24: 피연산자 위 행 머리 — 명령 op 의 두 번째 바이트부터 끝 사이에 트리거 행 머리가 있으면 엔진은 그 주소에서 op 를 시작하지 않아 트리거가 잠든다
  //   (3C9F08 = `0a 8a` 의 8a 위, JP 'ケ持ち物…' 의 가짜 ケ; 메모리 rs3-dormant-head-on-operand). 실기에서 원문이 찍히는 진짜 괴문자.
  const headOnOperand = new Map();
  const noteOperandHeads = (o) => { if (o.kind !== 'cmd' || o.len < 2) return; for (let q = o.off + 1; q < o.off + o.len; q += 1) { if (shadowD.has(q) || arenaOwners.has(q)) { const k = hxA(q); if (!headOnOperand.has(k)) headOnOperand.set(k, { op: hxA(o.off), hex: o.hex }); } } };
  const noteLanding = (pcL, from) => { const sp = ROWSPANS.length ? spanAt(pcL) : null; if (!sp || pcL <= sp[0]) return; const trig = shadowD.has(sp[0]) || baked[sp[0]] === 0xfe || baked[sp[0]] === 0xfd; if (!trig) return; const k = hxA(pcL); if (!midRowLandings.has(k)) midRowLandings.set(k, { row: hxA(sp[0]), from: hxA(from) }); };   // v21: 피호출자가 돌아오는 갈래가 하나도 없으면(전부 43) 호출자도 끝난다
  const snapForward = (a) => {                       // 착지가 op 경계 밖이면 다음 경계로 (계정 경로만)
    if (LAZY) return -1;
    let lo = 0, hi = offs.length - 1, r = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (offs[m] >= a) { r = m; hi = m - 1; } else lo = m + 1; }
    return r < 0 ? -1 : offs[r];
  };

  const balloons = []; let curB = null; const unknownGates = []; const hijacks = [];
  calledEvents.add(eventId);   // 자기 호출 차단 — 0x0002 「00 02」 사슬이 자기 자신을 다시 걸어 첫 풍선에 줄이 겹쳐 쌓였다(2026-09-02 실측)
  const evKey = evName(eventId);
  // openTail: 이 경로에서 마지막으로 열린 채 남은 문안 꼬리(이벤트 경계·호출을 넘어 흐른다). null = 창 닫힘/없음.
  let openTail = (inherit && inherit.open) ? (inherit.tail || '') : null; let endState = null;
  if (inherit && inherit.open && inherit.balloon && !inherit.balloon.residual) curB = inherit.balloon;   // 호출자/앞 계정의 열린 창을 그대로 이어 쓴다(옛 크기 유지)
  const initialMode = STATE?.wram?.[0xD599];
  const initialGeometry = Number.isInteger(initialMode) && initialMode >= 0 && initialMode <= 3
    ? { ...sizeRecord(initialMode * 8), src: 'state-D599', setAt: null, setEvent: evKey,
        sizeIndex: initialMode * 8, stateAddress: '7E:D599', mode: initialMode, depth }
    : { cols: 14, rows: 4, src: 'default', setAt: null, setEvent: evKey, sizeIndex: 0, depth };
  let geom = geomIn || initialGeometry;  // 창 op 전 기본 창 = 14x4 (0x0007·0x000B 실기); 호출자 기하 상속
  let openPc = inherit?.balloon?.openAt ? parseInt(inherit.balloon.openAt, 16) : 0; let curFork = !!inherit?.balloon?.fork; let pendingJoin = null;
  let branchId = 0, nextBranchId = 0, nextWindowInstance = 0;
  let currentIndirectAssumptions=[];
  // Native D5A7 + slot: each open window owns its cursor and geometry.
  // 28/29 select an existing slot; 3C replaces only its addressed slot.
  let activeSlot = inherit?.balloon?.window?.slot ?? 64;
  let slotWindows = new Map(curB ? [[activeSlot, curB]] : []);
  const open = (slot = 64, selectedGeometry = geom) => {
    if(journal && slotWindows.has(slot)) journal.seal(slotWindows.get(slot), branchId, decisionTail, 'window-replaced', flowPc);
    activeSlot = slot; openTail = '';
    curB = { texts: [], segs: [], jpMiss: 0, window: { ...selectedGeometry, slot },
      instanceId: ++nextWindowInstance, openAt: openPc.toString(16).toUpperCase(),
      fork: curFork, branchId, ownerEvent: evKey, contextEvent: currentRootEvent,
      glyphTokens: [], layoutControls: [], reselects: [], unresolvedTokens: [], layoutHolds: [], potentialEvictions: [], evictions: [] };
    // C0:1241 compares the new outer rectangle with every active slot.
    // Only special indices >=20 have explicit XY unaffected by actor relocation.
    for (const [otherSlot, previous] of slotWindows) {
      if (otherSlot === slot) continue;
      const overlap = nativeWindowOverlap(curB.window.rect, previous.window.rect);
      if (overlap === true) { journal?.seal(previous,branchId,decisionTail,'window-overlap-close',flowPc); slotWindows.delete(otherSlot); curB.evictions.push({ slot: otherSlot, at: curB.openAt, rule: 'C0:1241-inclusive-rectangle' }); }
      else if (overlap === null) { previous.potentialEvictions ||= []; previous.potentialEvictions.push({ at: curB.openAt, slot, kind: 'actor-camera-window-overlap-unresolved' }); }
    }
    if (pendingJoin) { curB.joinFrom = pendingJoin; pendingJoin = null; }
    slotWindows.set(slot, curB); balloons.push(curB);
  };
  const selectWindow = slot => {
    activeSlot = slot; curB = slotWindows.get(slot) || null;
    openPc = curB ? parseInt(curB.openAt, 16) : 0;
    openTail = curB ? curB.texts.join('').slice(-40) : null;
  };
  const closeWindow = () => {
    journal?.seal(slotWindows.get(activeSlot),branchId,decisionTail,'window-close',flowPc);
    slotWindows.delete(activeSlot);
    selectWindow([0, 64, 128, 192].find(slot => slotWindows.has(slot)) ?? 0);
  };
  const closeAllWindows = () => { for(const b of slotWindows.values()) journal?.seal(b,branchId,decisionTail,'all-windows-close',flowPc); slotWindows.clear(); selectWindow(0); };
  const noteUnresolved = warning => {
    decoderWarnings.push(warning);
    if (!curB) open();
    curB.unresolvedTokens.push(warning);
  };
  // segs: 조각마다 [소스 pc, 문안] — 화면에서 찾은 결함을 그 행으로 바로 되짚기 위해 남긴다(2026-09-03).
  const emit = (ko, at, segments = null, layoutControls = null) => {
    if(currentMacroRecord){
      const m=currentMacroRecord;currentMacroRecord=null;
      m.branchId=branchId;m.afterGlyph=traceTail;m.conditionTail=decisionTail;
      m.windowInstance=curB?.instanceId??null;m.textIndex=curB?.texts.join('').length??0;m.textLength=typeof ko==='string'?ko.length:0;
      m.symbol=m.complete?null:`⟪변수:${m.opcode.toString(16).toUpperCase()} ${m.arguments.map(x=>x.toString(16).padStart(2,'0')).join(' ')}@${m.at}⟫`;
      if(curB){curB.runtimeTerms ||= [];curB.runtimeTerms.push({...m});}
    }
    if (!curB) {
      // An inactive window is created by its first glyph, not 24/2C. The
      // opening routine resets the cursor, discarding preceding cursor edits.
      const prefix=typeof ko==='string'?(ko.match(/^[\n\f]+/)||[''])[0]:'';
      if(prefix){inactiveControls.push({at:hxA(at),controls:prefix});ko=ko.slice(prefix.length);
        if(segments){let cut=prefix.length;segments=segments.map(g=>{const n=Math.min(cut,g[1].length);cut-=n;return [g[0],g[1].slice(n),...g.slice(2)];}).filter(g=>g[1]);}}
      if(!ko)return;
      open();
    }
    for(const assumption of currentIndirectAssumptions){
      curB.runtimeTerms ||= [];curB.layoutHolds ||= [];curB.assumptions ||= [];
      if(!curB.assumptions.includes(assumption.kind))curB.assumptions.push(assumption.kind);
      if(!curB.runtimeTerms.some(t=>t.kind==='indirect-active-record-assumption'&&t.recordIndex===assumption.recordIndex&&t.at===assumption.at))
        curB.runtimeTerms.push({kind:'indirect-active-record-assumption',at:assumption.at,callAt:assumption.callAt,recordIndex:assumption.recordIndex,
          complete:true,assumptions:[assumption]});
      if(!curB.layoutHolds.some(h=>h.kind==='indirect-active-record-reachability-unproved'&&h.recordIndex===assumption.recordIndex&&h.at===assumption.at))
        curB.layoutHolds.push({kind:'indirect-active-record-reachability-unproved',at:assumption.at,callAt:assumption.callAt,
          recordIndex:assumption.recordIndex,constraint:assumption.constraint});
    }
    if(currentTextIssues?.length){curB.unresolvedTokens.push(...currentTextIssues.map(x=>({...x,textIndex:curB.texts.join('').length})));currentTextIssues.length=0;}
    if (curB.potentialEvictions?.length) {
      curB.layoutHolds ||= [];
      for (const h of curB.potentialEvictions) if (!curB.layoutHolds.some(x => x.at === h.at && x.slot === h.slot)) curB.layoutHolds.push({ ...h, resumedAt: hxA(at) });
    }
    if (curB.at === undefined && at !== undefined && at !== null) { curB.at = hxA(at); const o = byOff.get(at); curB.jp = (o && o.kind === 'text') ? (o.text || '') : ''; }
    if (ko === null) return;   // 빈 해독은 여기서 세지 않는다 — 텍스트 op 쪽에서 피복 여부로 가른다(v4)
    const controlBase=curB.texts.join('').length;
    if(layoutControls?.length) for(const c of layoutControls){
      if(!Number.isInteger(c.index)||c.index<0||c.index>(typeof ko==='string'?ko.length:0))throw new Error('decoded layout control index outside emitted text');
      curB.layoutControls.push({...c,index:controlBase+c.index});
    }
    if (ko) {
      if (process.env.WALK_TRACE_EMIT === '1') console.error(`    emit@${hxA(at)} b#${balloons.indexOf(curB)} ${JSON.stringify(ko).slice(0, 24)}`);
      if (curB.pendingJoin) { const lead = ko.replace(/^[ ␣]+/, ''); if (/^[\n\f]/.test(lead)) delete curB.pendingJoin; else if (/[^\s]/.test(lead)) { curB.joinFrom = curB.pendingJoin; delete curB.pendingJoin; } }
      openTail = ((openTail || '') + ko).slice(-40);
      if(TRACE_GLYPHS){
        const count=[...ko].filter(c=>c!=='\n'&&c!=='\f').length;
        const glyphTokCount=TRACE_NL?currentGlyphTokens.filter(t=>t.sourceKind!=='newline').length:currentGlyphTokens.length;
        if(count!==glyphTokCount)curB.layoutHolds.push({kind:'glyph-trace-count-mismatch',at:hxA(at),expected:count,recorded:currentGlyphTokens.length});
        let index=curB.texts.join('').length,ti=0;
        for(const ch of ko){if(ch==='\n'&&TRACE_NL){const tn=currentGlyphTokens[ti];if(tn&&tn.sourceKind==='newline'){ti++;curB.glyphTokens.push({...tn,textIndex:index});}index+=ch.length;continue;}
        if(ch!=='\n'&&ch!=='\f'){if(TRACE_NL){while(currentGlyphTokens[ti]&&currentGlyphTokens[ti].sourceKind==='newline')ti++;}const t=currentGlyphTokens[ti++];if(t){curB.glyphTokens.push({...t,textIndex:index});
          if(traceNodes.length<200000){traceNodes.push({parent:traceTail,slot:t.slot,at:t.at,sourceAt:t.sourceAt,textIndex:index,windowInstance:curB.instanceId,balloonBranch:curB.branchId});traceTail=traceNodes.length-1;}else traceCapHit++;}}index+=ch.length;}
        currentGlyphTokens.length=0;
      }
      curB.texts.push(ko);
      if (segments && segments.length) for (const sg of segments) { if (sg[1]) curB.segs.push(sg[2] ? [sg[0], sg[1], sg[2]] : [sg[0], sg[1]]); }
      else curB.segs.push([(at === undefined || at === null) ? '' : at.toString(16).toUpperCase(), ko]);
    }
  };
  // 분기 탐색: 작업 목록의 항목 = { pc, stack(callL 복귀 주소들), lastRowEnd }
  // v14: visited = (pc | 경로 플래그 상태). pc 단위(v13 이전)는 관문 실패 갈래가 이미 지난 복귀점에 닿는 순간 죽어
  //   그 갈래만 지나는 문안이 통째로 빠졌다 — 0014: 3A0EF9 `33 86 44` 실패 갈래만 `36 86 0e`→`33 86 ee` 통과→3A0C75 이후로 가는데
  //   피호출자 복귀점이 visited 라 끊김. z42 덤프에서 걸은 이벤트 소유 3,165행 미도달의 원인. WALK_PATH_VISITED=0 이면 옛 규칙.
  //   폭주 방지: pc 마다 서로 다른 상태 WALK_PC_STATES(기본 48)개까지만 — 넘치면 pcStateCapHit 로 센다(조용히 덮지 않는다).
  const visited = new Set();
  const PATH_VISITED = process.env.WALK_PATH_VISITED !== '0';
  const PC_STATE_CAP = Number(process.env.WALK_PC_STATES || 48);
  const pcStates = new Map(); let pcStateCapHit = 0;
  // v32-static.5 (2026-09-15): 상태 상한은 (pc, 호출 복귀 스택)마다 센다. WALK_CAP_PER_CONTEXT=0 이면 옛 규칙(pc 하나에 전 호출자 합산).
  //   실측: 0x0CD0 448202 풍선의 공용 조각 0B AA 끝 2E(3CDB98)에서 옆 풍선 448284 호출자(448287)의 48 갈래가 예산을 다 먹어
  //   448202 갈래(복귀 448211)가 조각 안에서 잘렸고, 풍선은 「들 수 없다」(마침표 없음)로 textComplete 로 나갔다(실코어는 「들 수 없다.」).
  //   방문 키(sig)는 이미 복귀 스택을 담으므로 정확 상태 중복은 그대로 막히고, 예산만 호출 문맥별로 나뉜다.
  const CAP_PER_CONTEXT = process.env.WALK_CAP_PER_CONTEXT !== '0';
  // 예산 정지(상태 상한·명령 상한)로 끝난 경로에 열려 있던 풍선은 budgetCuts 에 사유를 남긴다 — 그 풍선 글은 앞부분일 수 있다.
  const BUDGET_STOPS = new Set(['pc-state-cap', 'instruction-cap', 'event-command-cap', 'physical-instruction-cap']);
  // WALK_SWEEP_SIG=1 (2026-09-07, 화면 결함 스위프용): 방문 판정 키에서 **영역 배열**(d*/g*/x*)을 뺀다.
  //   팔이 갈릴 때는 pc 가 달라서 어차피 구분되고, 팔이 **합류한 뒤**에는 남은 값 집합만 다르고
  //   화면 글자는 같다. 그런데 집합까지 키에 넣으면 그 중복이 pc 상태 상한을 먹어 다른 갈래를 밀어낸다
  //   (실측: class-fork 에서 말투 팔 10줄이 이 때문에 잘렸다). 값이 하나로 좁혀진 뒤의 구체값은 키에 남는다.
  const SWEEP_SIG = process.env.WALK_SWEEP_SIG === '1';
  const sigOf = (o) => { let ks = Object.keys(o); if (SWEEP_SIG) ks = ks.filter((k) => !/^[dgx][vep]\d+$/.test(k)); if (!ks.length) return ''; ks.sort(); return ks.map((k) => k + '=' + JSON.stringify(o[k])).join(','); };
  const markVisited = (pc, sig, semanticKey = null, callCtx = '') => {
    visitedReason = null;
    if (!PATH_VISITED) { if (visited.has(pc)) { visitedReason='address-only-prune'; return true; } visited.add(pc); return false; }
    const k = pc + '|' + sig;
    if (visited.has(k)) { visitedReason='repeated-path-state'; return true; }
    // This is an explicitly reported visit budget, NOT state equivalence.
    // Complete modeled-state identity is checked above; a budget hit remains
    // an unresolved branch, never a proof of duplicate output or infeasibility.
    const capKey=CAP_PER_CONTEXT&&callCtx?pc+'|s='+callCtx:pc;
    const n=(pcStates.get(capKey)||0)+1;
    if(n>PC_STATE_CAP){pcStateCapHit++;visitedReason='pc-state-cap';return true;}
    pcStates.set(capKey,n);visited.add(k);return false;
  };
  const startPc = (FROM_AT && depth === 0) ? Number.parseInt(FROM_AT, 16) : Number.parseInt(String(acc.entry), 16);
  // WALK_SEED_ALL=1 — **여는 op 마다 씨앗을 심는다**. 배치 검출에는 도달성이 필요 없다:
  //   말풍선의 줄 구성만 알면 되고 그건 계정 op 에 선형으로 다 있다. 진입점 하나로만 걸으면
  //   갈래를 못 타 못 보는 말풍선이 생긴다(2026-09-04 실측: 실기 결함 16곳 중 9곳 미도달).
  const rootRange = LAZY && !FROM_AT && eventId < RAW_BASE ? NOPS.rangeOf(eventId) : null;
  let boundaryReturns = 0, innerStepCapHit = 0, recursiveCallStops = 0, callDepthStops = 0;
  // class-fork(2026-09-07, 사용자 설계): 클래스를 바깥에서 8번 고정하지 않는다.
  //   변수 169 를 미지로 두면 33 a9 관문에서 기존 splitFlagDomain/pushFork 가 두 갈래를 만들고,
  //   각 풍선이 자기를 만든 값 집합(ov.dv169)을 달고 나온다.
  //   **영역은 0..15 다(0..7 아님)** — 사용자 지적 2026-09-07 「주인공이 안 타는 분기도 있어」.
  //   33 이 읽는 변수 A9($1F7B)는 주인공뿐 아니라 화자 계급 대기열($D519)로도 채워지므로
  //   주인공이 될 수 없는 값의 팔이 실재한다(실측: 「니나, 미안하군」·「니나, 미안하네」는
  //   클래스를 0..7 로 고정한 8회 주행에서 한 번도 안 나온다).
  //   WALK_CLASS_DOMAIN=0-7 로 좁힐 수 있다(주인공 한정 검사용).
  const clsDomain = (() => {
    const spec = process.env.WALK_CLASS_DOMAIN;
    if (!spec) return Array.from({ length: 16 }, (_, i) => i);
    const [lo, hi] = spec.split('-').map(Number);
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 0 || hi > 15 || lo > hi) throw new RangeError('WALK_CLASS_DOMAIN 은 lo-hi (0..15)');
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  })();
  const seedOv = ovIn ? Object.assign({}, ovIn)
    : (STATE_POLICY.name === 'class-fork' ? { v169: null, dv169: clsDomain } : undefined);
  const seedPartyActors = STATE ? Array.from({length:Math.min(6,STATE.wram[0xf319]||0)},(_,i)=>STATE.wram[0xf000+i*0x80]) : null;
  const seedSelectedRaw = STATE ? STATE.wram[0x1ffde] : 0;
  const seedIndirect = createIndirectState({partyActors:seedPartyActors,selectedActor:seedSelectedRaw?seedSelectedRaw-1:null,
    selectedActorSource:seedSelectedRaw?'state:7FFFDE-1':null});
  const work = [{ pc: startPc, end16: rootRange?.end16 ?? null, stack: [], lastRowEnd: -1, ov: seedOv, indirect:seedIndirect, indirectForkSites:[] }];
  if (process.env.WALK_SEED_ALL === '1') {
    // 창은 4D/28/29 말고 3C(specialWin)·4F 프리셋으로도 열린다 — 셋만 심으면 그 말풍선을 못 본다.
    const OPEN = new Set(['winSelf', 'winOther', 'win4D', 'specialWin', '4F_1D', '4F_1A', '4F_1B']);
    for (const o of ops) if (OPEN.has(o.note) || (o.hex || '').startsWith('3c ')) work.push({ pc: o.off, stack: [], lastRowEnd: -1, seeded: true });
  }
  const forkDisplay = () => {
    const slots = [...slotWindows].map(([slot, balloon]) => {
      const { pages, pagesExact, flags, layout, ...raw } = balloon;
      return [slot, structuredClone(raw)];
    });
    return { slots, activeSlot, geom: { ...geom }, openPc, openTail,
      pendingJoin: pendingJoin ? structuredClone(pendingJoin) : null };
  };
  let forkActiveEvent = eventId, forkEnd16 = rootRange?.end16 ?? null, forkDispatchBase = rootRange?.nativeEvent ?? null;
  let currentIndirectState = null, currentIndirectForkSites = new Set(), currentChoiceContext=null;
  const pushFork = (state) => {
    if (!Object.hasOwn(state,'indirect') && currentIndirectState) state.indirect=cloneIndirectState(currentIndirectState);
    if (!Object.hasOwn(state,'indirectForkSites')) state.indirectForkSites=[...currentIndirectForkSites];
    if (!Object.hasOwn(state,'indirectAssumptions')) state.indirectAssumptions=currentIndirectAssumptions.map(x=>({...x}));
    if (!Object.hasOwn(state,'choiceContext')) state.choiceContext=currentChoiceContext?{...currentChoiceContext}:null;
    const next={ activeEvent:forkActiveEvent,end16:forkEnd16,dispatchBase:forkDispatchBase,decisionTail,...state,traceTail,branchId:++nextBranchId,display:forkDisplay(),balloonTail:journal?.tail??-1 };
    journal?.fork({fromBranch:branchId,toBranch:next.branchId,at:flowPc,decisionTail:next.decisionTail,balloonTail:next.balloonTail});
    work.push(next);
  };
  let steps = 0;
  const STEP_CAP = Number(process.env.WALK_STEPS || (process.env.WALK_SEED_ALL === '1' ? 200000 : 20000));
  while (work.length && steps++ < STEP_CAP) {
    const st = work.pop();traceTail=st.traceTail??-1;decisionTail=st.decisionTail??-1;
    if(journal)journal.tail=st.balloonTail??-1;
    let dispatchBase = Object.hasOwn(st,"dispatchBase") ? st.dispatchBase : rootRange?.nativeEvent ?? (STATE ? STATE.wram[0xD51B]|STATE.wram[0xD51C]<<8 : null);let traceStop="unresolved-or-pruned";
    let { pc, lastRowEnd } = st; const stack = st.stack.slice(); let optN = st.optN || 0; let activeEvent = st.activeEvent ?? eventId; let end16 = st.end16 ?? null;   // v16: 25 뒤 26 개수(선택지 arity) — 경로 상태
    const ov = Object.assign({}, st.ov || {}); const scratch = Object.assign({}, st.scratch || {}); let ovSig = ''; let ovDirty = true;
    currentIndirectState=st.indirect?cloneIndirectState(st.indirect):createIndirectState({ef:scratch,partyActors:seedPartyActors,selectedActor:seedSelectedRaw?seedSelectedRaw-1:null,selectedActorSource:seedSelectedRaw?'state:7FFFDE-1':null});
    currentChoiceContext=st.choiceContext?{...st.choiceContext}:null;
    currentIndirectForkSites=new Set(st.indirectForkSites||[]);
    currentIndirectAssumptions=(st.indirectAssumptions||[]).map(x=>({...x}));
    const syncIndirectScratch=()=>{for(let i=0;i<0x100;i++){const v=currentIndirectState.ef[i];if(v===null)delete scratch[i];else scratch[i]=v;}};
    currentTextContext={state:STATE,scratch,protagonistNameId:(process.env.WALK_PROTAG_NAME==='max'?'max':(STATE_POLICY.name==='class-probe'?(NAME_ID_BY_CLASS[cls]??null):null))};currentTextIssues=[];currentGlyphTokens=[];   // 경로별 플래그 덮어쓰기·EF00 스크래치 · 프로브 주인공의 4A 이름 번호(F300 갈래 판정용)
    curFork = !!st.fork || !!inherit?.balloon?.fork;
    branchId = st.branchId || 0;
    if (st.display) {
      geom = st.display.geom; openPc = st.display.openPc;
      openTail = st.display.openTail; pendingJoin = st.display.pendingJoin;
      slotWindows = new Map(st.display.slots);
      activeSlot = st.display.activeSlot;
      for (const b of slotWindows.values()) { b.fork = true; b.branchId = branchId; balloons.push(b); }
      curB = slotWindows.get(activeSlot) || null;
    } else if (st.fork || st.seeded) { slotWindows.clear();selectWindow(0); }

    let inner = 0;
    const eventBudget=EVENT_STEP_BUDGET?createEventStepBudget(PATCH.contextualText?.entries||[]):null;
    while (eventBudget?eventBudget.next():inner++ < 4000) {
      flowPc=pc;
      forkActiveEvent = activeEvent; forkEnd16 = end16; forkDispatchBase = dispatchBase;
      // 조각 안: 유계 끝에 닿으면 호출자로 복귀. 조각은 한 이벤트 안에서 여러 번 불리므로 visited 에 넣지 않는다.
      const fragTop = stack.length ? stack[stack.length - 1] : null;
      if (fragTop && fragTop.fragEnd !== undefined && (pc>>>16)===(fragTop.fragEnd>>>16) && pc >= fragTop.fragEnd) { const r = stack.pop(); pc = r.ret; lastRowEnd = r.lastRowEnd; if (r.eventFrom !== undefined) activeEvent = r.eventFrom; if (Object.hasOwn(r, "end16")) end16 = r.end16; continue; }
      const inFrag = !!(fragTop && fragTop.fragEnd !== undefined);
      // Actual scheduler samples at C0:1BB6 have P.M=1, so A5/C5 compare
      // DP78==DP7B then DP79==DP7C.  The bank bytes DP7A/DP7D are not read.
      if (!inFrag && end16 !== null && (pc & 0xffff) === end16) {
        boundaryReturns += 1;
        if (stack.length) {
          const r = stack.pop(); pc = r.ret; lastRowEnd = r.lastRowEnd;
          if (r.eventFrom !== undefined) activeEvent = r.eventFrom;
          if (Object.hasOwn(r, 'end16')) end16 = r.end16;
          continue;  // native 3756: restore frame, NOT the window or cursor
        }
        retPaths += 1;traceStop="native-block-return";
        if (!endState) endState = { tail: null, balloon: null, geom: { ...geom } };
        break;
      }

      if (!inFrag) {
        if (ovDirty) { ovSig=sigOf(ov);ovDirty=false; }
        const stateKey=DISTINCT_STATES?executionStateKey({ov,scratch,end16,stack,activeEvent,dispatchBase,optN,choiceContext:currentChoiceContext,lastRowEnd,geom,activeSlot,openPc,openTail,pendingJoin,slots:slotWindows}):null;
        // WALK_MERGE_BRANCHES=1 (2026-09-07, 제안 3항 「branchId 같은 관리 번호는 상태와 분리」): 방문 키에서 갈래 번호를 뺀다.
        //   같은 주소·같은 모델 상태(플래그 오버레이·스크래치·스택·창)에 다른 갈래가 도착하면 다시 걷지 않고 연결한다.
        //   실측 전: 키에 b= 가 있어 갈래끼리 절대 합쳐지지 않아(repeated-path-state 408) 경로 592만 중 69% 가 상한에서 잘렸다.
        const bTag=process.env.WALK_MERGE_BRANCHES==='1'?'':'|b='+branchId;
        const indSig='|ind='+indirectStateKey(currentIndirectState)+'|ifs='+[...currentIndirectForkSites].sort().join(',')
          +'|ia='+currentIndirectAssumptions.map(x=>`${x.at}:${x.recordIndex}`).join(',');
        const choiceSig='|opt='+optN+'|choice='+(currentChoiceContext?`${currentChoiceContext.contractId}:${currentChoiceContext.producerSeen?1:0}:${currentChoiceContext.resetSeen?1:0}`:'none');
        const sig=stateKey!==null?stateKey+indSig+choiceSig+bTag:ovSig+'|m='+sigOf(scratch)+'|e='+end16+'|s='+stack.map(f=>f.ret).join(',')+indSig+choiceSig+bTag;
        if(markVisited(pc,sig,stateKey,stack.map(f=>f.ret).join(','))){traceStop=visitedReason;break;}
      }
      // A contextual lookup reads the native saved return frames at this
      // instant. Never cache its result by source address alone. Conditional
      // 33-to-low-event tail transfers keep this stack, as the CPU does.
      const paddingSpan=NOPS.layoutSpanAt(pc);
      if(paddingSpan){
        const live=curB?.window;
        const liveKnown=!!live&&(PATH_CONFIRMED.has(live.src)||(live.src==='default'&&DEFAULT_CONFIRMED))
          &&live.cols>0&&live.cols<=32&&live.rows>0&&!(curB.layoutHolds?.length)&&!(curB.unresolvedTokens?.length);
        const placement=liveKnown?layoutBalloon(curB.texts,live,curB.layoutControls||[]):null;
        const decision=nativePaddingDecision({token:paddingSpan,pc,end16,inFragment:inFrag,
          layoutKnown:liveKnown&&!placement.holds.length});
        if(decision.status==='HOLD_NATIVE_PADDING_DISPATCH'){
          const warning={...decision,kind:decision.status,at:hxA(pc),activeEvent,branchId,
            cursor:placement?.cursor??null,stack:stack.map(f=>({ret:f.ret,end16:f.end16??null})),
            interpretation:'unproved advancement, not a confirmed ROM defect or native return'};
          noteUnresolved(warning);curB.layoutHolds.push(warning);unknownStops.push(pc);
          traceStop=decision.status;break;
        }
      }
      const contextualOp = NOPS.contextualDispatch?.bySource.has(pc)
        ? NOPS.contextualOpAt(pc,stack.map(f=>f.eventFrom !== undefined ? f.ret : null)) : null;
      let op = contextualOp || byOff.get(pc);
      if (!op && LAZY) { unknownStops.push(pc);traceStop="unsupported-opcode"; break; }
      if(eventBudget&&op&&!eventBudget.accept(op)){traceStop='event-command-cap';break;}
      // A redirect returns to the VM dispatcher without consuming the destination.
      // In particular commands inside an arena are NOT swallowed as text.
      if (op.kind === 'redirect') {
        if (op.target===null) {unknownStops.push(pc);traceStop='non-rom-stream-target';break;}
        pc=op.target; lastRowEnd=-1; continue;
      }
      if (op.kind === 'nop') {pc=op.off+op.len;continue;}
      // Registered authored-padding markers consume ROM bytes but have no glyph
      // width of their own.  Keep their placement at the current emitted index;
      // layout owns the live-column-dependent advance/elision.
      if (op.kind === 'layout') {
        if (op.note !== 'adaptive-padding' || op.layout?.kind !== 'adaptive-padding') throw new Error(`unrecognized zero-width candidate token @${hxA(op.off)}`);
        emit('', op.off, null, [{ kind: 'adaptivePadding', index: 0, at: hxA(op.off), source: hxA(op.layout.source), arena: hxA(op.layout.arena), back: hxA(op.layout.back), markerEnd: hxA(op.layout.markerEnd),...(op.layout.soft?{soft:true,suffixHalfCells:op.layout.suffixHalfCells,...(op.layout.zeroSeparator?{zeroSeparator:true}:{}),...(op.layout.strictFit?{strictFit:true}:{})}:{}) }]);
        pc=op.off+op.len;lastRowEnd=-1;continue;
      }
      if (op.kind === 'glyph') {
        const text=glyphText(op.slot,op.off,op.off);
        const controls=op.layout?.kind === 'conditional-skip-line-start'
          ? (()=>{if(text!==' ')throw new Error(`conditional padding is not a space @${hxA(op.off)}`);return [{kind:'skipSpaceIfLineStart',index:0,at:hxA(op.off),source:hxA(op.layout.source),back:hxA(op.layout.back),
              ...(op.layout.requiredCols===undefined?{}:{requiredCols:op.layout.requiredCols}),nativeHalfPhase:op.layout.nativeHalfPhase,
              modelAssumption:op.layout.modelAssumption||'half-cell layout column 0 corresponds to native line-start phase'}];})()
          : null;
        emit(text,op.off,null,controls); pc=op.off+op.len;lastRowEnd=-1;continue;
      }
      if (op.note === 'pad') { padStops += 1; traceStop='pad-stop';break; }   // v16: `00 00` 채움 — 계정 추적기와 같이 흐름 종료(이벤트 0 호출이 아니다)   // v16: 길이를 모르는 op(0D 20·미지 4F 부호)·롬 밖 — 경로 종료, 세어 둔다
      if (!op) {                                    // 경계 밖 착지
        const evNext = entryEventAt(pc);           // 계정 경계 낙수 — 다음 계정의 entry 로 그대로 흘러든다(창·꼬리 상태 유지)
        if (evNext !== undefined && evNext !== eventId && !inFrag && depth < CALL_DEPTH && !calledEvents.has(evNext)) {
          calledEvents.add(evNext);
          const sub = walkEvent(evNext, cls, depth + 1, calledEvents, geom, { open: openTail !== null, tail: openTail, balloon: curB }, ov);
          for (const [k, v] of (sub.headOnOperandMap || new Map())) if (!headOnOperand.has(k)) headOnOperand.set(k, v);   // v24: 피호출 걷기의 검출도 호출자에 모은다
          for (const [k, v] of (sub.midRowLandingsMap || new Map())) if (!midRowLandings.has(k)) midRowLandings.set(k, v);
          for (const w of (sub.decoderWarnings || [])) decoderWarnings.push(w);
          const subs = (sub.balloons || []).filter((b) => b !== curB);
          if (curB && subs.length && !subs[0].residual && subs[0].openAt === '0') { const subB=subs[0],offset=curB.texts.join('').length; for (const t of subB.texts) curB.texts.push(t); for (const c of (subB.layoutControls || [])) curB.layoutControls.push({...c,index:offset+c.index}); for (const g of (subB.segs || [])) curB.segs.push(g); curB.jpMiss += subB.jpMiss || 0; subs.shift(); }
          for (const b of subs) { b.fallThroughFrom = b.fallThroughFrom || evKey; balloons.push(b); }
          if (sub.geom) geom = sub.geom;
          if (!endState) endState = { tail: sub.endTail ?? null, balloon: sub.endBalloon || null };
          break;
        }
        const n = snapForward(pc);
        if (n < 0 || n - pc > 0x40) break;          // 멀면 진짜 이탈
        // 엔진은 스냅하지 않는다 — 착지점부터 바이트를 글자로 읽는다. 그 어긋난 런이
        //   실기 괴문자의 한 부류다(0x008B 「타바휴백라우」·0x0478 실측: 계정서는 명령으로
        //   분류한 자리를 화면이 타이핑). 스냅으로 숨기지 말고 해독해 방출한다.
        const d = decKoWithSegments(pc, n, pc >> 16);
        const mis = d.text;
        for (const g of d.segments) if (g[2] === 'raw') g[2] = 'landing';
        if (mis && /[가-힣]/.test(mis)) emit(mis, pc, d.segments, d.controls);
        pc = n; op = byOff.get(pc);
        if (markVisited(pc, ovSig)) break;
      }
      // Native text grouping must not swallow the block-end check between glyphs.
      if (op.kind === 'text' && !inFrag && end16 !== null) {
        const stop = (pc & 0xff0000) | end16;
        if (pc < stop && op.off + op.len > stop) op = { ...op, len: stop - op.off };
      }
      const end = op.off + op.len;
      noteOperandHeads(op);
      if(EV0153_CHOICE_CONTRACT.proven&&activeEvent===0x0153&&op.off===EV0153_CHOICE_CONTRACT.eventStart&&op.hex==='0d 14')
        currentChoiceContext={contractId:EV0153_CHOICE_CONTRACT.id,producerSeen:true,resetSeen:false};
      if (op.note === 'optA') {
        optN = 0;
        currentChoiceContext=(EV0153_CHOICE_CONTRACT.proven&&activeEvent===0x0153&&op.off===EV0153_CHOICE_CONTRACT.reset&&currentChoiceContext?.producerSeen)
          ?{...currentChoiceContext,resetSeen:true}:null;
      }
      else if (op.note === 'optB') {
        const advanced=advanceChoiceCount(rom,op.off,optN,{contractActive:currentChoiceContext?.contractId===EV0153_CHOICE_CONTRACT.id&&currentChoiceContext?.resetSeen===true});
        if(advanced.status!=='advanced'){
          const stop={at:hxA(op.off),count:optN,reason:advanced.reason,contractId:advanced.contractId,
            maxRepeatedCount:advanced.maxRepeatedCount,maxTotalCount:advanced.maxTotalCount};
          choiceStops.push(stop);unknownStops.push(op.off);traceStop=`choice-boundary-hold:${advanced.reason}`;break;
        }
        optN=advanced.count;
      }
      if (process.env.WALK_TRACE === '1' && steps < Number(process.env.WALK_TRACE_MAX || 60))
        console.error(`  ${op.off.toString(16)} ${op.kind} ${op.note || ''} ${String(op.hex || '').slice(0, 14)}`);
      if (op.kind === 'text') {
        if (op.off >= lastRowEnd) {
          lastShadowResume = 0;
          const d = decKoWithSegments(op.off, end, op.off >> 16);
          emit(d.text || null, op.off, d.segments, d.controls);   // 화면 = 구운 바이트의 해독
          lastRowEnd = Math.max(end, lastShadowResume);
          if (process.env.WALK_TRACE === '1') console.error(`    → resume ${lastShadowResume.toString(16)} end ${end.toString(16)}`);
        }
        // 덮인 행 안이면 행 끝(=아레나 복귀점)으로, 아니면 op 끝으로. 이전엔 stale lastShadowResume(피호출 뱅크의 복귀점)을
        //   써서 콜 리턴 직후 첫 글자 op 에서 경로가 죽었다(0x0020 3A0F21 실측 → 「니나라고 합니다」 C부류 626의 뿌리).
        pc = Math.max(end, lastRowEnd); continue;
      }
      const note = op.note || '';
      // 그림자 훅 하이재킹 — 트리거 행이 명령 **피연산자** 바이트 위에 서 있으면, 엔진이
      //   그 피연산자를 읽는 순간 훅이 울려 아레나를 타이핑하고 e16 으로 복귀한다. 그 뒤
      //   커서는 타이핑 상태라 복귀점부터의 바이트를 글자로 읽는다(0x008B 「휴백라우」·
      //   0x03FC 호출표 타이핑 실측, 규칙 정밀도 22% vs 대조군 5%). 실기만 보던 커서
      //   부류를 여기서 예측한다.
      const HIJACK_OK = /^(callL|op0[0-9a-c]|syscall|skip|chkFlag|4F_3B)$/i.test(note);
      if (false && op.kind !== 'text' && process.env.WALK_HIJACK !== '0' && HIJACK_OK) {
        for (let q = op.off + 1; q < end; q += 1) {
          const sh = shadowD.get(q);
          if (sh === undefined) continue;
          const arenaSegs = [];
          const arena = decKo(sh[0], (sh[0] & 0xff0000) + 0x10000, q >> 16, 1, arenaSegs, q);
          if (arena) emit(arena, op.off, arenaSegs);
          const resume = (q & 0xff0000) | sh[1];
          const SPILL_OK = HIJACK_OK && process.env.WALK_SPILL === '1';   // v11 기본 OFF: 복귀점부터 0x18 바이트 선형 해독은 게이트·스킵을 무시해 모든 팔을 한 풍선에 쏟는다(0x0A88 「개발 중야입니다」). 실기 증거 종류(0x008B callL·0x0CC6 skip)라도 옵트인
          const spillDecoded = SPILL_OK ? decKoWithSegments(resume, resume + 0x18, q >> 16) : { text: '', segments: [] };
          const spill = spillDecoded.text;
          for (const g of spillDecoded.segments) if (g[2] === 'raw') g[2] = 'spill';
          if (spill && /[가-힣]/.test(spill)) emit(spill, op.off, spillDecoded.segments);
          hijacks.push(op.off);
          pc = resume; break;
        }
        if (pc !== op.off && hijacks.length && hijacks[hijacks.length - 1] === op.off) continue;
      }
      // 게이트 = 33(chkFlag) 뿐 아니라 롬의 모든 검사 op(chkBit 7,645·chkMem 5,362·chk4 3,397·op49 검사 2,800건).
      // 이전엔 33만 게이트라 나머지 검사 뒤의 4E 스킵을 무조건 타서 경로 뒤 구간이 통째로 사라졌다(0x0CAC 446637..4466FF 실측).
      // v15: 계정 추적기(rs3steam/account_bokuno_event_v1.py)와 같은 검사 op 집합 — 42 getItem·0D 07/09 파티 검사·4F 0F·41 01 뒤 4C(aurum)도
      //   실패 시 고정 2바이트 건너뜀. 이전엔 0D 09 뒤 `4e 02` 를 무조건 타서 실패 팔(2E 복귀)이 없었고, 그 결과 0C53 의 계수 변수 ad 가
      //   항상 같은 값이라 `33 ad 33` 뒤 447D40~ 블록(119행)이 z42 덤프에 없었다.
      const hb0 = String(op.hex || '').split(' ').map((x) => Number.parseInt(x, 16));
      // v19: 저자 메모 — 0D 0F XX 창고에 아이템 없으면 2바이트 무시; rs3_vm CONTROL_4F_SKIP_REF(21/32/42/56)는 뒤 2바이트 참조를 조건부로 건너뛴다.
      const extraGate = hb0[0] === 0x42 || (hb0[0] === 0x0d && (hb0[1] === 0x07 || hb0[1] === 0x09 || hb0[1] === 0x0f || hb0[1] === 0x10 || hb0[1] === 0x3c || hb0[1] === 0x3d))
        || (hb0[0] === 0x4f && (hb0[1] === 0x0f || hb0[1] === 0x21 || hb0[1] === 0x32 || hb0[1] === 0x42 || hb0[1] === 0x56))
        || (hb0[0] === 0x4c && op.off >= 4 && rom[op.off - 4] === 0x41 && rom[op.off - 3] === 0x01);
      if (/^(chkFlag|chkBit|chkMem|chk4|chk01|op49_00_check|op49_01_bitcheck)$/.test(note) || extraGate) {
        const o = note === 'chkFlag' ? (op.operand || {}) : {};
        // 실패 착지: 33 은 다음 op 하나 건너뜀(기존 실측). 34/45/0D00/49 는 **고정 2바이트** 건너뜀 —
        //   0x0018 사라 실기 페치: 3A10E2 `34 ae 01` 다음 페치가 3A10E7(29·2E 두 op 를 한꺼번에 넘음).
        //   4E NN(2바이트)이 뒤따르는 흔한 자리에선 두 규칙이 같아 이제껏 안 드러났다. WALK_GATE2=0 이면 옛 규칙.
        // v16: 33 도 **고정 2바이트** 건너뜀. 실측: 7BA72A `33 a9 47 / しら？` 거짓 경로가 7BA72F(？)에 착지(메모리 rs3-33-arm-tail-rows ⑥) —
        //   op 경계와 무관하게 +2. 옛 '다음 op 하나' 규칙은 다음 op 가 2바이트(4e NN)일 때만 우연히 같았고, `33 xx xx / 2e / 2e` 보호문(롬 4,310곳)과
        //   `33 a9 XX / 글리프 / 2e` 팔 사슬(5,000곳+)에서 실패 갈래를 전부 죽였다(z42 덤프 'endMes 뒤 미도달 3,530행'의 원인). WALK_GATE33=op 이면 옛 규칙.
        const failPc = (() => {
          if (note === 'chkFlag' && process.env.WALK_GATE33 === 'op') { const n = byOff.get(end); return n ? n.off + n.len : null; }
          if (process.env.WALK_GATE2 !== '0') return end + 2;
          const n = byOff.get(end); return n ? n.off + n.len : null;
        })();
        let pass = null;
        const oo = op.operand || {};
        const hx = String(op.hex || '').split(' ').map((x) => Number.parseInt(x, 16));
        const space=oo.space==='flag.vanilla'?'v':oo.space==='flag.ext'?'e':oo.space==='flag.packed4'?'p':null;
        if(space&&oo.id!==undefined){
          const opts=flagOptions(space,oo.id,cls,ov),key=space+oo.id;
          const dom=(space==='v'&&ENGINE_SET_FLAGS.has(oo.id)&&STATE_POLICY.name!=='preserve-party'&&!Object.hasOwn(ov,key)&&!Object.hasOwn(ov,'d'+key))?Array.from({length:16},(_,i)=>i):flagDomain(opts);
          const mask=oo.mask??((oo.window??15)&15),bit=['chkBit','chk01','op49_01_bitcheck'].includes(note);
          const invert=note==='chkBit'?!!((oo.window??0)&128):!!oo.invert;
          const low=note==='op49_00_check'?(oo.window??0)>>4:oo.rangeStart??0;
          const high=note==='op49_00_check'?(oo.window??0)&15:oo.rangeEnd??15;
          const predicate={kind:bit?'bit':'range',mask,invert,low,high};
          const {yes,no}=splitFlagDomain(dom,predicate);
          const d={kind:'flag-test',at:hxA(op.off),hex:op.hex,space,id:oo.id,predicate,before:dom};
          if(!yes.length&&!no.length){traceStop='infeasible-flag-domain';break;}
          if(yes.length&&no.length){
            unknownGates.push(op.off);
            const failOv={...ov};constrainFlag(failOv,key,no);
            const edge=gateSuccessor(rom,failPc,hx[0],NOPS);
            if(edge.pc===null){unknownStops.push(op.off);}else
            pushFork({pc:edge.pc,...(edge.tail?{activeEvent:edge.nativeEvent,dispatchBase:edge.nativeEvent,end16:edge.range.end16}:{}),stack:stack.slice(),lastRowEnd,fork:true,optN,ov:failOv,scratch:{...scratch},decisionTail:decision(decisionTail,{...d,pass:false,values:no})});
          }
          const values=yes.length?yes:no,passed=!!yes.length;
          constrainFlag(ov,key,values);ovDirty=true;
          decisionTail=decision(decisionTail,{...d,pass:passed,values});
          const edge=gateSuccessor(rom,passed?end:failPc,hx[0],NOPS);
          if(edge.pc===null){unknownStops.push(op.off);traceStop='unresolved-gate-tail';break;}
          pc=edge.pc;if(edge.tail){activeEvent=edge.nativeEvent;dispatchBase=edge.nativeEvent;end16=edge.range.end16;lastRowEnd=-1;}
          if(!passed)noteLanding(pc,op.off);continue;
        } else if(note==='chkMem'&&hx.length>=3&&STATE){
          const aa=hx[1],nn=hx[2],lo=scratch[aa],hi=scratch[aa+1];
          if(Number.isInteger(lo)&&Number.isInteger(hi)&&!scratch.__nativeMemoryInvalidated){const addr=(hi<<8)|lo;pass=STATE.wram[addr]===nn;}
        }
        if (pass !== null) {
          decisionTail=decision(decisionTail,{kind:'concrete-memory-test',at:hxA(op.off),hex:op.hex,pass});
          const edge=gateSuccessor(rom,pass?end:failPc,hx[0],NOPS);
          if(edge.pc===null){unknownStops.push(op.off);traceStop='unresolved-gate-tail';break;}
          pc=edge.pc;if(edge.tail){activeEvent=edge.nativeEvent;dispatchBase=edge.nativeEvent;end16=edge.range.end16;lastRowEnd=-1;}
          continue;
        }
        // 경로 일관성(v10): 같은 변수의 미지 게이트는 한 경로에서 하나의 값만 가진다 — 통과 가정 구간(g)·실패 배제 구간(x)을 경로에 싣는다.
        //   33 사슬의 팔이 한 풍선에 전부 쌓이던 과잉 생성(0x08CF 「이름이 뭐냐?␣성함은?␣이름이 뭐야?」)이 여기서 사라진다.
        const gkey = (note === 'chkFlag' && oo.space === 'flag.vanilla') ? 'v' + oo.id : (note === 'chk4' && oo.space === 'flag.ext') ? 'e' + oo.id : (note === 'op49_00_check' && oo.space === 'flag.packed4') ? 'p' + oo.id : null;
        if (gkey) {
          const glo = note === 'op49_00_check' ? ((oo.window ?? 0) >> 4) : (oo.rangeStart ?? 0), ghi = note === 'op49_00_check' ? ((oo.window ?? 0) & 0xf) : (oo.rangeEnd ?? 15);
          const dom = ov['g' + gkey]; const xs = ov['x' + gkey] || [];
          let decided = null;
          if (dom && (ghi < dom[0] || glo > dom[1])) decided = false;
          else if (dom && glo <= dom[0] && ghi >= dom[1]) decided = true;
          else if (xs.some(([xa, xb]) => glo >= xa && ghi <= xb)) decided = false;
          if (decided !== null) { if (decided) { pc = end; } else if (failPc !== null) { pc = failPc; noteLanding(pc, op.off); } else break; continue; }
          unknownGates.push(op.off);
          const failOv = Object.assign({}, ov); failOv['x' + gkey] = xs.concat([[glo, ghi]]);
          if (failPc !== null) { noteLanding(failPc, op.off); pushFork({ pc: failPc, stack: stack.slice(), lastRowEnd, fork: true, optN, ov: failOv, scratch: Object.assign({}, scratch) }); }
          ov['g' + gkey] = dom ? [Math.max(glo, dom[0]), Math.min(ghi, dom[1])] : [glo, ghi]; ovDirty = true;
          pc = end; continue;
        }
        unknownGates.push(op.off);
        const unknownDecision={kind:'unmodeled-gate',at:hxA(op.off),hex:op.hex,feasibility:'not-established'};
        if (failPc !== null) { const edge=gateSuccessor(rom,failPc,hx[0],NOPS);if(edge.pc===null){unknownStops.push(op.off);}else pushFork({ pc: edge.pc,...(edge.tail?{activeEvent:edge.nativeEvent,dispatchBase:edge.nativeEvent,end16:edge.range.end16}:{}), stack: stack.slice(), lastRowEnd, fork: true, optN, ov: Object.assign({}, ov), scratch: Object.assign({}, scratch), decisionTail:decision(decisionTail,{...unknownDecision,pass:false}) }); }
        decisionTail=decision(decisionTail,{...unknownDecision,pass:true});
        const edge=gateSuccessor(rom,end,hx[0],NOPS);if(edge.pc===null){unknownStops.push(op.off);traceStop='unresolved-gate-tail';break;}
        pc=edge.pc;if(edge.tail){activeEvent=edge.nativeEvent;dispatchBase=edge.nativeEvent;end16=edge.range.end16;lastRowEnd=-1;}continue;                          // 분기 탐색: 통과 경로 계속 + 실패 경로 큐
      }
      if(note==='4F_16') {
        const count=rom[op.off+2];
        const alternatives=randomEventAlternatives(dispatchBase,count,end,NOPS);
        for(const a of alternatives.slice(1)) {
          const tail=decision(decisionTail,{kind:'random-event',at:hxA(op.off),count:count||256,value:a.value,baseNativeEvent:dispatchBase,targetNativeEvent:a.nativeEvent,feasibility:'RNG-outcome; frame-seed-correlation-not-modeled'});
          if(a.pc===null){unknownStops.push(op.off);const failed={branchId:++nextBranchId,tail:traceTail,glyphTail:traceTail,decisionTail:tail,stop:'unresolved-random-event-target',lastPc:hxA(op.off)};tracePaths.push(failed);journal?.failedAlternative(failed,slotWindows,branchId);continue;}
          pushFork({pc:a.pc,end16:a.range.end16,activeEvent:a.nativeEvent,dispatchBase:a.nativeEvent,stack:stack.slice(),lastRowEnd:-1,fork:true,optN,ov:{...ov},scratch:{...scratch},decisionTail:tail});
        }
        decisionTail=decision(decisionTail,{kind:'random-event',at:hxA(op.off),count:count||256,value:0,baseNativeEvent:dispatchBase,targetNativeEvent:null,feasibility:'RNG-outcome; frame-seed-correlation-not-modeled'});
        pc=end;continue;
      }
      {                                                 // 상태 쓰기 op — 이 경로의 덮어쓰기에 반영(v10: 상태 없이도 경로 로컬 값은 싣는다)
        const hx2 = String(op.hex || '').split(' ').map((x) => Number.parseInt(x, 16));
        const indirectEffect=applyIndirectCommand(baked,currentIndirectState,hx2,{at:hxA(op.off)});
        if(indirectEffect.handled)syncIndirectScratch();
        // A raw entry often starts immediately before 0D1A, so the runtime record
        // index is absent.  Fork only over ROM records whose authoritative active
        // marker is non-FF, and keep each record's memory image path-local.
        if(ENUMERATE_INDIRECT_RECORDS&&hx2[0]===0x0d&&hx2[1]===0x1a&&indirectEffect.reason==='unknown-actor-index'){
          let next=byOff.get(end);
          // 4D changes only the dialogue-window preset.  Keeping the fork at
          // `end` lets each branch execute it normally before the indirect call.
          if(next?.note==='win4D')next=byOff.get(next.off+next.len);
          if(next?.note==='callIndirect'&&stack.length<CALL_DEPTH){
            const forkSite=`${hxA(op.off)}>${hxA(next.off)}`;
            if(currentIndirectForkSites.has(forkSite)){
              addIndirectStop({at:hxA(op.off),reason:'symbolic-active-record-cycle',callAt:hxA(next.off)});
              unknownStops.push(op.off);traceStop='indirect-active-record-cycle';break;
            }
            const callBytes=String(next.hex||'').split(' ').map(x=>Number.parseInt(x,16));
            let forked=0;
            for(const recordIndex of ACTIVE_INDIRECT_RECORDS){
              const alt=cloneIndirectState(currentIndirectState);
              applyIndirectCommand(baked,alt,[0x40,hx2[2],recordIndex],{at:`symbolic-active-record@${hxA(op.off)}`});
              applyIndirectCommand(baked,alt,hx2,{at:hxA(op.off)});
              const call=applyIndirectCommand(baked,alt,callBytes,{at:hxA(next.off)}).call;
              if(call?.status!=='resolved'||call.target<0||call.target>=baked.length)continue;
              const altScratch={};for(let i=0;i<0x100;i++)if(alt.ef[i]!==null)altScratch[i]=alt.ef[i];
              const dt=decision(decisionTail,{kind:'indirect-active-record',at:hxA(op.off),callAt:hxA(next.off),recordIndex,target:call.file,
                constraint:'ROM[5E7970 + recordIndex*20] != FF'});
              const assumption={kind:'indirect-active-record-assumption',at:hxA(op.off),callAt:hxA(next.off),recordIndex,
                constraint:'ROM[5E7970 + recordIndex*20] != FF',reachability:'runtime caller selection not proved by this raw seed'};
              pushFork({pc:end,end16,stack:stack.slice(),lastRowEnd,
                fork:true,optN,ov:{...ov},scratch:altScratch,indirect:alt,indirectForkSites:[...currentIndirectForkSites,forkSite],
                indirectAssumptions:[...currentIndirectAssumptions,assumption],decisionTail:dt});forked++;
            }
            addIndirectStop({at:hxA(op.off),reason:'symbolic-active-record-fork',callAt:hxA(next.off),forks:forked,domain:ACTIVE_INDIRECT_RECORDS.length});
            traceStop='indirect-active-record-fork';break;
          }
        }
        // v15: 계정 operand(space·operation)로 변수 쓰기를 전부 반영. 아는 값이 없거나 못 푸는 연산이면 그 변수의 지식(값·통과 구간·배제 구간)을 지운다 —
        //   옛 코드는 36 만 반영하고 37/38/35 를 지나쳐도 값을 그대로 '아는' 것으로 두어 뒤 관문을 확정 오판했다.
        const wo = op.operand || {};
        const applyWrite = (pre, id, oper, val, delta, mask) => {
          const effect=mutateFlag(flagOptions(pre,id,cls,ov),{operation:oper,value:val,delta,mask});
          writes.add(pre+id);ovDirty=true;stateEffectCount++;
          if(process.env.WALK_EFFECT_TRACE==='1'&&stateEffectTrace.length<512)stateEffectTrace.push({at:hxA(op.off),hex:op.hex,...effect});
        };
        const pre = wo.space === 'flag.vanilla' ? 'v' : wo.space === 'flag.ext' ? 'e' : wo.space === 'flag.packed4' ? 'p' : null;
        if (wo.write && pre && wo.id !== undefined) applyWrite(pre, wo.id, wo.operation, wo.value ?? 0, wo.delta ?? (wo.operation === 'dec' ? -1 : 1), wo.mask ?? wo.operand ?? 0xf);
        else if (note === 'setFlag' && hx2.length >= 3) applyWrite('v', hx2[1], 'set', hx2[2], 0, 0);
        else if (hx2[0] === 0x37 && hx2.length >= 2) applyWrite('v', hx2[1], 'inc', 0, 1, 0);
        else if (hx2[0] === 0x38 && hx2.length >= 2) applyWrite('v', hx2[1], 'dec', 0, -1, 0);
        else if (hx2[0] === 0x35 && hx2.length >= 2) applyWrite('v', hx2[1], 'unknown', 0, 0, 0);
        else if (note === 'set2B' && hx2.length >= 4) { scratch[hx2[1]] = hx2[2]; scratch[hx2[1] + 1] = hx2[3]; }
        else if (note === 'set1B' && hx2.length >= 3) { scratch[hx2[1]] = hx2[2]; }                       // v19: 40 aa vv → 7E:EF00+aa (저자 메모 `40 00 XX 17 20`)
        else if (hx2[0]===0x48&&hx2.length>=4) { for(let i=0;i<Math.max(1,hx2[2]);i++)scratch[hx2[1]+i]=hx2[3+i]; }
        else if (hx2[0] === 0x0d && hx2[1] === 0x02 && hx2.length >= 4) applyWrite('e', hx2[2], (hx2[3] & 0x80) ? 'or' : 'and', 0, 0, hx2[3] & 0x0f);   // v19: 0D 02 XX 0Y = bitY 외 OFF, 8Y = bitY ON
        else if (hx2[0] === 0x0d && hx2[1] === 0x04 && hx2.length >= 3) applyWrite('e', hx2[2], 'inc', 0, 1, 0);      // v19: 확장 플래그 +1
        else if (hx2[0] === 0x0d && hx2[1] === 0x05 && hx2.length >= 3) applyWrite('e', hx2[2], 'dec', 0, -1, 0);     // v19: 확장 플래그 -1
        else if (hx2[0] === 0x0d && hx2[1] === 0x03 && hx2.length >= 4) applyWrite('e', hx2[2], 'set', hx2[3], 0, 0);
        else if (hx2[0] === 0x49 && hx2[1] === 0x03 && hx2.length >= 4) applyWrite('p', hx2[2], 'set', hx2[3], 0, 0);
        else if (hx2[0] === 0x49 && (hx2[1] === 0x02 || hx2[1] === 0x04 || hx2[1] === 0x05) && hx2.length >= 3) applyWrite('p', hx2[2], 'unknown', 0, 0, 0);
      }
      if(hb0[0]===0x0d&&hb0[1]===0x33){
        addIndirectStop({at:hxA(op.off),reason:'battle-boundary-after-proven-0D33-writes'});
        traceStop='battle-boundary';break;
      }
      if (note === 'skip') { pc = end + rom[op.off + 1]; noteLanding(pc, op.off); continue; }
      if (note === 'jumpL') { const t = farTarget(op.hex); if (t === null) break; pc = t; lastRowEnd = 0; continue; }   // 다른 지역: 행 덮임 상태 무효
      // v18: 0D 16 a16 = 같은 뱅크 절대 점프(rs3steam/walk_bokuno_event_scripts_v1.py 실측 길이 4). 4B006B `0d 16 4f 00` → 4B004F(메뉴 루프). 옛 워커는 선형 낙수.
      if (note === 'jump16') { const hj = String(op.hex || '').split(' ').map((x) => Number.parseInt(x, 16)); if (hj.length < 4) break; pc = (op.off & 0xff0000) | (hj[2] | (hj[3] << 8)); lastRowEnd = 0; continue; }
      // v18: 0D 3F = 파티 비트 검사 + 뒤따르는 2바이트 이벤트 참조(추적기 문서). 통과 = 참조 이벤트 호출(다음 op 로 해독되어 op0N 호출 경로를 탄다), 실패 = 참조 2바이트 건너뜀.
      if (note === 'partyBitEvent?') {
        const d={kind:'unmodeled-gate',at:hxA(op.off),hex:op.hex,feasibility:'not-established',source:'partyBitEvent'};
        pushFork({pc:end+2,stack:stack.slice(),lastRowEnd,fork:true,optN,ov:{...ov},scratch:{...scratch},decisionTail:decision(decisionTail,{...d,pass:false})});
        decisionTail=decision(decisionTail,{...d,pass:true});pc=end;continue;
      }
      if (note === 'callIndirect') {
        const hi2=String(op.hex||'').split(' ').map(x=>Number.parseInt(x,16));
        const call=applyIndirectCommand(baked,currentIndirectState,hi2,{at:hxA(op.off)}).call;
        if(call?.status==='resolved'&&call.target>=0&&call.target<baked.length&&stack.length<CALL_DEPTH){
          stack.push({ret:end,lastRowEnd,farCall:true,end16});end16=null;pc=call.target;lastRowEnd=0;continue;
        }
        const reason=call?.status==='resolved'?(stack.length>=CALL_DEPTH?'call-depth-limit':'target-out-of-rom'):(call?.reason||'unmodeled-indirect-call');
        addIndirectStop({at:hxA(op.off),reason,offset:call?.offset??hi2[2]??null,bytes:call?.bytes??null,sources:call?.sources??null,cpu:call?.cpu??null});
        unknownStops.push(op.off);traceStop=`unresolved-indirect-call:${reason}`;break;
      }
      if (hb0[0]===0x30 && op.len===1) {
        if(!Number.isInteger(optN)||optN<1||optN>255){unknownStops.push(op.off);traceStop='unresolved-choice-arity';break;}
        for(const a of selectionCallAlternatives(rom,op.off,optN,NOPS)){
          const dt=decision(decisionTail,{kind:'selection-call',at:hxA(op.off),index:a.index,count:optN,referencePc:hxA(a.referencePc),returnPc:hxA(a.returnPc)});
          if(!a.range||stack.length>=CALL_DEPTH){unknownStops.push(op.off);const failed={branchId:++nextBranchId,tail:traceTail,glyphTail:traceTail,decisionTail:dt,stop:'unresolved-selection-call',lastPc:hxA(op.off)};tracePaths.push(failed);journal?.failedAlternative(failed,slotWindows,branchId);continue;}
          pushFork({pc:a.range.start,end16:a.range.end16,activeEvent:a.nativeEvent,dispatchBase:a.nativeEvent,
            stack:stack.concat([{ret:a.returnPc,lastRowEnd,eventFrom:activeEvent,callee:a.nativeEvent,end16}]),lastRowEnd:-1,
            fork:true,optN,ov:{...ov},scratch:{...scratch},decisionTail:dt});
        }
        traceStop='selection-call-fork';break;
      }
      if (note === 'callL') {
        const t = farTarget(op.hex);
        if (t !== null && stack.length < 8) { stack.push({ ret: end, lastRowEnd, farCall: true, end16 }); end16 = null; pc = t; lastRowEnd = 0; } else { callDepthStops++; unknownStops.push(op.off); break; }
        continue;
      }
      if (note === 'endMes' || op.hex === '2e') {    // 2E: callL 리턴 또는 이벤트 리턴
        if (!stack.length) { curB = null; openTail = null; }   // 이벤트 복귀는 창을 닫는다(실기 3B6468). callL 복귀는 미측정 → 열린 채 둔다
        if (stack.length) {
          const r = stack.pop(); pc = r.ret; lastRowEnd = r.lastRowEnd; if (r.eventFrom !== undefined) activeEvent = r.eventFrom; if (Object.hasOwn(r, "end16")) end16 = r.end16;
          // callL / 0B fragment return preserves the same display, also in --from probes.
          continue;
        }   // 리턴 = 호출자의 행 덮임 상태 복원
        if (!endState) endState = { tail: openTail, balloon: curB, geom: { ...geom } };
        retPaths += 1;traceStop="native-return";
        break;
      }
      if (note === 'end') { traceStop='native-end';closeAllWindows(); if (!endState) endState = { tail: null, balloon: null, geom: { ...geom } }; endAllPaths += 1; break; }   // 43: 이벤트 종료 — 창은 닫힌 것으로 본다                     // 43: 스택 전체 종료
      if(rom[op.off]===0x0f){unknownStops.push(op.off);traceStop='unmodeled-native-op0F-not-catalog-call';break;}
      if ((rom[op.off] < 0x10 && rom[op.off] !== 0x0d) || op.note === 'nativeCall') {              // 00..0B XX 복귀형 이벤트 호출 (v17: 04 NN 'callLocal' 도 같은 표 — 0x04AA `04 ae`·0x0465 `04 66`, 계정 추적기는 안 따라가 풍선 0) (+0C: 0x03FC 본문이 `0c c6` 사슬로 0x0CC6 에 닿음, 실기 확인)
        const h = op.hex.split(' ').map((x) => Number.parseInt(x, 16));
        const callee = (h[0] << 8) | h[1];
        if(h[0]===0x0b)fragCalls.add(callee);
        if (LAZY && process.env.WALK_INLINE_CALLS !== '0') {
          const callDepth = depth + stack.filter(f => f.eventFrom !== undefined).length;
          if (callee === activeEvent || stack.some(f => f.eventFrom === callee)) { recursiveCallStops++; break; }
          const calleeRange = NOPS.rangeOfNative(callee); const target = calleeRange?.start;
          if (target !== null && target !== undefined && callDepth < CALL_DEPTH) {
            // Keep each return path's flags, scratch, cursor and mode in this work item.
            // The old recursive walker kept only the first return and dropped other continuations.
            stack.push({ ret: end, lastRowEnd, eventFrom: activeEvent, callee, end16 });
            activeEvent = callee; dispatchBase = callee; end16 = calleeRange.end16; pc = target; lastRowEnd = 0; continue;
          }
          // Never pretend a bounded-out call was executed.
          callDepthStops++; unknownStops.push(op.off); break;
        }
        // 자기 재호출(0x0002 「text; 33 86 ef; 00 02」 사슬)은 이 상호작용의 풍선을 끝낸다 — 실기: 한 줄만 찍고 끝(p1 「배가 나갑니다.」 lastEvent 3A085A).
        //   실패 팔(호출 건너뜀 → 다음 줄)은 fork 로 따로 풍선이 된다 = 다음 상호작용의 줄.
        if (callee === eventId) break;
        if (depth < CALL_DEPTH && !calledEvents.has(callee)) {
          calledEvents.add(callee);
          const sub = walkEvent(callee, cls, depth + 1, calledEvents, geom, { open: openTail !== null, tail: openTail, balloon: curB }, ov);
          for (const [k, v] of (sub.headOnOperandMap || new Map())) if (!headOnOperand.has(k)) headOnOperand.set(k, v);   // v24: 피호출 걷기의 검출도 호출자에 모은다
          for (const [k, v] of (sub.midRowLandingsMap || new Map())) if (!midRowLandings.has(k)) midRowLandings.set(k, v);
          for (const w of (sub.decoderWarnings || [])) decoderWarnings.push(w);
          for (const k of (sub.writes || [])) { writes.add(k); delete ov[k]; delete ov['g' + k]; delete ov['x' + k]; ovDirty = true; }   // v17
          if (sub.endAllPaths > 0 && !sub.retPaths) { endAllPaths += 1; for (const b of (sub.balloons || []).filter((b) => b !== curB)) balloons.push(b); break; }   // v21: 3AFFE2 `0c e7 … 0c e3` 사슬 — 피호출자가 43 으로만 끝나면 호출자는 다음 op 를 읽지 않는다(옛: 3B0000 포인터표로 낙수)
          const subs = (sub.balloons || []).filter((b) => b !== curB);
          // 피호출 이벤트의 첫 풍선이 창 op 없이(암묵) 시작하면 호출자의 열린 창에 이어 쓴다 —
          //   0x000F 「니나라고 합니다.」+ 0x0010 「저기‥‥」 가 실기에서 한 줄(합성줄 A부류의 주범).
          if (curB && subs.length && !subs[0].residual && subs[0].openAt === '0') {
            const subB=subs[0],offset=curB.texts.join('').length;
            for (const t of subB.texts) curB.texts.push(t); for (const c of (subB.layoutControls || [])) curB.layoutControls.push({...c,index:offset+c.index}); for (const g of (subB.segs || [])) curB.segs.push(g); curB.jpMiss += subB.jpMiss || 0; subs.shift();
          }
          for (const b of subs) balloons.push(b);
          calleeGeomOut.set(`${callee}|${cls}|${geomKey(geom)}`, sub.geom || geom);
          if (sub.geom) geom = sub.geom;                 // 피호출 이벤트가 바꾼 창 기하를 이어받는다
          // 복귀 뒤 이어 쓰기: 피호출자가 창을 연 채 돌아왔으면 호출자의 다음 문안은 그 풍선에 붙는다(0x000F+0x0010 실기 한 줄)
          if (sub.endBalloon && !sub.endBalloon.residual) { curB = sub.endBalloon; openTail = sub.endTail; } else if (sub.endTail === null) { curB = null; openTail = null; }
        } else if (calleeGeomOut.has(`${callee}|${cls}|${geomKey(geom)}`)) {
          geom = calleeGeomOut.get(`${callee}|${cls}|${geomKey(geom)}`);   // 두 번째 호출 자리: 피호출자가 남긴 창을 그대로 복귀
        }
        pc = end; continue;
      }
      if (note === 'selGoto' || op.hex === '2f') {
        // 선택지 분기 — 계정서 생성기의 국소 문법: 25(메뉴 열기) → 26(항목 표식)+문안 … → 27/31(닫기)
        //   → 에필로그 → 2f. 셀은 2f 뒤 2바이트씩 arity 개. 첫 바이트 < 0x0C = 이벤트 이양(복귀 없음),
        //   아니면 인라인 op(대개 4e NN 스킵 → 국소 착지). 엔진 C0:2E73 은 선택 index*2 만큼 전진.
        let arity = optN;
        if (!NATIVE) { arity = 0;
          for (let i = ops.indexOf(op) - 1; i >= 0 && i > ops.indexOf(op) - 64; i -= 1) {
            const h = (ops[i].hex || '');
            if (h === '25' || ops[i].note === 'optA') break;
            if (h === '26' || ops[i].note === 'optB') arity += 1;
          } }
        const choiceContract=choiceContractAtSelection(rom,op.off);
        if(choiceContract&&!(currentChoiceContext?.contractId===choiceContract.id&&currentChoiceContext?.resetSeen===true)){
          const reason='choice-contract-prelude-not-observed';
          choiceStops.push({at:hxA(op.off),count:arity,reason,contractId:choiceContract.id,minTotalCount:2,maxTotalCount:choiceContract.maxTotalCount});
          unknownStops.push(op.off);traceStop=`choice-boundary-hold:${reason}`;break;
        }
        if(choiceContract&&(arity<2||arity>choiceContract.maxTotalCount)){
          const reason='selection-arity-outside-authenticated-0D14-domain';
          choiceStops.push({at:hxA(op.off),count:arity,reason,contractId:choiceContract.id,minTotalCount:2,maxTotalCount:choiceContract.maxTotalCount});
          unknownStops.push(op.off);traceStop=`choice-boundary-hold:${reason}`;break;
        }
        if(!Number.isInteger(arity)||arity<1||arity>255){unknownStops.push(op.off);traceStop='unresolved-choice-arity';break;}
        for (let k = 0; k < arity; k += 1) {
          const choiceDecision=decision(decisionTail,{kind:'selection-jump',at:hxA(op.off),index:k,count:arity,referencePc:hxA(end+2*k)});
          const slot = end + 2 * k; const b0 = rom[slot], b1 = rom[slot + 1];
          if (b0 < 0x0c) {
            const callee = (b0 << 8) | b1;
            if (LAZY) {
              const range = NOPS.rangeOfNative(callee);
              if (range) pushFork({ decisionTail:choiceDecision, pc: range.start, end16: range.end16, activeEvent: callee, dispatchBase: callee,
                stack: stack.slice(), lastRowEnd: 0, fork: true, optN: 0,
                ov: Object.assign({}, ov), scratch: Object.assign({}, scratch) });
              else {unknownStops.push(slot);const failed={branchId:++nextBranchId,tail:traceTail,glyphTail:traceTail,decisionTail:choiceDecision,stop:'unresolved-selection-target',lastPc:hxA(op.off)};tracePaths.push(failed);journal?.failedAlternative(failed,slotWindows,branchId);}
              continue;
            }
            if (depth < CALL_DEPTH && !calledEvents.has(callee)) {
              calledEvents.add(callee);
              const sub = walkEvent(callee, cls, depth + 1, calledEvents, geom, null, ov);
              for (const [k, v] of (sub.headOnOperandMap || new Map())) if (!headOnOperand.has(k)) headOnOperand.set(k, v);   // v24: 피호출 걷기의 검출도 호출자에 모은다
              for (const [k, v] of (sub.midRowLandingsMap || new Map())) if (!midRowLandings.has(k)) midRowLandings.set(k, v);
              for (const w of (sub.decoderWarnings || [])) decoderWarnings.push(w);
              for (const b of (sub.balloons || [])) balloons.push(b);
            }
          } else if (b0 === 0x4e) {
            pushFork({ decisionTail:choiceDecision, pc: slot + 2 + b1, stack: stack.slice(), lastRowEnd, fork: true, optN, ov: Object.assign({}, ov), scratch: Object.assign({}, scratch) });
          } else {
            pushFork({ decisionTail:choiceDecision, pc: slot, stack: stack.slice(), lastRowEnd, fork: true, optN, ov: Object.assign({}, ov), scratch: Object.assign({}, scratch) });
          }
        }
        traceStop="selection-fork";break;                                       // 참조 셀은 낙수하지 않는다
      }
      if (note.startsWith('op32') || (op.hex || '').startsWith('32 ')) {  // 꼬리 이양
        const h = op.hex.split(' ').map((x) => Number.parseInt(x, 16));
        if (h.length >= 3) {
          const callee = (h[1] << 8) | h[2];
          if (LAZY) {
            const range = NOPS.rangeOfNative(callee);
            if (range) { pc = range.start; end16 = range.end16; activeEvent = callee; dispatchBase = callee; lastRowEnd = 0; continue; }
            unknownStops.push(op.off); break;
          }
          if (depth < CALL_DEPTH && !calledEvents.has(callee)) {
            calledEvents.add(callee);
            const sub = walkEvent(callee, cls, depth + 1, calledEvents, null, null, ov);
            for (const [k, v] of (sub.headOnOperandMap || new Map())) if (!headOnOperand.has(k)) headOnOperand.set(k, v);   // v24: 피호출 걷기의 검출도 호출자에 모은다
            for (const [k, v] of (sub.midRowLandingsMap || new Map())) if (!midRowLandings.has(k)) midRowLandings.set(k, v);
            for (const w of (sub.decoderWarnings || [])) decoderWarnings.push(w);
            for (const b of (sub.balloons || [])) balloons.push(b);
          }
        }
        break;                                       // 이양 — 현 경로 종료
      }
      // v30 native ROM/RAM buffer commands. 39 resolves actual party record;
      // 3A resolves the item index in EF00, not an invented actor name.
      // Route declared heads through the decoder, which validates actual native
      // hook eligibility. Declaration alone does NOT imply a shadow redirect.
      if (false && op.kind !== 'text' && !/^(4a|3b|3a|39|50) /.test(op.hex + ' ') && (shadowD.has(op.off) || arenaOwners.has(op.off))) {
        lastShadowResume = 0;
        const d = decKoWithSegments(op.off, op.off + 1, op.off >> 16);
        if (inFrag) for (const g of d.segments) if (g[2] === 'raw') g[2] = 'frag';
        if (d.text || currentTextIssues?.length) emit(d.text, op.off, d.segments, d.controls);
        lastRowEnd = Math.max(end, lastShadowResume); pc = Math.max(end, lastShadowResume); continue;
      }
      if (op.hex && /^(4a|3b|3a|39|50) /.test(op.hex + ' ')) {
        // 글자성 op(이름 매크로·공백) 머리에 그림자 트리거가 서 있으면 엔진은 그 바이트 페치에서
        // 훅을 울려 아레나를 타이핑한다(1,292행이 이 꼴). 매크로 이름만 방출하고 뒤 텍스트 op 를
        // 원문 바이트로 풀면 「루브 산지신린고?츠…」 같은 가짜 괴문자가 난다(0x060C 실측).
        if (false && (shadowD.has(op.off) || arenaOwners.has(op.off))) {   // v22: 아레나 행(그림자 아님)도 — 예언문 3C0938 `50 50 50 50 50 …`·3C1B95 머리가 공백/매크로면 지나쳐 중간부터 원문을 풀었다(z43 괴문자 정적 97곳 중 3C0/3C1/3C9/3CA 부류)
          lastShadowResume = 0;
          const d = decKoWithSegments(op.off, op.off + 1, op.off >> 16);   // 트리거 → 아레나 전체, 복귀점 기록
          const t = d.text;
          if (inFrag) for (const g of d.segments) if (g[2] === 'raw') g[2] = 'frag';
          if (t || currentTextIssues?.length) emit(t, op.off, d.segments, d.controls);
          else if (ROWSPANS.length && !effectiveCoveredAt(op.off)) { const jp = (op.text || '').replace(/[。、！？‥…・「」『』（）　\s]/g, ''); if (jp) { if (!curB) open(); curB.jpMiss += 1; (curB.miss || (curB.miss = [])).push([hxA(op.off), (op.text || '').slice(0, 12)]); } }
          lastRowEnd = Math.max(end, lastShadowResume);
          pc = Math.max(end, lastShadowResume); continue;
        }
        if(op.hex.startsWith('50')){const d=decKoWithSegments(op.off,end,op.off>>16);if(d.text||currentTextIssues?.length)emit(d.text,op.off,d.segments,d.controls);}
        else {const opbytes=op.hex.split(' ').map(x=>parseInt(x,16));const text=resolveText(opbytes[0],opbytes.slice(1),op.off,op.off);emit(text??'',op.off);}
        pc = end; continue;
      }
      if(TEXT_COMMANDS.has(hb0[0])||(hb0[0]===0x4f&&TEXT_4F.has(hb0[1]))){
        const text=resolveText(hb0[0],hb0.slice(1),op.off,op.off);emit(text??'',op.off);pc=end;continue;
      }
      // Invalidate runtime-memory dependencies at commands whose side effects
      // are not implemented. An explicit 40/41/48 write can re-establish a byte.
      const modeledNoRuntimeMutation = [0x24,0x25,0x26,0x27,0x28,0x29,0x2a,0x2b,0x2c,0x2d,0x2e,0x2f,0x30,0x31,0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x3c,0x40,0x41,0x43,0x45,0x48,0x4d,0x4e,0x50].includes(hb0[0]) || (hb0[0]===0x49&&hb0[1]<=5) || (hb0[0]===0x0d&&([0,1,2,3,4,5,0x19,0x1a,0x1b,0x1d,0x1e,0x30,0x31,0x33].includes(hb0[1]))) || (hb0[0]===0x4f&&[0x1a,0x1b,0x1d,0x34].includes(hb0[1]));
      if(!modeledNoRuntimeMutation){for(const k of Object.keys(scratch))delete scratch[k];scratch.__nativeMemoryInvalidated=hxA(op.off);currentIndirectState=createIndirectState({partyActors:currentIndirectState.partyActors});}
      // WALK_GEOM=<쉼표 목록> — 창 크기를 정하는 출처를 고른다(실험용 스위치).
      if (PRESETS[note] && GEOM_SRC.has(note)) { const [ix, c, r] = PRESETS[note]; const rec = sizeRecord(ix); geom = { cols: rec.cols || c, rows: rec.rows || r, src: note, setAt: hxA(op.off), setEvent: evKey, sizeIndex: ix, depth }; }
      if (GEOM_3C && (note === 'specialWin' || (op.hex || '').startsWith('3c '))) {
        const h = (op.hex || '').split(' ').map((x) => Number.parseInt(x, 16));
        if (h.length >= 3) {
          const sizeByte = h[h.length - 1];
          const ix = sizeByte & 0x7f, rec = sizeRecord(ix);
          // 3C draws a window; it is not a D599 preset write. Keep preset geom unchanged.
          const selected = { cols: rec.cols, rows: rec.rows, src: '3C', setAt: hxA(op.off),
            setEvent: evKey, sizeIndex: ix, depth, slot: (sizeByte & 0x80) ? 64 : 0, rect: ix >= 0x20 && h[1] !== 0xff ? { x: h[1], y: h[2], width: rec.outerWidth, height: rec.outerHeight } : null, position: h[1] === 0xff ? { mode: 'native-auto' } : { x: h[1], y: h[2], units: 'native-window-operands' } };
          openPc = op.off; open(selected.slot, selected);
        }
        pc = end; continue;
      }
      if (LAYOUT && ['optA', 'optB', 'optC'].includes(note)) {
        if (!curB) open();
        curB.layoutControls ||= [];
        curB.layoutControls.push({ kind: note, at: hxA(op.off), index: curB.texts.join('').length });
        pc = end; continue;
      }
      if (LAYOUT && note === 'nl') { if(TRACE_NL){ if(!currentGlyphTokens)currentGlyphTokens=[]; traceGlyph(-1,op.off,null,'newline'); } emit('\n', op.off); pc = end; continue; }   // 원문 스트림의 0x24(공유 개행)는 op 층에서 방출된다 — 추적 토큰도 여기서(2026-09-09)
      if (LAYOUT && note === 'pause') { emit('\f', op.off); pc = end; continue; }
      if (PRESETS[note] && GEOM_SRC.has(note)) {
        // 모드 op(4D/4F1D/4F1A/4F1B)는 D599 만 바꾸고 그리지 않는다. 창이 열려 있으면 다음 문안은 그 창에 **옛 크기로** 이어진다
        //   (실기 3BBF08: 14x4 한 줄 「답례로 5000오람이야. 오늘은 무슨 볼일이」, 3B685E→3B6869 「있습니다.신왕교단」). 닫혀 있으면 다음 문안이
        //   새 창을 모드 크기로 연다(자동 열기). 이어지는 꼬리가 개행/대기로 안 끝났으면 「4d 이음」.
        if (curB && curB.texts.length) {
          if (JOIN4D && openTail !== null && openTail.trim().length && !/[\n\f]\s*$/.test(openTail) && !curB.joinFrom) curB.pendingJoin = { at: hxA(op.off), prev: openTail.slice(-12), textAt: curB.texts.join('').length, op: note };
          curB.modeChangedAt = (curB.modeChangedAt || []).concat(hxA(op.off));
        } else if (!curB) { openPc = op.off; }
        pc = end; continue;
      }
      if (note === 'winSelf' || note === 'winOther') {
        const slot = note === 'winSelf' ? 0 : 64;
        if (slotWindows.has(slot)) {
          selectWindow(slot);
          const cursor = layoutBalloon(curB.texts, curB.window, curB.layoutControls).cursor;
          // C0:2169 calls SelectWindow; C0:216F tests D5C2 (whole-cell column).
          // Korean half-cell pen increments D5C2 after each second glyph.
          curB.reselects.push({ at: hxA(op.off), index: curB.texts.join('').length, cursor });
          if (cursor.columnHalfCells >= 2) emit('\n', op.off);
        } else { openPc = op.off; open(slot); }
        pc = end; continue;
      }
      if (note === 'closeWin') { closeWindow(); pc = end; continue; }   // 2A: 창만 닫는다 — 크기(D599)는 남는다
      pc = end;
    }
    if (eventBudget) {
      const budget=eventBudget.report();
      if(budget.commandCap||budget.physicalCap){innerStepCapHit++;traceStop=budget.commandCap?'event-command-cap':'physical-instruction-cap';}
    } else if (inner > 4000) {innerStepCapHit++;traceStop="instruction-cap";}
    if(TRACE_GLYPHS)tracePaths.push({branchId,tail:traceTail,decisionTail,stop:traceStop,lastPc:hxA(pc)});
    journal?.endPath({branchId,decisionTail,stop:traceStop,lastPc:hxA(pc),glyphTail:traceTail},slotWindows);
    if (BUDGET_STOPS.has(traceStop)) for (const ob of slotWindows.values()) (ob.budgetCuts ||= []).push(traceStop);

  }
  // 보충층: 경로가 못 닿은 텍스트 op — 다른 트리거 진입로의 대사다.
  //   경로 산출(balloons)은 명세 정확, 보충(residual)은 재현 보증용으로 분리해 담는다.
  const residual = { texts: [], jpMiss: 0 };
  let resRowEnd = -1;
  for (const o of ops) {
    if (o.kind !== 'text' || visited.has(o.off) || o.off < resRowEnd) continue;
    const d = decKoWithSegments(o.off, o.off + o.len, o.off >> 16);
    const t = d.text;
    if (t) residual.texts.push(t); else residual.jpMiss += 1;
    resRowEnd = o.off + o.len;
  }
  const finishBalloon = (b) => {
    if (!LAYOUT) return b;
    // 확정 창이 있으면 그것으로 덮는다. 없으면 window.confirmed=false 로 두고 배치 flag 를 내지 않는다.
    let conf = null;
    const fromImplicitStart = FROM_AT && b.openAt === '0';
    if (!fromImplicitStart) {
      for (const [a] of (b.segs || [])) { const v = winAt(Number.parseInt(a, 16)); if (v) { conf = v; break; } }
      if (!conf && b.openAt) conf = winAt(Number.parseInt(b.openAt, 16));
    }
    // 확정 정책 v2: 경로 위에서 설정된 창(PATH_CONFIRMED, 호출 상속 포함)이 1순위. 옛 flow 색인은 대조용으로만 남긴다(2A 크기 소거 결함).
    const pw = b.window || null;
    const pathOk = pw && PATH_CONFIRMED.has(pw.src);
    const defOk = pw && pw.src === 'default' && DEFAULT_CONFIRMED;
    // 경로 증명 설정표: 경로에서 창 설정을 못 봐 default 로 남은 창만 채운다(이미 확정된 창은 안 건드린다).
    const setter = (!pathOk && pw && pw.src === 'default' && WINDOW_SETTERS && b.openAt) ? WINDOW_SETTERS.get(String(b.openAt).toUpperCase()) : null;
    if (setter) b.window = { ...pw, cols: setter.cols, rows: setter.rows, src: 'caller-path', confirmed: true,
      setterAt: setter.setter, setterKind: setter.setterKind, setterScope: 'proved by --from walk reaching this open; not a reachability proof' };
    else if (pathOk || defOk) b.window = { ...pw, confirmed: true, flow: conf ? [conf[2], conf[3]] : null, flowConflict: !!(conf && (conf[2] !== pw.cols || conf[3] !== pw.rows)) };
    else if (conf && !pw) b.window = { cols: conf[2], rows: conf[3], src: 'flow', confirmed: true };
    else b.window = pw ? { ...pw, confirmed: false, flow: conf ? [conf[2], conf[3]] : null } : null;
    const observation = measuredGeometry?.resolve(currentRootEvent, cls, b) || { status: 'unmeasured-context' };
    b.geometryObservation = observation;
    if (observation.status === 'observed-context') {
      if (!b.window?.confirmed) b.window = { ...b.window, cols: observation.cols, rows: observation.rows,
        slot: observation.slot, src: 'measured-context', confirmed: true, observedOnly: true };
      else if (b.window.cols !== observation.cols || b.window.rows !== observation.rows) b.geometryObservation = {
        ...observation, status: 'path-vs-observation-conflict', path: [b.window.cols, b.window.rows] };
    }
    // Unrecognized handler/constructor bytes must never silently certify a preset.
    if (b.window && (b.window.src === '4F_1A' || b.window.src === '4F_1B') && !VERIFIED_SMALL_PRESETS.has(b.window.src)) {
      b.layoutHolds ||= [];
      const hold={kind:'geometry-preset-unverified',preset:b.window.src,setAt:b.window.setAt||null,sizeIndex:b.window.sizeIndex??null};
      if(!b.layoutHolds.some(h=>h.kind===hold.kind&&h.preset===hold.preset&&h.setAt===hold.setAt))b.layoutHolds.push(hold);
    }
    const w = (b.window && b.window.confirmed) ? b.window : null;
    const placement = layoutBalloon(b.texts, { cols: w?.cols || 0, rows: w?.rows || 0 }, b.layoutControls || []);
    if(placement.holds?.length){
      b.layoutHolds ||= [];
      for(const hold of placement.holds)if(!b.layoutHolds.some(h=>JSON.stringify(h)===JSON.stringify(hold)))b.layoutHolds.push(hold);
    }
    const pages = placement.pages; const flags = [];
    b.pagesExact = placement.pagesExact; b.linesExact = placement.linesExact;
    b.waits = placement.waits; b.options = placement.options;
    b.cursor = placement.cursor; b.layoutPolicy = placement.policy;
    if(TRACE_GLYPHS){
      const pos=new Map((placement.positions||[]).map(p=>[p.index,p]));
      b.glyphs=b.glyphTokens.map(t=>({...t,...pos.get(t.textIndex)}));
    }

    if (b.joinFrom) { const all = b.texts.join(''); const k = b.joinFrom.textAt ?? 0; flags.push(`4d 이음 「${b.joinFrom.prev.replace(/\s+$/, '')}|${all.slice(k, k + 8)}」 @${b.joinFrom.at}`); }
    if (MISS_FLAG && !b.residual) {
      for (const m of (b.miss || []).slice(0, 3)) flags.push(`미번역 「${m[1]}」 @${m[0]}`);
      const LABEL = { raw: '괴문자', landing: '착지 괴문자', spill: '유출 괴문자', frag: '조각 괴문자' };
      const runs = []; let run = null;
      for (const g of (b.segs || [])) { if (g[2]) { if (run && run[2] === g[2]) run[1] += g[1]; else { if (run) runs.push(run); run = [g[0], g[1], g[2]]; } } else if (run) { runs.push(run); run = null; } }
      if (run) runs.push(run);
      const perTag = {};
      for (const r of runs) { if ((r[1].match(/[가-힣]/g) || []).length < 2) continue; perTag[r[2]] = (perTag[r[2]] || 0) + 1; if (perTag[r[2]] <= 3) flags.push(`${LABEL[r[2]] || r[2]} 「${r[1].slice(0, 12)}」 @${r[0]}`); }
    }
    const glyphs = (l) => (l.match(/[가-힣0-9A-Za-z?!.,…‥∼~·]/g) || []).length;
    if (w) for (const pg of pages) { for (const l of pg) if (glyphs(l) > w.cols * 2) flags.push(`창 넘침 ${glyphs(l)}>${w.cols * 2} 「${l.slice(0, 14)}」`); }
    // Diagnose each physical wrap once, including those after a scroll. Never trim
    // spaces before computing the cursor, and never turn a full-line newline into two.
    const layout = [];
    if (w) for (const edge of placement.wraps) {
      const rawL = edge.line, raw = edge.rest, rest = raw.trim();
      const leadSp = /^[ \t␣]/.test(raw) || /[ \t␣]$/.test(rawL);
      const cut = !leadSp && /[가-힣0-9A-Za-z]$/.test(rawL) && /^[가-힣0-9A-Za-z]/.test(raw);
      const kind = rest.length && rest.length <= 3 ? '고아 행' : cut ? '어절 절단'
        : /^[ ␣]/.test(raw) ? '앞칸 공백' : /^[.!?,…‥~∼]/.test(rest) ? '부호 머리' : null;
      if (kind) { flags.push(`${kind} 「${rawL.slice(-6)}|${rest.slice(0, 6)}」`); layout.push({ kind, ...edge }); }
    }
    b.unresolvedTokens = [...new Map((b.unresolvedTokens || []).map(d => [JSON.stringify(d), d])).values()];
    b.textComplete = b.unresolvedTokens.length === 0;
    b.assumptions = [...new Set((b.runtimeTerms || []).flatMap(t => (t.assumptions || []).map(a => a.kind)))];   // 가정 아래 판정된 풍선 — 완결성 보고서가 따로 센다
    b.layoutHolds ||= [];
    b.layoutComplete = b.textComplete && b.layoutHolds.length === 0 && !!b.window?.confirmed && !b.window?.observedOnly;
    b.pages = pages; b.flags = [...new Set(flags)]; b.layout = layout; return b;   // 제자리 갱신 — 피호출자 endBalloon 이 호출자에서 계속 채워져야 한다(v11: 복사본이라 복귀 뒤 문안이 사라지던 결함)
  };
  const out = balloons.filter((b)=>b.texts.length||b.jpMiss||b.unresolvedTokens?.length).map(finishBalloon);
  if (residual.texts.length || residual.jpMiss) out.push({ ...residual, residual: true });
  // 여는 op 씨앗 모드는 같은 말풍선을 수천 번 낸다 — (여는 자리 + 문안)으로 접는다.
  const uniq = new Map();
  for (const b of out) {
    const k = `${b.openAt}|${b.at}|${b.window ? b.window.cols + 'x' + b.window.rows + '/' + b.window.slot + '/' + (b.window.confirmed ? 1 : 0) : ''}|${(b.segs || []).map(([, t]) => t).join('')}`;   // v14: 같은 문안이라도 창이 다르면 별도 행(조건당 크기 하나) · v26(2026-09-06): 시작 주소(at)도 열쇠 — 같은 여는 op 아래 같은 문안이 다른 주소에 있으면(次ヘ 목록 창 템플릿 36곳) 접히면서 피복 계산에서 그 행들이 '미도달'로 잘못 잡혔다
    if (!uniq.has(k)) { b.witnessBranches = [b.branchId ?? 0]; b.budgetCutAll = !!b.budgetCuts?.length; uniq.set(k, b); } else { const old = uniq.get(k); if (!old.witnessBranches.includes(b.branchId ?? 0)) old.witnessBranches.push(b.branchId ?? 0); old.budgetCutAll = old.budgetCutAll && !!b.budgetCuts?.length; if (b.budgetCuts?.length) (old.budgetCuts ||= []).push(...b.budgetCuts); }
  }
  if(TRACE_GLYPHS){
    const positions=new Map();
    for(const b of out.filter(x=>!x.residual)){const key=`${b.instanceId}:${b.branchId}`;positions.set(key,{balloon:b,glyphs:new Map((b.glyphs||[]).map(g=>[g.textIndex,g]))});}
    for(const node of traceNodes){const p=positions.get(`${node.windowInstance}:${node.balloonBranch}`),g=p?.glyphs.get(node.textIndex);if(g){Object.assign(node,{row:g.row,columnHalfCells:g.columnHalfCells,windowSlot:p.balloon.window?.slot,cols:p.balloon.window?.cols,rows:p.balloon.window?.rows,geometryStatus:p.balloon.window?.confirmed?'known':'unconfirmed',layoutCertified:p.balloon.layoutComplete,windowInstance:p.balloon.instanceId});}else node.positionUnavailable=true;}
  }
  // WALK_SAVE_TRACE=1 일 때만 글리프 추적 원자료(trace)를 출력에 싣는다 — 그래프 모드(WALK_BALLOON_GRAPH)는 추적을 내부적으로만 쓰고,
  //   전수 덤프에서 trace 를 실으면 파일이 13배(6이벤트 27MB→366MB)로 불어 C: 용량 규칙에 걸린다(2026-09-07).
  const ret = { ...((TRACE_GLYPHS && process.env.WALK_SAVE_TRACE === '1')?{trace:{nodes:traceNodes,decisions:decisionNodes,paths:tracePaths,capHit:traceCapHit,scope:'one persistent chain per explored branch; no cross-event/class/path stitching; relative glyph coordinates only'}}:{}), statePolicy: { ...STATE_POLICY, source: STATE_PATH || null, scope: 'preserves supplied class/party inputs; models proven flag and runtime-buffer operations; other native effects and geometry may remain unresolved' }, balloons: [...uniq.values()], unknownGates, hijacks, decoderWarnings, geom: endState?.geom || geom, writes: [...writes], retPaths, endAllPaths, headOnOperandMap: headOnOperand, midRowLandingsMap: midRowLandings,
    endTail: endState ? endState.tail : openTail, endBalloon: endState ? endState.balloon : curB, endBalloonRaw: endState ? endState.balloon : curB,
    stateEffectCount, stateEffectTrace, runtimeTextResolutions, inactiveControls, orphanTextIssues:currentTextIssues||[],
    exploration: { boundaryReturns, innerStepCapHit, recursiveCallStops, callDepthStops, callDepthLimit: CALL_DEPTH, eventRange: rootRange, visitedSourceOps: visited.size, pathStepLimitHit: work.length > 0, pcStateCapHit, pcStateCapScope: CAP_PER_CONTEXT ? 'pc+call-context' : 'pc', unknownStops: unknownStops.slice(0, 8).map((x) => x.toString(16)), unknownStopCount: unknownStops.length, choiceStops:choiceStops.slice(0,64), choiceStopCount:choiceStops.length, indirectStops:indirectStops.slice(0,64).map(({_key,...x})=>x), indirectStopCount, padStops, midRowLandings: [...midRowLandings.entries()].slice(0, 64).map(([k, v]) => [k, v.row, v.from]), headOnOperand: [...headOnOperand.entries()].slice(0, 64).map(([k, v]) => [k, v.op, v.hex]), fragCalls: [...fragCalls].map((c) => c.toString(16)), opSource: 'candidate-rom-single-token', pendingWorkItems:work.length, decisionCount:decisionNodes.length,
      scope: 'native block-end equality; per-slot windows; display-isolated unknown-gate forks; bounded calls/states; no pixel or timing proof' } };
  if(journal){
    ret.balloonGraph=buildBalloonGraph(journal,finishBalloon,{event:evKey,cls,romSha256:createHash('sha256').update(rom).digest('hex'),decisions:decisionNodes,
      exploration:ret.exploration,decoderWarnings,traceCapHit,orphanTerms:runtimeTextResolutions.filter(m=>!m.complete&&m.windowInstance==null),
      pending:work.map(st=>({branchId:st.branchId,decisionTail:st.decisionTail??-1,pc:hxA(st.pc),balloonTail:st.balloonTail??-1})),
      exceptionalPaths:tracePaths.filter(p=>!journal.paths.some(j=>j.branchId===p.branchId)),distinctStates:DISTINCT_STATES});
  }
  currentDecoderWarnings = prevDecoderWarnings;currentTextContext=previousTextContext;currentTextIssues=previousTextIssues;currentTextResolutions=previousTextResolutions;currentGlyphTokens=previousGlyphTokens;
  return ret;
}

if (DECODE_AT) {
  for (const spec of DECODE_AT.split(',')) {
    const [a0, l0, sb0] = spec.split(':');
    const a = Number.parseInt(a0, 16), len = Number.parseInt(l0 || '40', 16);
    const srcBank = sb0 ? Number.parseInt(sb0, 16) : (a >> 16);   // 3번째 필드: FE 워프 해석용 원문 뱅크
    const from = process.env.WALK_DEC_EXACT === '1' ? a : a - 0x10;   // WALK_DEC_EXACT=1: 창 시작에서 정확히(아레나 되읽기용)
    const prevDecoderWarnings = currentDecoderWarnings;
    const decoderWarnings = [];
    currentDecoderWarnings = decoderWarnings;
    const segsDbg = [];
    const decoded = decKo(from, a + len, srcBank, 0, segsDbg);
    currentDecoderWarnings = prevDecoderWarnings;
    console.log(`${a.toString(16)}: ${JSON.stringify(decoded)}`);
    if (process.env.WALK_DEBUG_RAW === '1') console.log(`  segs ${JSON.stringify(segsDbg)} rowSpans=${ROWSPANS.length} covered=${coveredAt(a)} span=${JSON.stringify(spanAt(a))}`);
    for (const w of decoderWarnings) console.error(`decoderWarning ${JSON.stringify(w)}`);
  }
  process.exit(0);
}
const auditLayoutClass=(walk,eventId)=>{
  const coverage=new Map(),findings=[],holds=[];
  const addContext=(source,b,audited)=>{
    const shadow=shadowD.get(source),arena=arenaRowD.get(source);
    const link=shadow?{mode:'shadow',arena:hxA(shadow[0]),back:hxA((source&0xff0000)|shadow[1])}
      :arena?{mode:'arena-row',arena:hxA(arena[1]),back:null}:{mode:'in-place',arena:null,back:null};
    const key=hxA(source),context={event:evName(eventId),owner:b.ownerEvent||null,context:b.contextEvent||null,open:b.openAt||null,at:b.at||null,branch:b.branchId??0,window:b.window?.confirmed?[b.window.cols,b.window.rows,b.window.src]:null,textComplete:b.textComplete!==false,certainty:audited.holds.length?'context-dependent':'static-layout-symptom',holds:audited.holds.map(h=>h.kind)};
    let row=coverage.get(key);if(!row){row={source:key,...link,contexts:[]};coverage.set(key,row);}
    const sig=JSON.stringify(context);if(!row.contexts.some(c=>JSON.stringify(c)===sig))row.contexts.push(context);
  };
  for(const b of (walk.balloons||[])){
    if(b.residual)continue;
    const audited=auditAutowrapResidues(b);
    const sourceRows=[...new Set((b.segs||[]).map(s=>String(s[0]||'').toUpperCase()).filter(Boolean))];
    for(const s of (b.segs||[])){const source=Number.parseInt(String(s[0]),16);if(Number.isInteger(source))addContext(source,b,audited);}
    const identity={at:b.at||b.openAt||null,open:b.openAt||null,branch:b.branchId??0,owner:b.ownerEvent||null,context:b.contextEvent||null,window:b.window?.confirmed?[b.window.cols,b.window.rows,b.window.src]:null,sourceRows};
    for(const f of audited.flags)findings.push({...identity,...f});
    for(const h of audited.holds)holds.push({...identity,...h});
  }
  const counts={balloons:(walk.balloons||[]).filter(b=>!b.residual).length,coveredSources:coverage.size,findings:findings.length,holds:holds.length};
  return {schema:'v32-layout-audit-stream-v1',counts,coverage:[...coverage.values()].sort((a,b)=>Number.parseInt(a.source,16)-Number.parseInt(b.source,16)),findings,holds};
};
// ---- Streaming output. One class per line; never serialize all eight together. ----
const events = EVENTS.length ? EVENTS : [0x0cd7];
const output = openSync(OUT + '.partial', 'w');
writeSync(output, '{\n');let done=0;
try { for(const ev of events){
  const key=evName(ev);writeSync(output,(done?',\n':'')+JSON.stringify(key)+':{\n');let classesWritten=0;
  for(let cls=0;cls<8;cls++){
    if(ONLY_CLASSES.length&&!ONLY_CLASSES.includes(cls))continue;
    const w=walkEvent(ev,cls);
    const item = LAYOUT_AUDIT ? {
      layoutAudit:auditLayoutClass(w,ev),exploration:w.exploration,statePolicy:w.statePolicy,
      unknownGates:{count:(w.unknownGates||[]).length,sources:[...new Set((w.unknownGates||[]).map(hxA))].slice(0,64)},
      decoderWarnings:{count:(w.decoderWarnings||[]).length,sources:[...new Set((w.decoderWarnings||[]).map(x=>x?.at??x?.source??x?.pc).filter(x=>x!==undefined&&x!==null).map(x=>typeof x==='number'?hxA(x):String(x)))].slice(0,64)},
      walkerVersion:32,buildId:'v32-static-layout-audit-v1',byteSource:'candidate-rom',emulatorFrames:0,
      outputFormat:'v32-layout-audit-compact',outputScope:'bounded static flow; no pages, glyph trace, graph, event replay, or pixel proof'
    } : COMPACT ? { ...w,
      balloonCount: (w.balloons || []).length,
      unknownWindowBalloonCount: (w.balloons || []).filter(b => !b.window?.confirmed).length,
      // 창 행(전 풍선): [대사주소, 일본어, 갈래, 창설정주소, 상속원본 이벤트, sizeIndex, cols, rows, status, src] — 조건별 행 출력(사용자 설계 6항)
      windows: (w.balloons || []).filter(b => !b.residual).map(b => [b.at || b.openAt || '', (b.jp || '').slice(0, 24), b.fork ? 1 : 0,
        b.window?.setAt || '', b.window?.setEvent || '', b.window?.sizeIndex ?? '', b.window?.cols ?? '', b.window?.rows ?? '',
        b.window ? (b.window.confirmed ? (b.window.observedOnly ? 'observed' : (ev >= RAW_BASE ? 'seed' : 'static')) : (b.window.src === 'default' ? 'root-inherited' : (b.window.src === '3C-menu' ? 'menu' : 'unknown'))) : 'none', b.window?.src || '']),
      balloons: (w.balloons || []).filter(b => (b.flags || []).length),
      // WALK_SAVE_PAGES=1: 전 풍선의 예측 줄(페이지)과 행 조각을 남긴다 — 실기 캡처 줄과 대조해 재현율·행 귀속을 재는 용도
      // WALK_SAVE_PAGES=1: 전 풍선(창 미확정 포함, 상태 표기)의 예측 줄·행 조각·플래그 — 정적 전수 렌더 덤프(사용자 2026-09-06 「모든 분기 말풍선을 정적으로 출력」)
      ...(process.env.WALK_SAVE_PAGES === '1' ? { pagesAll: (w.balloons || []).filter(b => !b.residual).map(b => ({ at: b.at || b.openAt, open: b.openAt, w: b.window ? [b.window.cols, b.window.rows, b.window.src, b.window.confirmed ? (b.window.observedOnly ? 'observed' : (ev >= RAW_BASE ? 'seed' : 'static')) : 'unconfirmed'] : [0, 0, 'none', 'none'], fork: b.fork ? 1 : 0, branchId: b.branchId ?? 0, witnessBranches: b.witnessBranches, ownerEvent: b.ownerEvent, contextEvent: b.contextEvent, ...((TRACE_GLYPHS && process.env.WALK_SAVE_TRACE === '1')?{glyphs:b.glyphs}:{}), runtimeTerms:b.runtimeTerms||[], assumptions: b.assumptions || [], windowSetAt: b.window?.setAt ?? null, windowSetEvent: b.window?.setEvent ?? null, windowSizeIndex: b.window?.sizeIndex ?? null, layoutControls: b.layoutControls || [], pages: b.pages, pagesExact: b.pagesExact, ...(b.budgetCutAll ? { budgetCut: [...new Set(b.budgetCuts)] } : {}), textComplete: b.textComplete, layoutComplete: b.layoutComplete, layoutHolds: b.layoutHolds, evictions: b.evictions || [], unresolvedTokens: b.unresolvedTokens, linesExact: b.linesExact, waits: b.waits, options: b.options, cursor: b.cursor, geometryObservation: b.geometryObservation, windowSlot: b.window?.slot, windowInstance: b.instanceId, windowPosition: b.window?.position, reselects: b.reselects || [], layoutPolicy: b.layoutPolicy, flags: b.flags || [], segs: (b.segs || []).map(g => g.length > 2 ? [g[0], g[1], g[2]] : [g[0], g[1]]) })) } : {}),
      ...(LAYOUT_AUDIT?{layoutAudit:auditLayoutClass(w,ev)}:{}),
      walkerVersion: 32, buildId: 'v32-static.5', byteSource:'candidate-rom', emulatorFrames:0, textCompleteDefinition: 'no unresolved runtime-memory, custom-name or glyph-assignment token in this balloon; NOT complete event or pixel proof; a page with budgetCut was witnessed only by paths stopped by an exploration budget, so its text may be a prefix', layoutCompleteDefinition: 'no currently recorded macro/geometry/overlap hold; NOT an exhaustiveness, path, position or pixel certificate', outputScope: 'bounded native-flow candidates; pagesAll includes unconfirmed/observed geometry; no pixel proof' } : w;
    if(COMPACT&&!LAYOUT_AUDIT){
      // These were duplicated internal references. All dialogue candidates,
      // holds, path graphs, glyphs, conditions and state resolutions are retained.
      delete item.balloons;delete item.endBalloon;delete item.endBalloonRaw;delete item.windows;
      item.outputFormat='v32-class-streamed';
      item.omittedInternalDuplicates=['balloons (use pagesAll)','endBalloon','endBalloonRaw','windows (use pagesAll)'];
    }
    writeSync(output,(classesWritten++?',\n':'')+JSON.stringify(CLASSES[cls])+':'+JSON.stringify(item));
  }
  writeSync(output,'\n}');
  if(++done%100===0)console.error(`walk events ${done}/${events.length}`);
}writeSync(output,'\n}\n');}finally{closeSync(output);}
renameSync(OUT+'.partial',OUT);console.log('→',OUT);
