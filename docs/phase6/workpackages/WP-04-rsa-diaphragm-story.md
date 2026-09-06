# WP-04 — RSA 후처리 · 다이어프램 Force · 층 결과

```yaml
milestone: P6-M4
priority: 4
depends: WP-03
```

## 문제
RSA는 "값 계산"보다 "설계용 후처리"가 어렵다. SRSS/CQC는 구현됐으나 **부호 소실**·질량참여·scaling·방향조합·편심·층 결과·다이어프램 force reporting이 부족하다. 모달 solver도 dense Jacobi로 대형 모델에 비효율적이다.

## 기존 자산 (재사용/확장)
- `src/dynamics/modal.js` — `jacobiEigen`(→ sparse Lanczos/subspace 확장), `participation`(유지).
- `src/dynamics/elasticCompleteness.js` — 질량참여/response-count 게이트(확장).
- `src/results/rsaTrace.js`·`modalTrace.js` — RSA/모달 trace(확장).
- `src/core/signedLateralCases.js` — 우발편심 부호 케이스(**signed response 전략으로 확장**).
- `src/solver/semiRigidDiaphragm.js`·`diaphragm*`·`src/core/diaphragmGroups.js` — 다이어프램(force reporting 보강).
- `src/results/storyCenter.js`(기하중심 → **실 CoM**), `src/core/storyMassEccentricity.js`, `src/core/storyStiffnessProxy.js`(**proxy → 실 CoR**), `src/results/story*.js`.

## 산출물
- `src/dynamics/eigen/lanczos.js` — sparse 일반화 고유치 `Kφ=ω²Mφ`, shift-invert, mass normalization, near-zero mode 경고.
- `src/results/rsa/massParticipation.js` — 참여율·residual mass·≥90% 게이트.
- `src/results/rsa/baseShearScale.js` — 밑면전단 scaling.
- `src/results/rsa/directional.js` — SRSS·100/30·CQC3 방향조합.
- `src/results/rsa/signedResponse.js` — signed dominant mode / ELF 부호 전략 + "부호조합 아님" 경고.
- `src/results/story/drift.js`, `shear.js`, `overturning.js` — 층 결과.
- `src/results/story/centers.js` — 실 CoM/CoR/torsional eccentricity.
- `src/results/diaphragm/forces.js` — 반강체 diaphragm load-path force(강체는 미보고가 정상). 이 값은 shell/local 정밀설계용 collector/chord force가 아니며, WP-06의 등가모델 scope 경고를 따른다.

## 핵심 식·판정 기준
정준 식은 [FORMULAS_AND_CRITERIA §4](../FORMULAS_AND_CRITERIA.md#4-rsa-후처리-wp-04). 참여계수 `Γn,d`, 유효질량 `Meff`, 누적참여율 `ηd`, 스펙트럼 응답 `qn,max=ΓnSa/ωn²`, **CQC ρij 완전식**(감쇠비 동일/상이), 방향조합(SRSS·100/30·CQC3), 밑면전단 scaling `scale=max(1,V_min/V_RSA)`, 우발편심 `ea=αL, Mt=±eaV`. 임계값·계수는 config `criteria.rsa.*`(질량참여 0.90/0.80, 방향계수 0.30, 편심 α, CQC 주기비 0.9~1.1). 필수 출력 목록·"부호조합 아님" 경고는 §4 준수.

## 수용 게이트
1. RSA one-mode exact match, CQC close-mode 통과.
2. 질량참여 합 <90% 시 경고, residual mass 처리.
3. story drift/shear/overturning 산출, CoM/CoR/편심률.
4. 반강체 다이어프램 load-path force 보고, 강체는 in-plane force 미보고. 결과에는 `not shell/local design force` 경고가 붙는다.
5. 설계조합 `1.2D+1.0E+0.5L`에서 부호 전략 적용, UI 경고 노출.

## 검증 매트릭스 연결
[VERIFICATION_MATRIX](../VERIFICATION_MATRIX.md): D01–D06, A03/A04.

## 코드리뷰 체크
부호 전략 명확성 · 강체/반강체 force 구분 정확성 · CoM/CoR 실값 vs proxy 표기 · 모듈 규모.

## Review Log
| 날짜 | 지적 | 조치 | 상태 |
| --- | --- | --- | --- |
| | | | |
