# Documentation Governance

## Purpose

Phase 2부터 문서는 세 종류로 분리한다.

1. 현재 프로그램을 쓰는 문서.
2. 앞으로 개발할 때 보는 문서.
3. 과거 구현 기록과 검증 근거.

이 분리를 지키면 사용자 매뉴얼, 개발 계획, 과거 마일스톤 기록이 서로 덮어쓰이지 않는다.

## Document Classes

| class | 위치 | 변경 방식 |
| --- | --- | --- |
| Current user guide | `docs/user-manual/` | 현재 동작과 맞지 않으면 즉시 수정 |
| Active development guide | `docs/phase2/` | 다음 개발 작업의 기준으로 유지 |
| Product requirements | `docs/product/` | 큰 요구사항 변경 시 수정 |
| Planning archive | `docs/planning/` | 계획 근거 보존. 필요한 경우 새 phase2 문서로 요약 |
| Milestone archive | `docs/milestones/` | append-only. 현재 사용법으로 쓰지 않음 |
| Verification evidence | `docs/verification/` | 수치 검증 기준과 함께 테스트 링크 유지 |

## File Naming

| 문서 종류 | 이름 규칙 |
| --- | --- |
| 사용자 매뉴얼 | `NN-topic.md` 또는 명확한 대문자 이름 |
| AI 계약 | `agent-contract.json`, `AI_AGENT_GUIDE.md` |
| phase2 계획 | `UPPER_SNAKE_CASE.md` |
| milestone 기록 | 기존 `M##_*.md` 유지 |
| 검증 문서 | 검증 대상 이름을 포함 |

## Generated Files

생성물은 source documentation이 아니다.

| 생성물 | 위치 |
| --- | --- |
| HTML/JSON 보고서 | `reports/` |
| PDF | `output/pdf/` |
| 임시 export zip | git 추적 제외 |
| 테스트 fixture | 재사용 목적이면 `tests/fixtures/`, 단순 산출물이면 `reports/` |

## Review Checklist

문서 또는 코드 PR을 닫기 전 아래를 확인한다.

1. 루트 `docs/`에 새 loose milestone 문서가 생기지 않았는가.
2. 사용자에게 보여야 하는 내용이 `user-manual/`에 반영됐는가.
3. AI가 읽어야 하는 action/API 변경이 `agent-contract.json`에 반영됐는가.
4. 개발자가 이어받아야 하는 내용이 `phase2/`에 반영됐는가.
5. 생성 산출물이 `docs/`에 들어오지 않았는가.
6. 오래된 milestone 기록을 현재 기능 설명처럼 인용하지 않았는가.

## Migration Notes

2026-06-30 기준으로 기존 루트 문서를 아래처럼 이동했다.

| 이전 위치 | 새 위치 |
| --- | --- |
| `docs/S-STRUCTURES_*.md` | `docs/product/` |
| `docs/INDEX_*.md`, `docs/R*.md` | `docs/planning/` |
| `docs/M*.md`, `docs/m*.md` | `docs/milestones/` |
| `docs/LINEAR_SOLVER_VERIFICATION.md` | `docs/verification/` |

`docs/user-manual/`은 현재 사용자와 AI agent를 위한 기준 문서로 유지한다.
