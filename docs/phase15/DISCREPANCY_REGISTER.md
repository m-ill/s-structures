# Phase 15 Discrepancy Register

```yaml
version: p15-discrepancy-register-v1
status: proposed
created_at: 2026-08-27
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
```

이 문서는 Phase 14 1차 비교와 후속 감사에서 확인된 차이를 추적한다. `OPEN`은 원인 분석이 끝났더라도 production 수정·시험·review evidence가 모두 닫히지 않았다는 뜻이다.

## 1. 등록 항목

| ID | Severity | 영역 | 발견 | 원인 분류 | Owner | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| P15-D001 | Critical | SB2·SB3 | `built.localMatrix`를 global DOF에 조립 | benchmark assembly defect | M3 | OPEN |
| P15-D002 | High | SB2 | 최종 메시 16×8로 reference 수렴 미달 | fixture/convergence defect | M3 | OPEN |
| P15-D003 | High | SB5 | 5:1 짧은 방향 6요소 | fixture/convergence defect | M4 | OPEN |
| P15-D004 | Critical | SB5·공통 | 512 DOF 이상 IC(0)-CG pivot 실패와 fallback 부재 | numeric infrastructure defect | M2 | OPEN |
| P15-D005 | Critical | SB6 | hard SS를 w-only soft SS로 실행 | boundary contract defect | M4 | OPEN |
| P15-D006 | High | plate | `width` 고정 정규화와 recovery shearFactor 누락 | workflow/result defect | M4 | OPEN |
| P15-D007 | Critical | SB7 | station 기준 단부력에서 `Kf·d` 누락 | production recovery defect | M5 | OPEN |
| P15-D008 | High | SB7·공통 | sparse solver residual과 평형 gate 불일치 | solve/audit contract defect | M2·M5 | OPEN |
| P15-D009 | Critical | P3S2-SS | 실제 재해석 없이 예정된 0%·MAC=1 | qualification false-positive | M6 | OPEN |
| P15-D010 | High | evidence | timestamp hash, `stableHash(null)`, 불완전 model hash | evidence integrity defect | M1 | OPEN |
| P15-D011 | Critical | SB10·metrics | `compareMagnitude`가 부호 오류를 숨김 | metric contract defect | M1·M7 | OPEN |
| P15-D012 | High | tests/report | 상태개수 snapshot과 generator 하드코딩 | verification governance defect | M1 | OPEN |
| P15-D013 | Medium | membrane result | 서로 다른 local stress component를 직접 평균 | production contour/recovery gap | M3 | OPEN |
| P15-D014 | High | stabilization | out-of-range parameter clamp와 실제 sweep 범위를 qualifier가 무시 | qualification contract defect | M6 | OPEN |
| P15-D015 | High | stabilization | dense/sparse unsupported-rotation 판정 owner 불일치 | numeric parity defect | M6·M8 | OPEN |
| P15-D016 | High | governance | Phase 14 baseline·manifest가 benchmark 시작 전 상태 일부 유지 | stale status/evidence defect | M0·M9 | OPEN |

## 2. 변경 금지 대상

다음 수치 kernel은 별도 독립 실패 증거가 생기기 전에는 discrepancy 해결을 이유로 변경하지 않는다.

- `shellElementMath.js`의 QM6-EAS compatible stiffness와 static condensation
- `shellElementMath.js`/`slabPlateMitc4.js`의 MITC4 bending·assumed shear 식
- `winklerLine.js`의 consistent Hermite `Kf=∫NᵀkN dx`
- SB2의 raw nearest-Gauss probe를 extrapolated corner 값으로 바꾸는 행위

이 파일을 수정해야 한다면 기존 discrepancy와 분리된 신규 ADR, 독립 patch test, 이전/이후 수치 비교와 구조전문가 승인이 필요하다.

## 3. Closure 규칙

각 discrepancy는 다음을 모두 만족해야 `CLOSED`다.

1. 실패 재현 test가 수정 전 red, 수정 후 green이다.
2. root cause와 수정 owner가 코드리뷰에 기록된다.
3. 단위·축·부호·probe·mesh·solver 경로가 evidence에 포함된다.
4. 관련 invariant·negative control·metamorphic·independent reference gate가 통과한다.
5. 영향 capability와 이전 결과가 stale 처리된다.
6. mandatory regression과 feature-off 무회귀가 통과한다.
7. Critical/High finding이 열려 있지 않다.

benchmark 한 행이 tolerance 안에 들어왔다는 사실만으로 discrepancy를 닫지 않는다.

## 4. 예상 정상화 기준

| ID | 최소 수치 gate |
| --- | --- |
| P15-D001·D002 | SB3 기준오차 ≤1%; SB2 기준오차 ≤3%; 같은 메시 STRIX 차이 ≤0.75%; rigid rotation invariance PASS |
| P15-D003·D004 | SB5 8행 각각 ≤1%; 3단계 이상 수렴; 모든 정련 level solve 성공 |
| P15-D005 | SB6 hard SS 6행 각각 ≤1%; hard/soft negative control PASS |
| P15-D007·D008 | SB7 처짐·모멘트 각각 ≤0.1%; station end closure·전체 평형·dense/sparse parity PASS |
| P15-D009·D014·D015 | 실제 정적 shift <0.5%, period shift <0.5%, MAC ≥0.99, energy gate, invalid sweep BLOCKED |
| P15-D010~D012 | 동일 계산 payload hash 결정성 100%, signed metric, stale/failed result PASS 금지 |

예상 정상화 값은 회귀 방향을 설명하기 위한 것이며 P15-M0에서 동결한 manifest를 대체하지 않는다.
