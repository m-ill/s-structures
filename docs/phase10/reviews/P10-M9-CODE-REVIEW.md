# P10-M9 코드 리뷰 — Shell FEM

## 2026-07-23 독립 검증 remediation 판정

아래 2026-07-22 리뷰는 최초 구현 게이트의 역사 기록으로 보존한다. 독립 검증이 발견한 plate 종횡비/두께 결함,
raw 강체모드 위반, QM6 왜곡 민감도, 독립 drilling 대각 스프링과 왜곡 Q4 압력 균등분배를 재현한 뒤 정식과
qualification을 교체했다. 현재 판정은 다음과 같다.

```yaml
remediation_date: 2026-07-23
implementation_status: complete
cpu_f64_numerical_qualification: PASS
cpu_f64_evidence_records: 35/35 PASS
planar_cpu_design_transfer_allowed: false
model_mesh_convergence_qualification: BLOCKED
warning_warped_requires_engineering_review: true
gpu_qualification_scope: precomputed-matrix-reconstruction-deterministic-gather-generic-recovery
native_formulation_gpu_stiffness_generation: not-implemented
native_webgpu_formulation_qualified: false
externally_cross_validated: false
release_qualified: false
artifact_hash: 45389db66c1633dc99e11566
```

remediation은 다음을 포함한다.

- membrane은 중심 Jacobian 및 `det(J0)/det(J)` enhanced-strain mapping을 쓰는 QM6-EAS다.
- plate는 물리 회전 `[w,rx,ry]`, mixed covariant tying shear, 2×2 적분을 쓰는 MITC4다.
- drilling은 `θn−0.5(v,x−u,y)`를 제약하는 Hughes–Brezzi curl-compatible penalty다.
- warning-warped 기준면에는 `U_plane=U+d(n×R)` 강체팔을 적용하며 사후 rigid-mode projector를 쓰지 않는다.
- 면압은 Q4 shape function을 2×2 적분해 절점 총력과 도심모멘트를 함께 보존한다.
- 35-record CPU f64 계약은 왜곡 QM6 patch, 판 종횡비/두께·메시수렴, raw 불변량, 모달,
  planar/warped drilling, consistent pressure를 모두 포함한다.

이 내부 CPU PASS는 XV-10 외부 shell 기준해나 formulation-native WebGPU kernel qualification을 뜻하지 않는다.
M11 release는 두 외부 게이트가 닫힐 때까지 계속 차단한다.

## 2026-07-22 최초 구현 게이트 기록

```yaml
review: P10-M9
date: 2026-07-22
verdict: PASS_FOR_P10_M9_IMPLEMENTATION_GATE
milestone_status: complete-with-open-release-gates
dedicated_gate: PASS
externally_cross_validated: false
native_webgpu_kernels_qualified: false
release_qualified: false
evidence_artifact: verification/evidence/validation/phase10/p10-m9-shell-fem.json
evidence_records: 9/9 PASS
artifact_hash: historical-artifact-see-committed-evidence
```

## 현재 결론

ADR-002 Option C-full의 공용 6자유도 전역 조립과 기존 `equivalent` 경로를 보존하면서 canonical CPU 정식을
`QM6-EAS + MITC4 + Hughes–Brezzi drilling`으로 갱신했다. 과거 `slabPlateDkq`와
`flatShellAllmanDkq` 이름은 소스 호환 facade일 뿐 현재 정식을 뜻하지 않는다.

## 검토 결과

- QM6-EAS는 regular 및 세 종류 왜곡 3×3 patch에서 affine 중심 변위와 자유절점 잔차를 통과한다.
- MITC4는 정사각·2:1·4:1 및 단변/두께비 15~100 Reissner–Mindlin 기준과 메시수렴, raw 강체/곡률 불변량,
  모달 회귀를 통과한다.
- flat shell raw 행렬은 planar와 warning-warped의 전역 강체 6모드를 직접 소거하며, compatible curl은 drilling
  에너지가 0이고 독립 θn 모드는 양의 에너지를 갖는다.
- 왜곡 사다리꼴 Q4 pressure는 비균등 consistent 절점력으로 총력과 도심모멘트를 보존한다.
- M9d parity가 검증하는 것은 CPU precomputed 행렬의 f32 transport뿐이다. GPU가 재료·기하에서 위 정식을
  직접 생성한다는 증거가 아니다.

## 남은 제한

- formulation-native QM6-EAS·MITC4·drilling WebGPU stiffness generation은 미구현이며 native device 적격도 없다.
- XV-10 외부 shell 기준해가 없으므로 `externallyCrossValidated=false`다.
- 요소 벤치마크 PASS는 사용자 모델 메시 적절성을 증명하지 않으므로
  `SHELL_MODEL_MESH_CONVERGENCE_REQUIRED`가 설계 전이를 차단한다.
- warning-warped 요소는 reference-plane 근사이므로 공학검토 없이는 설계 전달할 수 없다.
- 셸 초기응력 기하강성 `Kg`는 포함하지 않는다. P-Delta/좌굴은 기존 프레임 `Kg` 범위에 한정한다.
- punching shear, 철근설계, 자동 메싱, XV-10 외부 기준 비교는 M9 release qualification 범위 밖이다.

따라서 M9 CPU f64 내부 수치 gate는 PASS지만 제품 release gate는 계속 차단한다. 이 remediation 판정이
2026-07-22 최초 구현 기록과 독립 검증 직후의 임시 BLOCKED 기록보다 우선한다.
