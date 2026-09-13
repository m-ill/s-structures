# WP-05 — Release Package, Install and Recovery

    milestone: P12-M5
    status: qualification-complete

- ZIP의 HTTP 공개물은 public/에만 둔다.
- server, package metadata, runtime src, desktop, operations tools는 public 밖에 둔다.
- public manifest와 전체 release manifest에 file bytes·SHA-256을 기록한다.
- data, secrets, Git metadata, reports, output, tmp, key, users, lock 경로가 있으면 build를 실패시킨다.
- backup은 secrets·lock을 기본 제외하고 restore는 빈 target에만 staged copy·hash verify 후 publish한다.
- unpacked ZIP에서 618개 public asset 전부 HTTP body hash를 검증한다.

