# Phase19·Phase20 Pages 배포 증거

main 배포 소스는 `fefde822ae27a024ea8a834642b8aac10a24bd77`다. Windows·Ubuntu 각112개 회귀, 공개709개 파일과 루트 index의 실제 HTTP SHA-256, native WebMCP·탄성설계 브라우저 smoke를 보존한다.

원시 HTTP 검사에는 .nojekyll 빌드 마커의404가1건 남는다. 실제 실행 파일709개는 전부PASS다. GitHub upload-pages-artifact@v4는 숨김 파일을 tar에서 제외한다. 첫 Windows archive의CRLF 차이707건도 조사 원본에 보존하며 Git cat-file로708개 원본 blob이 실제 Linux 배포 manifest와 일치함을 확인했다. 범위 밖 실패를 덮어쓰거나 모든710개 URL이200이었다고 주장하지 않는다.

`ci/`의 원본 로그·validation은 배포 workflow 실행에 속한다. `http/`는 로컬 canonical build manifest와 배포본을 비교한 전체 결과다. `browser/local-static-smoke.json`은 앞선 c28d058 아티팩트의 로컬 Pushover, `browser/public-smoke.json`은 최종 공개 사이트 시험이다. 서로 다른 시험 범위를 합치지 않는다.

기존 810abc0 M5 봉인과 공개 ZIP은 그대로 보존한다. main의 문서·증거 후속 커밋은 별도이며 이 배포 커밋의 수치 검증으로 표시하지 않는다. 외부2·pilot5·M-tier·PDF·최종 생산 자격은 별도다.
