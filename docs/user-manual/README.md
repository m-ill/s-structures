# S-Structures User Manual

manualVersion: 2026-06-29-current

이 폴더는 현재 S-Structures를 사람이 직접 쓰거나 AI agent가 제어할 때 참고하는 사용자 매뉴얼이다. 기존 `docs/milestones/M*.md` 문서는 개발 마일스톤 기록이고, 이 폴더는 실제 사용 순서와 안정적인 API 계약을 기준으로 정리한다.

## Current Product Scope

현재 저장소 기준으로 사용 가능한 핵심 범위는 다음과 같다.

| 영역 | 현재 상태 | 사용자 관점 |
| --- | --- | --- |
| 모델링 | 사용 가능 | 기존 `index.html` 기반 3D 구조 모델러, 절점/부재/지점/하중 입력, 예제 모델, 저장/불러오기 |
| 선형 탄성해석 | 사용 가능 | 3D frame 직접강성법, 조합별 해석, 포락, 반력, 변위, 부재력 |
| 탄성 설계 검토 | 사용 가능 | 철골/RC 예비 검토, 부재별 검토비, 지배 조합, 처짐/층간변위 검토 |
| 하중 산정 | 예비 사용 가능 | 용도, 면적, 고정/활/풍/지진 계수 입력 후 하중 생성 및 산정 trace |
| 하중조합 | 예비 사용 가능 | KDS-style preset/rule 기반 조합 생성과 coverage/audit 확인 |
| 보고서 | 사용 가능 | 기본 보고서, 상세 보고서, 계산서 HTML, 브라우저 PDF 출력 |
| AI 제어 | 사용 가능 | `window.SStructuresAgent`, command bridge, stable `data-agent-id` 계약 |
| 안정화 검증 | 사용 가능 | 모델링, 탄성해석, 결과, 보고서 흐름을 반복 검증하는 harness |
| 비선형 | 예비 단계 | pushover 화면/API는 있으나 정식 비선형 반복해석 엔진으로 보지 않는다 |

## Manual Map

1. [01 Getting Started](01-getting-started.md)
   - 실행 주소, 화면 탭, 기본 사용 흐름.
2. [02 Modeling And Elastic Analysis](02-modeling-and-elastic-analysis.md)
   - 모델링, 선형 탄성해석, 결과 확인 순서.
3. [03 Loads Design And Reports](03-loads-design-and-reports.md)
   - 설계기준 입력, 하중 생성, 조합, 상세 보고서와 계산서.
4. [AI Agent Guide](AI_AGENT_GUIDE.md)
   - AI/computer-use/API 제어 계약, 읽기 API, 실행 action, 예제 command.
5. [Agent Contract JSON](agent-contract.json)
   - 자동화가 읽기 좋은 compact API/action/status 계약.
6. [Status And Limits](STATUS_AND_LIMITS.md)
   - 현재 되는 것, 예비 기능, 남은 위험, 다음 작업 기준.

## Source Of Truth

현재 매뉴얼은 아래 파일과 테스트를 기준으로 작성했다.

| 목적 | 위치 |
| --- | --- |
| 공개 엔진 export | `src/index.js` |
| AI capability manifest | `src/ui/agentManifest.js` |
| agent action 목록 | `src/ui/indexAgentActionCatalog.js` |
| agent API 구현 | `src/ui/indexAgentApi.js` |
| command bridge | `src/ui/indexAgentCommandBridge.js` |
| 네이티브 상단 탭/리본 | `src/ui/indexNativeRibbon.js` |
| 설계기준 입력 UI | `src/ui/indexNativeLoadBasisRibbon.js` |
| 안정화 하네스 | `src/verification/stabilizationHarness.js` |
| 대표 테스트 | `tests/m31-agent-command-bridge.mjs`, `tests/m47-design-basis-input-ui.mjs`, `tests/m48-load-derivation-trace.mjs`, `tests/m49-serviceability-drift.mjs` |

## Reading Rule For AI Agents

AI agent는 먼저 `AI_AGENT_GUIDE.md`를 읽고 다음 순서로 상태를 확인한다.

1. `window.SStructuresAgent.getCapabilities()`
2. `window.SStructuresAgent.getSnapshot()`
3. `window.SStructuresAgent.getScreenState()`
4. 필요한 경우 `execute(action, payload)` 호출
5. 해석 후 `getResults()`, `getDetailedReport()`, `getCalculationPackage()` 호출

화면 텍스트보다 `data-agent-id`, API method, action 이름을 우선한다.
