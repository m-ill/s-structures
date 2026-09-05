# P17-M0 Baseline & Source Lock 검증 보고서

```yaml
report: P17-M0-BASELINE-SOURCE-LOCK-REPORT-R2
audit_date: 2026-08-28
status: COMPLETE_WITH_SOURCE_BLOCKERS
baseline_hash: 06aed261d00b98c04317df8a5fd8ea33373229cbf55cc9ca8b7d65d623802e81
m1_entry_allowed: true
release_allowed: false
final_design_transfer_allowed: false
solver_runs_performed: 0
phase17_inherited_pass_count: 0
```

## 1. 판정 요약

P17-M0의 원자료 custody·판본 역할·역사 baseline 동결은 기술적으로 완료했다. 상태는 `PASS`가 아니라 `COMPLETE_WITH_SOURCE_BLOCKERS`다. 8개 기술 gate는 통과했고, 독립 reviewer 승인과 STRIX raw runtime provenance는 release-only blocker로 남았다. 따라서 P17-M1 framework 개발은 시작할 수 있지만 21개 사례 검증 완료, STRIX actual R4, MIDAS 교차검증, 제품 release 또는 최종 설계 전이는 주장할 수 없다.

이번 마일스톤에서는 S-Structures 해석기와 UI를 실행하지 않았다. 모델·결과 화면이 존재한다고 꾸미지 않았으며, 보고서의 화면 증거는 STRIX 원자료 목차와 SH1 PDF clipping 확인 화면뿐이다.

## 2. 범위와 비범위

- 수행: 공식 21개 ID·순서, source SHA-256, manual/PDF/HTML/catalog 역할, reference lane, claim vocabulary, 승인 역할, Phase15 현재본 snapshot, discrepancy 등록
- 미수행: 모델링, solver 실행, tolerance 승인, STRIX/MIDAS actual export, Chrome 제품 캡처, 사례 PASS
- custom: `P3S2-SS`는 공식 분모 밖에 유지

## 3. 원자료 custody

| 항목 | 결과 |
| --- | --- |
| source root | `STRIX-verification-21` |
| checksum manifest | `9cda48bab7c0fdb3e28a6407756c872224b571fd8c67927ec63a58105f4c47c9` |
| 선언/검증 | 51/51 |
| source lock | 21/21 |
| registry hash | `de4b442ab56af5b14a907d320b85281a04b3f66ab5f75f9073a3f563df09f79c` |
| source-lock aggregate hash | `7dff89b608f1d15408f4167d04ef072b89d1b1480fdf1bb05406f21b633bb4cb` |
| discrepancy hash | `45cc3d826f39a90a6d7614da58a18b11b817c9c10be271e73d118684a2f0e6a9` |
| license | Internal / All rights reserved; 공개 다운로드를 재배포 허가로 해석하지 않음 |

checksum 목록 밖 3개 파일은 manifest 자기 자신, 로컬 Phase15 결과 메모, Python cache로 분류했고 source authority에서 제외했다.

## 4. 판본과 권위 정책

| 역할 | 정본 | 허용 주장 |
| --- | --- | --- |
| Acceptance truth | 원 출전 R1/R2 또는 승인된 독립 R3 | 독립 기준 비교 |
| STRIX published result | case HTML v1.0.4 hash | 공개 페이지에 표시된 값 |
| Archival narrative | 통합 manual·개별 PDF v1.0.2 | 문서 서술·페이지 인용 |
| Runtime provenance | raw record+archive+published SHA | 현재 BLOCKED |
| Catalog | HTML 파생 index | 검색·전사 보조, 추가 authority 없음 |
| MIDAS | 실제 동일 모델 raw export | 현재 NOT AVAILABLE |

manual과 개별 PDF는 v1.0.2이며, v1.0.4 표기는 HTML과 파생 catalog에만 있다. 모든 HTML의 raw record SHA는 `(pending publish)`다.

## 5. 공식 21개 source lock

| # | ID | 대상 | Ref lane | Tol. | 첫 공개 결과 (STRIX / Ref.) | 특이사항 |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | `SB1` | Euler-Bernoulli 1D cantilever (tip deflection) | `R1_R2_EXTERNAL` | 1% | Tip deflection u_z (mm): −0.107865 / −0.107865 | raw SHA pending |
| 2 | `SB2` | NAFEMS LE1 elliptic membrane (tangential edge stress at D) | `R1_R2_EXTERNAL` | 3% | Tangential edge stress sigma_yy at D (MPa): 90.8514 / 92.7 | raw SHA pending |
| 3 | `SB3` | Cook's membrane (skew panel, in-plane bending on a distorted mesh) | `R1_R2_EXTERNAL` | 3% | Normalized tip displacement u_Q*E*t/P (mid loaded edge) (norm.): 23.9578 / 23.91 | raw SHA pending |
| 4 | `SB5` | Rectangular plate bending — thin plate, uniform & central point load | `R1_R2_EXTERNAL` | 2% | Deflection coefficient α: 0.00406 / 0.00406 | raw SHA pending |
| 5 | `SB6` | Thick rectangular plate bending — transverse shear, uniform load | `R1_R2_EXTERNAL` | 0.5% | Deflection coefficient α: 0.004068 / 0.004071 | raw SHA pending |
| 6 | `SB7` | Simply-supported beam on a Winkler elastic foundation (CSI 1-013) | `R1_R2_EXTERNAL` | 0.05% | Center deflection Uz (in): −0.089333 / −0.089333 | raw SHA pending |
| 7 | `SB8` | Deep simply-supported beam — shear-flexible (Timoshenko) natural frequencies | `R1_R2_EXTERNAL` | 0.05% | Natural frequency f₁ (Hz): 102.149374 / 102.149414 | raw SHA pending |
| 8 | `SB9` | Rigid steel portal frame under UDL — bending + axial deformation (CSI 1-018) | `R1_R2_EXTERNAL` | 0.05% | Midspan deflection Uz — combined (axial+bending) (mm): −69.3655 / −69.372833 | v1.0.4/v1.0.2 provenance |
| 9 | `SB10` | Asymmetric determinate two-bar truss (brace axial force) | `R1_R2_EXTERNAL` | 0% | Brace E1 axial N (N): 10000 / 10000 | tolerance precision blocked |
| 10 | `SB12` | Elastic Link (twoNodeLink) Beta Angle coordinate transformation — inclined 6-DOF spring | `R3_INDEPENDENT_RECONSTRUCTION_REQUIRED` | 0.01% | Oblique Ux (mm): 0.152961 / 0.152961 | v1.0.4/v1.0.2 provenance |
| 11 | `PD1` | Tension stiffening via P-Delta analysis (CSI 1-016) | `R1_R2_EXTERNAL` | 0.1% | Uz (no tension) (in): −1.041614 / −1.041667 | v1.0.4/v1.0.2 provenance |
| 12 | `SM5` | Bathe & Wilson eigenvalue problem — ten-bay nine-storey plane frame | `R1_R2_EXTERNAL` | 0.5% | Eigenvalue ω² (rad²/s²): 0.589538 / 0.589541 | raw SHA pending |
| 13 | `SM5b` | Rigid-diaphragm eigenvalue condensation — eccentric multi-storey building | `R3_INDEPENDENT_RECONSTRUCTION_REQUIRED` | 0.05% | Eigenvalue ω² (rad²/s²): 2070.118745 / 2070.117026 | raw SHA pending |
| 14 | `SM6` | ASME eigenvalue frame — 3-D fixed-base pipe frame with lumped joint masses | `R3_INDEPENDENT_RECONSTRUCTION_REQUIRED` | 0.05% | Eigenvalue ω² (rad²/s²): 506338.834586 / 506331.91595 | raw SHA pending |
| 15 | `SR1` | Response-spectrum analysis of a two-dimensional rigid frame | `R1_R2_EXTERNAL` | 1% | Period — mode 1 (s): 1.56213 / 1.562 | raw SHA pending |
| 16 | `SR2` | Response-spectrum analysis of a three-dimensional eccentric rigid-diaphragm frame | `R1_R2_EXTERNAL` | 1% | Period — mode 1 (s): 0.22705 / 0.2271 | raw SHA pending |
| 17 | `SR2b` | Response-spectrum analysis of a three-dimensional L-shaped braced frame | `R1_R2_EXTERNAL` | 1.5% | Frequency — mode 1 (Hz): 3.05908 / 3.0592 | raw SHA pending |
| 18 | `P3S2` | Custom stabilization parameter sensitivity (wall modal periods) | `R5_INTERNAL_SPEC` | 0.5% | Membrane · mode 1 (X 68%) (s): 0.050509 / 0.050529 | raw SHA pending |
| 19 | `SP1` | Pushover cantilever moment hinge (CSI 1-026, moment-hinge scope) | `R3_INDEPENDENT_RECONSTRUCTION_REQUIRED` | 1% | Tip Uz at Point1 (P=My/L, elastic boundary) (mm): 5 / 5 | v1.0.4/v1.0.2 provenance |
| 20 | `SH1` | DcrPMMHinge3d custom P-M-M column hinge — element-mechanics defense | `MIXED_EXTERNAL_INTERNAL_SPEC` | 0.01% | Uniaxial backbone, mid-hardening (kappa=0.5*thetaP) (N·mm): 1.125×10⁸ / 1.125×10⁸ | v1.0.4/v1.0.2 provenance; PDF 2 rows clipped |
| 21 | `TH1` | SDOF anchor for THA time integration (Newmark average-acceleration, dt convergence) | `R3_INDEPENDENT_RECONSTRUCTION_REQUIRED` | 0.01% | Peak relative displacement, zeta=5%, dt=0.003125s (finest) (mm): 200.783 / 200.786209 | v1.0.4/v1.0.2 provenance |

`P3S2`는 STRIX 내부 R5 사양이므로 외부 절대정확도 정본으로 사용하지 않는다. `SH1`은 외부 PMM surface와 내부 hinge 구현을 분리해 검토한다.

## 6. Phase15 역사 snapshot

| 산출물 | P15-M0 기록 | P17 현재 발견본 | 판정 |
| --- | --- | --- | --- |
| JSON | `b28f19955a7e0d0d5647bafe6f932e907d1a965ef17b295130ea900335854843` / 207,182 B | `b28f19955a7e0d0d5647bafe6f932e907d1a965ef17b295130ea900335854843` / 207,182 B | MATCH |
| Markdown | 미기록 | `11db3298ce6b7463dc8abfd511ed44821db622cf0f610e311a27994667fc90f1` / 13,998 B | NOT CAPTURED BY P15-M0 |
| PDF | `8a25f93ca6e0345b03da8c5923139d288baaefbf16f246ee87b16fcc936cbdc4` / 95,277 B | `a4e79daa5ded78f0b21dc97678f84787df5b96df81aef919b3a8cdc013c246ab` / 95,238 B | REGENERATED; OLD BINARY MISSING |

현재 세 파일은 P17 시점 관찰본으로 content-addressed archive에 복제했다. 현재 PDF를 원래 P15-M0 PDF로 재라벨링하지 않는다. 임시 6쪽 PDF도 판정 정본에서 제외한다.

## 7. Gate 결과

| Gate | 판정 | 설명 |
| --- | --- | --- |
| `P17-M0-G01` | `PASS` | official ID/order is exactly 21 |
| `P17-M0-G02` | `PASS` | custom P3S2-SS excluded |
| `P17-M0-G03` | `PASS` | source manifest 51/51 verified |
| `P17-M0-G04` | `PASS` | 21 per-case source locks hash-valid |
| `P17-M0-G05` | `PASS` | version authority precedence is explicit |
| `P17-M0-G06` | `PASS` | source discrepancies are registered |
| `P17-M0-G07` | `PASS` | Phase15 current artifacts frozen by content hash |
| `P17-M0-G08` | `PASS` | roles and claim vocabulary defined |
| `P17-M0-G09` | `BLOCKED_RELEASE_ONLY` | independent approvals complete |
| `P17-M0-G10` | `BLOCKED_RELEASE_ONLY` | STRIX raw runtime provenance available |

## 8. Discrepancy

| ID | 심각도 | 상태 | 내용 | 처분 |
| --- | --- | --- | --- | --- |
| `P17-D001` | HIGH | `CONTROLLED_BY_ROLE_PRECEDENCE` | manual/per-case PDF v1.0.2 versus HTML/catalog v1.0.4 | Use HTML only for the latest published result, PDF/manual for archival narrative, and independent source for acceptance truth. |
| `P17-D002` | HIGH | `OPEN_BLOCKER` | HTML engine label conflicts with run/archive v1.0.2 metadata | Do not call these cases v1.0.4 reruns until the raw record and archive are published. |
| `P17-D003` | HIGH | `OPEN_BLOCKER` | Raw record SHA and evidence archives are unavailable | Retain page hash as publication custody only. |
| `P17-D004` | MEDIUM | `OPEN_BLOCKER` | SB10 tolerance precision conflict | Do not approve a numeric tolerance until owner/raw-record confirmation. |
| `P17-D005` | MEDIUM | `CONTROLLED_BY_HTML` | SH1 individual PDF result table is clipped | Use HTML for published rows and retain PDF only as incomplete archival narrative. |
| `P17-D006` | LOW | `RESOLVED_BY_REGISTRY` | Catalog array order differs from manual order | Official ordinal is frozen to manual order=SB1,SB2,SB3,SB5,SB6,SB7,SB8,SB9,SB10,SB12,PD1,SM5,SM5b,SM6,SR1,SR2,SR2b,P3S2,SP1,SH1,TH1. |
| `P17-D007` | CRITICAL | `OPEN_HISTORICAL_PROVENANCE_GAP` | P15-M0 recorded PDF binary is missing and current PDF is a later regeneration | Preserve the current PDF as a P17-observed snapshot only; never relabel it as the P15-M0 binary. |
| `P17-D008` | HIGH | `OPEN_IMPLEMENTATION_DEBT` | Phase15 fixed output paths are writable despite append-only policy | P17 snapshots are content-addressed and overwrite-rejecting; legacy writers must not run during M0. |
| `P17-D009` | MEDIUM | `USE_RESTRICTED` | STRIX PDFs provide no redistribution license | Keep local custody references and hashes; do not redistribute source PDFs without permission. |

## 9. R1 → R2 정정과 증거 보존

R1 HTML parser는 한 페이지에 설명용 Engine 필드와 증거용 Engine 필드가 함께 있을 때 첫 항목을 선택했다. 이 때문에 `SB12, PD1, SP1, SH1, TH1`의 HTML engine version이 null이 됐고 자동 테스트가 실패했다. R1 파일은 삭제·덮어쓰기하지 않았다. R2는 마지막 evidence 필드를 선택하고 모든 R1 hash와 정정 사유를 `supersedes`로 연결한다.

## 10. 자동 검증과 negative path

```powershell
npm.cmd run evidence:p17:m0
npm.cmd run check:p17:sources
npm.cmd run test:p17:m0
npm.cmd run check:verification-layout
npm.cmd run check:test-taxonomy
npm.cmd run check:public-imports
```

전용 테스트는 21개 ID·ordinal·hash, 51/51 checksum, 6개 provenance conflict, SB10 tolerance blocker, SH1 clipping, Phase15 snapshot, release fail-closed를 확인한다. 임시 fixture에서 `HASH_MISMATCH`와 `PATH_ESCAPE`가 실제로 거부되는지도 확인한다.

## 11. 승인 역할과 남은 blocker

source custodian 자동 감사는 기술 완료됐지만 독립 reference/model/numerical/structural release reviewer는 미지정이다. 승인 hash가 없으므로 release gate는 닫힌다.

- `STRIX_RAW_RECORD_AND_EVIDENCE_ARCHIVE_NOT_PUBLISHED`
- `SIX_HTML_PAGES_HAVE_V1_0_4_ENGINE_WITH_V1_0_2_PROVENANCE`
- `SB10_TOLERANCE_PRECISION_UNRESOLVED`
- `SH1_PDF_RESULT_TABLE_CLIPPED`
- `P15_M0_RECORDED_PDF_BINARY_MISSING`
- `CURRENT_PDF_REGENERATED_AFTER_BASELINE_CAPTURE`
- `CURRENT_PDF_NOT_BOUND_TO_P15_M0`
- `P15_M0_MARKDOWN_NOT_CAPTURED`
- `INDEPENDENT_REVIEWER_APPROVALS_PENDING`

## 12. 결론과 다음 진입 조건

P17-M0 R2 baseline hash는 `06aed261d00b98c04317df8a5fd8ea33373229cbf55cc9ca8b7d65d623802e81`다. M0 기술 계약은 완료됐고 `m1EntryAllowed=true`다. 다음 단계는 결과값 없이 case contract·append-only writer·isolated runner·evidence/report schema를 검증하는 P17-M1이다. 공식 사례 실행은 P17-M2 SB1부터 WIP 1로 시작한다.

`releaseAllowed=false`, `finalDesignTransferAllowed=false`를 유지한다.

## 13. 정본 경로

- Evidence: `verification/evidence/validation/phase17/p17-m0-baseline-source-lock-r2.json`
- Registry: `verification/benchmarks/strix21/suite-source-registry-r2.json`
- Source locks: `verification/benchmarks/strix21/references/source-locks-r2/`
- Discrepancy: `verification/benchmarks/strix21/references/source-version-discrepancies-r2.json`
- Phase15 snapshot: `verification/archive/phase17-m0/phase15-current-snapshot/`

