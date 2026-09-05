# Phase 13 Milestone Execution Plan

## 자체 엔진 탄성해석 실무 워크벤치 프로덕션화

```yaml
version: p13-milestone-plan-v1
plan_status: review-ready
governing_candidate: true
created_at: 2026-08-05
milestones: [P13-M0, P13-M1, P13-M2, P13-M3, P13-M4, P13-M5, P13-M6, P13-M7, P13-M8, P13-M9]
active_milestone: none
next_milestone: P13-M0
status_authority: docs/phase13/IMPLEMENTATION_STATUS.md
implementation_started: false
```

> 이 문서는 Phase 13의 권위 실행계획 후보이다. 진행 상태는
> [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)만 단일 기준으로 사용한다.
> 계획 승인 전에는 구현 완료나 릴리스 자격을 주장하지 않는다.

## 0. 단계 번호와 출발점

다음 단계는 **Phase 13**, 첫 마일스톤은 **P13-M0**이다.

- Phase 12는 Windows 단일 PC loopback-only 로컬 파일럿 운영기반을 완료했다.
- Phase 10은 고급 탄성 코어를 구현했지만 외부 공학 검증과 shell 설계전이는 차단 상태다.
- Phase 7의 7단계 탄성 workflow와 Phase 11의 보고서 snapshot 자산이 존재한다.
- 현재 UI는 해석상태, 결과 버튼과 wizard 완료수가 서로 다르게 보일 수 있고 실무 입력·검토 표면이 부족하다.
- `docs/milestones/M13_*` 계열은 과거 milestone 문서이므로 Phase 13의 새 ID로 사용하지 않는다.

Phase 13은 새 solver phase가 아니다. 기존 자체 엔진을 유지하면서 `모델 검사 → 하중·질량 → 실행 → 결과 검토 → 검토 패키지`를 실무 제품으로 완성하는 별도 제품 phase다.

## 1. 목표와 종료 정의

### 1.1 목표

1. 모든 UI·API·보고서가 하나의 Analysis Run과 Current/Stale 판정을 사용한다.
2. 모델 오류를 목록, 위치, 수정 preview와 연결한다.
3. 층·구역·슬래브 패널 하중과 질량을 표·viewport에서 작성하고 보존량을 검증한다.
4. KDS 자동절차는 source·판본·가정·식과 승인 trace를 가진다.
5. Phase 10 고급 탄성 속성을 일반 UI에서 편집·검토한다.
6. 층·부재·동적·평형 결과를 table·chart·3D·보고서에서 같은 값으로 확인한다.
7. 검토 패키지, revision diff와 제한된 MGT Import를 fail-closed로 제공한다.
8. shell은 안전한 experimental surface로 격리하고 core frame release와 분리한다.

### 1.2 종료 시 허용 가능한 주장

P13-M9 Core gate가 모두 통과한 경우에만 다음 문구를 사용할 수 있다.

> 지정된 Windows 로컬 환경에서 지원 범위의 자체 탄성 프레임 해석을 위한 사무소 파일럿 workflow 자격을 통과했다.

다음 주장은 별도 gate 없이 허용하지 않는다.

- 최종 구조설계·인허가 자동 승인
- 모든 KDS 하중 절차 완전 지원
- shell·slab local design의 설계전이
- 정식 비선형·PBSD 지원
- 외부 솔버와 동등한 범용 기능 또는 정확도

## 2. 범위와 비범위

### 2.1 필수 범위

- Unified Analysis Run과 stale dependency
- Elastic Review Workspace shell과 공통 table/tree/inspector
- Model Check, issue, waiver, repair transaction
- load/mass/manual combination workspace와 slab load panel
- source-bound KDS gravity/wind/seismic/snow/combination 지원 범위
- practical member/story/diaphragm/table editors
- elastic result dashboard와 linked selection
- review package, revision diff와 limited MGT Import
- browser/package E2E, performance, accessibility, migration과 release manifest

### 2.2 조건부 범위

- CPU flat-shell의 experimental modeling, mesh QA, convergence와 contour
- MGT의 최초 frame/truss subset 이외 record
- 실제 사무소 fixture와 기준 원문은 owner 제공·승인 조건부

### 2.3 명시적 비범위

- OpenSees runtime·fallback·remote call·input script generation
- 범용 비선형, PBSD, Pushover/NLTH 제품 확장
- RC 배근도, 철근량, punching, 접합·기초 최종설계
- 공개 인터넷·다중 tenant 서비스
- native shell WebGPU를 Core Frame release의 선행조건으로 만드는 것

## 3. 전체 의존관계

```text
P13-M0  기준선·계약·검증 거버넌스
   |
   v
P13-M1  Unified Analysis Run + Workspace shell
   |
   v
P13-M2  Model Check & Repair Center
   |
   +----------> P13-M5  실무 모델·층·부재 편집기
   |
   v
P13-M3  Load·Mass·Manual Combination Workspace
   |
   v
P13-M4  Source-bound KDS 하중 절차
   |
   +----------> P13-M5
   |               |
   +---------------+
                   v
              P13-M6  Elastic Results Dashboard
                   |
                   v
              P13-M7  Review·Revision·Limited MGT
                   |
                   v
              P13-M9  Office Pilot·Release Gate

P13-M0~M3 + M5 ---> P13-M8 Plate/Shell Lab ----> M9의 별도 shell 판정
```

M5의 공통 data-grid primitive는 M3·M4에 앞서 내부 선행 구현할 수 있으나, 제품 완료판정은 M5에서 한다.
M8이 release-blocked여도 `shellDesignTransferAllowed=false`를 유지하면 Core Frame M9를 별도 판정할 수 있다.

## 4. 공통 실행·완료 규칙

### 4.1 상태 체계

- `planned`
- `in-progress`
- `implementation-complete`
- `qualification-complete`
- `release-qualified`
- `blocked`

`blocked`는 외부 입력 또는 필수 gate 없이는 진행할 수 없는 상태에만 사용한다. 구현과 qualification을 같은 상태로 합치지 않는다.

### 4.2 공통 개발 사이클

1. 작업트리와 기준 commit, 기존 사용자 변경을 기록한다.
2. requirement·risk·verification ID와 영향 모듈을 확정한다.
3. 실패 fixture, golden state 또는 UI snapshot을 먼저 고정한다.
4. behavior-neutral refactor와 기능 변경을 분리한다.
5. migration·feature flag·rollback 경로와 fail-closed 조건을 먼저 구현한다.
6. unit → contract → integration → numeric parity → browser E2E → failure injection 순으로 검증한다.
7. source revision과 artifact hash가 결속된 evidence를 생성한다.
8. code review에서 correctness, state ownership, unit/axis/sign, accessibility와 unsupported 경계를 점검한다.
9. 사용자 매뉴얼, 상태와 limitation을 실제 화면 기준으로 갱신한다.
10. mandatory full regression과 diff check 후에만 상태를 승격한다.

### 4.3 공통 완료조건

- requirement coverage 100%, 미추적 코드·테스트·evidence 0
- 기존 fixture의 설명되지 않는 수치 drift 0
- 저장·재열기·migration·undo round-trip PASS
- 취소·실패에서 partial publish와 model mutation 0
- UI·API·보고서의 run ID·상태·핵심 수치 parity 100%
- Critical/High review finding 0
- 필수 test flake 0, skipped mandatory test 0
- `git diff --check`, 문서 링크와 evidence hash 검사 PASS
- 사용자 데이터·비밀·프로젝트 원문이 evidence에 포함되지 않음

### 4.4 evidence 공통 필드

모든 `verification/evidence/validation/phase13/*.json`은 최소 다음 필드를 가진다.

```text
schemaVersion, phase, milestone, status, createdAt,
sourceRevision, dirtyTreeSummary, buildHash, runtimeProfile,
requirements[], verificationIds[], testCommands[], testResults[],
fixtures[], modelHashes[], runIds[], metrics{}, limitations[],
openFindings[], artifactHashes{}, reviewer, reviewStatus
```

실제 사용자명, 홈 경로, token, project 원문과 기준서 유료 원문은 evidence에 저장하지 않는다.

### 4.5 예정 파일 이름

- 전용 runner: `tools/run-phase13-tests.mjs`
- 전용 test: `tests/p13-m{n}-*.mjs`
- milestone evidence: `verification/evidence/validation/phase13/p13-m{n}-*.json`
- release manifest: `verification/evidence/validation/phase13/p13-release-manifest.json`
- work package: `docs/phase13/workpackages/WP-0{n}-*.md`
- review: `docs/phase13/reviews/P13-M{n}-CODE-REVIEW.md`

## P13-M0 — 기준선·계약·검증 거버넌스

### 목표

현재 해석 진입점, 결과 저장소와 UI 상태의 불일치를 재현하고 Phase 13의 단일 계약·기준 fixture·검증 체계를 고정한다.

### 구현·산출물

- current code/data/UI audit와 capability registry
- `supported / review-required / preliminary / experimental / unsupported` 등급
- Analysis Run, Model Issue, Change Set, Result Query와 release manifest schema 초안
- representative frame fixtures, current UI screenshots와 performance baseline
- test inventory, evidence validator, Phase 13 runner 골격
- 외부 solver runtime dependency 금지 검사

### 정량 수용기준

- 해석·상태 진입점과 result store 인벤토리 누락 0
- 현재 상태모순 fixture 재현 100%
- Phase 13 requirement·risk·verification ID 추적률 100%
- mandatory test 분류 누락 0
- baseline fixture의 model/result/report hash 기록 100%

### 증빙·완료판정

- `p13-m0-baseline-contract.json`
- WP-00의 unit·documentation·contract gate PASS
- 후속 milestone에서 변경할 public contract와 migration owner가 확정될 때 `qualification-complete`

## P13-M1 — Unified Analysis Run·Workspace shell

### 목표

리본, wizard, Analysis Center, 결과 popup, dashboard, report와 Agent API가 하나의 run/state owner를 사용하게 하고 실무 workspace 골격을 만든다.

### 구현·산출물

- versioned Analysis Run state machine과 repository
- model/revision/input/settings/capability/build hash
- dependency-based stale reason과 historical run 표시
- 실패·취소·재시도·복원·마지막 성공 run 보호
- 6개 workspace, Model/Case Tree, viewport, inspector, bottom drawer
- 기존 wizard·popup·legacy 전역상태 compatibility adapter
- feature flag와 기존 UI rollback

### 정량 수용기준

- 모든 제품 표면의 active run ID·상태 parity 100%
- mixed-run result/report 0
- engineering input 변경 후 stale 반영 1 event loop 이내
- layout·camera·selection 변경으로 model/result stale 발생 0
- 1280×720 가로 스크롤·핵심 상태 잘림 0
- 실패·취소 후 마지막 성공 run hash 불변

### 증빙·완료판정

- `p13-m1-unified-run-workspace.json`
- browser E2E에서 메인 `OK`·결과 disabled·완료 0 같은 모순이 재발하지 않을 때 `qualification-complete`

## P13-M2 — Model Check & Repair Center

### 목표

분산된 validation·repair·load audit·solver preflight를 위치가 있는 issue로 통합하고 안전한 수정을 제공한다.

### 구현·산출물

- stable issue schema, checker/repair registry와 waiver store
- geometry, connectivity, property, support/release, story/diaphragm, load/mass/combo 검사
- issue filter, severity, object list, click-to-select/isolate/zoom
- repair preview, cascading reference diff, atomic Apply/Undo
- blocker preflight와 report/Agent API issue parity

### 정량 수용기준

- BM·load audit fixture의 expected issue recall 100%
- blocker false green 0
- 동일 model hash의 issue ID·정렬 결정성 100%
- issue 클릭 대상 일치 100%, 기준 모델 p95 250 ms 이하
- repair undo 후 model hash 원상복구 100%
- waiver는 user/reason/revision/model hash 결속 100%

### 증빙·완료판정

- `p13-m2-model-check-repair.json`
- 안전수정 목록과 수동검토 목록을 code review가 승인할 때 `qualification-complete`

## P13-M3 — Load·Mass·수동 조합 Workspace

### 목표

전역 숫자 입력을 층·구역·부재·패널 기반의 검토 가능한 하중·질량 작업공간으로 바꾸고 수동/승인 조합의 소유권을 명확히 한다.

### 구현·산출물

- load case, load, mass source, manual combination table
- multi-edit, paste, fill-down, filter와 viewport selection
- slab load panel draw/edit, 1·2방향 tributary preview와 fallback trace
- total load, `qA`, transferred total, residual과 mass dedup audit
- CSV/value import mapping preview와 formula/macro 미평가
- deterministic change-set, generated/custom conflict와 undo

### 정량 수용기준

- 지원 slab fixture의 `Σ전달=qA` 오차가 기존 engineering tolerance 이내
- generated load 재적용 중복 0, 사용자 수정 silent overwrite 0
- UI·solver·report total load parity 100%
- mass source 합계와 solver assembly parity 100%
- failed/cancelled Apply 후 model hash 변화 0
- 250 panel preview p95 2초 이하

### 증빙·완료판정

- `p13-m3-load-mass-workspace.json`
- Slab Load Panel이 shell 설계로 표시되지 않고 load/mass scope로 명시될 때 `qualification-complete`

## P13-M4 — Source-bound KDS 하중 절차

### 목표

지원한다고 선언한 KDS 하중 절차를 공식 source, applicability, 입력·가정·산식과 project 승인에 결속한다.

### 구현·산출물

- versioned rule/procedure registry와 source hash
- gravity/live/roof/snow/wind/seismic/temperature 중 승인된 범위의 procedure
- 풍 방향·부호·내외압·층 분배, 지진 ELF/RSA·우발편심·scale trace
- strength/service/directional/envelope combination coverage matrix
- preview, merge/replace-generated, custom 보존, rule update diff
- reviewer/source/factor snapshot approval

### 정량 수용기준

- 지원 procedure 공식 fixture 재현 100%
- source·식·단위·중간값 trace 누락 0
- 필수입력 silent default 0
- 방향·부호·family coverage 누락 0
- 동일 rule pack·입력의 결정적 결과 100%
- source 미적격 procedure의 candidate 표시·설계전이 차단 100%

### 증빙·완료판정

- `p13-m4-kds-procedures.json`
- 공식 source와 책임 검토자 승인 없이는 해당 procedure를 `qualification-complete`로 승격하지 않는다.

## P13-M5 — 실무 모델·층·부재 편집기

### 목표

Phase 10의 고급 탄성 속성과 story/diaphragm을 JSON·Agent API 없이 만들고 검사할 수 있게 한다.

### 구현·산출물

- schema-driven Nodes/Members/Stories/Diaphragms data grid
- Timoshenko, partial fixity, 3D offset·insertion, panel zone, MPC/rigid link, tapered member editor
- local axis·release·offset·rigid link viewport glyph
- story height/copy/visibility/lock과 diaphragm assignment
- CM/CR·eccentricity·principal axis overlay
- paste/fill/filter, atomic batch edit, reference-safe rename

### 정량 수용기준

- 지원 Phase 10 property의 UI 생성·저장·재열기 coverage 100%
- 기능 미사용 기존 fixture의 수치 drift 0
- invalid batch partial apply 0
- undo 후 model hash 원상복구 100%
- table↔viewport selection parity 100%
- 1,000 row paste·validation이 정한 성능 budget 통과

### 증빙·완료판정

- `p13-m5-practical-editors.json`
- unsupported solver combination의 사전차단과 reason code가 확인될 때 `qualification-complete`

## P13-M6 — Elastic Results Dashboard

### 목표

사용자가 무엇이, 어디에서, 어떤 조합으로 지배하는지 한 화면에서 확인하고 모델·보고서로 추적하게 한다.

### 구현·산출물

- normalized result query, governing index와 comparison service
- overview, story, member, dynamics, reactions, audit/provenance tabs
- drift, shear, overturning, base shear, mass participation, CM/CR·torsion
- first-order/P-Delta, RSA scale before/after와 revision comparison
- linked table/chart/viewport selection, filter/sort/search/CSV
- collision-controlled label과 context legend

### 정량 수용기준

- table·tooltip·viewport·CSV·report 수치 parity 100%
- governing case/combo/source parity 100%
- 10,000 row filter/sort p95 200 ms 이하
- row click 대상 강조 p95 250 ms 이하
- stale/preliminary/unsupported를 current verified로 표시하는 사례 0
- result query가 active run 외 결과를 묵시적으로 소비하는 사례 0

### 증빙·완료판정

- `p13-m6-elastic-results-dashboard.json`
- 대표 static/P-Delta/modal/RSA/buckling fixture의 provenance가 닫힐 때 `qualification-complete`

## P13-M7 — 검토 패키지·revision·제한된 MGT Import

### 목표

같은 run에서 계산서·검토도면·diff를 만들고, 지원 subset의 MGT를 손실이 보이는 preview로 가져온다.

### 구현·산출물

- section-selectable calculation/report composer와 live preview
- member/load/reaction/utilization/issue 검토용 plan/elevation SVG·PDF·DXF
- model/load/stiffness/result revision diff와 review issue/action
- MGT lexer/parser/raw AST, mapping registry, ImportCandidate와 audit
- 최초 subset: node, frame/truss member, support, material, section, basic nodal/member load
- optional supported subset: release, offset, rigid link, combination은 fixture가 있을 때만 승격
- atomic import revision, source hash/encoding/unit/line provenance

### 정량 수용기준

- report·drawing·CSV의 run/report snapshot hash parity 100%
- stale current-package 발행 0
- 지원 MGT fixture의 mapping 손실 0
- 미지원 record와 source line 노출 100%
- unresolved material/section commit 0
- 취소·실패 import 후 project/model hash 변화 0
- 자체 export subset round-trip의 구조·하중 parity 100%

### 증빙·완료판정

- `p13-m7-review-mgt.json`
- MGT 범위가 넓어질 때마다 별도 fixture·mapping review가 있어야 `qualification-complete`

## P13-M8 — Plate/Shell Lab 안전 제품화

### 목표

기존 CPU flat-shell을 검증 가능한 experimental 작업공간으로 노출하되 사용자 모델의 mesh provenance 없이는 설계전이를 차단한다.

### 구현·산출물

- shell capability·limitation contract와 독립 feature flag
- slab/wall/mat modeling, mesh/normal/local axis·quality inspection
- CPU f64 execution, refinement/convergence study와 mixed frame-shell equilibrium
- raw/averaged contour, top/bottom·component·unit·formulation provenance
- UI/API/report/manifest의 experimental·blocked parity

### 정량 수용기준

- degenerate/inverted/severe-warp issue preflight 검출 100%
- patch·closed-form·공개 benchmark·energy/equilibrium gate PASS
- 각 결과의 mesh/formulation/run hash 기록 100%
- convergence provenance 없는 design transfer 0
- WebGPU 또는 미자격 route의 verified 표시 0
- `shellDesignTransferAllowed=false`가 모든 제품 표면에서 일치

### 증빙·완료판정

- `p13-m8-shell-lab.json`
- UI 안전격리까지 `qualification-complete`가 가능하지만 설계전이 승격은 별도 외부 gate가 필요하다.

## P13-M9 — 사무소 파일럿·release gate

### 목표

대표 프로젝트를 source와 Windows 배포물에서 반복 수행하고 workflow, 수치, 실패복구, 성능과 접근성을 최종 판정한다.

### 필수 시나리오

1. 빈 프로젝트 → frame 모델링 → Check/Repair → static/P-Delta → 결과·검토패키지
2. story/slab load/mass → KDS preview → modal/RSA → lateral review·보고서
3. limited MGT Import → mapping fix → model check → run → revision diff·package
4. shell은 별도 experimental 시나리오로만 실행

### 구현·산출물

- representative project fixtures와 signed task scripts
- source/unpacked release browser E2E와 recovery/rollback drill
- performance·memory·50-cycle soak·accessibility·i18n matrix
- final test inventory, release manifest와 operator/user manual
- feature flag disable·previous project reopen·backup/restore rehearsal

### 정량 수용기준

- 핵심 3개 시나리오 source/release 각각 3회 연속 PASS
- Critical/High open finding 0, mandatory flake/skip 0
- UI/API/report run·status 모순 0
- 기존 Phase 7~12 mandatory regression PASS
- Core performance budget 전부 PASS, 50-cycle unreleased resource 증가 10% 이하
- keyboard/1280×720/1920×1080/125%·150% scale/ko-KR·en-US matrix PASS
- 외부 solver dependency·process·network call 0
- 실패·취소·backup restore 후 model과 마지막 성공 run 무결성 PASS

### release 판정

- `workflowReleaseQualified`와 `frameElasticOfficePilotAllowed`를 별도 판정한다.
- `engineeringCrossValidationQualified`와 `finalDesignTransferAllowed`는 기존·신규 공학 gate를 상속한다.
- M8 실패는 `shellDesignTransferAllowed=false`로 격리하며 Core Frame 판정을 자동 실패시키지 않는다.
- `openSeesRuntimeUsed=false`, `externalSolverRuntimeDependency=false`, `nonlinearInScope=false`가 불변이다.

## 5. 중단·차단 조건

다음 중 하나라도 있으면 다음 의존 마일스톤으로 진행하지 않는다.

- 동일 run에서 UI·표·보고서 결과가 다름
- engineering input 변경 후 current 결과가 유지됨
- repair·batch edit·load apply·import 실패가 부분 model mutation을 남김
- 단위·축·부호·source가 불명확한 값을 정상 결과로 표시함
- 생성하중·질량이 중복되거나 보존량 audit가 닫히지 않음
- official source 없이 KDS procedure를 approved로 표시함
- MGT 미지원 record를 조용히 폐기함
- shell mesh provenance 없이 설계전이를 허용함
- 외부 solver runtime dependency가 추가됨
- 기존 사용자 프로젝트 migration에서 데이터 손실 또는 설명되지 않는 수치 변화가 발생함
- mandatory test·evidence를 건너뛰고 상태 문서만 승격함

## 6. 사용자 판단이 필요한 항목

- 이 계획을 `approved / governing`으로 승격할지 여부
- P13 구현 기준 branch와 commit
- KDS official source와 승인자
- MGT 최초 지원 version·익명 fixture
- pilot 대표 프로젝트·검토자·reference Windows 장치
- Core office-pilot과 final design-transfer의 제품 문구

## 7. 첫 착수 순서

1. 계획 승인과 작업트리 baseline 보존
2. P13-M0 current-state audit, requirement/verification/risk ID 확정
3. 상태 불일치 재현 fixture와 Analysis Run schema 작성
4. P13-M1 single run repository를 legacy adapter 뒤에 연결
5. 동일 run parity가 green이 된 뒤 workspace shell을 전환

새 UI 컴포넌트부터 만드는 것은 금지한다. 단일 run/state owner가 먼저 고정돼야 이후 Model Check, 하중과 결과 화면이 같은 제품으로 결합된다.

## 8. 상태 갱신 규칙

- 실제 진행 상태는 [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)에만 기록한다.
- 계획 문서의 목표·수용기준은 변경관리 없이 완료상태에 맞춰 완화하지 않는다.
- requirement·verification 삭제는 이유, 대체 ID, reviewer와 영향분석이 필요하다.
- 마일스톤 완료 때 README, 사용자 매뉴얼, limitation과 Agent contract를 함께 갱신한다.
