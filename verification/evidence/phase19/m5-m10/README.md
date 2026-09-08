# M5~M10 개발 후보 증거

기능 구현과 생산 자격은 구분한다. [구현·미완료 조건](../../../../docs/phase19/M5_M10_CANDIDATE.md), [독립 검토 접수표](../../../../docs/phase19/REVIEW_INTAKE.md)를 확인한다.

- R1: fa88db7, 90개 중 89 PASS / corotational 전역 시험 180초 timeout 1건.
- R2: 0e6da88, 92개 중 91 PASS / 실제 8부재 힌지 골조 평형 실패 1건. 느린 시험 예산을 900초로 늘렸으며 성능 합격으로 해석하지 않는다.
- R3: 5579c94, 92개 중 90 PASS / generated Agent 계약의 엔진 버전 갱신 누락, readonly preflight의 옛 live-migration 기대값 2건. 8부재 평형은 허용오차 변경 없이 통과했다.
- R4(8147974)는 92/92 PASS이며 같은 커밋의 Windows·Ubuntu CI도 각각 92/92 PASS다. 별도 validation.json에 해당 source commit과 결과를 봉인한다. 중간 실패를 최종 성공으로 덮어쓰지 않는다.

원본 전체 checkout/source ZIP/로그는 저장소의 output/phase19/m5-m10-rN-20260907에 보존한다. 이 폴더의 중간 run은 validation과 실패 로그를 담고, 최종 run은 전체 로그를 담는다. SHA256SUMS.txt는 이 폴더 공개 파일의 무결성을 확인한다.

browser-observation.json은 실제 Codex Site tools와 UI에서 관찰한 소형 합성 모델 실행이다. Node Worker 모의시험, 외부 비교, 전체 브라우저 또는 M-tier 성능과 혼동하지 않는다. single-column-browser-book.json으로 UI JSON 가져오기를 재현한다. eight-member-before-fix.json은 수정 전 실제 입력의 Node replay 실패 원문이다.

package-manifest.json은 별도 clean checkout의 source/runtime ZIP 해시와 Windows 설치·재시작·백업/복원 시험을 기록한다. GitHub Pages/HTTPS 운영 배포 또는 이전 릴리스 rollback 검증은 아니다. runtime-metadata-delta.diff는 8147974 이후 Pushover capability ID와 비선형 원시 단위 표기를 수정한 내역이며 수치 엔진 변경은 없다. 최종 후보 467dd70의 별도 checkout에서 WebMCP/host 4개와 설치·복원 시험을 통과했다. 해당 전체 CI는 실행 중이며 미실행 항목을 PASS로 채우지 않는다.

독립 검토 담당은 사용자(m-ill)다. 외부 2건과 pilot 5건은 미검토 상태이며 candidate의 최종설계 전달 차단을 유지한다.

최신 공개: [R2](https://github.com/m-ill/s-structures/releases/tag/phase19-nonlinear-preview-20260907-r2), source 467dd7003c9f4f18dc5e9ad12e0d0b91ac87a545. 이전 R1은 비선형 원시 변위 단위 표시 수정 전 후보로 이력을 보존한다. 원시 변위는 m이며 display mm 정책과 분리한다.
