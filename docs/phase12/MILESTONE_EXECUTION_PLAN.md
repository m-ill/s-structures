# Phase 12 Milestone Execution Plan

## 운영 보안·데이터 무결성·실용화 기반 강화

    version: p12-milestone-plan-v1
    plan_status: approved
    governing: true
    approved_on: 2026-08-03
    milestones: [P12-M0, P12-M1, P12-M2, P12-M3, P12-M4, P12-M5, P12-M6, P12-M7]
    active_milestone: none
    next_milestone: P12-M0
    status_authority: docs/phase12/IMPLEMENTATION_STATUS.md
    release_claim_before_P12_M7: blocked

> 이 문서는 Phase 12의 권위 작업계획이다. 실제 진행 상태는 P12-M0에서 만드는
> IMPLEMENTATION_STATUS.md만 단일 기준으로 사용한다. 계획 문서에는 실행 상태를 중복 기록하지 않는다.

## 0. 단계 번호 결정과 출발점

다음 단계는 **Phase 12**, 첫 마일스톤은 **P12-M0**이다.

- [Phase 11 구현 상태](../phase11/IMPLEMENTATION_STATUS.md)는 P11-M0부터 P11-M9까지 모두 완료로 기록한다.
- [Phase 11 로드맵](../phase11/ROADMAP.md)의 마지막 항목은 P11-M9 Office pilot·release gate다.
- 저장소에는 이 계획을 만들기 전까지 docs/phase12, P12 테스트, P12 evidence가 없었다.
- 최신 확인 기준 커밋은 f6f75bb6d623이며, 원격 main보다 465커밋 앞서 있고 태그가 없다.

이번 작업은 완료된 보고서 프로덕션화의 연장이 아니라 **서버 공개 경계, 사용자 상태,
승인 이력, 설치 산출물과 릴리스 게이트를 바로잡는 별도 제품 목표**다. 따라서 P11-M10이 아니라
새 Phase로 분리한다.

### 0.1 현재 확인된 핵심 결함

| ID | 현상 | 현재 근거 | 심각도 | 닫는 단계 |
| --- | --- | --- | --- | --- |
| P12-R01 | 기본 dataDir가 저장소 data이고 staticRoot가 저장소 루트라 사용자 상태가 공개영역 안에 놓임 | [server/config.mjs](../../server/config.mjs) | Critical | M1, M2 |
| P12-R02 | 비 API URL을 명시적 허용목록 없이 파일시스템에 대응시킴 | [server/main.mjs](../../server/main.mjs) | Critical | M1 |
| P12-R03 | users.json과 secret.key가 같은 공개 가능 dataDir에 생성됨 | [server/store/userStore.mjs](../../server/store/userStore.mjs) | Critical | M1~M2 |
| P12-R04 | 존재하지 않는 rev도 approved/released로 지정 가능하고 새 rev가 released를 stale 처리하지 않음 | [approval route](../../server/routes/approval.mjs), [project store](../../server/store/projectStore.mjs) | High | M4 |
| P12-R05 | 요청 제한, 공통 보안 헤더, 로그·용량 수명주기와 readiness가 불완전함 | [server/main.mjs](../../server/main.mjs) | High | M3 |
| P12-R06 | 설정 안내, 실제 설정 로딩, 설치 패키지 구성과 도움말·백업 경로가 어긋남 | [release builder](../../tools/build-release.mjs) | High | M2, M5 |
| P12-R07 | Windows 기본 회귀가 줄바꿈 비교로 실패하고 일부 테스트가 기본 gate에 연결되지 않음 | [package.json](../../package.json) | High | M6 |
| P12-R08 | 최신 코드가 한 PC의 로컬 브랜치에 집중되고 검증된 릴리스 기준선·태그가 없음 | Git 기준선 점검 | High | M0, M7 |

점검 시 기본 서버에서 /.git/HEAD, /package.json, /server/config.mjs,
/data/server.lock, /docs/phase11/README.md가 인증 없이 HTTP 200으로 재현됐다.
P12 증적에는 실제 secret, 사용자 정보, 프로젝트 내용 또는 응답 본문을 저장하지 않는다.

### 0.2 이전 Phase의 판정은 덮어쓰지 않는다

- Phase 11의 release-qualified는 **한·영 보고서 생성 기능**에 한정된다.
- [Phase 11 release manifest](../../verification/evidence/validation/phase11/p11-release-manifest.json)의
  공학 판정 상한 CONDITIONAL_PASS는 유지한다.
- [Phase 10 release gate](../../verification/evidence/validation/phase10/p10-m11-release-gate.json)의
  release.allowed=false와 designTransferAllowed=false는 Phase 12가 자동 해제하지 않는다.
- Phase 12를 완료해도 최종 구조설계·인허가, 공개 인터넷 서비스, 다중 조직 SaaS를 승인한 것으로 해석하지 않는다.

## 1. Phase 목표와 종료 정의

### 1.1 목표

현재의 기능 베타·운영 알파 상태를 다음 수준으로 올린다.

1. 웹으로 공개되는 파일은 빌드된 자산 manifest에 등록된 항목뿐이다.
2. 사용자 데이터, 인증 비밀, 업로드, 감사 로그와 lock은 공개영역 밖에 있다.
3. 기존 데이터는 손실 없이 명시적으로 이전되고 노출 가능 키는 통제된 절차로 교체된다.
4. 모든 HTTP 응답, 인증 시도, 대용량 요청과 저장 용량에 운영 방어선이 있다.
5. 승인·릴리스는 실제 존재하는 정확한 리비전과 해시에 결속되고 새 리비전은 현재 판정을 stale로 만든다.
6. 소스 실행과 배포 ZIP 모두 같은 보안 경계를 지키며 Windows 공식 회귀가 신뢰 가능하다.
7. 깨끗한 설치·이전·재기동·백업 복구를 반복 검증한 뒤에만 내부 로컬 파일럿을 허용한다.

### 1.2 Phase 12 종료 시 허용 가능한 주장

P12-M7의 모든 필수 gate가 통과한 경우에만 다음 문구를 사용할 수 있다.

> 지정된 Windows 기준 환경에서 loopback-only 내부 파일럿을 위한 운영 보안 기준선을 통과했다.

그 외의 주장은 다음과 같이 제한한다.

| 사용 프로필 | Phase 12 목표 판정 | 추가 조건 |
| --- | --- | --- |
| 개발자 소스 실행 | 개발·검증 전용 | 실제 기밀 데이터 금지 |
| 단일 PC loopback 내부 파일럿 | P12-M7 통과 시 조건부 허용 | 사용자별 외부 상태 경로, 백업, 운영자 지정 |
| 통제된 사내 LAN | 기본 차단 | TLS 종단, bind·Origin 정책, 운영자 결정, 별도 환경 evidence 필요 |
| 공개 인터넷 | 비범위·차단 | 외부 보안검토, TLS·프록시·관제·운영 DB·복구체계 필요 |
| 최종 설계·인허가 전이 | 차단 유지 | Phase 10 외부 공학 검증 gate 별도 통과 필요 |

## 2. 지원 범위와 비범위

### 2.1 필수 범위

- 현재 소스 기준선과 복구 수단 보존
- 정적 공개 자산 allowlist 또는 전용 public 산출물
- 공개 루트와 data/secrets 루트의 canonical 격리
- 설정 계약, 레거시 데이터 이전, 키 교체와 rollback
- 공통 보안 헤더, route별 크기 제한, 인증 rate limit, 저장 quota와 로그 rotation
- 승인·릴리스 리비전 상태기계와 감사 추적
- 웹 ZIP, 도움말, 설정 예제, 백업·복구 도구의 설치 계약 통합
- Windows 줄바꿈 독립 회귀, 누락 테스트 분류, P8 장시간 gate 완주
- source tree와 unpacked release를 모두 대상으로 한 공격 URL·clean-install 검증

### 2.2 명시적 비범위

- 구조해석 결과의 외부 상용 해석기 교차검증과 최종 설계 전이 승인
- 정식 비선형, 상세 KDS 절차, RC·철골·접합·기초 상세 기능 보강
- 공개 인터넷용 TLS 인증서, WAF, DDoS 방어, SIEM, 24시간 관제
- MFA·SSO, 조직 단위 tenant 격리, 데이터베이스 전환, 다중 프로세스·고가용성
- 저장 데이터 전체 암호화, 코드 난독화, 서명된 자동 업데이트
- 정식 Windows 설치 프로그램과 코드 서명은 M5의 사용자 결정 전에는 비범위

## 3. 보안 진실성 원칙과 위협모델

### 3.1 불변 원칙

1. **공개는 allowlist다.** 저장소 전체를 공개한 뒤 denylist로 가리는 구조를 허용하지 않는다.
2. **상태는 공개영역 밖이다.** public, data, secrets가 같거나 조상·자손이면 기동을 거부한다.
3. **모호하면 실패한다.** 경로, 이전 상태, 승인 대상, evidence가 불완전하면 성공으로 판정하지 않는다.
4. **이전은 비파괴적이다.** dry-run, 임시 복사, hash 검증, 원자적 publish, 보존된 backup 순서를 지킨다.
5. **릴리스는 리비전에 결속된다.** 프로젝트의 현재 판정과 과거 승인 이력을 구분한다.
6. **비밀은 증적이 아니다.** raw secret·token·개인정보·프로젝트 본문을 로그와 evidence에 남기지 않는다.
7. **보안 판정은 환경별이다.** 소스 실행의 PASS로 배포 ZIP이나 LAN을 PASS 처리하지 않는다.
8. **운영 보안은 공학 검증을 대체하지 않는다.** Phase 10·11 제한 문구를 보존한다.

### 3.2 보호 자산과 신뢰 경계

| 자산 | 예 | 요구 경계 |
| --- | --- | --- |
| 인증 비밀 | session HMAC key, token | secrets root, HTTP·백업 기본 제외 |
| 사용자 정보 | users.json, 계정 상태 | data root, 인증된 API만 |
| 프로젝트 상태 | project meta, revisions, models | data root, 역할 기반 API만 |
| 업로드 | 도면·점군·JSON | data root, 다운로드 nosniff·권한 검사 |
| 승인 이력 | approval/release record, audit | append-only 성격, rev/hash 결속 |
| 공개 자산 | HTML, JS, CSS, WASM, 이미지, 도움말 | manifest allowlist 안에서만 HTTP 공개 |
| 운영 산출물 | config, lock, logs, backup, report evidence | 웹 비공개, 패키지 정책에 따라 제한 |

### 3.3 주요 위협과 필수 통제

| 위협 ID | 위협 | 필수 통제 |
| --- | --- | --- |
| P12-T01 | 비인증 사용자의 .git·서버 코드·데이터 직접 조회 | 공개 manifest, 균일 404, source/release 양쪽 scan |
| P12-T02 | percent encoding·역슬래시·dot segment·prefix·junction으로 경계 이탈 | decode-once, canonical containment, symlink/junction 정책 |
| P12-T03 | 운영자가 dataDir 또는 secrets를 public 아래로 잘못 지정 | 시작 시 경로 중첩 검사와 fail-closed |
| P12-T04 | ZIP이나 backup에 실제 데이터·키가 포함 | forbidden-path·secret pattern scan, secrets 기본 제외 |
| P12-T05 | 이전 중 중단·병합·손상 | offline migration, 빈 대상, SHA-256 비교, rollback rehearsal |
| P12-T06 | 노출 가능 기존 키를 이용한 구 token 재사용 | 명시적 키 교체, token version 증가, 전 세션 무효화 |
| P12-T07 | 대입 공격·대용량 요청·무제한 저장으로 서비스 고갈 | rate limit, route별 제한, timeout, quota, rotation |
| P12-T08 | 존재하지 않는 rev 또는 stale rev가 released로 표시 | rev 존재 확인, 전이 정책, current-vs-history 분리, 감사 로그 |
| P12-T09 | 차단 정책 때문에 정상 UI·worker·WASM·보고서가 깨짐 | asset closure, browser smoke, full regression |
| P12-T10 | 부분 실행 또는 오래된 evidence가 release를 허용 | source revision/hash 결속, fail-closed release manifest |

## 4. 의존관계와 전체 로드맵

    P12-M0  기준선·위협모델·검증 거버넌스
       |
       +--> P12-M1  정적 공개영역·private 상태 경계
       |       |
       |       +--> P12-M2  설정·데이터 이전·비밀 수명주기
       |       |
       |       +--> P12-M3  HTTP·인증·용량 운영 방어
       |
       +--> P12-M4  승인·릴리스 리비전 무결성
                       |
       P12-M2 + P12-M3 + P12-M4
                       |
                       v
                 P12-M5  패키징·설치·백업 복구
                       |
                       v
                 P12-M6  Windows 회귀·게이트 통합
                       |
                       v
                 P12-M7  clean-install 파일럿·최종 release gate

M2와 M3는 M1 완료 후 병행할 수 있다. M4는 M0 완료 후 별도 작업으로 병행할 수 있다.
M5는 M2~M4의 계약이 고정된 뒤, M6는 M5의 실제 배포물을 대상으로 수행한다.

### 4.1 요약 일정

아래는 1인 순개발 기준의 초기 추정이며 M0에서 다시 산정한다. 장시간 회귀·외부 의사결정 대기시간은 제외한다.

| 마일스톤 | 핵심 결과 | 선행 | 예상 순공수 |
| --- | --- | --- | --- |
| P12-M0 | 복구 가능한 기준선, 위협모델, 검증 계약 | 없음 | 1~2일 |
| P12-M1 | 정적 allowlist와 public/private 경계 | M0 | 2~4일 |
| P12-M2 | 설정·외부 상태 경로·이전·키 교체 | M1 | 3~5일 |
| P12-M3 | 헤더·rate limit·제한·quota·readiness | M1 | 3~5일 |
| P12-M4 | rev-bound 승인·릴리스 상태기계 | M0 | 2~4일 |
| P12-M5 | 안전한 ZIP·설정·도움말·backup/restore | M2~M4 | 2~4일 |
| P12-M6 | Windows 공식 회귀와 테스트 분류 100% | M5 | 2~4일 + 장시간 실행 |
| P12-M7 | 3회 clean-install 파일럿과 최종 gate | M6 | 2~3일 |

총 초기 추정은 **17~31 순개발일**이다. P12-M1 완료 전에는 기밀 데이터 사용과 네트워크 bind를 금지한다.

## 5. 공통 실행·완료 규칙

### 5.1 상태 체계

    planned -> in-progress -> implementation-complete -> qualification-complete -> release-qualified

- 코드만 구현됐으면 최대 implementation-complete다.
- focused test, 관련 회귀, evidence, high 수준 code review, 문서, milestone commit이 모두 있어야 qualification-complete다.
- 실제 배포 artifact와 release manifest의 hash를 다시 계산해 일치해야 release-qualified다.
- 미실행, timeout, 누락 evidence, 파일만 존재하는 상태는 PASS가 아니다.
- SKIP은 승인된 비범위, 사유, owner, qualification 영향이 기록된 경우만 허용한다.

### 5.2 마일스톤 공통 사이클

    착수
      -> 구현
      -> focused test
      -> high 수준 code review
      -> 발견사항 수정
      -> 전용 gate
      -> 관련·전체 회귀
      -> evidence와 hash 갱신
      -> 문서·실제 상태 갱신
      -> 해당 마일스톤만 포함한 의도적 commit

이전 마일스톤의 필수 gate가 통과하지 않으면 의존하는 다음 마일스톤으로 넘어가지 않는다.

### 5.3 공통 완료조건

- 해당 WP 범위의 production code 또는 계획 산출물이 실제로 존재한다.
- tests/p12-mN-*.mjs 전용 테스트와 관련 회귀가 green이다.
- verification/evidence/validation/phase12/p12-mN-*.json에 명령, 환경, source revision, artifact hash가 있다.
- open Critical/High code-review finding이 0건이다.
- API, Agent manifest, UI, feature catalog, user manual, backup·설치 경로 영향을 검토했다.
- 성능, 메모리, 저장공간, 로그, 산출물 크기 변화와 예산을 기록했다.
- evidence와 로그의 raw secret·token·개인정보·프로젝트 본문 노출이 0건이다.
- IMPLEMENTATION_STATUS.md가 실제 code·test·evidence·review·commit 상태와 일치한다.
- 기존 작업트리 변경인 verification/evidence/validation/p4-preview-integrated-validation.json과 tmp/를
  Phase 12 commit에 섞지 않는다.
- 마일스톤 하나마다 의도적인 commit 하나를 만든다.

P12-M0는 현재의 빨간 전체 회귀를 숨기지 않고 기준선으로 기록할 수 있다. 다만 M0 전용 문서·schema gate는
green이어야 하며, 현재 실패는 owner와 P12-M6 목표가 지정돼야 한다. M1 이후 변경으로 새 회귀 실패를 추가할 수 없다.

### 5.4 evidence 공통 필드

- version, milestone, generatedAt, status
- verificationId, requirementIds
- testCommand, sourceRevision, sourceTreeState
- environmentProfile: OS, Node, product profile, bind, static mode, data layout
- attackCase: method, raw URL, canonical target class, expected status, actual status
- artifactPath, bytes, sha256, manifestSha256
- actual, reference, tolerance 또는 명확한 boolean predicate
- blockerCode, owner, qualificationImpact
- redactedResponseSha256

실제 secret 본문, token, 이메일, 프로젝트 이름·본문은 기록하지 않는다. 실행별 run ID를 사용하고 기존 evidence를
조용히 덮어쓰지 않는다. schema validation 자체도 전용 gate에 포함한다.

### 5.5 파일 이름 규칙

- 계획: docs/phase12/MILESTONE_EXECUTION_PLAN.md
- 실제 상태: docs/phase12/IMPLEMENTATION_STATUS.md
- 작업 패키지: docs/phase12/workpackages/WP-NN-*.md
- 전용 테스트: tests/p12-mN-*.mjs
- 실행기: tools/run-phase12-tests.mjs
- evidence: verification/evidence/validation/phase12/p12-mN-*.json
- review: docs/phase12/reviews/P12-MN-CODE-REVIEW.md
- raw qualification: reports/phase12/PROFILE/RUN-ID/
- 최종 manifest: verification/evidence/validation/phase12/p12-release-manifest.json

계획 단계에서는 PASS evidence나 완료 review를 미리 만들지 않는다.

## P12-M0 — 기준선 보존, 범위, 위협모델과 검증 거버넌스

### 목표

현재 소스와 결함을 재현 가능한 기준선으로 고정하고, 복구 수단·위협모델·검증 ID·상태 권한을 확정한다.
M0는 짧게 끝내고 M1의 치명적 노출 차단을 지연시키지 않는다.

### 구현·산출물

- full Git revision, 원격 대비 차이, tag, dirty path, 런타임 버전 inventory
- 현재 커밋을 복원할 수 있는 검증된 Git bundle 또는 비공개 원격 백업
- dirty worktree는 내용에 손대지 않고 별도 목록과 owner만 기록
- 합성 fixture 기반 source·release 노출 재현 matrix
- public asset, private data, secret, operational file inventory
- Phase 12 CURRENT_STATE_AUDIT, THREAT_MODEL, VERIFICATION_MATRIX, RISK_REGISTER,
  REQUIREMENTS_TRACEABILITY, IMPLEMENTATION_STATUS skeleton
- evidence schema와 fail-closed release manifest skeleton
- public/data/secrets 위치와 allowlist 방식을 정하는 ADR
- Phase 11에서 서로 다른 상태를 가진 계획 header와 최종 manifest의 권위 관계 정리

### 제품 표면 영향

사용자 기능과 서버 동작을 바꾸지 않는다. 백업을 원격에 올리거나 tag를 만드는 작업은 저장소 공개 여부와
대상 원격을 사용자가 승인한 뒤 수행한다.

### 리팩토링·보안 경계 gate

- 실제 사용자 데이터·secret을 읽거나 취약점 evidence에 복사하지 않는다.
- baseline 재현에는 합성 계정·프로젝트와 격리된 임시 dataDir만 사용한다.
- 현재 dirty path를 수정·삭제·commit하지 않는다.
- 공개 원격으로의 자동 push를 금지한다.

### 검증

- P12-BASE-01: 번호·이전 Phase 완료 상태 검증
- P12-BASE-02: Git 기준선과 복구본 verify
- P12-BASE-03: source·release 정적 노출 재현
- P12-BASE-04: 전체 테스트 inventory와 기본 gate 포함 여부 계산
- P12-BASE-05: 문서·manifest 상태 권위 단일화
- P12-BASE-06: evidence schema와 secret-redaction fixture

전용 테스트: tests/p12-m0-baseline-governance.mjs

### 정량 수용기준

- full source revision, ahead/behind, tag count, dirty path 기록 누락 0
- off-worktree 복구본 1개 이상, 실제 verify PASS
- 실제 기밀을 사용하지 않은 source·unpacked release 공격 matrix 100% 실행
- 모든 tests/*.mjs가 default, release-long, platform-specific, helper, retired 중 하나로 100% 분류
- 분류되지 않은 테스트 0, owner 없는 현재 실패 0
- schema validation fixture PASS, evidence의 raw secret·PII 0
- Phase 12 위험의 owner, 목표 milestone, 중단조건 지정률 100%

### 증빙

verification/evidence/validation/phase12/p12-m0-baseline-governance.json

### 완료판정

기준선이 복구 가능하고 현재 결함·실패·문서 불일치가 숨김없이 등록되며 M1의 자동 검증 계약이 고정되면 완료한다.

### 비범위·잔여 위험

실제 노출은 M1까지 남는다. 따라서 M0 완료만으로 기밀 데이터, LAN bind 또는 release를 허용하지 않는다.

## P12-M1 — 정적 공개영역과 private 상태 경계

### 목표

저장소 전체를 정적 제공하는 구조를 제거하고, 명시적으로 승인된 브라우저 자산만 공개한다. data, secrets,
server source, repository metadata, docs, reports, output과 운영 파일은 존재 여부와 무관하게 웹에서 보이지 않게 한다.

### 구현·산출물

- serveStatic을 독립 모듈로 분리하고 exact URL-to-asset manifest 적용
- 전용 public build 또는 runtime asset closure manifest
- root URL만 index.html에 대응하고 임의 directory index 탐색 제거
- GET·HEAD 이외 정적 메서드 405
- decode-once, NUL·역슬래시·dot segment·이중 encoding·drive prefix·prefix collision 차단
- real path·Windows 대소문자·symlink/junction을 고려한 canonical 경계 검사
- public, data, secrets가 같거나 조상·자손 관계면 시작 실패
- 금지 경로는 존재 여부를 누설하지 않는 동일한 404 응답
- 정상 UI, worker, WASM, 이미지, 도움말 자산 closure 검사
- source mode와 unpacked release mode에 같은 정책 적용

### 제품 표면 영향

기존에 우연히 열리던 package.json, server, docs, reports, output URL은 사라진다. 정상 사용자 화면과 도움말 링크는
manifest에 포함돼 계속 작동해야 한다. 외부에서 저장소 파일 URL에 의존한 비공식 사용은 지원하지 않는다.

### 리팩토링·보안 경계 gate

- denylist만으로 구현하지 않는다.
- 문자열 startsWith만으로 containment를 판정하지 않는다.
- 오류 응답에 absolute path, errno detail 또는 파일 존재 여부를 넣지 않는다.
- 공개 manifest 생성 실패나 경로 중첩 시 서버는 기동하지 않는다.
- test 전용 서버 정책이 production server를 대신하지 않는다.

### 검증

- P12-BOUNDARY-01: allowlisted public asset closure
- P12-BOUNDARY-02: repository·server·config 차단 matrix
- P12-BOUNDARY-03: data·users·secret·project·upload·audit·lock 차단
- P12-BOUNDARY-04: encoded traversal·backslash·case·prefix 공격 matrix
- P12-BOUNDARY-05: symlink·junction 이탈과 경로 중첩 시작 실패
- P12-BOUNDARY-06: GET·HEAD·method·cache 동작
- P12-BOUNDARY-07: 실제 가입·로그인·프로젝트·업로드 후 새 private artifact 차단
- P12-BOUNDARY-08: source·unpacked release 브라우저 smoke

전용 테스트: tests/p12-m1-static-private-boundary.mjs

### 정량 수용기준

- 최소 40개 raw·encoded 공격 URL과 GET·HEAD 조합에서 민감 내용 노출 0건
- /.git/HEAD, /package.json, /config.sample.json, /server/main.mjs, /data/server.lock,
  /data/users.json, /data/secret.key, /reports/, /output/의 HTTP 200 응답 0건
- 실제 합성 사용으로 새로 생긴 user, secret, project, revision, upload, audit 파일 노출 0건
- manifest 자산 HTTP 200·Content-Type·body hash 일치율 100%
- manifest 밖 파일의 HTTP 200 응답 0건
- 정상 UI·worker·WASM load failure 0, browser console fatal error 0
- 오류·로그·evidence의 내부 절대경로와 raw secret 0건
- source와 unpacked release 결과 parity 100%

### 증빙

verification/evidence/validation/phase12/p12-m1-static-private-boundary.json

### 완료판정

정상 자산만 manifest를 통해 로드되고 모든 private·운영 경로가 source와 배포물 양쪽에서 자동 차단되며
전체 관련 회귀가 green이면 완료한다.

### 비범위·잔여 위험

기존 root/data의 실제 이전과 키 교체는 M2, rate limit과 공통 HTTP 방어는 M3 범위다.

## P12-M2 — 설정, 데이터 이전과 인증 비밀 수명주기

### 목표

설치 위치와 사용자 상태를 물리적으로 분리하고, 레거시 root/data를 손실 없이 외부 상태 경로로 이전한다.
노출 가능성이 있는 기존 인증 키는 통제된 절차로 교체하고 구 session을 무효화한다.

### 구현·산출물

- 프로필별 config 계약: loopback desktop/local, explicit server
- Windows 기본 사용자 상태 경로와 server 운영 시 필수 explicit dataDir 정의
- publicRoot, dataDir, secretsDir의 별도 설정과 canonical validation
- 문서의 config 안내와 실제 S_STRUCTURES_CONFIG·명령행 로딩 방식 일치
- 서버 정지 상태에서 실행하는 migration --dry-run, execute, verify, status 도구
- 빈 임시 대상에 복사, file count·size·SHA-256 비교 후 atomic publish
- 기존 원본의 read-only 보존 기간과 rollback manifest
- secret 이동과 secret rotation을 분리한 명시적 운영 명령
- rotation 시 전 사용자 tokenVersion 증가와 기존 token 전체 무효화
- data-layout version과 key fingerprint만 기록하고 key 원문은 제외
- backup 도구는 secrets 기본 제외, 명시적 secret escrow는 별도 사용자 승인
- config sample, 사용자 설명, 운영 runbook 갱신

### 제품 표면 영향

첫 기동에서 레거시 data가 감지되면 조용히 옮기거나 새 빈 계정처럼 시작하지 않고 migration 필요 상태를 명확히 알린다.
키 교체 후 사용자는 다시 로그인해야 한다. 로컬 사용자의 기본 데이터 위치가 설치 폴더 밖으로 바뀐다.

### 리팩토링·보안 경계 gate

- 서버 시작 중 묵시적 destructive migration을 금지한다.
- 기존 폴더와 비어 있지 않은 새 폴더를 자동 병합하지 않는다.
- 원본 hash와 대상 hash가 다르면 publish하지 않는다.
- 구 secret을 일반 backup, log, evidence 또는 ZIP에 넣지 않는다.
- key rotation은 rollback하지 않으며 과거 취약 버전을 LAN에 재노출하지 않는다.
- migration 재실행은 idempotent해야 한다.

### 검증

- P12-CONFIG-01: config sample·환경변수·runtime parity
- P12-CONFIG-02: 프로필별 기본값과 unsafe bind fail-closed
- P12-MIG-01: valid legacy data dry-run·copy·verify·publish
- P12-MIG-02: collision·partial marker·lock·권한 실패
- P12-MIG-03: copy·verify·publish 단계별 failure injection과 rollback
- P12-MIG-04: 재실행 idempotency와 silent merge 방지
- P12-KEY-01: secret move와 explicit rotation 분리
- P12-KEY-02: 구 token 401, 기존 password 새 login 성공
- P12-BACKUP-01: secrets 기본 제외와 복구 rehearsal

전용 테스트: tests/p12-m2-config-migration-secret-lifecycle.mjs

### 정량 수용기준

- config 문서·sample·runtime fixture parity 100%
- public/data/secrets 경로 중첩 fixture의 시작 성공 0건
- 사용자·프로젝트·리비전·업로드 수와 secret 제외 SHA-256 일치율 100%
- failure injection 각 지점에서 원본 변경 0, partial published state 0
- 비어 있지 않은 대상 자동 overwrite·merge 0
- migration 2회차 데이터 변경 0
- 회전 전 token의 인증 성공 0, 기존 비밀번호 재로그인 성공률 100%
- ZIP·일반 backup·log·evidence의 key 원문 0

### 증빙

verification/evidence/validation/phase12/p12-m2-config-migration-secret-lifecycle.json

### 완료판정

신규 설치와 레거시 이전이 모두 외부 상태 경로를 사용하고, 손실·silent merge 없이 복구 가능하며,
키 교체 후 구 session이 전부 무효화되면 완료한다.

### 비범위·잔여 위험

저장 데이터 전체 암호화와 원격 secret manager는 비범위다. LAN 기본 bind와 가입 정책은 사용자 결정이 없으면
loopback-only·가입 차단의 안전 기본값을 사용한다.

## P12-M3 — HTTP, 인증과 저장 용량 운영 방어

### 목표

정적·API·오류 응답에 일관된 보안 정책을 적용하고, 로그인 대입·과대 요청·무제한 업로드·로그 증가로 인한
운영 장애를 제한한다.

### 구현·산출물

- 응답 정책 middleware: nosniff, Referrer-Policy, frame-ancestors, object-src, base-uri,
  Cross-Origin-Resource-Policy, 민감 응답 no-store
- 현재 inline script·worker·WASM을 inventory한 호환 가능한 CSP와 예외 owner·만료일
- 정적·API의 허용 method와 일관된 404·405·413·429 error envelope
- route별 JSON·upload 제한, streaming 중단, request timeout과 동시 upload 제한
- IP와 account를 결합한 register/login rate limit, 성공·실패 reset 정책
- 사용자·프로젝트별 저장 quota와 low-disk fail-closed
- audit log redaction, rotation, 보존 예산, 실패 시 동작
- health와 readiness 분리: data writable, lock ownership, migration 상태, free-space budget
- reverse proxy를 쓰는 경우에만 명시적으로 신뢰하는 forwarded header 정책

### 제품 표면 영향

제한 초과 요청은 reason code와 재시도 시점을 받는다. 운영자는 현재 제한, 저장 사용량, migration·readiness 상태를
확인할 수 있다. 정상 모델·점군 사용량을 막지 않도록 M0 실측 후 기본 예산을 확정한다.

### 리팩토링·보안 경계 gate

- 새 runtime dependency·license는 사용자 승인 없이 추가하지 않는다.
- 임의 X-Forwarded-For를 신뢰하지 않는다.
- HSTS는 실제 TLS 종단이 확인된 프로필에서만 설정한다.
- CSP를 통과시키기 위해 unsafe-eval을 추가하지 않는다. unsafe-inline 예외는 owner와 제거 milestone을 기록한다.
- email, token, raw body, upload 본문을 실패 로그에 남기지 않는다.
- limit은 환경 변수 하나로 전체 route를 무제한 확대하는 구조를 허용하지 않는다.

### 검증

- P12-HTTP-01: 정적·API·error 응답 header matrix
- P12-HTTP-02: method·Origin·Host·proxy trust policy
- P12-HTTP-03: route별 limit와 limit+1의 413·stream abort
- P12-AUTH-01: account·IP login/register rate limit와 recovery
- P12-QUOTA-01: user·project·upload quota와 동시성
- P12-LOG-01: redaction·rotation·disk-full failure
- P12-READY-01: health/readiness와 lock·migration·free-space 상태
- P12-COMPAT-01: UI·API·Agent·upload 정상 workflow

전용 테스트: tests/p12-m3-http-auth-resource-hardening.mjs

### 정량 수용기준

- HTML·asset·API success·API error·404·405 응답의 필수 header 누락 0
- 설정된 login/register limit+1 요청 차단률 100%, 정상 recovery fixture 100%
- body·upload limit+1이 413으로 종료되고 전체 body가 저장되는 경우 0
- quota 초과 후 partial file·orphan index 0
- log rotation 후 승인된 총 크기 예산 초과 0
- log·error·evidence의 raw email·token·payload·absolute private path 0
- readiness가 unsafe data layout, lost lock, incomplete migration, low disk를 OK로 보고하는 경우 0
- 정상 browser·API·Agent 핵심 workflow 성공률 100%

### 증빙

verification/evidence/validation/phase12/p12-m3-http-auth-resource-hardening.json

### 완료판정

모든 응답과 실패 경로가 동일 보안 정책을 따르고, 구성된 abuse·resource 예산을 자동 집행하면서 정상 workflow를
깨뜨리지 않으면 완료한다.

### 비범위·잔여 위험

MFA·SSO, WAF, DDoS 방어와 24시간 관제는 비범위다. 이 단계만으로 공개 인터넷 bind를 허용하지 않는다.

## P12-M4 — 승인·릴리스 리비전 무결성

### 목표

승인과 릴리스를 실제 존재하는 정확한 리비전 및 모델 hash에 결속한다. 과거 이력은 보존하되 새 리비전이 생기면
현재 프로젝트의 release eligibility를 stale로 만들어 잘못된 최종판정을 방지한다.

### 구현·산출물

- approval/release 상태기계와 허용 전이 표
- 대상 rev 존재, project 소속, 모델 artifact/hash 확인
- latest rev와 승인 rev가 다른 경우 current status stale·not-current
- 과거 승인·릴리스 event는 immutable history로 보존하고 현재 eligibility와 분리
- approved와 released 권한 분리 여부를 반영한 역할 정책
- expected current rev/version을 이용한 optimistic concurrency 또는 동등한 경합 방지
- 승인·취소·릴리스·stale event의 actor, rev, model hash, reason, timestamp audit
- 기존 project meta를 새 schema로 안전하게 읽는 migration adapter
- UI·API·Agent·보고서에 current rev, approved rev, released rev, stale reason 표시

### 제품 표면 영향

존재하지 않거나 오래된 rev를 승인하려는 요청은 실패한다. 새 rev 저장 직후 과거 release 기록은 이력으로 남지만
현재 프로젝트는 다시 검토될 때까지 released로 표시되지 않는다.

### 리팩토링·보안 경계 gate

- body.rev를 검증 없이 저장하지 않는다.
- 역사 event를 새 rev 저장 시 삭제·덮어쓰지 않는다.
- stale release를 current release처럼 반환하지 않는다.
- 역할 변경이나 schema migration은 기존 프로젝트를 승인 상태로 자동 승격하지 않는다.
- API, UI, Agent, 보고서가 서로 다른 상태 계산을 구현하지 않고 하나의 domain owner를 사용한다.

### 검증

- P12-APR-01: 없는 rev·다른 project rev·비정수 rev 거부
- P12-APR-02: 허용·금지 상태전이와 역할 matrix
- P12-APR-03: rev·model hash 결속과 tamper detection
- P12-APR-04: 새 rev 생성 시 current eligibility stale
- P12-APR-05: immutable history와 current projection parity
- P12-APR-06: concurrent save·approve·release race
- P12-APR-07: legacy meta migration과 fail-closed
- P12-APR-08: API·UI·Agent·보고서 상태 parity

전용 테스트: tests/p12-m4-approval-revision-integrity.mjs

### 정량 수용기준

- 존재하지 않는 rev의 approved/released 성공 0건
- released event의 projectId·rev·model hash·actor·timestamp 누락 0
- 새 rev 후 stale release가 current released로 보이는 API·UI·Agent·보고서 fixture 0
- 동시성 fixture에서 이중 release·lost update·rev/hash 불일치 0
- 허용 상태전이와 역할 matrix 자동 검증률 100%
- legacy fixture의 silent approval elevation 0
- audit event와 current projection 재계산 결과 parity 100%

### 증빙

verification/evidence/validation/phase12/p12-m4-approval-revision-integrity.json

### 완료판정

모든 승인·릴리스가 검증된 rev/hash를 가리키고, 새 변경은 즉시 현재 자격을 stale로 만들며, 이력과 현재 상태가
동시성 하에서도 일치하면 완료한다.

### 비범위·잔여 위험

법적 전자서명, 외부 문서관리시스템 연동과 조직별 다중 승인 workflow는 비범위다.

## P12-M5 — 릴리스 패키징, 설치와 백업·복구

### 목표

배포 ZIP이 개발 저장소 구조에 의존하지 않고 공개 자산과 서버·운영 도구를 분리해 설치되도록 만든다.
도움말·설정·backup/restore가 실제 제품 경로와 일치해야 한다.

### 구현·산출물

- 설치 폴더의 public, server, docs/help, operations 구분
- public/web-asset-manifest와 전체 release-manifest·SHA-256
- package forbidden-path와 secret-pattern scanner
- help.html 또는 동등한 제품 도움말, config sample, setup guide 포함
- backup, verify, restore, migration 도구와 운영 runbook 포함
- 신규 설치, 기존 데이터 연결, 이전, 재기동, backup/restore smoke
- source root 없이 unpacked ZIP만으로 실행하는 Windows smoke
- desktop scaffold와 web package의 data path·config 계약 통일
- signed installer를 포함할지에 대한 사용자 결정과 미포함 시 명확한 제한

### 제품 표면 영향

사용자는 설치 폴더와 데이터 폴더를 구분해 안내받고, 설정·백업·복구 명령을 제품 패키지 안에서 찾을 수 있다.
개발용 docs·tests·reports·output은 배포물에 포함되지 않는다.

### 리팩토링·보안 경계 gate

- ZIP 생성 전에 실제 data, secrets, backup, .git 포함 여부를 fail-closed 검사한다.
- package.json·server source가 런타임상 필요해 패키지에 있어도 public manifest에는 넣지 않는다.
- 공개 자산 manifest와 전체 release manifest를 혼동하지 않는다.
- backup 성공만 확인하지 않고 별도 빈 상태 경로에 restore 후 기능을 검증한다.
- 개발 저장소나 절대경로가 없으면 시작하지 못하는 패키지는 PASS 처리하지 않는다.

### 검증

- P12-PKG-01: include/exclude·forbidden path·secret scan
- P12-PKG-02: public asset manifest와 전체 manifest hash
- P12-PKG-03: unpacked ZIP 금지 URL scan
- P12-INSTALL-01: clean install·first start·config discovery
- P12-INSTALL-02: signup/login/project/save/restart/open
- P12-HELP-01: 설정·도움말·backup 명령 경로 일치
- P12-BACKUP-02: backup verify·empty-root restore·data parity
- P12-DESKTOP-01: desktop/web 상태 경로 계약 parity

전용 테스트: tests/p12-m5-release-package-install-recovery.mjs

### 정량 수용기준

- ZIP 내부 data/, secrets/, secret.key, users.json, 실제 project/upload, .git 포함 0건
- public manifest 밖 파일의 HTTP 200 응답 0건
- release manifest 파일 목록·크기·SHA-256 재계산 일치율 100%
- source root 참조 없이 clean install smoke 성공률 100%
- 설치 후 가입→로그인→프로젝트 생성→저장→재기동→열기 성공
- backup→빈 상태 경로 restore 후 사용자·프로젝트·rev·파일 수와 hash parity 100%
- config sample·setup guide·실제 loader의 설정 key parity 100%
- 도움말·backup·restore 경로의 broken link·missing command 0

### 증빙

verification/evidence/validation/phase12/p12-m5-release-package-install-recovery.json

### 완료판정

깨끗한 PC형 환경에서 ZIP만으로 설치·시작·재기동·백업 복구가 가능하고, package와 HTTP 표면에 private artifact가
없으며 모든 manifest hash가 일치하면 완료한다.

### 비범위·잔여 위험

정식 installer, 코드서명, 자동 업데이트는 사용자 승인 전 비범위다. portable ZIP 통과를 installer 통과로 표현하지 않는다.

## P12-M6 — Windows 회귀 정상화와 릴리스 게이트 통합

### 목표

Windows에서 공식 테스트 명령이 줄바꿈이나 테스트 누락 때문에 거짓 실패·거짓 성공하지 않게 한다. 빠른 회귀,
장시간 공학 회귀, Phase 12 보안 release gate를 명시적으로 분리하고 최종 gate에서 모두 소비한다.

### 구현·산출물

- text content 비교의 CRLF/LF 정규화와 binary/hash 비교의 명확한 구분
- tests/*.mjs 전체 inventory와 default, release-long, platform-specific, helper, retired 분류
- 누락된 실제 테스트의 runner 편입 또는 승인된 제외 사유·owner·만료일
- test:fast, test:p12, test:long, test:release 계약과 package.json 연결
- Phase 8 전체 장시간 실행과 timeout·중단을 BLOCKED로 기록하는 정책
- source와 unpacked release 보안 scan을 test:release 필수 항목으로 연결
- 테스트 전후 tracked worktree 변화 검사와 generated artifact hygiene
- Windows reference environment와 실행시간·peak memory·disk budget

### 제품 표면 영향

사용자 기능은 바뀌지 않는다. 개발자와 릴리스 담당자는 어떤 테스트가 빠른 확인용이고 어떤 명령이 실제 release를
허용하는지 명확히 구분하게 된다.

### 리팩토링·보안 경계 gate

- 모든 테스트를 무조건 default에 이어붙여 timeout을 숨기지 않는다.
- 실패 테스트를 삭제·SKIP해 green으로 만들지 않는다.
- 내용이 같은 text의 OS 줄바꿈만 정규화하고 PDF·ZIP·binary hash는 완화하지 않는다.
- 장시간 suite 미완주를 PASS로 기록하지 않는다.
- 테스트가 tracked evidence를 조용히 다시 쓰지 않게 한다.

### 검증

- P12-TEST-01: LF·CRLF 동일 text와 다른 text 판정
- P12-TEST-02: 테스트 inventory 분류·runner coverage
- P12-TEST-03: package script dependency graph
- P12-TEST-04: pre-existing dirty allowlist 대비 test-induced change 0
- P12-TEST-05: P8 전체 long suite 완료 상태와 evidence
- P12-TEST-06: P7·P9·P10·P11·P12 관련 회귀
- P12-TEST-07: source·unpacked release security scan 연결
- P12-TEST-08: timeout·missing evidence·schema failure의 release 차단

전용 테스트: tests/p12-m6-windows-regression-release-gates.mjs

### 정량 수용기준

- tests/*.mjs 분류율 100%, 분류 없는 파일 0
- 실행 대상 runner 누락 0, 승인 없는 SKIP 0
- LF·CRLF fixture 판정 parity 100%, 실제 content 차이 탐지율 100%
- Windows test:release의 failed 0, timeout 0, missing evidence 0
- P8 전체 suite 미완주 상태에서 release manifest가 PASS인 경우 0
- 테스트 전후 pre-existing 목록 이외 tracked·untracked 변화 0
- source와 unpacked release 금지 URL scan 모두 green
- evidence schema validation failure 0

### 증빙

verification/evidence/validation/phase12/p12-m6-windows-regression-release-gates.json

### 완료판정

Windows 공식 release 명령이 모든 필수 fast·long·security gate를 실제로 실행하고, 전체 green·evidence 유효성·작업트리
hygiene를 동시에 만족하면 완료한다.

### 비범위·잔여 위험

macOS·Linux native qualification은 별도 환경 evidence 없이는 주장하지 않는다. 장시간 공학 테스트 green이 Phase 10의
외부 독립 교차검증을 대신하지 않는다.

## P12-M7 — clean-install 내부 파일럿과 최종 release gate

### 목표

깨끗한 Windows 환경에서 신규 설치와 레거시 이전을 반복 실행해 운영 보안 경계, 데이터 무결성, 승인 상태,
백업·복구와 산출물 hash를 최종 검증한다. fail-closed manifest가 허용 범위를 정확히 선언하게 한다.

### 구현·산출물

- LOCAL-PILOT-01 신규 설치 fixture와 LEGACY-MIGRATION-01 이전 fixture
- 각 fixture의 3회 독립 실행과 run별 고유 output
- install→start→account→project→upload→revision→approve→release→restart→open workflow
- 공격 URL, limit, stale approval, old token, disk·permission failure injection
- backup→빈 상태 root restore와 재기동
- package·public asset·data integrity·approval history manifest
- full regression, final high 수준 code review, risk/debt audit
- fail-closed Phase 12 release manifest와 사용자 매뉴얼 제한 문구
- 검증된 source revision의 의도적 version tag와 비공개 원격 보존 여부 확인

### 제품 표면 영향

통과 시 loopback-only 내부 파일럿 프로필을 정식으로 표시할 수 있다. LAN, public internet,
design transfer는 조건이 없으면 계속 blocked로 표시한다.

### 리팩토링·보안 경계 gate

- owner 없는 debt와 open Critical/High finding을 허용하지 않는다.
- 이전 milestone evidence의 파일 존재만 보지 않고 source revision과 hash를 재검증한다.
- 한 번의 성공을 3회 반복 parity로 대체하지 않는다.
- local profile 성공으로 LAN·public profile을 승격하지 않는다.
- Phase 10·11 제한을 release 문구에서 제거하지 않는다.

### 검증

- P12-E2E-01: LOCAL-PILOT-01 3회 workflow parity
- P12-E2E-02: LEGACY-MIGRATION-01 3회 migration parity
- P12-E2E-03: restart·old token·stale approval·backup restore
- P12-SEC-01: source·release 공격 URL과 secret scan 최종 재검증
- P12-FAIL-01: permission·disk·lock·partial migration failure injection
- P12-REL-01: 전체 regression·review·risk·docs gate
- P12-REL-02: artifact·evidence·source revision hash 재계산
- P12-REL-03: 프로필별 release claim fail-closed

전용 테스트: tests/p12-m7-local-pilot-release-gate.mjs

### 정량 수용기준

- 두 fixture 각각 3/3 완료, 데이터 count·hash·승인 projection parity 100%
- source·unpacked release 민감 URL HTTP 200과 private content 노출 0건
- 구 token 인증 성공 0, stale release의 current 표시 0
- backup restore 후 사용자·project·rev·upload hash parity 100%
- failure injection의 false success·partial publish·silent data loss 0
- 전체 release test failed 0, missing evidence 0, open Critical/High 0
- package·evidence·source revision hash 재검증 일치율 100%
- release manifest에서 local-pilot만 조건부 true, LAN·public·designTransfer는 근거 없으면 false
- raw secret·PII·프로젝트 본문의 ZIP·log·evidence 노출 0

### 증빙

verification/evidence/validation/phase12/p12-m7-local-pilot-release-gate.json  
verification/evidence/validation/phase12/p12-release-manifest.json

### 완료판정

모든 필수 evidence가 현재 source와 artifact에 결속되고 3회 clean-install·migration 파일럿, backup restore,
공격·실패 matrix, 전체 회귀와 review가 모두 통과할 때만 loopback 내부 파일럿을 release-qualified로 판정한다.

### 비범위·잔여 위험

통제된 LAN은 별도 환경 qualification 없이는 blocked다. 공개 인터넷과 최종 구조설계·인허가 전이는 계속 NO-GO다.

## 6. 사용자 판단이 필요한 변경

다음은 자동으로 결정하지 않는다. 권장안은 구현을 진행할 수 있는 안전 기본값이며, 결정 기한 전까지 해당 범위는 blocked다.

| 결정 | 권장안 | 결정 기한 | 미결정 시 동작 |
| --- | --- | --- | --- |
| 최신 코드 보존 원격 | 비공개 원격 + 검증된 local bundle | M0 완료 전 | bundle만 만들고 push·tag 보류 |
| Phase 12 목표 프로필 | 우선 loopback-only 내부 파일럿 | M0 완료 전 | LAN·public blocked |
| Windows 기본 data 위치 | 사용자별 LOCALAPPDATA 계열, server는 explicit path | M2 착수 전 | loopback 사용자별 경로 |
| 가입 정책 | 첫 관리자 bootstrap 후 기본 가입 차단 | M2 착수 전 | allowRegistration=false |
| secret 교체 시점 | migration verify 직후 명시적 1회 rotation | M2 qualification 전 | 구 token 사용 가능 상태로 release 차단 |
| 승인·릴리스 권한 | reviewer 승인, owner/release-manager 릴리스 | M4 착수 전 | released 전이 비활성 |
| rate limit·quota 기본값 | M0 실측 후 보수적 기본값 + config 상한 | M3 qualification 전 | LAN blocked |
| 새 runtime dependency | 의존성 없이 우선 구현, 필요 시 license·보안 검토 | 각 도입 전 | dependency 추가 금지 |
| 정식 installer·코드서명 | portable ZIP 이후 별도 후속 단계 | M5 착수 전 | ZIP만 qualification |
| 레거시 원본 보존기간 | restore 검증 후 최소 30일, secret은 재배포 금지 | M2 qualification 전 | 원본 자동 삭제 금지 |

## 7. 중단조건과 release 차단조건

다음 중 하나라도 발생하면 해당 마일스톤을 완료 처리하지 않고 의존 작업 및 release를 중단한다.

- allowlist 밖 파일 또는 private artifact가 HTTP 200으로 한 건이라도 반환됨
- public, data, secrets가 canonical 경로상 겹침
- migration count/hash 불일치, silent overwrite, partial publish 또는 원본 변경
- rotation 후 구 token이 인증됨
- 존재하지 않는 rev가 approved/released가 되거나 새 rev 후 stale release가 current로 보임
- limit·quota·disk failure가 false success 또는 orphan artifact를 만듦
- ZIP, backup, log, error, evidence에 raw secret·token·PII·프로젝트 본문이 포함됨
- Windows 필수 suite가 fail, timeout, 미실행 또는 missing evidence 상태임
- source revision, artifact hash, evidence hash가 불일치함
- open Critical/High finding이 남음
- loopback evidence만으로 LAN·public·designTransfer를 true로 만들려 함

같은 blocking condition이 해소되지 않은 채 반복되면 blocker code, owner, 필요한 사용자 결정과 재개조건을
IMPLEMENTATION_STATUS.md와 release manifest에 기록한다.

## 8. 첫 착수 순서

실행 승인을 받으면 다음 순서로 P12-M0를 시작한다.

1. 현재 full revision, remote delta, tag, dirty path를 다시 측정한다.
2. 현재 커밋을 담은 복구 가능한 bundle을 만들고 verify한다. 원격 push는 별도 승인을 받는다.
3. 실제 사용자 data를 건드리지 않는 합성 임시 dataDir에서 source·release 노출 matrix를 고정한다.
4. public/private/secret 자산 목록과 경계 ADR을 확정한다.
5. 테스트 전체 inventory와 현재 Windows 실패를 기준선 evidence에 기록한다.
6. Phase 12 문서·schema·상태 skeleton과 P12-M0 전용 gate를 만든다.
7. M0 review와 milestone commit을 끝낸 뒤 즉시 P12-M1 정적 공개 경계 구현으로 이동한다.

P12-M1의 치명적 노출 차단이 첫 production code 변경이다.

## 9. 상태 갱신 규칙

- IMPLEMENTATION_STATUS.md는 P12-M0에서 생성하고 이후 실제 상태의 유일한 권위 문서로 사용한다.
- 각 마일스톤 행에는 code, dedicated gate, related/full regression, evidence, review, commit을 각각 기록한다.
- 계획 문서와 작업 패키지가 있다는 이유로 planned를 implementation-complete로 바꾸지 않는다.
- review와 evidence에는 실제 source revision을 기록하며 수정 후에는 hash를 다시 계산한다.
- release manifest는 P12-M7 이전에는 fail-closed 상태를 유지한다.
- Phase 12 완료 후에도 Phase 10 engineering gate와 Phase 11 CONDITIONAL_PASS 제한은 별도 상태로 유지한다.

