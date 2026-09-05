# Phase 9 Artifact Retention

```yaml
version: p9-artifact-retention-v1
status: active
owner: src/compute/governance
```

## 커밋하는 산출물

- fixture 생성 규칙, 규모 요약과 입력 hash
- 수치 오차, raw timing sample, 메모리 요약이 포함된 milestone evidence
- 기존 증거의 경로, source revision과 artifact hash
- code review, 기술부채와 release manifest
- evidence를 재생성하고 검증하는 도구와 테스트

## 필요할 때 생성하는 산출물

- M/L 전체 materialized model JSON
- 브라우저 profiler trace와 GPU capture
- WASM 또는 shader 중간 build 파일
- 반복 실행의 상세 history와 디버그 로그

위 파일은 기본적으로 저장소에 커밋하지 않는다. 자격 판정에 필요하면 bounded 요약과 hash를 커밋하고 원본 보존 위치를 manifest에 기록한다.

## 금지 규칙

- 생성된 JSON evidence를 수동으로 수정하지 않는다.
- source revision이 없는 artifact를 자격 판정에 사용하지 않는다.
- 모든 iteration, element 또는 time-step 원시 이력을 제한 없이 커밋하지 않는다.
- synthetic kernel 시간을 실제 frame end-to-end 시간으로 표시하지 않는다.
- 재실행하지 않은 기존 증거를 현재 solver 실행 결과로 표시하지 않는다.

## 갱신 절차

1. milestone 전용 생성 명령을 실행한다.
2. schema validator와 artifact hash 검사를 통과시킨다.
3. 결과가 허용오차와 자원 예산을 충족하는지 검토한다.
4. code review artifact와 release manifest를 같은 milestone에서 갱신한다.
5. source revision이 commit 전 worktree라면 milestone commit hash로 추적 가능한 표기를 사용한다.
