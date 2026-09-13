# WP-08 — Plate/Shell Lab 안전 제품화

```yaml
milestone: P13-M8
status: qualification-complete-experimental-view-only
depends_on: [P13-M0, P13-M1, P13-M2, P13-M3, P13-M5]
release_impact: shell-only
target_eligibility: experimental-review-only
```

## 1. 목표와 사용자 결과

기존 CPU flat-shell을 mesh와 결과 provenance가 보이는 experimental workspace로 노출한다. 이 마일스톤의
완료 의미는 shell 설계 자격이 아니라 **거짓 설계전이를 막는 안전한 제품 표면**이다.

## 2. 재사용 자산

- Phase 10 QM6-EAS membrane, MITC4 plate, curl-compatible drilling CPU f64 owner
- Q4 consistent pressure, shell assembly/recovery와 35-record internal qualification
- Phase 10 shell capability/release gate와 result limitation
- M2 Model Check, M3 load panel, M5 property editor, M6 query/legend pattern

## 3. capability 모드

- `LOAD_DISTRIBUTOR_ONLY`
- `SHELL_EXPERIMENTAL_REVIEW_ONLY`
- `SHELL_DESIGN_UNAVAILABLE`

모드는 자동 강등·승격하지 않는다. shell stiffness가 포함된 run은 `REVIEW_ONLY`이며 frame 자동설계·최종 설계요약으로 전달하지 않는다.

## 4. 작업 분해

### WP08-A. Modeling·Mesh QA

- slab/wall/mat geometry, material/thickness/formulation과 local axes
- mesh size/refinement, connectivity, normal, warped/aspect/Jacobian diagnostics
- invalid/degenerate/inverted element blocker와 click-to-element

### WP08-B. CPU run·convergence

- CPU f64 formulation owner만 verified route로 허용
- mesh level별 model/run/mesh hash, dof/element count와 solver settings
- mixed frame-shell load·reaction force/moment equilibrium
- 2개 이상 mesh level의 monitored quantity와 relative convergence

### WP08-C. Results·Contour

- supported displacement, Mxx/Myy/Mxy/Qx/Qy와 stress component
- top/bottom, local axis, raw/averaged와 discontinuity
- color legend, selected element raw value와 provenance
- `REVIEW REQUIRED` watermark와 report limitation

### WP08-D. Containment

- UI/API/Agent/report/calculation package의 `shellDesignTransferAllowed=false`
- shell local response가 frame utilization, auto-section, rebar/punching으로 전달되지 않음
- WebGPU/native shell route는 별도 qualification 전 비활성
- workspace flag off에서도 panel/shell canonical data는 보존

## 5. 검증·정량 수용기준

- P13-SHX-01: patch, rigid-body, Jacobian, local-axis, pressure resultant PASS
- P13-SHX-02: force·moment equilibrium과 energy audit PASS
- P13-SHX-03: supported plate benchmark tolerance PASS
- P13-SHX-04: required mesh convergence provenance 생성·검증 100%
- P13-SHX-05: invalid mesh preflight recall 100%, false green 0
- P13-SHX-06: result mesh/formulation/run hash 누락 0
- P13-SHELL-GUARD-01: convergence 없는 design transfer 0
- P13-SHELL-GUARD-02: shell→frame design/summary leakage 0
- P13-SHELL-GUARD-03: unqualified GPU verified route 0
- P13-SHELL-GUARD-04: UI/API/report eligibility parity 100%

## 6. failure injection

- detJ≤0, twisted normal, excessive warp, singular drilling과 disconnected mesh
- pressure sign/local axis conflict, refinement failure, memory/cancel
- mixed model equilibrium failure, missing contour component
- direct API/report call로 design gate 우회 시도

어떤 실패도 frame-only 결과로 silent fallback하지 않으며 shell run은 blocked/review-only로 남는다.

## 7. evidence·완료판정

- `p13-m8-shell-lab.json`
- implementation/containment gate가 green이면 workspace는 `qualification-complete`가 가능하다.
- 외부 검증이 없으면 `shellDesignTransferAllowed=false`와 `EXPERIMENTAL_REVIEW_ONLY`는 유지한다.

## 8. 비범위·잔여 위험

- native formulation-generating WebGPU 자격
- punching shear, reinforcement, wall/slab local design
- arbitrary opening/contact/nonlinear shell
- Core Frame M9 release의 필수 선행자격이 아님

## 9. 2026-08-05 구현 결과

- Mesh detJ·역전·퇴화·warp·aspect QA와 3-level convergence provenance를 실제 Shell Lab에 통합했다.
- UI·API·Agent·Report·Calculation Package containment가 green이며 `shellDesignTransferAllowed=false`를 유지한다.
- 실제 브라우저에서 Experimental·Review Required·설계전이 차단 표기를 확인했다.
