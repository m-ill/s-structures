# WP-10 — Pushover Qualification & Hardening

## 목적

이미 구현된 production MDOF pushover를 재작성하지 않고, 중립 moment-hinge fixture·독립검증·post-peak failure safety를 완성한다.

## 작업

1. 기존 residual/tangent/convergence와 trial-commit-revert audit
2. benchmark-neutral explicit M-θ backbone·elastic body·control fixture
3. load/displacement/arc-length strategy parity
4. adaptive increment·cutback·rollback hardening
5. checkpoint/cancel/resume
6. base reaction/control displacement/hinge/energy history
7. failure/limit/snap reason code와 UI/Agent/report

## 내부 시험

- linear limit·single hinge closed form
- simultaneous multi-hinge equilibrium
- forced divergence and rollback hash
- monotonic strategy path comparison
- snap-through/back/softening corpus·timeout
- result state and energy consistency

## 후속 qualification

SP1 pre-peak는 첫 외부 gate다. post-peak corpus와 failure safety가 green이 아니면 production release하지 않는다.

## 비범위

full fiber/P-M-M generality, nonlinear THA, PBSD final approval.
