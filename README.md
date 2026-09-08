# ぼくのロマサガ3 (Bokuno RS3) 한국어 패치

로맨싱 사가 3 개조 롬 「ぼくのロマサガ3」(ぼくのProto1.123)의 한국어화 xdelta 패치입니다.
대사 전체와 메뉴·전투 문안(아이템·몬스터·기술·술법·진형·직업·인명·지명 표, 기술·술법 설명문, 이벤트 목록, 마스 배틀 명령/진형/군단명, 상태창 라벨)이 한국어입니다. 롬은 포함되어 있지 않습니다.

## 다운로드

- 패치(직링크): https://github.com/beck4679-alt/bokuno-rs3-ko/releases/download/v0.81/bokuno_ko_batch5z_20260908_81.xdelta
- 예비(저장소 파일): https://github.com/beck4679-alt/bokuno-rs3-ko/raw/main/bokuno_ko_batch5z_20260908_81.xdelta
- 원작 「ぼくのロマサガ3」 패치: https://ux.getuploader.com/romancingsaga312/download/560

## 적용

1. 원본 롬 `ぼくのProto1.123.smc` (8,388,608 B, 헤더 없음)을 준비합니다.
   「ぼくのロマサガ3」 패치 배포처: https://ux.getuploader.com/romancingsaga312/download/560 (원작 저자 배포, 로맨싱 사가 3 일본판 롬에 적용)
   SHA256 `4793E1422295B8C13BA81B070B941288D36BE339FF20F914652CE63CC06F2DA0`
2. [xdelta3](https://github.com/jmacd/xdelta) 로 적용합니다.

   ```
   xdelta3 -d -s ぼくのProto1.123.smc bokuno_ko_batch5z_20260908_81.xdelta bokuno_ko.smc
   ```

3. 결과 SHA256 이 `D47BF3EA6E1D8FECE86D4930E3135D67DAACEA9F9B44EE7E013DDE8A4E8E215C` 이면 정상입니다.

## 현재 판 (batch5z_20260908_81)

- v0.78 대비: 필드 메뉴 「이벤트」 목록·기술/술법 설명문(전투 선택 창)·마스 배틀 명령/진형/군단/전술 이름·상태창 「내성」·전투 결과 「기력이 늘었다!」 등 표 문안 약 700건 한국어화, 대사 미번역 조각 90여 곳 수리.
- 알려진 미번역/보류: 트레이드(회사 경영) 미니게임 UI 문안, 작명 화면 가나 자판(한글 입력 미지원 — 임의 음절이 뜹니다), 선택지 강조 빨강 줄(엔진 합성).
- 검수 후보 단계입니다. 문제를 보시면 장면(어느 마을·누구와 대화·어느 창)과 스크린샷을 이슈로 남겨 주세요.

## 파일

| 파일 | 크기 | SHA256 |
|---|---|---|
| bokuno_ko_batch5z_20260908_81.xdelta | 625,856 B | `ae67c303e8030810d628b7d59aa6d7da152b0eaa5c619ad23385de47b2bad1f6` |

이전 판: v0.78 (`bokuno_ko_batch5z_20260908_78.xdelta`, 결과 SHA256 `3E08D85CF295DBC8FF00F72EBC565B5F80055788A68BA0370034087746571FE5`)
