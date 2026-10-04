# 보쿠노 로맨싱 사가 3 한국어 패치

로맨싱 사가 3 개조판 **「ぼくのロマサガ3」(ぼくのProto1.123)** 의 한국어 패치입니다.

> **피드백·버그 제보는 Discord 로**: **https://discord.gg/3qQ3drmwQV** (장면·대사·창 이름과 스크린샷을 함께 올려 주세요)

**[최신 패치 다운로드](https://github.com/beck4679-alt/bokuno-rs3-ko/releases/download/v0.116/bokuno_ko_v0.116.xdelta)** · [설치 가이드](docs/INSTALL.md) · [변경 내역](docs/CHANGELOG.md)

> **v0.116 · 2026.10.05** — 엘렌 등을 동료로 삼은 뒤 그림·LP 가 깨지던 결함을 고쳤습니다. 이전 판 세이브는 불러올 때 자동으로 정리됩니다. 현재 검수 진행 중입니다.

## 시작하기

1. **로맨싱 사가 3 일본판 v1.1** 롬을 준비합니다. 헤더 없는 파일을 사용합니다.
2. [원작 보쿠노 패치](https://ux.getuploader.com/romancingsaga312/download/560)의 **`ぼくのProto1.123.ips`** 를 적용합니다.
3. 위에서 받은 **한국어 패치**를 적용합니다.

**일본판 롬 → 보쿠노 IPS → 한국어 xdelta** 순서입니다. 이전 한국어판에 덧씌우지 마세요.

[처음부터 따라 하는 설치 방법](docs/INSTALL.md) · [파일 확인 값](docs/FILES.md)

## 이번 업데이트

- 엘렌 등을 동료로 삼은 뒤 그림이 다른 인물로 나오거나 LP·HP 가 이상한 값이 되던 결함(특히 2회차)을 고쳤습니다. 한국어 패치의 임시 메모리가 대기 동료 목록과 겹쳐 생긴 문제로, 첫 공개판부터 있었습니다.
- 이전 판에서 만든 세이브를 불러오면 대기 동료 목록에 남은 가짜 기록이 자동으로 지워집니다. 이미 깨진 채로 가입한 동료는 그대로입니다([알려진 문제](docs/KNOWN_ISSUES.md)).

v0.115의 수정(빛모래 로브·방벽파진 등)과 그 이전 수정은 그대로 들어 있습니다. [v0.115 변경](docs/releases/v0.115.md)

v0.115까지의 수정을 포함하는 누적 패치입니다. [자세한 수정·검증 범위](docs/releases/v0.116.md)

## 알려진 제한

한글 이름 직접 입력은 지원하지 않습니다. 일부 대사와 특수 화면은 아직 검수 중입니다. [알려진 문제와 검수 범위](docs/KNOWN_ISSUES.md)를 확인해 주세요.

| 필요한 정보 | 안내 |
|---|---|
| 패치 적용·오류 해결·BGM·세이브 | [설치 가이드](docs/INSTALL.md) |
| 이전 버전 | [전체 릴리스](https://github.com/beck4679-alt/bokuno-rs3-ko/releases) |
| 다른 언어 현지화·구현 참고 자료 | [워커·빌더와 추가 모듈](docs/LOCALIZATION.md) |

## 제보·문의

[Discord](https://discord.gg/3qQ3drmwQV) · [GitHub Issues](https://github.com/beck4679-alt/bokuno-rs3-ko/issues)

사용 버전, 장소·상대, 문제가 보이는 대사와 스크린샷을 함께 알려주시면 확인에 도움이 됩니다.

---

비공식 팬 번역입니다. **패치 파일만 배포하며 롬은 포함하지 않습니다.** 원작의 권리는 각 권리자에게 있습니다. [원작 배포처](https://ux.getuploader.com/romancingsaga312/download/560) · [보쿠노 위키](https://www.wikihouse.com/bokuno/)

대사 글꼴: [갈무리11 좁은체(Galmuri11 Condensed)](https://quiple.dev) © 2019–2025 이민서(Lee Minseo), SIL Open Font License 1.1 — [라이선스 전문](docs/licenses/Galmuri-OFL.txt)
