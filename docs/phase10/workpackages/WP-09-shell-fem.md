# WP-09 — 벽·슬래브 FEM: 2D 분해 단계 도입 + flat shell 통합 + GPU 배치

```yaml
wp: WP-09
milestone: P10-M9 (M9a → M9b → M9c → M9d, 전부 정식 개발 범위)
formulas: FORMULAS_AND_CRITERIA.md §9a~§9d
depends: [WP-05, ADR-002(옵션 C-full)]
gate: ADR-002 오너 승인 전 착수 금지 (2026-07-09 옵션 B 결정의 번복)
```

## 배경 (기존 자산)

- **2026-07-20 오너 결정 방향**: 2D 분해 단계로 도입하되 **어려운 결합(M9c)까지 정식 범위** — 이연하지 않는다.
  단계는 리스크 순서일 뿐 전부 계획에 포함. GPU 처리를 위한 코드 구성도 처음부터 반영한다.
- phase6 §6A: Dm·Db·drilling 안정화·patch 게이트 이연 보존분 — 단계별 소비.
- **GPU 기반이 이미 존재**: P9-M7 SoA 배치 계약(`compute/nonlinear/batchContract.js` — 타입 그룹·dofOffsets/matrixOffsets·Int32 scatter)과
  결정론 조립(`deterministicAssembly.js` — 사전계산 `elementScatters`로 순서 독립 scatter), WebGPU 백엔드
  (`backends/webgpu/` — spdSession PCG·segmentedBuffer·bufferPool·cpuReference), 혼합정밀도(`hybrid/mixedPrecisionSpd.js`),
  정밀도 정책([phase9 COMPUTE_PRECISION_POLICY](../../phase9/COMPUTE_PRECISION_POLICY.md)).
  **셸 배치는 이 계약들의 확장이며 신규 GPU 인프라를 만들지 않는다.**
- 비적합모드·내부 DOF 응축은 기존 Schur 패턴 재사용. 비평면 보정 강체팔은 WP-04 T_off 재사용.

## 설계 원칙 — "CPU부터 GPU 모양으로" (전 단계 공통, M9d 재작업 방지)

1. **요소 데이터는 처음부터 SoA typed 배치**: 셸 요소를 개별 객체가 아니라 P9-M7 패턴의 배치
   (`typeCodes·nodeIndices·t·E·ν·localAxes·dofOffsets·matrixOffsets`)로 표현. CPU 조립도 이 배치를 소비.
2. **scatter 사전계산**: 요소→nnz 인덱스 맵(`elementScatters`)을 심볼릭 단계에서 만들어 CPU/GPU가 공유 —
   조립이 순서 독립(결정론)이 되어 GPU 전환 시 해시 재현성이 자동 유지.
3. **강성 커널은 순수 함수**: 배치 입력 → flat tangentValues 출력(부작용 없음). CPU 구현이 곧 GPU 커널의 reference.
4. domainBinary 계약에 셸 배열 additive — domain hash 재현성 테스트 필수.

## M9a — 벽 membrane (평면응력 QM6)

1. 요소 `solver/shell/wallMembraneQm6.js`: Q4+비적합모드(§9a, patch 정합형 QM6), 내부 4DOF 응축, 평면변환 T.
2. drilling: 벽 평면 전용 절점에 `shell.drillingAlpha` 안정화(프레임 공존 절점 자동 판별). **M9c에서 Allman 실강성으로 대체 예정임을 limitations에 명시.**
3. 스키마 additive: `wallPanel { nodes(4), t, matId, formulation:'membrane'|'equivalent' }`.
4. 결과: 면내 σ/τ(가우스점→절점 평활), 벽 전단·base moment. formulation='membrane'.
5. **SoA 배치 + scatter 사전계산으로 구현**(설계 원칙 1~3). descriptor·domainBinary·sparse 패턴 확장.
6. 경고 해제: 벽 면내 응답만.

**게이트**: SH-A01~04 (`tests/p10-m9a-wall-membrane.mjs`).

## M9b — 슬래브 plate (DKQ)

1. 요소 `solver/shell/slabPlateDkq.js`: DKQ(w,θx,θy), 면압 consistent 하중, WP-10 분배와 연결(직접 모델 시 분배 생략 옵션).
2. 결과: Mx·My·Mxy·처짐. formulation='plate'. lumped 질량 → 모달·RSA.
3. 동일 SoA 배치 규약.

**게이트**: SH-B01~03 (`tests/p10-m9b-slab-plate.mjs`).

## M9c — flat shell 통합 (정식 범위)

1. 요소 `solver/shell/flatShellAllmanDkq.js`(§9c): **Allman membrane(꼭짓점 drilling 실강성) ⊕ DKQ**, 24×24.
   기생모드 안정화 항 + 에너지비 게이트(`shell.spuriousEnergyMax`).
2. 비평면 4절점: 평균평면 사영 + 사영거리 강체팔 보정(WP-04 T_off 재사용). `shell.warpTol` 경고/분할 요구.
3. 벽-프레임 결합: drilling DOF가 프레임 회전과 직접 호환 — M9a 안정화 근사 대체. 기존 M9a 모델은
   formulation 선택으로 하위호환(membrane 유지 or shell 승격).
4. 벽 면외·경사 벽·일반 배치 지원 — 등가모델 경고는 shell formulation 경로에서 해제 범위 확대.
5. 모달·RSA·P-Delta 연동: 셸 질량·(면내 초기응력 기하강성은 후속 명시 — 1차는 프레임 KG만, limitations 표기).

**게이트**: SH-C01(§6A 전체: 강체 6모드·patch·warped patch·locking·수렴·기생모드) + SH-C02(XV-10) (`tests/p10-m9c-flat-shell.mjs`).

## M9d — GPU 배치 실행 (§9d)

1. **K1 요소강성 배치 커널**(`backends/webgpu/shellKernels.js`): 타입 그룹별 디스패치, 요소당 QM6 응축·DKQ·Allman 24×24 생성
   → tangentValues flat(matrixOffsets 규약). bufferPool·segmentedBuffer 재사용.
2. **K2 조립 gather 커널**: nnz당 1스레드가 elementScatters 역맵 합산 → CSC values. 원자연산 없음(결정론).
3. **K3 응력 회복 커널**: 가우스점 응력 배치 + 절점 평활(segmented reduction).
4. solve: 기존 spdSession(PCG) — spdEligibility에 셸 조건(구속·안정화 후 SPD) 등록.
5. 혼합정밀도: 강성 생성 f32 허용, 조립·잔차 f64 누적, 반복개선 게이트(`shell.gpuResidualRefine`) 실패 시 CPU f64 자동 강등 —
   [COMPUTE_PRECISION_POLICY](../../phase9/COMPUTE_PRECISION_POLICY.md) 준수(휨/막 t²/12 스케일 격차 명시).
6. CPU↔GPU 일치: cpuReference 패턴 — 동일 배치 입력 상대오차 게이트, 실패 시 GPU 경로 차단.
7. 성능 예산: 대형 벽식 모델(셸 지배)에서 요소생성+조립+solve 계측(P9 telemetry), CPU 대비 이득 기록.

**게이트**: SH-G01~05 (`tests/p10-m9d-shell-gpu.mjs`) + 기존 WebGPU 스위트 green.

## 공통 규칙

- 벽-프레임 경계 WP-05 MPC 재사용. 메셔 1차 사각 수동분할(자동 메셔 후속).
- 등가모델 경로·경고 영구 유지, 신규 경로는 단계 커버 범위만 해제. 설계 자동화(펀칭·배근)는 범위 밖.

## Review Log

| 날짜 | 지적 | 조치 | 상태 |
| --- | --- | --- | --- |
| 2026-07-20 | 오너: full shell 부담 — 2D 재검토 | 옵션 C(단계 도입)로 재구성 | 반영 |
| 2026-07-20 | 오너: 어려운 부분(M9c)도 계획 포함 + GPU 처리 코드 구성 | M9c 정식 범위 승격(Allman⊕DKQ·warped 보정), M9d GPU 배치 단계 신설(P9-M7 SoA·결정론 scatter·혼합정밀도 재사용), "CPU부터 GPU 모양으로" 설계 원칙 추가 | 반영 |
