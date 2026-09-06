# WP-06 — 등가모델 Scope 명시 (옵션 B 확정)

```yaml
milestone: P6-M6
priority: 6
depends: —
decision: 오너 확정 2026-07-09 — 실 shell FEM 미개발, 등가모델 유지 + scope 전면 명시
```

## 결정
**실 shell FEM은 개발하지 않는다.** `src/solver/shell/quad4.js`가 스스로 *"not a certified production shell solver"*라 명시하듯, 벽체/슬래브는 등가 프레임/링크 모델로만 다루고 그 사실을 UI·문서·결과 경로 전부에 노출한다. 실 FEM 정식화는 [FORMULAS_AND_CRITERIA §6A](../FORMULAS_AND_CRITERIA.md#6-shell--등가모델-scope-wp-06-옵션-b-확정)에 이연 참고용으로만 보존한다.

## 기존 자산 (유지 + scope 표기 보강)
- `src/solver/wallSlabEquivalent.js` — 벽/슬래브 등가 전개.
- `src/solver/shell/shellAssembly.js` — `expandShellsToFrameLinks`.
- `src/solver/shell/quad4.js` — 강성/patch 계약(`runShellPatchTest`), 유지하되 실 FEM 아님을 계속 명시.

## 산출물
- `src/solver/shell/equivalentScope.js` — 벽/슬래브 결과에 부착할 scope 경고·허용/비허용 플래그(단일 책임).
- 모든 벽/슬래브 결과 객체의 `limitations`/`warnings`에 경고 문자열 주입, 비허용 결과 필드는 산출 자체를 차단.
- UI(결과 패널·계산서)에서 등가모델 배지·경고 노출.

## 허용 / 비허용 (FORMULAS §6B)
- **허용**: 전체 횡강성 근사 · 벽체 mid-pier 등가축력/전단/모멘트 · diaphragm load path 근사 · preliminary global analysis.
- **비허용(보고 금지)**: slab local bending stress · wall opening 주변 응력 · shell/local 설계용 collector/chord force 정밀산정 · punching shear · mesh 기반 stress contour · plate deflection 설계값 · slab strip design 자동화. WP-04의 반강체 diaphragm load-path force는 허용하되, 정밀 shell 설계값으로 표시하지 않는다.

## 필수 경고 문자열
```text
"This wall/slab result is based on equivalent frame/link model, not shell FEM."
```

## 수용 게이트 (임계값 = config `criteria.equivalentShell.*`)
1. 모든 벽/슬래브 결과 경로에 등가모델 경고 노출(회귀 테스트로 커버리지 강제).
2. 비허용 결과 필드 미출력(존재 시 fail).
3. §6B 등가검증: reference(상용 shell) 대비 **global drift error <5~10%, 층전단 <5%, 벽체 base moment <10%**, local stress 미보고.
4. scope 문서·UI 배지 완비.

## 검증 매트릭스 연결
[VERIFICATION_MATRIX](../VERIFICATION_MATRIX.md): SH01–SH05는 **실 FEM 이연으로 비활성**. 대신 등가검증(global drift/층전단/벽 moment) 회귀 케이스를 추가.

## 코드리뷰 체크
scope 경고 커버리지 · 비허용 결과 차단 정확성 · 문서 정직성 · 모듈 규모.

## Review Log
| 날짜 | 지적 | 조치 | 상태 |
| --- | --- | --- | --- |
| | | | |
