# Phase 14 Requirements Traceability

```yaml
version: p14-traceability-v1
status: proposed
created_at: 2026-08-27
```

| Requirement | Milestone | Work package | Verification | Evidence 예정 |
| --- | --- | --- | --- | --- |
| P14-FR-SCOPE/GOV-* | M0, M11 | WP-00, WP-11 | P14-GOV-*, REL-* | p14-m0, release manifest |
| P14-FR-FND-* | M1 | WP-01 | P14-FND-*, SB7-* | p14-m1-winkler.json |
| P14-FR-THA-* | M2 | WP-02 | P14-THA-*, TH1-* | p14-m2-linear-tha.json |
| P14-FR-RSA-01~03 | M3 | WP-03 | P14-MC-*, SR2-* | p14-m3-modal-combination.json |
| P14-FR-MASS-*, RSA-04 | M4 | WP-04 | P14-MASS/RSA-REC/SR2B-* | p14-m4-6dof-rsa.json |
| P14-FR-SH-01~05 | M5 | WP-05 | P14-SHM-01~03, SB2 | p14-m5-membrane-stress.json |
| P14-FR-SH-02~05, STAB 일부 | M6 | WP-06 | P14-SHM-04~05, SB3 | p14-m6-membrane-distortion.json |
| P14-FR-SH-05~08 | M7 | WP-07 | P14-SHP-01~03, SB5 | p14-m7-thin-plate.json |
| P14-FR-SH-01~08 | M8 | WP-08 | P14-SHP-04~05, SB6 | p14-m8-thick-plate.json |
| P14-FR-STAB-* | M9 | WP-09 | P14-STAB-* | p14-m9-shell-stabilization.json |
| P14-FR-NL-* | M10 | WP-10 | P14-NL/SP1-* | p14-m10-pushover.json |
| P14-FR-AGENT-* | M1~M11 | 각 WP, WP-11 | surface parity | milestone + manifest |
| P14-NFR-* | M0~M11 | 모든 WP | invariant/failure/NFR/REL | 각 milestone + manifest |

## 상태 규칙

| 상태 | 의미 |
| --- | --- |
| planned | requirement·owner·verification이 존재 |
| implemented | production code와 focused test 존재 |
| integrated | engine-result-product surface 연결 |
| internally-verified | invariant·metamorphic 통과 |
| independently-qualified | frozen R1~R3 reference 통과 |
| cross-solver-compared | eligible R4 비교 완료 |
| release-allowed | migration·NFR·review·manifest 통과 |

M11 validator는 requirement 수와 mapping 수, orphan verification/reference, evidence source/build hash와 open finding을 기계적으로 검사한다.
