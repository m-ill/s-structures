# Phase 21 실행 기록

기록은 날짜순으로 덧붙인다. 과거 실패·후보·판정은 보존하며 후속 결과로 설명한다.

## 2026-09-10 — 계획 수립

- 사용자 요청: 첫 구현을 강체 다이어프램으로 하고, 실무시험에서 나타난 오류의 재발 방지와 메모리 관리를 포함한 다음 Phase 개발계획 작성.
- 저장소의 최신 개발 문서 Phase20을 확인하고 Phase21 계획을 생성했다. 계획 기준 checkout은 `d8ae7af7af3d20b9a5c0977f210e5d1b26991ace`다. 기존 미추적 산출물과 사용자 자료를 보존했다.
- Direct의 명시적 강체 차단, 일반 constraints 유무에 의존하는 tangent/solve 분기, hybrid partition 경로와 stability의 원래 DOF 사용을 확인했다. 공통 구속·하중·안정성·복원을 함께 검증하는 M0를 계획했다.
- RC 정사각형 치수, 입력 wizard, 선택/포락, 집계/출처, 원본 보고서 완전성 문제를 기존 재현 자료와 코드에 연결했다. 선택 조합 필터가 이미 있는 경로와 실제 20조합 반환 관측을 구분해 호출 경계 추적을 계획했다.
- workflowResults 중복 복제·상한 없는 Map, report 전체 clone 후 chunk slice, prepared view의 직렬화 상한을 검토했다. 세션 초기화 원인은 미확정으로 유지하고 자원 계측·backpressure·저장 복구를 M5에 포함했다.
- M0~M7, 목표 계약, 메모리 소유권·초기 예산, 수치/제품/복구/릴리스 검증과 인수 조건을 문서화했다. 기존 수정계획 N0~N6는 관측 기록으로 보존하고 이번 실행 순서로 대체한다.
- 제품 소스·테스트·CI·배포는 변경하지 않았다. 수치 회귀 실행·새 후보·Phase21 PASS 증거는 없다. 문서 링크와 Wiki 검사는 계획 문서 검증으로 별도 기록한다.

## 2026-09-10 — 계획 문서 검증

- Phase21 7개 문서와 관련 README·기존 수정계획의 상대 링크 72개를 검사했다. 끊긴 링크 0개, 닫히지 않은 코드 블록·문자 치환 오류 0개다.
- Wiki72개 검사에서 이번 변경의 새 링크 오류·고아·깊이 위반·index 누락은 없었다. 전체 lint는 기존 S-Scan 원자료 링크 8건 때문에 실패 상태이며 이를 Phase21 오류로 집계하거나 수정하지 않았다.
- git diff 기준 추적된 제품 소스·테스트·CI 변경 0개를 확인했다. 신규 Phase21 문서와 기존 미추적 실무시험 자료는 별도로 보존했다. 문서 검사는 수치 회귀 PASS가 아니다.

## 2026-09-10 — M0 구현 착수·집중 검증

- 사용자 승인으로 M0~M7 순차 개발을 시작했다. 브랜치 `work/phase21-consistency-20260910`, 원래 source/실무시험 1,029개·18,525,436 bytes를 `output/phase21/m0-baseline`에 보존했다. baseline manifest SHA-256은 `17e4de381a2cf99f032925ea2ee8c1ab897f9505179dc4a333fd9377fc7e1132`다.
- Direct seed/반복/임계하중을 같은 affine 구속계로 연결하고 CPU/async partition에 단계별 강제변위와 복원을 적용했다. 축약 DOF를 `%6`으로 분류하는 stability 경로를 명시적 좌표 종류로 바꿨다. 다이어프램 구속 내력과 가상일 검사를 추가했다.
- 비공면·중복/잘못된 group 및 conservative dense working-set admission을 추가했다. 초기 예산 512MiB와 추정 `240*fullDOF²`를 사용한다. 이는 실제 heap 측정 결과가 아니며 전체 자원 관리는 M5 대상이다.
- 신규 집중 시험은 대칭 2기둥 scalar condensation, 편심 4기둥 3-DOF 평형, 3층 독립 planar assembly, P=0, 강제변위, 불안정·잘못된 입력, CPU 제품·reference hybrid를 통과했다. 실제 GPU 자격은 없으므로 제품 GPU의 강체 Direct는 명시적으로 차단했다.
- 복원 상가주택의 MAX-EX-P Direct는 수렴했고 dmax=0.009505956274493006m, 평형잔차=6.547587611234594e-13이었다. 원본 입력과 hash가 다르며 아직 M1~M6 수정·재검증 이전 결과다. 과거 요약의 designBlocked/equilibriumFailureReason 잔존은 M3 상태 수정 대상으로 유지한다.
- 기존 P6 Direct, P9 hybrid, P10 MPC 집중 회귀를 통과했다. P20 exact 비교는 새 productVersion에서 처음 실패했다. 과거 golden은 보존하고 테스트에 명시한 v3→v4 출처 버전 전환만 허용한 뒤 7개 수치·자격 결과의 exact 동일성을 확인했다. 숫자·자격 차이는 허용하지 않았다.
- Phase21 M0 회귀 manifest 117개를 생성했다. M1~M7 시험은 아직 포함하지 않으며 고정 후보 실행은 다음 단계다.
