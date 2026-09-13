# Phase25 M7 RC 반복 Worker 예약 소유권 점검

2026-09-13 · 범위: WORKPACKAGES M7의 종료 실패·중간 취소·clone 전 예산 조건. 전체 M7 완료 감사가 아니다.

## 재현과 수정

`createRcServiceWorkflow`는 clone 전 working-set 예약을 만들었으나 `runRcServiceWorker`에 budget/예약을 전달하지 않았다. Worker 종료가 실패하면 `finally`에서 예약을 지우므로, 실제 Worker가 남아 있어도 관리 메모리가 0이 되고 새 실행을 허용할 수 있었다.

작은 RC workflow 경계 시험에서 취소→종료 실패 후 예약 1,051,744 bytes가 0이 되는 RED를 재현했다(`focused-2026-09-12T23-14-08-374Z`). 처음 23-13-54 실행은 시험용 factory 연결 전의 RED이며 실제 자원 누락 재현은 23-14-08이다.

`candidateAnalysisClient`에 내부 `workerReservationOwner` 인자를 추가하고 RC workflow가 clone 전에 확보한 동일 owner/estimatedBytes를 전달한다. 예약을 이중 계상하지 않으며 Worker 종료 미확인 시 해당 owner를 quarantine한다. 이후 호출부 finally/dispose는 예약을 지울 수 없다. 다음 실행은 WORKER_TERMINATION_UNCONFIRMED로 거부하고 실제 exit 신호가 와야 예약을 해제한다. 기존 shared-computation 호출자는 계속 독립 owner를 사용한다. 해석 수치/단위/KDS 판정식은 변경하지 않았다.

## 집중 증거와 적용 범위

- `focused-2026-09-12T23-14-30-530Z`: RC 예약 경계1160ms, 실제 Node Worker 취소/timeout633ms, 늦은 factory105ms, 공개 Direct/안정/사용성/복원5485ms PASS.
- 실제 동기 CPU 루프 Worker에서 취소 후 종료 및 후속 counter 정지를 확인했다. 기록된 cancel exitMs=14.6298ms. timeout 경로도 실제 exit 후 managedBytes=0. 이는 Node 측정이며 브라우저 UI 250ms 또는 전체 JS heap 증거가 아니다.
- `focused-2026-09-12T23-15-21-582Z`: 불필요한 시험 대기 timer 정리 및 clone 이전 예산 거부를 추가한 RC 시험160ms, 기존 shared subscriber 예약57ms PASS.
- Proxy 원 모델은 sizing에 사용 가능하지만 structuredClone할 수 없다. 1 byte 예산에서 clone 오류가 아니라 MANAGED_MEMORY_BUDGET_EXCEEDED를 반환하고 Worker factory 호출0/active=false/예약0임을 확인하여 clone 전 거부 순서를 검증했다.

## M7 마감에 남은 확인

이번 증거로 RC 반복의 종료 실패 시 조기 해제라는 실제 연결 누락을 수정했다. M7 전체 마감에는 원래 N/2N·PDF/font/URL·snapshot/restore 소유권, source/page cap 및 실행환경별 한도 대장의 현재 버전 대응을 함께 확인해야 한다. UI 취소 지연 목표는 브라우저 계측 없이 충족으로 표기하지 않는다. 최대 규모·장시간 JS heap·GPU 자격은 원래 Q 캠페인에 남긴다. M0~M9 PARTIAL/M10 미마감 유지.


## 2026-09-13 M7/M9 분할 변위장 복원 검증

RC policy12 현재 판본의 checkpoint는 checksum/프로파일/분할 trace를 확인했으나 새 memberServiceResponses의 누락·연속성·저장 극값을 검사하지 않았다. `verifyRefinedFrameServiceResponses`를 restore의 복사/등록 전에 연결했다. 최대30부재, 부재별2~8구간, forceRecoveryInput 길이와 변위장 길이, 부재 ID, 구간 연속성 및 실제 구간 변위에서 다시 준비한 결과와 저장된 극값/metadata의 일치를 검증한다. 손상은 RC_CHECKPOINT_INVALID로 거부한다. 구판은 기존 정책상 stale 처리하며 현재 판본으로 재결속하지 않는다.

직접 oracle 검사에서는 정상2/4/8분할, 필드누락, 극값변조, 구간변위 불연속을 확인했다. 실제 공개 WebMCP로 저장한 checkpoint의 RC 상태에서 변위장 누락/극값변조 후 내부 resultHash와 checksum까지 다시 계산하여도 restore가 거부하고 결과0건·예약0을 유지하는 것을 추가 확인했다. 정상 공개 저장→복원→재평가는 계속 통과한다. 새 검증은 형상/보존 데이터 검증이며 별도 구조 재해석을 실행하지 않는다.

focused-2026-09-12T23-18-18-862Z: 분할/변위검증983ms, 공개경로5468ms PASS. 실제 저장 상태 손상 주입을 추가한 focused-2026-09-12T23-19-01-355Z 5434ms PASS. 실제 브라우저·종합 수치·전체heap 캠페인 미실행. M7/M9 및 전체 Phase의 원래 마감 조건은 계속 남아 있다.


## 2026-09-13 M7/M9 출력 폰트·다운로드 실제 소유권 수정

drawingExportService의 waitForAbort는 사용자 대기만 끝낼 수 있다. 취소에 응답하지 않는 폰트 loader가 여전히 pending일 때 finally가 예약을 즉시 해제하던 결함을 수정했다. 이제 출력 종료와 폰트 로딩 settle이 모두 확인되어야 예약을 해제한다. timeout/cancel은 즉시 반환하되 늦은 성공·실패는 artifact로 등록하지 않는다. 실제 Worker 종료 실패의 기존 quarantine 경로는 유지된다.

N/2N 취소 후 미완료 폰트 작업의 예약은67,109,056/134,218,112bytes다.150MiB 예산에서 세 번째 출력은 loader 호출 전에 거부된다. dispose도 살아 있는 loader 예약을 해제하지 않는다. 각 late resolve/reject 후 자신의 예약만 회수하고0으로 돌아온다. 동기 loader 예외도 해제된다. RED focused-2026-09-13T00-00-32-100Z → GREEN00-00-55(폰트317ms, 실제 PDF bundle17384ms).

indexPracticalDesign의 조립 Uint8Array와 Blob URL도 공통 메모리 장부에 없었다. drawingDownloadResources를 연결하여 청크 조회/배열 복사 전에2*파일크기+65536bytes를 예약한다. 파일당32MiB, 동시 살아 있는 lease8개 제한이다. URL이 살아 있는 동안 예약을 유지하고 타이머 또는 pagehide에서 revoke 후 회수한다. pagehide 시 진행 중인 read는 caller가 실제 settle할 때까지 예약을 보존한다. URL revoke 실패 시도 해제를 가장하지 않고 예약을 유지해 clearUrls에서 재시도한다. 실제 main UI는 bridge.getResourceBudget의 공통 장부를 사용하므로 기존 runtime/WebMCP 자원 조회에도 포함된다. 독립 호스트만 별도 bounded 장부를 사용한다.

UI RED focused-2026-09-13T00-03-55-711Z → GREEN00-04-53. 최종 focused-2026-09-13T00-05-50-385Z: download lease58ms, 설치 UI196ms, font/실제 CSV Worker lifecycle316ms PASS. UI 시험은 예산 부족 시 chunk 조회0회, pending read 중 pagehide 후 조기 해제 없음, late 완료 시 예약0 및 URL 수명까지 검증한다. fake DOM의 설치 UI 시험이며 실제 브라우저 heap/UI250ms 측정으로 주장하지 않는다.

현재 evaluator195의 평가 N/2N 집중 재확인(focused-2026-09-13T00-01-58-446Z2934ms):1부재29검사 retained410260/peak2556336bytes,2부재58검사 retained611310/peak3394896bytes. cache 재사용과 dispose0 확인. 모든 수치는 관리 데이터 추정이며 JS heap 측정은 아니다. 숫자 해석식과 PDF 내용은 변경하지 않았다. 전체 M7 환경별 한도/복원 대응 감사 및 M8 실제 대표 페이지/M9 실제 브라우저 경로는 계속 잔여다.
