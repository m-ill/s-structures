# Phase 17 Discrepancy Register

정본은 `verification/benchmarks/strix21/references/source-version-discrepancies-r2.json`이다. 이 문서는 사람이 읽기 위한 요약이며, 판정은 R2 `registerHash=45cc3d826f39a90a6d7614da58a18b11b817c9c10be271e73d118684a2f0e6a9`를 따른다.

| ID | 심각도 | 상태 | 핵심 내용 |
| --- | --- | --- | --- |
| `P17-D001` | HIGH | CONTROLLED | manual·개별 PDF v1.0.2 대 HTML·catalog v1.0.4를 역할별 정본으로 분리 |
| `P17-D002` | HIGH | OPEN | 6개 HTML engine v1.0.4와 run/archive v1.0.2 metadata 충돌 |
| `P17-D003` | HIGH | OPEN | 21개 raw record SHA pending, record·archive 없음 |
| `P17-D004` | MEDIUM | OPEN | SB10 tolerance 0% 대 10^-6% |
| `P17-D005` | MEDIUM | CONTROLLED | SH1 PDF 결과 2행 clipping, HTML을 공개값 정본으로 사용 |
| `P17-D006` | LOW | RESOLVED | catalog 배열 순서와 manual 순서 차이를 registry ordinal로 고정 |
| `P17-D007` | CRITICAL | OPEN | P15-M0 기록 PDF 바이너리 소실, 현재 PDF는 약 3분 뒤 재생성본 |
| `P17-D008` | HIGH | OPEN | Phase15 고정 출력 경로가 writable하여 append-only 정책과 불일치 |
| `P17-D009` | MEDIUM | RESTRICTED | STRIX PDF 재배포 license 없음 |

모든 open 항목은 증거 없이 해소된 것으로 바꾸지 않는다. 상세 affected case, evidence와 disposition은 machine-readable register를 사용한다.
