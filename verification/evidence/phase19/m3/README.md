# M3 탄성 설계 검토 증거

- [validation.json](validation.json): 고정 소스 `7683047ac3552672bd0c2dad8ae0919c6ae989e5`의 별도 checkout에서 **34 PASS / 0 FAIL**. manifest·소스 ZIP·원본 로그 SHA-256 포함.
- [acceptance-summary.json](acceptance-summary.json): 구현 범위, 런타임 tree와 미완료 자격.
- [browser-smoke.json](browser-smoke.json): 실제 브라우저의 입력→정적해석→검토→보고서 다운로드 관찰.
- [HTML](browser-review.html), [JSON](browser-review.json), [CSV](browser-review.csv): 실제 다운로드한 합성 강재 예제 결과. 검토 91항목, OK 79 / WARN 8 / NG 0 / NOT_CHECKED 4. 같은 snapshot의 지배비 0.9103732902271767. 미검토를 PASS로 바꾸지 않는다.
- 34개 `.log`와 `SHA256SUMS.txt`: 원본 로그 및 이 폴더의 파일 무결성 목록.

원본 소스 ZIP·checkout은 `output/phase19/m3-r1-20260907/`에 보존한다. 대형 ZIP을 Git에 중복 업로드하지 않는다.

```powershell
node tools/run-p19-validation.mjs <새 출력 경로> --manifest=verification/specs/phase19/m3-tests.json
```

강재·RC 각각 UI bridge/Agent의 실제 정적·Direct P–Delta 실행과 설계 행 일치를 시험했다. 모달·RSA·좌굴·선형 THA도 실제 제품 실행으로 순서를 검증했다. 실패/취소의 이전 성공 재사용 차단은 모의 실패 주입 시험이다. P11 PDF 시험의 adapter는 모의이며, M3는 같은 snapshot의 PDF용 HTML 입력을 대조했다. 실제 PDF 저장·인쇄·레이아웃 자격 완료를 뜻하지 않는다. 신규 WebMCP 도구는 M4, 비선형 생산 자격과 공개 배포는 후속 단계다.
