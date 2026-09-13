# Current State Assessment

snapshot: 2026-07-03 (commit 기준 main HEAD, 총 394 커밋 / Phase 3에서 308 커밋)
status: 고정 스냅샷 — Phase 4 계획의 근거 문서. 이후 변경은 ROADMAP/BACKLOG에 반영하고 이 문서는 수정하지 않는다.

## 1. Quantitative Inventory

| 항목 | 값 |
| --- | --- |
| 소스 (src/ + server/) | 35,697 LOC, 316개 모듈 |
| 테스트 | 110개 파일, 14,360 LOC, **92개 스위트 전부 green** |
| Phase 3 전용 테스트 | 41개 (`tests/p3-*.mjs`) |
| 서버 | 18개 모듈 (routes 7, store 3, auth 3 등) |
| 해석 코어 | core 40, solver 16, dynamics 3, nonlinear 20, design 59, results 34 |
| import 파이프라인 | 28 (dxf 4, pointcloud 15, 공통 9) |
| 플랫폼/계약 | platform 37, ui 29, app 16, viewer 6, materials 7 |
| agent 실행 액션 | 44개 (launch gate 검증값) |
| 출시 게이트 | 14개 정의, `p3-launch-gate` 자동 점검 통과 |
| 파일럿 리포트 | 대표건물 10종 생성 확인 |

## 2. Completion Audit (코드 내장 감사 기준)

`src/platform/phase3CompletionAuditReview.js`가 마일스톤별 상태를 선언하고 테스트가 이를 잠근다.

### proven (7) — 계약 테스트로 입증 완료

| 마일스톤 | 내용 | 근거 테스트 |
| --- | --- | --- |
| P3-M0 | 기준선/문서 | m0-smoke, p3-plan-alignment |
| P3-M1 | 서버 API | p3-server-api, p3-server-route-contract |
| P3-M2 | 인증/권한 | p3-auth |
| P3-M3 | 저장 3계층 | p3-persistence |
| P3-M4 | 앱 shell/뷰어 기반 | p3-app-shell, p3-viewer-core |
| P3-M5 | Geometry core | p3-import-geometry |
| P3-M6 | DXF import v1 | p3-m6-dxf-import |

### preliminary (13) — 구현+테스트 완료, 실증 부족 (Phase 4 Stage V 대상)

| 마일스톤 | 내용 | 감사에 기록된 한계 (실증 필요 항목) |
| --- | --- | --- |
| P3-M7 | DWG/평면 인식 | 실제 DWG 변환은 외부 도구(ODA) 의존 — 실파일 e2e 미실증 |
| P3-M8 | 점군 로드/뷰어 | 대용량 성능과 바이너리 파일 검증 미실증 |
| P3-M9 | 점군 구조 추출 | **실측 현장 스캔 검증 없음** (합성 벤치마크만) |
| P3-M10 | 재료/단면 | 사무소급 KS 카탈로그 정책 미확정 |
| P3-M11 | 탄성 확장 | 조합별 활성상태(tension-only) 솔버 강건성 |
| P3-M12 | 벽체/슬래브 | 쉘 유한요소 응력회복·메쉬 완성도 |
| P3-M13 | 하중 v2/동적 | 프로젝트별 KDS 예외 검토 |
| P3-M14 | 비선형 기하 | production 수준 비선형 솔버 인증 |
| P3-M15 | 힌지/control | 동시 다힌지 평형 검증 |
| P3-M16 | fiber/NLTH | 내진 성능검증·기록 검토 수준 |
| P3-M17 | RC 설계 | 최종 조항 선정, 수계산 검증서 확충 |
| P3-M18 | 철골/기초 | 제작/지반/인허가 계산 승인 수준 |
| P3-M19 | 통합 보고서 | 최종 구조기술사 서명 수준 |

### manual (1)

| P3-M20 | 출시 준비 | owner 배포 승인·서명 증빙 (자동화 불가, Phase 4 Stage R에서 수집) |

## 3. Architecture Assets (강점)

1. **Zero-dependency 유지** — 외부 패키지 0개. 서버(node:http/crypto), 뷰어(WebGL2 수학 자체 구현), DXF 파서, 점군 수치 유틸(voxel/RANSAC/DBSCAN/PCA) 전부 내장.
2. **계약 중심 설계** — 모든 기능이 versioned contract(`p3-*-v#`)로 노출되고 agent API(44 액션)와 capability manifest가 테스트로 잠김.
3. **자기 감사 내장** — 완성도(proven/preliminary), exit criteria, evidence register, owner signoff가 코드로 존재. Phase 4는 이 감사 상태를 코드 수정 없이 "증빙 추가"로 승격시키는 구조가 이미 준비됨.
4. **결정적 테스트** — seed 고정, 외부 서비스 무의존, 임시 dataDir 부팅 e2e. `npm test` 단일 게이트.
5. **human-in-loop import** — 후보→검토→확정 구조가 서버 기록(imports)과 UI 계약으로 관철됨.

## 4. Known Gaps (약점 — Phase 4 대상)

### 4.1 실증 격차 (Stage V)
위 preliminary 13건. 공통 패턴: **자동 테스트는 자체 생성 데이터(합성 점군, 자체 fixture, 자체 기준값)에 대해 통과**하며, 외부 기준(수계산 검증서, 상용 SW 대조, 실측 데이터, 실제 DWG)과의 대조가 없다.

### 4.2 기술부채 (Stage H) — 상세는 `TECH_DEBT_REGISTER.md`
2026-07-02 8각도 코드리뷰에서 확인된 15건 중 4건은 Phase 3 중 수정 완료(URI 크래시, 세션 토큰 정리, lineage, import 서버검증). **잔여 11건**(TD-01~TD-11)이 등재됨. 최상위 3건:

| TD | 내용 | 위험 |
| --- | --- | --- |
| TD-01 | **native 모델러가 앱 shell에 미통합** — `src/app/modelerHost.js`가 여전히 placeholder. 로그인/프로젝트/저장 플랫폼과 실제 모델링 화면이 분리되어 있음 | 제품으로서 치명적 — 사용자가 플랫폼에서 모델링 불가 |
| TD-03 | 서버 라우트 17개가 인증 2-step을 수동 반복 — 미들웨어 부재 | 신규 라우트 추가 시 인증 누락 사고 가능 |
| TD-06 | 파일 저장소가 프로세스 내 락만 보유 — 2번째 프로세스 기동 시 무경고 데이터 손상 | 운영 사고 (rolling restart, 중복 실행) |

### 4.3 제품화 격차 (Stage R)
1. 패키징 없음 — `node server/main.mjs` 수동 실행만 가능. 설치본/Electron/서비스 등록 미구현.
2. 사용자 문서가 Phase 2 시점 기준 — Phase 3 신기능(import, 비선형, 재료, 플랫폼) 미반영.
3. 베타 파일럿 미실시 — 파일럿 "리포트 생성"은 자동화되어 있으나 실사용자 시나리오 실행 이력 없음.
4. 운영 절차 부재 — 백업/복구/업그레이드/장애 대응 runbook 없음.
5. 라이선스/버전 정책 미정 — package.json 0.1.0 고정, CHANGELOG 없음.

## 5. Conclusion

골격과 기능은 완성 상태이고 테스트 인프라가 이를 지키고 있다. 제품이 되기 위해 남은 것은 (V) 외부 기준 대조 실증, (H) 확인된 부채 11건 상환과 모델러-플랫폼 통합, (R) 배포 가능한 형태와 운영 체계다. 이 셋이 Phase 4의 전부이며, 신규 기능은 없다.
