# User Documentation Plan

status: active (실행은 P4-M9, 조기 착수 가능)
문제: 현 user-manual은 Phase 2 시점 기준 — Phase 3 기능(import, 점군, 재료, 비선형, 플랫폼/계정)이 미반영.

## Target Structure (`docs/user-manual/`)

| 문서 | 내용 | 상태 |
| --- | --- | --- |
| README.md | 문서 지도 | 개정 |
| 00-install.md | 설치 (웹/데스크톱), 첫 계정, 초대제 전환 | **신규** |
| 01-getting-started.md | 화면 구성, 프로젝트 생성/열기/저장 3계층 | 전면 개정 |
| 02-modeling-and-elastic-analysis.md | 모델링 + 탄성 확장(스프링/트러스/offset/부분하중/온도/벽체) | 전면 개정 |
| 03-loads-design-and-reports.md | 하중 v2, 조합, RC/철골/기초 일람표, 계산서 | 전면 개정 |
| 04-import-drawings.md | DXF/DWG import, layer 매핑, 검토 확정 | **신규** |
| 05-import-pointcloud.md | 점군 로드, 검출, 확정, 한계 | **신규** |
| 06-materials-library.md | 커스텀 재료/단면, 버전 정책 | **신규** |
| 07-nonlinear-analysis.md | pushover/NLTH 입력, 수렴 로그 읽기, 한계 | **신규** |
| 08-collaboration.md | 계정/역할, revision, 승인 workflow | **신규** |
| STATUS_AND_LIMITS.md | 기능 상태와 한계 — 완성도 감사와 동기화 | 전면 개정 |
| AI_AGENT_GUIDE.md + agent-contract.json | 44 액션 최신화 | 개정 + diff 0 테스트 |

## Writing Rules

1. 모든 절차는 실제 화면 기준으로 실행하며 작성 (스크린샷 포함, `docs/user-manual/img/`).
2. 한계(limitation)는 기능 설명과 같은 페이지에 — 별도 페이지로 숨기지 않는다.
3. 계산 결과를 다루는 장은 "이 값을 믿어도 되는 근거" (verification 문서 링크)를 병기.
4. 문서-기능 대조표(`DOCUMENTATION_COVERAGE.md` 작업용)로 44개 agent 액션·전 리본 메뉴가 어느 문서에 있는지 매핑 — 빈칸 0이 P4-T46 수용 기준.

## Tutorials (P4-T47)

| 편 | 시나리오 | 형식 |
| --- | --- | --- |
| T1 | 도면(DXF)→모델→계산서 30분 | 단계별 문서 + 샘플 DXF 내장 |
| T2 | 점군→현황모델 | 〃 + 샘플 점군(합성) |
| T3 | Pushover 검토 | 〃 + 샘플 모델 |

각 튜토리얼은 "신규 사용자 검증"을 거친다: 프로젝트를 모르는 1인이 문서만으로 완주 — 실패 지점은 문서 결함으로 수정.

## Onboarding Samples (P4-T48)

앱 내 원클릭 로드 샘플 3종: 라멘 사무소 건물(탄성 전체 흐름), 벽식 아파트(벽체/횡력), 철골 공장(철골 설계). 각 샘플은 튜토리얼과 1:1 대응.
