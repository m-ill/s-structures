# Phase 11 Artifact Retention

```yaml
version: p11-artifact-retention-v1
status: accepted
reviewed_at: 2026-07-23
accepted_at: 2026-07-23
```

## 1. 목적

화면 PNG와 PDF를 Git에 무제한 저장하지 않으면서 release evidence의 hash chain과 재현성을 보존한다.

## 2. 분류

| 분류 | 예 | 기본 위치 | Git |
| --- | --- | --- | --- |
| tracked summary | verification record, manifest summary, SHA-256 | `reports/validation-evidence/phase11/` | 추적 |
| raw run artifact | HTML, PNG, snapshot, full manifest | `reports/phase11/<project>/<run>/` | 기본 비추적 |
| deliverable | ko/en PDF와 pair manifest | `output/pdf/phase11/` | 기본 비추적, release artifact |
| temporary | print 중간 PDF, raster page, diff image | `tmp/pdfs/phase11/<job>/` | 비추적·terminal cleanup |
| approved golden | 최소 fixture snapshot 또는 visual reference | 구현 시 명시 경로 | 승인된 것만 추적 |

위 기본 비추적 경로는 `.gitignore`에 반영한다. M0의 `PILOT-OFFICE-01` 기준선 5개 파일은
후속 회귀의 고정 입력이므로 예외적으로 milestone commit에 포함한다.

## 3. 보존 규칙

- 모든 tracked evidence는 raw artifact의 hash, byte size, source revision, environment profile을 가진다.
- CI 일반 run raw artifact 기본 보존기간은 30일로 계획하며 운영환경 설정으로 명시한다.
- release-qualified run의 PDF·HTML·PNG·manifest는 release asset으로 장기 보존한다.
- 실패 run은 원인분석에 필요한 최소 debug artifact만 보존하고 개인정보 scan 후 업로드한다.
- 동일 hash artifact를 중복 보존하지 않는다.
- 사용자 프로젝트 원본은 report evidence bundle에 자동 포함하지 않는다.

## 4. 정리 규칙

- `complete`, `failed`, `cancelled` terminal 상태에서 temp job directory를 정리한다.
- 열린 handle/window가 있으면 삭제를 강행하지 않고 cleanup failure evidence를 남긴다.
- final artifact를 정리할 때 tracked evidence와 release manifest를 먼저 확인한다.
- 경로는 canonicalize하고 workspace/output/job 범위 밖을 재귀 삭제하지 않는다.

## 5. Release gate

- release manifest가 참조하는 raw artifact 접근 가능
- tracked hash와 실제 파일 hash 일치
- temp/orphan artifact 0
- secret/local path scan PASS
- 승인되지 않은 대형 binary가 Git에 추가되지 않음

## 6. 계약 파일

- 공통 evidence JSON Schema: [evidence-schema.json](evidence-schema.json)
- 현재 release manifest: [release-manifest.json](release-manifest.json)
- 실행 registry와 validator: `src/report/phase11/governance.js`
