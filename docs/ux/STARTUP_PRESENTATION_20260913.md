# 최초 접속 시 구형 화면 노출 수정

원인: index.html의 기존 모델러 DOM이 먼저 paint되고, indexBridge.js의 모듈 그래프 로딩 후 native ribbon/workspaceUx가 DOM을 재구성한다. 첫 접속의 모듈 다운로드 시간 동안 이전 UI가 드러나며 실제 문서 재탐색은 아니다.

수정: head의 인라인 초기 스타일로 구형 DOM의 visibility를 숨기되 크기 측정은 유지한다. 고정된 준비 화면을 표시하고 installIndexEngineBridge 완료 후에만 최신 화면을 노출한다. 모듈 다운로드 실패와 설치 예외는 오류 안내, 장시간 대기는 연결 확인 안내와 재시도를 제공한다. 모델·해석·저장 계약은 변경하지 않는다.

실제 브라우저 검증:

- indexBridge 요청을 보류한 동안 startup=loading, topbar visibility=hidden.
- 요청 허용 후 startup=ready, topbar visibility=visible, bridge 설치 완료, navigation entry=1.
- 모듈 요청 중단 시 startup=failed, 구형 화면은 계속 숨김.
- 다시 시도 클릭 후 정상 ready 복구.
- 로딩/완료/실패 화면을 각각 캡처해 로컬 작업결과/startup-ui-20260913에 보관.

이 변경은 다운로드 시간을 줄이는 최적화가 아니라 초기 화면 전환을 안정화하는 수정이다. 모듈 분할·지연 로딩은 별도 성능 작업이다.
