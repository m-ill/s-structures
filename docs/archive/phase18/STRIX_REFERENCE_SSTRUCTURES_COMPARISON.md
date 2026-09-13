# STRIX - Reference - S-Structures 비교 보고서

기준일: 2026-08-29

## 목적

DCR 공개 검증 페이지의 STRIX / Reference 대표값과 현재 로컬 evidence에서 확인되는 S-Structures 결과를 한 행에서 비교한다. 엔진 기능 구현, 동일 공개모델 수치비교, 외부 공식 qualification을 서로 다른 단계로 표시한다.

## 현재 판정

| 구분 | 결과 | 의미 |
|---|---:|---|
| 엔진 기능 경로 | 21/21 | 21개 문제에 필요한 핵심 수치 기능 경로가 내부 probe를 통과했다. |
| 직접 수치비교 | 13/21 | 공개 대표 물리량 또는 checkpoint를 S-Structures 출력과 직접 비교했다. |
| 동등 판정기준 | 2/21 | SP1 pre-peak self-consistency와 P3S2 안정화 민감도 허용기준을 적용했다. |
| 로컬 공학 PASS | 9 | SB1, SB2, SB3, SB5, SB6, SB7, SB8, SB9, SB10 |
| 수치 PASS / 적격성 보류 | 2 | PD1, SM5 |
| 엔진 체크포인트 PASS | 2 | SH1, TH1 |
| 기능 PASS / 동일모델 미완료 | 6 | SB12, SM5b, SM6, SR1, SR2, SR2b |
| 외부 공식 PASS 주장 | 0/21 | STRIX raw R4, MIDAS 동일모델 실행, 독립 custody를 수행하지 않았다. |

## 산출물

- 웹 보고서: `output/reports/strix-reference-sstructures-comparison/index.html`
- PDF: `output/pdf/STRIX_Reference_S-Structures_비교보고서.pdf`
- Markdown: `output/reports/strix-reference-sstructures-comparison/STRIX_Reference_S-Structures_비교보고서.md`
- 데이터: `output/reports/strix-reference-sstructures-comparison/comparison-data.json`, `comparison-data.csv`
- 무결성 매니페스트: `output/reports/strix-reference-sstructures-comparison/report-manifest.json`
- 브라우저 렌더 캡처: `output/playwright/strix-comparison-html/desktop.png`, `mobile.png`
- 추가 실행 근거: `verification/benchmarks/strix21/milestones/P18A/p18a-additional-comparison-evidence.json`

## 재생성

```powershell
python tools/generate-strix-reference-sstructures-report.py
```

생성기는 로컬 문제별 `execution-evidence.json`, P18 `p18-engine-result.json`, P18A 추가 실행 evidence를 읽는다. 21개 ID, 직접 비교 13개, 동등 기준 2개, 입력 미완료 6개와 evidence 파일 존재 여부가 계약과 다르면 생성을 실패시킨다.

## 판정 경계

DCR 페이지의 STRIX 21/21 PASS는 공개 페이지에 표시된 주장과 대표값의 출처다. 이 보고서가 STRIX를 독립 재실행해 확인한 결과가 아니다. S-Structures 숫자가 비어 있는 6개는 해석엔진 실패가 아니라 공개 입력 source lock이 남았다는 뜻이다. XV1은 별도 Cross-Code 사례로 M1~M16을 실행해 PASS했으며 공식 21개 분모에는 포함하지 않는다. XV2는 공유 MGT와 정확한 복원 mapping이 없어 보류했다.
