# WP-01 — 독립 교차검증 하네스 + 병적 모델 배터리

```yaml
wp: WP-01
milestone: P10-M1
formulas: FORMULAS_AND_CRITERIA.md §11
depends: [WP-00]
owner-inputs: 외부 solver 기준해 (OpenSees/SAP2000/ETABS 실행 결과)
```

## 배경 (기존 자산)

- P6-M3 검증 매트릭스·record 스키마, evidence artifact 체계(`verification/evidence/validation/`)가 이미 있다 — XV는 그 위의 **새 계층**이다.
- 비선형 pilot 패키지(P8-M11 `nonlinear/qualification/pilotPackages.js`)의 "외부 입력물 수입" 패턴을 탄성으로 이식한다.
- 병적 모델 진단 원천은 이미 존재: sparse 진단(pivot·기구 DOF), `validateModel`, `modeling/repair.js` — BM은 이를 **하나의 게이트 스위트**로 묶는 작업.

## 작업

1. XV artifact 스키마(§11) 구현: `verification/framework/xval/referenceArtifact.js` — 로드·검증(modelHash 결속·단위계·tolerance).
2. XV 러너: 모델 실행 → 응답량 추출(path 규약) → e_rel 대조 → record 저장. async thenable은 차단하고,
   throwing `then` accessor·응답 getter 예외는 `XVAL_RESULT_EXTRACTION_FAILED`로 격리한다. validation 직후
   artifact snapshot을 고정해 executor의 사후 변조로 forged PASS가 생기는 TOCTOU를 차단한다.
   `tests/p10-m1-xval-artifacts.mjs`, `tests/p10-m1-xval-runner.mjs`, `tests/p10-m1-evidence-contract.mjs`.
3. XV-01·02 모델 + hand-calc 기준해 동봉(외부값 도착 전 하네스 자체검증).
4. XV-03~08 모델·executor 제작·저장(기준해는 오너 입력 대기 — `pending-reference` 상태 허용, release 게이트에서만 필수).
5. BM 배터리 10케이스(`tests/p10-m1-bm-battery.mjs`): 각 케이스 "사유 코드 + 위치" 반환 검증. 부족한 진단(중복부재·zero-length 등)은 `validateModel`에 additive 추가.
   diaphragm slave 하중의 구속변환 후 판정, center/off-center diaphragm restraint와 minimum-norm 물리 반력
   복원, spring+explicit prescribed reaction, formerly-free DOF의 explicit `prescribedDisplacement` 적용,
   unresolved coupled constraint를 `UNSUPPORTED_COUPLED_DIAPHRAGM_CONSTRAINT`로 fail-closed, cache 재사용 시
   loaded mechanism 재분류와 delimiter-bearing
   ID의 collision-safe component identity는
   `tests/p10-m1-solver-safety.mjs`로 회귀 고정한다.
6. memberless diaphragm master/support를 동일 component topology에 유지하고, Direct P-Delta에서 explicit
   prescribed displacement를 `DIRECT_PDELTA_EXPLICIT_PRESCRIBED_UNSUPPORTED`로 fail-closed하는 계약은
   `tests/p10-m1-topology-pdelta-safety.mjs`로 고정한다.
7. `externally-cross-validated` 배지 로직: XV-01~10 required-source green이고 pending이 0일 때만 true. M11 release 게이트 소비.

## 게이트

- XV-01·02 hand-calc green, artifact 스키마 round-trip 테스트.
- XV-03~08 모델·executor·`pending-reference` artifact 계약 완비.
- BM 10케이스 전부 정확 코드 반환 (기존 코드와 중복 정의 금지 — 기존 코드 재사용 우선).
- 최종 통합 `npm.cmd test` 종료 코드 0.

M1에서 허용하는 hand-calc green은 **하네스 게이트**다. release 자격은 M11에서 별도 판정하며,
XV-01~10 required-source green, pending 0, `externallyCrossValidated=true`가 필요하다.

## 현재 한계

- XV-02는 전체 모멘트골조가 아니라 3층 대칭 3D 캔틸레버-기둥 + rigid-diaphragm 분석 하네스다.
- XV-02 현재 hand-calc artifact는 M1에는 유효하지만 외부-source release 요건에는 부적격이다.
- XV-03~08은 기준값 미수입(`pending-reference`), XV-09/10은 M2/M9 이후 추가 대상이다.
- 외부 quantity는 러너 응답 단위로 사전 정규화해야 한다. artifact `unit`은 계약 검증용이며 자동 변환은 없다.
- suite의 케이스별 활성 reference artifact는 하나다. hand-calc artifact는 이력으로 남기고 release용 외부 artifact를 활성화한다.
- BM-07은 극단 강성비 truss + spring 조립 모델의 end-to-end 검사다. condition estimate 약 1.333e12에서
  `SOLVER_CONDITION_WARN`과 의도된 `SINGULAR` 실패를 함께 요구한다.
- BM-08은 m-kN/mm-N 원본을 canonical m-kN으로 명시적 정규화한 뒤 두 axial truss product model을
  조립·해석한다. 자동 단위변환 API 검증은 아니며 내부 스키마의 m-kN 제약은 유지된다.
- BM-10 본체는 극연성 spring + truss 조립 모델을 end-to-end로 풀어 `B.uy` pivot 경고와 validation `WARN`을
  검증한다. coupled raw 2×2 dense / sparse LDLT / CG 검사는 backend localization 보조 회귀다.

## Review Log

| 날짜 | 지적 | 조치 | 상태 |
| --- | --- | --- | --- |
| 2026-07-20 | ROADMAP의 "대표 5모델 hand-calc"가 실제 M1 계약(XV-01/02 green, XV-03~08 pending)과 불일치 | ROADMAP·§11·검증표를 실제 계약으로 통일 | resolved |
| 2026-07-20 | artifact schema·modelHash·tamper 검출·runner formula 검증 필요 | 전용 artifact/runner/evidence-contract 테스트와 재현 가능한 evidence 추가 | PASS |
| 2026-07-20 | M1 하네스 PASS와 외부 교차검증 release 자격 혼동 위험 | M1/M11 게이트 분리, XV-02 source 부적격과 badge false 명시 | PASS-M1 / BLOCKED-M11 |
| 2026-07-20 | BM-07·10의 end-to-end 여부와 BM-08 단위계 범위가 불명확 | BM-07/10 assembled fixture, BM-08 explicit normalization 후 product assembly로 전환; 자동 변환 미지원과 raw backend 보조 회귀를 분리 표기 | PASS-with-limitation |
| 2026-07-20 | review P1/P2: diaphragm exact-zero 계수, explicit prescribed DOF, component cache ID 충돌, throwing then accessor | dense/sparse solver-safety와 runner 예외 격리 회귀 추가 | PASS |
| 2026-07-20 | XV-02~08 외부 solver 기준해 미수입, XV-09/10 후속 기능 대기 | release required-source/pending 게이트 유지 | OPEN-owner-input |
| 2026-07-21 | review 후속: off-center 반력 복원, memberless master topology, spring explicit reaction, unresolved coupled constraint, Direct P-Delta, artifact TOCTOU | minimum-norm reaction·fail-closed·snapshot 회귀를 solver-safety/topology/XV runner에 추가 | PASS |
| 2026-07-21 | 전용 M1 게이트 이후 최종 통합 회귀 확인 | `npm.cmd test` 08:17:52.531~08:47:46.914 KST, 29분 54.383초, exit 0 | PASS — P10-M1 complete |
