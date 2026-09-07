# M0~M1 구현 계약과 재현

2026-09-07 · 신규 계산 기능과 WebMCP 설계 도구의 활성화는 M2~M4에서 진행한다.

## M0 기준선

- 작업 전 개발 커밋: `7bb55d7ec6bd6b155361b26b7830c70b45043acb`.
- 공개 기준선: `e18d5b432c780523496f8aad489b502934ae0ebd` (로컬 remote tracking 기준; 이번 작업에서 원격 변경 없음).
- 원본 소스 ZIP: `output/phase19/m0-baseline-20260907/source-before.zip`. 기존 검증 자료와 미추적 사용자 파일을 수정하지 않았다.
- 새 아키텍처 감사: `output/phase19/m0-baseline-20260907/architecture-before.json`. 감사기 자체가 검출한 import finding은 High 41건(UI 수치 직접 의존 40, report→solver 1)이다. 이전 문서의 High 52건을 현재 건수로 복사하지 않았다. compatibility 등 별도 gate는 원본 JSON을 참고한다.
- 신규 자동 inventory 명령: `node tools/run-p19-baseline.mjs <새 출력 폴더>`. 실제 파일 SHA, Git 상태, Node/OS/CPU/메모리, source에서 추출한 UI bridge·Agent·WebMCP API, 비선형 capability, 기존 qualification 및 성능 기준을 기록한다. API 존재는 실제 실행 검증을 뜻하지 않는다.
- 외부 비교 2건·pilot 5건의 독립 검토 담당과 브라우저/전원 모드가 고정된 성능 장비는 아직 미확정이다. inventory의 unresolved 목록에 그대로 남긴다. 이 미확정 사항은 M0 목록화의 결과이며 생산 자격의 충족을 뜻하지 않는다.
- 전체 release 대상은 [검증계획](VALIDATION_PLAN.md), M0~M1 필수 회귀는 [고정 목록](../../verification/specs/phase19/m0-m1-tests.json)에서 구분한다.

## M1 입력 식별

[workflowIdentity](../../src/core/workflowIdentity.js)는 버전 `p19-input-v1`의 SHA-256 식별자를 만든다. 모델, 케이스, 설정, 설계기준·설계 매개변수, 재료·단면과 해석 시 참조한 라이브러리, 규칙판, build를 각각 해시하고 하나의 inputHash에 묶는다.

케이스의 파생 status/lastRun/staleReason만 제외한다. 실제 입력의 NaN/Infinity 및 비JSON 값을 거부한다. 기존 16자리 Phase7 해시와 64자리 WebMCP v1 해시는 유지한다. 새 식별자는 별도 필드이며 구버전 해시만으로 동일 입력임을 인증하지 않는다.

런타임은 `SStructuresBuildIdentity`, `SStructuresRulePackIdentity`가 주입되면 해당 값을 결속한다. 미주입 상태는 buildBound/rulePackBound=false로 명시한다. 그러한 기록은 새 계약에서 설계전달을 허용하지 않는다. 실제 Release build 결속은 M10 대상이다.

## 불변 결과와 설계 기록

[workflowResults](../../src/compute/product/workflowResults.js)는 기존 Phase7 실행 기록을 참조하는 결과 catalog다. 별도 scheduler/solver가 아니다.

- 기존 analysisRunId, 입력 식별, 원본 결과 hash와 복제본, 실행·자격·설계검토·설계전달 상태를 분리한다.
- raw 결과는 그대로 보존한다. 별도 `p19-result-projection-v1`은 실행시각과 지정된 벽시계 측정값만 제외한 canonicalResultHash를 제공한다. 모델·설정·입력 안의 시간 매개변수는 제외하지 않는다.
- 설계 기록은 source analysis run IDs와 조합별 출처, demand 종류·단위·좌표·부호 계약을 필수로 가진다. 비선형 결과는 탄성 설계수요로 자동 전달하지 않는다.
- 발급되지 않은/변조된 설계 plan, 현재 입력과 다른 source identity, 잘못된 source model/build는 거부한다. 계산 완료가 verified 또는 최종설계 허가를 만들지 않는다.
- 설계 계산기는 이 단계에서 새로 연결하지 않았다. M1은 후속 설계 서비스가 사용할 계획·기록·조회 계약과 차단 규칙을 제공한다.

## 조회 API 변경

계산형 설계·보고서 `get*` API는 저장된 view만 읽는다. 없으면 `RESULT_REQUIRED`, 모델이나 실행 결과 revision이 바뀌면 `STALE_INPUT`을 반환한다. `getSnapshot()`도 자동 재해석하지 않는다.

```js
// 명시적 실행. 구버전 호환 snapshot이 필요한 기존 화면의 예시.
bridge.analyzeModel(model);
bridge.prepareResultView('getSteelDetailingReport', options);
const view = bridge.getSteelDetailingReport(options); // 이후 조회는 계산 0회
```

`prepareResultView`는 코드에 등록된 view 이름만 허용하는 기존 계산형 API의 명시적 진입점이다. UI 보고서 생성 버튼은 이를 호출한다. Agent와 UI bridge에 공통 view가 있으면 같은 cache를 사용한다. M4까지 이 메서드를 WebMCP의 범용 실행 도구로 노출하지 않는다.

일부 legacy 보고서 preparation 자체는 아직 solver 의존을 포함한다. 조회의 숨은 실행은 제거했지만, preparation을 순수한 snapshot 렌더링으로 바꾸는 전체 작업은 M3/G6에 남는다. 입력·실행·결과의 상태만 읽는 기존 API, benchmark라고 명명된 명시적 검증 실행 API와 설계 입력 산정 API는 각각의 기존 계약을 유지한다.

## 검증

`node tools/run-p19-validation.mjs <새 출력 폴더>`는 clean commit을 ZIP으로 내보내고 새 checkout에서 고정 시험 목록을 실행한다. 각 로그·종료코드·SHA·실행시각을 기록한다. 역사적 runner가 고정 경로에 쓰더라도 개발 저장소의 기존 evidence를 덮어쓰지 않는다.

M1 시험은 독립 입력 변경·stale·변조·실패 상태·캐시 무변경과 실제 정적 제품 실행을 확인한다. UI bridge, Agent, WebMCP adapter의 세 개 분리 실행에서 반올림 전 수치 projection을 비교한다. Node adapter 시험이며 실제 Site tools 브라우저 수락시험은 M4에 남는다.
