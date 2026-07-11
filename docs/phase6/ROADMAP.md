# Phase 6 Roadmap — 마일스톤 · 수용 게이트 · 코드리뷰

```yaml
doc: roadmap
phase: 6
date: 2026-07-09
```

추천 개발 순서(외부 검토 판정)를 그대로 마일스톤화한다. 각 마일스톤은 **착수 → 구현(마이크로 모듈) → `/code-review high` → 수정 → 검증표 갱신 → merge(npm test green)**을 1사이클로 하며, 이전 게이트를 통과하지 못하면 다음으로 넘어가지 않는다. 각 마일스톤의 **정준 식·판정 임계값은 [FORMULAS_AND_CRITERIA.md](FORMULAS_AND_CRITERIA.md)의 대응 §**를 단일 출처로 인용하고, 임계값은 `analysisCriteria` config로 읽는다.

## 마일스톤

| M | 이름 | WP | 선행 | 핵심 수용 게이트 |
| --- | --- | --- | --- | --- |
| **P6-M0** | analysis criteria registry | [WP-00](workpackages/WP-00-analysis-criteria.md) | — | 모든 Phase 6 임계값이 `analysisCriteria` resolver를 통해 추적 가능하게 읽힘 |
| **P6-M1** | sparse solver + singularity 진단 | [WP-01](workpackages/WP-01-sparse-solver.md) | M0 | dense 대비 결과 동일(≤1e-9 상대), 5,000 DOF 모델 solve 시간·메모리 개선 계측, singular DOF 원인 리포트 |
| **P6-M2** | consistent load / fixed-end force | [WP-02](workpackages/WP-02-consistent-loads.md) | M0, M1 | 고정단보 UDL 반력·모멘트가 분할수 무관하게 이론값 일치, 사다리꼴/온도/침하 fixed-end 검증 |
| **P6-M3** | regression benchmark suite | [WP-03](workpackages/WP-03-benchmark-suite.md) | M0, M1, M2 | [VERIFICATION_MATRIX](VERIFICATION_MATRIX.md) 요소·조립·동적·안정성 계층 자동화, 회귀표(reference/computed/error/tol/hash) 산출 |
| **P6-M4** | RSA 후처리 · 다이어프램 force · 층 결과 | [WP-04](workpackages/WP-04-rsa-diaphragm-story.md) | M0, M3 | 질량참여≥90% 게이트, 밑면전단 scaling, 부호 전략, story drift/shear/overturning, CoM/CoR/편심, diaphragm load-path force |
| **P6-M5** | P-Delta 기하강성 · 비선형 조합 실행 | [WP-05](workpackages/WP-05-pdelta-tangent.md) | M0, M3 | `Kt=Ke+Kg(N)` 2차해석이 캔틸레버·portal frame 이론값 수렴, 좌굴 λcr와 일관, 비선형 조합 후 중첩금지 강제 |
| **P6-M6** | 등가모델 scope 명시 (**옵션 B 확정**) | [WP-06](workpackages/WP-06-shell-scope.md) | M0 | "등가모델" 전면 명시 + 비허용 결과 미출력 + §6B 검증(global drift<10%·층전단<5%·벽 base moment<10%) |

의존: M0이 모든 WP의 기준값 기반이고, M1이 해석 성능 기반이다. 빠른 solve가 M3 회귀·M5 반복해석 실용성을 좌우한다. M4/M5는 M3 이후 병렬 가능.

## 마일스톤별 상세

### P6-M0 — analysis criteria registry
- **산출**: `analysisCriteria` schema, preset/override/legacy fallback resolver, traceable resolved criteria object.
- **게이트**: [FORMULAS_AND_CRITERIA.md](FORMULAS_AND_CRITERIA.md)의 모든 config 키가 단일 accessor로 읽히고, 기존 `analysisSettings.*` 모델도 하위호환.

### P6-M1 — sparse solver + singularity 진단
- **교체 대상**: `linear3dElement.js` `solveLinear`, `linear3dAssembly.js` `assembleStiffness3D`.
- **산출**: CSR/CSC 자료구조 모듈, symbolic/numeric factorization, 다중 RHS(조합 일괄), condition/pivot 경고를 `validateModel` 게이트와 통합.
- **불변식**: 공개 API 반환 계약 유지, dense 경로는 소형 모델 fallback으로 보존해 상호검증.
- **게이트**: 기존 B01–B10 + 대형 프레임에서 dense=sparse 수치 일치, 성능 계측 로그, singular 원인(무구속 DOF/기구/영강성) 리포트.

### P6-M2 — consistent load / fixed-end force
- **교체 대상**: `elasticExpansion.js` 점하중 분할 → 요소 fixed-end force 벡터.
- **산출**: 하중종류별 `fe`/`q0` 라이브러리(UDL·부분UDL·사다리꼴·집중·모멘트·온도·온도구배·지점침하), `linear3dRecovery.js`를 q0 기반 복원식으로 정밀화, handcalc 식 유지.
- **게이트**: fixed-fixed/연속보/강접골조 반력·고정단모멘트가 이론값 일치, 분할수 독립성.

### P6-M3 — regression benchmark suite
- **산출**: [VERIFICATION_MATRIX](VERIFICATION_MATRIX.md)의 element/assembly/dynamic/stability 계층을 `tests/`에 자동화, 각 케이스가 `{reference, computed, relError, tolerance, modelHash, solverVersion}` 저장.
- **게이트**: 매트릭스 커버리지 목표 달성, CI에서 회귀 감지(tolerance 초과 시 fail).

### P6-M4 — RSA · 다이어프램 · 층 결과
- **산출**: modal sparse eigen(Lanczos/subspace)·residual mass·base shear scaling·방향조합(SRSS/100·30/CQC3)·우발/다이어프램 편심·signed response 전략(`signedLateralCases.js` 확장)·story shear/drift/overturning·CoM/CoR(실제값)·diaphragm load-path force(반강체, shell/local 정밀설계값 아님).
- **게이트**: RSA one-mode exact match, CQC close-mode, 질량참여 합≥90% 경고, "RSA 부재력은 부호조합 결과 아님" UI 경고.

### P6-M5 — P-Delta 기하강성 · 비선형 조합
- **산출**: `buildGlobalGeometricStiffness`의 정식화와 테스트를 공용 `src/solver/geometricStiffness*` 모듈로 추출해 `Kt=Ke+Kg(N)` 조립, load step별 축력 갱신, NR/modified NR(기존 `nonlinear/control/*`) 반복, P-Δ/P-δ 분리 옵션, 좌굴 다중모드(5~10) + shift-invert, 인장/압축전용은 조합 `F` 전체로 iteration(중첩금지).
- **게이트**: P-Delta 캔틸레버·sway frame 이론 수렴, λcr 일관성 체크, 근사 방식은 `analyzePDelta`에 라벨 유지하되 tangent 경로를 기본 옵션화.

### P6-M6 — 등가모델 scope (옵션 B 확정, [FORMULAS §6](FORMULAS_AND_CRITERIA.md#6-shell--등가모델-scope-wp-06-옵션-b-확정))
- `wallSlabEquivalent.js`·`expandShellsToFrameLinks` 유지 + UI/문서/결과 경로에 "벽체·슬래브는 등가모델(shell FEM 아님)" 전면 표기.
- **비허용 결과 미출력**: slab local stress·plate deflection 설계값·shell/local collector/chord 정밀 force·punching shear·mesh stress contour. WP-04의 diaphragm load-path force는 별도 경고와 함께 허용.
- **게이트**: scope 경고 커버리지(모든 벽/슬래브 결과에 경고 문자열), §6B 등가검증(global drift<10%·층전단<5%·벽 base moment<10%), 실 FEM은 이연.

## 코드리뷰 체크포인트 (모든 M 공통)
1. **정확성**: 이론해/기존 dense 경로 대비 수치 일치.
2. **모듈 규모**: 단일 책임·함수 본문 ≤1000자·파일 분할 준수.
3. **계약 하위호환**: 공개 API·`*Contract.js` 불변, 변경 시 마이그레이션.
4. **한계 표기**: 근사/proxy/미구현이 `limitations`·`warnings`·UI에 노출.
5. **zero-dependency**: node_modules 무증가.
6. **회귀**: `npm test` green + 신규 매트릭스 테스트 추가.

리뷰 결과는 각 WP 문서 "Review Log"에 `날짜 · 지적 · 조치 · 상태`로 기록한다.
