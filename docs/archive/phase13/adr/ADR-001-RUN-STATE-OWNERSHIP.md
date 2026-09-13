# ADR-001: Analysis Run 상태 소유권

- 상태: 승인
- 날짜: 2026-08-05
- 범위: Phase 13

## 결정

Phase 13의 모델, 해석 조건, 결과, 보고서 및 Agent API는 하나의 불변 `Analysis Run` 레코드를 참조한다. 실행 레코드는 자체 해석 엔진 서비스가 생성하며 UI는 상태를 복제해 소유하지 않는다. 모델 또는 해석 조건 해시가 달라지면 기존 결과는 `stale`이 되고, 현재 결과처럼 표시하거나 설계 전달에 사용할 수 없다.

상태 판정의 기준 필드는 `runId`, `modelHash`, `caseHash`, `status`, `stale`이다. Workspace, viewport, results, report, calculation package, Agent API는 이 기준을 동일하게 투영해야 한다.

## 이유

기존 화면별 상태 복제는 같은 모델에서 서로 다른 결과가 보이는 위험을 만든다. 단일 실행 레코드를 사용하면 재현성, 검토 추적, 보고서 정합성 및 자동화 계약을 함께 보장할 수 있다.

## 결과

- P13-M1부터 모든 해석 실행은 단일 실행 저장소를 통과한다.
- 실패·취소 실행은 마지막 성공 결과를 덮어쓰지 않는다.
- 외부 solver 실행 경로는 추가하지 않는다.
- shell 실험 결과는 동일한 provenance를 쓰되 `shellDesignTransferAllowed=false`를 유지한다.
