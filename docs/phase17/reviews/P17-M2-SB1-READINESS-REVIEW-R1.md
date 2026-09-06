# P17-M2 SB1 실행 준비 코드·산출물 리뷰 R1

## 판정

`CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL / BLOCKED_PRE_EXECUTION`

P17-M2의 실행 차단, 외부 신뢰, byte audit, replay, 물리/mutation, 결정론적 보고서 기반과 SB1 내용 잠금은 구현됐다. 공식 solver·benchmark는 실행하지 않았고, SB1 수치 PASS/FAIL과 release를 주장하지 않는다.

## 리뷰 결과

| 영역 | 결과 | 근거 |
| --- | --- | --- |
| 외부 trust | PASS fail-closed | 로컬 임시키·가짜 reviewer를 공식 자격으로 허용하지 않음; out-of-band pin 필수 |
| 실행 경계 | PASS fail-closed | 미승인 gate/lock에서 product adapter 호출 전에 차단 |
| source custody | PASS 3/3 | HTML, manual PDF, SB1 PDF exact byteLength/SHA-256 |
| reference | CONTENT READY | 고전식 full precision과 STRIX 공개 표시 lane 분리; R4 raw 미공개 표시 |
| model | CONTENT READY | canonical/native/model-equivalence 분리, silent defaults 명시 |
| comparison | CONTRACT PASS | identity-only extraction, signed-relative와 near-zero 정책 |
| physics/mutation | CONTRACT PASS | 부호, 평형, 에너지, subdivision, load reversal, 3회 결정론 계약 |
| report | PASS readiness-only | invariant PDF, 6/6 페이지 시각 검수, fake screenshot 0 |
| release | BLOCKED | 외부 registry/pin, 4개 reviewer attestation, 공식 3회 run 없음 |

## 모듈화 점검

- trust와 서명 검증: `verification/milestones/phase17/m2/framework/externalTrust.mjs`
- 원자료 exact-byte 감사: `referenceByteAudit.mjs`
- execution/terminal gate: `m2TerminalGate.mjs`
- 공식 intent/receipt와 제품 adapter 호출: `officialExecutionOrchestrator.mjs`
- extraction/comparison replay: `replayQualification.mjs`
- SB1 물리·mutation 계약: `sb1Qualification.mjs`
- SB1 deterministic lock builder: `sb1LockPackage.mjs`
- 보고서: Python renderer와 Node runtime launcher로 분리

검증 모듈은 제품 내부 solver를 deep import하지 않는다. 공식 orchestrator만 P17 product adapter를 통하며, 보고서 renderer는 committed evidence만 읽는다.

## 테스트 결과

- M2 readiness check + 3개 M2 test: PASS
- P17-M1 scaffold + validator + framework + extractor + boundary: PASS
- P17-M1 sealed R6 evidence byte-identity: `EXPECTED_STALE_AFTER_M2_INVENTORY_EXPANSION` (M2 파일 추가로 전역 verification inventory audit hash가 변경됨; R6는 덮어쓰지 않음)
- `npm.cmd run test:p15`: PASS
- `npm.cmd run check:public-imports`: PASS
- PDF invariant reproduction: PASS_BYTE_IDENTICAL
- PDF visual QA: PASS 6/6 NONBLANK

## 남은 차단 조건

1. externally controlled trust registry와 out-of-band SHA-256 pin
2. reference/model/numerical/release 독립 reviewer attestation
3. 승인된 lock 전환
4. 서로 다른 external custody에서 공식 제품 run 3회
5. 실제 결과·화면·comparison·physics replay와 terminal case report

이 항목은 로컬 개발자가 대신 만들 수 없고 문서화만으로 해소되지 않는다.
