# Status And Limits

## Short Answer

비선형 정식 엔진 전 단계의 핵심 제품 흐름은 상당 부분 연결되어 있다. 현재 가능한 것은 “3D 모델링 -> 선형 탄성해석 -> 하중조합 -> 예비 설계검토 -> 산정 trace -> 상세 보고서/계산서 -> AI 제어/검증 harness”까지다.

다만 구조설계사무소 최종 납품 수준으로 보려면 아직 기준식 세분화, 접합/기초 상세, 도면/MGT/이미지 import, 설계자 검토 workflow, 비선형 정식 엔진이 남아 있다.

## Done Enough For Current Elastic Workflow

| 항목 | 근거 |
| --- | --- |
| 기존 `index.html` 모델러 연결 | M22-M28 native UI/runtime/modeler/persistence |
| 3D 선형 탄성해석 | M2, M9, M23-M25 |
| 하중조합과 포락 | M4, M35, M38 |
| P-Delta와 modal/RSA | M7, M8, M29 |
| 상세 보고서 | M34-M36 |
| 계산서 패키지 | M42-M43 |
| KDS-style 조합 registry/audit | M44 |
| 부재별 설계 trace | M45 |
| 안정화 하네스 | M46 |
| 설계기준 입력 UI/API | M47 |
| 하중 산정 trace | M48 |
| 층간변위 검토 | M49 |
| 대표 건물 PDF current trace | M50 |

## Preliminary But Useful

| 항목 | 현재 의미 |
| --- | --- |
| RC 배근 | 예비 schedule 및 기본 철근 선택 |
| 철골 상세 검토 | 예비 member review schedule |
| 접합/기초 | 반력과 접합력 기반 예비 검토 |
| KDS-style 조합 | 완전한 법규 엔진이 아니라 구조화된 preset/rule |
| 풍/지진 하중 | 등가 하중 산정 trace, 세부 code procedure는 미완 |
| pushover | 화면/API와 curve/hinge state tracking은 있으나 정식 비선형 반복해석은 아님 |

## Phase 7 Elastic Workflow

Phase 7의 M0~M11 코드 구현은 완료되었고 릴리스 상태는 `candidate`다. 세부 구현·검증 근거는 `docs/phase7/IMPLEMENTATION_STATUS.md`, 코드리뷰 결과는 `docs/phase7/CODEBASE_REVIEW.md`를 따른다.

| 영역 | 현재 상태 |
| --- | --- |
| 재료·단면 | 현행 KS designation과 legacy alias 분리, SQUARE/RECT/CIRC/H/BOX/PIPE/CUSTOM 지원 |
| 모델링 | 층·그리드 생성, 역할/단면 배치 지정, transaction, 이동·크기조절·도킹 패널 지원 |
| 하중 | load case/mass source/design basis 분리, KDS 41 12 00:2022 규칙 팩 preview/apply/audit 지원 |
| 선형 정적 | 6-resultant 힘·모멘트 평형과 해석기준별 허용치 추적 |
| Direct P-Delta | 조합별 `Kt = Ke + Kg(N)` 경로와 결과 그래프/표 지원; 미지원 release는 차단 |
| 모달/RSA | 모드 정규화, CQC, 밑면전단력, 층·부재 응답; condensation 실패는 차단 |
| sparse/좌굴 | sparse LDLT 자격검사, 검증된 정적 preload 기반 탄성 프레임 좌굴 |
| 실행 기록 | 모델 hash, 해석기준 snapshot, verification evidence가 있는 model-bound run record |

THA는 계속 `preliminary`이며 설계 전달이 차단된다. 실제 shell FEM, 비탄성 좌굴, 미지원 요소가 섞인 Direct P-Delta/좌굴은 지원 결과로 승격하지 않는다. 프로젝트 최종 사용에는 담당기술자의 설계조건 승인과 독립 검산이 필요하다.

## Phase 10 Advanced Elastic Workflow

Phase 10 M0~M11 코드 구현은 완료되었다. Timoshenko 보, 부분강접, 3D offset·패널존, MPC·rigid link, 변단면, prestressed 동적해석, LTB 검토, flat-shell FEM, 슬래브·풍 하중생성은 제품 통합 계약과 Agent API `getPhase10ReleaseStatus`에 연결된다.

현재 릴리스 상태는 `blocked`다. 엄격한 required-source 정책에서는 XV-01만 green이며, XV-02 hand-calc는 source-ineligible이고 XV-03~10 외부 기준자료는 pending이다. 또한 formulation-native QM6-EAS·MITC4·drilling WebGPU stiffness generation과 실제 장치 qualification이 완료되지 않았다. 따라서 `externallyCrossValidated=false`, `release.allowed=false`, `designTransferAllowed=false`를 유지한다. CPU f64 요소 qualification과 precomputed GPU f32 transport parity는 이 외부·native 자격을 대신하지 않는다.

## Not Yet Complete

| 미완 항목 | 필요한 다음 단계 |
| --- | --- |
| 도면 이미지 import | agentic vision이 도면을 읽고 schema-versioned model JSON 생성 |
| MGT import | 외부 모델 파일 parser와 mapping audit |
| KDS 풍하중 상세 절차 | 노출, 지형, 중요도, 내압, 외압, 동적계수 |
| KDS 지진 상세 절차 | 지반, 중요도, 반응수정계수, 주기, 모드조합, 우발편심 |
| 활하중 저감/적설/토압/수압/시공하중 | load standard registry 확장 |
| RC 상세 설계 | 전단, 정착, 이음, 기둥-보 접합부, 내진 상세 |
| 철골 상세 설계 | 폭두께비, LTB, 전단좌굴, 접합부, 베이스플레이트 |
| 기초 상세 설계 | 지내력, 침하, 전도/활동, 말뚝/매트/독립기초 |
| 정식 비선형 | tangent stiffness, hinge degradation, convergence, load/displacement control |
| 사용자 검토 workflow | issue/action item closure, 승인 기록, PDF revision history |

## Current Validation Command Set

개발자가 현재 상태를 다시 검증할 때 쓰는 기본 명령은 다음과 같다.

```powershell
npm.cmd test
npm.cmd run test:uncovered
npm.cmd run test:release
npm.cmd run generate:stabilization-harness
npm.cmd run generate:m42-representative-packages
npm.cmd run export:m42-representative-pdfs
git diff --check
```

금지 문자열 검사는 `src`, `tests`, `tools`, `package.json`, `index.html`, `docs`를 대상으로 별도로 수행한다.

## Phase 12 Local Pilot Profile

Phase 12 M0~M7의 운영 보안·데이터 무결성 gate는 지정 Windows 환경에서 완료됐다.
portable ZIP 신규 설치 3회와 레거시 이전 3회가 독립 상태 루트에서 재현됐고, 정적 공개 allowlist,
외부 data/secrets 경로, 키 교체, rev-bound 승인, backup/restore와 Windows 전체 회귀가 통과했다.

허용되는 범위는 **단일 PC의 loopback-only 내부 파일럿**이다. 설치 폴더와 사용자 상태 폴더를 분리하고,
운영자가 backup을 유지해야 한다. 기본 가입 차단을 유지하며 필요한 bootstrap 기간에만 명시적으로 허용한다.

다음 범위는 계속 차단된다.

- 사내 LAN 또는 외부 주소 bind: 별도 TLS 종단, Origin 정책과 환경별 보안 evidence가 필요하다.
- 공개 인터넷·다중 조직 SaaS: WAF, 관제, 운영 DB, tenant 격리와 외부 보안검토가 필요하다.
- 최종 구조설계·인허가 전이: Phase 10 외부 상용 해석기·수계산 교차검증 gate가 별도로 필요하다.
- 정식 Windows installer·코드서명·자동 업데이트: 현재 산출물은 portable ZIP이다.

## Engineering Interpretation

현재 결과가 “해석은 잘 된다”는 말은 다음 뜻이다.

1. 모델이 schema validation을 통과한다.
2. 선형 탄성해석 solver가 수렴이 아니라 직접 풀이로 결과를 만든다.
3. 총하중과 총반력의 평형 검사가 통과한다.
4. 조합별 결과와 포락이 생성된다.
5. 보고서가 같은 model/analysis 객체에서 생성된다.
6. 하중 산정과 설계검토 trace가 보고서에 붙는다.

하지만 “최종 구조설계가 자동으로 끝났다”는 뜻은 아니다. 현재 프로그램은 계산을 투명하게 정리하고 검토 포인트를 드러내는 방향으로 완성도를 올리는 단계다.

## Phase 4 Performance Limits

Current automated scale evidence is recorded in `verification/evidence/validation/scale-limits.json`.

- Routine interactive use: up to about 1,000 frame members.
- Review-required range: 2,000 members and above.
- Long-run validation required: about 4,000 members before production use.

The 2,000 and 4,000 member rows are generated for scale evidence, but full solver validation is intentionally deferred to a longer dedicated run. `verification/evidence/validation/perf-budget.json` records the current automated performance budget; point-cloud and viewer rows are proxy measurements until owner-provided field files and browser frame captures are available.

## Phase 5 Release Gate

Phase 5 adds a case-based analysis workflow on top of the existing in-house solver. The release-gate coverage is:

| Area | Current status | Evidence |
| --- | --- | --- |
| Analysis Center | Available | `tests/p5-analysis-center.mjs`, `tests/p5-release-gate.mjs` |
| Load conditions and KDS load basis | Available / preliminary where code procedure is simplified | `tests/p5-load-conditions.mjs`, `tests/p5-load-case-kds-mass.mjs` |
| Hinge assignment, pushover, and NLTH | Preliminary but visible in UI and reports | `tests/p5-hinge-assignment.mjs`, `tests/p5-pushover-workflow.mjs`, `tests/p5-nonlinear-performance-nlth.mjs` |
| Result switching, ratio legend, and charts | Available for current result handles | `tests/p5-result-case-views.mjs`, `tests/p5-result-charts-ratio.mjs` |
| Calculation package inclusion | Available, including not-run case rows | `tests/p5-calculation-package.mjs` |

Important limits remain unchanged:

- Response-spectrum output currently emphasizes modal/combined displacement and participating-mass traces; full code-level story force postprocessing remains review-required.
- P-Delta has two explicitly separated paths: the legacy equivalent-load iteration remains labeled as an approximation, and Phase 6 adds a geometric-stiffness Direct Analysis path (`Kt = Ke + Kg(N)`, tension-positive axial convention) for second-order trace review.
- Wall/slab/shell output is an equivalent frame/link model, not certified shell FEM. Reports and result APIs must show the equivalent-model warning and must not report slab local bending stress, wall-opening local stress, shell local design forces, punching shear, mesh stress contours, plate deflection design values, or collector/chord precision forces.
- Pushover and NLTH are preliminary workflow traces. They are useful for UI and review workflows but are not final performance-based seismic design evidence without project-specific engineering validation.
- Calculation packages expose unsupported or not-run checks instead of hiding them.
- Agents should verify `getAnalysisCaseResult`, the calculation package, and this status page before treating Phase 5 results as submittal evidence.

## Post-Phase 5 Final-Use Gate

Phase 5 completion does not by itself approve production structural-office use. The next milestone is the final-use release review exposed as `getFinalUseReleaseReview()`.

| Gate item | Required source |
| --- | --- |
| Practice validation | `getPhase3PracticeValidationReview().summary.productionReady` |
| Evidence register | `getPhase3EvidenceRegister().summary.evidenceComplete` |
| Owner sign-off | `getPhase3OwnerSignoffReview().summary.productionDeploymentApproved` |
| Launch readiness | `getLaunchReadinessReport().agentSafeStatus === "PRODUCTION_APPROVED"` |

Agents must treat `FINAL_USE_BLOCKED` as a hard stop for final-use automation. `FINAL_USE_APPROVED` is valid only when `summary.productionReady` is true and `summary.blockingReviews` is empty.
