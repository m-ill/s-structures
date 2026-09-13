# WP-01 — Static Public and Private Boundary

    milestone: P12-M1
    status: qualification-complete

- 공개 HTML은 index, app, m3, help, manual, guide로 제한한다.
- browser source는 src 아래의 js, css, wasm만 허용한다.
- real path가 static root 밖으로 나가면 404다.
- GET·HEAD만 허용하고 static POST는 405다.
- staticRoot, dataDir, secretsDir가 같거나 조상·자손이면 createApp이 실패한다.
- source server와 합성 계정·project·upload 뒤의 private URL 차단을 전용 gate로 검증한다.

