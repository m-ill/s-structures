# P10-M9 코드 리뷰 — Shell FEM

```yaml
review: P10-M9
date: 2026-07-22
verdict: PASS_FOR_P10_M9_IMPLEMENTATION_GATE
milestone_status: complete-with-open-release-gates
dedicated_gate: PASS
externally_cross_validated: false
native_webgpu_kernels_qualified: false
release_qualified: false
evidence_artifact: reports/validation-evidence/phase10/p10-m9-shell-fem.json
evidence_records: 9/9 PASS
artifact_hash: 183414da147bffc2282d2768
```

## 결론

ADR-002 Option C-full 승인에 따라 4절점 membrane, plate, flat-shell 요소와 공용 6자유도 전역 조립을 도입했다. 기존 `equivalent` 셸은 그대로 유지되며 `membrane`, `plate`, `shell` formulation만 FEM 경로를 사용한다. CPU f64 경로는 M9 전용 내부 검증을 통과했다.

## 검토 결과

- QM6 계열 비적합 모드 4개를 정적 응축하고 patch test 및 벽 캔틸레버 허용오차를 통과했다.
- DKQ 호환 굽힘/assumed-shear 요소는 정사각형 판 폐형식 해 대비 0.7495% 오차를 보였다.
- membrane과 plate를 24×24 전역 행렬로 결합했고 강체모드 에너지, 대칭성, 기생에너지 및 warped-panel 차단을 검증했다.
- 셸 압력하중, 응력·resultant 복원, DomainBinary 배열, 전역 평형 및 lumped mass 조립을 연결했다.
- SoA/f32 배치 후보는 CPU f64 대비 최대 상대오차 `4.35e-8`이며 잔차 gate 실패 시 CPU f64로 자동 폴백한다.

## 남은 제한

- M9d는 native WGSL K1 tangent materialization, K2 fixed-order gather, K3 stress recovery와 브라우저 qualification harness를 구현했다. 이번 작업 환경에서는 브라우저 제어 런타임 초기화 오류로 실장치 dispatch evidence가 BLOCKED이므로 장치 qualification은 M11에 남긴다.
- flat-shell membrane은 QM6 기반 drilling 안정화 결합이며 완전한 독립 Allman 보간의 외부 교차검증은 아직 없다.
- 셸 초기응력 기하강성 `Kg`는 포함하지 않는다. P-Delta/좌굴은 기존 프레임 `Kg` 범위에 한정한다.
- punching shear, 철근설계, 자동 메싱, XV-10 외부 기준 비교는 M9 release qualification 범위 밖이다.

따라서 M9 기능 구현 gate는 제한부 PASS지만 제품 release gate는 M11까지 차단한다.
