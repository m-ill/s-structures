# P8-M1 Code Review

```yaml
reviewed_at: 2026-07-11
milestone: P8-M1
status: PASS
critical_findings_open: 0
high_findings_open: 0
```

## 수정 완료 사항

1. generated semi-rigid/shell stiffness link가 modal lumped mass에 포함되지 않도록 명시적 massless 경계를 추가했다.
2. adapter identity 비교에 raw constraint 입력 hash뿐 아니라 최종 affine transform contract hash를 포함했다.
3. element-state deserialize가 serializer type/version envelope를 잃지 않도록 round-trip 계약을 수정했다.
4. state vector·energy·element history의 non-finite 값을 0으로 대체하지 않고 `STATE_VALUE_NONFINITE`로 차단했다.
5. member마다 전체 material/section 객체를 복제하지 않고 필요한 elastic snapshot만 descriptor에 저장하도록 축소했다.
6. 공통 support DOF 판정을 기존 선형 solver와 canonical constraint가 같은 함수에서 사용하도록 통합했다.
7. 선형·Direct P-Delta·modal 결과가 동일 canonical adapter identity를 기록하도록 연결했다.
8. 해석 실패 결과에도 성공 결과와 동일한 canonical adapter identity와 provenance를 남겨 진단 결과가 모델에서 분리되지 않도록 수정했다.
9. 하중조합마다 구조 domain을 재구축하지 않고 불변 canonical base에서 조합별 하중·hash만 파생하도록 변경했다. M30 성능 smoke는 변경 뒤 기준 한도 안에서 통과했다.
10. 누락 노드·부재를 참조하는 member/load가 production canonical domain에서 조용히 제거되지 않도록 `DOMAIN_REFERENCE_INVALID`로 차단했다. 기존 `validateBeforeSolve=false` 선형 호환 경로만 명시적 `skip-invalid` 정책으로 격리했다.
11. 동일 대상의 다중 하중과 mass/property 배열도 입력 순서와 무관한 hash·snapshot을 만들도록 전체 레코드 hash를 tie-breaker로 사용했다.
12. `endOffset`, `prescribed`, `prescribedDisplacement`를 constraint hash에 포함하고 hash 계약 버전을 갱신했다.
13. constraint 축약·확장 입력의 NaN/Infinity를 `CONSTRAINT_VALUE_NONFINITE`로 차단했다.
14. checkpoint element state의 serializer version이 현재 registry와 다르면 명시적으로 재시작을 거부하도록 수정했다.

## 검토 범위

- array-order 독립 domain hash와 source model 불변성
- rigid diaphragm·support·prescribed displacement의 affine constraint reduction
- local axis·offset·release와 실제 선형 element kinematics 일치
- generated object origin mapping과 mass ownership
- nested committed/trial deep isolation과 line-search branch 독립성
- atomic commit, rollback, cutback, checkpoint integrity, deterministic event sequence
- Phase 7 settlement, Direct P-Delta, modal/RSA 전체 회귀
- 다중 하중조합에서 canonical structural base 재사용과 조합별 load hash 분리
- invalid reference, non-finite constraint vector, serializer version mismatch의 fail-closed 동작

## 검증 결과

- `npm.cmd test`: 전체 milestone, Phase 7, Phase 8 회귀 PASS
- `npm.cmd run test:p8`: `NL-DOM-01~08`, `NL-STATE-01~07`, `NL-MEI-01~08` PASS
- `npm.cmd run test:p3docs`: 문서 참조 무결성 PASS
- `node tools/check-agent-contract.mjs`: Agent manifest/contract 정합성 PASS
- M30 product-hardening smoke: 484.02 ms, 허용 한도 5000 ms 이내

## 잔여 위험

- M1 element contract는 기반 계약이며 실제 state-dependent `Pint`·`Kt` element kernel은 P8-M2~M4 범위다.
- 기존 Phase 7 solver는 canonical snapshot과 동일한 support/diaphragm primitives를 사용하지만 MDOF nonlinear residual assembler는 아직 없다.
- large-model production Worker/WASM sparse backend와 bounded state buffers는 후속 성능 gate 대상이다.
