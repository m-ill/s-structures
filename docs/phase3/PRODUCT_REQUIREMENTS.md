# Phase 3 Product Requirements (PRD)

status: active
source: user direction 2026-07-02
supersedes: `docs/product/S-STRUCTURES_PRD.md`의 Phase 3 범위 부분. 기존 PRD는 Phase 1-2 근거로 보존.

## Product Statement

S-Structures는 구조설계사무소가 **도면(DWG/DXF)이나 현장 점군(point cloud)에서 출발해, 커스텀 재료와 탄성~비선형 해석을 거쳐, 검토 가능한 계산서까지** 한 흐름으로 처리하는 구조해석 프로그램이다. Phase 3의 완료 상태는 "출시 직전(launch-ready)"이다.

## Target Users

| 사용자 | 역할 | 핵심 요구 |
| --- | --- | --- |
| 구조 엔지니어 | 모델링, 하중, 해석, 설계검토 | 도면에서 빠른 모델 생성, 신뢰 가능한 결과, trace |
| 검토자/소장 | 계산서 검토, 승인 | 누락/warning 가시성, revision과 승인 기록 |
| 리모델링/안전진단 담당 | 기존 건물 현황 모델링 | 점군→현황 모델, 부재 치수 확인 |
| AI agent | 자동 QA, 반복 작업 | 안정적인 API 계약, 검증 결과 판독 |

## Core Scenarios

### S1. 신축 설계검토 (도면 기반)
1. 로그인 후 프로젝트 생성.
2. 구조평면 DXF(또는 DWG→변환) 업로드.
3. 자동 인식 결과를 검토 UI에서 확정 (grid, 기둥, 보, 층고).
4. layer→단면/재료 매핑 확인, 하중 산정, 조합 생성.
5. 탄성해석 + audit → 계산서 → 검토자 승인.

### S2. 리모델링 현황 모델 (점군 기반)
1. 스캔 점군(PLY/LAS 등) 업로드.
2. 층/기둥/보/벽 자동 검출 결과를 점군 위에 겹쳐 확인·수정.
3. 확정된 현황 모델로 해석, 기존 부재 안전성 검토.

### S3. 커스텀 재료 검증
1. 프로젝트 재료 라이브러리에 커스텀 재료 등록 (탄성 + 비선형 곡선).
2. 커스텀 단면 정의 또는 DB 선택.
3. 해석/계산서에 재료 `id@version` trace 표기.

### S4. 비선형 안전성 검토
1. 탄성 모델에 소성힌지 배정.
2. pushover(load/displacement/arc-length control) 실행.
3. capacity curve, 힌지 분포, 수렴 로그를 계산서에 수록.

### S5. 협업/승인
1. 엔지니어 저장 → revision 기록.
2. 검토자 issue 확인 → resolve/accept.
3. 승인 잠금. 승인 후 수정 시 승인 해제(P2 T45 이행).

## Functional Requirements

| ID | 요구사항 | 우선순위 | 마일스톤 |
| --- | --- | --- | --- |
| FR-01 | email 계정 가입/로그인/로그아웃 | P0 | M2 |
| FR-02 | 프로젝트 생성/열기/목록/삭제, 멤버 권한 | P0 | M1-M2 |
| FR-03 | 모델 저장: local/파일/server 3계층 + autosave | P0 | M3 |
| FR-04 | revision history와 복원 | P0 | M3 |
| FR-05 | DXF 파일 import → 3D 모델 후보 생성 | P0 | M6 |
| FR-06 | DWG 지원 (변환 경로 자동화) | P1 | M7 |
| FR-07 | 2D 층별 평면 → 3D 조립 | P1 | M7 |
| FR-08 | import 검토 UI (확정/수정/거부, confidence) | P0 | M7/M9 |
| FR-09 | 점군 로드/뷰어 (PLY/XYZ/PCD/LAS) | P0 | M8 |
| FR-10 | 점군 층/기둥/보/벽 자동 검출 | P1 | M9 |
| FR-11 | 커스텀 재료 (탄성+비선형 파라미터) | P0 | M10 |
| FR-12 | 단면 DB + 커스텀 단면 | P0 | M10 |
| FR-13 | 재료/단면 versioned registry, 계산서 표기 | P0 | M10 |
| FR-14 | 기하비선형 해석 (NR, load control) | P0 | M11 |
| FR-15 | 재료비선형 (소성힌지) + displacement/arc-length | P0 | M12 |
| FR-16 | 비선형 결과 후처리/계산서 통합 | P0 | M13 |
| FR-17 | 승인 잠금 workflow (P2 T44-45) | P1 | M13 |
| FR-18 | 온보딩 샘플/튜토리얼, 매뉴얼 갱신 | P0 | M14 |
| FR-19 | 라이선스 키 검증 v1 | P1 | M14 |
| FR-20 | agent API 계약 유지 (전 기능 노출) | P0 | 전체 |

## Non-Functional Requirements

| ID | 항목 | 기준 |
| --- | --- | --- |
| NFR-01 | 점군 로드 | 1e7 점 30초 내 전처리 (worker, 메인스레드 무블로킹) |
| NFR-02 | 점군 렌더 | 다운샘플 후 2e6 점 60fps |
| NFR-03 | 탄성해석 | 대표건물(수백 부재) 조합군 해석 10초 내 |
| NFR-04 | 저장 | 10MB 모델 round-trip 무손실 |
| NFR-05 | 보안 | scrypt 해시, 토큰 만료, upload 제한, path traversal 차단 |
| NFR-06 | 신뢰성 | full test suite green이 merge 조건 |
| NFR-07 | 이식성 | 브라우저(Chromium 계열) + 단일 node 서버. 데스크톱은 Electron 래핑 |
| NFR-08 | 의존성 | zero-dependency 기본. 도입 시 결정 기록 필수 |

## Explicit Non-Goals (Phase 3)

1. RC/steel/기초 **상세 설계 자동화** (P2 T34-T40 수준 이상) — Phase 4.
2. 시공상세/배근도 생성.
3. IFC/BIM 왕복 완전 지원 — mapping 계약만 유지.
4. 시간이력 비선형(NLTH) — 엔진 구조는 대비하되 구현은 Phase 4.
5. 인허가 문서 자동 제출.
6. 다중 서버 스케일아웃 — 단일 서버 배포까지만.

## Success Criteria (출시 직전 판정)

| Check | Pass condition |
| --- | --- |
| 도면 import | 대표 도면 fixture 세트에서 검토 확정 후 해석 가능 모델 생성 |
| 점군 import | 합성 벤치마크 recall/precision 목표 달성 + 실측 점군 1건 데모 |
| 재료 커스텀 | 커스텀 재료/단면으로 해석~계산서 trace 완결 |
| 비선형 | benchmark 4종(좌굴/대변위/snap-through/pushover 회귀) 통과 |
| 플랫폼 | 가입→로그인→프로젝트→저장→revision→승인 e2e 통과 |
| 품질 | `QA_RELEASE_PLAN.md` 출시 게이트 전체 통과 |
| 파일럿 | 실무 시나리오 10종 파일럿 리포트 완료 |
