# P12-M2 Code Review — Config, Migration and Secret Lifecycle

    review: p12-m2-review-v1
    verdict: PASS
    milestone_status: qualification-complete
    dedicated_gate: PASS
    related_regression: PASS
    critical_findings_open: 0
    high_findings_open: 0
    evidence_artifact: verification/evidence/validation/phase12/p12-m2-config-migration-secret-lifecycle.json

## 검토 결과

- data와 secrets의 기본 경로가 설치/public 밖으로 이동했다.
- legacy secret 감지 시 묵시적으로 새 key를 만들지 않고 explicit migration을 요구한다.
- failure injection 후 staged·published target이 남지 않고 원본 hash가 유지된다.
- rotation 후 구 token은 401이고 기존 password login은 성공한다.
- backup은 key 파일을 기본 제외한다.

## 관련 회귀

- P12-M1, p3-auth, p4-backup-tool, p4-release-tools PASS

