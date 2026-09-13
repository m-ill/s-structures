# Phase 7 Development Hub - 실무형 모델링, 하중 설정, 탄성해석 완성

```yaml
phase: 7
status: implementation-complete
release_status: candidate
start: 2026-07-10
mission: 구조설계자가 모델 작성부터 하중 설정, 탄성해석 결과 검토까지 반복 업무를 빠르고 추적 가능하게 수행하도록 제품 흐름과 해석 신뢰도를 함께 완성한다.
primary_users:
  - 구조설계 실무자
  - 모델 작성 담당자
  - 검토 책임자
```

## 1. Phase 7의 정의

Phase 7은 새 해석 기능을 많이 보이는 단계가 아니다. 이미 존재하는 기능을 구조설계 실무자가 **틀리지 않게 찾고, 빠르게 입력하고, 결과의 근거를 확인할 수 있는 제품**으로 정리하는 단계다.

현재 프로그램에는 단면 계산, 사용자 정의 단면 API, 설계기준 하중 리본, 조합 생성기, 선형 정적해석, P-Delta, 모달/RSA/좌굴/THA 자산이 있다. 그러나 다음 문제가 실제 사용을 막는다.

1. 표준 단면이 매우 적고, 정사각형 기둥이나 사용자 정의 단면을 화면에서 자연스럽게 만들 수 없다.
2. 존재하지 않는 단면을 기본 H형강으로 조용히 대체하는 등 입력 오류가 결과에 섞일 수 있다.
3. 하중 케이스, 하중조합, 해석 케이스의 구분이 약하고 신규 모델의 조합이 사실상 `1.0D + 1.0L` 두 개뿐이다.
4. KDS 스타일 자동 생성 기능은 있지만 preliminary 규칙과 화면이 분리되어 있어 실무자가 신뢰하기 어렵다.
5. 앞선 코드 검토에서 RSA 밑면전단력, Direct P-Delta 연결, sparse 풀이, 평형 검토 등 결과 신뢰도와 관련된 미완성 항목이 확인됐다.

따라서 Phase 7은 아래 네 트랙을 하나의 사용자 흐름으로 묶는다.

| 트랙 | 목표 |
| --- | --- |
| A. 단면·재료 | 표준/사무소/프로젝트 단면 라이브러리와 안전한 사용자 정의 편집 |
| B. 모델링 | 층·그리드·부재 역할 중심의 빠른 생성, 배치 지정, 검증 가능한 편집 |
| C. 하중·조합 | 프로젝트 설계조건에서 하중 케이스·질량원·조합을 한 번에 생성하고 출처를 추적 |
| D. 탄성해석 | 정적, Direct P-Delta, 모달/RSA, 좌굴의 결과 계약과 검증을 실무 검토 수준으로 마감 |

## 2. 실무 기준의 출발점

Phase 7의 하중 체계는 다음 공식 자료를 기준 출처로 관리한다.

- [건축물의 구조기준 등에 관한 규칙 제9조](https://www.law.go.kr/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=1001190817): 고정, 활, 지붕활, 적설, 풍, 지진, 토압·지하수압, 온도, 유체, 운반·설비 등 설계하중 종류와 조합 고려 의무
- [국토교통부 고시 제2022-570호, 건축구조기준 전부개정](https://www.molit.go.kr/USR/I0204/m_45/dtl.jsp?gubun=&idx=17605&lcmspage=125&old_search_dept_nm=&psize=10&search=&search_dept_id=&search_dept_nm=&search_regdate_e=&search_regdate_s=&srch_usr_ctnt=N&srch_usr_nm=N&srch_usr_num=&srch_usr_titl=N&srch_usr_year=): KDS 41 계열 기준 원문 패키지
- [국토교통부 고시 제2024-846호, 건축구조기준 일부개정](https://www.molit.go.kr/USR/I0204/m_45/dtl.jsp?gubun=&idx=18415&lcmspage=1&old_search_dept_nm=&psize=10&search=%EA%B1%B4%EC%B6%95%EA%B5%AC%EC%A1%B0&search_dept_id=&search_dept_nm=&search_regdate_e=&search_regdate_s=&srch_usr_ctnt=Y&srch_usr_nm=N&srch_usr_num=&srch_usr_titl=Y&srch_usr_year=): 후속 개정 이력
- [국가건설기준센터](https://kcsc.re.kr/): 기준 코드, 개정 및 정오표 확인 창구. 2026-07-10 확인 시 2026-04-16자 `건축구조기준(KDS 41 00 00/KDS 42 00 00) 개정안 의견조회`가 게시되어 있으므로, 고시된 기준과 의견조회 중인 초안을 분리 관리한다.
- [국가기술표준원 건설용 철강재 KS 개정 자료](https://kats.go.kr/content.do?cid=18963&cmsid=240&mode=view&page=113): 건설용 강재의 강종 숫자 기준을 종전 인장강도에서 항복강도로 변경하고 강도기준을 상향한 개정 취지
- [e나라 표준인증 KS D 3503](https://www.standard.go.kr/KSCI/standardIntro/getStandardSearchView.do?ksNo=KSD3503&tmprKsNo=KSD3503): 일반 구조용 압연 강재의 현행 판과 제·개정 이력

자동 생성 규칙은 출처 파일의 `기준 코드`, `판`, `개정`, `공표 상태`, `시행일`, `검증일`을 함께 저장한다. `draft` 또는 의견조회 자료는 비교·사전검토에만 사용할 수 있고 기본 설계값으로 자동 적용하지 않는다. 프로그램은 법적 판단을 대신하지 않으며, 사용자가 선택하지 않은 프로젝트 조건이나 확인되지 않은 계수를 숨겨서 적용하지 않는다.

## 3. 용어 계약

| 용어 | Phase 7에서의 뜻 | 예 |
| --- | --- | --- |
| 하중 케이스 | 계수를 곱하기 전의 물리적 하중 묶음 | `D`, `L-OFFICE`, `W+X`, `E-Y` |
| 하중조합 | 여러 하중 케이스와 계수의 조합 | 강도, 사용성, 변위, P-Delta, 기초 검토 조합 |
| 해석 케이스 | 해석 방법과 입력 조합을 묶은 실행 설정 | 1차 선형, Direct P-Delta, 모달, RSA |
| 질량원 | 고정하중 및 활하중 일부를 동적 질량으로 변환하는 규칙 | `MASS-KDS-01` |
| 설계조건 | 지역·용도·구조형식·지붕·지하층·설비 등 자동 생성의 입력 | 프로젝트 설계기준 설정 |
| 규칙 팩 | 특정 기준 판에 따라 케이스·조합을 만드는 버전 고정 데이터 | `KDS-41-12-00@2022` |

UI, 저장 스키마, 보고서에서 이 용어를 섞어 쓰지 않는다.

## 4. 범위

### 포함

- 정사각형 RC 기둥을 포함한 단면 형상·표준 단면·직접 속성 단면
- 단면 검색, 즐겨찾기, 최근 사용, 복제, 가져오기, 일괄 지정
- 층·그리드 기반 모델 생성과 연결성·중복·로컬축 확인
- 법정 설계하중 종류를 수용하는 하중 케이스 분류
- 구조형식·용도별 프로젝트 시작 템플릿과 설계조건 마법사
- 버전이 고정된 KDS 조합 규칙, 미리보기, 병합, 재생성
- 하중 표시·필터·복사·일괄 편집·생성 출처 추적
- 앞선 탄성해석 검토에서 확인된 결과 신뢰도 결함의 마감
- 작업공간 패널 배치 저장, 크기 조절, 도킹·스냅, 초기화
- 입력, 해석, 보고서의 단위·기준·경고·한계 추적

### 제외

- 실제 shell FEM 및 slab local stress/plate deflection
- 비탄성 재료설계, 상세 접합설계, 시공단계해석
- 기준의 법적 적합성을 무조건 보증하는 자동 승인
- 지원하지 않는 warping/비틀림 자유도를 일반 3D 프레임 결과인 것처럼 표시
- 검증되지 않은 외부 단면 DB를 출처 없이 내장

## 5. 제품 원칙

1. **조용한 대체 금지**: 단면, 재료, 하중, 단위, 기준 판을 찾지 못하면 해석을 막고 해결 방법을 제시한다.
2. **Smart default는 제안**: 자동값은 출처와 적용 조건을 보여주며 사용자가 승인해야 모델에 반영한다.
3. **Preview before apply**: 자동 생성은 추가·변경·삭제 목록을 먼저 보여준다.
4. **한 번 더 눌러도 같은 결과**: 템플릿과 조합 생성은 idempotent해야 하며 중복을 만들지 않는다.
5. **일반 경로는 짧게, 전문 경로는 완전하게**: 기본 템플릿과 직접 편집을 함께 제공한다.
6. **결과에는 근거가 따라간다**: 해석 방법, 조합, 기준 판, 입력 해시, 경고, 근사 한계를 결과와 보고서에 남긴다.
7. **차원 오류는 구조적으로 차단**: 변위가 힘으로 대체되는 식의 단위 혼용은 타입·계약·테스트에서 실패해야 한다.

## 6. 문서 읽는 순서

1. [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)
2. [CODEBASE_REVIEW.md](CODEBASE_REVIEW.md)
3. [CURRENT_STATE_AND_PRACTICE_GAPS.md](CURRENT_STATE_AND_PRACTICE_GAPS.md)
4. [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md)
5. [MILESTONE_EXECUTION_PLAN.md](MILESTONE_EXECUTION_PLAN.md)
6. [ELASTIC_ANALYSIS_UI_PLAN.md](ELASTIC_ANALYSIS_UI_PLAN.md)
7. [VERIFICATION_MATRIX.md](VERIFICATION_MATRIX.md)

## 7. Phase 7 종료 조건

다음 조건을 모두 만족할 때만 Phase 7을 완료로 표시한다.

- 대표 5개 프로젝트 fixture가 UI만으로 모델·하중·조합·해석까지 실행된다.
- 정사각형 RC 기둥, 표준 H/BOX/PIPE, 사용자 정의 직접 속성 단면이 저장·지정·재해석된다.
- 신규 프로젝트는 현행 KS 강종명을 사용하고, 구 강종명 프로젝트는 기존 물성을 보존한 채 명시적 migration을 제공한다.
- 신규 프로젝트에 의미 없는 `1.0D + 1.0L` 강도/사용 조합을 자동 확정하지 않는다.
- 공식 출처에 고정된 조합 규칙 fixture가 계수, 부호, 적용 조건을 모두 통과한다.
- 정적, Direct P-Delta, 모달/RSA 핵심 결과가 독립 이론값 또는 외부 기준값과 허용오차 내에서 일치한다.
- RSA 밑면전단력에 변위가 대입되는 경로와 Direct P-Delta 우회 경로가 제거된다.
- 전체 회귀 테스트, 5,000 자유도 실제 프레임 성능 시험, 마이그레이션 시험이 통과한다.
- 사용자 매뉴얼과 결과 보고서가 구현 상태, 근사, 미지원 범위를 정확히 표시한다.

통과하지 않은 항목은 `완료`가 아니라 `candidate`, `preliminary`, `blocked` 중 하나로 표시한다.
