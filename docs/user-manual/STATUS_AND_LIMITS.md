# Status And Limits

## Short Answer

비선형 정식 엔진 전 단계의 핵심 제품 흐름은 상당 부분 연결되어 있다. 현재 가능한 것은 “3D 모델링 -> 선형 탄성해석 -> 하중조합 -> 예비 설계검토 -> 산정 trace -> 상세 보고서/계산서 -> AI 제어/검증 harness”까지다.

다만 구조설계사무소 최종 납품 수준으로 보려면 아직 기준식 세분화, 접합/기초 상세, 도면/MGT/이미지 import, 설계자 검토 workflow, 비선형 정식 엔진이 남아 있다.

## Done Enough For Current Elastic Workflow

| 항목 | 근거 |
| --- | --- |
| 기존 `index.html` 모델러 연결 | M22-M28 native UI/runtime/modeler/persistence |
| 3D 선형 탄성해석 | M2, M9, M23-M25 |
| 하중조합과 포락 | M4, M35, M38 |
| P-Delta와 modal/RSA | M7, M8, M29 |
| 상세 보고서 | M34-M36 |
| 계산서 패키지 | M42-M43 |
| KDS-style 조합 registry/audit | M44 |
| 부재별 설계 trace | M45 |
| 안정화 하네스 | M46 |
| 설계기준 입력 UI/API | M47 |
| 하중 산정 trace | M48 |
| 층간변위 검토 | M49 |
| 대표 건물 PDF current trace | M50 |

## Preliminary But Useful

| 항목 | 현재 의미 |
| --- | --- |
| RC 배근 | 예비 schedule 및 기본 철근 선택 |
| 철골 상세 검토 | 예비 member review schedule |
| 접합/기초 | 반력과 접합력 기반 예비 검토 |
| KDS-style 조합 | 완전한 법규 엔진이 아니라 구조화된 preset/rule |
| 풍/지진 하중 | 등가 하중 산정 trace, 세부 code procedure는 미완 |
| pushover | 화면/API와 curve/hinge state tracking은 있으나 정식 비선형 반복해석은 아님 |

## Not Yet Complete

| 미완 항목 | 필요한 다음 단계 |
| --- | --- |
| 도면 이미지 import | agentic vision이 도면을 읽고 schema-versioned model JSON 생성 |
| MGT import | 외부 모델 파일 parser와 mapping audit |
| KDS 풍하중 상세 절차 | 노출, 지형, 중요도, 내압, 외압, 동적계수 |
| KDS 지진 상세 절차 | 지반, 중요도, 반응수정계수, 주기, 모드조합, 우발편심 |
| 활하중 저감/적설/토압/수압/시공하중 | load standard registry 확장 |
| RC 상세 설계 | 전단, 정착, 이음, 기둥-보 접합부, 내진 상세 |
| 철골 상세 설계 | 폭두께비, LTB, 전단좌굴, 접합부, 베이스플레이트 |
| 기초 상세 설계 | 지내력, 침하, 전도/활동, 말뚝/매트/독립기초 |
| 정식 비선형 | tangent stiffness, hinge degradation, convergence, load/displacement control |
| 사용자 검토 workflow | issue/action item closure, 승인 기록, PDF revision history |

## Current Validation Command Set

개발자가 현재 상태를 다시 검증할 때 쓰는 기본 명령은 다음과 같다.

```powershell
npm.cmd test
npm.cmd run generate:stabilization-harness
npm.cmd run generate:m42-representative-packages
npm.cmd run export:m42-representative-pdfs
git diff --check
```

금지 문자열 검사는 `src`, `tests`, `tools`, `package.json`, `index.html`, `docs`를 대상으로 별도로 수행한다.

## Engineering Interpretation

현재 결과가 “해석은 잘 된다”는 말은 다음 뜻이다.

1. 모델이 schema validation을 통과한다.
2. 선형 탄성해석 solver가 수렴이 아니라 직접 풀이로 결과를 만든다.
3. 총하중과 총반력의 평형 검사가 통과한다.
4. 조합별 결과와 포락이 생성된다.
5. 보고서가 같은 model/analysis 객체에서 생성된다.
6. 하중 산정과 설계검토 trace가 보고서에 붙는다.

하지만 “최종 구조설계가 자동으로 끝났다”는 뜻은 아니다. 현재 프로그램은 계산을 투명하게 정리하고 검토 포인트를 드러내는 방향으로 완성도를 올리는 단계다.
