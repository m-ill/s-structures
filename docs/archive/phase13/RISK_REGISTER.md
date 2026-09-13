# Phase 13 Risk Register

```yaml
version: p13-risk-register-v1
status: planned
reviewed_at: 2026-08-05
```

## 1. 평가 규칙

- Severity: Critical / High / Medium / Low
- Likelihood: High / Medium / Low
- Critical 또는 High가 open이면 의존 milestone qualification을 차단한다.

## 2. 위험 목록

| ID | 위험 | S | L | 완화·검증 | 닫는 단계 |
| --- | --- | --- | --- | --- | --- |
| P13-R01 | 여러 result store가 서로 다른 run을 표시 | Critical | High | single run owner, mixed-run rejection, parity E2E | M1 |
| P13-R02 | 입력 변경 후 stale 누락으로 과거 결과를 current로 사용 | Critical | High | hash dependency, stale fixture, export gate | M1 |
| P13-R03 | 자동 repair가 구조 의도를 바꿈 | Critical | Medium | safe allowlist, preview, manual-only class, undo | M2 |
| P13-R04 | Model Check blocker false green | Critical | Medium | pathological battery, independent expected issues | M2 |
| P13-R05 | slab/generated load 재적용 중복·질량 이중계상 | Critical | Medium | generated key, qA/mass audit, reapply test | M3 |
| P13-R06 | unit·axis·sign 변환 오류 | Critical | Medium | typed unit/axis, mapping trace, parity fixtures | M3~M7 |
| P13-R07 | 미확인 KDS 값을 approved로 표시 | Critical | Medium | source hash, candidate state, reviewer approval | M4 |
| P13-R08 | KDS 기준개정 후 과거 프로젝트 재현 실패 | High | Medium | immutable pack snapshot, diff/migration | M4 |
| P13-R09 | Phase 10 고급 field UI가 schema presence/zero를 손실 | High | Medium | UI/model/Agent parity, round-trip | M5 |
| P13-R10 | 대량 grid 편집의 부분 적용·reference 손상 | High | Medium | atomic transaction, reference-safe rename | M5 |
| P13-R11 | 결과 table·3D·report가 다른 집계를 사용 | Critical | Medium | canonical result query/governing index | M6 |
| P13-R12 | result UI 대형 데이터로 main thread 정지 | High | Medium | virtualization, worker aggregate, perf gate | M6 |
| P13-R13 | MGT 미지원 record를 조용히 유실 | Critical | High | subset freeze, unsupported audit, commit blocker | M7 |
| P13-R14 | hostile import/report 문자열이 코드·경로로 해석 | Critical | Medium | resource limit, escape, no subprocess/macro | M7 |
| P13-R15 | shell experimental 결과를 설계 가능으로 오인 | Critical | High | eligibility quarantine, watermark, API/report guard | M8 |
| P13-R16 | shell 외부 검증 지연이 Core release를 무기한 차단 | High | High | independent capability flag/release lane | M8~M9 |
| P13-R17 | 새 UI가 기존 project·workflow를 깨뜨림 | High | Medium | additive migration, legacy adapter, feature flag | M1~M9 |
| P13-R18 | 접근성·작은 화면 회귀가 실무 사용을 차단 | High | Medium | 1280×720/zoom/keyboard/NVDA gate | M1~M9 |
| P13-R19 | 성능 목표를 위해 수치 integrity를 희생 | Critical | Low | numeric gate first, no silent approximation | 모든 단계 |
| P13-R20 | 외부 solver가 reference 목적에서 runtime dependency로 유입 | Critical | Low | dependency/process/network audit invariant | M0, M9 |
| P13-R21 | evidence가 dirty source·다른 build와 결속 | High | Medium | revision/build/artifact hash validator | 모든 단계 |
| P13-R22 | 실제 파일럿 사용자·fixture 미확보 | High | Medium | owner input early, pilot flag false 유지 | M0, M9 |
| P13-R23 | 범위가 비선형·도면·설계로 팽창 | High | High | Phase charter, change control, separate ADR/phase | 모든 단계 |
| P13-R24 | 기존 사용자 변경과 Phase 13 변경이 섞임 | High | Medium | baseline status, isolated commits, overlap review | M0~M9 |

## 3. Critical stop conditions

- current/stale 또는 run ID가 제품 표면마다 다름
- repair/load/bulk/import 실패 뒤 model hash가 달라짐
- unit/axis/sign/source 없는 값이 정상 결과로 노출됨
- KDS source·approval 없이 verified 또는 final 표시
- MGT unsupported record 유실
- shell design-transfer guard 우회
- 외부 solver process/network runtime route 발견
- 기존 fixture 수치가 설명 없이 바뀜
- required evidence 누락·timeout을 PASS 처리

## 4. Architecture decision trigger

다음 변화는 ADR과 사용자 승인이 필요하다.

- Analysis Run public schema 또는 current pointer 방식 변경
- 새 production runtime dependency·worker/backend·database
- MGT 지원 subset 확대와 근사 mapping
- KDS procedure source/rounding/branch 정책 변경
- shell verified route, design-transfer 또는 WebGPU 승격
- backward-incompatible project schema migration
- Core claim profile과 final design-transfer 문구 변경

## 5. 잔여 위험 수용

Medium/Low 위험은 owner, mitigation, 재검토 milestone과 사용자 영향 문구가 있어야 수용할 수 있다.
공학 source·external validation 부족은 문구만으로 닫지 않고 capability를 BLOCKED/REVIEW로 유지한다.
