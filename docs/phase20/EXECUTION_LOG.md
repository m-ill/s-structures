# Phase 20 실행 기록

## 2026-09-08 · M0 착수

- 개발 브랜치 `work/phase20-boundaries-20260908`, 계획 기준 `131a2b3`, 수치 기준 `07b3e93`.
- 추적 파일의 작업 트리가 깨끗함을 확인했다. 기존 untracked 실행 자료와 사용자 파일을 보존한다.
- 공개 export·manifest·실제 import 소비자·아키텍처·동기 탄성 7개 입력의 결과를 별도 baseline harness로 고정한다.
- 허용 비교 제외 필드는 실행 시간/시각 metadata만 명시하고, snapshot 32개/16 MiB 상한 및 전후 3회 성능 10% 회귀 예산을 고정했다.

후속 항목은 실제 실행과 판정을 끝낸 후 이어 기록한다.

## 2026-09-08 · M0 기준선 고정

- `p20-baseline.mjs`로 public export/manifest·소비자 59건·원시 아키텍처와 7개 탄성 입력 결과를 고정했다. 각 artifact hash는 `verification/evidence/phase20/m0/hashes.json`에 있다.
- R1은 새 검증 fixture의 방향 `x`가 canonical `+x`가 아니어서 실패했다. 엔진 변경 없이 fixture를 수정한 R2에서 7개 실행을 완료했다. R1의 부분 출력은 로컬 `output/phase20/m0-r1`에 보존했다.
- 필수 회귀는 기존 95개와 확인된 11개 추가 시험을 합친 106개에서 출발한다. 새 경계 시험은 이후 단계에서 manifest에 추가하고 최종 후보에서 고정한다.
- 스냅샷·성능·호환 예산은 `verification/specs/phase20/contracts.json`에 기록했다. M0는 기준선 준비 완료이며 신규 후보 PASS는 아니다.

## 2026-09-08 · M1 완료

- `567ee25`: 버전 상수 59개를 canonical metadata로 이동하고 old export를 유지했다. equivalent shell 표시와 shell lab 소유자를 결과/제품 계층으로 옮겼다.
- 최초 이행 스크립트는 문자열 상수 외 alias 상수를 발견해 쓰기 전 중단했다. alias 참조까지 동일 canonical 정의를 유지하도록 보완했다. 엔진 수식 변경은 없다.
- `output/phase20/m1-r1/validation.json`: clean archive 집중 회귀 3/3 PASS. manifest 값·공개 상수·제품 UI/Agent/WebMCP 동등·shell containment를 확인했다.

## 2026-09-08 · M2 완료

- `c8edd71`: UI builder와 상세/계산서 데이터 준비를 제품 소유자로 이동했다. 기존 renderer/public builder 경로와 23개 computed getter 계약을 보존했다.
- 준비 저장소는 입력/결과 revision·options·schema를 결속하고 32개/16 MiB 직렬화 크기 상한, 동일 요청 공유, stale/late completion 차단, 모델 전환·pagehide 해제를 제공한다. 입력 진단은 해석과 별도 준비/조회 API이며 기존 즉시 getter는 호환용으로 유지한다.
- `output/phase20/m2-r1/validation.json`: clean archive 7/7 PASS. 준비/복제/캐시 상한과 stale, 상세보고서·계산서·Phase13·WebMCP 회귀 확인. 원시 정적 감사의 직접 경계 위반과 cycle·미해결 import는 0이었다.

## 2026-09-08 · M3 완료

- `bc664fb`: 정적 stages, 결과 계약, P–Delta 조합과 제품 orchestration을 분리했다. 공개 linear3d는 동기 façade이며 내부 production 소비자는 canonical owner를 참조한다.
- 최초 수치 비교가 `solver.diagnostics.totalMs`에서 달라졌다. 소스의 elapsed 시간 계산임을 확인하고 누락된 실행 metadata `totalMs`/`totalFactorizationMs`만 비교 제외 목록에 추가했다. 입력·수식·허용오차·설계 적격성은 변경하지 않았다.
- 7개 입력의 결정적 전체 결과와 public export/sync 계약이 정확히 일치한다. `output/phase20/m3-r1/validation.json`: clean archive 7/7 PASS, 탄성 runtime·hybrid·P–Delta·eigen·설계 workflow 포함.

## 2026-09-08 · M4 완료 / M5 후보 준비

- `44582e8`: sparse 재수출 경로의 내부 소비자를 compute canonical owner로 이행했다. 호환·정책·도메인 모듈 22개에 source hash·실제 소비자·소유자·유지 사유·대체/삭제 조건을 등록했다.
- 원시 Phase15/16 감사는 직접 경계 위반 0·cycle 0이다. 옛 공개 정책의 날짜 4개와 자동 wrapper 분류는 원시 출력에 그대로 남긴다. Phase20 감사는 단순 주석/날짜 갱신 대신 실제 소스·허용 소비자와 현역 계약 분류를 검증한다. 공개 linear3d→제품 조정 bridge 1개를 명시한다.
- 초기 라우팅 시험이 제어 방식을 생략해 legacy 기본 제어 거부에 먼저 도달했다. production displacement를 명시한 후 async 강제와 fallback 차단을 확인했다. 엔진 제어 기본값은 바꾸지 않았다.
- clean archive 집중 회귀 5/5 PASS. 별도로 corotational global·production NLTH 실행도 PASS했다. M1~M4의 원본 로그와 hash를 각각의 evidence 폴더에 복사·검증했다.
- M5는 최종 111개 manifest와 Windows/Ubuntu CI, 별도 fresh-process 성능/RSS 비교, 브라우저·패키지 검증을 진행한다. 아직 전체 후보 PASS/공개 완료로 표시하지 않는다.

## 2026-09-08 · M5 R1 검증과 브라우저 입력 경계 보완

- `f1e56fe`: 로컬 111/111, Windows·Ubuntu Phase20 CI 각 111/111 PASS. CI run `34175856617`; 기존 Public validation run `34175856586`도 success. 이 후보의 원본은 `output/phase20/m5-r1`, `ci-f1e56fe`, `browser-r1`에 보존한다.
- 8부재 fresh-process 3회씩 정확한 수치 일치. 기준/후보 중앙값 5937.63/5840.84 ms, 최대 RSS 307820/307400 KiB로 10% 회귀 예산을 통과했다. 이 값은 R1 후보에 속한다.
- 실제 native WebMCP 36개 등록, Pushover·NLTH module-worker/production-wasm-sparse 완료, fallback false·candidate·설계전달 차단 유지. 정적→설계 13개→HTML/JSON/CSV 및 UI snapshot hash 일치를 확인했다. 자동 PDF는 adapter·figure·qualification 부족으로 기존 차단을 유지한다.
- 브라우저의 초기 v3 예제와 옛 JSON importer는 현재 스키마를 유지하지 못했다. 최초 탄성 설정 화면의 draft 동기화는 project ID를 입력에 써서 기존 결과를 stale로 만들었다. 해당 호스트/설정 소스는 `07b3e93`과 동일하여 기존 결함이지만 입력 준비 경계에 해당하므로 M5에서 수정한다.
- runtime adapter 설치·새 모델·JSON migration 시점에 현재 스키마를 준비하고, 화면 열기에서는 프로젝트 ID를 읽기만 한다. 조회 getter에서는 migration을 실행하지 않는다. 이를 검증하는 `p20-m5-browser-input-boundaries.mjs`를 추가해 manifest를 112개로 고정한다. 집중 3개 PASS 후 새 후보에서 전체 검증한다.
- 브라우저 stale 시험용 케이스 update는 자동 승인 검토가 루트의 읽기 전용 기본 규칙을 이유로 거절했다. 이번 개발 요청의 예외 권한이 반영되지 않았으며 우회 변경은 하지 않았다. 자동 회귀의 stale/취소 시험과 실제 브라우저의 세션 재열기 HANDLE_NOT_FOUND 관찰을 구분한다.
