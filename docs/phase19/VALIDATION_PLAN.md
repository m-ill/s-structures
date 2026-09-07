# Phase 19 검증·생산 판정 계획

2026-09-07 · 모든 수치·성능은 **시험 목표**이며 현재 달성 결과가 아니다.

## 합격 판정 8개

| Gate | 필수 확인 |
|---|---|
| G1 기준선·지원 범위 | clean candidate 코드·의존 버전·입력·규칙·결과 결속, 현 코드의 관련 Critical/High 미해결 0, 구버전 모델 회귀 |
| G2 제품 경로 동등성 | UI·기존 Agent·WebMCP의 입력·수치·지배항목·OK/NG/WARN/미검토·차단 이유·보고서 일치 |
| G3 수치 자격 | 독립 기준·사전 허용오차, 비선형 Q1 외부 비교 2건 및 Q5 pilot 5건 독립 검토, 지원 범위 명시 |
| G4 실행·복구 | 중복 실행 0, 실제 취소·Worker 해제, 실패/재시도/새로고침/손상 checkpoint/모델변경 처리 |
| G5 성능·브라우저 | 실제 생산 backend로 S/M 전체경로, 고정 장비에서 기존 지연·메모리·실행시간 목표 충족 |
| G6 보고서·파일 | 결과 snapshot만으로 생성, 숨은 solver 호출 0, JSON/CSV 정밀도·HTML/PDF 시각 QA·환경별 export 확인 |
| G7 도구 경계 | schema·단위·ID·권한·세션·revision 검증, 원자적 변경·Undo, 크기 제한, unsupported 명시 |
| G8 동일 버전 배포 | 해당 범위 필수 회귀·브라우저 E2E·증거·ZIP·배포가 동일 candidate에 결속, 필수 skip/timeout/flake/미실행 0 |

G3는 기능별로 적용한다. 19A에 비선형 외부 비교를 요구하지 않지만, 비선형의 생산 자격은 Q1/Q4/Q5가 충족되기 전까지 계속 보류한다. 개발 프리뷰를 공개할 수 있다는 사실과 생산 자격 취득을 혼동하지 않는다.

| 배포 | 필수 기능·성능 시험 | 판정 조건 |
|---|---|---|
| 19A | 탄성 종류·설계·보고서, 강재/RC 전 과정, 두 진입 URL·기록 복구 | 해당 기능의 G1~G8. 기존 설계 모듈의 preliminary/최종설계 제한 유지 |
| 19B | 19A 회귀 + steel/RC Pushover·fiber/PMM·M-tier 정적 | 정적 범위 독립 비교·성능·pilot 상태를 별도 기록. 기존 전체 Q5를 충족하지 않으면 전체 commercial-grade 주장 금지 |
| 19C | 19A/B 회귀 + MDOF NLTH·M-tier 동적·동적 pilot | 전체 계획의 G1~G8 및 기존 Q1/Q4/Q5 조건 충족 후 해당 범위 생산 판정 |

각 배포는 정직한 제한을 표시한 프리뷰로 먼저 공개할 수 있다. 기능별 생산 승격에는 해당 검증이 실제로 필요하며, 미구현 최종 설계 기준을 이번 연결 작업만으로 지원한다고 표시하지 않는다.

## 탄성설계 시험 matrix

| 사례군 | 관측값과 판정 |
|---|---|
| 단일 강재 보·세장 기둥 | 휨·전단·압축·세장비·사용성·지배조합, 정상 및 NG |
| RC 보·기둥 | 철근량·전단·축력/휨 검토와 미입력·한계 초과, 정상 및 NG |
| 강재/RC 혼합 | 재료와 단면 분류, 적용 기준, 미지원 부재 분리 |
| 강재·RC 대표 골조 | 입력→하중·질량·조합→1차/P–Delta→동적해석→설계→보고서 전체흐름 |
| 사용성/강도 조합 | 두 조합 목적을 혼용하지 않음, 포락 부호·위치·지배조합 추적 |
| 결과·설계 조건 변경 | 단면/재료/유효길이/철근/설계기준 변경 후 stale와 설계전달 차단 |
| 비정상 흐름 | 누락 하중, 특이 모델, 해석 실패/취소, 이전 성공 결과 존재, 무지원 설정 |
| 편집·호환성 | 단위 변환, manual 입력 보존, preview/apply 충돌, 중복·변조 요청, Undo/Redo, 저장·재열기 |

UI/Agent/WebMCP가 동일 서비스·backend를 사용하는 시험은 반올림 전 canonical data와 결과 hash를 비교한다. OS/backend가 다르면 동일 hash를 무리하게 요구하지 않고 사전에 정한 수치 허용오차로 비교한다. 설계 독립 기준값은 생산 설계 모듈을 호출해 생성하지 않는다.

## 비선형 시험 계층

| 계층 | 시험 | 필수 근거 |
|---|---|---|
| 재료·단면 | elastic limit, yield, unloading/reloading, reversal, cyclic loop, PMM coupling, fiber 정련 | 독립 접선 대조, 축/부호/단위, 이력·소산에너지, trial/commit/revert |
| 요소·초기상태 | corotational 객관성, 강체회전, 중력 preload, zero-length 조립, 단부해제 지원 | 힘·모멘트 평형, 접선 대조, checkpoint 동일성 |
| 비선형 정적 | 집중힌지 cantilever, steel frame, RC fiber frame, load/displacement 계약, 검증된 arc-length | 전체 용량곡선·항복시점·힌지·증분 수렴·종료 원인 |
| 비선형 동적 | 독립 SDOF anchor, 선형한계, steel/RC MDOF, 1~3성분 입력 | dt/2·dt/4, peak 및 peak time, 잔류변형, 힘·운동/변형/소산/감쇠/입력 에너지 |
| 결함 주입 | max iteration, minimum step, singular tangent, nonfinite, unsupported mass/release, 손상 checkpoint | 실패가 성공으로 승격되지 않음, 마지막 수렴 상태와 시각 보존 |

반복 내 잔차·변위 증분·에너지 증분 기준과 전체 경로 에너지 평형 기준을 별도로 둔다. 값이 0에 가까운 채널은 분모 하한과 절대 허용오차를 사용한다. 단위·정규화·reference·probe·허용오차는 결과를 보기 전에 사례 manifest에 동결하며 한 개 공통 백분율로 모든 문제를 판정하지 않는다.

기존 외부 비교 조건은 독립 오픈소스 solver나 공개 수치표를 허용하는 범위를 [release manifest 코드](../../src/nonlinear/qualification/releaseManifest.js)에서 재확인한다. OpenSees 등을 사용할 경우 검증 전용 환경에서 입력·출력·버전을 기록하며 제품 runtime 의존성으로 추가하지 않는다. 상용 프로그램을 실행하지 않았다면 그 결과를 주장하지 않는다.

## 실제 브라우저 시험

Node 수치시험, fake DOM, injected runner는 회귀로 유지한다. 예를 들어 기존 `p8-m10-product-ui`의 synthetic 결과와 `p8-m8-production-nlth`의 작은 reference backend 시험은 실제 배포 Worker 검증을 대신하지 않는다.

1. 같은 원본 fixture를 분리된 새 세션에 로드해 UI·Agent·WebMCP에서 각각 실행한다.
2. 실제 module Worker와 계획된 생산 WASM/backend의 ID·build·실행 경로를 기록한다. reference/dense 경로가 금지된 시험은 fallback 발생 시 실패 처리한다.
3. 강재 Pushover, RC fiber/PMM Pushover, MDOF NLTH를 실제로 끝까지 실행해 상태·단계/시간·수치·화면·보고서를 대조한다.
4. 중간 모델 편집, 두 번 시작, queued/running 취소, Worker crash, 새로고침, 취소 후 새 실행, 손상 checkpoint, 메모리 초과를 시험한다.
5. 최상위 index, app 호스트, 프로젝트 전환, 미지원 일반 브라우저를 확인한다. 이전 iframe/세션의 도구 호출은 새 프로젝트에 적용되지 않아야 한다.
6. 공개 정적 Pages와 Node/데스크톱 실행에서 각각 지원하는 보고서 산출물을 확인한다. 자동 PDF transport가 없는 환경의 인쇄 fallback을 성공한 자동 export로 집계하지 않는다.

## 성능 기준

[기존 Phase 8 성능 계약](../../src/nonlinear/performanceBaseline.js)을 우선 사용한다. 다음 수치는 아직 지원 성능으로 광고할 수 없는 목표다. M0에서 장비·fixture·backend를 고정하고 기준 변경이 필요하면 측정 전에 근거를 기록한다.

| 항목 | 기존 목표 |
|---|---|
| 측정 | warmup 1회 + 측정 5회, median/p95/peak memory/result bytes |
| M Pushover | 10,000 active DOF·15,000 요소 fixture, 중력 20단계·저장 100단계, 10분 이내 |
| M NLTH | 상한 10,000 active DOF·15,000 요소, 최소 5,000 active DOF, 입력 20,000 step, 30분 이내 |
| UI 입력·차트 | p95 100 ms 이하 |
| 진행 갱신 | 최대 1초 간격 |
| 취소 응답 | 2초 이하; 실제 계산 종료·메모리 해제 시점은 별도 기록·예산화 |
| M preflight | 5초 이하 |
| 캐시 결과 첫 표시 | 500 ms 이하 |
| peak 분석 메모리 | 1.5 GiB와 가용 메모리 60% 중 작은 값 이하 |

S/M 실측을 마친 범위만 지원 규모로 공개한다. 기존 L fixture는 이번 M-tier 합격으로 자동 자격을 얻지 않는다. Phase 15의 동일 환경 10회 NFR 조건이 해당 release에 적용되면 별도 수행하며 위 5회 성능 측정으로 대체하지 않는다.

## CI 구성과 최종 후보 검증

- PR: 입력/서비스/도구 계약, 강재·RC 수치, nonlinear state/작은 골조, 기존 13개 회귀, 변경 영향 범위.
- 통합 후보: Phase 7~15의 필수 전체 회귀와 P17/P18/P18A 및 신규 Phase 19 matrix. 최종 후보의 동일 소스에서 실행하고 과거 PASS를 합산하지 않는다.
- 브라우저: 최소 지원되는 Site tools 환경의 실제 도구 호출과 일반 브라우저 조작. 각 해석 kind의 진행·취소를 확인한다.
- 성능·독립비교: 기준 장비에서 별도 실행하되 release candidate와 hash로 결속한다. GitHub hosted runner 시간을 성능 기준값으로 사용하지 않는다.
- 배포: Windows·Ubuntu 검증, clean 설치·저장 복구·rollback, GitHub Pages 및 로컬 Node smoke. 미실행 필수 항목이 있으면 생산 승인 보류다.

## 저장·공개할 증거 구조

아래는 신규 제안 경로다. 기존 Phase 8/15/18 결과에 덮어쓰지 않는다.

```text
verification/specs/phase19/                 # 지원범위·reference·probe·tolerance 고정본
verification/fixtures/phase19/              # 공개 가능한 정규 입력
verification/evidence/phase19/<run-id>/
  run-manifest.json                        # commit/tree/build·환경·실행시각·종료코드
  inputs/                                  # model/case/design/ground-motion snapshot
  results/                                 # full-precision 결과·수렴·에너지·판정
  comparisons/                             # 독립 비교 및 UI/Agent/WebMCP 대조
  browser/                                 # 실제 도구 호출 기록·로그·필요 화면
  reports/                                 # 같은 snapshot의 HTML/JSON/CSV/PDF
  SHA256SUMS.txt
```

run manifest에 test planned/executed/pass/fail/skip/timeout/flake, 수치 프로브 수, 자격 상태를 따로 적는다. 해시만으로 독립 재현성을 주장하지 않으며 입력·허용오차·runner·원본 결과를 함께 제공한다.

작은 재현 입력·명세·회귀시험은 Git에, 큰 시간이력·브라우저 기록·보고서는 release candidate별 evidence archive에 보관하고 저장소에서 manifest와 Release 링크로 연결한다. 제3자 원문은 사용권을 확인한 출처 metadata와 허용된 수치만 게시한다. 내부 원본과 공개용 사본의 연결 해시를 보존하며 비공개 자료가 필요한 시험은 공개 재현 한계를 명시한다.

## 판정과 담당

- 구현 담당: 제품 서비스·UI·WebMCP 및 엔진 연결, 계약/회귀 자동화.
- 수치 검증 담당: 사전 reference/probe/tolerance 작성과 원본 실행 대조. 구현 결과를 정답으로 재사용하지 않는다.
- 검토 담당: 지원 범위·가정·자격 증거의 독립 검토. 실제 담당·검토시각·대상 hash를 기록한다.
- 배포 담당: 같은 candidate의 G1~G8 및 산출물 무결성 확인.

M0에서 실제 담당을 지정한다. 에이전트의 코드 리뷰나 자동 PASS를 독립 공학 검토 서명으로 대체하지 않는다. 필수 외부 입력이 없으면 구현을 진행할 수 있으나 최종 상태는 완료 대신 구체적인 `BLOCKED` 이유를 유지한다.

## M3 실행 기록

고정 커밋 `7683047ac3552672bd0c2dad8ae0919c6ae989e5`에서 [M3 manifest](../../verification/specs/phase19/m3-tests.json)의 34개를 별도 checkout으로 실행해 모두 PASS했다. [증거](../../verification/evidence/phase19/m3/README.md)에 로그 SHA와 실제 브라우저 다운로드 파일을 보존한다. P11 모의 PDF adapter 시험 및 PDF용 HTML 데이터 동등성은 실제 PDF 생성·레이아웃 검증과 구분한다. 전체 생산 자격이나 기존 STRIX 비교 범위를 확대하지 않는다.

## M4 실행 기록

최종 소스 `0c4142ff1f08af4cea4f75b4867165353f66c797`에서 [M4 manifest](../../verification/specs/phase19/m4-tests.json)의 39개를 별도 checkout으로 실행해 모두 PASS했다. [증거](../../verification/evidence/phase19/m4/README.md)에 원본 로그·SHA, 실제 Site tools의 강재/RC 보고서와 프로젝트 전환을 보존한다. 브라우저는 c9f8eca 전체 흐름, b1f389c 고유 핸들 보강 후 강재 흐름을 구분한다. 이후 비보안 crypto fallback은 최종 회귀에서 검증했다. 자동 PDF·비선형 자격·브라우저 matrix는 별도다.
