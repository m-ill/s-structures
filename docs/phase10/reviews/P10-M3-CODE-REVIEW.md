# P10-M3 Code Review — 부분강접 회전스프링 단부

```yaml
review: P10-M3
date: 2026-07-21
verdict: PASS_FOR_P10_M3_GATE
release_qualification: NOT_RELEASE_QUALIFIED
milestone_status: complete
dedicated_gate: PASS
full_regression: PASS
externally_cross_validated: false
release_qualified: false
evidence_artifact: verification/evidence/validation/phase10/p10-m3-partial-fixity.json
evidence_records: 7/7 PASS
artifact_hash: aa4180cd16d91d6904a2db22
```

## 판정

P10-M3의 4축 단부 회전스프링 schema, 안정 정적응축, consistent fixed-end load 보정, 실제 부재단
회전·단부력 복구, Timoshenko 조합 및 DomainBinary v3 전달 계약을 승인한다. 전용 M3 runner는 4/4,
evidence는 7/7 records PASS했으며 CN-F01~03이 정준 tolerance보다 충분히 작다.

판정 문구는 `PASS_FOR_P10_M3_GATE / NOT_RELEASE_QUALIFIED`다. M3 기능 게이트 완료는 유한 spring의
모든 기하비선형 경로를 완전 자격화하거나 외부 교차검증 배지를 부여한다는 뜻이 아니다. 최종 통합
`npm.cmd test`는 현재 트리에서 exit 0으로 통과했다.

## 리뷰 지적과 수정

1. `releases.spring`은 `[ryI,rzI,ryJ,rzJ]` 정준 순서와 local DOF `[4,5,10,11]`로 고정했다.
   미지정은 강접, 명시적 `0`은 축별 release이며 같은 단부의 binary pin과 spring은 fail-closed한다.
2. 유한 비음수 number만 허용한다. 문자열 coercion, `NaN`, `Infinity`, 음수, 미등록 키 및 axial-only
   member 지정은 canonical validation code로 거부한다.
3. 내부 회전 DOF는 `A=K_SS+D`를 대각 평형화해 푼다. `K̄_RS=K_RS A⁻¹D`,
   `K̄_SS=D A⁻¹K_SS` 안정 block으로 큰 k cancellation과 축별 강성비에 따른 거짓 singular를 피했다.
4. 강성뿐 아니라 `f0`를 같은 Schur 연산자로 보정한다. transformation/loadOffset으로 실제 부재단
   회전을 복구하고 원 `p=Kd+f0`와 spring constitutive moment의 closure를 검사한다.
5. 강접 극한에서 `u_s-d_s`를 직접 빼 생기는 유효숫자 소실은 별도 안정 상대회전 연산자로 제거했다.
6. WP-02의 Φ 보정 K와 consistent f0가 같은 응축기를 통과한다. EB와 Timoshenko UDL 폐형해를 독립
   검증해 강성·하중·복구의 결합을 확인했다.
7. DomainBinary v3는 Float64 4-wide spring 값과 presence bitmask를 함께 전달한다. 값 배열이 모두 0인
   absent와 explicit-zero 모델도 mask와 domain hash가 다르다.
8. 유한 spring Direct P-Delta는 비응축 프리즘 KG 근사임을
   `PARTIAL_FIXITY_PRISMATIC_KG_APPROXIMATION`으로 노출한다. zero-spring P-Delta, global buckling 및
   nonlinear/corotational 경로는 각각 canonical reason code로 차단해 silent ignore를 방지했다.
9. Direct P-Delta의 partial-fixity/Timoshenko limitation은 단건, iteration, 조합, envelope 및 최상위
   designEligibility까지 합집합으로 보존한다. 탄성 member-face closure와 raw KG joint-rotation 기여도
   별도 trace로 표시한다.
10. RSA modal 복구는 signed modal contributor별 spring moment/rotation closure를 검사하고, unsigned
    SRSS/CQC 조합에서는 closure가 적용 불가임을 명시한다. base-shear scaling과 modal trace의 scale
    domain도 분리한다.
11. `updateMember`는 releases/spring 중첩 patch를 보존하며 `spring:null` 전체 삭제와 축별 `null` 삭제를
    지원한다. release summary와 feature catalog도 finite/explicit-zero spring을 공개한다.

## 검증 요약

| 범위 | 결과 |
| --- | --- |
| CN-F01 `10¹²·EI/L`→강접 변위·단부력 | PASS — 최대 상대오차 약 `4.00e-12` < `1e-9` |
| CN-F02 explicit-zero→binary pin | PASS — 최대 상대오차 약 `3.39e-16`, moment residual `7.1054e-15` |
| CN-F03 EB 캔틸레버 UDL 폐형해 | PASS — 최대 상대오차 약 `1.9e-15` < `1e-7` |
| CN-F03 Timoshenko 폐형해 | PASS — 최대 상대오차 약 `2.9e-15` < `1e-7` |
| q0 zero-spring vs binary release | PASS — roundoff 수준 |
| spring moment/회전 compatibility | PASS — moment 상대잔차 ≤`1e-10`, 회전 절대잔차 ≤`1e-12` |
| schema·absent/zero·conflict·frame-only | PASS |
| DomainBinary v3 pack/validate/unpack/hash | PASS — descriptor hash `bae933dd3ed3f39510b59ca2` |
| Direct P-Delta/buckling/nonlinear route | PASS — limitation 및 fail-closed code 정확 일치 |
| Timoshenko+UDL+압축 Direct P-Delta | PASS — 두 limitation이 iteration·조합·설계에 보존 |
| RSA 부분강절 복구 | PASS — 비자명 modal spring closure 및 설계 전달 확인 |
| updateMember/release summary/feature catalog | PASS — patch·삭제·공개 계약 일치 |
| Evidence artifact | PASS — 7/7 records, hash `aa4180cd16d91d6904a2db22`; `externallyCrossValidated=false`, `releaseQualified=false` |
| M3 전용 runner | PASS — 4/4, exit 0 |
| 최종 통합 `npm.cmd test` | PASS — exit 0 (2026-07-21 KST) |

정확한 전용 테스트는 다음과 같다.

- `tests/p10-m3-partial-fixity.mjs`
- `tests/p10-m3-schema-contract.mjs`
- `tests/p10-m3-domain-route-contract.mjs`
- `tests/p10-m3-evidence-contract.mjs`

Evidence는 [p10-m3-partial-fixity.json](../../../verification/evidence/validation/phase10/p10-m3-partial-fixity.json)에
기록했다.

## 비차단 한계와 release 차단 항목

- 유한 spring Direct P-Delta KG: **raw prismatic approximation**, limitation 노출.
- explicit-zero spring Direct P-Delta: **blocked** —
  `DIRECT_PDELTA_PARTIAL_FIXITY_RELEASE_LIMIT_UNSUPPORTED`.
- global buckling: **blocked** — `BUCKLING_PARTIAL_FIXITY_UNSUPPORTED`.
- nonlinear/corotational: **blocked** — `NONLINEAR_PARTIAL_FIXITY_UNSUPPORTED`.
- 외부 solver 기준해와 XV-01~10 required-source green: **pending**;
  `externallyCrossValidated=false`, `releaseQualified=false`.

## 최종 리뷰 문구

`PASS_FOR_P10_M3_GATE / NOT_RELEASE_QUALIFIED`

M3의 선형 탄성 부분강접 기능, 수치 극한, compute 전달 및 미지원 경로의 fail-closed 계약을 승인한다.
최종 통합 회귀는 통과했지만 M11 외부-source 요건이 충족되기 전에는 release 자격을 부여하지 않는다.
