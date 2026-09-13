# Phase 21 코드 책임과 목표 계약

2026-09-10 · 설계 제안. 기존 코드 경로를 점검한 결과이며 수정 완료 보고서가 아니다.

## 결함·관측·담당 코드 추적표

| ID | 현재 근거와 확정 수준 | 책임 경로·수정 방향 | 마일스톤 / 시험군 |
|---|---|---|---|
| D01 | Direct 강체 다이어프램 미지원: 코드·실제 실패 확인 | `solver/pdelta/secondOrder.js`, `tangentStiffness.js`, `domain/constraintSystem.js`의 동일 구속계 | M0 / PD |
| D02 | SQUARE400 설계 h=600mm: 함수·보고서 재현 | `design/concrete.js`, `core/catalogs.js`의 단면 정규화 계약 | M1 / RC |
| D03 | 전단 축 대응은 검증 필요. 역할의 N/M 숫자 비교·보에 기둥 철근비 경고는 코드 확인 | `concrete.js`, `linear3dRecovery.js`, 설계 demand 계약에서 축·역할·단위·동시 발생량 검증 | M1 / RC |
| D04 | 조합 MAX-WX-N 3.653495mm 대신 포락 9.426mm 표시 | `ui/elasticResultVisualization.js`, `resultSelectionStore.js`, 결과 준비 서비스 | M3 / SEL |
| D05 | wizard 이동이 오래된 draft를 저장하고 입력 hash 변경 | `ui/indexElasticSetupWorkflow.js`, `indexImportAgentState.js` | M2 / INPUT |
| D06 | NG 설명 중복, N/A가 NOT_CHECKED, 역할과 무관한 경고 | `compute/product/elasticReviewService.js`, `design/concrete.js` | M1·M4 / REVIEW |
| D07 | 보고서 프로젝트·수치 요약·빌드 누락, 실패 자격 및 리본 상태 충돌 | `report/phase19/designReviewReport.js`, `report/phase11/reportSnapshot.js`, `core/analysisRunRecord.js`, 제품 상태·UI | M3·M4 / REPORT |
| D08 | 한 조합 요청의 payload에 20조합 포함 관측. 중복 실행 발생 지점은 추가 추적 필요 | `analysisCaseEngine.js`는 이미 선택 조합을 필터링함. `analysisProductService.js`, `unifiedElasticRunService.js`, `elasticProductionAdapter.js`, 실제 브리지 입력까지 추적 | M3·M5 / EXEC·MEM |
| D09 | 조각 조회 도중 세션 초기화. 원인은 미확정 | 호스트 수명·렌더러 종료·사용자 탐색·자원 사용을 함께 계측 | M5·M6 / LIFE |
| D10 | 큰 결과 중복 복제와 바이트 상한 없는 저장소는 코드 확인 | `workflowResults.js`, `elasticReviewService.js`, `preparedResultViews.js`, `ui/webmcp/workflowTools.js` | M5 / MEM |
| D11 | notebook 버전 처리·shear 옵션 충돌, 복원 모델의 원래 hash 불일치 관측 | `ui/indexNativePersistence.js`, `core/migration.js`, 실제 UI 가져오기 라우터·Agent 입력 | M2·M5 / SAVE |
| D12 | 원본 JSON/CSV 미완성, 자동 PDF의 adapter/figure/qualification 차단 | 보고서 artifact·scene manifest·내보내기 수명 계약 | M4~M6 / EXPORT |

표의 파일 경로는 `src/` 기준이다. D03의 축 영향, D08의 실제 실행 경계, D09의 초기화 원인은 수정 전에 최소 재현과 측정으로 확정한다. 관측 수치와 증거 링크는 [기존 상세 기록](../../NUMERICAL-CONSISTENCY-REPAIR-PLAN-20260910.md)을 따른다.

## 1. 하나의 구속계로 Direct 전체 경로 연결

현재 [강체 다이어프램 행](../../../src/solver/diaphragmRows.js)은 수평면의 `ux/uy/rz`를 묶고, [공통 구속계](../../../src/solver/domain/constraintSystem.js)는 지점·강제변위·일반 MPC를 포함한 affine 변환을 만들 수 있다. 새로운 별도 강체 solver를 복제하지 않고 이 계약을 Direct에 연결한다.

```text
정규화 입력·하중조합·구속 topology
  → ConstraintContext {T, uBar, DOF 의미·단위, hash}
  → 하중 단계별 Ke + Kg(N), F, uBar(lambda)
  → 같은 좌표계의 축약·선형계 풀이·안정성·수렴
  → 전체 변위 복원 → 부재력·지점 반력·구속 내력
  → 평형/closure/자격 검증 → immutable AnalysisRecord
```

`ConstraintContext`는 **제안 계약명**이다. 현재 반환 객체의 역할을 확장하거나 내부 helper로 구현하며 공개 solver API를 불필요하게 바꾸지 않는다.

수학적 계약은 `u = T q + uBar`, `Kr = Tᵀ Kt T`, `Fr = Tᵀ(F - Kt uBar)`, `Kt = Ke + Kg`다. 현재 해법은 axial stiffness를 갱신하는 Picard 반복이므로 이를 Newton 또는 재료 비선형 해법으로 이름만 바꾸지 않는다. 전체 수렴 잔차 `Tᵀ(Kt u - F)`와 단계별 증분을 동일 좌표·동일 하중 단계에서 계산한다. 강제변위가 있으면 `uBar(lambda)`를 단계 하중과 일치시킨다.

### 반드시 함께 수정·검증할 지점

- `directCompatibility`: 원시 `nodeIds.length`만으로 판단하지 않고 story/z 지정까지 해석한 실제 group과 구속 검증 결과로 지원 판정한다. 비공면·중복 소속·없는 절점·모순 지점 조건은 ID와 원인을 반환한다. 해석 도중 조용히 누락하거나 마지막 group으로 덮어쓰지 않는다.
- `buildPDeltaTangentStiffness`, `solvePartitionedTangent`: 현재 `(model.constraints || []).length` 조건에 의존하므로 **다이어프램만 있는 모델**도 공통 축약 경로에 들어가게 한다. 같은 T를 강성·벡터·복원에 사용한다.
- `compute/elastic/hybridPDelta.js`: 현재 원래 자유도에서 `buildPartitionedTangentSystem`을 만든다. async 요청에 축약계·복원 계약을 전달해 CPU와 동일 의미로 실행하거나 backend capability로 사전 차단한다. 무검증 CPU 우회나 원래 자유도 풀이를 성공으로 반환하지 않는다.
- `pdelta/stability.js`: 임계하중 bracket은 현재 `Kt`와 원래 free DOF를 사용한다. 반복·seed·임계하중 모두 같은 축약 공간을 사용한다. 축약 DOF index의 `% 6`을 물리적 병진/회전 판별로 사용하지 않는다. 명시적 좌표 의미 또는 차원 정규화를 사용하며 혼합 MPC는 일반화 좌표의 단위를 검토한다.
- `constrainedResidualNorms`: 힘과 모멘트를 합친 단일 원시 norm으로 서로를 감추지 않는다. 병진·회전 증분과 힘·모멘트 잔차를 독립 scale로 검사하고 구속 잔차를 별도로 남긴다.
- `directConstraintDofs`와 반력 복원: 다이어프램 내력은 바닥 내부 힘이다. 이를 지점 반력으로 오인하거나 지점 자유도 판정을 group 소속만으로 바꾸지 않는다. 중복 지점과 구속 내력을 분리하고 `Tᵀ r_constraint≈0`을 검사한다.
- 전체 평형: 현재 `Kg*u` 결과량 보정의 좌표·부호·일관성을 유도하고 독립 기준과 비교한다. 동일 조립 행렬에서 계산한 잔차 하나로 해법과 반력을 모두 검증했다고 하지 않는다. 외력·반력의 6성분 결과량, 요소-절점 closure, 구속의 가상일을 함께 확인한다.
- `analysisCaseEngine.js`의 prestress 소비 경로: 중력 접선강성이 다이어프램을 두 번 축약하지 않는지, 실패한 Direct를 모달/RSA seed로 전달하지 않는지 검증한다.

정적 구속 topology와 T는 한 run에서 재사용할 수 있다. `Kg`, 현재 접선강성의 수치 분해, 하중 단계의 prescribed vector는 변경에 맞춰 갱신한다. 메모리 최적화를 위해 이전 접선의 분해를 그대로 재사용하지 않는다.

## 2. 단면·수요·설계 입력의 단일 의미

- 단면의 형상·길이 단위·local y/z를 catalog 정규화 이후에 확정한다. `SQUARE: H=B`, `RECT: B/H 필요`. 설계 모듈의 임의 300×600 대체를 제거한다. 입력 기본값을 제공하는 UI와 이미 주어진 단면의 해석을 구분한다.
- 치수, A/I, 강성 수정자, 사용자 override를 구분한다. 해석 단면과 설계 유효 단면이 의도적으로 다르면 변환 근거·버전을 기록한다. 무조건 `A=b*h`로 덮어쓰지 않는다.
- member 역할은 명시한 역할을 우선 검증하고 미지정 시 기하학 분류와 출처를 남긴다. N[kN]와 M[kN·m]의 숫자를 비교해 역할을 고르지 않는다.
- 부재력 레코드는 `(runId, comboId, memberId, station, axes, signConvention, units)`를 가진다. `N/My/Mz/Vy/Vz`의 동시 발생 tuple을 보존한다. 독립 절댓값 최대치를 조합한 P-M 수요는 동시 발생 수요로 표시하지 않는다.
- 전단 축은 300×500처럼 비대칭 단면, local 축 회전, 하중 반전으로 확정한 뒤 수정한다. 철근비·철근량·피복·유효깊이·실제 배근의 의미가 없으면 최종 내력 검토로 승격하지 않는다.
- `null/undefined/0/NaN/Infinity`, 부호 오류, 없는 부재·단면·재료는 검증 경계에서 처리한다. 비유효 검정비를 0으로 바꾸어 OK를 만들지 않는다.
- 규칙을 수정하면 관련 rule/design schema 버전을 올리고 과거 검토를 무효화한다. 강성이 같아 기존 해석을 사용할 수 있는 경우에도 새 설계·보고서 ID를 만든다.

## 3. 읽기·편집·실행·선택의 경계

입력 경로는 `현재 모델 → 전체 draft 동기화 → 사용자 편집 → validation → 명시적 apply → 새 input identity`다. draft에는 `baseInputHash/dirty`를 두고 WebMCP나 다른 화면에서 변경되면 충돌을 해소한다. 읽기·화면 이동·보고서 조회에는 모델 쓰기 명령을 호출하지 않는다. 설계기준을 바꿀 때 실제 하중을 자동 재생성할지, 기준만 바뀌어 재검토가 필요한지를 명시하며 한 apply의 범위를 추적한다.

실행 요청은 선택 조합 목록과 전체 조합 실행을 구분한다. `analysisCaseEngine.js`에 이미 있는 필터를 단순 재구현하지 않는다. 실제 Worker payload의 조합 목록·해석 횟수·factor group·출력 목록을 계측하여 필터가 어느 경로에서 무시되는지 찾는다. 동일 입력의 동일 계산은 immutable 결과를 공유할 수 있으나 요청·run 출처를 지우지 않는다.

결과 선택은 제안 키 `(projectId, runId, inputHash, method, comboId, resultVersion)`를 사용한다. Envelope는 별도 모드이고 값마다 governing combo를 가진다. 여러 조합의 성분별 극값을 합쳐 하나의 물리적 변형도나 P-M tuple을 만들지 않는다. 실패·없는 조합을 선택하면 기존 그림과 숫자를 해제한다.

화면, WebMCP, 보고서는 준비된 동일 DTO를 읽는다. 조회·보고서 모듈에 수치 solver import를 다시 추가하지 않는다. Phase 20의 metadata/준비/조회/trace 경계와 공개 동기 API 계약을 유지한다.

## 4. 결과 상태·보고서 출처

`executionStatus`, `numericalQualification`, `designReviewStatus`, `designTransferAllowed`, `stale`는 서로 다른 의미다. 수치 실행의 성공만으로 최종 설계 사용을 허용하지 않는다. 상위 상태와 하위 eligibility·blockers를 하나의 변환 함수에서 만들고 UI·리본·WebMCP·보고서가 공유한다.

검토는 `checks`와 `messages`를 분리한다. canonical check ID는 run·combo·부재·규칙·station·방향을 포함한다. 상태는 기존 계약과 migration을 검토해 `OK/WARN/NG/NOT_CHECKED/N_A`를 구분한다. N/A는 규칙의 적용성 판단 근거가 있을 때만 사용한다. 없는 입력, 미지원 설계, 자격 차단을 N/A로 숨기지 않는다.

보고서 snapshot은 프로젝트 ID, 입력/모델/재료/단면/설정 hash, run·조합 집합, build/source revision, solver/rule 버전, 단위·축, 수치 및 자격 요약, 원본 artifact hash를 포함한다. 최상위 변위/평형 요약은 실제 보고 대상 집합에서 준비하고 scope를 표시한다. 값이 없으면 사유를 남기며 0으로 대체하지 않는다.

기존 기록을 읽는 호환 adapter는 보존하되 없는 identity를 현재 입력의 값으로 소급 채우지 않는다. 원본에 없던 출처는 `unbound`로 유지한다. 복원/이전 버전 기록에 신뢰할 수 없는 자격을 부여하지 않는다.

## 5. 자원 경계와 제안 산출물

세부 내용은 [메모리 계획](MEMORY_MANAGEMENT.md)을 따른다. `AnalysisRecord → DesignRecord → ReportArtifact`는 작은 참조와 hash로 연결하고 내부 immutable payload를 공유한다. 외부 API의 수정 격리는 유지하되 12,000자 한 조각을 읽으려고 전체 보고서를 복제하지 않는다.

새 내부 파일명은 구현 착수 시 확정한다. 후보는 `src/solver/pdelta/constraintContext.js`, `src/core/sectionGeometryContract.js`, `src/compute/product/resourceBudget.js`, `src/compute/product/artifactRepository.js`다. 이 문서는 해당 파일의 존재나 구현을 주장하지 않는다. 기존 책임 안에서 충분한 경우 새 추상화·저장소를 늘리지 않는다.
