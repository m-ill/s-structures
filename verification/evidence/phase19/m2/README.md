# M2 입력 서비스 검증 증거

- [validation.json](validation.json): 소스 `a9ec274ecdf49690e400256325a410beee520267`의 별도 checkout에서 고정 회귀 27개 PASS / 0 FAIL. 소스 ZIP, manifest, 로그 SHA-256과 실행 환경 포함.
- [acceptance-summary.json](acceptance-summary.json): 입력 계약 범위, 검증 런타임 tree, 원본 경로와 제한.
- [browser-smoke.json](browser-smoke.json): 같은 런타임의 실제 UI와 native WebMCP context 관찰 기록. 강재·RC 폼 동등성 자동시험과 구분한다.
- `01-*.log`~`27-*.log`: 원본 실행 로그의 사본. `validation.json`의 각 sha256과 일치한다.
- `SHA256SUMS.txt`: 이 폴더 파일의 해시 목록(목록 자체 제외).

원본 ZIP·checkout·로그는 `output/phase19/m2-r1-20260907/`에 남긴다. `node tools/run-p19-validation.mjs <새 출력 경로> --manifest=verification/specs/phase19/m2-tests.json`으로 재실행한다. 대형 소스 ZIP을 Git 저장소에 중복 포함하지 않는다. 로그에는 합성 시험 모델만 포함한다.

M2 완료는 탄성설계 입력 변경 계약 범위다. M3 설계 검토·보고서 서비스, M4 신규 WebMCP 도구, M5 이후 비선형 생산 자격, M10 공개 배포를 완료한 것으로 해석하지 않는다. 이전 STRIX 비교의 범위도 확대하지 않는다.
