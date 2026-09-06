# Phase 13 — Elastic Practice Workspace

```yaml
version: p13-phase-charter-v1
phase: 13
title: 자체 엔진 탄성해석 실무 워크벤치 프로덕션화
plan_status: approved
implementation_status: in-progress
created_at: 2026-08-05
milestones: [P13-M0, P13-M1, P13-M2, P13-M3, P13-M4, P13-M5, P13-M6, P13-M7, P13-M8, P13-M9]
status_authority: docs/phase13/IMPLEMENTATION_STATUS.md
runtime_solver_owner: S-Structures in-house engine
external_solver_runtime_dependency: forbidden
nonlinear_scope: excluded
```

## 1. Phase 결정

Phase 12는 Windows 단일 PC의 loopback-only 로컬 파일럿 운영기반을 완료했다. 다음 목표는 새 해석 엔진이나
비선형 범위를 추가하는 것이 아니라, Phase 7~10에서 구현한 탄성 코어를 구조기술자가 실제 업무에서 빠르고
안전하게 사용할 수 있는 하나의 작업공간으로 제품화하는 것이다. 따라서 다음 단계는 **Phase 13**으로 정하고,
첫 마일스톤은 **P13-M0**으로 한다.

Phase 13의 제품명은 `Elastic Practice Workspace`, 화면명은 `Elastic Review Workspace`를 사용한다.

## 2. 제품 목표

> 자체 엔진으로 모델 검토, 하중·질량 작성, 탄성해석, 결과 판독과 검토 산출물을 하나의 추적 가능한 실무 흐름으로 완성한다.

핵심 결과는 다음과 같다.

1. 모델 변경, 해석 실행, 결과와 보고서가 하나의 versioned Analysis Run 상태를 사용한다.
2. Model Check 문제를 객체 위치와 연결하고 안전한 수정 미리보기·적용·undo를 제공한다.
3. 층·구역·슬래브 패널 하중과 질량을 작성하고 입력합·전달합·잔차를 검증한다.
4. KDS 하중 절차는 공식 source snapshot, 가정, 계산식과 생성 케이스를 추적한다.
5. 층응답, 지배조합, 평형, P-Delta와 RSA 결과를 표·3D 모델에서 함께 검토한다.
6. Phase 10 고급 탄성 기능을 JSON이나 Agent API 없이 실무 속성창에서 편집한다.
7. 계산서·검토도면·revision 비교와 제한된 MGT Import가 같은 모델·run provenance를 사용한다.

## 3. 릴리스 선 분리

| 릴리스 선 | Phase 13 목표 | 최종 설계전이 |
| --- | --- | --- |
| Core Frame Elastic | frame/truss 중심 로컬 사무소 파일럿 workflow 자격 | Phase 10 공학 검증 상태를 상속하며 자동 승인하지 않음 |
| Slab Load Panel | 골조용 면하중·질량 전달과 평형 추적 | 지원 범위 안에서만 가능 |
| Plate/Shell Lab | 기존 CPU flat-shell의 모델링·메쉬·결과 검토 표면 | 기본 `Experimental`, 별도 자격 전 설계전이 차단 |
| Nonlinear/PBSD | Phase 13 비범위 | 차단 유지 |

`P13-M9` manifest는 최소한 다음 필드를 별도 판정한다.

- `workflowReleaseQualified`
- `frameElasticOfficePilotAllowed`
- `engineeringCrossValidationQualified`
- `finalDesignTransferAllowed`
- `shellDesignTransferAllowed`
- `openSeesRuntimeUsed` — 항상 `false`
- `externalSolverRuntimeDependency` — 항상 `false`
- `nonlinearInScope` — 항상 `false`

UI·업무흐름이 green이어도 공학 교차검증, shell 또는 최종 설계전이가 자동 승격되지 않는다.

## 4. 불변 원칙

1. **자체 엔진 단일 소유:** 모든 사용자 해석결과는 S-Structures 자체 엔진에서 계산한다.
2. **결과 단일 원천:** viewport, 표, 보고서와 Agent API는 같은 run/result snapshot을 소비한다.
3. **모호하면 stale 또는 blocked:** 입력 hash나 지원범위를 확인하지 못하면 current 결과로 표시하지 않는다.
4. **적용은 명시적:** 생성·일괄수정·import·자동수리는 Preview → Apply → Undo 계약을 따른다.
5. **자동수정은 보수적:** 공학적 판단이 필요한 수정은 제안만 하고 자동 확정하지 않는다.
6. **수치 무회귀:** UI 제품화가 기존 solver 결과를 설명 없이 변경하지 않는다.
7. **단위·축·부호 추적:** 입력, 중간 변환, 결과와 export에서 단위와 좌표계를 보존한다.
8. **실험기능 격리:** shell·미완 KDS 절차·선형 THA 등은 지원등급을 화면과 보고서에 일관되게 표시한다.
9. **로컬 우선:** Phase 12의 loopback-only, 데이터·비밀정보 분리와 백업 경계를 유지한다.

## 5. 마일스톤

| ID | 명칭 | 핵심 산출물 | 선행 |
| --- | --- | --- | --- |
| P13-M0 | 기준선·계약·검증 거버넌스 | capability registry, 상태·evidence 계약, baseline | 없음 |
| P13-M1 | Unified Analysis Run·Workspace shell | Current/Stale 단일 상태, 3-pane workspace | M0 |
| P13-M2 | Model Check & Repair Center | issue registry, click-to-zoom, preview repair | M1 |
| P13-M3 | Load·Mass·Combination Workspace | 표·일괄편집, slab panel 전달, 합계 audit | M1, M2 |
| P13-M4 | KDS 하중 절차·방향 케이스 | source-bound 풍·지진·적설·조합 생성 trace | M3 |
| P13-M5 | 실무 모델·층·부재 편집기 | 고급 탄성 속성, story/diaphragm, spreadsheet | M1, M2 |
| P13-M6 | Elastic Results Dashboard | 층응답·평형·지배조건·3D 연동 | M1, M3~M5 |
| P13-M7 | 검토 패키지·revision·MGT Import | 계산서 composer, 검토도면, diff, mapping audit | M2~M6 |
| P13-M8 | Plate/Shell Lab 안전 제품화 | mesh QA, contour, convergence provenance | M0~M3, M6 |
| P13-M9 | 사무소 파일럿·release gate | E2E, 성능·접근성·회귀, manifest | M1~M7; M8 별도 판정 |

## 6. 문서 체계

- [Current State Audit](CURRENT_STATE_AUDIT.md)
- [Production Requirements](PRODUCTION_REQUIREMENTS.md)
- [Target Architecture](TARGET_ARCHITECTURE.md)
- [Elastic Workspace UX Specification](ELASTIC_WORKSPACE_UX_SPEC.md)
- [Reference Basis](REFERENCE_BASIS.md)
- [Milestone Execution Plan](MILESTONE_EXECUTION_PLAN.md)
- [Verification Matrix](VERIFICATION_MATRIX.md)
- [Requirements Traceability](REQUIREMENTS_TRACEABILITY.md)
- [Risk Register](RISK_REGISTER.md)
- [Implementation Status](IMPLEMENTATION_STATUS.md)
- [Work Packages](workpackages/README.md)

## 7. 현재 판정

계획된 P13-M1~M9 기능은 실제 index 워크벤치·Bridge·Agent API·보고서에 통합되어 `implementation-complete`다. M8은
`Experimental / Review only` 격리와 설계전이 차단을 포함해 별도 capability 자격을 마쳤다. 다만 M4 공식 source pack과 M9 전체 회귀·실제
office pilot·설치/복구·독립 교차검증 증거가 없으므로 workflow release는 계속 차단한다. 실제 판정은
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)를 따른다.
