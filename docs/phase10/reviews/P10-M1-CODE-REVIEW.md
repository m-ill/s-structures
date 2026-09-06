# P10-M1 Code Review — 교차검증 하네스·병적 모델 배터리

```yaml
review: P10-M1
date: 2026-07-21
verdict: PASS_FOR_P10_M1_HARNESS_GATE
release_qualification: NOT_RELEASE_QUALIFIED
milestone_status: complete
full_regression: PASS
externally_cross_validated: false
```

## 판정

P10-M1의 reference artifact 계약, XV 실행·대조 러너, XV-01/02 hand-calc anchor,
XV-03~08 모델·executor·pending artifact, BM-01~10 배터리는 M1 하네스 게이트를 충족한다.
전용 `node tools/run-phase10-tests.mjs M1`과 최종 통합 `npm.cmd test`가 모두 PASS했다. 통합 회귀는
2026-07-21 08:17:52.531~08:47:46.914 KST에 종료 코드 0으로 완주했다(29분 54.383초).

이 판정은 **외부 solver 교차검증 완료 판정이 아니다**. 현재 XV-03~08은 `pending-reference`,
XV-09/10은 후속 기능 대기이며, XV-02의 활성 hand-calc artifact는 외부-source 정책에 부적격이다.
따라서 배지는 `false`, M11 release gate는 차단 상태다. 이 release 차단과 별개로 통합 `npm.cmd test`는
PASS했으므로 P10-M1 자체는 `complete`다.

## 검토 범위와 결과

| 항목 | 확인 내용 | 판정 |
| --- | --- | --- |
| artifact 계약 | version/status/source/case/modelHash/unitSystem/quantity/provenance 검증, stable hash와 tamper 검출, JSON round-trip | PASS |
| XV 러너 | model clone·불변성, path 추출 안전성, async thenable 차단·throwing accessor 예외 격리, artifact snapshot TOCTOU 차단, 상대오차 `abs(c-r)/max(abs(r),scale)`, tolerance record 생성 | PASS |
| M1 fixture | XV-01~08 모델 스키마, 모든 케이스 executor 존재, XV-03~08 pending artifact | PASS |
| M1 기준해 | XV-01 4 quantity, XV-02 12 quantity hand-calc 비교 | PASS |
| release 분리 | required XV-01~10, 외부-source XV-02~10, source 부적격·missing green을 badge에서 차단 | PASS |
| BM 배터리 | BM-01~10 canonical code·behavior·location, 중복/누락 0 | PASS-with-limitations |
| solver 안전 회귀 | center/off-center diaphragm restraint와 minimum-norm 반력 복원, spring+explicit reaction, unresolved coupled를 `UNSUPPORTED_COUPLED_DIAPHRAGM_CONSTRAINT`로 fail-closed, formerly-free prescribed DOF, loaded mechanism 재분류, component-cache ID 충돌 격리 | PASS — dense/sparse |
| topology/P-Delta 안전 | memberless diaphragm master component 보존, Direct P-Delta explicit prescribed displacement를 `DIRECT_PDELTA_EXPLICIT_PRESCRIBED_UNSUPPORTED`로 차단 | PASS |
| evidence 계약 | stable hash 재현성과 artifact 내용 검증 | PASS |
| 통합 회귀 | `npm.cmd test` — 2026-07-21 08:17:52.531~08:47:46.914 KST, 29분 54.383초 | PASS — exit 0 |

## Evidence

| Artifact | Hash | 요약 |
| --- | --- | --- |
| [p10-m1-cross-validation.json](../../../verification/evidence/validation/phase10/p10-m1-cross-validation.json) | `01464c3ff4a9a53ffc5f7dd2` | PASS 2, PENDING 6, M1 gate true, badge false |
| [p10-m1-hand-calculations.json](../../../verification/evidence/validation/phase10/p10-m1-hand-calculations.json) | `038ae92cff6ba0b532aeb5d2` | XV-01/02 폐형식·모달 기준값 |
| [p10-m1-pathological-battery.json](../../../verification/evidence/validation/phase10/p10-m1-pathological-battery.json) | `1116ab166e3a0df612530d06` | BM-01~10 PASS |

XV 최대 상대오차는 XV-01 `1.8503717077085944e-14`, XV-02 `1.5911563881114252e-9`로
각 quantity tolerance 이내다. cross-validation evidence의 release 상태는 다음과 같다.

- M1 required: XV-01/02 PASS
- `pending-reference`: XV-03~08
- future/missing: XV-09/10
- 외부-source 부적격: XV-02
- `externallyCrossValidated=false`

## 한계와 후속 조건

1. XV-02는 전체 3D 모멘트골조가 아니라 **3층 대칭 3D 캔틸레버-기둥 + rigid-diaphragm 분석 하네스**다.
2. 외부 quantity는 러너 응답 단위로 사전 정규화해야 한다. artifact 단위 필드는 계약 검증용이며 자동 변환은 없다.
3. suite에서 케이스별 활성 reference artifact는 하나다. M1 hand-calc artifact는 이력으로 보존하고,
   M11 release에서는 required-source 정책을 만족하는 외부 artifact를 활성화해야 한다.
4. BM-07 본체는 극단 강성비 truss + spring 조립 모델의 end-to-end 검증이다(condition estimate 약
   `1.333e12`, `SOLVER_CONDITION_WARN`, 의도된 `SINGULAR`). BM-08도 명시적 m-kN 정규화 뒤 두 axial
   truss product model을 조립·해석하지만, 자동 단위변환 API나 임의 unit round-trip 지원을 뜻하지 않는다.
5. BM-10 본체는 극연성 spring + truss 조립 모델의 end-to-end 검증이다(`B.uy`, pivot ratio
   `7.499994375e-10`, validation `WARN`). coupled raw 2×2 dense / sparse LDLT / CG 검사는 backend
   localization을 고정하는 kernel-level 보조 회귀다.
6. XV-02~08 외부 solver artifact 수입과 XV-09(M2)·XV-10(M9) 추가가 남아 있다.

## 최종 리뷰 문구

`PASS_FOR_P10_M1_HARNESS_GATE / NOT_RELEASE_QUALIFIED`

M1 전용 계약·하네스와 최종 통합 회귀를 승인하며 P10-M1은 `complete`다. 다만 XV-01~10
required-source green 및 pending 0 전에는 외부 교차검증 배지나 M11 release를 승인하지 않는다.
