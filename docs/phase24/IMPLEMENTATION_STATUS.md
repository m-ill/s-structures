# Phase24 실제 구현 상태

> 2026-09-11 재계획: Phase24는 부분 구현 기준선으로 보존하고 미완료 범위를 [Phase25](../phase25/README.md)로 이관했다. 아래 계획/실적은 당시 기록이며 전체 마일스톤 완료가 아니다. 현재 잔여 작업의 정본은 [32건 재점검 대장](../phase25/GAP_AUDIT.md)이다.


2026-09-11 · 후속 구현 4차 · **M0~M9의 제품 경로 연결, 전체 완료 아님**

계획의 완료 조건을 낮추지 않는다. 아래 실적은 개발용 집중 검증이며 기준 적합성·시공용 출력·생산 자격을 뜻하지 않는다. 시작 HEAD는 `ed24e04809957754cdde38e7b949d7c184a0fd2b`, 브랜치는 `work/phase21-consistency-20260910`이다. 로컬 미커밋 상태이며 push/main 병합/Pages 배포는 수행하지 않았다.

## 단계별 구현과 잔여

| 단계 | 이번까지 구현 | 남은 완료 조건 |
| --- | --- | --- |
| M0 | 범위·TDD·선택 runner·D01~D12 oracle·기준선 hash, KCSC 공식 9건 판본/hash·WebMCP 출처 조회 | 나머지 조항 구현과 독립 검토 봉인 |
| M1 | 4재료 물성, 치수 기반 단면, 배근/접합/지반/기초 typed 입력, 버전·참조·기하 검증, UI/WebMCP | 전 입력 유형 브라우저 왕복·실무 입력 종합검증 |
| M2 | 해석/상세 의존성, 배근만 변경 시 명시적 재사용, stale, undo/redo, Book v2, 체크포인트에 원본 입력·이력·검토/후보 저장 | 저장 매체별 장시간 복원·메모리 검증 |
| M3 | 공통 evaluator, 동일 조합/위치의 N/V/T/My/Mz, 필수검토 누락 집계, 가정 예비검사를 diagnostics로 분리, 동일 평가 재호출 cache, 실제 Direct 수렴 결과 선택, 전 결과 KDS 근거 상태 | 해석 완료와 별도 검토 사이 공통 cache, 법정 요구 조합 coverage |
| M4 | 실제 주근의 명시적 응력블록·축력/2축휨, 유효깊이·제공 스터럽 전단, 입력 기준 간격/철근비, 스터럽 부족의 거짓 OK 수정, KDS 14 20 52 일부 정착/인장 이음·입력 연결, legacy 배율 오류 제거, KDS 변형률별 φ·응력블록·압축상한, 제공 스터럽 KDS 전단, 전체 사용하중 균열강성+순간 활하중 처짐 | 단부/압축 이음·구속·균열/장기 처짐·비틀림·고강도 중간값·전체 규칙 |
| M5 | 직경/간격 후보, 중복 제거·횟수/시간 한도·취소·명시 적용·재요청 중복 방지·재사용 후 검토, B/H 단면 후보 격리 CPU/Direct 재해석·원자적 적용 | 접합/기초 후보, 적용 후 자동 재해석/검토, 대규모 worker 작업 |
| M6 | 동일 조합 단부력 전역 평형, offset, 핀/강접·release 일관성, 누락 상세 표시, 명시된 예상강도 수요에 대한 특수모멘트골조 접합 전단 | 예상강도 수요 자동 산정·구속/정착 내력·실제 배치·후보 |
| M7 | 실제 기초 치수/배근, 전면·일축/이축 부분 접촉, 지지력/활동/전도, Winkler 침하 진단, 압축 접촉압 적분 휨/일방향 전단, 중심 내부기둥 KDS 뚫림전단·h+ld 연장 확인 | 편심 뚫림전단/정착, 기초 자중 자동 합산, 지반/기준 자격·후보 |
| M8 | 저장 상세의 단면/입면·기초 평/단면·접합 개요, 본체 수량, SVG/JSON/한글 벡터 PDF, hash·chunk·취소, straight/L90/J180 주근 형상·기하 절단길이·KDS 근거 페이지 | 양단/충돌·스터럽/이음 형상·제작 승인, 시공용 접합 배근도, 전 도면 시각 검증 |
| M9 | 기존 탄성 UI·실제 WebMCP 등록, 작은 CPU/Direct 연결, 저장/복원/undo/redo, 브라우저 패널 확인 | 전 업무·브라우저·독립 비교·장시간 메모리 종합검증·생산 자격 |

## 판정과 자동 보완의 의미

- `mechanicsLaw`는 명시적 역학 계산 가정이다. KDS 규칙으로 승격하지 않는다. `rc-code-compliance`, `foundation-code-compliance`는 현재 NOT_CHECKED다.
- 누락 기준·정착·사용성이 있으면 후보 탐색은 NEEDS_INPUT으로 끝난다. 이때 autoApply는 적용하지 않는다. 명시적 후보 적용 후에도 새 검토가 필요하다.
- 임의 250kN 접합 지표·가정 지반 지표·가정 배근 RC 예비 검사는 diagnostics에 보존하며 새 필수검토의 지배 NG로 집계하지 않는다. 과거 NG76/미검토120과 새 수치는 같은 모집단이 아니다.
- 목재·조적 전용 설계, 동적/비선형 결과의 부재 설계 매핑, Phase23 GPU 생산 자격은 이번 변경으로 추가 승인하지 않는다.
- `productionQualified:false`, `designTransferAllowed:false`, 출력 `reviewOnly:true` 유지. 절단길이 미확정은 null과 사유를 반환한다.
- 기존 `src/design/rc/rebar.js`의 잘못된 정착식/추가 1,000 배율을 제거하고 공식 조항 함수로 통합했다. 조건 누락은 길이 null/NOT_CHECKED다. [공식 출처·수정 근거·잔여 구현](KCSC_RULE_INTEGRATION.md) 참조.

## WebMCP 흐름

1. get_design_modules / get_design_input_schema / get_design_records로 범위·입력 확인.
2. preview_design_changes → get_design_changes → apply_design_changes.
3. 기존 탄성 workflow 실행 후 get_practical_design_context에서 source ID 조회.
4. evaluate_practical_design → get_practical_design_result. 저장 결과 조회는 재계산하지 않음.
5. plan_design_candidates → start_design_candidates → get_design_candidates / cancel_design_candidates.
6. apply_design_candidate 후 get_design_dependencies / reuse_design_analysis 또는 재해석 → 새 평가.
7. export_design_drawings → get_design_drawing_artifact / cancel_design_drawing_export.

입력 되돌리기/다시실행도 undo_design_input / redo_design_input으로 노출한다. UI와 WebMCP는 같은 서비스에 도달한다.

## 메모리·복원

평가 8개, 계획/작업 각16개, 적용 영수증64개, 후보 최대16개/10초. 현재 평가 모델은 30부재/선택 set당300 station으로 제한한다. 출력은8파일/총32MiB, 조회는12KiB chunk다. 관리량은 보수적 retained-data 추정이며 전체 JS heap 측정치가 아니다. 후보는 순차 실행하며 취소는 후보 사이에 반영한다. 단면 후보는 120절점 이하에서 격리 재해석하고 행렬 staging 메모리를 사전 예약한다. 동기 CPU 해석 중간 취소와 전체 heap 측정은 미구현이다.

체크포인트는 새 상태도 분할 저장·dirty 비교한다. Product Book 정규화 모델과 해석 입력 원본을 함께 검증/보존한다. 실행 중 작업은 복원 시 interrupted이며 자동 재개하지 않는다. build 미결합 복원 평가/해석은 현재 결과로 자동 승격하지 않는다. 입력 이력도 checksum·모델/요청 참조를 검증한다.

## 검증 자료와 공개 상태

- 4차: 집중 17파일·18실행 모두 통과(합계 19.357초). `final-20260911-04/SUMMARY.json` 및 `cohort-20260911-04.json`을 따른다. KDS 강도/전단/처짐/접합/중심 뚫림전단·형상·근거 표시, Direct 실제 결과 선택과 기존 설계/WebMCP의 직접 영향 시험만 수행했다. 이전 cohort는 이력으로 보존한다.
- 모든 새 검토 결과는 `codeBasis`를 포함한다. 코드·판본·조항·공식 URL·SHA256을 적용/미확정으로 구분한다. 기존 탄성 검토의 철골/층간변위도 근거 미확정을 명시하며 HTML/JSON/CSV/PDF에 유지한다.

- 3차: 직접 영향8파일 모두 통과(합계5.154초). 공식 출처 9건의 hash·판본, 실제 입력/정착 조건, legacy 정착 함수, 이축 접촉/적분, 반복 평가/CPU 연결의 직접 영향 시험. `final-20260911-03/`와 `cohort-20260911-03.json`을 따른다. 아래 2차 자료는 당시 버전의 이력이며 3차 전체 검증으로 승계하지 않는다.

- Phase24 집중 시험19파일 통과. 직접 영향 P19 입력11시나리오·설계/WebMCP·P21 checkpoint도 통과. 마지막 영향 범위 재검사8파일은 약6.5초, Direct 연결 추가 확인은 약2.8초였다. 전체 회귀 소요시간이나 종합 자격으로 해석하지 않는다.
- `verification/evidence/phase24/final-20260911-02/`: 최종 집중 로그. 개별 파일 종료값으로 판정.
- `verification/evidence/phase24/cohort-20260911-02.json`: 소스/시험/출력 hash 목록.
- `output/phase24/drawings/T16.pdf`: 합성 RC 부재의 검색 가능한 한글 벡터 검토도. SVG/JSON과 같은 상세 입력.
- `output/playwright/phase24-review.png`, `phase24-missing-source.png`, `phase24-ui-summary.json`: 로컬 UI 확인. 페이지 오류0, 실제 건물 시험 아님.
- CPU와 Direct 각각 작은 합성 모델의 해석→제공 상세→후보/취소→SVG→적용/재요청→재사용→복원→undo/redo를 확인했다.
- 1차 `cohort-20260911-01.json`은 이전 소스 이력으로 보존한다. 이후 소스 증거로 승계하지 않는다.
- 실제 건물·전체 npm test·Q01~Q10·독립 비교·실제 Pages 배포는 실행하지 않았다.

종합검증은 [검증 계획](TDD_VALIDATION_PLAN.md)에 남긴다. **공식 9건을 확보했지만 표의 미구현 기능이 남아 있으므로 Phase24 전체 완료가 아니다.** 개발 기록은 [EXECUTION_LOG.md](EXECUTION_LOG.md) 참조.
