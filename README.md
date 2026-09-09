# ぼくのロマサガ3 한국어 패치

로맨싱 사가 3 개조판 「ぼくのロマサガ3」(ぼくのProto1.123)를 한국어로 옮긴 xdelta 패치입니다. 패치 파일만 배포하며 롬은 포함하지 않습니다.

> **피드백·버그 제보는 Discord 로**: **https://discord.gg/3qQ3drmwQV** (장면·대사·창 이름과 스크린샷을 함께 올려 주세요)

| | |
|---|---|
| **현재 판** | **v0.97** (2026-09-10, 검수 후보) |
| **다운로드** | [bokuno_ko_batch5z_20260910_97.xdelta](https://github.com/beck4679-alt/bokuno-rs3-ko/releases/download/v0.97/bokuno_ko_batch5z_20260910_97.xdelta) · [변경 내역](https://github.com/beck4679-alt/bokuno-rs3-ko/releases/tag/v0.97) |
| **피드백** | [Discord](https://discord.gg/3qQ3drmwQV) · [GitHub Issues](https://github.com/beck4679-alt/bokuno-rs3-ko/issues) — 장면(마을·상대·창)과 스크린샷을 함께 올려 주세요 |

## 준비물

| 순서 | 파일 | 구하는 곳 |
|---|---|---|
| 1 | 『ロマンシング サ・ガ3』 일본판 롬 **v1.1**, 헤더 없음 (4,194,304 B) | 직접 준비 |
| 2 | 원작 보쿠노 패치 `ぼくの（略更新.rar` (IPS) | [원작 패치 배포처](https://ux.getuploader.com/romancingsaga312/download/560) |
| 3 | 한국어 패치 `bokuno_ko_batch5z_20260910_97.xdelta` | [Releases](https://github.com/beck4679-alt/bokuno-rs3-ko/releases/latest) |
| 도구 | [7-Zip](https://www.7-zip.org/) (rar 풀기) · [Flips](https://github.com/Alcaro/Flips) (IPS 적용) · [xdelta3](https://github.com/jmacd/xdelta) 또는 xdelta 지원 GUI 패처 | |

적용 순서는 **일본판 v1.1 → 원작 보쿠노 패치(IPS) → 한국어 패치(xdelta)** 입니다. 단계마다 SHA256 을 맞춰 보면 실패 지점을 바로 알 수 있습니다.

## 적용

### 1. 원본 롬 확인 — v1.1, 헤더 없음

저자 안내(パッチ概要.txt): 「パッチはRomancing Saga 3 v1.1（素ロム）に当ててください。」 v1.0 에 적용하면 롬이 만들어지긴 해도 91,410 바이트가 어긋나 한국어 패치 대상이 아닙니다.

```powershell
$b = [IO.File]::ReadAllBytes('Romancing Saga 3 (J).sfc')
$b.Length                 # 4194304 이어야 함. 4194816 이면 512 B 헤더가 붙은 파일
'{0:X2}' -f $b[0xFFDB]    # 01 = v1.1 (Rev 1), 00 = v1.0
```

헤더(512 B)가 붙어 있으면 잘라냅니다.

```powershell
[IO.File]::WriteAllBytes('rs3_v11_noheader.sfc', $b[512..($b.Length-1)])
```

### 2. 원작 보쿠노 패치 적용 (IPS)

1. [원작 패치 배포처](https://ux.getuploader.com/romancingsaga312/download/560)에서 `ぼくの（略更新.rar` 를 받아 7-Zip 으로 풉니다. 안에 본편 패치 `ぼくのProto1.123.ips`(5,551,154 B), 저자 설명(`パッチ概要.txt`, `テキスト/`), 비추천 에뮬레이터용 BGM 패치(`【非推奨環境用】音割れ改善パッチ1.0h.ips`)가 들어 있습니다.
2. Flips 로 `ぼくのProto1.123.ips` 를 1 의 롬에 적용합니다. 결과는 **8,388,608 B** 입니다. 이 파일이 `ぼくのProto1.123.smc` 입니다(파일명은 자유).
3. 롬과 같은 폴더에 같은 이름의 `.ips` 를 두지 마세요. 저자 주의: 「winipsを使う場合はパッチ適用後ipsファイルをリネームするか移動または削除するのをお勧めします。」
4. 확인: `Get-FileHash -Algorithm SHA256 'ぼくのProto1.123.smc'` 가 `4793E1422295B8C13BA81B070B941288D36BE339FF20F914652CE63CC06F2DA0` 이면 정상입니다.

### 3. 한국어 패치 적용 (xdelta)

```text
xdelta3 -d -s ぼくのProto1.123.smc bokuno_ko_batch5z_20260910_97.xdelta bokuno_ko.smc
```

결과 SHA256 이 `C9B571DBED574D79C5DE93F1D1016268D0BAD1647F9EAF5466F16A9CB8B4169F` 이면 정상입니다.

누적 패치입니다. 이전 한국어판에 덧씌우지 말고 항상 2 의 원본에 직접 적용하세요.

### 4. 에뮬레이터·BGM

- 저자 권장 에뮬레이터는 uosnes(20100514~20100531)입니다. 다른 에뮬레이터에서는 일부 아이콘·BGM 이 정상 재생되지 않을 수 있다고 안내합니다.
- Snes9x 1.60 이상: 「Emulation → Hacks → Separate echo buffer from RAM」 을 켜면 BGM 문제가 해결됩니다(저자 FAQ).
- 그래도 특정 BGM 이 깨지면 rar 에 동봉된 `【非推奨環境用】音割れ改善パッチ1.0h.ips` 를 **한국어 패치를 적용한 뒤** 결과 롬에 추가로 적용하세요. 사운드 설정 30 바이트(0x44FEC0~0x44FF24)만 바꾸며 한국어 패치와 겹치지 않습니다. 순서가 바뀌면 2 의 SHA256 이 달라집니다.

### 5. 세이브 데이터

- 저자 안내: 「Verを更新する際は必ず素ROM(ヘッダ無しv1.1)を使用し、ニューゲーム(周回問わず)で始めてください。」 새로 시작하는 것을 권장합니다.
- 일본어판 세이브(SRM)를 그대로 써도 진행은 되지만, 사용자 지정 이름에 「업」「떠」가 든 경우는 v0.85 의 글자 배정 변경으로 호환성을 확인하지 못했습니다.

## 이번 판 (v0.97)

대사 창의 줄 배분을 원문 기준으로 다시 맞춘 판입니다. v0.94 까지의 수리를 그대로 포함합니다.

- 원문 한 줄 폭을 에뮬레이터로 다시 재어 보니 창 열수보다 한 글자 넓었습니다(9×3 창 10자, 14×4 창 15자). 이전 판들의 대조 잣대는 이를 한 글자 좁게 보아 원문 줄 수를 부풀렸고, 그 결과 한국어가 원문보다 잘게 나뉜 곳이 있었습니다. 잣대를 고치고 그 여파를 되돌렸습니다: 한국어 줄이 원문보다 많은 행 묶음 625 → 173, 그 때문에 창을 넘기던 곳 48 → 9, 원문은 안 넘기는데 한국어만 넘기던 창 65 → 18 (줄 배분 534건은 심사자 검토를 거쳤습니다).
- 후작 의뢰 장면에서 주인공과 무관하게 「공주 님 친히 하시는」 줄이 끼어들던 문안 오류(모니카는 같은 줄이 두 번)를 고쳤습니다. 여러 문맥이 공유하는 행 5곳의 줄 배분도 손봤습니다.
- 「알 겠다」「눈감 아 줘」처럼 낱말 가운데 공백이 들어간 2행을 고쳤습니다.
- v0.94: 선택지 강조(빨간 줄) 표시 13곳 수리. v0.92: 대사 줄 배분 전수 대조·수리.
- 검증: 안전 빌드 7관문, 에뮬레이터 이벤트 31개 관문, 제어 바이트 무손상, 비대사 표 654항목 되읽기 일치, 에뮬레이터 표적 재검 19곳, 독립 디코더로 패치 복원 SHA256 일치.

## 알려진 제한

- 작명 화면의 가나 자판은 한글 입력을 지원하지 않습니다(임의 음절이 뜹니다).
- 한국어가 원문보다 한 줄 더 넘기는 창이 128곳 남아 있습니다(주로 주인공·파티원 이름 길이에 따라 줄이 갈리는 창, 오프닝 캐릭터 소개, 행 안에서 창을 다시 여는 대사).
- 영지 경영 목록 창(6×6·14×4)에서 항목이 같은 줄에 붙는 곳 3군데, 트레이드(회사 경영) 화면의 자연 진입 후 전체 창 배치, 실제 승리→성장 풍선 흐름, 7×1 영지 경영 창, 15×12 상태표의 이름·숫자 폭은 미측정입니다.
- 검수 후보 단계입니다. 전체 무결함 판정이 아닙니다.

## 판 이력

| 판 | 빌드 | 날짜 | 요약 |
|---|---|---|---|
| [v0.97](https://github.com/beck4679-alt/bokuno-rs3-ko/releases/tag/v0.97) | batch5z_20260910_97 | 2026-09-10 | 원문 줄 폭 정정과 줄 배분 되돌리기, 후작 의뢰 문안 오류 수리 |
| [v0.94](https://github.com/beck4679-alt/bokuno-rs3-ko/releases/tag/v0.94) | batch5z_20260909_94 | 2026-09-09 | 선택지 강조(빨간 줄) 표시 수리 |
| [v0.92](https://github.com/beck4679-alt/bokuno-rs3-ko/releases/tag/v0.92) | batch5z_20260909_92 | 2026-09-09 | 대사 창 줄 배분 전수 대조·수리 |
| [v0.85](https://github.com/beck4679-alt/bokuno-rs3-ko/releases/tag/v0.85) | batch5z_20260908_85 | 2026-09-08 | 트레이드(회사 경영) UI·진형 표 한국어화 |
| [v0.81](https://github.com/beck4679-alt/bokuno-rs3-ko/releases/tag/v0.81) | batch5z_20260908_81 | 2026-09-08 | 이벤트 목록·마스 배틀·기술/술법 설명문 등 비대사 표 한국어화 |
| [v0.78](https://github.com/beck4679-alt/bokuno-rs3-ko/releases/tag/v0.78) | batch5z_20260908_78 | 2026-09-08 | 첫 공개판 |

## 파일

| 파일 | 크기 | SHA256 |
|---|---|---|
| bokuno_ko_batch5z_20260910_97.xdelta | 635,764 B | `5b8c171103a44ae6eed9a64b883e795665852e04e419ab984df7209200fa268e` |
| 원본 ぼくのProto1.123.smc (적용 전) | 8,388,608 B | `4793E1422295B8C13BA81B070B941288D36BE339FF20F914652CE63CC06F2DA0` |
| 결과 bokuno_ko.smc (적용 후) | 8,388,608 B | `C9B571DBED574D79C5DE93F1D1016268D0BAD1647F9EAF5466F16A9CB8B4169F` |

저장소에도 최신 xdelta 한 벌을 두었습니다([예비 다운로드](https://github.com/beck4679-alt/bokuno-rs3-ko/raw/main/bokuno_ko_batch5z_20260910_97.xdelta)). 이전 판은 각 Release 에서 받을 수 있습니다.

## 피드백

- Discord: https://discord.gg/3qQ3drmwQV — 장면(어느 마을·누구와 대화·어느 창)과 스크린샷을 함께 올려 주세요.
- GitHub Issues: https://github.com/beck4679-alt/bokuno-rs3-ko/issues

## 고지

- 원작 「ぼくのロマサガ3」 는 원저자의 작품입니다. 원작 패치와 설명은 [원작 배포처](https://ux.getuploader.com/romancingsaga312/download/560)와 [위키](https://www.wikihouse.com/bokuno/)를 참고하세요.
- 이 저장소는 비공식 팬 번역 패치만 배포합니다. 롬 파일은 배포하지 않으며 요청에도 응하지 않습니다.
