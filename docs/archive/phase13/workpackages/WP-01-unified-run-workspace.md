# WP-01 — Unified Analysis Run·Workspace

```yaml
milestone: P13-M1
status: implementation-complete
depends_on: [P13-M0]
release_impact: core-blocking
```

## 1. 목표와 사용자 결과

실행, 결과, status와 report의 단일 진실원천을 만든 뒤 구조기술자용 3-pane 작업공간을 올린다.
사용자는 언제 어떤 모델·설정으로 계산된 결과인지, 현재 입력과 같은지 즉시 알 수 있다.

## 2. 재사용 자산

- `src/core/analysisRunRecord.js`, `src/core/analysisDomainHashes.js`
- `src/compute/product/elasticAnalysisService.js`, `analysisProductService.js`
- `src/ui/phase7AnalysisRecords.js`, `analysisRunners.js`, `resultSelectionStore.js`
- Phase 12 revision/modelHash와 Phase 11 report snapshot
- `workspaceState.js`, `phase7WorkspaceController.js`, `floatingPanel.js`

## 3. 목표 아키텍처

- `ElasticRunSet`: case/run 상태, result handle, qualification과 provenance
- `ElasticRunCoordinator`: preflight, queue, cancel, retry, publish
- `ElasticRunRepository`: project revision별 canonical run 저장·복원
- `ElasticRunStore`: UI subscription과 Current/Stale projection
- `LegacyRunAdapter`: 기존 ribbon/wizard/global consumer 격리
- `ElasticWorkspace`: tree, viewport, inspector, drawer의 panel registry

경로명은 예정이며 M0에서 최종 소유 모듈을 확정한다.

## 4. 작업 분해

### WP01-A. 상태 머신

- execution: `not-run/queued/blocked/running/completed/failed/cancelled/stale`
- qualification: `verified/candidate/preliminary/blocked`
- publish는 completed+hash valid 결과에만 허용
- failed/cancelled run과 마지막 성공 run 동시 보존

### WP01-B. hash·stale 계약

- model/revision/domain/load/mass/combo/analysis-setting/build hash snapshot
- engineering input mutation event와 stale reason registry
- camera, selection, layout, legend 같은 view state는 result를 stale로 만들지 않음
- 초기 release는 안전한 전체 stale; 부분 재사용은 dependency matrix가 검증된 뒤만 허용

### WP01-C. 실행 orchestration

- preflight→case plan→run→audit→publish의 원자 상태전이
- progress, cancel acknowledgement, retry와 partial case failure
- 전체 탄성해석과 개별 case가 같은 coordinator 사용
- 자동 재해석 금지, 명시적 Run만 허용

### WP01-D. Workspace shell

- 상단 6개 workspace + Run + Current/Stale
- 좌측 Model/Case Tree, 중앙 viewport, 우측 inspector/legend, 하단 drawer
- 기존 7단계 wizard는 같은 service를 사용하는 입문 checklist로 유지
- 1280×720에서 과밀한 ribbon command를 panel/context action으로 이동

### WP01-E. migration·adapter

- 기존 run record additive migration 또는 read adapter
- 기존 project reopen에서 hash가 일치할 때만 current 복원
- old ribbon/result popup/report consumer를 adapter 뒤로 이동
- feature flag off 시 Phase 12 UI로 복귀

## 5. 검증·정량 수용기준

- P13-RUN-01: ribbon/wizard/dashboard/report/API active run ID parity 100%
- P13-RUN-02: model edit 후 관련 run stale 반영 1 event loop 이내
- P13-RUN-03: layout/camera/selection change의 stale 발생 0
- P13-RUN-04: mixed-run 화면·export 0
- P13-RUN-05: failed/cancelled run publish 0, last success hash 불변
- P13-RUN-06: save/reopen current 복원은 full input hash 일치 때만 성공
- P13-RUN-07: legacy project migration 데이터 손실 0
- P13-UX-01: 1280×720 잘림·가로 스크롤 0
- P13-UX-02: Run→static result open 2 click 이내
- P13-UX-03: keyboard focus loss·trap 0
- P13-PERF-01: input acknowledgement p95 100 ms 이하

## 6. failure injection

- worker crash, cancel, case failure, report 요청 중 model edit
- corrupted persisted run, mismatched revision/hash, missing result handle
- rapid double Run, multiple stale events, workspace reload 중 실행

각 실패에서 model은 불변이고 current publish가 발생하지 않아야 한다.

## 7. evidence·완료판정

- `p13-m1-unified-run-workspace.json`
- source/reload/browser/package E2E와 code review PASS
- status contradiction fixture 전부 green일 때 `qualification-complete`

## 8. 비범위·잔여 위험

- M1은 결과 UI의 내용과 하중 기능을 확장하지 않는다.
- legacy adapter는 제거일·사용처와 parity gate 없이 삭제하지 않는다.

## 9. 2026-08-05 통합 구현 결과

- `src/ui/indexPhase13ElasticWorkspace.js`를 `indexBridge.js`에 연결해 실제 앱 상단에서 실무 워크벤치를 연다.
- 6개 workspace, Model/Case Tree, 중앙 검토 화면, Inspector, Analysis Drawer가 현재 모델과 Phase 7 실행기록을 공유한다.
- 선택 실행과 전체 탄성해석은 기존 S-Structures 자체 엔진 서비스만 호출한다. 비선형 케이스는 필터링되며 OpenSees·외부 solver 경로는 없다.
- 전체 실행 뒤 별도 결과 popup을 자동으로 겹치지 않고 워크벤치 결과 탭에 상태를 유지한다.
- 통합 테스트 `tests/p13-m1-index-workspace-integration.mjs`와 실제 브라우저에서 6개 case, `Current`, 단일 Run ID, popup 비중첩을 확인했다.
- packaged restart, 키보드 focus, 1280×720 정량 capture와 full regression 완주 전까지 `qualification-complete`로 승격하지 않는다.
