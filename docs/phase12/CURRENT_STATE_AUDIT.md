# Phase 12 Current State Audit

    version: p12-current-state-v1
    observed_on: 2026-08-03
    source_revision: f6f75bb6d623a72a0ecc8ed27ebe70533efebf18
    phase_status: in-progress

## 기준선

- main은 origin/main보다 465커밋 앞서 있고 tag는 0개였다.
- 기존 작업트리 변경 verification/evidence/validation/p4-preview-integrated-validation.json과 tmp/는 Phase 12 범위에서 제외한다.
- 복구본은 C:/Users/mill/Downloads/dcr/.phase12-backup/f6f75bb6d623.bundle에 만들고 git bundle verify를 통과했다.
- bundle SHA-256은 67512ADCED1BBBC6A8C71BB8CC0706113D5550517274118B12020EB2288712ED다.

## 재현된 결함

기본 정적 서버가 저장소 루트를 공개해 합성 실행에서 다음 URL이 HTTP 200이었다.

- /.git/HEAD
- /package.json
- /server/config.mjs
- /data/server.lock
- /docs/phase11/README.md

현재 dataDir 기본값은 저장소 data이고 staticRoot 기본값은 저장소 루트다. users.json과 secret.key도 dataDir에 생성된다.
승인 API는 rev 존재 여부를 검증하지 않으며 새 rev 저장 시 released 상태를 stale 처리하지 않는다.

## 현재 출시 판정

- loopback 교육·데모: 합성 또는 비기밀 데이터에 한해 개발용
- 기밀 내부 파일럿: P12-M7 전까지 차단
- LAN·인터넷: 차단
- design transfer: Phase 10 gate에 따라 차단

