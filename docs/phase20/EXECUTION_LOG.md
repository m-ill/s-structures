# Phase 20 실행 기록

## 2026-09-08 · M0 착수

- 개발 브랜치 `work/phase20-boundaries-20260908`, 계획 기준 `131a2b3`, 수치 기준 `07b3e93`.
- 추적 파일의 작업 트리가 깨끗함을 확인했다. 기존 untracked 실행 자료와 사용자 파일을 보존한다.
- 공개 export·manifest·실제 import 소비자·아키텍처·동기 탄성 7개 입력의 결과를 별도 baseline harness로 고정한다.
- 허용 비교 제외 필드는 실행 시간/시각 metadata만 명시하고, snapshot 32개/16 MiB 상한 및 전후 3회 성능 10% 회귀 예산을 고정했다.

후속 항목은 실제 실행과 판정을 끝낸 후 이어 기록한다.

## 2026-09-08 · M0 기준선 고정

- `p20-baseline.mjs`로 public export/manifest·소비자 59건·원시 아키텍처와 7개 탄성 입력 결과를 고정했다. 각 artifact hash는 `verification/evidence/phase20/m0/hashes.json`에 있다.
- R1은 새 검증 fixture의 방향 `x`가 canonical `+x`가 아니어서 실패했다. 엔진 변경 없이 fixture를 수정한 R2에서 7개 실행을 완료했다. R1의 부분 출력은 로컬 `output/phase20/m0-r1`에 보존했다.
- 필수 회귀는 기존 95개와 확인된 11개 추가 시험을 합친 106개에서 출발한다. 새 경계 시험은 이후 단계에서 manifest에 추가하고 최종 후보에서 고정한다.
- 스냅샷·성능·호환 예산은 `verification/specs/phase20/contracts.json`에 기록했다. M0는 기준선 준비 완료이며 신규 후보 PASS는 아니다.
