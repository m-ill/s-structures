# Phase 17 Milestone Execution Plan

```yaml
version: p17-milestone-execution-plan-v1
execution_policy: one-official-case-at-a-time
wip_limit: 1
case_milestones: P17-M2..P17-M22
integration_milestone: P17-M23
```

## 1. 전체 순서

Phase 17은 기반 2개 마일스톤, 공식 사례 21개 마일스톤과 통합 마일스톤으로 진행한다.

| ID | 대상 | 핵심 산출물 | 종료 gate |
| --- | --- | --- | --- |
| `P17-M0` | Baseline & Source Lock | 21개 source/version/checksum/role/claim manifest | v1.0.2-v1.0.4 충돌 포함 unresolved source 0 또는 명시적 blocker |
| `P17-M1` | Case Contract & Shared Harness | schema, scaffolder, stable product adapter, isolated runner, evidence/report contract | 결과값 없이 contract·negative test PASS, deep import 0 |
| `P17-M2` | `SB1` | Euler cantilever 독립 사례 패키지 | closed form·평형·subdivision·3회 결정론·보고서 |
| `P17-M3` | `SB2` | NAFEMS LE1 membrane 패키지 | D점 접선응력·mesh convergence·응력 probe audit |
| `P17-M4` | `SB3` | Cook membrane 패키지 | normalized tip displacement·왜곡/회전·refinement |
| `P17-M5` | `SB5` | thin plate 8-case 패키지 | 8개 계수·SS/FIX·UDL/point·mesh convergence |
| `P17-M6` | `SB6` | thick plate 6-case 패키지 | Reissner-Mindlin·hard SS·thickness/aspect sweep |
| `P17-M7` | `SB7` | Winkler beam 패키지 | 중앙 처짐·모멘트·기초 end/station closure·energy |
| `P17-M8` | `SB8` | Timoshenko modal 패키지 | f1~f6·eigen residual·orthogonality·mode tracking |
| `P17-M9` | `SB9` | portal frame 패키지 | combined/bending/axial identity·equilibrium |
| `P17-M10` | `SB10` | determinate truss 패키지 | signed brace force·apex displacement·reaction closure |
| `P17-M11` | `SB12` | inclined 6-DOF link 패키지 | beta-angle transform·near-vertical mutation 또는 정확한 engine blocker |
| `P17-M12` | `PD1` | staged P-Delta 패키지 | tension sign·stage carry-over·external/internal work balance |
| `P17-M13` | `SM5` | Bathe-Wilson frame modal 패키지 | eigenvalues·독립 mode vector·MAC·mass orthogonality |
| `P17-M14` | `SM5b` | diaphragm condensation 패키지 | full/reduced parity·eccentric mass·rotational inertia |
| `P17-M15` | `SM6` | ASME 3D pipe frame modal 패키지 | 3D axis·joint mass·mode residual·24-mode scope audit |
| `P17-M16` | `SR1` | 2D response spectrum 패키지 | periods·floor displacement·member moments·modal closure |
| `P17-M17` | `SR2` | eccentric 3D RSA 패키지 | diaphragm torsion·SRSS/CQC/ABS/NRC10 trace |
| `P17-M18` | `SR2b` | L-shaped braced frame RSA 패키지 | roof Ux/Uy/Rz·brace axial·direction/combination audit |
| `P17-M19` | `P3S2` | official stabilization sensitivity 패키지 | 동일 wall/parameter/mode matching 또는 `ANALOGOUS_ONLY` |
| `P17-M20` | `SP1` | moment-hinge pushover 패키지 | yield/hardening/pre-peak·step refinement·work balance |
| `P17-M21` | `SH1` | custom P-M-M hinge 패키지 | PMM surface·backbone·rollback·objectivity 또는 non-equivalence blocker |
| `P17-M22` | `TH1` | Newmark THA 패키지 | zeta 0/5%·dt order·energy/phase·modal-Rayleigh gap |
| `P17-M23` | Integrated Review & Release Manifest | 21-case matrix, aggregate JSON/PDF, codebase review, full regression | terminal evidence 21/21, 열린 gate는 fail-closed 반영 |

공식 순서는 STRIX manual contents 순서와 같다. 기존 PASS 난이도순으로 재배열하지 않아 결과가 좋은 사례만 먼저 골라 보이는 선택 편향을 막는다.

## 2. P17-M0 - Baseline & Source Lock

### 작업

- 기존 Phase 15 aggregate JSON/Markdown/PDF hash를 역사 snapshot으로 동결
- 공식 21개 catalog와 custom 분리
- 통합 manual·개별 PDF v1.0.2와 개별 HTML·catalog v1.0.4의 case별 diff 생성
- 원 출전, STRIX 공개값, MIDAS 자료의 reference lane 분리
- source·reference·tolerance·probe 승인 역할 지정
- claim vocabulary와 terminal status enum 확정

### 완료 산출물

- suite source registry
- 21개 source lock
- source-version discrepancy register
- Phase 17 baseline manifest

### 금지

M0가 닫히기 전에 S-Structures 결과를 다시 실행하거나 tolerance를 확정하지 않는다.

## 3. P17-M1 - Case Contract & Shared Harness

### 작업

- `case-manifest`, source/reference/tolerance/probe, run/evidence/comparison schema 구현
- 21개 folder scaffold와 custom folder 생성
- stable product benchmark adapter 정의
- monolith의 case builder·reference·run·evaluate·report 책임 분리
- single-case CLI, isolated suite runner, timeout/failure isolation 구현
- append-only run writer와 hash chain 구현
- Chrome capture index와 evidence-only Markdown/PDF renderer 계약 구현
- Phase 16 layout/taxonomy audit에 신규 경로 등록

### 완료 gate

- 공식 folder·manifest 21/21 schema valid
- product→verification 0
- verification→product deep import 0
- expected/reference production leakage 0
- null run ID와 overwrite path 0
- intentional failure case가 다른 사례를 중단시키지 않음

M1은 실제 benchmark PASS를 만들지 않는다. 숫자 없는 fixture로 framework 계약부터 검증한다.

## 4. P17-M2~M22 - 사례 공통 실행 루프

각 사례는 다음 12단계를 모두 수행한다.

1. `source.lock`: 판본·페이지·checksum·추출 정밀도 승인
2. `reference.lock`: R1~R5 등급과 원문·full-precision·단위변환 승인
3. `criteria.lock`: probe·부호·tolerance·mandatory gate·mutation 사전동결
4. `model.build`: canonical input과 S-Structures input 생성
5. `model.review`: STRIX/MIDAS mapping, silent default와 known deviation 승인
6. `preflight`: schema·DOF·하중·질량·축·rigid mode·model hash 검사
7. `capture.input`: Chrome에서 형상·지점·하중·축·메시 캡처
8. `run`: stable product service로 실제 자체 엔진 실행
9. `qualify`: 평형·에너지·수렴·모드·step·mutation 검사
10. `compare`: 독립 기준, STRIX published/R4, MIDAS R4를 별도 비교
11. `capture.result/report`: 결과 화면과 evidence-only 사례 보고서 생성
12. `review.close`: PASS/FAIL/BLOCKED/CROSS_CHECK_ONLY와 다음 코드 조치 승인

### 다음 사례 진입 조건

현재 사례가 다음 중 하나로 닫혀야 한다.

- `PASS`: 모든 gate와 reviewer 승인 완료
- `FAIL`: 실행됐고 필수 수치 또는 물리 gate가 실패했으며 discrepancy가 등록됨
- `BLOCKED_*`: 누락 source, reference, engine/API 또는 model equivalence가 원인코드로 기록됨
- `CROSS_CHECK_ONLY`: 유사 formulation의 제한된 결과와 주장 범위가 명시됨

`IN_PROGRESS`, 설명 없는 `REVIEW`, 빈 결과 파일 또는 임시 PASS 상태로 다음 사례에 진입하지 않는다.

## 5. 수치 결함이 발견됐을 때 코드 수정 루프

```text
case FAIL
  -> discrepancy 등록
  -> 최소 재현 fixture와 독립 oracle 고정
  -> production owner·영향 consumer 확인
  -> product code change
  -> unit + family regression + full affected regression
  -> architecture/module review
  -> 이전 evidence INVALIDATED
  -> 새 run ID로 동일 case 재실행
```

- benchmark 숫자에 맞춘 상수·분기·보정계수 추가를 금지한다.
- reference 변경과 solver 변경을 같은 change set에서 수행하지 않는다.
- solver formulation 변경은 해당 요소·동적·비선형 capability 전체 evidence를 stale 처리한다.
- 제품 API가 없으면 private module을 우회 호출하지 않고 `BLOCKED_ENGINE_API`로 닫은 뒤 product service를 먼저 설계한다.

## 6. 사례별 보고서 승인 gate

각 `REPORT.md`와 `REPORT.pdf`는 다음 질문에 답해야 한다.

- 무엇을 검증하는 사례인가?
- 원래 출전과 STRIX 판본은 무엇인가?
- 어떤 형상과 요소로 모델링했고 왜 그렇게 했는가?
- S-Structures의 어떤 제품 기능과 실행 명령을 사용했는가?
- 모델이 STRIX specification과 어디까지 동일한가?
- 독립 기준, STRIX와 S-Structures 결과는 각각 얼마인가?
- signed/absolute 차이와 tolerance는 얼마인가?
- 평형·수렴·에너지·모드·step 품질은 어떤가?
- 차이가 있으면 어떤 코드 owner를 어떻게 수정해야 하는가?
- 누가 어떤 hash의 evidence를 검토했는가?

## 7. P17-M23 - Integrated Review & Release Manifest

### 산출물

- 공식 21개 aggregate manifest와 상태 matrix
- custom 사례 별도 appendix
- 사례별 report index와 통합 Markdown/PDF
- 3회 결정론, 10회 NFR 후보, clean independent run
- UI/CLI/JSON/PDF parity evidence
- codebase·module ownership·dependency review
- Phase 16 layout/taxonomy와 전체 제품 회귀
- capability별 release manifest와 명시적 blocker

### 완료와 release 구분

21개 folder가 PASS, FAIL 또는 원인코드가 있는 BLOCKED로 모두 닫히면 Phase 17 작업은 완료할 수 있다. 그러나 공식 21개 independent qualification과 필요한 R4가 모두 통과하지 않으면 suite release와 최종 설계전이는 계속 차단한다.
