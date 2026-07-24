# P11-M7 Product UI·Agent·Export History 코드리뷰

```yaml
milestone: P11-M7
reviewed_at: 2026-07-23
status: PASS
critical_findings: 0
high_findings: 0
release_qualified: false
```

## 결론

제품 UI와 Agent가 각각 PDF renderer를 호출하지 않고 M6의 동일 export transport를 사용하는
공유 workflow를 구현했다. preflight, plan, run, status, cancel, list history, get artifacts,
open artifact의 8개 action이 동일 job·plan hash·snapshot hash를 사용한다. 동일 입력을 UI와
Agent가 연속 plan해도 원격 plan은 한 번만 생성된다.

## 검토 범위

- `src/ui/indexReportExportWorkflow.js`
- `src/ui/indexAgentApi.js`
- `src/ui/indexAgentActionCatalog.js`
- `src/ui/indexBridge.js`
- `src/ui/agentManifest.js`
- `src/platform/featureCatalog.js`
- `docs/user-manual/03-loads-design-and-reports.md`
- `docs/user-manual/agent-contract.json`
- `tests/p11-m7-product-agent-export.mjs`
- `tools/run-p11-m7-evidence.mjs`

## 주요 판정

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| UI/Agent parity | PASS | job·plan·snapshot·artifact hash 동일 |
| idempotency | PASS | 동일 요청 transport plan 1회 |
| preflight | PASS | snapshot·stale·scene 7/7·adapter 검사 |
| progress/status | PASS | planned→running→completed 상태와 0~1 progress |
| cancellation | PASS | acknowledgement 2초 budget 이내 |
| failure UX | PASS | reason code와 한국어 remediation 제공 |
| history | PASS | 완료·실패·취소 job과 locale별 artifact 조회 |
| artifact open | PASS | completed job과 ko-KR/en-US allowlist만 허용 |
| browser fallback | PASS | manual print-ready, silent success false |
| Agent/manual sync | PASS | 139 actions·113 read APIs·80 features |

## 보안·정합성 판정

- renderer는 preload가 제공한 allowlist transport만 호출하며 파일 경로를 직접 조립하지 않는다.
- service가 반환한 plan/status/result의 snapshot·plan hash가 다르면 workflow가 fail-closed한다.
- stale snapshot과 불완전 figure manifest는 export plan 전에 차단한다.
- 일반 browser 경로는 HTML preview만 반환하고 PDF 저장 완료나 artifact hash를 생성하지 않는다.

## 실제 증적

- `reports/validation-evidence/phase11/p11-m7-product-agent-export.json`
- `output/pdf/phase11/PILOT-OFFICE-01/P11-M6-PILOT/artifact-manifest.json`
- `docs/user-manual/agent-contract.json`
- `help.html`

## 잔여 범위

M7은 제품·Agent workflow parity까지다. M8에서 전 페이지 visual diff, font/privacy 재검사,
성능·메모리·fault matrix를 최종 hardening하고 M9에서 office pilot을 3회 반복해야 한다.
독립 구조공학 기준 부재 때문에 공학 판정은 여전히 CONDITIONAL_PASS다.
