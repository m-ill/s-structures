# WP-03 — HTTP, Authentication and Resource Hardening

    milestone: P12-M3
    status: qualification-complete

- 모든 static·API·error 응답에 공통 보안 header를 적용한다.
- Origin과 Host를 검증하고 알려진 API의 잘못된 method는 405로 응답한다.
- auth JSON은 64 KiB, 일반 JSON·upload는 설정된 route limit을 적용한다.
- auth와 전체 API에 고정 window rate limit을 적용한다.
- project file count·bytes·동시 upload를 제한한다.
- audit email은 hash로 기록하고 token·password·secret은 제거하며 크기 제한 시 1세대 rotation한다.
- readiness는 data write, free space, migration, lock 상태를 보고한다.

