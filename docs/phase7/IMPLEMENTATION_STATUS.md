# Phase 7 Implementation Status

```yaml
reviewed_at: 2026-07-11
implementation: complete
release_status: candidate
schema_version: 4
milestones: P7-M0..P7-M11
```

## 판정

Phase 7의 계획된 코드 작업은 M0부터 M11까지 구현되었다. 전체 회귀와 Phase 7 전용 시험을 함께 실행하는 `npm.cmd test`가 통과해야 이 상태를 유지한다. `candidate`는 구조설계사무소의 프로젝트별 기준 승인과 독립 검산을 생략할 수 있다는 뜻이 아니다.

## 마일스톤 현황

| 마일스톤 | 상태 | 구현 근거 |
| --- | --- | --- |
| P7-M0 계약·마이그레이션 | complete | schema v4, source/project/run-record, stable hash, migration 및 validation gate |
| P7-M1 단면·KS 재료 코어 | complete | RECT/SQUARE/CIRC/H/BOX/PIPE/CUSTOM, 현행 KS designation, legacy alias |
| P7-M2 라이브러리 UI | complete | 단면·재료 조회/편집/복제/배치 지정 workflow |
| P7-M3 모델링 생산성 | complete | 층·그리드 생성, 역할 지정, transaction, workspace 저장 |
| P7-M4 하중 분류·설계조건 | complete | load-case metadata, project setup, mass source, preview/apply change set |
| P7-M5 규칙 팩 | complete | version/source 고정 KDS 41 12 00:2022 조합 팩과 승인 snapshot |
| P7-M6 하중 QA | complete | 생성 이력, audit, 필터/일괄 편집, 조합 재생성 추적 |
| P7-M7 선형 정적 | complete | 6-resultant 힘·모멘트 평형, 로컬축, settlement/offset/point couple 검증 |
| P7-M8 Direct P-Delta | complete | `Kt = Ke + Kg(N)` 경로, 조합별 결과, 고정단 축력, stability/release guard |
| P7-M9 모달·RSA | complete | 정규화, residual condensation, CQC, 밑면전단력, 층·부재 응답 |
| P7-M10 sparse·좌굴·THA | complete with limits | sparse LDLT 자격검사, 검증된 preload 좌굴; THA는 preliminary 고정 |
| P7-M11 통합 UX·보고서 | complete | Analysis Center 실행, model-bound run record, 패널 작업공간, 보고서 전달 gate |

## 이번 마감에서 보강한 항목

- 분포하중 고정단 축력이 Direct P-Delta 초기 축력과 접선강성에 포함되도록 수정했다.
- sparse 경로가 숨은 비정정 블록을 정상 결과로 통과시키지 않도록 LDLT 기반 SPD 자격검사를 추가했다.
- 모달 residual condensation 실패와 좌굴 preload 미검증 상태를 fail-closed 처리했다.
- 좌굴은 프로젝트 material/section을 사용하며 지원하지 않는 해석영역을 명시적으로 차단한다.
- 평형 상대오차 기준을 `analysisCriteria.criteria.audit.equilibriumRelative`로 단일화했다. 기본은 `1e-8`, 대형 대표모델 fixture는 기록 가능한 `1e-7` 기준을 명시한다.
- Direct P-Delta 결과가 결과 그래프/표와 Analysis Center run record까지 같은 실행 결과를 사용하도록 연결했다.
- 모델링의 구형 빠른 팔레트를 현행 KS 재료 20개와 실무 단면 30개 이상으로 교체하고, 6개 매개변수 형상과 GENERAL 직접 속성 단면을 만드는 이동·크기조절 편집기를 연결했다.
- 탄성해석 리본을 `전체 탄성해석` 1회 실행과 1차/P-Delta/모달/RSA/좌굴/THA 결과 바로가기로 재구성했다. 여섯 탄성 케이스만 생성·재사용하며 비선형 케이스는 일괄 실행에서 제외한다.
- Analysis Center에서 조합/P-Delta 방식, 모드 수/질량원, RSA 조합법·방향·감쇠·스펙트럼, 좌굴 preload, THA 기록을 편집·저장하도록 연결했다.
- 모델 캔버스 우측에 이동·크기조절·스냅·자동높이를 지원하는 통합 탄성결과 팝업을 추가했다. 정적/P-Delta/모달/RSA/좌굴/THA별 실제 계산 결과 차트와 형상을 분리해 표시한다.
- Direct P-Delta 전체 곡선의 1차·2차 비교량을 전역 횡절점변위로 통일하고 전체·횡·수직 변위를 결과 contract에서 구분했다.
- 모달 질량참여율 차트가 주기로 fallback하던 오류와 RSA가 계산응답보다 입력 스펙트럼만 우선 표시하던 경로를 수정했다.
- 전체 실행 후 Analysis Center를 닫고 1차 결과 팝업을 자동으로 열며, 결과 버튼은 설정창 없이 같은 팝업을 즉시 전환한다. 폭 720px 이하에서는 viewport inset 팝업으로 전환하되 데스크톱 저장 위치는 덮어쓰지 않는다.
- 탄성해석 탭에 기본설정→하중·질량→하중조합→모델검증→1차해석→고급해석→결과검토의 7단계 작업흐름과 단계별 검토 목적을 추가했다.
- 신규 모델의 `strength 1.0D+1.0L`을 제거하고 `KDS22-ST-01/02` 프로젝트 검토 후보로 교체했다. 정확한 legacy 기본 `CO1`은 마이그레이션과 UI 초기화에서 자동 승격하며 사용자 수정 조합은 보존한다. `service D+L`은 처짐 검토 baseline으로 구분한다.

## 검증 명령

```powershell
npm.cmd test
npm.cmd run test:p7
git diff --check
```

브라우저 검증은 `http://127.0.0.1:5173/`에서 데스크톱과 모바일 viewport로 수행한다. 모듈 import smoke fixture는 `tests/browser/phase7-import-smoke.html`이다.

## 릴리스 경계

- 실제 wall/slab/shell FEM이 아니다. 현재 면요소는 등가 프레임/링크 범위다.
- THA는 preliminary이며 설계 전달이 차단된다.
- 좌굴은 탄성 3D 프레임과 자격을 갖춘 정적 preload 범위다. 비탄성 좌굴과 미지원 요소 혼합은 차단된다.
- Direct P-Delta의 지원하지 않는 member release 조합은 결과를 만들지 않고 차단된다.
- KDS 규칙 팩의 프로젝트 적용은 설계자 승인 snapshot을 요구한다. 프로그램이 법적 적합성을 자동 승인하지 않는다.
- `SS400`, `SM490`은 legacy designation으로 보존되며 현행 강종으로 조용히 치환하지 않는다.
- 최종 실무 배포 전에는 사무소 표준모델 독립 검산, 담당기술자 승인, 실제 프로젝트 pilot 기록이 필요하다.
