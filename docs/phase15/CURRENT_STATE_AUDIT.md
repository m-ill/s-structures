# Phase 15 Current State Audit

```yaml
version: p15-current-state-audit-v1
status: review-ready
audited_at: 2026-08-27
source_scope: S-Structures first STRIX-21 batch, raw result JSON, benchmark harness and affected production modules
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
```

## 1. 기준 자료

- 비교보고서: `output/pdf/S-Structures_STRIX21_1차_비교보고서.pdf`
- 원시 결과: `verification/benchmarks/strix21/runs/first-batch-results.json`
- 실행기: `src/verification/benchmarks/strix21FirstBatch.js`
- 1차 결과: 12 cases, 45 metrics, PASS 6, CUSTOM_PASS 1, REVIEW 5, metric PASS 32

아래 진단 수치는 원시 결과와 코드 경로를 대조한 재현값이다. P15-M0에서 source/input/reference/tolerance hash를 동결하고 재생성하기 전에는 release evidence로 사용하지 않는다.

## 2. 미해결 항목 판정

| ID | 보고서 상태 | 확인 원인 | 엔진 수식 판정 | 수정 owner |
| --- | --- | --- | --- | --- |
| SB2 | REVIEW, 725% 수준 오차 | 국부 `localMatrix`를 전역 x-z DOF에 조립, 최종 16×8 과소 정련 | QM6-EAS 변경 근거 없음 | benchmark assembly + sparse workflow |
| SB3 | REVIEW, 129.785% | SB2와 같은 좌표변환 누락 | QM6-EAS 변경 근거 없음 | benchmark assembly |
| SB5 | REVIEW, 5/8 실패 | 5:1 짧은 방향 6요소, 정련 시 IC(0)-CG pivot 실패 | MITC4는 기준으로 수렴 | plate workflow + SPD solve policy |
| SB6 | REVIEW, 5/6 실패 | hard SS 기준을 w-only soft SS로 실행 | MITC4 shear 식 변경 근거 없음 | boundary contract |
| SB7 | REVIEW, moment 0.110491% | station 복구 시작 단부력에 `Kf·d` 누락 | Winkler stiffness kernel 정상 | foundation recovery |
| P3S2-SS | CUSTOM_PASS | 실제 구조물 재해석 없이 예정된 0%·MAC=1 생성 | 자격 증거 부재 | stabilization qualification |

## 3. 수치 분리 결과

### SB2·SB3

`strix21FirstBatch.js`의 SB2·SB3 전용 조립기는 요소 국부축 강성을 전역 자유도에 직접 더한다. production shell assembly는 변환 완료된 global matrix를 사용하므로 같은 결함이 production full-shell 조립에서 확인된 것은 아니다.

- SB3 12×12 전역조립: 23.8305, 기준 23.91, 오차 약 `-0.332%`
- SB2 64×32 전역조립: 89.9629 MPa, 기준 92.7 MPa, 오차 약 `-2.953%`
- SB2 96×48 전역조립: 90.8574 MPa, 동일 메시 STRIX 90.8514 MPa, 차이 약 `+0.0066%`

따라서 SB2·SB3 해결을 위해 `qm6MembraneLocal`, EAS 응축 또는 stress probe를 기준값에 맞춰 변경해서는 안 된다. 전역조립 owner와 정련 경로를 수정한다.

### SB5

동일 MITC4를 dense로 정련하면 5:1 판 응답이 기준값으로 단조 수렴한다. 예를 들어 simply-supported UDL 오차는 짧은 방향 6→8→12요소에서 약 `-4.34% → -2.43% → -1.07%`로 감소한다. clamped 5:1은 더 높은 정련이 필요하다.

현재 `plateWorkflow`는 전체 dense K를 먼저 만들고 reduced DOF가 512 이상이면 `createElasticFactorSession`의 IC(0)-CG 경로로 전환한다. 정련 모델에서 `ICCG_NON_POSITIVE_PIVOT`가 발생하며 신뢰 가능한 fallback과 equilibration이 없다.

### SB6

현재 `simply-supported`는 모든 경계절점의 `w`만 구속한다. 원 기준은 hard simply-supported다. 현 plate DOF 계약에서 모든 변 `w=0`, x-constant 변 `rx=0`, y-constant 변 `ry=0`로 바꾸면 6개 응답이 모두 1% 이내에 들어온다. soft 경계는 두꺼운 판에서 다른 연속체 경계로 수렴하므로 mesh를 늘려 해결할 수 없다.

### SB7

현재 station 복구는 다음 단부력에서 시작한다.

```text
structuralEnd = Ks·d + f0_external
```

그리고 foundation reaction `-kN·d`를 분포하중처럼 적분하지만 시작 단부력에 `Kf·d`를 포함하지 않는다. 올바른 평형 계약은 다음과 같다.

```text
foundationEnd = Kf·d = -equivalentActionLocal
equilibriumEnd = structuralEnd + foundationEnd
```

32요소 중앙 모멘트는 현재 17717.549685 kip-in이나 `equilibriumEnd`를 적용하면 17697.987786 kip-in이며 정확해 17697.995034 대비 약 `-0.000041%`다.

64요소 기본 sparse 경로에서는 solver residual 약 `8.10e-7`, 전체 평형 residual 약 `9.76e-7`인데 후속 평형 한계는 `1e-8`이다. solver와 audit tolerance 계약도 함께 정렬해야 한다.

### P3S2-SS

현재 alpha sweep은 alpha와 무관한 compatible force norm을 비교하고, rotation-floor sweep은 영향 DOF 값이 0인 response vector를 사용하며, mode vector는 reference의 정확한 배수다. 따라서 0%와 MAC=1은 계산 성공 증거가 아니라 입력 구조의 결과다.

실제 구조물 K/M, 경계조건과 하중을 만들고 각 parameter에서 정적·고유치 문제를 다시 풀기 전에는 `SELF_TEST` 이상으로 분류하지 않는다.

## 4. 기존 PASS 6건의 증거 수준

production solver가 benchmark 정답을 하드코딩한 흔적은 확인되지 않았다. 다만 다음 약점 때문에 기존 PASS는 `preliminary-numeric-pass`로 취급한다.

| 사례 | 열린 증거 gap | 위험 |
| --- | --- | --- |
| SB1 | reference provenance/hash 미동결 | 수치 낮음, 자격 높음 |
| SB8 | 128요소 한 점, mesh convergence·mode MAC·modal mass audit 없음 | 중간 |
| SB9 | 휨+축변형 합계만 비교해 성분 상쇄 가능 | 중간~높음 |
| SB10 | 실제 음의 축력을 `compareMagnitude`가 양의 기준과 PASS 처리 | 높음 |
| PD1 | mesh·load-step convergence와 stage/equilibrium closure 부족 | 중간 |
| SM5 | 고유치만 비교하고 mode MAC·질량직교성·참여율 없음 | 중간 |

## 5. 교차결함

1. artifact hash에 시작·완료시각이 포함되어 같은 계산도 hash가 바뀐다.
2. SB5·SB6은 `stableHash(null)`을 사용해 서로 같은 무의미한 result hash를 가진다.
3. `completedCase()`는 metric과 일부 energy만 보고 PASS를 만들며 평형·수렴·reference 독립성·probe lineage를 필수화하지 않는다.
4. benchmark test는 수치 정확성 대신 `PASS 6 / REVIEW 5` 상태 개수를 고정한다.
5. 보고서 generator에는 원시 artifact에 없는 진단 설명이 하드코딩돼 있다.
6. tolerance fraction `0.001`과 표시 percent `0.1`이 혼용되어 100배 단위 오류 위험이 있다.
7. membrane·plate benchmark가 production assembly/workflow를 통하지 않고 dense 조립을 복제한다.
8. curved membrane의 averaged stress는 서로 다른 요소 국부축 성분을 global tensor 회전 없이 평균한다.

## 6. 작업트리 상태

관련 Phase 14 문서·verification·shell 파일이 modified 또는 untracked인 큰 dirty worktree다. Phase 15 구현 전에 다음을 필수 수행한다.

- 기준 source revision과 `git status --short` 보존
- 사용자 변경과 Phase 15 변경을 분리한 branch/worktree 또는 승인된 checkpoint
- 현재 보고서·JSON·실행환경 hash 보존
- 기존 산출물 덮어쓰기 금지, Phase 15 evidence는 새 경로에 기록

## 7. 최종 감사 판정

현재 release 판정은 다음과 같다.

- Phase 14 capability 구현: 완료 기록 유지
- Phase 15 correctness repair: NOT_STARTED
- 기존 6 PASS: preliminary numeric evidence
- P3S2-SS: internal self-test only
- independent qualification: 미승인
- cross-solver qualification: 미승인
- capability release: 전부 차단
- final design transfer: 차단
