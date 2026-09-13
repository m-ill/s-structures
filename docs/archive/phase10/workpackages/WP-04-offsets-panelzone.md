# WP-04 — 3D 단부 오프셋 · 삽입점 · 패널존

```yaml
wp: WP-04
milestone: P10-M4
formulas: FORMULAS_AND_CRITERIA.md §4
depends: [WP-00, WP-01]
```

## 배경 (기존 자산)

- 현행: `linear3dAssembly.js` `endOffset.{i,j,rigidFactor}` 축방향 강체 단축(rigidFactor=1). 이를 3D 강체팔 r로 일반화하고 축방향은 특수경우로 흡수 — **기존 모델 하위호환 필수**.
- element descriptor `geometry.offsets`(P8-M1)가 이미 offset 스냅샷 자리 보유 — 필드 확장은 additive.

## 작업

1. 스키마: `member.endOffset` 확장 `{ i:{dx,dy,dz}|number, j:…, frame:'local'|'global' }` (number=기존 축방향 하위호환).
2. T_off 12×12 변환(§4) 구현: k̄=T_offᵀ k T_off, q̄0=T_offᵀ q0. 복원·station 좌표는 유연구간 기준.
3. 삽입점: 단면 배치 기준점(top-center 등) → y/z 편심 자동 산출해 동일 r 메커니즘.
4. 패널존(옵션): `joint.panelZone {tp, db, dc}` → K_pz 회전스프링 자동 부여(WP-03 스프링 재사용, source='panelZone').
5. `rigidFactor<1` 명시 차단 유지(기존 에러코드). 평형감사에 강체팔 모멘트 전달 검사 추가.
6. KG·P-Delta: 오프셋 부재 축력 회수 경로 검증. compute 계약 통과, domain hash additive.

## 게이트

- EL-O01(r=0 회귀 <1e-12) · EL-O02(편심 폐형해 <1e-8) · EL-O03(패널존 등가 <1e-9) · `offset.equilibriumTol`.
- 기존 축방향 offset 모델 결과 불변(<1e-12). 테스트: `tests/p10-m4-offsets-panelzone.mjs`.

## Review Log

| 날짜 | 지적 | 조치 | 상태 |
| --- | --- | --- | --- |
| 2026-07-22 | 3D 강체팔의 부호·좌표계·복원 평형을 단일 계약으로 고정할 것 | `memberOffsets.js`에서 local/global 벡터, 삽입점, `T_off`, face→joint 힘 복원 및 평형 audit를 통합 | resolved |
| 2026-07-22 | 패널존이 M3 spring과 중복 지정되거나 비-frame에 묵시 적용될 위험 | 동일 축 중복과 비-frame을 canonical error로 차단하고 trace `source='panelZone'` 고정 | resolved |
| 2026-07-22 | compute/hash/Agent/P-Delta 경로와 비선형 제한이 누락될 위험 | DomainBinary v4·constraint hash·Agent action·KG 경로를 연결하고 corotational vector offset은 fail-closed | resolved |
| 2026-07-22 | 기능 완료와 외부 release 자격을 구분할 것 | evidence 4/4 PASS, `externallyCrossValidated=false`, `releaseQualified=false` 명시 | resolved |

## 구현 결과

- 숫자형 `endOffset.i/j`는 기존 축방향 clear-length 계약을 그대로 보존한다. 벡터형은 절점에서 부재 유연단으로 향하는 강체팔이며 `frame`은 `local|global`이다.
- 삽입점 9종은 단면 기준점에서 도심으로 향하는 y/z 편심으로 변환되어 같은 `T_off`를 사용한다.
- 절점의 `panelZone {tp,db,dc,axis?}`는 `G·tp·db·dc` 회전스프링으로 변환되어 M3 응축·복원 경로를 재사용한다. `axis` 생략 시 부재 `strongAxis`를 따른다.
- 선형 정적·모달/RSA·Direct P-Delta·탄성좌굴은 공통 요소 변환을 사용한다. 벡터 오프셋/비도심 삽입점의 nonlinear corotational 경로는 `NONLINEAR_3D_OFFSET_UNSUPPORTED`로 차단한다.
- 검증: M4 전용 runner 3/3 PASS, evidence 4/4 PASS. 최종 판정은 [P10-M4 code review](../reviews/P10-M4-CODE-REVIEW.md)에 기록한다.
