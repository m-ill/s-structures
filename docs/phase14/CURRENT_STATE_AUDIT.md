# Phase 14 Current State Audit

```yaml
version: p14-current-state-audit-v1
status: review-ready
audited_at: 2026-08-27
source_scope: S-Structures current workspace and STRIX 21-case catalog
```

## 1. 판정 요약

부분 지원 10개는 모두 같은 이유로 막힌 것이 아니다. 네 가지는 셸 기능은 있으나 독립 자격이 부족하고, 세 가지는 명확한 계산기능이 빠져 있으며, 두 가지는 production 계산경로가 이미 있으나 입력·복구·hardening·외부 자격이 부족하고, 하나는 STRIX 전용 시험이라 S-Structures용으로 다시 정의해야 한다.

| ID | 기존 자산 | 결정적 gap | Phase 14 처리 |
| --- | --- | --- | --- |
| SB2 | QM6-EAS membrane, stress recovery | 타원형 mesh·경계 probe·외부 수렴 evidence | M5 |
| SB3 | QM6-EAS, distortion qualification 일부 | Cook mesh family·drilling 비오염·외부 기준 | M6 |
| SB5 | MITC4 plate, pressure load | SS/고정·점하중 8-case·처짐계수 결과계약 | M7 |
| SB6 | MITC4 transverse shear | FSDT 두께/종횡비 범위·shear correction 검증 | M8 |
| SB7 | node spring support | 연속 분포기초 강성·반력분포·자동 모델링 | M1 |
| SR2 | rigid diaphragm, SRSS/CQC | ABS·NRC-10%와 조합 trace | M3 |
| SR2b | truss, diaphragm, translational mass | 회전질량관성·Rz/부재축력 조합 복구 | M4 |
| P3S2 | `drillingAlpha`, shell modal path | STRIX와 다른 안정화 변수·자체 qualification 없음 | M9 |
| SP1 | current-step consistent tangent, displacement/arc-length production MDOF pushover | CSI moment-only 중립 fixture·외부 자격·post-peak qualification | M10 |
| TH1 | MDOF Newmark β=1/4, γ=1/2, linear ground-motion interpolation, Rayleigh damping | modal damping·동일 excitation hash·dt-convergence·외부 자격 | M2 |

## 2. 현재 코드 자산

### Frame·support

- 절점별 `kx, ky, kz, krx, kry, krz` spring support와 반력 trace가 있다.
- frame 요소 조립, Timoshenko 선택, release·부분강접, offset, P-Delta와 modal 경로가 있다.
- 분포 Winkler foundation property와 요소 강성 적분은 없다.

### Dynamics

- modal 해석, rigid diaphragm constraint, SRSS/CQC, response vector·inertia force·base shear 복구가 있다.
- 선형 modal `buildLumpedMass`는 node mass의 병진 3축만 조립하지만 nonlinear mass domain은 이미 `node.mass[0..5]`를 읽는다. Phase 14는 이를 하나의 6DOF public contract로 통합해야 한다.
- combination normalization은 SRSS/CQC 두 방식으로 제한된다.
- MDOF Newmark average-acceleration과 Rayleigh damping 경로는 구현되어 있다. modal damping과 공개 입력 hash에 결속된 외부 qualification은 없다.

### Shell

- CPU f64 owner는 QM6-EAS membrane + MITC4 plate + curl-compatible drilling이다.
- 내부 patch·강체모드·직사각판·메시·modal qualification 자산이 있다.
- 외부 공개 reference와 상용 solver 교차검증, 일반 모델 mesh provenance와 설계전이는 차단돼 있다.

### Nonlinear

- `runProductionPushover`는 current-step MDOF consistent tangent, displacement control과 optional Crisfield arc-length를 사용한다.
- Phase 8 engine 구현과 production regression은 존재하지만 CSI/독립 외부 자격·M-tier·pilot과 post-peak driver 범위가 release blocker다. Phase 14는 엔진을 처음부터 다시 만들지 않고 중립 fixture·hardening·qualification을 담당한다.

## 3. 구조적 원인

1. 기능 존재와 검증 자격을 한 상태로 다루면 내부 test가 곧 production 승인처럼 보인다.
2. 독립 expected-value owner와 production owner의 분리가 모든 기능에 일관되지 않다.
3. schema에 회전질량·분포기초 같은 공학 개념이 명시되지 않아 근사 모델로 우회하게 된다.
4. shell은 요소 수치코어보다 mesh·probe·result provenance·외부 evidence가 더 큰 병목이다.
5. 비선형은 수렴 성공 여부뿐 아니라 false convergence, cutback, limit point와 상태 commit/rollback을 검증해야 한다.

## 4. 유지해야 할 경계

- Phase 13의 immutable run/result/report snapshot과 fail-closed gate를 재사용한다.
- 기존 프로젝트 schema는 additive migration으로 보존한다.
- 외부 solver runtime dependency 금지를 유지한다.
- Shell·nonlinear의 자격 실패가 검증된 frame linear capability를 오염시키지 않게 한다.
- SB12와 SH1은 Phase 14 범위 밖이다. 동일 요소를 새로 만들기로 별도 승인하기 전까지 `unsupported`를 유지한다.

## 5. 계획 착수 전 확인

- dirty worktree와 사용자 변경 snapshot
- Phase 13 mandatory regression 목록·runtime baseline
- 각 benchmark 원문 사용권·reference hash·허용오차 owner
- MIDAS 제품·버전·라이선스와 STRIX 실행 가능 여부는 M11 교차비교 전 owner input
- 공식 claim에서 기관명·소유권·최종설계 표현의 승인 범위
