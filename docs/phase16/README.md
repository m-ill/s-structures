# Phase 16 — Production / Verification Workspace Separation

```yaml
version: p16-repository-separation-charter-v1
phase: 16
title: 프로그램 실행영역과 검증 워크스페이스 분리
created_at: 2026-08-28
status_authority: docs/phase16/IMPLEMENTATION_STATUS.md
predecessor: docs/phase15/README.md
behavior_change_allowed: false
numerical_change_allowed: false
```

## 목적

Phase 16은 해석 수치식을 바꾸는 단계가 아니다. 현재 한 저장소 안에 섞여 있는 제품 실행 코드, 검증 명세, 벤치마크 runner, 증거, 보고서와 임시 산출물을 역할별 경계로 분리한다.

완료 시 다음 관계를 만족해야 한다.

```text
verification runner ──calls──> product public service ──calls──> solver
verification evidence <────── verification runner
product runtime ──must not import──> verification runner/reference/evidence
```

## 완료 범위

첫 이동은 결과 판정과 무관하게 수행하되 기존 증거를 수정하거나 새 PASS로 재해석하지 않는다.

- 현재 dirty worktree와 Phase 15 기준 hash를 relocation manifest로 동결
- `docs/verification/`을 `verification/specs/`로 이동
- `reports/validation-evidence/`를 `verification/evidence/validation/`로 이동
- STRIX21 실행물을 `verification/benchmarks/strix21/runs/`로 이동
- 활성 코드·테스트·도구·문서의 canonical path 참조 갱신
- 기존 evidence는 byte-for-byte 보존하고 이전/신규 경로를 manifest로 연결
- layout 검사기를 추가해 구 경로 재유입과 hash 손상을 차단

P16-M0~M7을 완료해 비실행 자산, 검증 framework, runner, harness, 테스트 inventory와 생성물 정책을 분리했다. `src/verification/`은 제거됐고 제품→검증 import는 0건이다. 기존 `tools/` 진입점은 외부 자동화 호환 launcher로 유지한다.

폴더 분리 완료는 제품 release 승인을 뜻하지 않는다. UI→numeric core 40건, report→solver 1건과 외부 qualification 조건은 [Codebase Review](CODEBASE_REVIEW.md)의 후속 gate다.

상세 목표 구조와 순서는 [Target Folder Architecture](TARGET_FOLDER_ARCHITECTURE.md), 실제 진행 상태는 [Implementation Status](IMPLEMENTATION_STATUS.md)를 따른다.

## 비목표

- benchmark 수치, tolerance, reference 또는 판정 변경
- solver 알고리즘·요소 정식화·복구식 변경
- 기존 Phase 15 evidence의 재생성 또는 덮어쓰기
- 기존 package 명령명 변경
- 호환 경로를 확인 없이 삭제
