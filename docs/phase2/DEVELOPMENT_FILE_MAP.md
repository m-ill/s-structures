# Phase 2 Development File Map

이 문서는 앞으로 개발자가 어느 파일을 만져야 하는지 빠르게 찾기 위한 지도다. 새 기능을 넣을 때 문서와 코드가 섞이지 않도록, 구현 파일은 `src/`, 검증은 `tests/`, 생성 도구는 `tools/`, 설명 문서는 `docs/`에 둔다.

## Source Modules

| 영역 | 현재 폴더 | 역할 |
| --- | --- | --- |
| 모델 스키마 | `src/core/` | model schema, validation, migration, units, catalogs, combinations |
| 선형해석 | `src/solver/` | 3D frame assembly, element stiffness, recovery, P-Delta |
| 동적해석 | `src/dynamics/` | modal, lumped mass, RSA |
| 설계/기준식 | `src/design/` | load estimation, trace, steel/RC/detailing, connection/foundation, serviceability |
| 기준 registry | `src/standards/` 예정 | 기준 ID, 조항 metadata, formula registry |
| 비선형 예비 | `src/nonlinear/` | pushover preliminary |
| 보고서 | `src/report/` | basic report, detailed report, calculation package, formatting |
| UI/agent | `src/ui/` | index bridge, native ribbon, agent API, command bridge, result controls |
| 예제/대표건물 | `src/examples/` | sample frame, two-story frame, representative building generator |
| 안정화 검증 | `src/verification/` | stabilization harness |

## Test Modules

| 테스트 범위 | 위치 |
| --- | --- |
| milestone regression | `tests/m*.mjs` |
| fake browser shell | `tests/helpers/fakeIndexDom.mjs` |
| full milestone suite | `npm.cmd test` |
| stabilization harness | `npm.cmd run generate:stabilization-harness`, `npm.cmd run test:m46` |
| representative reports | `npm.cmd run generate:m42-representative-packages`, `npm.cmd run test:m50` |

## Tooling

| 도구 | 위치 | 산출물 |
| --- | --- | --- |
| local server | `server/main.mjs` | browser app |
| representative HTML/JSON | `tools/generate-m42-representative-packages.mjs` | `reports/representative-building-calculation-packages/` |
| representative PDF | `tools/export-m42-representative-package-pdfs.py` | `output/pdf/m42-representative-packages/` |
| stabilization harness | `tools/run-stabilization-harness.mjs` | `reports/stabilization-harness/` |
| cleanup | `tools/clean-generated-temp.mjs` | generated temp cleanup only |

## Planned Phase 2 Folders

아래 폴더는 아직 없거나 확장 예정인 위치다. 만들 때는 같은 기준을 유지한다.

| 예정 폴더 | 목적 | 첫 산출물 |
| --- | --- | --- |
| `src/import/` | drawing image, MGT, external JSON을 model schema로 변환 | importer contract, mapping audit |
| `src/standards/` | KDS clause registry를 core/design에서 분리할 경우 사용 | load/design standard tables |
| `src/design/rc/` | RC 상세 설계가 커질 경우 분리 | beam/column/shear/detailing modules |
| `src/design/steel/` | steel 상세 설계가 커질 경우 분리 | compactness/LTB/connection demand modules |
| `src/report/review/` | action item과 revision workflow가 커질 경우 분리 | review issue model |
| `tests/fixtures/` | import/report 대표 입력 fixture | small deterministic fixtures |

## Change Routing

| 하려는 작업 | 먼저 볼 파일 |
| --- | --- |
| 모델 필드 추가 | `src/core/schema.js`, `src/core/model.js`, `src/core/migration.js` |
| validation rule 추가 | `src/core/validation.js`, `tests/m1-schema.mjs` |
| 선형 solver 수정 | `src/solver/linear3d*.js`, `verification/specs/LINEAR_SOLVER_VERIFICATION.md` |
| 하중 산정 수정 | `src/design/loadEstimation.js`, `src/design/loadDerivationTrace.js` |
| 기준식 registry 추가 | `docs/phase2/STANDARD_ENGINE_PLAN.md`, `src/standards/` 예정 |
| 하중조합 수정 | `src/core/kdsLoadCombinations.js` |
| RC/steel 검토 수정 | `src/design/rcDetailing.js`, `src/design/steelDetailing.js`, `src/design/memberDesignTrace.js` |
| 계산서 수정 | `src/report/calculationPackage.js`, `src/report/detailedReport.js` |
| AI action 추가 | `src/ui/indexAgentActionCatalog.js`, `src/ui/indexAgentApi.js` |
| command bridge 수정 | `src/ui/indexAgentCommandBridge.js`, `tests/m31-agent-command-bridge.mjs` |
| 상단 리본 수정 | `src/ui/indexNativeRibbon.js`, 관련 native module |
| 안정화 케이스 추가 | `src/verification/stabilizationHarness.js`, `tests/m46-stabilization-harness.mjs` |

## Direct Analysis Routing

| Work | First files to review |
| --- | --- |
| Direct Analysis P-Delta implementation | `docs/phase2/P2_M5_DIRECT_ANALYSIS_IMPLEMENTATION_PLAN.md`, `src/solver/linear3d*.js`, `src/results/pDeltaTrace.js` |
| Direct Analysis verification | `verification/specs/P2_M5_DIRECT_ANALYSIS_VERIFICATION.md`, `tests/p2-m5-direct-*.mjs`, `src/examples/verification.js` |
| Direct Analysis UI/report/API exposure | `src/ui/indexNativeResultControls.js`, `src/ui/indexResultsPanel.js`, `src/report/`, `src/ui/indexAgentApi.js` |

## Documentation Update Rule

| 변경 종류 | 갱신 문서 |
| --- | --- |
| 사용자가 누르는 메뉴/탭 변경 | `docs/user-manual/01-getting-started.md` |
| 모델링/해석 workflow 변경 | `docs/user-manual/02-modeling-and-elastic-analysis.md` |
| 하중/조합/보고서 변경 | `docs/user-manual/03-loads-design-and-reports.md` |
| agent API/action 변경 | `docs/user-manual/AI_AGENT_GUIDE.md`, `docs/user-manual/agent-contract.json` |
| 기능 상태 또는 limitation 변경 | `docs/user-manual/STATUS_AND_LIMITS.md` |
| 개발 트랙 변경 | `docs/phase2/README.md` |
