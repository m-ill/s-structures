# Phase 3 Implementation Backlog

status: active backlog
source: user direction 2026-07-02

Phase 2 티켓(T##)과 구분하기 위해 Phase 3 티켓은 `P3-T##`로 관리한다.

| Priority | 의미 |
| --- | --- |
| P0 | 출시 직전 판정에 필수 |
| P1 | 출시 품질 강화 |
| P2 | 출시 후 또는 Phase 4 이월 가능 |

## Stage A. Platform Backbone (P3-M0 ~ P3-M4)

| Ticket | Priority | 작업 | 영역 | 완료 기준 |
| --- | --- | --- | --- | --- |
| P3-T01 | P0 | 폴더 재정리 + `data/` gitignore + 파일 지도 반영 | repo | 지도와 구조 일치 |
| P3-T02 | P0 | phase3 계약 버전 추가 | `src/platform/platformVersion.js` | 버전 테스트 |
| P3-T03 | P0 | node:http 라우터 + 정적 서빙 | `server/` | serve.mjs 대체 |
| P3-T04 | P0 | error envelope + 요청 로깅 | `server/router.mjs` | 오류 스키마 테스트 |
| P3-T05 | P0 | 프로젝트 CRUD API | `server/routes/projects.mjs` | API 계약 테스트 |
| P3-T06 | P0 | 모델 snapshot 저장/조회 API | `server/routes/revisions.mjs` | 10MB round-trip |
| P3-T07 | P0 | 파일 업로드/다운로드 (도면/점군) | `server/routes/files.mjs` | 크기 제한, 타입 검증 |
| P3-T08 | P0 | scrypt 해시 + 사용자 저장소 | `server/auth/password.mjs` | 해시 검증 테스트 |
| P3-T09 | P0 | 가입/로그인/로그아웃/me API | `server/routes/auth.mjs` | e2e 테스트 |
| P3-T10 | P0 | HMAC 토큰 발급/검증/만료 | `server/auth/token.mjs` | 위조/만료 거부 |
| P3-T11 | P0 | 역할/멤버십 권한 가드 | `server/auth/guard.mjs` | 403 테스트 |
| P3-T12 | P1 | rate limit + lockout | server | 연속 실패 잠금 테스트 |
| P3-T13 | P0 | 저장 3계층 통합 (local/파일/server) | `src/app/`, `src/ui/indexNativePersistence.js` | 3경로 round-trip |
| P3-T14 | P0 | autosave + 복구 | `src/app/` | 강제 종료 복구 |
| P3-T15 | P0 | revision 목록/복원 UI | `src/app/` | 복원 후 migration 정상 |
| P3-T16 | P1 | 충돌 lineage warning | app + server | 동시 저장 테스트 |
| P3-T17 | P0 | 앱 shell + hash 라우팅 | `src/app/` | login→modeler e2e |
| P3-T18 | P0 | 프로젝트 브라우저 화면 | `src/app/` | fake dom 테스트 |
| P3-T19 | P0 | API client 모듈 (fetch wrapper, 토큰) | `src/app/apiClient.js` | 계약 테스트 |
| P3-T20 | P0 | WebGL2 뷰어 기반 모듈 | `src/viewer/` | 1e6점 60fps |
| P3-T21 | P0 | 신규 화면 agent action 등록 | `src/ui/agentManifest.js` | manifest 테스트 |

## Stage B. Geometry Import (P3-M5 ~ P3-M9)

| Ticket | Priority | 작업 | 영역 | 완료 기준 |
| --- | --- | --- | --- | --- |
| P3-T22 | P0 | tolerance merge/중복 제거/짧은 선분 필터 | `src/import/geometry.js` | 단위 테스트 |
| P3-T23 | P0 | story/grid 추론 유틸 | `src/import/` | 대표건물 역추론 |
| P3-T24 | P0 | 부재축 분류(기둥/보/가새) | `src/import/` | 분류 테스트 |
| P3-T25 | P0 | ImportCandidate 공통 계약 | `src/import/candidate.js` | 계약 테스트 |
| P3-T26 | P0 | DXF group-code 파서 | `src/import/dxf/parser.js` | fixture 파싱 |
| P3-T27 | P0 | DXF entity→geometry (LINE/POLYLINE/INSERT/CIRCLE/TEXT) | `src/import/dxf/` | entity 커버 테스트 |
| P3-T28 | P0 | 단위/z-up/원점 정규화 + 단위 audit | `src/import/dxf/` | 단위 의심 검출 |
| P3-T29 | P0 | wireframe→후보 부재 매핑 | `src/import/dxf/` | wireframe fixture→해석 모델 |
| P3-T30 | P0 | layer→단면/재료 매핑 테이블 | `src/import/dxf/`, UI | coverage audit |
| P3-T31 | P0 | import audit 보고서 | `src/import/` | validation 통과 시만 저장 |
| P3-T32 | P1 | DWG→DXF 변환 어댑터 (ODA CLI) | `src/import/dwg/`, `tools/` | 변환 e2e |
| P3-T33 | P1 | 2D 평면 인식 (grid/기둥 심볼/보 중심선) | `src/import/dxf/plan*.js` | 인식률 리포트 |
| P3-T34 | P1 | 층 조립 (평면 n장 + 층고) | `src/import/` | 2층 조립 e2e |
| P3-T35 | P0 | import 검토 UI (확정/수정/거부) | `src/app/`, `src/viewer/` | human-in-loop e2e |
| P3-T36 | P0 | 점군 로더 XYZ/PLY/PCD | `src/import/pointcloud/` | fixture 로드 |
| P3-T37 | P1 | LAS(비압축) 로더 | `src/import/pointcloud/` | LAS fixture |
| P3-T38 | P0 | voxel downsample + outlier 제거 | `src/import/pointcloud/` | 1e7점 30s 예산 |
| P3-T39 | P0 | Web Worker 파이프라인 | `src/import/pointcloud/worker.js` | 무블로킹 검증 |
| P3-T40 | P0 | 점군 뷰어 (슬라이스/필터) | `src/viewer/` | 2e6점 60fps |
| P3-T41 | P0 | z-히스토그램+RANSAC 층 검출 | `src/import/pointcloud/` | 합성 층 오차 통과 |
| P3-T42 | P0 | 기둥 검출 (xy 클러스터+수직 연속성) | `src/import/pointcloud/` | recall/precision |
| P3-T43 | P1 | 보/벽 검출 | `src/import/pointcloud/` | 합성 벤치마크 |
| P3-T44 | P0 | 합성 점군 fixture 생성기 (대표건물→점군) | `tools/`, `tests/fixtures/` | ground-truth harness |
| P3-T45 | P0 | 점군→모델 확정 e2e | app + import | 해석 가능 모델 |

## Stage C. Materials And Nonlinear (P3-M10 ~ P3-M12)

| Ticket | Priority | 작업 | 영역 | 완료 기준 |
| --- | --- | --- | --- | --- |
| P3-T46 | P0 | 커스텀 재료 schema + migration | `src/materials/`, `src/core/` | schema 테스트 |
| P3-T47 | P0 | 단면 DB(KS 형강) + 파라메트릭 + 직접 입력 | `src/materials/` | 단면 특성 검증 |
| P3-T48 | P0 | versioned registry (`id@version`) + 계산서 표기 | `src/materials/`, report | registry 계약 |
| P3-T49 | P0 | 라이브러리 편집 UI + 서버 저장 | app + server | e2e + agent action |
| P3-T50 | P0 | 비선형 상태/증분 구조 (state, restart) | `src/nonlinear/state.js` | 상태 스냅샷 |
| P3-T51 | P0 | corotational beam + geometric stiffness | `src/nonlinear/elements/` | 요소 검증 |
| P3-T52 | P0 | Newton-Raphson + line search + 수렴 계약 | `src/nonlinear/control/` | 수렴 로그 trace |
| P3-T53 | P0 | 좌굴/대변위 benchmark | `src/verification/` | gate 등록 |
| P3-T54 | P0 | 소성힌지 M-θ backbone + 상태 trace | `src/nonlinear/hinges/` | 힌지 회귀 |
| P3-T55 | P0 | displacement control + arc-length | `src/nonlinear/control/` | snap-through 통과 |
| P3-T56 | P0 | pushover 정식화 (preliminary 대체) | `src/nonlinear/` | 대표건물 회귀 |
| P3-T57 | P1 | wind/seismic v2 registry 상세 (P2 이월) | `src/standards/` | 산정 trace |

## Stage D. Productization (P3-M13 ~ P3-M14)

| Ticket | Priority | 작업 | 영역 | 완료 기준 |
| --- | --- | --- | --- | --- |
| P3-T58 | P0 | 비선형 후처리 (스텝/힌지/capacity 표) | `src/results/` | 결과 계약 |
| P3-T59 | P0 | 계산서 비선형 장 + method/limitation | `src/report/` | practiceValidation 연결 |
| P3-T60 | P1 | torsion amplification (P2 이월) | `src/design/` | trace 테스트 |
| P3-T61 | P1 | 승인 잠금 workflow (P2 T44-45 이월) | `src/platform/`, server | 승인 해제 테스트 |
| P3-T62 | P0 | 전체 benchmark/대표건물 회귀 갱신 | tests | full suite green |
| P3-T63 | P0 | packaging (웹 단일 배포 + Electron 결정) | repo | 설치 smoke |
| P3-T64 | P1 | 라이선스 키 검증 v1 | server | 키 테스트 |
| P3-T65 | P0 | 온보딩 샘플 + 튜토리얼 + 매뉴얼 전면 갱신 | `docs/user-manual/` | 신규 사용자 시나리오 |
| P3-T66 | P0 | 성능/보안 점검 (QA 게이트 전체) | 전체 | 게이트 통과 |
| P3-T67 | P0 | 베타 파일럿 10 시나리오 + 리포트 | `reports/` | 파일럿 리포트 |

## Dependency Notes

| 먼저 필요한 것 | 이후 가능한 것 |
| --- | --- |
| P3-T03~T11 (서버+auth) | 저장 3계층, 프로젝트 브라우저, 파일 업로드 |
| P3-T20 (뷰어) | 점군 뷰어, import 검토 UI |
| P3-T22~T25 (geometry core) | DXF 매핑, 점군 추출 |
| P3-T26~T31 (DXF v1) | DWG, 2D 평면 인식 |
| P3-T44 (합성 생성기) | 점군 검출 정확도 게이트 (T41~T43) |
| P3-T46~T48 (재료) | 비선형 힌지 파라미터 (T54) |
| P3-T50~T53 (비선형 v1) | v2 control, pushover 정식화 |
| 전체 | M14 출시 준비 |
