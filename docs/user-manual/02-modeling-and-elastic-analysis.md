# 02 Modeling And Elastic Analysis

## Modeling Paths

현재 모델은 네 가지 경로로 만들 수 있다.

| 경로 | 사용자 | 용도 |
| --- | --- | --- |
| 화면 모델링 | 일반 사용자 | 직접 절점/부재/하중 작성 |
| native modeler action | AI agent 또는 자동화 | 화면 모델러와 같은 모델을 안정적으로 조작 |
| JSON import | 고급 사용자, 변환기 | 외부 입력 또는 생성 모델 주입 |
| 대표 건물 generator | 검증/테스트 | 10종 대표 형상 자동 생성과 보고서 검증 |

중요한 원칙은 하나다. 새 모델링 표면을 따로 만드는 것이 아니라 기존 `index.html` 모델 객체를 기준으로 엔진, 결과, 보고서가 연결되어야 한다.

## Core Model Entities

| entity | 필수 개념 |
| --- | --- |
| `nodes` | `id`, `x`, `y`, `z`, `support`, 선택적으로 `mass` |
| `members` | `id`, `n1`, `n2`, `matId`, `secId`, `design.role` |
| `materials` | 탄성계수, 전단계수, 밀도 등 |
| `sections` | 면적, 단면2차모멘트, 단면계수 등 |
| `loadCases` | `D`, `L`, `WX`, `WY`, `EX`, `EY` 등 |
| `loads` | `udl`, `point`, `nodal`, `nmoment` |
| `loadCombinations` | 조합 ID, 조합 타입, case별 factor |
| `analysisSettings` | 선형해석, P-Delta, modal/RSA 관련 설정 |

## Screen Modeling Checklist

1. 하부 절점에 `fixed`, `pin`, `roller`, 또는 custom 지점을 둔다.
2. 기둥과 보가 실제 연결되도록 절점 좌표를 맞춘다.
3. 부재에는 적절한 단면과 재료를 배정한다.
4. 보/기둥/브레이스 역할을 지정하면 설계 검토와 하중 산정 trace가 더 읽기 쉬워진다.
5. 층별 모델은 z좌표를 일관되게 사용한다.
6. 하중 방향은 전역 좌표와 부호를 확인한다.
7. 조합을 만들고 해석 결과가 `ok`인지 확인한다.

## Elastic Analysis Pipeline

현재 탄성해석은 아래 흐름으로 동작한다.

```text
model validation
-> 3D frame stiffness assembly
-> load case and combination solve
-> reaction/equilibrium check
-> member force recovery
-> envelope and design demand
-> result visuals
-> report data
```

해석 결과에서 우선 확인할 항목은 다음과 같다.

| 결과 | 확인 내용 |
| --- | --- |
| `analysis.ok` | 전체 해석 성공 여부 |
| validation errors | 모델 입력 오류 |
| equilibrium residual | 총하중과 총반력의 평형 오차 |
| max displacement | 최대 변위 |
| member force envelope | 부재별 축력, 전단, 휨 포락 |
| reactions | 지점 반력 |
| design utilization | 예비 설계 검토비 |
| serviceability drift | 층간변위 및 제한비 |

## Result UI

`탄성해석` 탭에서는 기존 결과 표시 흐름을 우선 사용한다.

| 리본 그룹 | 역할 |
| --- | --- |
| 조합 | 표시할 하중조합 선택 |
| 결과 | 변위, 부재력, 반력, 포락 등 결과 토글 |
| 보고 | 하중조합, 설계요약, 검증, 계산서 |
| 상태 | 현재 해석 상태와 경고 표시 |

추가로 P-Delta 단계, 결과 배율, 부재 결과 표시 같은 advanced control은 native result controls와 agent API로도 제어된다.

## Advanced Elastic Checks

비선형 정식 엔진 전까지의 고급 탄성 검토는 다음 수준으로 보는 것이 맞다.

| 기능 | 현재 해석 의미 |
| --- | --- |
| P-Delta | 반복 기반 2차효과 검토. 정식 소성힌지 비선형과 구분 |
| Modal/RSA | lumped mass 기반 모드/RSA 예비 검토 |
| Serviceability drift | 탄성해석 결과에서 층간변위 표 작성 |
| Member design trace | 부재별 검토식과 지배 조합 추적 |

## Common Failure Cases

| 증상 | 점검 |
| --- | --- |
| 해석 실패 | 지점 부족, zero-length 부재, 누락 재료/단면 |
| 변위가 비정상적으로 큼 | 기구, 약한 단면, 하중 단위 오류 |
| 하중이 적용되지 않음 | 하중케이스 ID와 조합 factor 확인 |
| 보고서가 비어 있음 | 먼저 해석이 성공했는지 확인 |
| 층간변위 행이 적음 | z층 좌표와 수직으로 매칭되는 절점쌍 확인 |
