# Phase 11 Verification Matrix

```yaml
version: p11-verification-matrix-v1
status: planned
reviewed_at: 2026-07-23
missing_evidence_is_pass: false
```

## 1. 상태 정의

| 상태 | 의미 |
| --- | --- |
| `PASS` | 명령, actual/reference, tolerance, artifact hash가 있고 기준 충족 |
| `FAIL` | 실행됐으나 기준 미충족 |
| `BLOCKED` | 필수 입력·환경·구현이 없어 실행 불가 |
| `SKIP` | 승인된 비범위. 사유와 qualification 영향 필수 |

실행기록이 없거나 파일만 존재하는 경우 `PASS`가 아니다.

## 2. Evidence 공통 schema

```text
verificationId
requirementIds
milestone
testCommand
sourceRevision
environmentProfile
reportSnapshotHash
evidenceManifestHash
artifactPath
artifactHash
actual
reference
tolerances
recomputedErrors
status
blockerCode
qualificationImpact
```

PNG/PDF의 육안 확인만으로 수치 검증 PASS를 선언하지 않는다. 원 snapshot과 manifest hash를 함께 확인한다.

## 3. Baseline — P11-BASE-01~06

| ID | 검증 | 기준 |
| --- | --- | --- |
| P11-BASE-01 | office model counts와 bounds 재현 | 45 nodes, 84 members, 12×10×14.4 m |
| P11-BASE-02 | traced loads/combinations 재현 | 240 loads, 6 cases, 28 combos, conflicts 0 |
| P11-BASE-03 | 해석 baseline | errors/warnings/failed combos 0 |
| P11-BASE-04 | 핵심 수치 baseline | dmax·utilization·residual이 고정 tolerance 내 |
| P11-BASE-05 | current HTML/PDF baseline | required marker, A4, page count와 hash 기록 |
| P11-BASE-06 | gap/debt owner coverage | GAP-01~14 owner·milestone 100% |

## 4. Snapshot and verdict — P11-DATA-01~10

| ID 범위 | 검증 묶음 | 기준 |
| --- | --- | --- |
| P11-DATA-01~02 | schema/version/canonical serialize | schema 검증, key order 무관 hash |
| P11-DATA-03~04 | 결정성·locale 독립 | 100회 hash 일치, locale 영향 0 |
| P11-DATA-05~06 | 시간·경로 독립과 mutation 방어 | display time/path 영향 0, post-freeze mutation 차단 |
| P11-DATA-07~08 | stale model/result 검출 | hash mismatch 100% 차단 |
| P11-DATA-09 | compatibility numeric parity | 기존 report 원 수치와 100% 일치 |
| P11-DATA-10 | snapshot provenance | source revision/run/result hash 완비 |

| ID 범위 | verdict 검증 | 기준 |
| --- | --- | --- |
| P11-RPT-01 | 독립검증 없음 | overall 최대 `CONDITIONAL_PASS` |
| P11-RPT-02 | analysis 또는 필수 audit 실패 | `FAIL` 또는 export blocked |
| P11-RPT-03 | 비범위 P-Delta | 프로그램 오류가 아닌 `not-in-scope` |

## 5. Localization and parity — P11-I18N-01~12, P11-PAR-01~08

| ID 범위 | 검증 묶음 | 기준 |
| --- | --- | --- |
| P11-I18N-01~02 | ko/en catalog key·placeholder | 차이 0 |
| P11-I18N-03~04 | missing/unused key | missing 0, 승인 없는 unused 0 |
| P11-I18N-05~06 | status·reason·caption 번역 | raw code 보존, 표시문구 locale 일치 |
| P11-I18N-07~08 | date·number·unit formatting | formatter 규칙과 reference 일치 |
| P11-I18N-09 | 한국어판 미번역 scan | allowlist 밖 일반 영문 0 |
| P11-I18N-10 | 영문판 미번역 scan | allowlist 밖 한글 0 |
| P11-I18N-11 | Korean glyph/search/copy | tofu 0, 핵심 문구 추출 가능 |
| P11-I18N-12 | injection-safe interpolation | HTML/script injection 0 |
| P11-PAR-01~02 | snapshot/verdict hash parity | ko=en |
| P11-PAR-03~04 | metric/table numeric parity | 값·정밀도·순서 100% |
| P11-PAR-05~06 | combo/member/formula ID parity | 누락·번역·재정렬 drift 0 |
| P11-PAR-07 | figure asset parity | PNG sha256 ko=en |
| P11-PAR-08 | UI/Agent plan parity | request/plan/result hash 일치 |

## 6. Visual capture — P11-CAP-01~24

| ID 범위 | 검증 묶음 | 기준 |
| --- | --- | --- |
| P11-CAP-01~03 | CaptureSpec schema·required policy·hash | canonical, 누락 필드 차단 |
| P11-CAP-04~06 | camera·viewport·pixel ratio 고정 | spec와 actual 일치 |
| P11-CAP-07~09 | combo·layer·deform scale 고정 | ambient UI state 영향 0 |
| P11-CAP-10~11 | base/overlay 합성과 readiness | 같은 frame, font/image ready |
| P11-CAP-12~14 | blank·size·stale 검출 | invalid fixture 검출 100% |
| P11-CAP-15 | model-isometric | ready, hash 결속 |
| P11-CAP-16 | model-plan-elevation | ready, hash 결속 |
| P11-CAP-17 | load-gravity | D/L 표시와 case trace |
| P11-CAP-18 | load-lateral | governing lateral case trace |
| P11-CAP-19 | deformed-governing | governing combo·scale trace |
| P11-CAP-20 | reactions-governing | reaction layer·units trace |
| P11-CAP-21 | utilization-governing | governing member·ratio trace |
| P11-CAP-22 | required coverage | 7/7 |
| P11-CAP-23 | capture 후 view restore | deep-equivalent |
| P11-CAP-24 | cancel/timeout cleanup | orphan 0 |

## 7. Report structure and accessibility — P11-RPT-04~22, P11-A11Y-01~05

| ID 범위 | 검증 묶음 | 기준 |
| --- | --- | --- |
| P11-RPT-04~06 | locale HTML·section order·TOC | 양 언어 동일 구조 |
| P11-RPT-07~09 | figure reference·caption·number | 누락·중복 0 |
| P11-RPT-10~12 | page 1 verdict·metrics·scope | 필수 marker 100% |
| P11-RPT-13~15 | limitation·not-verified·unsupported | 표지·본문·부록 일관 |
| P11-RPT-16~18 | table header·page break·footer | orphan/overflow 0 |
| P11-RPT-19~20 | searchable text·metadata | 핵심 text 추출 가능 |
| P11-RPT-21 | deterministic ordering | 동일 snapshot 순서 일치 |
| P11-RPT-22 | detailed appendix completeness | trace row coverage 100% |
| P11-A11Y-01~02 | color-independent status·contrast | text/shape label, 기준 contrast |
| P11-A11Y-03~04 | heading/table/figure semantics | 구조 marker 완비 |
| P11-A11Y-05 | caption과 alt-equivalent text | required figure 7/7 |

## 8. PDF and visual rendering — P11-PDF-01~16, P11-VIS-01~20

| ID 범위 | 검증 묶음 | 기준 |
| --- | --- | --- |
| P11-PDF-01~03 | ko/en pair·atomic publish·manifest | partial complete 0 |
| P11-PDF-04~06 | A4·page footer·metadata | 전체 page 일치 |
| P11-PDF-07~08 | font·searchable text | Korean/English extraction PASS |
| P11-PDF-09~10 | HTML/PDF marker parity | 핵심 marker 손실 0 |
| P11-PDF-11~12 | actual page/bytes/hash | manifest 100% 일치 |
| P11-PDF-13~14 | browser fallback·CLI adapter | 거짓 PDF 성공 0, 공통 snapshot |
| P11-PDF-15~16 | temp cleanup·repeatability | orphan 0, 결과 metadata 안정 |
| P11-VIS-01~04 | cover/TOC/model/load page raster | clipping·overlap·tofu 0 |
| P11-VIS-05~08 | analysis/member/audit/appendix raster | clipping·overlap·black square 0 |
| P11-VIS-09~12 | ko/en full-page contact review | required pages 100% |
| P11-VIS-13~16 | visual diff baseline | 승인 tolerance 이내 |
| P11-VIS-17~18 | required figure legibility | label·legend 판독 가능 |
| P11-VIS-19~20 | page transition·blank page | 의도하지 않은 blank/orphan 0 |

## 9. Security and failure containment — P11-SEC-01~20, P11-FAIL-01~16

| ID 범위 | 검증 묶음 | 기준 |
| --- | --- | --- |
| P11-SEC-01~03 | capture 개인정보 제외 | cursor/notification/local path 0 |
| P11-SEC-04~06 | isolated Electron IPC | node 권한·임의 channel·navigation 0 |
| P11-SEC-07~10 | output path canonicalization | traversal/overwrite escape 차단 |
| P11-SEC-11~14 | HTML escape/CSP/static output | executable injection 0 |
| P11-SEC-15~17 | secret/path/tool marker scan | leak 0 |
| P11-SEC-18~20 | no-network·log redaction | 승인 없는 전송 0 |
| P11-FAIL-01~04 | 한 locale print 실패·timeout·cancel·disk full | false complete 0 |
| P11-FAIL-05~08 | font/image decode·corrupt PNG·stale snapshot | 명시 reason, publish 차단 |
| P11-FAIL-09~12 | permission denied·hidden window crash·IPC disconnect | cleanup/retry 정책 일치 |
| P11-FAIL-13~16 | manifest/hash mismatch·validation tool missing | release 차단 |

## 10. UI and API — P11-UI-01~12, P11-API-01~12

| ID 범위 | 검증 묶음 | 기준 |
| --- | --- | --- |
| P11-UI-01~03 | preflight·start·progress | hash와 상태 표시 |
| P11-UI-04~06 | cancel·failure reason·remediation | terminal 상태 정확 |
| P11-UI-07~09 | preview·output open·history | 실제 artifact 결속 |
| P11-UI-10~12 | browser fallback·accessibility·feature toggle | 지원상태를 과장하지 않음 |
| P11-API-01~03 | plan/run/status | UI와 동일 service |
| P11-API-04~06 | cancel/artifacts/history | manifest 일치 |
| P11-API-07~09 | validation·reason codes·redaction | 계약 schema 일치 |
| P11-API-10~12 | stale/unsupported/idempotency | false success·중복 job 0 |

## 11. Performance — P11-PERF-01~10

| ID | 검증 | 기준 |
| --- | --- | --- |
| P11-PERF-01 | export acknowledgement | ≤100 ms |
| P11-PERF-02 | first progress event | ≤500 ms |
| P11-PERF-03 | S-tier dual export p95 | ≤30 s |
| P11-PERF-04 | cancel acknowledgement | ≤2 s |
| P11-PERF-05 | peak working set | ≤1 GiB |
| P11-PERF-06 | PDF size | 각 ≤25 MiB 또는 승인 reason |
| P11-PERF-07 | PNG asset total | budget와 manifest 기록 |
| P11-PERF-08 | hidden window cleanup | terminal 후 0 |
| P11-PERF-09 | 3회 repeat variance | 원인 없는 큰 편차 없음 |
| P11-PERF-10 | M-tier preflight | memory/time estimate와 차단 이유 제공 |

## 12. End-to-end and release — P11-E2E-01~12, P11-REL-01~14

| ID 범위 | 검증 묶음 | 기준 |
| --- | --- | --- |
| P11-E2E-01~04 | office model→loads→analysis→capture | 전 단계 hash 결속 |
| P11-E2E-05~08 | ko/en HTML→PDF→manifest | pair complete |
| P11-E2E-09~10 | 3회 반복 parity | numeric/scene selection 100% |
| P11-E2E-11 | 실제 제품 UI 흐름 | PASS |
| P11-E2E-12 | Agent 흐름 | UI artifact와 동일 |
| P11-REL-01 | release manifest skeleton | M0에서 schema 고정 |
| P11-REL-02~05 | requirement/evidence/hash coverage | 누락 0 |
| P11-REL-06~08 | full regression/build/install smoke | green |
| P11-REL-09~10 | code review/debt/documentation | Critical/High 0, owner 없는 debt 0 |
| P11-REL-11~12 | artifact retention/cleanup | 정책 준수 |
| P11-REL-13 | Phase 10 eligibility 보존 | 상태 승격 drift 0 |
| P11-REL-14 | final release decision | 모든 필수 gate PASS일 때만 qualified |

## 13. Release 판정

필수 verification 중 `FAIL`, `BLOCKED`, 미실행 또는 hash 불일치가 하나라도 있으면
P11 report export를 `release-qualified`로 판정하지 않는다. 승인된 S2 `SKIP`만 예외다.

