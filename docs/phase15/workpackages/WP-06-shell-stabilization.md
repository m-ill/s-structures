# WP-06 — Actual Shell Stabilization Qualification

```yaml
id: WP-06
milestone: P15-M6
document_status: proposed
owners: [shell, dynamics, verification, numerical-review]
dependencies: [WP-01, WP-02]
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
```

## 목표

prescribed synthetic vector self-test와 실제 구조물 stabilization qualification을 분리하고, 각 parameter에서 정적·고유치 문제를 재해석한다.

## 영향 영역

- `src/solver/shell/shellStabilization.js`
- `src/solver/shell/unsupportedRotationFloor.js`
- `src/solver/linear3dAssembly.js` sparse floor path
- eigen MAC/participation common owner
- 신규 stabilization qualification runner와 real wall fixture

## 작업

1. 3층 wall-dominant canonical model, mass, support와 load 동결
2. alpha/floor point마다 actual K/M assembly와 solve artifact 생성
3. requested/effective/range/clamp/log-span/solve-count gate
4. mass-weighted MAC·participation 기반 physical mode matching
5. static/period shift와 physical/stabilization energy 분리
6. dense/sparse 공통 unsupported-rotation plan/classifier
7. physical/rigid mechanism masking negative controls
8. synthetic prescribed-vector 시험은 `SELF_TEST`로 이동

## 수용기준

- static response·period shift 각각 <0.5%
- matched MAC ≥0.99
- modal stabilization energy ratio ≤1e-3, static ≤1e-4
- expected spurious modes 제거, physical/rigid masking 0
- sweep point/solve artifact 수 일치
- invalid/clamped/duplicate sweep PASS 0
- dense/sparse affected DOF parity 100%
- claim `identicalToStrixP3S2=false`

## 비목표

STRIX element parameter를 복제하거나 P3S2와 동일 요소 검증이라고 주장하지 않는다.
