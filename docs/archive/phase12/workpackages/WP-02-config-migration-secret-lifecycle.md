# WP-02 — Config, Migration and Secret Lifecycle

    milestone: P12-M2
    status: qualification-complete

- 기본 상태는 OS 사용자 상태 폴더의 data와 secrets 형제 디렉터리를 사용한다.
- explicit dataDir만 지정하면 secretsDir는 중첩되지 않은 형제 경로로 유도한다.
- 레거시 이전은 dry-run, empty target, SHA-256 비교, staged publish 순서다.
- server.lock이 있거나 target이 비어 있지 않으면 이전하지 않는다.
- rotate-secret은 새 HMAC key를 만들고 전 사용자의 tokenVersion을 증가시킨다.
- 구 data와 secret은 변경하지 않으며 일반 backup은 legacy secret.key를 제외한다.

