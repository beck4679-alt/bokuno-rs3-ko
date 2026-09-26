# 설치 가이드

[메인으로](../README.md) · [알려진 문제](KNOWN_ISSUES.md) · [파일 확인 값](FILES.md)

## 준비물

| 순서 | 파일 | 구하는 곳 |
|---|---|---|
| 1 | 『ロマンシング サ・ガ3』 일본판 롬 **v1.1**, 헤더 없음 (4,194,304 바이트) | 직접 준비 |
| 2 | 원작 보쿠노 패치 `ぼくの（略更新.rar` | [원작 패치 배포처](https://ux.getuploader.com/romancingsaga312/download/560) |
| 3 | 한국어 패치 `bokuno_ko_v0.112.xdelta` | [Releases](https://github.com/beck4679-alt/bokuno-rs3-ko/releases/latest) |

필요한 프로그램

- **7-Zip** — rar 압축 풀기: https://www.7-zip.org/
- **RomPatcher.js** — 설치 없이 인터넷 브라우저에서 쓰는 패처(IPS·xdelta 둘 다 됩니다): https://www.marcrobledo.com/RomPatcher.js/
- 브라우저 대신 윈도우 프로그램을 쓰고 싶으면 **Flips**([릴리스](https://github.com/Alcaro/Flips/releases))와 **Delta Patcher**([릴리스](https://github.com/marco-calautti/DeltaPatcher/releases)) — 아래 「방법 B」

순서는 꼭 **일본판 롬 → 원작 보쿠노 패치 → 한국어 패치** 입니다. 한국어 패치는 일본판 롬에 바로 적용할 수 없습니다.

## 적용 방법 A — RomPatcher.js (설치 없음)

### A-1. 압축 풀기와 롬 크기 확인

1. 받은 `ぼくの（略更新.rar` 를 마우스 오른쪽 클릭 → **7-Zip** → **여기에 압축 풀기**. 나온 파일 중 **`ぼくのProto1.123.ips`** 를 씁니다(Windows 11 은 오른쪽 클릭 메뉴의 「추가 옵션 표시」 안에 7-Zip 이 있습니다).
2. 일본판 롬 파일을 마우스 오른쪽 클릭 → **속성** → 「크기」 의 괄호 안 숫자를 봅니다.
   - **4,194,304 바이트**: 그대로 쓰면 됩니다.
   - **4,194,816 바이트**: 앞에 512바이트 헤더가 붙은 파일입니다. A-2 에서 체크 칸 하나로 떼어 낼 수 있습니다.

### A-2. 원작 보쿠노 패치 적용

1. https://www.marcrobledo.com/RomPatcher.js/ 를 엽니다. 흰 상자 위의 「Creator mode」 스위치는 꺼진 채로 둡니다(켜면 패치 만들기 화면으로 바뀝니다).
2. **ROM file** 칸을 눌러 일본판 롬을 고릅니다.
   - 「**Remove SNES copier header**」 체크 칸이 나타나면 **켭니다**(헤더가 붙은 파일일 때만 나타납니다).
   - 「**Add SNES copier header**」 체크 칸이 나타나면 **켜지 마세요**.
3. **Patch file** 칸에서 `ぼくのProto1.123.ips` 를 고릅니다.
4. **Apply patch** 를 누르면 이름 끝에 ` (patched)` 가 붙은 파일이 내려받아집니다(브라우저의 「다운로드」 폴더). 이 파일이 **보쿠노 롬**입니다.
5. 확인: 내려받은 보쿠노 롬을 다시 **ROM file** 칸에 넣으면 아래에 CRC32·SHA-1 이 나옵니다.
   - **CRC32 `7E165025`**, SHA-1 `440DC80F6BC3104E8B021D7564B136A5B0BD4716` 이면 정상입니다.
   - 다르면 일본판 롬이 v1.1 이 아니거나(v1.0 에 적용해도 파일은 만들어지지만 한국어 패치가 맞지 않습니다) 헤더를 떼지 않은 경우입니다.

### A-3. 한국어 패치 적용

1. **ROM file** 칸에 A-2 에서 확인한 보쿠노 롬을 넣습니다. 이번에도 「Add SNES copier header」 는 켜지 마세요.
2. **Patch file** 칸에서 `bokuno_ko_v0.112.xdelta` 를 고릅니다.
3. **Apply patch** 를 누르면 한국어 롬이 내려받아집니다. 파일 이름은 마음대로 바꿔도 됩니다(예: `bokuno_ko.sfc`).
4. 확인: 한국어 롬을 **ROM file** 칸에 넣었을 때 **CRC32 `71FED0E3`**, SHA-1 `9B82F2C53D589E828FFCCE761A079793B4743A8A` 이면 완성입니다.

> 흰 상자 아래 톱니 모양 **Settings** 의 「Fix ROM checksum」 은 켜지 마세요. 켜면 결과가 달라져 위 확인 값과 맞지 않습니다.

## 적용 방법 B — 윈도우 프로그램 (Flips + Delta Patcher)

브라우저 대신 프로그램을 쓰는 방법입니다. 결과는 방법 A 와 같습니다. 이 방법은 헤더를 떼어 주지 않으니, 일본판 롬이 4,194,816 바이트이면 방법 A 를 쓰세요.

### B-1. 원작 보쿠노 패치 — Flips

1. [Flips 릴리스](https://github.com/Alcaro/Flips/releases)에서 윈도우용 zip 을 받아 압축을 풀고 **flips.exe** 를 실행합니다.
2. **Apply Patch** 를 누르면 파일 고르는 창이 세 번 차례로 뜹니다.
   1. 「Select Patches to Use」 → `ぼくのProto1.123.ips`
   2. 「Select File to Patch」 → 일본판 롬
   3. 「Select Output File」 → 저장할 이름(예: `bokuno.sfc`). 이 파일이 **보쿠노 롬**입니다.

### B-2. 한국어 패치 — Delta Patcher

1. [Delta Patcher 릴리스](https://github.com/marco-calautti/DeltaPatcher/releases)에서 `windows_bin_x86_64.zip` 을 받아 압축을 풀고 실행합니다.
2. **Original file** 오른쪽 단추로 B-1 에서 만든 보쿠노 롬을 고릅니다.
3. **XDelta patch** 오른쪽 단추로 `bokuno_ko_v0.112.xdelta` 를 고릅니다.
4. **Apply patch** 를 누르면 「Patch successfully applied!」 가 뜨고 끝납니다.

> **주의**: Delta Patcher 는 기본 설정에서 **고른 보쿠노 롬 파일 자체를 한국어 롬으로 바꿉니다.** 보쿠노 롬을 남겨 두려면 먼저 파일을 복사해 두거나, 설정 단추의 「Backup original file」 을 켜세요. 켜면 원본은 그대로 두고 이름 끝에 `PATCHED` 가 붙은 한국어 롬이 따로 생깁니다.

### B-3. 결과 확인 — 7-Zip

7-Zip 을 설치하면 파일 오른쪽 클릭 메뉴(Windows 11 은 「추가 옵션 표시」 안)에 **CRC SHA** 가 생깁니다. **CRC SHA → SHA-256** 을 누르면 값이 나옵니다.

| 파일 | SHA-256 |
|---|---|
| 보쿠노 롬 (B-1 결과) | `4793E1422295B8C13BA81B070B941288D36BE339FF20F914652CE63CC06F2DA0` |
| 한국어 롬 (B-2 결과) | `BD52634E345832F6A1CBB46BA7034C844F29B8FB697A362EB8E91F186DC1FB04` |

## 잘 안 될 때

- **한국어 롬 확인 값이 다르다** → 보쿠노 롬 확인 값부터 보세요. 보쿠노 롬이 맞는데 한국어 롬만 다르면 패치 파일을 다시 받으세요.
- **보쿠노 롬 확인 값이 다르다** → 일본판 롬이 v1.1 이 아니거나 헤더가 붙은 파일입니다. 저자 안내: 「パッチはRomancing Saga 3 v1.1（素ロム）に当ててください。」
- **예전 한국어판에 새 패치를 덧씌우면 안 됩니다.** 한국어 패치는 누적판이라 항상 보쿠노 롬에 적용합니다.
- **게임이 일본어로 나온다** → 에뮬레이터에서 한국어 롬이 아닌 다른 파일을 열었는지 확인하세요. 롬과 같은 폴더에 같은 이름의 `.ips` 파일이 있으면 일부 에뮬레이터가 자동으로 덧씌우니 치워 두세요(저자 주의 사항).

## 에뮬레이터·BGM

- 저자 권장 에뮬레이터는 uosnes(20100514~20100531)입니다. 다른 에뮬레이터에서는 일부 아이콘·BGM 이 정상 재생되지 않을 수 있다고 안내합니다.
- Snes9x 1.60 이상: 「Emulation → Hacks → Separate echo buffer from RAM」 을 켜면 BGM 문제가 해결됩니다(저자 FAQ).
- 그래도 특정 BGM 이 깨지면 rar 에 들어 있는 `【非推奨環境用】音割れ改善パッチ1.0h.ips` 를 **한국어 롬에** 추가로 적용하세요(방법 A 의 RomPatcher.js 나 Flips 로, ROM file 에 한국어 롬·Patch file 에 이 ips). 사운드 설정만 바꾸며 한국어 패치와 겹치지 않습니다. 이 패치를 적용한 롬은 위 확인 값과 달라지는 것이 정상입니다.

## 세이브 데이터

- 저자 안내: 「Verを更新する際は必ず素ROM(ヘッダ無しv1.1)を使用し、ニューゲーム(周回問わず)で始めてください。」 새로 시작하는 것을 권장합니다.
- 일본어판 세이브(SRM)를 그대로 써도 진행은 되지만, 사용자 지정 이름에 「업」「떠」가 든 경우는 v0.85 의 글자 배정 변경으로 호환성을 확인하지 못했습니다.
- v0.104~v0.110 에서는 기존 글자의 번호가 바뀌지 않았습니다(v0.105 는 빈 번호에만 새 글자 추가).
- v0.112 는 v0.111 과 글자 배정이 같습니다.
- v0.111 은 대사에만 쓰는 2바이트 칸 16칸의 글자가 바뀌었습니다(기존 글자 3자 번호 이동·6자 제외·7자 추가). 이름 자판이 쓰는 1바이트 칸은 v0.110 과 같습니다.
