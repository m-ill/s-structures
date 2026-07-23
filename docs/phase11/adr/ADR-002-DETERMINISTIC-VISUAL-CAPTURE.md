# ADR-002 — Runtime OS Screenshot 대신 결정론적 Canvas Evidence Capture

```yaml
adr: P11-ADR-002
status: accepted
date: 2026-07-23
decision_gate: P11-M0
accepted_at: 2026-07-23
```

## 배경

보고서에는 실제 프로그램의 모델·하중·변형·반력·이용률 화면이 필요하다. OS 전체화면이나
Playwright screenshot을 production runtime에 직접 사용하면 창 크기, 알림, 사용자 경로,
cursor, animation과 test dependency에 따라 결과가 달라진다.

## 결정

1. 제품 runtime은 versioned `CaptureSpec`으로 장면을 계획한다.
2. 기존 base canvas와 result overlay를 export canvas에 같은 frame으로 합성한다.
3. camera, viewport, pixel ratio, combo, layer, deform scale을 spec으로 고정한다.
4. 장면 아래 metadata strip과 legend를 제품 renderer가 합성한다.
5. PNG는 snapshot/model/result hash와 결속해 `EvidenceManifest`에 기록한다.
6. Electron `capturePage` 또는 고정 browser screenshot은 qualification 비교용으로만 사용한다.
7. 필수 장면의 blank·stale·size 실패는 report 발행을 차단한다.

## 대안

### A. OS 전체창 screenshot

- 장점: 사용자가 보는 창과 동일
- 단점: 개인정보, 창 chrome, notification, 비결정성 때문에 기각

### B. Runtime Playwright

- 장점: element screenshot이 편리
- 단점: 배포 크기·browser 관리·보안면·offline 의존 때문에 production runtime에서는 기각

### C. 보고서 전용 SVG를 새로 그림

- 장점: 선명하고 문서 친화적
- 단점: 실제 제품 scene과 별도 renderer가 되어 시각 결과가 달라질 수 있으므로 단독 경로로 기각

## 결과

- result scene owner는 기존 `indexResultVisuals`/`indexResultOverlay`를 재사용한다.
- capture 전후 view state 복원이 필수다.
- visual qualification은 compositor와 실제 element capture의 semantic/pixel 비교를 포함한다.
- capture profile 변경은 golden/evidence 갱신 사유를 요구한다.

## 승인 조건

P11-M0에서 합성 가능 layer, font/image readiness, qualification toolchain과 dependency를
확인한 뒤 `accepted`로 변경한다.

## 승인 기록

P11-M0에서 기존 `indexResultVisuals`/`indexResultOverlay`를 장면 데이터 owner로 유지하고,
base canvas와 overlay를 고정 `CaptureSpec`으로 합성하는 방식을 승인했다.
OS 전체창·runtime Playwright는 production capture 경로에서 제외하며 qualification 비교에만 쓴다.
한글 font/search/copy와 실제 element 비교는 M8 qualification gate로 유지한다.
