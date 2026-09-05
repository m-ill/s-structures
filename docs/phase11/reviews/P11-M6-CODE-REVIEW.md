# P11-M6 원자적 Dual-PDF Export Service 코드리뷰

```yaml
milestone: P11-M6
reviewed_at: 2026-07-23
status: PASS
critical_findings: 0
high_findings: 0
release_qualified: false
```

## 결론

동일 ReportSnapshot과 figure manifest에서 한국어·영어 HTML/PDF를 하나의 export plan으로
생성하고, 임시 디렉터리의 전 산출물이 검증된 뒤 디렉터리 rename 한 번으로 최종 게시하는
서비스를 구현했다. 한 locale, 검사, timeout 또는 cancel이 실패하면 staging만 삭제하며 기존
최종 산출물은 변경하지 않는다.

PILOT-OFFICE-01 실제 PDF는 locale별 14쪽이고 합계 1,079,025 bytes, 4.21초였다. PDF parser로
A4 MediaBox, 검색 가능한 text, CID font embedding, page footer, metadata와 privacy를 확인했고
manifest의 locale별 SHA-256·page·bytes가 실제 파일과 일치한다.

## 검토 범위

- `server/report/phase11/pdfExportService.mjs`
- `desktop/reportExportIpc.mjs`
- `desktop/preload.mjs`
- `desktop/main.mjs`
- `src/report/phase11/productionReport.js`
- `tests/p11-m6-dual-pdf-export.mjs`
- `tools/run-p11-m6-evidence.mjs`
- `tools/p11_m6_pdf_inspect.py`

## 주요 판정

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| pair completeness | PASS | ko/en PDF·HTML·manifest 함께 게시 |
| atomic publish | PASS | staging 검증 후 final directory rename |
| rollback | PASS | locale/inspection/timeout/cancel 실패 partial final 0 |
| artifact integrity | PASS | manifest SHA-256·page·bytes 100% 일치 |
| PDF 품질 | PASS | A4·searchable text·embedded font·footer |
| metadata | PASS | locale ASCII title로 replacement character 0 |
| privacy | PASS | file URL·사용자 경로·token marker 0 |
| path safety | PASS | root canonicalization·safe segment·escape 차단 |
| Electron isolation | PASS | contextIsolation·sandbox, nodeIntegration false |
| IPC | PASS | plan/run/status/cancel allowlist만 preload에 노출 |
| resource cleanup | PASS | hidden window·profile·staging cleanup |

## 수정 반영

초기 실제 PDF 검사에서 Chromium이 한국어 HTML title을 PDF 문서 정보에 기록할 때 일부 parser가
대체문자로 해석하는 문제가 발견됐다. PDF metadata title을 locale이 포함된 ASCII 식별자로
고정하고 빈 제목 및 U+FFFD를 export gate에서 차단했다. 또한 Electron 경로가 성공을 가정하지
않도록 PDF page object, A4 MediaBox, embedded font stream, ToUnicode와 구조 트리를 검사한다.

## 실제 산출물

- `output/pdf/phase11/PILOT-OFFICE-01/P11-M6-PILOT/report-ko.pdf`
- `output/pdf/phase11/PILOT-OFFICE-01/P11-M6-PILOT/report-en.pdf`
- `output/pdf/phase11/PILOT-OFFICE-01/P11-M6-PILOT/artifact-manifest.json`
- `verification/evidence/validation/phase11/p11-m6-dual-pdf-export.json`

## 잔여 범위

M6는 내부 service와 desktop bridge까지다. UI·Agent의 동일 plan hash, 진행·취소 UX, export
history 및 artifact open 동작은 P11-M7에서 연결한다. 독립 구조공학 기준 부재도 그대로이므로
보고서 결론은 CONDITIONAL_PASS이며 Phase 11 전체는 아직 release-qualified가 아니다.
