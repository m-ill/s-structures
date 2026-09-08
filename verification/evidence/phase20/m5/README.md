# Phase20 M5 최종 검증 증거

최종 런타임 `810abc06fe9be38eb7bb10f1ba590cbcb87f36be` · Node24.16.0 · 로컬/Windows CI/Ubuntu CI 각각 **112/112 PASS**.
CI: https://github.com/m-ill/s-structures/actions/runs/34177589220

원본 validation의 소스·manifest와 336개 최종 test log SHA-256을 대조했다. 이전 후보 R1의 111개 로그·브라우저 실패 관찰·성능을 별도 폴더에 보존했다. 이 개수는 시험 실행 수이며 독립 공인 검증 건수가 아니다.

- 7개 기준 탄성 결과의 결정적 수치·public API 정확 동등성, 직접 경계 위반 41→0, cycle0, 호환/현역 정책22개·공개 bridge1개 확인.
- 옛 공개 policy 날짜4개의 raw 발견은 보존하며 Phase20 registry가 소비자·source hash·검토 조건을 별도 확인한다.
- native WebMCP36, 기본/가져오기 스키마 오류0, 화면 전환 input hash 유지, 정적→설계91개→HTML/JSON/CSV snapshot·UI summary 정확 일치, stale 차단·재열기 HANDLE_NOT_FOUND.
- production Pushover/NLTH module-worker/production-wasm-sparse 완료, fallback false, candidate/designBlocked 유지. 브라우저 실행 중 취소는 별도 타이밍 시험을 하지 않았으며 자동 회귀로 검증했다.
- 소형 8부재 해석 중앙값 5912.54→5791.04 ms, 최대 RSS 비 1.012559, 각각 사전 고정10% 회귀 예산 통과. 성능 재시도 없이 R2 후보를 새로 측정했다.
- 보고서 자동 PDF·외부2·pilot5·M-tier·생산 자격은 미충족 상태를 유지한다. HTML 1280px 화면에 수평 넘침이 없음을 시각 점검했다.

파일별 hash는 SHA256SUMS.txt에 있다. runtime/source ZIP은 이 소스 커밋에서 생성하고, 후속 문서·증거 커밋은 수치 검증 소스를 바꾸지 않는다.
