# Phase 17 Validation Evidence

## Canonical M1

현재 상태는 `CONTRACT_READY_NO_BENCHMARK_RUNS`다.

- authoritative framework evidence: `p17-m1-case-contract-shared-harness-r6.json`
- superseded append-only history: `p17-m1-case-contract-shared-harness-r1.json` ~ `p17-m1-case-contract-shared-harness-r5.json`
- validation closure: `p17-m1-validation-closure-r1.json`
- suite manifest: `verification/benchmarks/strix21/suite-manifest.json`
- workpackage: `docs/phase17/workpackages/WP-01-case-framework.md`
- code/artifact review: `docs/phase17/reviews/P17-M1-CODE-AND-ARTIFACT-REVIEW-R1.md`
- phase-level report: `output/verification/phase17/P17-M1-CASE-CONTRACT-SHARED-HARNESS-REPORT-R3.md`, `.pdf`, `.qa-r3.json`

M1 evidence는 공식 21개와 custom 1개, 사례별 19개, 결정론적 scaffold 419개, runtime schema 16종과 process-isolated contract `22/22`를 기록한다. `CONTRACT_VALIDATED`는 사례 wrapper와 저장 manifest의 계약 검증을 뜻한다.

M1 result counter는 model, solver, benchmark, engineering result, Chrome capture, case report와 공식 PASS가 모두 0이어야 한다. M1 evidence 또는 closure가 이 경계를 넘어 수치 정확도, STRIX·MIDAS 일치, 성능이나 release를 주장하면 invalid다. `releaseAllowed=false`를 유지한다.

M1 strict schema 정본은 `verification/framework/phase17/jsonSchemaStrict.mjs`다. `verification/harnesses/json-schema-strict.mjs`는 호환 wrapper이며 신규 schema ownership 경로가 아니다. M0 R4의 schema 부채는 M1 신규 정본에 한해 `CLOSED_FOR_M1_AUTHORITATIVE_RECORDS`로 처리하고 M0 R3 artifact의 역사적 제한은 소급 변경하지 않는다.

R2~R4는 custody token, PDF 줄바꿈 QA, closure QA scope mismatch를 fail-closed로 드러냈다. R5/report R2는 이 계약을 정렬했지만 Windows가 `npm.cmd` direct `spawnSync`를 `EINVAL`로 거부했다. 각 artifact를 덮어쓰지 않고 호출을 `cmd.exe /d /s /c npm.cmd`로 고쳤으며 R6/report R3가 정본이다. 실행·solver·result·PASS counter는 모든 revision에서 0이다.

```powershell
npm.cmd run check:p17:m1:evidence
```

evidence와 closure는 append-only다. 저장된 파일과 재생성 결과가 다르면 기존 파일을 덮어쓰지 않고 원인을 검토한 뒤 새 revision과 supersedes 관계를 사용한다. hash 값은 각 machine-readable 정본과 closure에서 읽으며 이 README에 복제하지 않는다.

## Canonical M0

- `p17-m0-baseline-source-lock-r2.json`
- `p17-m0-validation-closure-r2.json`과 후속 superseding closure
- `p17-m0-source-value-presence-audit-r3.json`
- `p17-m0-r2-claim-qualification-r1.json`
- `p17-m0-validation-closure-r3.json`

suffix가 없는 `p17-m0-baseline-source-lock.json`은 HTML의 첫 설명용 Engine 필드를 선택한 R1 parser 초안이다. R1은 append-only 감사 이력으로 보존하지만 판정 정본이 아니다. R2의 `supersedes`가 R1 baseline hash와 정정 이유를 연결한다.

P17-M0는 source custody 기술 계약만 닫는다. 사례 실행 PASS, STRIX actual R4, MIDAS cross-validation, release 또는 final design transfer를 의미하지 않는다.

`p17-m0-content-transcription-audit-r1.json`과 `p17-m0-source-value-presence-audit-r2.json`은 append-only 정정 이력이다. R1은 PDF document-global value presence를 row-complete transcription처럼 표현하고 SH1 두 행 clipping을 축소했다. R2는 claim을 제한했지만 HTML 행 순서를 강제하지 않았다. R3가 증가하는 match offset으로 131개 행 순서를 확인하고 R2 path/file hash/audit hash를 연결한다.

원자료 경로 `STRIX-verification-21/...`는 DCR vault root 기준이고, `verification/...`, `docs/...`, `output/...`은 S-Structures repository root 기준이다. 정확한 결합 규칙은 `verification/specs/phase17/path-base-policy.json`을 따른다. 외부 bundle을 다른 물리 경로에 제공할 때는 `P17_SOURCE_ROOT`를 사용한다.
