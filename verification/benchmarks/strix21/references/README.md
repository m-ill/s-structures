# STRIX21 References

외부 benchmark 원문과 독립 기준값은 출처, 문서 버전, license/사용 조건, 파일 SHA-256 및 추출한 probe 정의와 함께 보존한다. 실행 결과에서 역으로 expected 값을 생성하지 않는다.

## P17-M0 canonical source custody

- registry: `../suite-source-registry-r2.json`
- official source locks: `source-locks-r2/<CASE_ID>.source-lock.json`
- discrepancy register: `source-version-discrepancies-r2.json`

suffix가 없는 registry·discrepancy와 `source-locks/` 21개는 R1 parser 초안이다. R1은 삭제·덮어쓰기하지 않지만 이후 판정에 사용하지 않는다. 각 R2 파일의 `supersedes`가 R1 path·hash·정정 이유를 연결한다.
