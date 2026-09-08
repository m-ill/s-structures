# Phase19·Phase20 main 병합과 Pages 배포

2026-09-08 · 사용자 요청: “main 병합하고 배포하자.”

## 배포 준비

- 이전 공개 main/Pages: `e18d5b432c780523496f8aad489b502934ae0ebd`.
- Phase19 PR #3 위에 Phase20 PR #4를 쌓은 상태에서 통합한다.
- 초기 공개본은 별도 스냅샷 이력이어서 add/add 충돌이 발생했다. main과 개발 이력 `7bb55d7`의 공통 파일은 전부 같은 Git blob이다. 차이는 개발본에 추가된 280개 자료와 공개 패키지의 자동 생성 식별자 2개뿐이다.
- 공개 main을 Phase20에 병합하면서 최신 소스를 유지했다. `src/`, `server/`, `tests/`, `index.html`, `app.html`은 검증 후보 `810abc0`과 같다. 옛 패키지의 root `PACKAGE-MANIFEST.json`, `SOURCE-IDENTITY.json`은 제거하고 배포할 때 현재 커밋으로 새로 생성한다. 기존 릴리스 ZIP과 봉인 evidence는 수정하지 않는다.

## 배포 방식

`Deploy validated Pages`는 main push 또는 수동 실행으로 동작한다. 같은 커밋의 Phase20 manifest 112개를 Windows·Ubuntu에서 실행하고 양쪽이 성공해야 배포한다. 기존 Public validation도 별도로 실행한다. 검증 실패 시 새 아티팩트를 배포하지 않는다.

`tools/build-pages.py`는 clean commit의 Git archive 바이트에서 정적 실행 파일과 사용 설명서만 선택한다. Node 서버·프로젝트 저장소·과거 보고서 출력·시험 evidence를 사이트에 복사하지 않는다. Node 서버가 필요한 `app.html` 프로젝트 저장·인증 기능은 로컬 runtime을 사용한다. 웹 실행 주소는 기존 모델러 루트 그대로다.

- [웹 프로그램](https://m-ill.github.io/s-structures/)
- [배포 커밋](https://m-ill.github.io/s-structures/SOURCE-IDENTITY.json)
- [배포 파일별 SHA-256](https://m-ill.github.io/s-structures/PACKAGE-MANIFEST.json)
- [배포 작업](https://github.com/m-ill/s-structures/actions/workflows/pages.yml)
- [GitHub 공식 custom workflow 구성](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

Pages 설정은 GitHub Actions로 전환한다. 롤백은 main에서 문제 커밋을 revert하여 동일 검증·배포 경로를 다시 통과시킨다. 배포는 정적 웹 프로그램 공개이며 비선형 candidate, 설계전달 차단, 외부2·pilot5·M-tier·PDF·최종 생산 자격을 승격하지 않는다.

## 실행 결과

병합·CI·공개 HTTP 및 실제 브라우저 검증 결과는 완료 후 아래에 추가한다.
