# Phase 7 Current State and Practice Gap Assessment

```yaml
audit_date: 2026-07-10
scope: modeling, section/material library, load setup, elastic analysis result integrity
verdict: usable engineering prototype; not yet a practice-ready default workflow
document_role: pre-implementation baseline
superseded_by: IMPLEMENTATION_STATUS.md (reviewed 2026-07-11)
```

> 이 문서는 Phase 7 착수 당시의 결함 기준선이다. 현재 해결 상태와 검증 근거는
> `IMPLEMENTATION_STATUS.md`와 `VERIFICATION_MATRIX.md`를 기준으로 판단한다.

## 1. 종합 판정

현재 코드에는 필요한 기반 모듈이 상당수 존재한다. 문제의 중심은 기능의 유무보다 **기본값, 연결, 화면 노출, 결과 계약, 검증 근거**다.

- 단면 코어는 파라메트릭·직접 속성을 지원하지만 기본 DB와 메인 UI가 이를 활용하지 못한다.
- 설계조건 하중과 KDS 스타일 조합 생성기도 있으나 신규 프로젝트 기본값과 용어 체계가 실무 흐름을 방해한다.
- 모델링 생산성 도구가 분산되어 있고 단면·로컬축·연결성 검토가 하나의 작업으로 이어지지 않는다.
- 탄성해석은 광범위하지만 일부 고급 결과가 실제 계산 경로와 연결되지 않았거나 차원이 다른 값으로 대체될 수 있다.

Phase 7은 이 상태를 숨기지 않고, 기존 자산을 재사용하면서 실무 경로를 다시 연결한다.

## 2. 단면·재료 현황

| 항목 | 코드 근거 | 현재 상태 | 실무 영향 | Phase 7 조치 |
| --- | --- | --- | --- | --- |
| 기본 단면 DB | `src/core/catalogs.js` | H형강 3개, BOX 1개, RC 직사각형 1개 수준 | 후보 단면 비교와 모델 시작이 느림 | 표준/사무소/프로젝트 계층형 라이브러리 |
| 강재 강종명 | `src/core/catalogs.js`, `src/app/views/library.js` | 기본 카탈로그는 `SS400`, `SM490`; 라이브러리 UI와 제품 문서는 `SS275`, `SM355` 사용 | 생성 경로에 따라 구/신 강종명과 강도가 섞임 | 현행 KS canonical grade + 구명칭 alias + 명시적 migration |
| 지원 형상 | `src/materials/sectionProperties.js` | H, BOX, PIPE, RECT, CIRC 계산 지원 | 정사각형은 `RECT`의 B=H로만 표현되어 사용자가 찾기 어려움 | `SQUARE`를 1급 UI 형상으로 제공하고 RECT와 동일 코어 사용 |
| 사용자 정의 | `src/materials/sectionSchema.js`, `libraryEdit.js` | DB, 파라메트릭, 직접 속성 스키마 존재 | API를 알지 못하면 메인 화면에서 쓰기 어려움 | 단면 편집기, 단위, 미리보기, 검증, 복제·가져오기 |
| 단면 누락 처리 | `src/core/catalogs.js`의 `sectionOf` | 해석할 단면을 못 찾으면 기본 `h300`으로 대체 가능 | 모델 오류가 정상 결과처럼 보이는 중대 위험 | silent fallback 제거, 해석 전 차단, 해결 링크 제공 |
| 직사각형 비틀림 | `src/materials/sectionProperties.js` | solid RECT의 `J`가 극2차모멘트 형태 | Saint-Venant 비틀림 상수와 불일치 가능 | 검증된 직사각형 `J` 식·극한·회귀시험 적용 |
| 메인 라이브러리 UI | `src/app/views/library.js` | 재료 필드 중심, 단면 편집 흐름 미완성 | 사용자 정의 단면의 발견성과 재사용성이 낮음 | 재료/단면 탭, 검색, 필터, 즐겨찾기, 출처 표시 |
| 비대칭·박판 단면 | 현재 6-DOF frame 계약 | warping, shear-center coupling을 직접 풀지 않음 | C/L/T를 무조건 완전 지원이라 부르면 과장 | 주축 정렬·직접 속성 범위만 허용하고 한계를 경고 |

### 단면 지원 등급 제안

| 등급 | 형상 | Phase 7 계약 |
| --- | --- | --- |
| A | RC SQUARE/RECT/CIRC, Steel H/BOX/PIPE | 파라메트릭 속성 계산, 2D 미리보기, 독립 공식 검증 |
| B | C/L/T, built-up 또는 제조사 단면 | 검증된 DB/직접 속성 사용. 주축·비틀림·warping 한계를 명시 |
| C | 임의 단면 | A, Iy, Iz, J 등 직접 입력. 지원하지 않는 coupling은 차단 또는 경고 |

단면 모양이 존재한다는 이유만으로 모든 국부좌굴, warping, 전단중심 효과를 해석한다고 표시하지 않는다.

### 강재 강종 표기 개정 판단

[국가기술표준원 개정 자료](https://kats.go.kr/content.do?cid=18963&cmsid=240&mode=view&page=113)는 건설용 철강재 KS의 강도기준을 상향하고 강종 기호의 숫자 기준을 종전 인장강도에서 설계에 직접 사용하는 항복강도로 변경했다고 설명한다. [KS D 3503의 공식 이력](https://www.standard.go.kr/KSCI/standardIntro/getStandardSearchView.do?ksNo=KSD3503&tmprKsNo=KSD3503)에서 다루는 일반 구조용 압연 강재의 대표 예는 `SS400 -> SS275`다.

현재 `src/core/catalogs.js`의 `Steel SS400`은 `Fy=235`, `Steel SM490`은 `Fy=325`를 저장하지만, 신규 라이브러리 화면은 `SS275`를 기본 ID로 제안한다. 신 강종 숫자는 항복강도 체계이며 강도기준도 함께 바뀌었으므로 **구명칭을 새 문자열로 바꾸는 작업은 허용하지 않는다.**

| 대상 | Phase 7 처리 |
| --- | --- |
| `SS400` | KS D 3503 판을 확인한 `SS275` 대응 후보를 제공하되 기존 `Fy/Fu/allow` snapshot은 그대로 보존 |
| `SM490` 계열 | KS D 3515의 정확한 등급 suffix, 제품형태, 두께구간을 확인한 뒤 `SM355` 계열 후보를 제시. 일괄 문자열 치환 금지 |
| 강관·각형강관의 구 기호 | 해당 KS별 대응표를 별도 fixture로 관리하고 H형강 재료 매핑과 섞지 않음 |
| 외부 파일의 구명칭 | 검색 alias로 인식하고 import preview에서 현행 후보와 물성 차이를 표시 |
| 기존 프로젝트 | 원래 material ID·표시명·물성·결과를 유지하고 사용자가 승인한 transaction으로만 전환 |

재료 레코드는 최소한 `standardCode`, `edition`, `designation`, `productForm`, `gradeBasis`, `thicknessRange`, `mechanicalProperties`, `legacyAliases`를 분리해야 한다. 숫자 `400`, `490`, `275`, `355`만 파싱해 강도를 추정하지 않는다.

## 3. 모델링 현황

| 항목 | 현재 자산 | 빈칸 |
| --- | --- | --- |
| 층·그리드 | grid frame, copy story 계열 자산 존재 | 신규 프로젝트부터 부재 생성까지 일관된 마법사 부족 |
| 부재 역할 | beam/column 역할 추론 자산 존재 | 역할별 기본 재료·단면·회전·릴리스 규칙이 프로젝트 템플릿과 연결되지 않음 |
| 단면 지정 | `secId`를 통한 지정 가능 | 검색·미리보기·다중선택·페인트 지정·층별 일괄 지정 부족 |
| 연결성 | 해석 전 validation 존재 | 모델링 중 중복절점, 교차 미분할, 고립부재를 즉시 고치는 흐름 부족 |
| 로컬축 | 결과 계산에는 필요 | 생성·회전·하중 입력 시 3D 로컬축 확인이 약함 |
| 패널 배치 | floating panel 자산 일부 존재 | 도킹·스냅·크기 저장·화면 밖 패널 복구의 통합 계약 부족 |

실무에서 중요한 것은 선 하나를 그리는 기능보다, 여러 층을 복제한 뒤 잘못 연결된 부재와 잘못 회전한 단면을 빠르게 찾아 수정하는 기능이다. Phase 7의 모델링 마일스톤은 이 검토 루프를 중심으로 한다.

## 4. 하중 케이스·조합 현황

### 4.1 스키마와 기본값

| 항목 | 코드 근거 | 현재 상태 | 문제 |
| --- | --- | --- | --- |
| 신규 하중 케이스 | `src/core/schema.js` | 기본 `D`, `L` | 실제 프로젝트 조건을 표현하기에 부족 |
| 신규 조합 | `src/core/schema.js` | `KDS22-ST-01/02` 검토 후보와 `SLS1` 사용성 baseline | 강도 후보는 프로젝트 승인 전 설계 확정값으로 취급하지 않음 |
| 수동 조합 추가 | `src/core/combinations.js` | 모든 존재 케이스가 1.0으로 시작 | 사용자가 불필요한 계수를 지우다 오류를 만들기 쉬움 |
| 케이스 type | `src/core/schema.js` | dead/live/wind/seismic/snow/roof/other/user | 법정 하중 종류와 규칙 엔진 기호가 완전히 대응하지 않음 |
| KDS 스타일 조합 | `src/core/kdsLoadCombinations.js` | D/L/Lr/S/R/W/E/H/F/T 기호와 preliminary preset | 정식 기준 규칙 엔진으로 승인하기 전 출처·판·조건·fixture 부족 |
| 설계조건 리본 | `src/ui/indexNativeLoadBasisRibbon.js` | 용도, 지역, 지반, 중요도, D/L/Lr, W/E와 Preview/Apply 존재 | 기능은 있으나 밀도가 높고 자동값의 근거·적용 범위가 불명확 |
| 용도별 preset | 같은 UI 모듈 | office/residential 등 소수 D/L 값 하드코딩 | 바닥 용도·칸막이·설비·저장 조건을 한 값으로 일반화할 위험 |

### 4.2 실무 하중 분류와의 차이

[건축물의 구조기준 등에 관한 규칙 제9조](https://www.law.go.kr/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=1001190817)는 고정, 활, 지붕활, 적설, 풍, 지진뿐 아니라 토압·지하수압, 온도, 유체, 운반·설비 및 그 밖의 하중을 고려하도록 요구한다. 현재 저장 스키마는 이 일부를 `other`에 몰아넣어 규칙 적용, 보고서 분류, 누락 검사가 어렵다.

Phase 7은 최소한 아래 load family를 구분한다.

`D`, `L`, `Lr`, `S`, `R`, `W`, `E`, `H`, `T`, `F`, `EQUIPMENT`, `CONSTRUCTION`, `OTHER`

각 family는 실제 케이스 ID와 다르다. 예를 들어 `W` family 아래 `W+X`, `W-X`, `W+Y`, `W-Y`가 존재하고, `E` family에는 방향·부호·우발편심 케이스가 존재할 수 있다.

### 4.3 실무 시작 템플릿 제안

템플릿은 설계값을 몰래 확정하는 목록이 아니라 **확인해야 할 질문과 필요한 하중 family를 준비하는 도구**다.

| 템플릿 | 기본 질문 | 제안하는 family |
| --- | --- | --- |
| RC 업무/주거/학교/병원 | 층별 용도, 칸막이, 기계실, 옥상, 지하외벽 | D, L, Lr, S, W, E, 필요 시 H/T/EQUIPMENT |
| RC 주차장 | 차량구역, 램프, 충격·방호, 옥상 주차 | D, L, S, W, E, EQUIPMENT/OTHER |
| 철골 창고/공장 | 저장품 등급, 크레인, 설비, 지붕, 온도 | D, L/Lr, S, W, E, T, EQUIPMENT |
| 일반 빈 프로젝트 | 아무 계수도 확정하지 않음 | 사용자가 family와 기준 판을 선택할 때까지 `unconfigured` |

용도별 활하중 크기나 조합 계수는 공식 규칙 팩에서 가져와 미리보기로 승인하며 UI 소스에 직접 하드코딩하지 않는다.

## 5. 탄성해석 코드 검토에서 이어받을 결함

다음 항목은 기능 개선이 아니라 결과 신뢰도와 직접 관련된 Phase 7 release blocker다.

| ID | 심각도 | 확인된 상태 | 영향 | Phase 7 마일스톤 |
| --- | --- | --- | --- | --- |
| EA-01 | Critical | `src/results/rsa/baseShearScale.js`가 실제 밑면전단력이 없을 때 변위값으로 fallback 가능 | 길이 차원의 값이 힘으로 보고될 수 있음 | P7-M9 |
| EA-02 | Critical | UI의 P-Delta 옵션이 Direct tangent 경로보다 legacy 등가 횡하중 반복을 실행 | 사용자가 선택한 해석법과 실제 계산법 불일치 | P7-M8 |
| EA-03 | High | Direct P-Delta 반환에 reaction, member station force, combo envelope가 없음 | 실무 결과·설계 연결 불가 | P7-M8 |
| EA-04 | High | sparse 경로가 CSC를 dense로 되돌리고 실제 frame assembly도 dense | 큰 모델 확장성 주장 불가 | P7-M10 |
| EA-05 | High | 모달/RSA가 정적 모델의 다이어프램·등가부재 계약과 완전히 일치하지 않으며 구조 응답 복원이 부족 | 모드 기반 부재력·층응답 신뢰 부족 | P7-M9 |
| EA-06 | High | RSA 층결과 일부가 RSA가 아니라 정적 케이스에서 만들어질 수 있음 | 화면 제목과 데이터 출처 불일치 | P7-M9 |
| EA-07 | High | 평형 audit가 힘 중심이며 모멘트 평형이 빠짐 | offset·분포하중·모멘트 오류 탐지 약함 | P7-M7 |
| EA-08 | High | 고정지점 침하가 검증을 통과해도 실제 prescribed DOF로 적용되지 않을 수 있음 | 지점침하 결과 오류 | P7-M7 |
| EA-09 | Medium | 부재 중간모멘트, offset, 부분 회전릴리스 구현이 근사 또는 제한적 | 특정 모델에서 단부력·변형 오차 | P7-M7 |
| EA-10 | Medium | 인장/압축 전용 부재는 비활성화 후 재활성화가 제한됨 | 반복해석 활성집합 오류 가능 | P7-M7 |
| EA-11 | Medium | 좌굴은 기본 실행에서 기준 축력이 없어 실패할 수 있고 최저 모드 중심 | 일반 사용 흐름과 결과 검토 부족 | P7-M10 |
| EA-12 | Medium | THA는 스칼라 모드 응답 중심 preliminary 구현 | 구조 전체 응답이라고 표시하면 과장 | P7-M10 |
| EA-13 | High | 일부 검증이 동일 구현의 자기 일치 확인에 의존 | 독립 정답과 다른 오류를 놓칠 수 있음 | 전 마일스톤 |

실제 shell FEM이 아닌 wall/slab equivalent frame/link 경로는 결함으로 숨기지 않고 기존 범위를 유지한다. UI와 결과에서 등가모델임을 계속 표시한다.

## 6. 우선순위 판정

### Release blocker

- 단면 누락 시 silent fallback
- 구/신 KS 강종명이 생성 경로마다 다르고 기존 물성을 보존하는 migration이 없음
- 근거 없는 신규 조합 기본값
- RSA 변위-to-힘 fallback 및 정적 데이터 혼입
- UI 선택과 다른 P-Delta 실행
- 공식 규칙 팩 출처·버전·적용조건 누락
- force-only 평형 검토로 인한 주요 오류 미탐지

### High value usability

- 정사각형 RC 기둥 및 사용자 정의 단면 편집
- 단면 검색·다중 지정·로컬축 미리보기
- 프로젝트 설계조건에서 케이스·질량원·조합 한 번 생성
- 하중 표시·필터·복사·일괄 수정·재생성
- 층·그리드·부재 역할 템플릿과 연결성 수리
- 패널 도킹·스냅·크기·위치 저장과 화면 밖 복구

### 후속 또는 별도 범위

- 실 shell FEM
- warping 자유도와 고급 박판 비틀림
- 비탄성 상세설계
- 범용 BIM round-trip

## 7. 현재 자산 재사용 원칙

Phase 7 구현은 다음 자산을 제거하지 않고 계약을 강화한다.

- `sectionSchema.js`, `sectionProperties.js`, `libraryEdit.js`: 단면 코어와 편집 API
- `indexNativeModeler.js`: 모델 생성·선택·속성 편집 진입점
- `indexNativeLoadBasisRibbon.js`: 설계조건 입력의 초기 자산
- `kdsLoadCombinations.js`: 규칙 팩 엔진으로 승격할 초기 자산
- `analysisRunners.js`: 해석 케이스 실행 연결점
- Phase 6 solver/verification 모듈: 독립 reference를 추가해 재검증할 후보 구현

기존 파일이 있다는 사실은 완료 증거가 아니다. [VERIFICATION_MATRIX.md](VERIFICATION_MATRIX.md)의 대응 ID를 통과한 자산만 `verified`로 승격한다.
