# Phase 3 Elastic Engine Completeness Plan

status: active
milestones: P3-M11(요소/경계/하중), P3-M12(벽체/슬래브), P3-M13(하중 v2/동적/좌굴)
source: 2026-07-02 코드 격차 리뷰

## Purpose

건축구조사무소 실무에서 상용 프로그램(MIDAS Gen/ETABS급)으로 처리하는 해석 기능 중, 현재 엔진에 없는 것을 목록화하고 Phase 3 안에서 구현 범위를 고정한다. **Phase 4는 없다** — 여기서 제외하는 항목은 명시적 비목표로만 남긴다.

## Gap Catalog (2026-07-02 코드 리뷰 기준)

| # | 기능 | 현재 상태 | 실무 필요성 | 처리 | Ticket |
| --- | --- | --- | --- | --- | --- |
| G1 | 스프링 지지 (6-DOF 절점 스프링) | 없음 (fixed/pin/roller/custom fix만) | 지반 스프링, 탄성 경계 — 기초/지하층 필수 | M11 구현 | P3-T68 |
| G2 | 지점 침하 (강제 변위) | 없음 | 부동침하 검토 | M11 구현 | P3-T68 |
| G3 | 트러스/인장전담/압축전담 요소 | 없음 | 가새(인장전담 X-brace), 케이블 | M11 구현 | P3-T69 |
| G4 | 부재 단부 offset / 강역(rigid zone) | 없음 (P2 T10 미구현) | 보-기둥 접합부 clear span — 실무 기본 | M11 구현 | P3-T70 |
| G5 | 부분/사다리꼴 분포하중, 부재상 복수 점하중/모멘트 | 전장 UDL + 단일 점하중만 | 소보 반력, 벽체 하중 재하 | M11 구현 | P3-T71 |
| G6 | 온도하중 (균일 + 구배) | 없음 | 장스팬/외기 노출 부재 | M11 구현 | P3-T72 |
| G7 | 벽체(전단벽) 요소 | schema 준비만 (P2 M2-6) | 한국 벽식/코어 구조 — 필수 중의 필수 | M12 구현 (아래 전략) | P3-T73, T74 |
| G8 | 슬래브/semi-rigid diaphragm | rigid diaphragm만 | 전이층, 개구부 큰 슬래브 | M12 구현 | P3-T75 |
| G9 | 풍하중 v2 (KDS 41 상세 풍압) | v1 등가 층풍하중 | 실무 계산서 요구 | M13 구현 | P3-T76 |
| G10 | 지진하중 v2 (지반계수/R/Cd 상세, 동적 연계 scaling) | v1 밑면전단 분배 | 실무 계산서 요구 | M13 구현 | P3-T77 |
| G11 | 설하중/토압/수압/부력 | 없음 (P2 T20 미구현) | 지하층/기초 검토 | M13 구현 | P3-T78 |
| G12 | CQC 모드 조합 | SRSS만 | 비틀림 연성 건물에서 SRSS 부정확 | M13 구현 | P3-T79 |
| G13 | 선형 좌굴 (eigenvalue buckling) | 없음 | 장주/가새 좌굴 모드 확인 | M13 구현 | P3-T80 |
| G14 | 선형 시간이력 (modal superposition) | 없음 | 동적 검토 보조 | M13 구현 | P3-T81 |
| G15 | 질량 소스 확장 (하중→질량) | node.mass 직접 입력 | D+0.25L 질량 조합 실무 관행 | M13 구현 | P3-T82 |
| G16 | 시공단계 해석 (staged construction) | 없음 | 초고층 특수 | **비목표** (명시) | - |
| G17 | 이동하중/프리스트레스 | 없음 | 교량 영역 | **비목표** (명시) | - |

## M11 Element / Boundary / Load Expansion

### 스프링 지지 + 지점 침하 (P3-T68)

```js
node.support = 'spring'
node.spring = { kx, ky, kz, krx, kry, krz }   // 0 = free, Infinity 불허(대신 fix)
node.settlement = { dz: -0.01, case: 'D' }     // 하중 케이스 소속 강제 변위
```

- 스프링은 전역 강성행렬 대각 가산. 반력 = k·u 로 회복해 기존 reaction 계약에 합류.
- 침하는 지정 DOF 분리 후 강제 변위 우변 이항. validation: 침하 DOF는 fix 또는 spring 지지여야 함.

### 트러스/인장·압축전담 (P3-T69)

```js
member.behavior = 'frame' | 'truss' | 'tensionOnly' | 'compressionOnly'
```

- truss: 양단 모멘트 release + 전단 무시 (기존 release 인프라 재사용).
- tension/compressionOnly: 조합별 반복 — 위배 부재 비활성화 후 재해석, 상태 고정까지 반복(최대 10회). 수렴 실패는 analysis audit에 warning. **조합별 상태가 다르므로 envelope 주의사항을 결과 계약에 명시.**

### 부재 offset / 강역 (P3-T70)

```js
member.endOffset = { i: 0.3, j: 0.25, rigidFactor: 1.0 }  // m, 축방향 강역 길이
```

- 강역 변환행렬로 요소 강성/하중을 유연 구간으로 응축. 설계용 clear length를 member station/design demand에 전달 (P2 M2-4 완료 기준 이행).

### 부재 하중 확장 (P3-T71, T72)

```js
{ type: 'udl-partial', member, w, direction, from: 0.2, to: 0.8 }   // 비율 좌표
{ type: 'trapezoid', member, w1, w2, direction, from, to }
{ type: 'point', member, P, direction, at: 0.4 }                     // 기존 확장: 복수 허용
{ type: 'mmoment', member, M, axis, at: 0.5 }
{ type: 'temperature', member, dT: 20 }                              // 균일
{ type: 'tgradient', member, dTtop, dTbot, h }                       // 구배
```

- 고정단력(FEF) 공식으로 등가 절점하중 + 부재 내력 회복 보정. station 회복(`linear3dRecovery`)이 부재 내 하중 불연속을 반영하도록 station 분할점에 하중 위치 삽입.
- LOAD_TYPES/validation/signConvention/사용 매뉴얼 동시 갱신.

## M12 Wall And Slab Strategy

벽체는 2단 전략으로 간다. v1은 실무 검토에 충분한 등가 프레임, v2는 쉘 정식화.

### 벽체 v1 — mid-pier 등가 프레임 (P3-T73)

```text
wall panel (4 모서리 절점 + 두께 + 재료)
 -> 중앙 수직 기둥 요소 (벽 단면 특성: A, I강축, I약축, J)
 -> 상/하단 강체 보 (rigid link) 로 모서리 절점 연결
 -> pier force recovery: N, V, M -> 벽체 설계 모듈(P3-T89) demand
```

- 개구부 있는 벽은 pier/spandrel 분해 입력 (자동 분해는 비목표, UI에서 패널 분할).
- 검증: 캔틸레버 전단벽 횡변위 handcalc, coupled wall benchmark.

### 쉘 요소 v1 (P3-T74) — L 크기

- 4절점 평면쉘 = 막(membrane, drilling DOF 포함) + 판굽힘(MITC4 또는 DKQ) 중첩. 6DOF/절점으로 기존 조립 체계와 호환.
- 용도: 벽체 정밀 검토, 슬래브 면외 검토(v1은 벽 우선).
- 사각 메쉬 수동 분할 (자동 메쉬는 단순 격자 분할만). 응력 회복: 요소 중앙 + 절점 외삽, 벽체 단면력 적분(pier force)과 교차 검증.
- 검증 benchmark: patch test, 캔틸레버 판, 단순지지 판 처짐 (Timoshenko 해).
- **mid-pier(T73)가 먼저다.** 쉘이 일정 위험이면 T74만 후순위 조정 가능 — 나머지와 독립.

### Semi-rigid diaphragm (P3-T75)

- 층 슬래브를 면내 막요소 격자 또는 등가 브레이스로 모델링하는 옵션. diaphragm 계약(`p2-s4-rigid-diaphragm`)에 `type: 'rigid' | 'semiRigid' | 'none'` 확장.
- 전이층/개구부 큰 층에서 rigid 가정 대비 층전단 재분배 확인 리포트.

## M13 Loads v2 / Dynamics / Buckling

### 풍하중 v2 (P3-T76)

KDS 41 12 기반: 기본풍속, 노풍도, 중요도, 가스트 → 높이별 설계풍압 → 층별 풍하중. 산정 trace는 기존 load derivation trace 계약으로. 특수 형상 풍동은 비목표.

### 지진하중 v2 (P3-T77)

KDS 41 17 기반: 지반분류/S_DS/S_D1, R/Ω/Cd, 근사주기+동적주기 상한, 등가정적 상세 + RSA base shear scaling(V_dynamic ≥ 0.85·V_static 등 계수 자동화), 우발편심 결합(P2 완료분 연결), torsion amplification Ax (P3-T60과 통합).

### 기타 하중 (P3-T78)

설하중(KDS 41 11), 정지토압/주동토압 v1(등가 분포), 정수압/부력. 지하외벽·기초 검토 조합군에 자동 편입.

### CQC + 좌굴 + 선형 THA (P3-T79~T81)

| 항목 | 방법 | 검증 |
| --- | --- | --- |
| CQC | 감쇠비 기반 상관계수, RSA 계약에 method 선택 | 근접 모드 예제에서 SRSS 대비 차이 리포트 |
| 선형 좌굴 | K·φ = λ·KG·φ 일반화 고유치 (기존 KG 재사용, subspace/역반복) | Euler 기둥 λcr ±2%, portal frame sway 모드 |
| 선형 THA | modal superposition + Newmark-β(모드별), 지반가속도 입력, 기록 관리(P3-T86 공유) | 1자유도 정해 비교, El Centro 응답 스펙트럼 재현 |

### 질량 소스 (P3-T82)

`massSource: { combos: [{ case: 'D', factor: 1.0 }, { case: 'L', factor: 0.25 }], includeNodeMass: true }` — 하중→질량 변환(중력가속도 나눔, 수직하중만). 층질량 집계(P2 story mass 계약)와 단일 소스 공유.

## Result / Report Integration

모든 신규 기능은 기존 계약 스타일을 따른다.

1. 신규 요소/하중은 sign convention 문서와 결과표 단위 표기 갱신.
2. tension-only 반복, semi-rigid 재분배, 좌굴 모드는 각각 trace 계약 추가 (`getAdvancedElasticTrace` 확장).
3. analysis audit에 스프링 반력 평형, 침하 케이스 평형 포함.
4. benchmark gate에 신규 검증 케이스 등록 (`QA_RELEASE_PLAN.md` G2).

## Out Of Scope (명시적 비목표 — Phase 4 없음)

| 항목 | 사유 | 계산서 표기 |
| --- | --- | --- |
| 시공단계 해석 | 초고층 특수 영역, 파일럿 대상 사무소 수요 낮음 | 미지원 명시 |
| 이동하중/영향선 | 교량 영역 | 미지원 명시 |
| 프리스트레스/텐던 | PC 특수 영역 | 미지원 명시 |
| 자동 메쉬 생성(비정형) | 격자 분할로 대체 | 격자 분할만 지원 명시 |
| 지반-구조 상호작용(FEM 지반) | 스프링 모델로 대체 | 스프링 근사 명시 |
