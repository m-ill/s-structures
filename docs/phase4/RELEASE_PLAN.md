# Phase 4 Release Plan

status: active
scope: P4-M8 (패키징), P4-M11 (GA)

## Versioning Policy

| 항목 | 규칙 |
| --- | --- |
| 체계 | semver. Phase 4 진행 중 0.x, GA에서 **1.0.0** |
| 동기화 | `package.json` version ↔ `src/platform/platformVersion.js`의 제품 버전 상수 ↔ 계산서 표지 표기 — `tests/p4-version-sync.mjs`로 잠금 |
| CHANGELOG | `CHANGELOG.md` 신설. Keep-a-Changelog 형식, 사용자 영향 항목만 (내부 리팩토링 제외) |
| 태깅 | 마일스톤 완료 시 `v0.x.y`, GA 시 `v1.0.0` git tag |

## Distribution Targets

| 형태 | 구성 | 대상 | 상태 |
| --- | --- | --- | --- |
| A. 웹 배포 | `node server/main.mjs` 단일 프로세스. 배포 폴더 = repo 산출물 + `data/` 분리. systemd/NSSM(Windows 서비스) 등록 가이드 | 사무소 내부 서버 | P4-T40 |
| B. 데스크톱 | Electron 래핑: 내장 서버(127.0.0.1 임의 포트) + 로컬 `%APPDATA%/s-structures/data`. 오프라인 완결 | 개인/소규모 사무소 | P4-T41 |

Electron은 zero-dependency 정책의 **명시적 예외**로 ARCHITECTURE 결정표(D10)에 확정 기록한다. 빌드 의존성은 lockfile로 고정하고 앱 런타임 소스는 계속 무의존을 유지한다.

## Packaging Requirements

1. **재현 가능 빌드**: `tools/build-release.mjs` (신규) 하나로 배포 폴더/인스톨러 생성. 수작업 단계 0.
2. **클린 머신 smoke**: 아무것도 설치 안 된 Windows에서 설치→가입→모델링→해석→저장→계산서 export까지 기록 (`reports/launch-readiness/install-smoke.md`).
3. **설정 외부화**: 포트/데이터 경로/등록 허용 여부를 설정 파일(`config.json`) 또는 환경변수로 — 코드 수정 없이 운영 변경 가능.
4. **업데이트 절차**: v1은 수동 업데이트(새 버전 설치 + data/ 유지). 자동 업데이트는 out-of-scope 기록.
5. **TD-14**: 엔트리 감지 정리 — 패키징 환경(asar 내부 경로 등)에서 서버 기동 보장.

## Licensing (P4-T44)

| 항목 | v1 정책 |
| --- | --- |
| 방식 | 오프라인 서명 키: `{plan, licensee, expiry}` payload + 서버 공개키 검증 (node:crypto Ed25519) |
| 미등록 동작 | 평가 모드 (기능 제한 없이 워터마크 표기 — 오너 확정 필요) |
| 저장 | `data/license.key` |
| 검증 | 발급 스크립트(`tools/issue-license.mjs`, 개인키는 repo 외부) + 검증 테스트 |

## GA Launch Checklist (P4-M11)

기계 확인(auto)은 `tests/` 게이트, 수동(manual)은 증빙 파일 경로 필수.

| # | Gate | 종류 | Pass 조건 |
| --- | --- | --- | --- |
| L1 | full suite | auto | failed 0 |
| L2 | 완성도 감사 | auto | preliminary 0, manual은 증빙 등록 완료 |
| L3 | TD 레지스터 | auto | P0/P1 open 0 (`tests/p4-debt-gate.mjs` 신규 — 레지스터 파싱) |
| L4 | 성능 예산 | auto | perf-budget 게이트 green |
| L5 | 보안 체크리스트 S1~S12 + 재점검 3항 | manual | SECURITY 문서 체크 서명 |
| L6 | 설치 smoke (웹 A + 데스크톱 B) | manual | install-smoke 기록 |
| L7 | 버전/CHANGELOG/태그 | auto | version-sync 테스트 + tag 존재 |
| L8 | 사용자 문서 | manual | 문서-기능 대조표 100%, 30분 시나리오 기록 |
| L9 | 베타 파일럿 | manual | pilot-01..10 blocker 0 |
| L10 | 백업/복구 리허설 | manual | runbook 절차 실행 기록 |
| L11 | owner 서명 | manual | evidence register 등록 (P3-M20 종결) |

## Rollback Policy

GA 후 중대 결함 시: (1) 직전 태그 재배포 (data/는 상위 호환 — snapshot 형식은 append-only revision이므로 다운그레이드 안전), (2) schemaVersion이 올라간 경우 다운그레이드 불가를 CHANGELOG에 명시하고 사전 백업을 설치 절차에 포함.
