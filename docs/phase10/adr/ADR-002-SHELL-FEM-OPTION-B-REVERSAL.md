# ADR-002 — 실제 shell FEM 도입 (Phase 6 옵션 B 결정의 번복)

```yaml
adr: ADR-002
phase: 10
date: 2026-07-20
status: proposed        # 오너 승인 시 accepted, WP-09 착수 가능
decision-owner: 프로젝트 오너 (2026-07-09 옵션 B 결정 주체)
supersedes-if-accepted: docs/phase6/workpackages/WP-06-shell-scope.md 의 "실 FEM 미개발" 결정
```

## 문맥

2026-07-09 오너 결정(옵션 B): 실 shell FEM 미개발, 등가모델 유지 + scope 경고 강제.
이후 외부 리뷰(2026-07-13)와 Phase 10 목표("실무 완성")는 벽·슬래브 상세결과(면내외 응력·슬래브 모멘트·개구부·펀칭 기초자료)를 요구한다.
이 ADR은 그 결정의 **공식 번복 절차**다 — 승인 없이는 WP-09 착수 금지.

## 선택지 (2026-07-20 오너 재검토 반영)

**옵션 A — full flat shell 일괄** (최초 제안): MITC4/SRI membrane+bending+drilling 6DOF를 한 마일스톤에.
가장 어려운 결합 문제(drilling·locking·6DOF)를 처음부터 안는다. 공수·리스크 최대.

**옵션 C — 2D 분해 단계 도입** ← **권고 (오너 발의)**
full shell = 면내 2D(membrane) + 면외 2D(plate) + 결합(drilling)의 합성이라는 점을 이용해 3단계로 나눈다:

| 단계 | 요소 | 절점 DOF(국부) | 커버하는 실무 수요 | 핵심 검증 |
| --- | --- | --- | --- | --- |
| **M9a 벽 membrane** | 평면응력 Q4+비적합모드(QM6), 정적 응축 | 면내 u,v (2) | 전단벽 면내 — drift·전단·σ/τ·개구부 주변 (**리뷰 지적의 핵심 대부분**) | 상수응력 patch, 캔틸레버 벽 vs 보이론 δ=PH³/3EI+1.2PH/GA |
| **M9b 슬래브 plate** | DKQ(얇은 판, 잠금 없음) | w, θx, θy (3) | 슬래브 휨모멘트 분포·처짐 | 단순지지판 w_c=0.00406qa⁴/D · 고정단 0.00126qa⁴/D (ν=0.3) |
| **M9c flat shell 통합** | membrane+plate+drilling 결합 | 6 | 벽 면외·일반 배치 | phase6 §6A 전체 게이트 |

- **2026-07-20 오너 후속 결정: M9c(결합)까지 정식 개발 범위에 포함한다** — 단계는 이연 장치가 아니라 리스크 관리 순서.
  추가로 **M9d(GPU 배치 실행)** 단계를 신설: 셸 요소강성 생성·조립·응력 회복을 P9 compute(WebGPU) 위에서 배치 처리
  (§9d — P9-M7 SoA 배치·결정론 scatter·혼합정밀도 정책 재사용, 신규 GPU 인프라 없음).

| 단계 | 요소 | 성격 |
| --- | --- | --- |
| M9d GPU 배치 | K1 강성커널·K2 조립 gather·K3 응력회복 + PCG 연동 | CPU↔GPU 일치·혼합정밀도·성능 예산 |

- M9a·M9b는 서로 독립이며 각각 단독으로 제품 가치가 있다. M9c가 벽-프레임 drilling 실강성 결합·벽 면외·경사 벽을 완성한다.
- 평면 절점 drilling 특이성: M9a는 §6A 안정화 규칙(α=1e-6~1e-4·k_ref) 근사, M9c에서 Allman 실강성으로 대체.
- 비적합모드·내부 DOF 응축은 기존 Schur 패턴(`condenseReleasedDofs` 계열) 재사용 — 신규 수치 패턴 아님.
- GPU 재작업 방지를 위해 M9a부터 "CPU도 SoA 배치 + scatter 사전계산" 형태로 구현한다 (WP-09 설계 원칙).

## 승인 시 원칙

1. **등가모델은 제거하지 않는다** — 실 shell은 추가 formulation('fem'). 모델별 선택, 결과에 formulation 명시.
   등가 경로의 경고 문구·검증 기준(§6B)은 영구 유지.
2. 정식화는 phase6 §6A(이연 보존분)를 승격 — 옵션 C에서는 §6A의 Dm(membrane)·Db(bending)를 단계별로 분리 소비하고, drilling 안정화·patch/locking/수렴 게이트는 해당 단계에 적용.
3. compute 계약(P9) 필수 통과 — CPU reference ↔ WASM/GPU 일치.
4. 펀칭전단·슬래브 배근 자동화 등 **설계 자동화는 범위 밖** — 해석 응력·모멘트 제공까지.

## 비용·리스크 요약

- 옵션 A 공수: Phase 10 내 최대 단일 마일스톤. 결합 문제 전부 선불.
- 옵션 C-full 공수: M9a(소) + M9b(중) + M9c(대) + M9d(중, GPU) — 단계마다 독립 배포·검증 가능, 리스크는 계단식.
  잔여 공통 작업: 메셔(1차 사각 분할)·경계 MPC(WP-05 선행)·XV-10 기준해(오너 입력물).
- 미승인 시: WP-09 제외하고 Phase 10 진행 — 등가모델 scope 유지, 리뷰 지적 중 "벽·슬래브 상세" 항목만 미해소로 남음(문서 명시).

## 결정

- [ ] **옵션 C-full 승인 — M9a→M9b→M9c→M9d 전 단계 정식 범위** (2026-07-20 오너 발의안)
- [ ] 옵션 A 승인 (full shell 일괄)
- [ ] 보류 (Phase 10에서 제외, 옵션 B 등가모델 유지)
- 결정일: ______  서명: ______
