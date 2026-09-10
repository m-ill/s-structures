# Phase 21 메모리·작업 수명·복구 계획

2026-09-10 · **계획·초기 예산 제안**. 실제 heap/RSS 실측이나 leak 수정 완료를 뜻하지 않는다.

## 관측과 원인 추정의 구분

- [기존 결과 준비 캐시](../../src/compute/product/preparedResultViews.js)는 32개/16 MiB **직렬화 바이트**를 제한한다. 준비 중 clone·JSON stringify·인코딩, UI 반환 clone, 다른 저장소와 실제 heap 전체의 상한은 아니다.
- [workflowResults.js](../../src/compute/product/workflowResults.js)는 analyses/designs/plans Map을 보유한다. analysis 레코드에 result와 legacyRecord를 각각 복제하고, read도 전체 레코드를 복제한다. 해당 모듈에 바이트 예산·퇴출·dispose API가 없다.
- [elasticReviewService.js](../../src/compute/product/elasticReviewService.js)는 plan 64개, request 128개 제한이 있지만 reports Map에는 별도 바이트 예산이 없다. `getReport`가 전체 보고서를 clone한다.
- [get_report_artifact](../../src/ui/webmcp/workflowTools.js)는 위 전체 보고서를 읽은 뒤 12,000자를 slice한다. 작은 조각 반환이 전체 보고서의 작은 메모리 비용을 보장하지 않는다.
- [analysisProductService.js](../../src/compute/product/analysisProductService.js)의 dispose는 abort·구독 정리를 하지만 jobs/delegated payload의 보유·참조 해제는 별도 점검이 필요하다. [Worker client](../../src/compute/runtime/workerClient.js)에는 terminate/detach/취소 정리가 이미 있으므로 이를 재작성하기보다 모든 종료 경로에서 실제 도달하는지 검증한다.
- 상가주택 원본 보고서는 HTML 1,341,046자, JSON 3,751,531자, CSV 1,093,469자였다. **문자 수는 heap 또는 UTF-8 바이트 수가 아니다.** 전체 HTML은 확보했지만 원래 JSON/CSV는 미완성이다.
- 16개 동시 조각 조회 중 `Inspected target navigated or closed` 뒤 세션이 초기화됐다. OOM, renderer crash, 호스트/사용자 탐색 등 원인이 확인되지 않았다. 메모리 부족으로 단정하거나 새 코드의 leak 수정 증거로 사용하지 않는다.

## 소유권과 해제 정책

아래 정책은 구현 목표다. 한 자원을 여러 store가 참조해도 소유자는 한 곳이며 bytes는 중복 집계하지 않는다. 실제 복제본은 각각 집계한다.

| 자원 | 소유 책임·현재 경계 | 목표 보유/해제 정책 |
|---|---|---|
| 입력·모델 스냅샷 | 프로젝트/실행 서비스 | inputHash당 immutable 소유본. 실행은 동일 입력을 pin. 편집은 새 세대 생성. 종료 후 불필요한 실행 복제 해제 |
| T·Ke·Kg·Kt·분해·잔차 scratch | solver/Worker session | 한 작업의 소유 자원. topology 재사용과 수치 접선 갱신 구분. 임계하중 탐색 중 전체 tangent를 모두 보관하지 않음 |
| 수치 결과 | analysis catalog | 큰 payload 한 소유본 + 작은 legacy projection/참조. summary·선택 slice만 조회. 영속 저장·hash 검증 후 비활성 payload 퇴출 가능 |
| 설계·demand package | design catalog | run/조합/규칙 참조, 계산 check 소유본. source result 복제 금지. 누락·퇴출 참조를 OK로 반환하지 않음 |
| 준비 view·UI 도형/차트 | prepared views/UI | 기존 상한 유지 + 전체 ledger에 포함. 선택 해제/모델 교체 시 참조 해제. 준비 중 activeWork와 pending도 관측 |
| 보고서·포맷별 원본·조각 | artifact repository | snapshot당 포맷 생성 1회. immutable 저장·범위 읽기. 전체 clone 없이 작은 범위 반환. 세션 handle은 작은 참조만 보유 |
| plan·request·workflow/job metadata | 서비스/WebMCP 세션 | 개수/바이트/수명 제한. idempotency fingerprint·terminal metadata는 큰 결과와 분리. 만료 요청은 명시적 EXPIRED로 처리 |
| Worker·AbortController·listener·pending promise | 실행/호스트 세션 | complete/failed/cancelled/disposed 모두 정리. 취소 ACK와 실제 계산 종료를 구분. 늦은 응답 generation 검사 |
| typed array·WASM·GPU buffer | allocator/backend session | alloc/free 또는 acquire/release ledger. transfer는 소유권 이전 후 원본 참조 사용 금지. GPU 회수 검증은 실제 backend에서 수행 |
| Blob URL·캡처·다운로드 staging | UI/export | 완료/취소/오류 후 URL revoke·staging 정리. 보존 대상 캡처는 저장 완료 확인 뒤 임시 메모리 해제 |
| durable model/run/artifact | 저장 adapter | 모델·manifest transaction과 content hash 검증. RAM 캐시와 별도 quota. active/보고서 참조/사용자 보존 자료는 임의 삭제하지 않음 |

`structuredClone`을 일괄 제거하지 않는다. 내부 immutable 참조는 공유하고, 외부 변경 가능 반환값은 **요청 범위만** 복제해 수정 격리를 유지한다. transferable은 호출자가 계속 읽어야 할 결과를 detach하지 않도록 전용 소유 버퍼에서만 사용한다.

## 예산: 초기 제안과 확정 절차

M0에서 장비·브라우저·backend·fixture·측정 도구를 고정한 뒤 아래 제안을 검토해 `resource-budgets.json`(제안)에 봉인한다. 기준을 변경하면 측정 전에 이유와 변경 버전을 남긴다. 아래 숫자는 현재 성능이나 지원 용량의 광고값이 아니다.

| 항목 | 초기 제안 | 판정 방법 |
|---|---|---|
| 준비 view | 기존 32개/16 MiB serialized 상한 유지 | entries/bytes/pending뿐 아니라 builders의 실제 peak도 측정 |
| UI 측 관리 저장소 총량 | 256 MiB 계상 예산 | model/result/design/view/report/pending의 소유 바이트 합. JS heap 전체 상한으로 표현하지 않음 |
| 제품 해석 동시 실행 | 기본 1개, bounded queue | 메모리 사전 예약 후 시작. 취소 job이 실제 종료되기 전 무제한 다음 작업 시작 금지 |
| 보고서 읽기 | 기본 active 2개 + queue 최대 8개 | 초과는 BUSY/retry 안내. 응답은 현행 48 KiB 등 실제 전송 계약 이내. clone·encoding peak 포함 |
| plan/request/handle | 기존 64/128개 제한을 출발점으로 bytes도 제한 | 큰 payload 제거. 만료/중복 request semantics와 세션 격리 보존 |
| Worker 자원 예약 | 기준 장비에서 우선 512 MiB를 검토 | full/reduced DOF, dense/sparse, 분해·변환·복제 peak로 admission. 실측 전 지원 규모 확정 금지 |
| 전체 분석 peak | 기존 목표 `min(1.5 GiB, 가용 메모리 60%)` 유지 | 측정 가능한 플랫폼에서 process/renderer/worker 포함 범위를 기록. 가용량을 모르면 비율 기준 통과를 주장하지 않음 |
| 준비된 결과 첫 표시 | 기존 목표 500 ms 이하 | warm cache, 고정 S/M fixture에서 p95; 전체 결과 clone 비용 포함 |
| UI 반응·진행·취소 ACK | 기존 목표 p95 100 ms / 갱신 간격≤1초 / 취소 ACK≤2초 | 실제 브라우저 측정. 계산 종료·메모리 회수 시간은 별도 측정 |
| 취소 후 종료·자원 정리 | cooperative 5초 이내 목표, 초과 시 bounded terminate | terminal 전 신규 publish 금지. 강제 종료를 정상 수렴으로 기록하지 않음 |

기존 성능 기준은 [Phase19 검증 계획](../phase19/VALIDATION_PLAN.md)과 충돌 없이 관리한다. Phase19의 nonlinear M-tier(10,000 DOF 등)를 Direct가 자동 지원한다고 하지 않는다. Direct 전용 중간 규모 fixture는 M0에서 full/reduced DOF·요소·조합·station·구속 수를 명시해 확정한다.

단일 dense f64 행렬은 최소 `8*n*n` 바이트이며 Ke/Kg/Kt·축약계·분해·transform·복제의 동시 생존량을 합산한다. 현재 JS 중첩 Array는 이 단순 f64 계산보다 더 클 수 있다. **축약 후 DOF만으로 메모리 예측하지 않는다.** 다이어프램 포함 시 공통 constraintSystem은 dense transform과 sparse rows를 함께 만들므로, 이 경로의 비용을 반드시 계측한다.

예산 확보 순서는 `추정 → 소유 예약 → allocation → 실사용 정산 → finally 해제`다. 예약할 공간이 없으면 먼저 검증된 저장/퇴출을 수행하고 그래도 부족하면 크기·필요량·지원 범위를 알려 차단한다. 선택 중이거나 미저장된 유일 결과를 지워 억지로 해석을 시작하지 않는다.

## 최적화 우선순위

1. **조각당 전체 보고서 clone 제거:** artifact 범위 읽기를 사용한다. 파일 전체 생성·직렬화는 한 번 수행하고 사전에 예산을 예약한다. JSON/CSV가 큰 경우 iterator/stream 저장으로 중간 문자열 peak도 제한한다.
2. **동일 결과의 소유본 중복 제거:** workflow result의 result와 legacyRecord를 참조/projection으로 연결한다. 전체 조회 호환 API는 예산을 검사하고, 새 내부 소비자는 summary/slice를 사용한다.
3. **불필요한 반복 계산 제거:** 한 조합 요청이 전체 조합을 반복하는 경계를 M3에서 고친 뒤 같은 fixture로 시간·할당·결과 bytes를 비교한다. envelope/선택 의미는 유지한다.
4. **실행과 화면 수명 정리:** clear cache가 진행 중 builder를 멈추지는 않는다. activeWork/abort/generation과 늦은 완료를 함께 관리하고 이전 모델 closure가 남지 않게 한다.
5. **solver scratch 최적화:** full dense와 reduced 표현을 중복 보유하는 구간을 줄인다. 수치 분해는 Kt 변경마다 무효화한다. sparsity/topology 재사용과 수치 행렬 재사용을 분리한다.
6. **profiling으로 확인한 구간만 확장:** dense T가 지원 규모의 gate를 넘기면 sparse constraint 경로를 확장하거나 규모를 제한한다. 성능을 위해 구속 정확도·f64 검증·반력 복원을 생략하지 않는다.

## 저장·내보내기·재시작

### 정상 보존

프로젝트 입력과 완료 결과 manifest를 content hash로 결속한다. 큰 artifact는 조각별 저장 후 전체 길이/hash 검증이 끝난 transaction에서만 `complete`로 전환한다. 사용 중 artifact를 참조하는 보고서가 있으면 pin을 유지한다. 저장 quota가 부족하면 필요한 공간·미저장 자료를 알리고 검증 가능한 파일 내보내기를 제공한다.

Pages의 브라우저 저장소 adapter와 로컬/서버 adapter를 구분한다. IndexedDB 등 durable adapter는 **구현 제안**이며 브라우저에서 사용할 수 있는지 확인해야 한다. 저장소 접근 거부·quota 초과·transaction 실패를 시험한다. sessionStorage/localStorage 존재만으로 대용량 결과의 안전한 보존을 주장하지 않는다.

### 조각 전송

- 원본의 `artifactId, snapshotHash, format, encoding, totalLength, fullHash`를 먼저 확정한다.
- 기존 v1의 UTF-16 문자 offset/12,000자 계약은 호환 adapter에서 보존한다. 새 byte range 계약을 추가한다면 protocol version·encoding을 명시한다. 문자 수를 byte offset으로 바꾸지 않는다.
- 모든 조각에 range와 검증 가능한 hash를 붙인다. 한글/서로게이트 경계, 빈 파일, 마지막 조각, 같은 offset 재요청, 중복/역순/누락·변조를 시험한다.
- 재개는 manifest에 기록된 artifact를 기준으로 한다. 다른 run의 내용과 이어 붙이지 않는다. 누락 범위만 재요청하고 전체 hash가 맞아야 원본 완전본이라고 표시한다.
- 과거 native JSON/CSV 부분본에 새 결과 조각을 이어 붙여 완성하지 않는다.

### 장애와 복원

reload/host 교체 시 이전 session handle은 폐기한다. 재열기 후 저장된 프로젝트와 artifact를 확인하고 새 세션에서 새 접근 handle을 발급한다. 파일 ID를 알기만 하면 타 프로젝트 결과에 접근할 수 없도록 기존 출처·세션 검증을 유지한다.

실행 중 계산은 검증된 checkpoint가 없으면 `interrupted`다. 이번 Phase의 필수 복구 범위는 **모델·완료 결과·완료/부분 artifact와 내보내기 재개**다. Direct 반복 중간 상태를 자동 재개하는 기능은 snapshot에 하중 단계·T/input hash·solver version·committed state가 완전하고 동등성이 검증된 경우에만 추가한다. 그 외에는 마지막 입력에서 명시적으로 다시 실행한다.

시작 샘플은 복구 가능한 프로젝트를 조용히 덮어쓰지 않는다. 손상/이전 버전 입력은 원본을 남기고 새 복원본을 만든다. 분석 hash가 달라지면 기존 결과는 stale이고, 복구 화면이 열린 사실만으로 결과 자격을 회복하지 않는다.

## 측정과 합격 조건

측정은 JS heap, external/ArrayBuffer/WASM, GPU 할당, renderer/Worker/process RSS, durable storage, 관리 ledger를 구분한다. 지원되지 않는 측정 항목은 `not-measured`다. 서로 겹치는 heap/RSS를 단순 합산해 peak를 부풀리지 않으며, RSS 감소만으로 참조 누수 없음이라고 하지 않는다.

고정 환경에서 warmup 후 동일 단계 30회 반복을 초기 계획으로 한다. 분석/조회/보고서/모델 교체/취소를 각각 측정하고 두 번째 새 프로세스에서 재현한다. 준비·분해·복원·clone·직렬화·전송·해제 구간마다 bytes·지연·자원 수를 기록한다. M0에서 표본 수와 잡음 처리 규칙을 결과 확인 전에 고정한다.

초기 제안 인수 기준은 다음과 같다.

- 완료·취소·실패·dispose 뒤 job scratch/pending/구독/전송 예약이 0 또는 명시한 상시 자원만 남는다. GPU는 이중 destroy 없이 resource balance를 만족한다.
- 동일 pin/저장 정책에서 30회 이후 retained heap 증가가 시작 기준 대비 `max(10%, 16 MiB)` 이내이고 후반 반복에 양의 선형 누적 경향이 없어야 한다. 측정용 GC 가능 환경과 일반 브라우저 자연 GC 결과를 구분한다. 이 기준만 통과해 leak이 없다고 판정하지 않고 ledger·retainer 확인을 함께 요구한다.
- pin된 자료를 보존한 채 총 관리 예산을 넘지 않는다. 계산/전송 peak가 확정한 장비 예산을 넘으면 해당 규모 FAIL이다.
- 기본 읽기 2개와 1/4/8/16개 요청 폭주에서 admission/backpressure가 작동한다. 렌더러 장애를 강제로 일으켜야 통과하는 시험이 아니다. 작업 초과는 명시적 거부/대기로 처리하고 다른 프로젝트·입력을 잃지 않는다.
- 강제 reload·Worker 실패·저장 거부 뒤 완전본 hash는 동일하고, 부분본은 부분본으로 표시된다. 분석 중단을 성공으로 복구한 횟수와 자료 혼합은 0이다.
- 성능 전후 비교는 동일 수치 fixture·backend·장비에서 수행한다. 메모리 최적화로 변위·부재력·반력·자격이 바뀌면 수치 gate 실패다.

## M5 구현 상태 (2026-09-10)

현재 구현/시험 프로토콜은 verification/specs/phase21/resource-budgets.json과 EXECUTION_LOG.md를 따른다. 본문의 초기 제안·기존 경로 설명은 변경 전 관측으로 보존한다. 256MiB는 보수적으로 계상한 관리 데이터 예산이고 renderer·DOM·V8 코드·OS 전체 메모리가 아니다. 실제 브라우저와 M 규모의 peak·재시작 자격은 M6 측정 전까지 미검증이다.
