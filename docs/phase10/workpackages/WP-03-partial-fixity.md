# WP-03 — 부분강접 (회전스프링 단부)

```yaml
wp: WP-03
milestone: P10-M3
formulas: FORMULAS_AND_CRITERIA.md §3
depends: [WP-02]
```

## 배경 (기존 자산)

- 이진 release(`condenseReleasedDofs`)의 일반화. 같은 Schur 응축 패턴을 유한 스프링에 확장한다 —
  release 계약(`core/memberReleaseContract.js`)·벤치마크(`verification/memberReleaseBenchmark*`)가 회귀 기반.
- 스키마: `member.releases`에 `{ spring: { ryI, rzI, ryJ, rzJ } }` additive 확장 (기존 이진 release와 상호배타 검증).

## 구현 결과

1. **스키마·validation**: `releases.spring.{ryI,rzI,ryJ,rzJ}`를 frame 전용 유한 비음수 number로
   추가했다. 미지정 키는 강접, 명시적 `0`은 해당 축 release다. 같은 단부의 binary pin과 spring은
   `RELEASE_SPRING_CONFLICT`, axial-only member는 `RELEASE_SPRING_FRAME_REQUIRED`로 차단한다.
2. **강성·하중·복구**: 내부 spring 회전 DOF를 대각 평형화한 안정 Schur block으로 응축한다. `K`와
   consistent `f0`를 함께 보정하고, 실제 부재단 회전과 `p_s=k_s(u_s-d_s)` 모멘트 폐합을 같은
   transformation/loadOffset으로 복구한다. 응축 실패는 강접으로 fallback하지 않고 fail-closed한다.
3. **극한 경고**: `connection.stiffRatioWarn`/`releaseRatioWarn`의 `k_θL/EI` 기준으로
   `PARTIAL_FIXITY_RIGID_RECOMMENDED` / `PARTIAL_FIXITY_RELEASE_RECOMMENDED`를 solver summary에 남긴다.
4. **Timoshenko 결합**: WP-02의 Φ 보정 강성과 consistent fixed-end load를 그대로 응축한다. CN-F03은
   EB와 Timoshenko 캔틸레버 UDL 폐형해, 내부 회전 및 spring moment closure를 함께 검증한다.
5. **KG·비선형 경계**: 유한 spring Direct P-Delta는 raw prismatic KG 근사와
   `PARTIAL_FIXITY_PRISMATIC_KG_APPROXIMATION`을 명시한다. zero spring Direct P-Delta,
   global buckling, corotational/nonlinear는 각각 canonical reason code로 fail-closed한다.
6. **compute 계약**: element descriptor와 domain hash에 partial-fixity trace를 결속했다. DomainBinary v3는
   `[ryI,rzI,ryJ,rzJ]` Float64 배열과 presence bitmask를 사용해 absent 강접과 explicit-zero release를
   구분하며 pack/validate/unpack/hash round-trip을 고정한다.

## 게이트

- CN-F01(∞→강접 <1e-9) · CN-F02(0→release <1e-9) · CN-F03(폐형해 <1e-7).
- 기존 release·Timoshenko·compute 회귀 green 유지.
- 테스트: `tests/p10-m3-partial-fixity.mjs` · `tests/p10-m3-schema-contract.mjs` ·
  `tests/p10-m3-domain-route-contract.mjs` · `tests/p10-m3-evidence-contract.mjs`.
- Evidence: `reports/validation-evidence/phase10/p10-m3-partial-fixity.json` — 7/7 records PASS,
  artifact hash `aa4180cd16d91d6904a2db22`; `externallyCrossValidated=false`, `releaseQualified=false`.

## Review Log

| 날짜 | 지적 | 조치 | 상태 |
| --- | --- | --- | --- |
| 2026-07-21 | `0`을 falsy로 처리하면 release가 미지정 강접으로 바뀌고 compute round-trip에서도 구별할 수 없음 | own-property 기반 canonicalization과 DomainBinary v3 4-bit presence mask로 absent/explicit-zero를 분리했다. | PASS |
| 2026-07-21 | 단순 `K−KA⁻¹K` 구현은 k→∞ cancellation, 축별 극단 강성비는 거짓 singular를 만들 수 있음 | 대각 평형화 solve와 `K̄_RS=K_RS A⁻¹D`, `K̄_SS=D A⁻¹K_SS` 안정 block을 채택하고 retained block을 수치 대칭화했다. | PASS |
| 2026-07-21 | 강성만 응축하면 fixed-end load·실제 부재단 회전·station 복원이 다른 요소를 표현 | `f0` Schur 보정과 transformation/loadOffset 복구를 한 계약으로 묶고 spring moment/회전 closure를 검증했다. | PASS |
| 2026-07-21 | 강접 극한에서 절점·부재단 회전을 직접 빼면 작은 slip이 cancellation으로 소실 | `A⁻¹[K_SR,K_SS]` 기반 안정 상대회전 연산자를 별도 보존해 큰 k에서도 spring moment closure를 유지했다. | PASS |
| 2026-07-21 | partial-fixity Ke에 raw KG를 결합하거나 미지원 solver가 spring을 무시할 위험 | Direct P-Delta raw-prismatic 근사 limitation을 노출하고 zero-spring P-Delta, buckling, nonlinear 경로는 fail-closed했다. | PASS |
| 2026-07-21 | Timoshenko와 부분강접이 서로 다른 K/f0를 소비할 위험 | Φ 보정 K·consistent f0를 동일 응축기로 처리하고 EB/Timoshenko 폐형해를 CN-F03에서 함께 통과시켰다. | PASS |
| 2026-07-21 | 수치 PASS만으로 artifact 결속·release 자격을 오인할 위험 | 7개 record와 model/solver/tolerance를 evidence artifact에 고정하고 계약 테스트로 hash와 `externallyCrossValidated=false`·`releaseQualified=false`를 검증했다. | PASS |
