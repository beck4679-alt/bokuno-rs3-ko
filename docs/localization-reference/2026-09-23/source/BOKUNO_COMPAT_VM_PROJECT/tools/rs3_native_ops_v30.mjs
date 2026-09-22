import { createEventIdentity } from './rs3_event_identity_v30.mjs';
// v30: count=0 in opcode48 copies one byte (C0:220B..2223).
// rs3_native_ops_v1.mjs — 롬 바이트 직독 op 해독기 (계정서 불요).
//
// 재는 것: 파일 오프셋 a 에서 엔진이 읽을 명령 하나 — 길이·종류(text/cmd)·이름·피연산자(관문 범위·변수 쓰기).
//   길이 출처: 위키 argcounts(rs3steam/rs3_wiki_op_argcounts_v1.json) + tools/rs3_vm.py CONTROL_LEN/CONTROL_4F(용례 확정)
//   + 0D 모드표(rs3steam/walk_bokuno_event_scripts_v1.py D_MODE_LEN, 실기 페치 순서 실측) + 49 모드 의존(00-03:4B·04/05:3B, 721376 실증)
//   + 48 가변(3+count). 진입점: 롬 이벤트 표(body_of — 3A/3B/3C 페이지·0C00/0E00/0F00 3바이트 표).
// 못 재는 것: 0D 20(3+2N, N 은 배우 메타 = 램)·0D 19 간접 호출 목표(램 포인터)·미지 4F 부호 — null 을 돌려주고 호출자가 그 경로를 끊는다.
//   의미(관문/쓰기 규칙)는 워커가 갖는다; 여기는 바이트 → 토큰만.
// 왜 계정서를 안 쓰나(사용자 2026-09-06): 엔진이 롬의 어디를 읽고 창을 열고 글리프를 찍는지 다 안다 — 진입점에서 흐름을 따라가며
//   그 자리 바이트만 해독하면 정렬 문제가 없다(옛 WALK_ROM_OPS 는 구간을 선형 파싱해 자료표까지 op 로 읽어서 실패했다).
//   계정서(스팀 이식 산물)는 덮은 구간(3,922행 미포함)·관문 집합(0D 09 누락)에서 우리보다 좁다.

export const D_MODE_LEN = {
  0x00: 4, 0x01: 4, 0x02: 4, 0x03: 4, 0x04: 3, 0x05: 3, 0x06: 3, 0x07: 3, 0x08: 3, 0x09: 3, 0x0a: 3, 0x0b: 2, 0x0c: 3,
  0x0d: 3, 0x0e: 3, 0x0f: 5, 0x10: 3, 0x11: 6, 0x12: 2, 0x13: 2, 0x14: 2, 0x15: 3, 0x16: 4, 0x17: 5, 0x18: 5, 0x19: 3,
  0x1a: 4, 0x1b: 3, 0x1c: 2, 0x1d: 3, 0x1e: 2, 0x1f: 3, 0x2d: 3, 0x2f: 2, 0x30: 4, 0x31: 4, 0x32: 3, 0x33: 3,
  0x3a: 8, 0x3b: 2, 0x3c: 3, 0x3d: 3, 0x3e: 3, 0x3f: 2,
};
for (let m = 0x21; m <= 0x2c; m += 1) D_MODE_LEN[m] = 2;
D_MODE_LEN[0x2e] = 2;
for (let m = 0x34; m <= 0x39; m += 1) D_MODE_LEN[m] = 2;
for (let m = 0x40; m <= 0x4f; m += 1) D_MODE_LEN[m] = 2;
// 0x20 = 3+2N (동적) → 없음

export const D_MODE_NAME = {
  0x00: 'chk4', 0x01: 'chk01', 0x03: 'set4', 0x04: 'op04', 0x05: 'op05', 0x06: 'spkname', 0x07: 'inparty?', 0x08: 'removePartyActor',
  0x09: 'inparty_id?', 0x0a: 'removePartyBlockId', 0x0b: 'op0B', 0x0c: 'op0C_id', 0x0d: 'op0D3', 0x0e: 'clearHighNibble', 0x0f: 'op0F5',
  0x10: 'checkHighNibble', 0x11: 'op11', 0x12: 'wait12', 0x13: 'yield13', 0x14: 'op14', 0x16: 'jump16', 0x17: 'jumpL', 0x18: 'callL',
  0x19: 'callIndirect', 0x1a: 'op1A', 0x1b: 'selectActorSaveState', 0x1c: 'markActorUsed', 0x1d: 'registerActor', 0x1e: 'restoreActorState',
  0x1f: 'loadActorReward', 0x20: 'skipActorInlineTable', 0x2d: 'insertActorName', 0x2f: 'format24BitText', 0x30: 'swapOut', 0x31: 'swapBack',
  0x32: 'moveTo32', 0x33: 'evBattle33', 0x3b: 'op3B', 0x3c: 'findNormalObject?', 0x3d: 'findSpecialObject?', 0x3e: 'resolveObject', 0x3f: 'partyBitEvent?',
};

// tools/rs3_vm.py CONTROL_LEN (용례 확정 길이) — 48 은 가변, 4F 는 부호표, 49 는 모드 의존이라 아래서 따로.
export const CONTROL_LEN = {
  0x00: 2, 0x01: 2, 0x02: 2, 0x03: 2, 0x04: 2, 0x05: 2, 0x06: 2, 0x07: 2, 0x08: 2, 0x09: 2, 0x0a: 2, 0x0b: 2,
  0x0c: 2, 0x0e: 2, 0x0f: 2, 0x10: 2, 0x11: 2, 0x12: 2, 0x13: 2, 0x14: 2, 0x15: 2, 0x16: 2, 0x17: 2, 0x1a: 2, 0x1b: 2, 0x1c: 2,
  0x1d: 2, 0x1e: 2, 0x1f: 2, 0x24: 1, 0x25: 1, 0x26: 1, 0x27: 1, 0x28: 1, 0x29: 1, 0x2a: 1, 0x2b: 2, 0x2c: 1, 0x2d: 1, 0x2e: 1,
  0x2f: 1, 0x30: 1, 0x31: 1, 0x32: 3, 0x33: 3, 0x34: 3, 0x35: 3, 0x36: 3, 0x37: 2, 0x38: 2, 0x39: 2, 0x3a: 2, 0x3b: 2, 0x3c: 4,
  0x3d: 3, 0x3e: 3, 0x3f: 2, 0x40: 3, 0x41: 4, 0x42: 2, 0x43: 1, 0x44: 1, 0x45: 3, 0x46: 1, 0x47: 1, 0x4a: 2, 0x4b: 2, 0x4c: 1,
  0x4d: 1, 0x4e: 2, 0x50: 1,
};
export const CONTROL_4F = {
  0x00: 3, 0x01: 3, 0x02: 3, 0x03: 4, 0x04: 5, 0x05: 7, 0x06: 2, 0x07: 2, 0x08: 3, 0x09: 4, 0x0a: 5, 0x0b: 2, 0x0c: 2, 0x0d: 2,
  0x0e: 3, 0x0f: 3, 0x10: 2, 0x11: 2, 0x12: 3, 0x13: 3, 0x14: 3, 0x15: 3, 0x16: 3, 0x17: 5, 0x18: 3, 0x19: 2, 0x1a: 2, 0x1b: 2,
  0x1c: 4, 0x1d: 2, 0x1e: 4, 0x1f: 4, 0x20: 4, 0x21: 4, 0x22: 5, 0x23: 5, 0x24: 2, 0x25: 2, 0x26: 2, 0x27: 2, 0x28: 5, 0x29: 4,
  0x2a: 4, 0x2b: 4, 0x2c: 4, 0x2d: 3, 0x2e: 4, 0x2f: 3, 0x30: 4, 0x31: 8, 0x32: 2, 0x33: 2, 0x34: 3, 0x35: 3, 0x36: 3, 0x37: 2,
  0x38: 2, 0x39: 3, 0x3a: 2, 0x3b: 4, 0x3c: 2, 0x3d: 2, 0x3e: 2, 0x3f: 3, 0x40: 2, 0x41: 3, 0x42: 2, 0x43: 3, 0x44: 3, 0x45: 4,
  0x46: 2, 0x47: 3, 0x48: 2, 0x49: 2, 0x4a: 2, 0x4b: 2, 0x4c: 2, 0x4d: 4, 0x4e: 4, 0x4f: 2, 0x50: 2, 0x51: 3, 0x52: 2, 0x53: 2,
  0x54: 3, 0x55: 3, 0x56: 4, 0x57: 3,
};
// 이름: 계정서가 쓰던 표(out/op_note_table_v1.json)와 같은 문자열 — 워커의 note 분기가 이 이름을 본다.
export const VAN_NAME = {
  0x0b: 'syscall', 0x11: 'mapJump', 0x17: 'objOp', 0x24: 'nl', 0x25: 'optA', 0x26: 'optB', 0x27: 'optC', 0x28: 'winSelf', 0x29: 'winOther',
  0x2a: 'closeWin', 0x2b: 'wait', 0x2c: 'pause', 0x2e: 'endMes', 0x2f: 'selGoto', 0x32: 'op32', 0x33: 'chkFlag', 0x34: 'chkBit', 0x35: 'op35',
  0x36: 'setFlag', 0x37: 'op37', 0x38: 'op38', 0x39: 'op39', 0x3a: 'op3A', 0x3b: 'op3B', 0x3c: 'specialWin', 0x40: 'set1B', 0x41: 'set2B',
  0x42: 'getItem', 0x43: 'end', 0x45: 'chkMem', 0x48: 'fill', 0x4a: 'spk4A', 0x4b: 'opponent', 0x4d: 'win4D', 0x4e: 'skip', 0x50: 'op50',
};
const OP49_NAME = { 0x00: 'op49_00_check', 0x01: 'op49_01_bitcheck', 0x02: 'op49_02_bitwrite', 0x03: 'op49_03_write', 0x04: 'op49_04_inc', 0x05: 'op49_05_dec' };

export const cpuToFile = (bank, addr) => {
  if (bank >= 0x40 && bank <= 0x7d) return 0x400000 + (((bank - 0x40) << 16) | addr);
  if (bank >= 0xc0 && bank <= 0xff) return ((bank - 0xc0) << 16) | addr;
  return null;
};
const hx = (x) => x.toString(16).padStart(2, '0');

export function createNativeOps(rom, opts = {}) {
  const argMain = opts.argMain || {};
  const sub4F = opts.sub4F || {};
  const opNote = opts.opNote || {};     // out/op_note_table_v1.json (있으면 이름 보강)
  // 글자 대역: 0x51~ 1바이트, 20~23 폰트 페이지 2바이트, 18xx/46xx 보쿠노 확장 글자 2바이트. 0x50 공백은 명령(op50).
  //   0x19~0x1E 는 글자가 아니라 2바이트 명령(전투/BGM/효과음 — rs3_vm CONTROL_LEN; 계정서 1,203,885 op 대조에서 13,028건 확인).
  //   워커의 옛 isText 는 0x19~0x1E 까지 글자로 봤다 — 계정 경로에선 계정 kind 를 써서 드러나지 않았다.
  const isText = (b) => b >= 0x51 || (b >= 0x20 && b <= 0x23) || b === 0x18 || b === 0x46;
  const glyphLen = (b) => (b >= 0x51) ? 1 : 2;
  const opLenAt = (a) => {                              // 워커의 옛 opLenAt 과 같은 뜻 + rs3_vm/0D/49/48 규칙
    const b = rom[a];
    if (b === undefined) return null;
    if (isText(b)) return glyphLen(b);
    if (b === 0x0d) { const m = rom[a + 1]; if (m === 0x20) return null; return D_MODE_LEN[m] ?? null; }
    if (b === 0x3c) return rom[a + 1] === 0xff ? 3 : 4; // C0:3358 skips Y when X=FF
    if (b === 0x48) return 3 + Math.max(1,rom[a + 2]);
    if (b === 0x4f) { const s = rom[a + 1]; return CONTROL_4F[s] ?? (sub4F[s] !== undefined ? 2 + sub4F[s] : null); }
    if (b === 0x49) { const m = rom[a + 1]; return m <= 0x03 ? 4 : (m === 0x04 || m === 0x05) ? 3 : 2; }
    if (CONTROL_LEN[b] !== undefined) return CONTROL_LEN[b];
    if (argMain[b] !== undefined) return 1 + argMain[b];
    return null;
  };
  const operandOf = (a, b) => {
    const b1 = rom[a + 1], b2 = rom[a + 2], b3 = rom[a + 3];
    if (b === 0x33) return { space: 'flag.vanilla', id: b1, window: b2, rangeStart: b2 >> 4, rangeEnd: b2 & 0xf, write: false };
    if (b === 0x34) return { space: 'flag.vanilla', id: b1, window: b2, write: false };
    if (b === 0x35) return { space: 'flag.vanilla', id: b1, operation: (b2 & 0x80) ? 'or' : 'and', mask: b2 & 0x0f, rawArg: b2, write: true };
    if (b === 0x36) return { space: 'flag.vanilla', id: b1, operation: 'set', value: b2, write: true };
    if (b === 0x37 || b === 0x38) return { space: 'flag.vanilla', id: b1, operation: b === 0x37 ? 'inc' : 'dec', delta: b === 0x37 ? 1 : -1, write: true };
    if (b === 0x49) {
      if (b1 === 0x00 || b1 === 0x03) return { space: 'flag.packed4', id: b2, window: b3, write: b1 === 0x03, ...(b1===3?{operation:'set',value:b3&15}:{}), subop: b1 };
      if (b1 === 0x01) return { space: 'flag.packed4', id: b2, operation: 'bit-any', mask: b3 & 0x0f, invert: !!(b3 & 0x80), rawArg: b3, write: false, subop: 1 };
      if (b1 === 0x02) return { space: 'flag.packed4', id: b2, operation: (b3 & 0x80) ? 'or' : 'and', operand: b3 & 0x0f, rawArg: b3, write: true, subop: 2 };
      if (b1 === 0x04 || b1 === 0x05) return { space: 'flag.packed4', id: b2, write: true, operation: b1 === 0x04 ? 'inc' : 'dec', delta: b1 === 0x04 ? 1 : -1, saturatingRange: [0, 15], subop: b1 };
      return null;
    }
    if (b === 0x0d) {
      if (b1 === 0x00) return { space: 'flag.ext', id: b2, window: b3, rangeStart: b3 >> 4, rangeEnd: b3 & 0xf, write: false, subop: 0 };
      if (b1 === 0x01) return { space: 'flag.ext', id: b2, operation: 'bit-any', mask: b3 & 0x0f, invert: !!(b3 & 0x80), rawArg: b3, write: false, subop: 1 };
      if (b1 === 0x03) return { space: 'flag.ext', id: b2, operation: 'set', value: b3 & 0x0f, rawArg: b3, write: true, subop: 3 };
      return null;
    }
    return null;
  };
  const noteOf = (a, b) => {
    if (b === 0x0d) { const m = rom[a + 1]; return D_MODE_NAME[m] || ('nop' + hx(m).toUpperCase()); }
    if (b === 0x4f) return '4F_' + hx(rom[a + 1]).toUpperCase();
    if (b === 0x49) return OP49_NAME[rom[a + 1]] || ('op49_' + hx(rom[a + 1]));
    if (VAN_NAME[b]) return VAN_NAME[b];
    const e = opNote[hx(b)]; if (e && e[1]) return e[1];
    return 'op' + hx(b).toUpperCase();
  };
  // 한 op. 길이를 모르면 { len: 0, note: 'unknown' } — 호출자가 경로를 끊고 센다.
  const opAt = (a) => {
    if (a < 0 || a >= rom.length) return null;
    // v21: 이벤트 포인터 페이지(3A/3B/3C 뱅크 앞 0x800)는 스크립트가 아니다 — 앞 뱅크 끝에서 낙수해 들어오면 자료를 op 로 읽는다(03F1 → 3B00E7). 미지로 돌려 경로를 끊는다.
    if ((a & 0xffff) < 0x800 && ((a >> 16) === 0x3a || (a >> 16) === 0x3b || (a >> 16) === 0x3c)) return { off: a, len: 0, kind: 'cmd', note: 'unknown', hex: 'pointer-page' };
    const b = rom[a];
    if (isText(b)) {
      let q = a; while (q < rom.length && isText(rom[q])) q += glyphLen(rom[q]);
      return { off: a, len: q - a, kind: 'text', note: '', hex: '' };
    }
    if (b === 0x00 && rom[a + 1] === 0x00) return { off: a, len: 2, kind: 'cmd', note: 'pad', hex: '00 00' };
    const len = opLenAt(a);
    if (len === null || len === undefined || a + len > rom.length) return { off: a, len: 0, kind: 'cmd', note: 'unknown', hex: b === undefined ? '' : hx(b) + ' ' + hx(rom[a + 1] ?? 0) };
    const op = { off: a, len, kind: 'cmd', note: noteOf(a, b), hex: Array.from(rom.subarray(a, a + len)).map(hx).join(' ') };
    const oo = operandOf(a, b); if (oo) op.operand = oo;
    return op;
  };
  // Catalog 0Fxx is a tooling alias for native 4Cxx. Operand event IDs
  // must use rangeOfNative, not the catalog alias mapping.
  const identity=createEventIdentity(opts.dispatchRom||rom,{guard:false});
  const rangeOf=n=>identity.logicalRange(n);
  const rangeOfNative=n=>identity.nativeRange(n);
  const entryOf = (n) => rangeOf(n)?.start ?? null;
  return { isText, glyphLen, opLenAt, opAt, entryOf, rangeOf, rangeOfNative, operandOf, noteOf };
}
