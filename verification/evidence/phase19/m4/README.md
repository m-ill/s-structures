# M4 WebMCP 작업 검증 증거

- [validation.json](validation.json): 최종 고정 소스의 별도 checkout에서 관련 회귀 **39 PASS / 0 FAIL**. 실행 환경·manifest·소스 ZIP·로그 SHA 포함.
- [acceptance-summary.json](acceptance-summary.json): 최종 소스, 런타임 tree, 범위와 제한.
- [browser-smoke.json](browser-smoke.json): 실제 Site tools의 직접/호스트 강재·RC 워크플로, 프로젝트 전환, 후보별 범위와 브라우저 진단 기록.
- [강재 JSON](browser-steel.json), [호스트 RC JSON](browser-rc.json), [고유 핸들 보강 후 강재 JSON](browser-steel-final.json): 같은 UI 보고서 버튼으로 다운로드한 합성 모델 결과. Site tools·UI의 snapshot 해시 일치 확인.
- [도구 스키마](tools.json): v1 9개 + 신규 18개, 총 27개 도구의 등록 메타데이터.
- 39개 `.log`와 `SHA256SUMS.txt`: 원본 로그 사본과 파일 무결성 목록.

최종 원본 소스 ZIP·checkout·로그는 `output/phase19/m4-r3-20260907/`에 보존한다. R1과 R2도 각 39/39 PASS였으며 각각의 raw 폴더를 유지한다. 시험 횟수를 합산해 고유 시험 개수로 보고하지 않는다.

```powershell
node tools/run-p19-validation.mjs <새 출력 경로> --manifest=verification/specs/phase19/m4-tests.json
```

강재·RC Site tools 전체 흐름은 c9f8eca에서, 세션 UUID 보강 후 강재 전체 흐름은 b1f389c에서 확인했다. 이후 secure UUID 경로를 유지하며 비보안/미지원 환경의 fallback만 추가하고 최종 39개를 재실행했다. 이 소스별 범위를 숨기지 않는다. UI/서비스 canonical 동등성·실제 solver 회귀는 최종 코드에서 강재·RC 모두 포함한다.

실제 PDF 저장·비선형 생산 자격·전체 브라우저 matrix 검증은 아니다. 초기 호스트의 출처 미확인 MutationObserver 오류 1건과 일부 브라우저 조작 지연은 browser-smoke.json에 남겼다. 실제 A/B 프로젝트 전환에서는 오류가 재현되지 않았고, 최종 UI 조작은 접근성 API로 완료했다. GitHub push는 수행하지 않았다.
