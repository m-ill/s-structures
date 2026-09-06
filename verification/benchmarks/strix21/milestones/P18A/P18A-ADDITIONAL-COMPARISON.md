# P18A — 추가 수치비교 실행

기준일: 2026-08-29

## 결과

| 사례 | S-Structures 실행 | 공개 기준 | 판정 |
|---|---:|---:|---|
| SP1 pre-peak self-consistency 최대오차 | 0.017766% | ≤ 1% | PASS — 동등 판정기준 |
| P3S2 지배 membrane-mode 최대 주기변화 | 0.0002405% | ≤ 0.5% | PASS — 동등 판정기준 |
| XV1 M1 상단 평균변위 | 1.756790 mm | Program A 1.756792 mm | PASS |
| XV1 M16 상단 평균변위 | 1.823420 mm | Timoshenko 1.8277 mm | PASS, -0.234% |
| XV2 transfer-beam shear | - | 공유 MGT·복원 mapping 필요 | INPUT_BLOCKED |

## 판정 경계

- SP1과 P3S2는 공개 허용기준을 같은 종류의 생산 엔진 출력에 적용한 결과다. 공개 절대응답 전체의 동일성은 주장하지 않는다.
- P3S2는 공개 3 columns × 6 rows membrane 형상으로 실행했다. STRIX plate-mode와 literal `rotFloor` / `drillingStab` 단위는 동등하다고 주장하지 않는다.
- XV1·XV2는 Cross-Code Note의 추가 검증이며 공식 21개 분모와 분리한다.
- XV2는 PDF 표의 숫자를 역산해 모델을 꾸미지 않았다.

기계판독 근거: `p18a-additional-comparison-evidence.json`
