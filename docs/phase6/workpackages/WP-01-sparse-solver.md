# WP-01 — Sparse Solver + Singularity 진단

```yaml
milestone: P6-M1
priority: 1 (최우선 · 모든 후속 WP의 기반)
depends: —
```

## 문제
`src/solver/linear3dElement.js:13` `solveLinear(A,b)`는 부분피벗 **dense 가우스소거**다. 전역강성행렬은 프레임에서 매우 sparse이므로 DOF 증가 시 메모리·시간이 급증하고, 특이 판정도 `|pivot|<1e-10` 단일 기준뿐이다. 1,000 DOF 초과에서 병목이 체감된다.

## 기존 자산 (재사용/교체 대상 — 새로 만들지 말 것)
- `src/solver/linear3dElement.js` — `solveLinear`(교체), `localK12`/`memberAxes`(유지).
- `src/solver/linear3dAssembly.js` — `assembleStiffness3D`(sparse 조립으로 확장), `analyzeComponent3D`, `summarizeSolverDiagnostics`.
- `src/core/validation.js` — `validateModel`(singularity 진단과 통합).
- `src/solver/analysisAudit.js` — 평형 audit(회귀 게이트 유지).

## 산출물 (마이크로 모듈)
- `src/solver/sparse/cscMatrix.js` — CSC/CSR 저장·조립 헬퍼(단일 책임).
- `src/solver/sparse/symbolicFactor.js` — sparsity-preserving ordering(예: 근사 최소차수) + 심볼릭 패턴.
- `src/solver/sparse/ldlt.js` — sparse LDLᵀ/Cholesky numeric factorization + 전·후진 대입.
- `src/solver/sparse/solveSparse.js` — 다중 RHS(조합 일괄) 풀이, factorization 재사용 핸들.
- `src/solver/sparse/diagnostics.js` — pivot/condition 경고, near-singular DOF 원인(무구속·기구·영강성) 리포트.
- `solveLinear`은 sparse 경로로 위임하되 소형 모델 dense fallback 보존(상호검증용).

## 인터페이스 불변식
`solveLinear(A,b)`·`assembleStiffness3D(...)`·`analyzeModel(...)` 반환 계약 유지. factorization 재사용은 새 옵션 인자로만 노출.

## 핵심 식·판정 기준
정준 식·임계값은 [FORMULAS_AND_CRITERIA §1](../FORMULAS_AND_CRITERIA.md#1-sparse-solver--특이성-진단-wp-01). 대칭성 `e_sym`, 잔차 `e_res`, 조건수 `κ(K)`, pivot 비, LDLᵀ 분해, 기구모드 판정. 임계값은 전부 config `criteria.solver.*`(하드코딩 금지). 진단 출력 항목(fill-in/시간/pivot 경고/mechanism DOF 리스트)은 §1 목록 준수.

## 수용 게이트
1. B01–B10 + 대형 프레임(≥5,000 DOF)에서 **dense=sparse 결과 ≤1e-9 상대오차**.
2. solve 시간·메모리 개선 계측 로그(dense 대비).
3. singular/near-singular DOF 원인 리포트가 `validateModel` 경고로 노출.
4. 다중 RHS 일괄 풀이가 조합별 개별 풀이와 동일.
5. zero-dependency 유지.

## 검증 매트릭스 연결
[VERIFICATION_MATRIX](../VERIFICATION_MATRIX.md): E01–E11, A01–A06 전부가 sparse 경로로 재실행되어야 함.

## 코드리뷰 체크
정확성(수치 일치) · 모듈 규모(각 파일 단일 책임·함수 ≤1000자) · 계약 하위호환 · 진단 경고 정직성 · 성능 회귀 계측.

## Review Log
| 날짜 | 지적 | 조치 | 상태 |
| --- | --- | --- | --- |
| | | | |
