# 실행물·개발·보관 영역

2026-09-13 정리 기준. 수치 알고리즘은 유지하고 디렉터리 경계, 문서 참조, 실행 자산을 정리했다.

## 개발 저장소에 유지하는 것

| 경로 | 책임 |
|---|---|
| src, index.html, app.html 등 | 현재 제품과 UI/WebMCP, 해석·설계·보고서 |
| server | 로컬 API와 프로젝트 저장·정적 자산 경계 |
| assets/fonts | 보고서 글꼴·라이선스·출처 |
| desktop, native | 선택적 데스크톱 및 WASM 재빌드 원본 |
| tests, tools | 회귀 검사·내보내기·배포·운영 도구 |
| verification | 검증 프레임워크와 기존 증거. 제품 실행물에서 제외 |
| docs/phase25, user-manual, ux 등 | 현재 개발·사용 안내 |
| docs/archive | 과거 Phase 2~24 및 post-phase5 기록 |
| reports 및 추적된 output | 기존 공개·검증 근거. 실행물에서 제외 |

Phase19 옛 경로의 단일 Markdown은 append-only 과거 로그의 링크를 유지하는 이동 안내문이다.
증거 파일 안의 과거 경로는 해당 소스 커밋의 기록으로 보존한다. 참조 검사에 필요한 과거 생성물 2개는 verification/archive/generated에 보관하고 verification/workspace-paths.mjs가 연결한다.

## 독립 실행물 만들기

저장소에서 `python tools/export-runtime.py <저장소 밖 새 폴더>`를 실행한다.
기존 대상은 덮어쓰지 않는다. 실행물 안의 Start-S-Structures.cmd 또는 npm start를 사용한다.
Node.js가 필요하며 실행 주소는 http://127.0.0.1:5173/ 이다.
이 exporter는 미커밋 코드도 포함하므로 manifest의 기준 커밋·변경 여부와 파일 해시를 확인한다.
정식 커밋 기반 ZIP은 tools/package-publication.py, Pages는 tools/build-pages.py가 담당한다.

실행물에는 src/server/글꼴/사용 안내/운영 도구만 포함하고 테스트·검증 근거·과거 문서는 넣지 않는다.
실행물은 개발 원본의 대체물이 아니다. 변경은 개발 원본에서 하고 다시 내보낸다.

## 별도 보관할 것

이전 생성물과 체크아웃은 저장소 밖 날짜별 archive에 보관한다. Git worktree는 일반 폴더 이동 대신 git worktree move로 등록까지 갱신한다.
파일명만으로 폐기 여부를 결정하지 않는다. 이번 src/server/desktop 해시 비교에서 비어 있지 않은 완전 동일 코드 파일은 없었다.
linear3d.js와 기존 UI·trace 호환 경로는 호출자 확인 없이 제거하지 않는다.

사용자 데이터와 secrets는 실행 파일과 별도로 관리한다. 기본 Windows 상태 위치는 %LOCALAPPDATA%/S-Structures이다.
브라우저 자동저장은 주소별로 분리되므로 다른 컴퓨터·주소로 옮길 때 프로젝트 내보내기·가져오기가 필요하다.
백업 도구에는 실제 --dataDir을 지정한다. 별도 secrets 보존도 확인해야 한다.

## 검증 경계

이번에는 정적 자산 경계·빠른 preview 10개·문서 참조·작은 탄성 모델의 원본/실행물 결과 일치를 검사했다.
GPU 장치별 실행, 전체 수치 적합성, 실제 건물 설계, 전체 복구, 서명된 Electron 설치본은 별도 검증 대상이다.
