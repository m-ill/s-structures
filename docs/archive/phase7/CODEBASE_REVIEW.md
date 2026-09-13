# Phase 7 Codebase Review

```yaml
reviewed_at: 2026-07-10
scope: P7-M0..P7-M11 and elastic-analysis integration
critical_open: 0
high_open: 0
release_recommendation: candidate
```

## 검토 결론

Phase 7의 핵심 실행 경로에서 열린 Critical/High 결함은 남기지 않았다. 입력 계약, 정적해석, Direct P-Delta, 모달/RSA, sparse, 좌굴, UI run record를 코드와 시험으로 역추적했다. 계산 결과는 지원 범위와 검증 증빙이 없으면 설계 전달로 승격되지 않는다.

## 해결한 주요 결함

| 심각도 | 결함 | 조치와 회귀시험 |
| --- | --- | --- |
| High | Direct P-Delta가 고정단 축력을 초기 축력에서 누락 | fixed-end axial 복원 및 load factor 적용, `p7-m8-fixed-end-axial.mjs` |
| High | sparse 반복풀이가 큰 비정정 행렬을 통과시킬 가능성 | full sparse LDLT SPD certification과 resource fail-closed, `p7-m10-sparse-integrity.mjs` |
| High | 모달 residual condensation 실패 후 RSA 결과 생성 가능 | `ok:false`, `rsa:null`, `designBlocked`, `p7-m9-condensation-failure.mjs` |
| High | 좌굴 preload를 수동 축력 map으로 우회 가능 | 성공한 선형 정적 preload만 허용, `p7-m10-buckling-tha-integrity.mjs` |
| High | 좌굴이 프로젝트 custom material/section을 무시할 가능성 | 프로젝트 catalog resolution 및 unsupported-domain 차단 |
| Medium | 대형 대표모델 평형 기준이 하네스 상수와 불일치 | 모델 기준을 결과·audit·하네스에서 공통 사용, `m33`, `m46` |

## 확인한 설계 안전장치

- 미존재 재료/단면 참조와 차원 불일치는 해석 전에 차단된다.
- 신규 모델은 근거 없는 설계조합을 확정하지 않는다.
- 규칙 팩은 source metadata와 engineer approval snapshot을 보존한다.
- 평형 검토는 3개 힘과 3개 모멘트를 모두 포함한다.
- Direct P-Delta, RSA, 좌굴은 실패나 미지원 상태를 숫자 결과로 대체하지 않는다.
- UI run record는 모델 hash, 해석기준 snapshot, verification evidence를 함께 저장한다.

## 잔여 위험과 후속 승인

1. 실제 shell FEM, 비탄성 좌굴, 정식 THA는 현재 지원 범위가 아니다.
2. 브라우저 자동검증은 핵심 화면과 모듈 연결 smoke 범위다. 대표 프로젝트 5종의 사용자 조작 전 과정은 사무소 pilot evidence로 별도 보관해야 한다.
3. 수치 검증 matrix는 내부 독립식/benchmark 중심이다. 상용 프로그램 및 hand calculation과의 프로젝트별 이중 검산은 릴리스 승인 절차에 남는다.
4. 하중 규칙 팩은 고정된 기준 판의 구현이며 이후 고시·정오표를 자동 반영하지 않는다.

이 잔여 항목은 숨은 구현 결함이 아니라 명시된 제품 경계다. 해당 경계를 넘는 입력은 `unsupported`, `preliminary`, 또는 `designBlocked`로 반환해야 한다.
