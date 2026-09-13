# Phase 16 Target Folder Architecture

> 구현 상태: P16-M0~M7 완료. 실제 결과와 잔여 부채는 `IMPLEMENTATION_STATUS.md`와 `CODEBASE_REVIEW.md`를 따른다.

```yaml
version: p16-target-folder-architecture-v1
status: accepted-for-staged-migration
created_at: 2026-08-28
```

## 목표 트리

```text
S-Structures-main/
├─ src/                              # 브라우저·서버·CLI에서 사용하는 production runtime
├─ server/                           # 로컬 실행 서버
├─ desktop/                          # desktop wrapper
├─ tools/                            # 제품 build·운영·사용자 CLI
├─ tests/                            # M5까지 현 위치 유지, 이후 unit/integration/e2e 분류
├─ docs/                             # 개발계획·사용자 문서
├─ reports/                          # 제품 실행 보고서만
├─ verification/
│  ├─ README.md
│  ├─ workspace-paths.mjs            # canonical path registry
│  ├─ specs/                         # schema, 정책, release input/manifest 명세
│  ├─ evidence/validation/           # 실행 증거, append-only
│  ├─ benchmarks/strix21/
│  │  ├─ runs/                       # 기계 판정 JSON·비교 Markdown
│  │  ├─ references/                 # 외부 원문·출처·checksum
│  │  └─ reporting/                  # 후속 보고서 renderer
│  ├─ runners/                       # 후속 이동할 Node entrypoints
│  ├─ harnesses/                     # 성능·결정론·아키텍처 검사
│  ├─ framework/                     # 후속 이동할 검증 API·gate
│  └─ archive/
│     └─ legacy-layout-map.json      # 이전 경로와 SHA-256 동결
├─ output/verification/              # 외부 전달용 PDF·최종 보고서
└─ tmp/verification/                 # 비추적 중간 산출물
```

## 경계 규칙

1. `src/**`는 `verification/**`, `tests/references/**`를 import하지 않는다.
2. `verification/**`은 `src/**`의 승인된 product service와 immutable result contract를 호출할 수 있다.
3. reference·tolerance·benchmark expected 값은 production bundle에 포함하지 않는다.
4. report renderer는 immutable result/evidence만 읽고 solver를 재실행하지 않는다.
5. 기존 evidence 이동은 내용 변경 없이 수행하고 relocation manifest의 SHA-256으로 검증한다.
6. package 명령명은 유지하고 내부 target만 단계적으로 이동한다.
7. compatibility launcher/facade에는 canonical target, owner, 도입 시점, removal gate를 기록한다.
8. 테스트 이동 전 수집기를 재귀형 manifest 기반으로 바꾸며 planned count 감소를 실패로 처리한다.

## 마일스톤

| ID | 범위 | 완료 gate |
| --- | --- | --- |
| P16-M0 | snapshot freeze | source/evidence/path/hash manifest 생성 |
| P16-M1 | non-runtime asset separation | specs·validation evidence·STRIX runs 이동, byte parity 100% |
| P16-M2 | runner/tool separation | package command parity, wrapper policy, runner list parity |
| P16-M3 | dependency inversion | UI→verification import 0, immutable quality snapshot 주입 |
| P16-M4 | source/API separation | `src/verification` 제거, `verification/index.js`, browser 404/번들 누출 0 |
| P16-M5 | test taxonomy | recursive inventory, unit/integration/e2e/qualification 분류, planned count 보존 |
| P16-M6 | output hygiene | `tmp/verification`, `output/verification`, retention·ignore 정책 적용 |
| P16-M7 | review and requalification | import/cycle/public API review, full regression, 새 source-bound evidence |

## 이동 정책

- 이동 전후 파일 수·크기·SHA-256을 비교한다.
- 원본과 복사본을 동시에 정본으로 두지 않는다.
- 역사 evidence 내부의 당시 경로 문자열은 수정하지 않는다. 현재 위치는 relocation manifest로 해석한다.
- 새 실행부터 canonical path registry가 가리키는 위치에만 기록한다.
- source·test 이동은 각기 별도 gate에서 수행한다. 폴더 정리를 이유로 수치코드를 동시에 수정하지 않는다.

## Rollback

각 마일스톤은 독립적으로 되돌릴 수 있어야 한다. P16-M1 rollback은 relocation manifest를 역방향으로 적용하고, 파일 hash가 manifest와 모두 일치할 때만 수행한다. mismatch가 하나라도 있으면 자동 이동하지 않고 수동 검토로 전환한다.
