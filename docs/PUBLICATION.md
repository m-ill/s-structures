# 공개 패키지와 검증자료

소스 공개는 기존 `LICENSE.txt`의 독점적 라이선스를 변경하지 않는다. 이 저장소를 오픈소스 라이선스 프로젝트로 표시하지 않는다.

## 버전 기준선

기존 로컬 HEAD `a44eb98601e4fbcd2913bbb34a809d126452f793` 이후 작업을 `a18fcee`에 보존한 뒤 WebMCP를 구현했다. 개발 브랜치는 `work/webmcp-publication-20260905`다. 원래 작업 폴더와 전체 Git 이력은 Vault의 별도 비공개 백업에 보존했다. 공개 패키지는 Git 이력을 포함하지 않는다.

## 재현

Node.js 24, Python 3의 표준 라이브러리를 사용한다. 루트 npm 의존성 설치는 필요 없다.

```sh
node tools/run-public-validation.mjs ../validation-new-run
python tools/package-publication.py ../publication-new-run ../validation-new-run
```

검증은 별도 checkout에서 실행한다. 첫 명령은 WebMCP·브리지·공개 API·P17 프레임워크·P18/P18A 수치 회귀의 13개 실행 단위를 기록한다. 전체 역사적 회귀는 추가로 `npm test`를 실행해 별도 로그와 종료코드를 보관한다. 13개 실행 단위 수는 공인 벤치마크 합격 수가 아니다. 과거 고정 경로 증거를 생성하는 명령은 원본 저장소에서 실행하지 않는다.

두 번째 명령은 추적 파일 변경이 없는 커밋만 허용하고 기존 출력 폴더를 덮어쓰지 않는다. 세 ZIP은 각각 소스, Node 실행용 웹앱, 해당 커밋의 검증 증거다. 각 ZIP 내부 `PACKAGE-MANIFEST.json`과 외부 `SHA256SUMS.txt`로 바이트를 확인한다. 원본 STRIX 문서, 사용자 데이터, 비밀키, 기존 output/reports 및 전체 Git 이력을 제외한다. `publication.json`에 제외 경로를 기록한다.

## GitHub 배치

- 저장소: 소스 ZIP의 파일을 검토 후 커밋. `src/`, `server/`, `tests/`, `verification/`, `tools/`, `docs/` 유지.
- GitHub Actions: 공개 자체 검증을 Windows/Ubuntu에서 실행하고 결과를 artifact로 저장. 호스팅된 CI 실행 여부는 로컬 결과와 구분.
- Release: 같은 커밋/tag의 runtime ZIP, evidence ZIP, SHA256SUMS 및 publication manifest 첨부. 검증 출처 commit과 게시 tag가 다르면 두 식별자를 명시한다.
- 원자료: 재배포 권한이 확인되지 않은 제3자 문서·상용 프로그램 결과는 올리지 않고 출처 URL·해시·입력 부족 상태를 남긴다.

STRIX 공식 동등성/제3자 적격 판정은 주장하지 않는다. P18의 내부 엔진 시험과 원자료가 부족한 케이스는 분리한다. 과거 SB1 고정 코드 증거는 현재 커밋의 증거로 재사용하지 않는다. 소스 패키지에는 역사적 검증 문서가 포함될 수 있으며, 현재 합격 여부는 새 evidence ZIP의 `validation.json`으로 판정한다.
