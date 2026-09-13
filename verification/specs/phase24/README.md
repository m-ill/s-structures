# Phase24 M0 기준선·규칙·시험 범위

2026-09-11 · M0 개발 준비. 실제 코드 기준선은 [baseline.json](baseline.json)의 16개 HEAD 소스 hash다. 기존 작업 트리와 현장 자료는 보존했다.

## 확정 범위

네 재료 입력과 실제 상세의 공통 계약을 만들고, 첫 RC 계산 범위는 직사각 보/기둥·직교 RC 접합/정착·직사각 독립기초다. 필수검토/범위의 런타임 목록은 `src/metadata/designModuleCapabilities.js`를 공통 owner로 사용한다. `get_design_modules` WebMCP 도구와 `bridge.getDesignModules`가 같은 결과를 반환한다. 목록 조회는 해석이나 입력 변경을 수행하지 않는다.

[결함 목록](defects.json)의 D01~D12를 각 milestone과 시험에 연결했다. [독립 합성 예제](independent-fixtures.json)는 철근 선택 부족과 중심 접지압의 작은 산술 oracle이며 설계 기준 자격을 의미하지 않는다.

## 기존 계산 자산의 상태

| 코드 | 확인한 성격 | 재사용 결정 |
| --- | --- | --- |
| concrete.js | 제공 스터럽 미연결·가정 철근비 중심 예비 검토 | M4의 제공 상세 계산으로 확장; 기존 수치를 최종 설계로 승격하지 않음 |
| rc/pmCurve.js | 임의 비율로 만든 4점 예비 곡선 | 실제 2축 단면 평형 oracle/검증된 P-M-M 계산으로 사용하지 않음 |
| nonlinear/fiber/sectionResponse.js | 명시 단위 N/Pa/m, 일반화 변형률로 fiber 힘/접선 적분, 입력 trial 상태 분리 | M4의 순수 단면 적분 재사용 후보. 전역 비선형 solver 없이 호출 가능하나 RC 설계 규칙·강도한계·철근 기하·단위 adapter 별도 필요 |
| nonlinear/fiber/fiberSection.js | 기본 배근·strip 위치를 쓰는 초기 builder | 실제 입력 누락을 기본 철근으로 채우는 경로는 새 상세 설계에 사용하지 않음 |
| connectionFoundation.js / foundation/footing.js | 임의 접합 용량·예비 면적/고정 d | M6/M7에서 typed object·동시 수요·실제 형상으로 교체 |
| rc/rebar.js·각 상세 trace | formulaId가 있으나 규칙 판본/조항/범위의 완전한 qualification 아님 | 실제 규칙 묶음과 독립 예제로 판정 후 사용 |

## 규칙 출처 상태

국내 프로젝트 기준군은 KDS 콘크리트/건축 기준을 대상으로 하되 **정확한 적용 판본·조항과 독립 예제가 아직 봉인되지 않았다**. 런타임은 `RULE_UNAVAILABLE`, edition=null, clauses=[]로 반환한다. 프로그램에 KDS 문자열이 있거나 웹 검색 결과가 있다는 이유로 verified로 바꾸지 않는다.

- [KCSC 콘크리트 기준 개정 고시](https://kcsc.re.kr/board/notdetail/6639)와 [KCSC 영문 기준 안내](https://kcsc.re.kr/standardCode/eng)를 확인 대상으로 조회했다. 이 실행의 웹 원문 추출은 본문을 반환하지 않아 조항별 근거 확보로 집계하지 않았다.
- M4/M6/M7에서 각 규칙 구현 전에 공식 원문의 판본·조항·허용 범위·단위·독립 예제를 확보한다. 필요한 규칙이 없는 해당 검토는 미완료로 남긴다. 입력·버전·제어 등 근거 계수가 필요 없는 M1~M3 개발은 진행할 수 있다.
- 모듈별 필수검토 목록은 적용 범위를 명시한 개발 계약이다. 실제 법규 전체 목록의 독립 검토 완료를 의미하지 않는다.

## WebMCP 연결 대응

| 동작 | 현재 진입점 | 후속 책임 |
| --- | --- | --- |
| 지원/필수검토·미지원 조회 | get_design_modules → bridge.getDesignModules | M0 구현. 모듈별 개발 상태와 함께 갱신 |
| 현재 입력 조회 | get_design_context | M1 상세 record 채널 보강 |
| 변경 preview/apply | preview_design_changes / apply_design_changes | M1 typed command, M2 identity/복원 |
| 해석 계획·실행·상태·취소 | plan/start/get/cancel_elastic_workflow | M2~M5 변경 영향/후보 재계획 연결 |
| 검토 계획·실행·조회 | plan_design_review / start_design_review / get_design_result | M3 공통 owner, M4/M6/M7 규칙 |
| 후보·상세도 | 현재 전용 제어 없음 | M5/M8의 명시적 도구와 비동기 제품 서비스 |
| 보고서 | 기존 report export 도구 | M8의 동일 상세·벡터 산출물 연결 |

각 단계에서 실제 도구 정의를 경유하는 T18 시험을 추가한다. 현재 M0 조회 기능만으로 위 후속 제어가 구현됐다고 주장하지 않는다.

## 작은 실행

`node tools/run-phase24-tests.mjs --list` 또는 인수 없는 실행은 목록만 출력한다. 현재 M0 실행은 `node tools/run-phase24-tests.mjs --milestone=M0 --case=T00`이다. 미구현 milestone/알 수 없는 옵션은 실패한다. 전체 회귀·브라우저·실제 건물을 자동으로 실행하지 않는다.

실제 근거: `verification/evidence/phase24/m0/20260911-01/`. API 부재 RED와 추가 후 GREEN, D04 알려진 결함 재현을 구분했다. 스터럽 선택기의 현재 제공1.9013 < 요구4mm²/mm인데 부족 상태가 없는 사실을 보존했으며 이는 아직 수정 PASS가 아니다.
