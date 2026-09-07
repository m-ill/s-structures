# S-Structures

**브라우저에서 구조 모델링·해석·결과 검토를 수행하고, WebMCP로 AI 에이전트와 같은 모델을 함께 다루는 구조해석 웹앱입니다.**

[웹에서 실행](https://m-ill.github.io/s-structures/) · [다운로드·검증자료](https://github.com/m-ill/s-structures/releases/tag/webmcp-preview-20260906) · [21개 벤치마크 비교](docs/verification/STRIX21_COMPARISON.md) · [WebMCP 안내](docs/WEBMCP.md) · [CI 결과](https://github.com/m-ill/s-structures/actions/workflows/verify.yml)

문서 갱신: **2026-09-06** · 공개 상태: **WebMCP 개발 프리뷰**

로컬 후속 개발: **Phase 19 M0~M2**의 공통 결과 계약과 탄성설계 입력 변경 서비스를 구현했습니다. 탄성해석 탭의 ‘설계 입력 변경’과 Agent가 같은 미리보기·원자적 적용·실행취소 경로를 사용합니다. 공개 링크의 버전과는 다르며, 신규 WebMCP 설계 도구는 M4 범위입니다. [실제 진행 상태](docs/phase19/IMPLEMENTATION_STATUS.md) · [M2 입력 API](docs/phase19/M2_CONTRACT.md)

## 주요 기능

| 영역 | 제공 기능 |
|---|---|
| 구조 모델링 | 3D 절점·부재, 재료·단면 라이브러리, 구속·단부 해제, 층 복사, 하중·조합 편집 |
| 탄성해석 | 3D 프레임, P–Delta, 모달, 응답스펙트럼, 고유치 좌굴, 선형 시간이력 |
| 확장 엔진 | 막·판·셸, 탄성지반, 강체격막, 탄성링크, 비선형 힌지·pushover 등. 기능별 입력·실행·검증 상태를 별도로 표시 |
| 결과 검토 | 변형도, 부재력·반력, 하중조합 포락, 모드·시간 스텝, 평형·오차, 결과별 설계 전달 가능 상태 |
| 검토·보고서 | 강재·RC 검토, 지배조합·계산 근거 추적, 보고서·PDF, JSON 모델 저장, 도면·메모 작업 |
| 에이전트 연동 | WebMCP 도구 9개로 모델 조회·점검, 기존 케이스 검증·계획·실행, 결과 조회 |

엔진 구현 여부와 특정 모델의 검증 완료 여부는 구분합니다. 실행 가능 경로와 차단 이유는 케이스별 capability·validation 결과에서 확인합니다. CPU가 기본이며 GPU의 미구현·미검증 조건을 자동으로 우회하지 않습니다.

## Reference와의 비교: 21개 벤치마크

STRIX 공개 검증군 21개를 대상으로 **Reference·STRIX 공개 대표값과 S-Structures의 로컬 실행 결과를 비교·정리**했습니다. 비교 보고서 기준일은 **2026-08-29**이며, 이후 공개 버전의 회귀 검증은 아래에 따로 기록합니다.

핵심 수치 기능 경로는 21개 모두에 대해 내부 검증 기록이 있습니다. 대표 응답 또는 체크포인트를 직접 수치비교한 항목은 13개, 동등한 허용기준을 적용한 항목은 2개입니다. 나머지 6개는 동일모델 입력이 완전히 확정되지 않았습니다.

| 비교 보고서의 구분 | 수 | 사례 |
|---|---:|---|
| 로컬 공학 수치비교 PASS | 9 | SB1, SB2*, SB3, SB5, SB6, SB7, SB8, SB9, SB10 |
| 수치 PASS · 추가 검증 보류 | 2 | PD1, SM5 |
| 엔진 체크포인트 PASS | 2 | SH1, TH1 |
| 동등 판정기준 PASS | 2 | SP1, P3S2 |
| 기능 PASS · 동일모델 입력 미완료 | 6 | SB12, SM5b, SM6, SR1, SR2, SR2b |

### 대표 수치

비교 보고서의 대표 관측값입니다. 오차는 비교에 사용한 Reference 대비 절대 상대오차이며, 모든 출력값에 대한 최대 오차를 뜻하지 않습니다.

| 사례 · 관측량 | Reference 비교값 | S-Structures | 절대 상대오차 |
|---|---:|---:|---:|
| SB1 · 캔틸레버 끝 처짐, mm | −0.107865168539326 | −0.107865168539326 | 약 3.86×10⁻¹⁴% |
| SB2* · 응력, MPa | 92.7 | 90.857425808 | 1.98767% |
| SB3 · Cook's membrane 정규화 변위 | 23.91 | 23.883277671 | 0.111762% |
| SB8 · Timoshenko 보 1차 진동수, Hz | 102.149414 | 102.149358888 | 0.000053953% |
| PD1 · 인장 P–Delta 처짐, in | −0.543305 | −0.543304756 | 0.000044825% |

SB1처럼 수치 정밀도 수준에서 일치하는 항목도 있지만, **21개 모두의 응답이 Reference와 동일하다는 결과는 아닙니다.** SB2*의 S-Structures 값은 D점 최근접 Gauss점의 최대주응력으로, 공개 접선응력과 관측 위치·성분의 동등성 검토가 남아 있습니다. PD1은 단계별 일-평형 증거, SM5는 독립 모드벡터 확인이 추가로 필요합니다.

[21개 전체 수치·단위·판정·제한사항](docs/verification/STRIX21_COMPARISON.md) · [기계판독 비교 요약](docs/verification/strix21-comparison-summary.json)

공개 기준값과 로컬 계산을 비교한 결과이며, STRIX·MIDAS를 독립적으로 재실행한 외부 공인 검증은 주장하지 않습니다. 사례별 허용오차·관측량·입력 완전성을 함께 읽어 주세요.

## 공개 버전 검증

| 검증 | 확인된 결과 | 확인 범위 |
|---|---|---|
| GitHub Actions | Windows·Ubuntu 각각 **13/13** | WebMCP·명령 브리지·공개 API 계약·P17 프레임워크·P18/P18A 회귀 |
| P18 엔진 시험 | **10개 사례 · 86개 프로브**, 실패 0 | 잔여 엔진 경로의 내부 수치 시험. 공식 21개 전체 동일문제 비교와 별도 |
| P18A 추가 비교 | **SP1·P3S2·XV1 통과** | XV1은 공식 21개에 포함하지 않는 별도 교차비교 |
| 실제 WebMCP 브라우저 | 정적 샘플 실행·결과 조회·중복 요청 재사용 확인 | 8절점·8부재·3개 하중조합, 화면 최대 변위 4.733mm |
| 보완 회귀 | 수정 후 Phase 8·15 통과 | 커밋·범위·이전 실패와 수정 기록을 증거 패키지에 구분 |

2026-09-06 공개 병합 커밋은 [`fab4783`](https://github.com/m-ill/s-structures/commit/fab4783de045532beb35d46a648f1742e337c9c0)입니다. [해당 CI 실행](https://github.com/m-ill/s-structures/actions/runs/34008817393)과 [Release 증거](https://github.com/m-ill/s-structures/releases/tag/webmcp-preview-20260906)에서 확인할 수 있습니다. 테스트 실행 단위 수를 공인 벤치마크 합격 수로 계산하지 않으며, 최종 개발 커밋에서 `npm test` 전체 단일 실행 PASS를 주장하지 않습니다.

## WebMCP: 모델 조회부터 해석 결과까지

지원 브라우저의 최상위 모델러가 `document.modelContext.registerTool`로 도구를 등록합니다. 에이전트가 현재 모델의 단위·케이스를 읽고 기존 제품 API로 해석을 실행한 뒤, 결과를 사용자 화면과 함께 확인합니다. [OpenAI Site tools 문서](https://learn.chatgpt.com/docs/webmcp)

| 도구 | 역할 |
|---|---|
| `get_project_context` | 모델 해시·단위·케이스·계산 대상 지원 상태 조회 |
| `inspect_model` | 해석을 실행하지 않고 모델 점검 |
| `select_entities` | 기존 절점 또는 부재를 화면에서 강조 |
| `validate_analysis` | 기존 케이스의 입력과 실행 경로 검증 |
| `plan_analysis` | 해석 계획·차단 조건 확인 |
| `start_analysis` | 해석 시작, 작업 ID 반환 |
| `get_analysis_status` | 진행 상태·오류·출처·모델 변경 여부 조회 |
| `get_result_slice` | 완료된 결과의 필요한 부분 조회 |
| `cancel_analysis` | 현재 세션에서 시작한 작업의 취소 요청 |

**사용 순서**

1. 지원 브라우저에서 [모델러](https://m-ill.github.io/s-structures/index.html)를 직접 엽니다.
2. UI의 **해석 케이스 → 추가**로 케이스를 만듭니다.
3. 에이전트가 `get_project_context`로 `caseId`·`modelHash`를 읽고 검증·계획합니다.
4. `start_analysis`에 고유 `requestId`를 전달하고, 반환된 `jobId`로 상태·결과를 조회합니다.

예시 요청: “현재 모델의 단위와 해석 케이스를 확인하고, 정적 케이스를 검증한 뒤 CPU로 해석해 결과와 경고를 설명해 줘.”

현재 WebMCP 범위는 **정적·모달·RSA·고유치 좌굴·선형 시간이력**입니다. 입력 복제본과 해시로 실행을 묶고, 같은 요청 ID의 재시도는 기존 작업을 반환합니다. 모델이 바뀌면 결과에 `stale`을 표시합니다. 세션당 최대 128개 요청, 동시 1개 작업이며 모델 편집·임의 코드 실행·파일 쓰기는 노출하지 않습니다.

일반 브라우저 UI와 WebMCP 지원 여부는 별개입니다. API가 없는 브라우저에서는 일반 UI를 사용하며 iframe 안에서는 도구를 등록하지 않습니다. 브라우저·제품별 지원 조건과 호출 계약은 [WebMCP 안내](docs/WEBMCP.md)를 참고하세요.

## 실행하기

### 웹에서 사용

[https://m-ill.github.io/s-structures/](https://m-ill.github.io/s-structures/)

웹 모델러는 기본 골조 샘플에서 시작합니다. 로그인·서버 저장이 필요한 기능은 Node 서버로 실행하는 환경을 사용합니다. GitHub Pages는 정적 웹앱 호스팅입니다.

### 로컬 실행

Node.js 24 기준입니다. 루트 앱 실행에는 별도의 npm 패키지 설치가 필요하지 않습니다.

```sh
git clone https://github.com/m-ill/s-structures.git
cd s-structures
node server/main.mjs 5173
```

`http://127.0.0.1:5173/index.html`을 엽니다. [Release의 실행 ZIP](https://github.com/m-ill/s-structures/releases/tag/webmcp-preview-20260906)을 풀어 같은 명령으로 실행할 수도 있습니다. 모델 JSON은 현재 **스키마 v6**를 사용합니다.

### 검증 실행

```sh
node tools/run-public-validation.mjs validation-local-001
npm run test:p18
```

첫 명령은 존재하지 않는 출력 폴더에 시각·코드 식별자·런타임·종료코드·로그 SHA-256을 기록하며 같은 폴더를 덮어쓰지 않습니다. 추적 파일 변경이 없는 별도 checkout에서 실행하세요. 과거 증거 재생성 명령은 고정 경로에 파일을 쓸 수 있으므로 [공개·검증 안내](docs/PUBLICATION.md)를 먼저 확인하세요.

## 문서와 다운로드

| 자료 | 내용 |
|---|---|
| [사용자 매뉴얼](docs/user-manual/README.md) | 모델링·해석·결과·보고서 사용법 |
| [21개 비교표](docs/verification/STRIX21_COMPARISON.md) | Reference와의 수치 비교 및 사례별 판정 |
| [P18 엔진 상태](docs/phase18/IMPLEMENTATION_STATUS.md) | 엔진 실행 경로와 동일모델 입력 보류 항목 |
| [검증 워크스페이스](verification/README.md) | 명세·테스트·실행 증거의 구조 |
| [WebMCP 안내](docs/WEBMCP.md) | 지원 환경·도구 계약·실행 제한 |
| [Release](https://github.com/m-ill/s-structures/releases/tag/webmcp-preview-20260906) | 공개 소스, 실행 ZIP, 로컬·GitHub CI 증거, SHA-256 |

Release의 `s-structures-public-source.zip`은 공개 시 CI 정리 수정을 포함한 소스입니다. `s-structures-source.zip`은 개발 커밋 `fa12565`의 보존 스냅샷이며 런타임·기존 증거와의 연결을 위해 별도로 유지합니다. 최신 문서는 이 저장소의 main을 기준으로 읽어 주세요.

## 사용 범위와 라이선스

현재 배포는 개발 프리뷰입니다. 수치 시험 통과와 특정 구조물의 설계 적합성은 별도 판단이며 모델 가정·단위·경계조건·수렴·검토 기준과 결과의 차단 상태를 확인해야 합니다. 독립 검증과 실무 승인 절차를 대체하지 않습니다.

**© 2026 단국대학교 허석재 박사 · All rights reserved.**  
문의: mill@dankook.ac.kr · [LICENSE.txt](LICENSE.txt)

기존 독점적 라이선스를 유지합니다. 저장소 공개가 사용·복제·수정·재배포 권한을 부여하는 것은 아닙니다.
