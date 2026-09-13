# Phase 13 Elastic Review Workspace UX Specification

```yaml
version: p13-elastic-workspace-ux-v1
status: planned
reviewed_at: 2026-08-05
```

## 1. UX 목표

구조기술자가 모델의 현재 상태를 잃지 않고 `입력 → 검사 → 해석 → 지배결과 → 산출물`을 이동한다.
마법사, 표와 3D 화면이 서로 다른 설정이나 결과를 보여주지 않는 것이 시각적 완성도보다 우선한다.

## 2. 기본 화면

```text
[Project | Model | Loads | Analysis | Results | Report] [▶ Run] [● Current / ○ Stale]
[Model·Case Tree] [          3D / 2D Viewport          ] [Context Inspector·Legend]
[Issues | Results Table | Run Log | Review Actions — bottom drawer]
```

### 상단

- 현재 workspace, active case/combo, Run, current/stale/blocked와 global undo/redo
- 결과 상세·보고 명령은 context panel 또는 두 번째 행으로 이동
- 상태 label은 run ID 축약, 완료시각과 stale reason detail을 제공

### 좌측 Tree

- Stories, Nodes, Members, Slabs/Panels, Diaphragms, Load Cases, Mass Sources, Combinations
- visibility, lock, isolate, search와 issue/result badge
- 큰 collection은 lazy/virtualized rendering

### 중앙 Viewport

- modeling/load/result layer와 selected/extreme/issue focus
- view preset, fit, local axes, support/release/offset/rigid link glyph
- load tributary, CM/CR, result legend overlay

### 우측 Inspector

- 선택 객체의 model properties 또는 result values
- field source, unit, validation, Preview/Apply/Cancel
- local/global, sign, case/combo, governing와 qualification

### 하단 Drawer

- Issues, Results Table, Run Log, Review Actions
- row 선택과 viewport focus 양방향 연결
- drawer가 닫혀도 blocker/current 상태는 상단에 남음

## 3. 주요 사용자 흐름

### 신규/기존 모델

1. 프로젝트 열기
2. run current/stale 확인
3. Model Tree에서 층·부재 선택
4. Inspector 또는 grid로 편집
5. Check Center에서 blocker 해결
6. Run → Results → Package

### 하중·질량

1. case/source 선택
2. table 또는 panel로 값 입력
3. viewport tributary·direction 확인
4. totals/residual·mass center 확인
5. Preview diff → Apply → stale

### 문제 수정

1. issue filter
2. row 클릭→select/isolate/zoom
3. 원인·rule·affected run 확인
4. safe repair preview 또는 manual inspector
5. Apply→rescan→Run

### 결과 검토

1. Overview에서 blocker/stale/equilibrium/governing 확인
2. Story/Member/Dynamics tab으로 이동
3. row/chart 클릭→3D focus
4. case/combo·unit·sign·source 확인
5. Review Action 또는 package에 포함

## 4. Preview·Apply 공통 규칙

- dirty field와 적용된 field를 구분한다.
- Preview는 base model hash, 영향 객체 수, validation과 stale impact를 보여준다.
- base hash가 변하면 Apply를 차단하고 preview를 다시 만든다.
- 실패는 부분 적용하지 않고 focus를 첫 오류로 이동한다.
- Undo 후 이전 model hash·selection context를 복원한다.

## 5. 상태 표현

| 상태 | 표현 |
| --- | --- |
| Current | green/blue accent + `CURRENT` text + run ID |
| Stale | amber + `STALE` + reason count |
| Blocked | red + `BLOCKED` + blocker count |
| Failed | red outline + `FAILED` + recovery action |
| Historical | neutral + `HISTORICAL` + revision/time |
| Preliminary | purple/amber + `PRELIMINARY` |
| Experimental | hatched/watermark + `EXPERIMENTAL` |

색만으로 구분하지 않고 text·icon·shape를 함께 사용한다.

## 6. 반응형·화면 규칙

- 1920+: 3-column + drawer
- 1366/1280: tree·inspector width 제한, drawer overlay 가능, 핵심 top status 유지
- 1024: tree/inspector 중 하나를 contextual overlay로 전환
- 720 이하: review-only compact mode; 대량 modeling은 안내 후 제한 가능
- 200% zoom과 Windows 150% scale에서 Run/Current/Blocker가 숨지 않음

## 7. 접근성

- landmark, heading, tab, treegrid, grid와 dialog semantics
- keyboard shortcut은 discoverable help와 충돌검사
- focus trap은 modal에만 사용하고 종료 후 trigger로 복귀
- async run·stale·failure는 과도하지 않은 live region
- chart마다 table/summary, tooltip 값은 keyboard로 접근
- target 최소 24×24 CSS px, drag action에 button/menu 대안
- contrast AA, reduced motion와 high-contrast 검토

## 8. 오류·빈 상태

- `0`과 `없음`, `미실행`, `미지원`, `계산실패`를 구분한다.
- empty panel은 필요한 입력과 직접 이동 action을 제공한다.
- legacy/historical result는 current처럼 보이지 않는다.
- result renderer 실패 시 raw run을 훼손하지 않고 Retry/Download Diagnostics를 제공한다.
- shell/THA 등의 제한은 진입·결과·report에서 동일하게 보인다.

## 9. UX qualification

- 핵심 작업 keyboard-only 완료
- 1280×720 잘림·가로스크롤 0
- issue/result row click이 정확한 object를 선택
- Preview와 Apply diff parity 100%
- status contradiction 0
- 사용자 pilot task/시간/finding은 WP-09 기준을 통과
