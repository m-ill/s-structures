# Phase 7 Verification Matrix

```yaml
status: implemented-and-regression-tested
rule: implementation existence is not verification evidence
evidence_root: verification/specs/phase7
```

## 1. 검증 원칙

1. **독립 정답**: 같은 함수의 출력끼리 비교하거나 같은 식을 양쪽에서 재사용한 시험은 독립 검증으로 인정하지 않는다.
2. **차원과 좌표계**: 숫자뿐 아니라 단위 차원, 전역/로컬축, 부호, 방향을 검증한다.
3. **절대+상대 허용오차**: `|actual-reference| <= absTol + relTol*scale` 형태를 사용하고 기준값과 scale을 증빙에 기록한다.
4. **기준 규칙 정확 일치**: 하중조합 이름·계수·적용 조건은 수치 solver tolerance가 아니라 고정 fixture와 정확히 일치해야 한다.
5. **실패 경로 검증**: 잘못된 입력이 그럴듯한 결과로 바뀌지 않고 대상·이유·해결 동작을 포함해 실패하는지 확인한다.
6. **재현성**: 모델 hash, rule-pack version, runtime, tolerance, seed를 증빙에 남긴다.
7. **수동 확인 보조**: 스크린샷은 UI 배치 증거일 뿐 수치 검증을 대체하지 않는다.

## 2. 증빙 레코드

각 검증 ID는 완료 시 아래 정보를 가진 JSON 또는 Markdown 증빙을 남긴다.

```json
{
  "id": "SEC-01",
  "status": "pass | fail | blocked",
  "referenceType": "closed-form | official-rule | independent-fixture | workflow | performance",
  "reference": "source or derivation",
  "modelHash": "sha256",
  "actual": {},
  "expected": {},
  "tolerance": {},
  "runtime": {},
  "evidence": [],
  "verifiedAt": "ISO-8601"
}
```

## 3. 계약·마이그레이션·차원

| ID | 검증 내용 | 합격 기준 | 수준 |
| --- | --- | --- | --- |
| GOV-01 | 공식 source registry 필수 필드 | authority/code/edition/amendment/effectiveDate/source hash 누락 시 verified 불가 | L1 |
| GOV-02 | 결과 상태 승격 | 증빙 없는 candidate/preliminary가 verified로 저장되지 않음 | L1 |
| GOV-03 | 규칙 팩 원문 추적 | 모든 verified 조합 fixture가 공식 원문의 위치와 hash를 가짐 | L4 |
| GOV-04 | 공표 상태 격리 | draft/의견조회 규칙 팩은 기본 선택·자동 생성·verified 승격이 불가 | L1/L4 |
| MIG-01 | legacy D/L 모델 round-trip | ID·하중·부재·기존 조합 손실 0 | L4 |
| MIG-02 | legacy load type 변환 | roof/snow/other가 명시 규칙에 따라 변환되고 모호한 값은 사용자 확인 요구 | L4 |
| MIG-03 | 신규 프로젝트 기본 상태 | 근거 없는 strength/service 조합 없이 `load setup required` | L4 |
| MIG-04 | legacy 강재 보존 | SS400/SM490 모델의 ID·E/G/Fy/Fu/allow와 기존 해석결과가 migration 승인 전 불변 | L3/L4 |
| MIG-05 | 강종 명시적 전환 | preview의 대응 grade·물성 차이·영향 부재와 실제 transaction/undo가 일치 | L4 |
| DIM-01 | 결과 contract 차원 | force 필드에 length, moment 필드에 force 등 대입 시 contract failure | L1 |
| DIM-02 | RSA 차원 전파 | displacement가 base shear 또는 reaction fallback으로 사용될 수 없음 | L3 |

## 4. 단면·재료

| ID | 검증 내용 | 독립 기준/합격 기준 | 수준 |
| --- | --- | --- | --- |
| SEC-01 | SQUARE 기본 속성 | `A=B^2`, `Iy=Iz=B^4/12`, 독립 Saint-Venant J reference와 일치 | L1 |
| SEC-02 | RECT 기본 속성 | 면적·2차모멘트·aspect ratio별 J가 독립 공식/표와 일치 | L1 |
| SEC-03 | CIRC/PIPE | 폐합 공식의 A/I/J와 일치, t 경계 검증 | L1 |
| SEC-04 | H/BOX | 독립 합성단면 계산과 A/I/J 일치 | L1 |
| SEC-05 | 형상 유효성 | 음수/0 치수, 내경 초과, 겹침을 저장 전에 거부 | L1 |
| SEC-06 | GENERAL 직접 속성 | 단위 변환 round-trip 후 A/Iy/Iz/J 보존 | L1 |
| SEC-07 | 미지원 coupling | C/L/T의 warping·전단중심 미지원이 경고 없이 verified가 되지 않음 | L2 |
| SEC-08 | 단면 참조 누락 | fallback 단면을 사용하지 않고 부재 ID와 함께 해석 차단 | L3 |
| SEC-09 | 해석 modifier | EA/GA/GJ/EI/질량/자중 multiplier가 독립 예상값과 각 성분별 일치 | L2/L3 |
| SEC-10 | modifier source | 기준 preset의 출처·적용조건을 보존하고 단면 DB 원본을 변경하지 않음 | L4 |
| MAT-01 | 재료 필수 속성 | E/G/density/strength의 차원과 범위 검증 | L1 |
| MAT-02 | 라이브러리 snapshot | Standard DB 갱신 후 기존 프로젝트 물성 불변 | L4 |
| MAT-03 | 출처 계층 | Standard/Office/Project의 같은 이름이 ID·source로 충돌 없이 공존 | L4 |
| MAT-04 | 탄성/강도 분리 | 탄성 물성과 조건별 설계강도 범위가 혼합·유실 없이 round-trip | L1/L4 |
| MAT-05 | KS grade metadata | standardCode/edition/designation/productForm/gradeBasis/thicknessRange 누락 시 standard grade 등록 불가 | L1 |
| MAT-06 | 신규 기본 강종 | 신규 모델의 기본 목록은 verified 현행 designation을 사용하고 SS400/SM490를 새 재료로 생성하지 않음 | L4 |
| MAT-07 | legacy alias 안전성 | 구명칭 검색이 현행 후보를 찾되 기존 물성을 새 grade 물성으로 조용히 변경하지 않음 | L1/L4 |
| MAT-08 | suffix·두께 보존 | SM 계열 suffix와 두께구간별 Fy/Fu가 공식 KS fixture와 정확히 일치 | L1/L4 |
| MAT-09 | 제품군별 대응표 | 압연강재·용접강재·강관·각형강관 alias가 서로 다른 KS mapping을 침범하지 않음 | L1/L4 |
| SEC-UI-01 | 정사각형 작성 | UI에서 한 변 입력만으로 생성·저장·재편집 | L5 |
| SEC-UI-02 | 2D 미리보기 | 치수와 로컬 y/z축이 저장 속성과 일치 | L5 |
| SEC-UI-03 | 검색·필터 | 형상/재료/source/사용 중 필터가 정확한 결과 집합 반환 | L5 |
| SEC-UI-04 | 가져오기 preview | 단위·중복·오류 행을 표시하고 실패 시 부분 적용 0 | L4 |
| SEC-UI-05 | 다중 지정 | 선택 집합에만 단면이 원자적으로 변경되고 한 번 undo 가능 | L4 |
| SEC-UI-06 | 참조 중 삭제 | 사용 위치를 표시하고 대체 없이 삭제 불가 | L4 |
| SEC-UI-07 | 회전·로컬축 | 90도 회전 후 viewport, 속성, 해석축이 일치 | L3/L5 |
| SEC-UI-08 | modifier 편집 | named set 생성·배치 지정·undo 후 수치와 표시가 일치 | L4/L5 |
| SEC-UI-09 | 삽입점·offset 미리보기 | cardinal point와 rigid offset이 viewport·solver 입력과 일치 | L3/L5 |
| MAT-UI-01 | 구명칭 검색 | SS400/SM490 검색 시 legacy 표시와 검증된 현행 후보를 구분해 표시 | L5 |
| MAT-UI-02 | migration preview | KS 판·suffix·두께·Fy/Fu 차이·영향 부재·경고가 적용 전에 보임 | L4/L5 |
| MAT-UI-03 | legacy 보고 | 미전환 모델의 화면·보고서에 원 designation과 실제 사용 물성이 남음 | L4/L5 |
| UX-01 | 키보드·focus | 주요 라이브러리 명령을 키보드로 실행하고 focus가 보임 | L5 |
| UX-02 | 긴 이름·작은 화면 | 단면명·단위·오류문구가 컨트롤 밖으로 겹치지 않음 | L5 |

## 5. 모델링·작업공간

| ID | 검증 내용 | 합격 기준 | 수준 |
| --- | --- | --- | --- |
| MOD-01 | 층·그리드 생성 | 입력한 좌표·레벨과 생성 절점이 허용오차 내 일치 | L3/L4 |
| MOD-02 | 반복층 복제 | 선택한 단면/하중/릴리스 포함 옵션만 복제 | L4 |
| MOD-03 | 층 삽입·높이 변경 | 위·아래 연결성과 레벨 참조가 일관되게 갱신 | L4 |
| MOD-04 | 역할 기반 생성 | column/beam/brace 역할과 방향이 규칙대로 저장 | L4 |
| MOD-05 | 중복절점 병합 | preview 수와 실제 병합 수 일치, 참조 손실 0 | L3/L4 |
| MOD-06 | 교차부재 분할 | 교차점에 절점·분할부재가 생성되고 하중·속성 보존 | L3/L4 |
| MOD-07 | 고립/0길이 탐지 | 모든 fixture 결함을 대상 ID와 함께 탐지 | L3 |
| MOD-08 | 릴리스 기구 사전경고 | 알려진 mechanism fixture를 해석 전에 차단 | L3 |
| MOD-09 | selection filter | 층·그리드·역할·부재종류 조합이 정확한 선택 집합 반환 | L4 |
| MOD-10 | 삽입점 연결 | cardinal point 변경 후 해석 절점·rigid arm·표시 형상이 일관됨 | L3/L5 |
| LAYOUT-01 | 이동·resize | 모든 패널이 최소/최대 크기 내에서 이동·크기조절 | L5 |
| LAYOUT-02 | 도킹·자석 스냅 | 임계거리에서 안정적으로 snap하고 겹침·떨림 없음 | L5 |
| LAYOUT-03 | viewport 변경 | 해상도 축소 후 패널 header/close handle이 보이는 영역에 남음 | L5 |
| LAYOUT-04 | workspace 저장·초기화 | 재실행 시 복원되고 초기화 명령으로 기본 배치 복귀 | L5 |
| LAYOUT-05 | 통합 패널 상태 | 모델링/하중/해석 preset 전환 후 결과 선택과 패널 상태 손실 없음 | L5 |

## 6. 하중 분류·설계조건·질량원

| ID | 검증 내용 | 합격 기준 | 수준 |
| --- | --- | --- | --- |
| LOAD-01 | 법정 family round-trip | D/L/Lr/S/R/W/E/H/T/F/EQUIPMENT/CONSTRUCTION/OTHER 보존 | L1/L4 |
| LOAD-02 | family와 case ID 분리 | W family 아래 방향별 여러 case가 충돌 없이 저장 | L4 |
| LOAD-03 | 설계조건 조건부 질문 | 지하/지붕/설비 응답에 따라 필요한 입력만 활성화 | L5 |
| LOAD-04 | 미확인 상태 | 미입력과 0, 해당없음이 서로 다른 상태로 저장 | L1/L4 |
| LOAD-05 | 층별 용도 | 서로 다른 층의 활하중 제안값과 출처가 독립 유지 | L4 |
| LOAD-06 | 템플릿 재적용 | 동일 입력에서 케이스 중복 0, stable key 유지 | L4 |
| LOAD-07 | 값 출처 | 자동값마다 단위·source·조건·확인상태 존재 | L4 |
| LOAD-08 | template rollback | 적용 실패 또는 undo 후 케이스·설계조건이 원상복구 | L4 |
| LOAD-09 | 자중/추가고정 분리 | D-SW와 D-SDL이 별도 variant로 저장되고 자중 중복 0 | L3/L4 |
| LOAD-10 | 활하중 pattern | pattern group의 loaded/unloaded 영역과 stable key가 재생성 후 동일 | L3/L4 |
| LOAD-11 | 활하중 저감 trace | 영향면적·부재역할·기준 source·적용 전후가 독립 fixture와 일치 | L3/L4 |
| MASS-01 | 질량원 생성 | 선택 family/factor만 질량원에 포함 | L2/L4 |
| MASS-02 | 질량 보존 | 절점질량 합이 독립 계산한 총질량과 허용오차 내 일치 | L3 |
| MASS-03 | 중복 방지 | 자중·부재질량·사용자질량을 중복 계상하지 않음 | L3 |

## 7. 하중조합 규칙 팩

| ID | 검증 내용 | 합격 기준 | 수준 |
| --- | --- | --- | --- |
| COMB-01 | strength 공식 fixture | 공식 원문에 고정한 모든 식·계수·조건 정확 일치 | L1/L4 |
| COMB-02 | allowable 공식 fixture | 공식 원문에 고정한 모든 식·계수·조건 정확 일치 | L1/L4 |
| COMB-03 | service 목적 fixture | 변위/사용성 등 목적별 조합 분류 정확 | L1/L4 |
| COMB-04 | family 대안 | Lr/S/R 등 대안 규칙이 원문 조건대로 확장 | L1 |
| COMB-05 | 방향·부호 | W/E 방향과 부호 조합의 누락·중복 0 | L1 |
| COMB-06 | 우발편심 | 선택 기준의 방향 조합과 stable key 정확 | L1/L4 |
| COMB-07 | 누락 케이스 | 필요한 case가 없으면 제외 이유·warning을 반환하고 0 factor로 숨기지 않음 | L1/L4 |
| COMB-08 | method 일치 | strength/allowable 설계법과 다른 rule family 적용 차단 | L1/L4 |
| COMB-09 | idempotency | 같은 규칙 팩 재실행 후 논리 조합 집합 불변 | L4 |
| COMB-10 | 사용자 수정 보호 | userModified 조합을 덮어쓰지 않고 conflict diff 제공 | L4 |
| COMB-11 | 기준 판 변경 | 이전/새 규칙의 추가·변경·삭제를 preview | L4/L5 |
| COMB-12 | 목적별 전달 | P-Delta/RSA/foundation 등 분석 케이스가 허용된 purpose만 선택 | L4 |

## 8. 하중 UI·분배·감사

| ID | 검증 내용 | 합격 기준 | 수준 |
| --- | --- | --- | --- |
| LUI-01 | active/all 표시 | 현재 케이스와 전체 표시가 legend 및 viewport와 일치 | L5 |
| LUI-02 | 하중 종류 표현 | 절점/부재/면적/온도/침하를 혼동 없이 구분 | L5 |
| LUI-03 | 방향·좌표계 | 전역/로컬 방향과 부호가 수치 입력·화살표와 일치 | L3/L5 |
| LUI-04 | 부분분포 범위 | 시작/끝 위치와 분포 크기가 viewport와 solver 입력에 일치 | L3/L5 |
| LUI-05 | copy/move | 대상 층·그리드에만 복제되고 source 관계 유지 | L4 |
| LUI-06 | scale | 선택 하중만 정확한 factor로 변경되고 단위 불변 | L4 |
| LUI-07 | 생성/수동 필터 | origin과 userModified 상태별 정확한 집합 표시 | L4/L5 |
| LUI-08 | 자중 표시 | 케이스, 방향, factor, 밀도·면적 source를 확인 가능 | L4/L5 |
| LUI-09 | 대량 작업 undo | 작업 전체가 한 번에 원복되고 부분 잔여 0 | L4 |
| LUI-10 | 빈 결과 안내 | 표시할 하중이 없을 때 원인과 다음 동작 제공 | L5 |
| LUI-11 | 고정하중 산출표 | 구성 항목 합계·단위가 생성 면하중과 일치하고 항목 trace 보존 | L3/L4 |
| LUI-12 | 벽체·설비 산출 | 독립 수계산 선/집중/면하중과 일치, 생성 위치 정확 | L3/L4 |
| LUI-13 | pattern/reduction UI | 적용 범위·저감 전후·출처가 preview와 viewport에서 확인됨 | L4/L5 |
| LOAD-AUDIT-01 | 하중 합계 | 케이스별 UI 합계와 solver 입력벡터 합이 일치 | L2/L4 |
| LOAD-AUDIT-02 | tributary 보존 | 면적하중 입력합=부재 분배합+잔차, 잔차 허용치 만족 | L2/L3 |
| LOAD-AUDIT-03 | 이상치 탐지 | 중복/0/단위 이상/미참조/반대방향 fixture 전부 탐지 | L3 |
| LOAD-AUDIT-04 | 재생성 충돌 | 사용자 수정 하중을 덮어쓰지 않고 충돌 목록 제공 | L4 |
| LOAD-AUDIT-05 | 자중 이중계상 | self-weight와 수동/생성 D 하중의 중복 후보를 대상별 보고 | L3/L4 |

## 9. 선형 정적해석

| ID | 검증 내용 | 독립 기준/합격 기준 | 수준 |
| --- | --- | --- | --- |
| STAT-01 | 축력 bar | `u=PL/EA`, reaction과 축력 폐합 | L2/L3 |
| STAT-02 | cantilever bending | tip force/moment의 변위·회전·단부력 폐합식 | L2/L3 |
| STAT-03 | simply supported UDL | reaction, 최대모멘트, 처짐 폐합식 | L2/L3 |
| STAT-04 | 부분 사다리꼴 하중 | 독립 적분 fixed-end force와 station force 일치 | L2/L3 |
| STAT-05 | 부재 중간모멘트 | 독립 virtual-work 또는 stiffness reference와 일치 | L2/L3 |
| STAT-06 | 온도·온도구배 | 자유/구속 부재의 축력·곡률 폐합식 | L2/L3 |
| STAT-07 | 고정지점 침하 | prescribed DOF partition 해와 reaction 일치 | L2/L3 |
| STAT-08 | spring settlement | 독립 1DOF/2DOF 해와 일치 | L2/L3 |
| STAT-09 | rigid offset | rigid-arm benchmark의 변위·단부력 일치 | L2/L3 |
| STAT-10 | 부분 회전릴리스 | static condensation reference와 일치 | L2/L3 |
| STAT-11 | unilateral 재활성화 | 하중경로 fixture에서 active set이 비활성·재활성 후 정답 집합 도달 | L3 |
| STAT-12 | 특이성 진단 | mechanism DOF와 관련 절점/부재를 재현 가능하게 보고 | L3 |
| EQ-01 | 전역 힘 평형 | X/Y/Z 외력+반력 잔차가 scale 기반 tolerance 내 | L3 |
| EQ-02 | 전역 모멘트 평형 | 기준점에 대한 Mx/My/Mz 잔차가 tolerance 내 | L3 |
| EQ-03 | 조합별 평형 | 모든 조합에 audit가 존재하고 실패 조합을 식별 | L3/L4 |
| EQ-04 | audit 실패 전파 | High 잔차 결과가 정상/verified로 보고되지 않음 | L4 |

## 10. Direct P-Delta

| ID | 검증 내용 | 합격 기준 | 수준 |
| --- | --- | --- | --- |
| PD-01 | method routing | UI direct 선택 trace가 Direct geometric stiffness solver를 가리킴 | L4 |
| PD-02 | legacy routing | legacy 선택은 명시된 legacy solver만 실행하고 상태를 표시 | L4 |
| PD-03 | beam-column benchmark | 독립 2차해석 reference의 변위·모멘트 증폭과 일치 | L3 |
| PD-04 | P=0 극한 | Direct 결과가 1차 선형 결과로 수렴 | L3 |
| PD-05 | 압축 증가 경향 | 임계하중 이하에서 독립 reference와 같은 증폭 경향·수렴 | L3 |
| PD-06 | 인장 축력 | 기하강성 부호와 응답 경향이 독립 reference와 일치 | L3 |
| PD-07 | 결과 완전성 | displacement/reaction/member station/iteration/convergence 존재 | L4 |
| PD-08 | 조합·포락 | 각 조합 결과와 envelope가 독립 max/min 집계와 일치 | L3/L4 |
| PD-09 | 다이어프램·generated | 축약/생성 모델 결과가 명시적 동등 모델과 일치 | L3 |
| PD-10 | 그래프 분리 | global/story/member 및 combination 선택이 서로 다른 source를 정확히 표시 | L5 |

## 11. 모달·RSA

| ID | 검증 내용 | 독립 기준/합격 기준 | 수준 |
| --- | --- | --- | --- |
| MODAL-01 | SDOF 주기 | `T=2*pi*sqrt(m/k)`와 일치 | L3 |
| MODAL-02 | 2DOF 고유값 | 폐합 또는 독립 수치 reference와 일치 | L3 |
| MODAL-03 | 질량정규화 | `phi^T M phi=1`, 모드 직교성 잔차 만족 | L2/L3 |
| MODAL-04 | 참여율·유효질량 | 독립 행렬 계산과 일치, 총질량 폐합 | L3 |
| MODAL-05 | rigid-body 진단 | 자유강체 fixture에서 0/근접0 모드와 원인 보고 | L3 |
| MODAL-06 | 다이어프램 동등성 | 축약모델과 명시적 강체 constraint reference 일치 | L3 |
| MODAL-07 | static model parity | 재료·단면·generated member·경계조건 해시가 정적 모델과 일치 | L4 |
| RSA-01 | SDOF 스펙트럼 변위 | 입력 spectrum의 독립 SDOF 응답과 일치 | L3 |
| RSA-02 | SDOF base shear | 관성력/반력으로 계산한 힘과 일치, 단위 force | L3 |
| RSA-03 | 모드별 절점변위 | 독립 modal superposition 값과 일치 | L3 |
| RSA-04 | 모드별 부재력 | 복원 부재력이 modal nodal response와 평형 | L3 |
| RSA-05 | SRSS | 독립 응답량별 제곱합과 일치 | L1/L3 |
| RSA-06 | CQC 근접모드 | 독립 상관계수와 조합값 일치 | L1/L3 |
| RSA-07 | 방향·부호 전략 | X/Y 및 signed result의 적용 규칙과 provenance 정확 | L3/L4 |
| RSA-08 | base shear scaling | 적용 전/목표/factor/적용 후 값이 일관되고 force 차원 유지 | L3/L4 |
| RSA-09 | story drift | RSA 절점응답에서 계산한 층간변위와 일치 | L3 |
| RSA-10 | story shear/torsion | RSA 관성력/반력에서 계산하고 static case 참조 0 | L3/L4 |
| RSA-11 | 부족 모드 경고 | 질량참여 목표 미달 시 결과 상태와 해결 동작 제공 | L4 |
| RSA-12 | 결과 provenance | 모든 표시값이 analysis case/mode/combination/scaling trace를 가짐 | L4/L5 |

## 12. Sparse·좌굴·THA

| ID | 검증 내용 | 합격 기준 | 수준 |
| --- | --- | --- | --- |
| SPARSE-01 | 실제 frame assembly | fixture K가 dense reference와 항목별 일치 | L2/L3 |
| SPARSE-02 | dense 변환 금지 | production 경로에서 N x N dense allocation instrumentation 0 | L3 |
| SPARSE-03 | 해 정확도 | SPD/indefinite 허용범위 fixture의 residual과 dense reference 일치 | L2/L3 |
| SPARSE-04 | multi-RHS 재사용 | factorization 1회, RHS별 해와 독립 reference 일치 | L3 |
| SPARSE-05 | permutation | 순열 전후 물리 DOF 해가 동일 | L2/L3 |
| SPARSE-06 | singularity | rank/near-zero pivot과 관련 DOF를 안정적으로 보고 | L3 |
| SPARSE-07 | 5,000 DOF frame | 실제 부재 assembly, 기준 메모리·시간·residual을 모두 만족 | L5 |
| BUCK-01 | preload 선택 | 축력 없는 실행은 조합 선택/생성 안내를 제공 | L4/L5 |
| BUCK-02 | Euler column | 첫 `lambda_cr`가 독립 Euler 값과 일치 | L3 |
| BUCK-03 | 다중 모드 | 요청한 개수의 고유값이 정렬되고 residual 만족 | L3 |
| BUCK-04 | 모드형상 | 정규화·부호 독립 비교에서 reference와 일치 | L3 |
| BUCK-05 | 조합 provenance | KG를 만든 preload 조합과 축력 source를 추적 | L4 |
| BUCK-06 | 무압축 상태 | 정상 숫자를 조작하지 않고 명시적 not-applicable 상태 반환 | L3/L4 |
| THA-01 | SDOF Newmark | 폐합/고정 reference history와 허용오차 내 일치 | L3 |
| THA-02 | record 단위·시간축 | 가속도 단위와 dt 불일치가 차단되고 trace 보존 | L2/L4 |
| THA-03 | 구조 응답 복원 | verified 승격 시 절점·반력·부재력 history와 평형 검증 필수 | L3 |
| THA-04 | preliminary 격리 | THA-03 미통과 시 설계요약 전달 불가, UI/보고서에 preliminary 표시 | L4/L5 |

## 13. 탄성해석 UI

| ID | 검증 내용 | 합격 기준 | 수준 |
| --- | --- | --- | --- |
| EUI-01 | 해석·결과 발견성 | 전체 탄성해석과 1차/P-Delta/모달/RSA/좌굴/THA 결과 바로가기가 탄성 리본에 항상 노출 | L5 |
| EUI-02 | 케이스 재사용 | 전체 재실행 시 중복 케이스를 만들지 않고 사용자 설정 보존 | L4/L5 |
| EUI-03 | 일괄 실행 경로 | 한 번의 실행으로 여섯 탄성 kind/method runner를 모두 호출하고 비선형 케이스는 제외 | L4/L5 |
| EUI-04 | 정적·P-Delta 설정 | 조합과 off/direct/legacy가 저장되고 method trace와 일치 | L4/L5 |
| EUI-05 | 모달·RSA 설정 | 모드 수, 질량원, 조합법, 방향, 감쇠, scale, T:Sa 점이 runner 입력과 일치 | L4/L5 |
| EUI-06 | 좌굴·THA 설정 | preload 조합과 기록 dt/단위/배율/수치열이 손실 없이 저장 | L4/L5 |
| EUI-07 | 상태 동기화 | not-run/running/ok/failed/stale/review/preliminary가 리본과 패널에서 일치 | L4/L5 |
| EUI-08 | 실행/표시 분리 | 결과 바로가기가 해석법을 변경하거나 재실행하지 않고 저장 결과만 전환 | L4/L5 |
| EUI-09 | 단계 안내 | 7단계 순서·완료상태·구조공학적 목적이 현재 모델 상태와 일치 | L4/L5 |
| EUI-10 | legacy 조합 판정 | strength D+L은 오류, service D+L은 사용성으로 구분 | L1/L4/L5 |
| EUI-11 | KDS 프로젝트 승인 | source-attached 조합이 preview hash·검토자·메모 승인 전에는 적용되지 않음 | L4/L5 |
| EUI-12 | 우측 결과 팝업 | 실행 결과가 캔버스 우측에 열리고 설정 패널이 다음 해석 명령을 가리지 않음 | L5 |
| EUI-13 | 결과별 그래프 | 정적/P-Delta/모달/RSA/좌굴/THA 전용 차트·형상에 실제 결과 row가 연결됨 | L4/L5 |
| EUI-14 | P-Delta 응답 일관성 | 전체 곡선의 1차·2차가 동일한 전역 횡절점변위이며 전체/수직변위와 혼용되지 않음 | L2/L4/L5 |
| EUI-15 | 모달·RSA 의미 | 모달 차트는 실제 X/Y/Z 질량참여율, RSA 기본 차트는 계산 변위·밑면전단력 표시 | L4/L5 |
| EUI-16 | 부재 선택 동기화 | P-Delta 상태에서 수직부재 선택 시 중복 패널 없이 부재 탭·그래프 갱신 | L5 |
| EUI-17 | 패널 자동크기 | 내용별 자동 폭·높이, 수동 resize 저장, drag/snap, 본문 overflow가 일관됨 | L5 |
| EUI-18 | 좁은 화면 | 720px 이하에서 fixed inset 전환 후 닫기·탭·본문이 viewport 밖으로 나가지 않고, 데스크톱으로 복귀할 때 우측 저장 위치가 유지됨 | L5 |
| EUI-19 | 결과 바로가기 | 실행 후 각 결과 버튼이 Analysis Center를 열지 않고 해당 케이스 팝업으로 즉시 전환 | L4/L5 |

## 14. 통합 인수·보고서

| ID | 검증 내용 | 합격 기준 | 수준 |
| --- | --- | --- | --- |
| E2E-01 | UX-RC-OFFICE | 정사각형 기둥부터 하중·조합·정적/RSA 보고서까지 UI 완료 | L5 |
| E2E-02 | UX-RC-RESI | 반복층·벽체 등가모델·층결과 흐름 완료 | L5 |
| E2E-03 | UX-RC-PARK | 층별 용도·옥상 조건·배치 하중 편집 완료 | L5 |
| E2E-04 | UX-ST-WH | H/BOX/PIPE·적설/풍·Direct P-Delta 완료 | L5 |
| E2E-05 | UX-ST-PLANT | 사용자 단면·설비/온도·좌굴 preload 완료 | L5 |
| E2E-06 | 실패 복구 | 유효하지 않은 단면/조합/해석 실패 후 데이터 손실 없이 수정·재실행 | L5 |
| E2E-07 | legacy project | migration preview 후 이전 모델과 설명 가능한 결과 비교 | L4/L5 |
| E2E-08 | 전체 회귀 | 기존+Phase 7 자동시험 100% pass, 알려진 flaky 0 | L5 |
| REPORT-01 | 모델 provenance | 모델 hash, 단위계, 재료·단면 source 포함 | L4 |
| REPORT-02 | 하중 provenance | 설계조건, case family, rule-pack 판·source 포함 | L4 |
| REPORT-03 | 분석 provenance | method, combination, solver option, tolerance, convergence 포함 | L4 |
| REPORT-04 | 결과 상태 | verified/candidate/preliminary/unsupported와 경고 포함 | L4 |
| REPORT-05 | 수치 일치 | 보고서 표/그래프 값이 저장 결과와 round-off 범위 내 일치 | L4 |
| REPORT-06 | 재현 링크 | 대상 case/combo/member와 검증 증빙을 식별 가능 | L4/L5 |

## 15. 마일스톤별 필수 게이트

| 마일스톤 | 필수 검증군 |
| --- | --- |
| P7-M0 | GOV, MIG, DIM-01 |
| P7-M1 | SEC, MAT |
| P7-M2 | SEC-UI, MAT-UI, UX |
| P7-M3 | MOD, LAYOUT-01~04 |
| P7-M4 | LOAD, MASS |
| P7-M5 | COMB, GOV-03~04 |
| P7-M6 | LUI, LOAD-AUDIT |
| P7-M7 | STAT, EQ |
| P7-M8 | PD |
| P7-M9 | MODAL, RSA, DIM-02 |
| P7-M10 | SPARSE, BUCK, THA |
| P7-M11 | EUI, E2E, REPORT, LAYOUT-05, 전체 회귀 |

## 16. 성능·UI 기준선 확정 절차

절대 시간과 메모리 숫자는 개발 장비 한 대의 임의값으로 문서에 먼저 고정하지 않는다. P7-M0에서 다음 절차로 기준선을 정한다.

1. 기준 장비와 runtime을 기록한다.
2. 작은/중간/5,000 DOF 실제 frame fixture를 각각 5회 실행한다.
3. warm-up을 제외한 median과 p95, peak memory를 기록한다.
4. 정확도 residual을 만족한 실행만 성능 표본으로 인정한다.
5. P7-M10 목표는 dense 기준 대비 메모리 감소와 정해진 회귀 한계를 동시에 만족하도록 확정한다.

UI는 1366x768, 1920x1080, 2560x1440과 지원 최소 폭에서 스크린샷·클릭 흐름을 검증한다. 캔버스와 그래프는 비어 있지 않은지 픽셀 검사도 함께 수행한다.
