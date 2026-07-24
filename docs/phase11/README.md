# Phase 11 — 한·영 시각 증거 구조해석 보고서 프로덕션화

```yaml
doc: readme
phase: 11
version: p11-plan-v1
date: 2026-07-23
status: in-progress
governing_plan: MILESTONE_EXECUTION_PLAN.md
milestones: [P11-M0, P11-M1, P11-M2, P11-M3, P11-M4, P11-M5, P11-M6, P11-M7, P11-M8, P11-M9]
active_milestone: none
release_qualified: false
```

## 1. 제품 목표

하나의 불변 해석 스냅샷에서 **한국어판과 영문판 구조해석 보고서를 동시에 생성**하고,
실제 제품 화면에서 얻은 모델·하중·변형·반력·부재 이용률 증거를 대응 장에 배치한다.
각 보고서의 첫 페이지에는 자동 판정된 종합 결론과 제한사항을 먼저 제시한다.

Phase 11의 결과는 단순 HTML 템플릿이 아니라 다음을 만족하는 프로덕션 보고서 기능이다.

- 한 번의 내보내기 작업에서 `ko-KR`과 `en-US` PDF를 같은 해석 스냅샷으로 생성
- 수치·조합·지배 결과는 양 언어에서 동일하고, 표현 문자열만 현지화
- 필수 화면 증거는 모델·해석·카메라·조합·배율·빌드 hash와 결속
- 첫 페이지 결론은 `PASS`, `CONDITIONAL_PASS`, `REVIEW`, `FAIL` 규칙으로 자동 산정
- 누락 번역, 누락 필수 이미지, stale 해석, PDF 한쪽 실패를 성공으로 취급하지 않는 fail-closed 출력
- Electron 제품, 브라우저 fallback, CLI/검증 도구가 하나의 export service 계약 사용

## 2. 지원 범위

### P11-S1 필수 범위

- 선형 정적 3D frame/truss 건축물
- 다중 하중 케이스와 하중조합
- 모델 등각·평면/입면, 중력·횡하중, 지배 변형, 반력, 이용률 화면 증거
- 탄성해석·평형·층간변위·부재 검토·품질감사·제한사항
- 한국어 PDF와 영문 PDF 동시 생성
- `PILOT-OFFICE-01` 4층 사무실 모델을 release acceptance fixture로 사용

### P11-S2 후속 범위

- P-Delta, modal/RSA, buckling, shell, pushover, NLTH 전용 시각 증거
- 3개 이상 언어와 사용자 번역팩
- 전자서명, PDF/A, 장기 보존소 또는 외부 문서관리시스템 연동
- 독립 해석 정답 모델의 신규 작성

S2 항목은 S1의 스냅샷·현지화·capture·export 계약을 변경하지 않고 확장한다.

## 3. 제품 진실성 원칙

1. **보고서 생성 성공과 구조공학적 검증 완료를 구분한다.**
2. 독립 정답 모델이 없으면 종합 결론은 최대 `CONDITIONAL_PASS`다.
3. Phase 10의 외부 교차검증·WebGPU release blocker를 Phase 11 보고서가 해제하지 않는다.
4. `qualityAudit.ok` 하나만으로 전체 결론을 `PASS`로 승격하지 않는다.
5. 필수 이미지가 없거나 다른 model/result hash의 이미지이면 PDF 발행을 차단한다.
6. 양 언어 보고서는 같은 `reportSnapshotHash`와 `evidenceManifestHash`를 표지와 manifest에 기록한다.
7. 화면 증거는 장식이 아니라 수치 결과의 추적 가능한 증빙이다.
8. 사용자 로컬 경로, 계정명, 토큰, `file:///` URL은 최종 산출물에 포함하지 않는다.

## 4. 목표 산출물

```text
output/pdf/phase11/
  PILOT-OFFICE-01-report-ko.pdf
  PILOT-OFFICE-01-report-en.pdf
  PILOT-OFFICE-01-report-manifest.json

reports/phase11/PILOT-OFFICE-01/
  report-snapshot.json
  evidence-manifest.json
  report-ko.html
  report-en.html
  assets/*.png
```

최종 파일명은 실제 project/run 식별자로 일반화하며, 위 경로는 첫 release fixture의 고정 예다.

## 5. 문서 맵과 읽기 순서

1. [CURRENT_STATE_AUDIT.md](CURRENT_STATE_AUDIT.md) — 현재 보고서·UI·PDF 경로와 격차
2. [PRODUCTION_REQUIREMENTS.md](PRODUCTION_REQUIREMENTS.md) — 기능·비기능·보안·운영 요구사항
3. [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) — 스냅샷·현지화·capture·export 구조
4. [MILESTONE_EXECUTION_PLAN.md](MILESTONE_EXECUTION_PLAN.md) — authoritative M0~M9 실행계획
5. [ROADMAP.md](ROADMAP.md) — 마일스톤 요약, 의존, 핵심 게이트
6. [VERIFICATION_MATRIX.md](VERIFICATION_MATRIX.md) — 자동검증 ID와 수용기준
7. [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md) — 요구사항→구현→검증→evidence
8. [RISK_REGISTER.md](RISK_REGISTER.md) — 위험과 중단조건
9. [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) — 실제 진행상태
10. [workpackages/](workpackages/) — 마일스톤별 작업 명세
11. [adr/ADR-001](adr/ADR-001-SHARED-SNAPSHOT-DUAL-LOCALE.md) — 공통 스냅샷·분리 PDF 결정
12. [adr/ADR-002](adr/ADR-002-DETERMINISTIC-VISUAL-CAPTURE.md) — 결정론적 화면 증거 결정
13. [M0 review](reviews/P11-M0-CODE-REVIEW.md) — 기준선·governance 완료 검토
14. [M1 review](reviews/P11-M1-CODE-REVIEW.md) — snapshot·verdict 완료 검토
15. [M2 review](reviews/P11-M2-CODE-REVIEW.md) — 한·영 catalog·dual HTML 완료 검토
16. [M3 review](reviews/P11-M3-CODE-REVIEW.md) — 결정론적 캡처·복원·실패 모드 완료 검토
17. [M4 review](reviews/P11-M4-CODE-REVIEW.md) — 필수 7 scene·본문 figure binding 완료 검토
18. [M5 review](reviews/P11-M5-CODE-REVIEW.md) — 첫 페이지 결론·production pagination·전 페이지 raster 검토
19. [M6 review](reviews/P11-M6-CODE-REVIEW.md) — 원자적 dual-PDF·Electron 격리·PDF 내부 검사 검토

## 6. 공통 마일스톤 사이클

**착수 → 구현 → focused test → `/code-review high` → 수정 → 전용 gate →
전체 회귀 → evidence/hash 갱신 → 문서 갱신 → 의도적인 milestone commit**

다음 조건을 모두 충족하기 전에는 해당 마일스톤을 `complete`로 바꾸지 않는다.

- production code 또는 계획된 evidence가 실제 존재
- 전용 verification ID가 자동시험으로 PASS
- 관련 golden과 전체 회귀 green
- Critical/High code-review finding 0
- 성능·메모리·산출물 크기 telemetry 갱신
- UI·Agent/API·도움말·문서 동기화
- unrelated worktree 변경 제외
- evidence에 source revision, 명령, 환경, artifact hash 기록

## 7. 완료와 release의 구분

- `implementation-complete`: 코드·테스트·문서가 구현됨
- `qualification-complete`: 필수 환경에서 수치·시각·PDF 검증을 통과함
- `release-qualified`: P11-M9 manifest와 실제 artifact hash가 모두 일치함

보고서 기능의 `release-qualified`는 해석 엔진 자체의 외부 교차검증 상태를 승격하지 않는다.
