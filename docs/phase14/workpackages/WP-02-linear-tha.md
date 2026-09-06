# WP-02 — THA Qualification & Modal Damping

## 목적

기존 MDOF Newmark·Rayleigh·linear ground-motion 경로를 재사용하고 modal damping과 독립 qualification을 완성한다.

## 작업

1. canonical acceleration series·unit/sign/interpolation
2. β=1/4, γ=1/2 qualified policy
3. modal damping `C=MΦ diag(2ζω)ΦᵀM`, Rayleigh와 Kref snapshot
4. 기존 MDOF coordinator·worker cancellation/checkpoint hardening
5. u/v/a/reaction/energy/peak result
6. dt convergence·duration·memory audit
7. CLI/Agent/UI/report와 current/stale 연결

## 내부 시험

- zero/step/harmonic/free vibration
- exact SDOF와 독립 RK4
- dt-halving second-order behavior
- undamped energy·damped dissipation
- partial publish·restart hash·long-record cancel

## 후속 qualification

동일 excitation sample hash가 확보된 TH1만 frozen manifest로 실행한다. 미확보 시 `TH1-SS`를 exact recurrence/RK4로 qualification하고 공개 peak 직접 비교는 BLOCKED로 둔다.

## 비범위

nonlinear THA, support multi-point excitation, soil-structure interaction, arbitrary integrator selection.
