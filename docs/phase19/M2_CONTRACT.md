# M2 — 탄성설계 입력 변경 계약

2026-09-07 · `p19-m2-design-input-v1` · 로컬 개발 범위

## 사용 경로

**탄성해석 → 설계 입력 변경**에서 입력을 변경안에 추가하고, 미리보기의 변경 전후 값·영향 부재·경고를 확인한 뒤 적용한다. 한 변경안의 여러 명령은 모두 성공할 때 한 번에 반영된다. **설계 입력 실행취소**는 해당 변경안 전체를 되돌린다. 기존 모델링 Ctrl+Z와 별도 이력이며, 다른 편집이 끼어든 뒤에는 덮어쓰지 않고 `UNDO_STALE`로 차단한다.

기존 7단계 설정창과 모델링 편집기를 대체하지 않는다. M2 패널과 아래 Agent API가 새로운 공통 입력 서비스의 진입점이다. WebMCP v1은 9개 도구를 유지한다. `preview_design_changes` 같은 Site tools 등록과 app host 연결은 M4에서 수행한다.

```js
const agent = window.SStructuresAgent;
const context = agent.getDesignInputContext();
const preview = agent.previewDesignInputChanges({
  requestId: 'project-a-design-input-001',
  units: context.units,
  commands: [
    { type: 'member-assignment', memberIds: ['M1'], matId: 'steel', secId: 'h300' },
    { type: 'member-design', memberIds: ['M1'], patch: { Ky: 1.2, Lb: 3, Cb: 1 } },
    { type: 'node-mass', nodeIds: ['N2'], mass: [2, 2, 2], unit: 'kN.s2/m' },
    { type: 'analysis-case', mode: 'create', id: 'AC-STATIC', name: '정적',
      kind: 'static', settings: { comboId: 'D1', pDeltaMethod: 'direct' } }
  ]
});
// M1 / N2 / D1 등 실제 모델에 존재하는 ID를 사용한다.
if (preview.ok) {
  const receipt = agent.applyDesignInputChanges(preview);
  // receipt.ok / changed / inputIdentity / undoDepth 확인
}
// agent.undoDesignInputChanges();
```

각 메서드는 동기 입력 편집이며 solver를 호출하지 않는다. 적용·실행취소 후 이전 결과는 무효로 표시한다. 계산은 별도의 명시적 해석 실행으로 수행한다. 새 설계 검토와 보고서 서비스 연결은 M3 범위다.

## 타입별 입력

모든 명령에 `type`이 필요하며 아래 범위 밖 필드는 오류다. `mode`는 `create` 또는 `update`다. 요청 단위는 `{length:'m', force:'kN', moment:'kN.m', stress:'N/mm2', displacement:'mm'}`이며 모델 단위도 일치해야 한다. 변환을 추정하지 않는다.

| type | 입력과 동작 |
|---|---|
| `design-basis` | `patch`: `occupancy`, `designMethod`(strength/allowable), floorArea/roofArea(m²), deadLoad/liveLoad/roofLiveLoad/windPressureX/Y(kN/m²), seismicCoefficientX/Y(g), seismicLiveLoadFactor, accidentalEccentricityRatio. 기존 designBasisChangeSet 재사용. 실제 하중 재생성은 별도 명령이다. |
| `generate-loads` | 추가 필드 없음. 현재 설계기준으로 기존 하중 생성기를 실행한다. 수동 하중을 보존하며, 같은 유형·방향·family의 수동 하중 케이스는 보존 경고를 표시한다. 의미 충돌은 차단한다. |
| `node-mass` | `nodeIds`, `mass:[mx,my,mz]`, `unit:'kN.s2/m'`. 기존 6자유도 질량의 회전 성분은 보존한다. |
| `mass-source` | `id`, `entries:[{case,factor}]`, 선택적 includeNodeMass/includeMemberMass/includeSelfWeight/activate(boolean), gravity(m/s²). 기존 massSourceChangeSet 재사용. 이 ID를 참조하는 해석 케이스의 질량원 정의도 갱신한다. |
| `load-case` | `mode,id,name,loadType`. dead/live/roofLive/wind/seismic/snow/rain/temperature/other. 수정 시 기존 유형 변경은 차단한다. |
| `load` | `mode,value`. 공통 id/type/case/dir/unit. nodal: node/P/kN, udl: member/w/kN/m, nmoment: node/M/kN.m, mmoment: member/M/at(0~1)/kN.m. dir는 ±x/±y/±z. 이외 하중 유형은 현재 명령에서 지원하지 않는다. |
| `combination` | `mode,id,name,purpose`(strength/service), `factors:{caseId:factor}`. 수동 조합이며 규칙 검토 승인을 부여하지 않는다. |
| `generate-combinations` | `rulePackId,method`(strength/allowable), 선택적 purpose. 기존 loadCombinationChangeSet의 승인·출처 조건을 그대로 검사한다. |
| `member-assignment` | `memberIds`, `matId` 또는 `secId`. 기존 재료·단면을 할당한다. 라이브러리 생성·편집은 포함하지 않는다. |
| `member-design` | `memberIds,patch`. frame 강재: Ky/Kz/Lb/LbZ/unbracedLength/Cb/C1/ltbK/deflectionLimitTotal/compressionSlendernessLimit. RC: cover(m), rebarFy(N/mm²), beamRebarRatio/columnRebarRatio. 재료에 맞지 않는 속성은 차단한다. |
| `analysis-case` | `mode,id,name,kind,settings`. 아래 탄성 종류만 지원한다. 기존 종류 변경과 legacy `input`이 별도로 존재하는 케이스의 수정은 명시적 mapping 전까지 차단한다. |

`Lb/LbZ/unbracedLength`, `C1/Cb`는 각각 같은 계산 입력의 별칭이다. 한 patch에서 별칭을 중복 지정하면 오류이며, 하나를 수정하면 이전 별칭을 정리하여 새 값이 우선순위 때문에 무시되지 않게 한다. RC의 명시적 As/AsZ/AsY/AsTotal이 있으면 철근비 수정은 차단한다. 자동 하중 생성은 프로젝트별 풍압·지진계수의 법규 적합성을 독립적으로 확인하지 않는다.

## 해석 케이스 설정

| kind | settings |
|---|---|
| static | comboId, pDeltaMethod(off/direct/legacy) |
| modal | modalModeCount, massSource, prestressed, gravityCombinationId |
| responseSpectrum | modal 설정 + spectrum:{method(SRSS/CQC), directions(x/y/z 배열), dampingRatio, scale, points:[{period,sa}]} |
| buckling | modeCount, maxIterations, preloadCombinationId |
| linearTha | integration(direct/modal), modalModeCount, direction, dampingRatio, dt, accelerations, accelerationUnit(m/s2/g), accelerationScale, timeUnit(s), massSource |

`massSource` 입력은 기존 질량원 **ID**다. 실제 solver가 받는 정의 객체로 변환해 저장한다. 스펙트럼 주기 단위는 초, Sa는 g, scale은 통상 9.80665이며 명시적으로 입력한다. 스펙트럼 points는 주기 순으로 정렬되어야 한다. 선형 THA의 수정도 integration/direction/dampingRatio/dt/accelerations/accelerationUnit/timeUnit을 함께 제공한다. 비선형 case 종류와 현재 표에 없는 고급 설정은 성공으로 누락시키지 않고 거부한다.

## 변경안과 적용 정책

- 미리보기: sourceIdentity(`p19-input-v1`), sourceRevision, units, memberDesignUnits, affectedMemberIds, changes(path/before/after), warnings. 영향을 좁히기 어려운 프로젝트 설정은 전체 부재를 표시한다.
- 미리보기는 서버/브라우저 내부에 발급 기록을 보관한다. 수정된 응답, 임의 ID, 다른 프로젝트 객체, 오래된 입력은 적용하지 않는다. 외부 정책과 참조 라이브러리도 적용 직전에 다시 검사한다.
- 모든 명령을 모델 복제본에 적용하고 전체 validateModel을 통과한 뒤 기존 model transaction으로 한 번에 커밋한다. 쓰기 불가능한 객체는 첫 변경 전에 차단한다.
- 기존 workflow locked/released 상태를 재사용한다. 서비스 호스트는 추가 `canEdit` 판정을 제공할 수 있다. 원격 프로젝트 저장의 인증·역할 검사는 기존 서버 정책을 따른다.
- 에이전트 요청은 reviewer, projectApproval, approvalProvenance, 상태 서명을 받지 않는다. 후보 KDS 팩은 기본적으로 차단된다. 기존 프로젝트 검토 화면을 사용해야 하며, 명령이 임의 검토자를 만들지 않는다. 서비스의 규칙·검토 resolver는 신뢰하는 호스트 구성 전용이며 in-page Agent 입력으로 노출하지 않는다.
- 같은 requestId·같은 발급 preview의 재적용은 이전 영수증과 replayed:true를 반환하고 중복 변경하지 않는다. 다른 내용의 같은 requestId는 충돌한다. Undo 이후 재적용도 undone:true인 기존 영수증을 반환한다. 새 작업에는 새 requestId를 쓴다.
- 요청 1MiB, 명령 1~100개, 대기 preview 64개(FIFO), 적용 requestId 256개, Undo 20단계 한도다. 이력은 페이지 세션 범위이며 저장/복구는 M8에서 확장한다.
- 적용·Undo마다 `meta.p19InputRevision`을 증가시킨다. Undo로 물리 입력이 돌아가더라도 이전 계산 결과를 자동으로 최신으로 승격하지 않는다.

## 검증과 증거

고정 회귀 목록: [m2-tests.json](../../verification/specs/phase19/m2-tests.json). 최종 판정과 source commit은 [진행 상태](IMPLEMENTATION_STATUS.md)에 기록한다.

```sh
node tools/run-p19-validation.mjs output/phase19/m2-new-run --manifest=verification/specs/phase19/m2-tests.json
```

커밋된 소스 ZIP을 새 checkout에 풀어서 실행한다. 기존 evidence 출력은 덮어쓰지 않는다. 강재·RC 폼 이벤트 시험과 실제 브라우저 스모크는 구분한다. 이 검증은 M2 입력 계약의 검증이며 전체 WebMCP 설계 워크플로·새 수치 엔진·생산 자격 검증은 아니다.
