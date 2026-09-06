# Verification retention policy

검증 자산은 정본, 보존 산출물, 재생성 가능한 임시물로 구분한다.

| 영역 | 성격 | Git | 정리 정책 |
| --- | --- | --- | --- |
| `verification/specs/` | 기준·schema·허용오차 정본 | 추적 | 승인된 변경으로만 갱신 |
| `verification/evidence/` | milestone/run evidence | 추적 | 기존 run을 덮어쓰지 않고 append-only |
| `verification/benchmarks/` | reference와 benchmark run | reference는 추적, 대형 원본은 별도 정책 | 출처·버전·license·SHA-256 기록 |
| `output/verification/` | 사람이 전달받는 PDF·요약·내보내기 | 선별 추적 | run ID가 있는 최종본을 보존하며 자동 정리 금지 |
| `tmp/verification/` | inventory·중간 JSON·렌더 임시물 | 미추적 | `npm run clean:generated-temp`로 안전하게 재생성 |

`tmp/verification/`의 파일은 판정 정본으로 인용하지 않는다. 최종 판정에 사용한 결과는 고유 run ID와 함께 `verification/evidence/` 또는 `verification/benchmarks/**/runs/`로 승격한다. 자동 정리기는 저장소의 `tmp/` 경계 밖과 `output/verification/`을 삭제할 수 없다.
