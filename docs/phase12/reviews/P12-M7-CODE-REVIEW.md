# P12-M7 Code Review — Local Pilot and Final Release Gate

    review: p12-m7-review-v1
    verdict: PASS
    milestone_status: release-qualified
    dedicated_gate: PASS
    local_pilot_runs: 3/3
    legacy_migration_runs: 3/3
    full_release_regression: PASS
    critical_findings_open: 0
    high_findings_open: 0
    evidence_artifact: verification/evidence/validation/phase12/p12-m7-local-pilot-release-gate.json
    release_manifest: verification/evidence/validation/phase12/p12-release-manifest.json

## 검토 결과

- 3개의 신규 설치 상태 루트가 계정·프로젝트·업로드·revision·승인·release·restart·stale·backup/restore를 동일하게 완료한다.
- 3개의 레거시 상태가 원본 불변과 token version 증가를 유지하며 이전되고, 구 HMAC token은 모두 401로 거부된다.
- restore된 데이터의 파일 목록·크기·SHA-256은 backup 직전 상태와 일치한다.
- source와 unpacked release에서 `.git`, package/server source, data, secrets, reports, output, tmp URL의 HTTP 200은 0건이다.
- 배포 manifest와 public manifest의 모든 파일 bytes·SHA-256이 실제 파일과 일치한다.
- 중복 lock, storage quota, partial publish, invalid target, live legacy lock의 false success와 orphan upload는 0건이다.
- M0~M6 evidence와 M0~M7 review를 다시 읽어 status·source revision·Critical/High finding을 검증한다.
- Phase 10의 외부 공학 검증 차단과 Phase 11의 `CONDITIONAL_PASS` 상한을 최종 release claim에 보존한다.

## 판정 범위

- 허용: 지정 Windows 환경, 단일 PC, loopback-only 내부 파일럿.
- 차단 유지: 통제된 LAN, 공개 인터넷, 다중 조직 서비스, 최종 구조설계·인허가 전이.
- 배포 형식: portable ZIP. 정식 installer, 코드서명, 자동 업데이트는 포함하지 않는다.
