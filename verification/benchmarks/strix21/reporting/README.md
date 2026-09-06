# STRIX21 Reporting

기계 판정 JSON을 읽어 Markdown/PDF를 만드는 renderer 영역이다. 보고서 생성 중 solver를 재실행하거나 PASS 판정을 새로 만들지 않는다.

## P17-M1 framework 보고서

P17-M1 renderer는 `render_p17_m1_report.py`이고 Node launcher는 `tools/render-p17-m1-report.mjs`다. dependency는 `requirements-p17-m1.txt`에 동결한다. renderer는 정본 `verification/evidence/validation/phase17/p17-m1-case-contract-shared-harness-r6.json`만을 framework 판정 근거로 읽으며 모델 builder, product adapter나 solver를 호출하지 않는다. evidence R1~R5와 report R1~R2는 fail-closed hardening 이력으로 보존하고 R6/report R3를 정본으로 사용한다.

```powershell
# tmp/verification/phase17에 draft 생성
node tools/render-p17-m1-report.mjs

# 검토된 Markdown/PDF를 output/verification/phase17에 고정
node tools/render-p17-m1-report.mjs --final

# final bytes와 렌더·텍스트 QA 재검증
node tools/render-p17-m1-report.mjs --verify-final
```

최종 canonical path는 다음과 같다.

- `output/verification/phase17/P17-M1-CASE-CONTRACT-SHARED-HARNESS-REPORT-R3.md`
- `output/verification/phase17/P17-M1-CASE-CONTRACT-SHARED-HARNESS-REPORT-R3.pdf`
- `output/verification/phase17/P17-M1-CASE-CONTRACT-SHARED-HARNESS-REPORT-R3.qa-r3.json`
- `verification/evidence/validation/phase17/p17-m1-validation-closure-r1.json`

M1 보고서는 공식 21 + custom 1, scaffold 419개, schema 16종과 canonical contract smoke 22/22를 설명한다. data-only extractor, external signed custody 요구, local filesystem 비-WORM 한계와 M2 terminal gate 8개도 명시한다. 실제 model, solver·benchmark, engineering result, Chrome capture, 사례 보고서와 공식 PASS는 모두 0이다. 결과 화면이 없다는 이유로 placeholder나 이전 milestone 이미지를 삽입하지 않는다. 상태는 `CONTRACT_READY_NO_BENCHMARK_RUNS`, terminal authorization과 release는 `false`다.

report R1은 14쪽 시각·byte QA 뒤 closure QA scope mismatch로, report R2는 Windows `npm.cmd` direct spawn의 `EINVAL`로 superseded됐다. report R3는 동일한 zero-result claim을 유지하면서 R6 evidence와 Windows-safe closure invocation을 사용한다.

P17-M2/SB1 사례 보고서는 source/reference/probe/tolerance/model lock과 실제 append-only run evidence가 생성된 뒤 별도 case run ID 아래에서 만든다. M1 phase-level 보고서를 SB1 사례 보고서로 재사용하지 않는다.

## P17-M0 source-lock 보고서

P17-M0 renderer는 `render_p17_m0_report.py`다. draft는 `tmp/verification/phase17/`에만 쓰고, 시각 QA 뒤 final R2를 `output/verification/phase17/`에 immutable 산출물로 고정한다.

```powershell
npm.cmd run report:p17:m0:draft
# 봉인된 R2와 새 draft의 Markdown·추출 text·9쪽 pixel identity 검증
npm.cmd run report:p17:m0:final
```

Python dependency는 `requirements-p17-m0.txt`에 동결한다. launcher는 `P17_PYTHON`을 우선 사용하고 필요한 package가 없는 runtime은 거부한다. renderer는 report 생성 전에 baseline·registry·discrepancy·21 source-lock hash chain을 다시 검증한다.

ReportLab PDF container는 생성 시각과 trailer ID가 달라질 수 있으므로 byte-identical regeneration을 주장하지 않는다. final R2 bytes는 immutable hash로 봉인하고, idempotent final 명령은 Markdown bytes, PDF extracted text와 rendered page pixels 9/9 동일성을 검사한다.

source text/value 감사도 같은 dependency pin과 `P17_SOURCE_ROOT`를 사용한다.

```powershell
npm.cmd run audit:p17:m0:check
```

이 감사는 HTML metadata·scalar presence와 result-row visible-text sequence를 확인한다. PDF 검사는 document-global text-value presence이므로 row-local parity로 확대 해석하지 않는다.
