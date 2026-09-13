# Standard Engine Plan

status: planning

Phase 2에서는 solver와 기준 엔진을 분리한다. solver는 모델과 하중을 받아 해석 결과를 만들고, 기준 엔진은 기준 버전, 적용 조건, 입력값, 산정식, 결과 trace를 관리한다.

## Separation Rule

| Layer | 책임 | 금지 |
| --- | --- | --- |
| Solver | stiffness, load vector, solve, recovery, audit | 기준식 hardcoding |
| Standard registry | 기준 ID, version, clause, formula metadata | solver 내부 상태 직접 수정 |
| Design module | registry formula 실행, demand/capacity 검토 | trace 없는 결과 생성 |
| Report | 입력, 기준, 식, 결과, limitation 표시 | warning/NG 숨김 |

## Registry Shape

```json
{
  "standardId": "KDS_41_12_00_YYYY_MM_DD",
  "title": "Building design loads",
  "versionDate": "YYYY-MM-DD",
  "clauses": [
    {
      "clauseId": "example-clause",
      "topic": "liveLoad",
      "formulaId": "LL-OCCUPANCY-TABLE",
      "inputSchema": {},
      "outputSchema": {},
      "applicability": {},
      "limitations": []
    }
  ]
}
```

기준 문서 ID와 개정일은 구현 직전에 원문으로 확인한다. 문서에는 기준 후보와 검토 필요성을 남기고, 코드에는 versioned registry만 사용한다.

## Initial Registry Families

| Family | 목적 | Phase 2 ticket |
| --- | --- | --- |
| Design loads | dead, live, roof, snow, wind reference, load combination reference | T13-T20 |
| Seismic | seismic parameters, equivalent lateral force, response spectrum, drift | T18-T19, T27-T29 |
| RC | material, detailing basis, beam/column/wall/slab checks | T34-T36 |
| Steel | section database, compression/flexure/shear/interaction/stability | T37-T38 |
| Foundation | footing, mat, pile, soil/uplift checks | T39 |
| Connection | steel connection and base plate demand/checks | T40 |

## Trace Object

모든 기준식 결과는 같은 trace shape를 따른다.

```json
{
  "traceId": "unique-row-id",
  "standardId": "KDS_...",
  "formulaId": "FORMULA-ID",
  "clauseRef": "to-be-verified",
  "inputs": {},
  "formula": "readable expression",
  "result": {},
  "unit": {},
  "status": "OK | WARN | NG | NOT_CHECKED",
  "limitations": []
}
```

## Implementation Order

| Order | Work | Output |
| ---: | --- | --- |
| 1 | registry object와 audit schema 정의 | `src/standards/` 또는 `src/core/standards*` |
| 2 | 현재 KDS-style 조합 metadata를 registry ID에 연결 | combination audit에 standard ID 표시 |
| 3 | 현재 load derivation trace를 formula trace shape로 맞춤 | 하중 trace와 report 일관화 |
| 4 | design trace와 formula trace를 같은 action item system에 연결 | NG/WARN 추적 가능 |
| 5 | 기준 원문 검증과 version update workflow 작성 | 기준 변경 시 영향 범위 확인 |

## Guardrails

1. 기준 수치와 조항은 구현 전 원문 확인 기록을 남긴다.
2. preliminary formula는 `preliminary` 또는 `not checked`로 표시한다.
3. code-compliance와 calculation-aid를 report에서 구분한다.
4. registry가 없는 계산은 final design check로 표시하지 않는다.
5. 기준 업데이트는 migration과 regression test를 동반한다.
