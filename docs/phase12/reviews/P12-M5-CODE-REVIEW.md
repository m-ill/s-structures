# P12-M5 Code Review — Release Package, Install and Recovery

    review: p12-m5-review-v1
    verdict: PASS
    milestone_status: qualification-complete
    dedicated_gate: PASS
    clean_install: PASS
    backup_restore: PASS
    critical_findings_open: 0
    high_findings_open: 0
    evidence_artifact: reports/validation-evidence/phase12/p12-m5-release-package-install-recovery.json

## 검토 결과

- source server와 release server가 같은 static allowlist를 사용한다.
- release에는 runtime상 필요한 src가 public과 server root에 각각 있지만 server root 사본은 HTTP로 제공되지 않는다.
- web asset 618개가 manifest bytes·hash와 일치하고 금지 URL은 모두 404다.
- clean install에서 account·project 생성, 재기동·로그인·project 재열기가 성공했다.
- backup을 빈 data root에 restore한 뒤 같은 secrets root로 재기동·로그인·project 조회가 성공했다.
- 정식 installer·코드서명은 아직 주장하지 않으며 portable ZIP만 qualification 대상이다.

