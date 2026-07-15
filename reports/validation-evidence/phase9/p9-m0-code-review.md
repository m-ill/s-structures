# P9-M0 Codebase Review

```yaml
reviewed_at: 2026-07-15
milestone: P9-M0
status: complete
open_critical: 0
open_high: 0
nonlinear_solver_rerun: false
baseline_artifact: 351c200ac632dad388c590cd7d542e98c2b99b497d91bb65ba109109402778a2
```

## Findings

Open Critical 또는 High finding은 없다.

## Review 중 수정한 항목

| ID | 심각도 | 발견 내용 | 조치 |
| --- | --- | --- | --- |
| P9-M0-REV-01 | High | S-tier 실제 해석이라고 기록했지만 최초 구현은 더 작은 2층 예제 모델을 계산했다. | 실제 64-node, 174-member, 10-combination S-grid를 `analyzeModel`에 전달하고 조합 완전성·평형 audit를 검증하도록 수정했다. |
| P9-M0-REV-02 | Medium | artifact validator가 hash 일치 위주여서 의미가 변한 뒤 hash를 다시 만든 산출물을 충분히 차단하지 못했다. | S-tier 계산 규모, GPU G0, M/L·비선형 정책, tolerance, timer accounting, release fail-closed 상태를 직접 검증하도록 강화했다. |
| P9-M0-REV-03 | Medium | 기본 실행의 source revision이 단순 `working-tree` 문자열이었다. | Git revision을 자동 탐지하고 변경이 있으면 `<revision>+worktree`로 기록하며 탐지 실패 시 명시적 인자를 요구하도록 수정했다. |

## 검토 결과

- S/M/L fixture는 같은 생성기로 결정적으로 생성되고 input hash가 고정된다.
- S-tier 탄성은 174개 부재와 10개 하중조합을 실제 solver로 계산하며 모든 조합과 audit가 PASS다.
- Direct P-Delta, modal/RSA, buckling은 작은 독립 기준값과 허용오차를 비교한다.
- Pushover와 MDOF NLTH는 Phase 8 PASS artifact만 재검증하며 `rerun: false`가 schema와 테스트에 고정된다.
- GPU 구현은 없고 release와 design transfer는 fail-closed다.
- 12개 기술부채 row는 owner, 목표 마일스톤과 대체 경로를 가진다.
- Phase 6 문서와 Phase 4 evidence의 기존 사용자 변경은 검토·커밋 범위에서 제외한다.

## 잔여 위험

- M/L elastic end-to-end 계산은 현재 dense memory 위험 때문에 실행하지 않았다.
- M-tier Pushover와 NLTH 성능은 후속 compute 경로에서 다시 측정해야 한다.
- main-thread latency는 Node timer probe이며 실제 browser UI evidence가 아니다.
- S-tier fixture의 평형 허용값은 명시적인 `1e-6`이고, 후속 CPU/WASM parity 자격에서 더 엄격한 solver residual과 별도로 관리해야 한다.

## 최소 검증

```powershell
npm.cmd run baseline:p9:m0
npm.cmd run test:p9 -- M0
npm.cmd run test:p9docs
```

전체 Phase 8 비선형 regression은 실행하지 않았다.
