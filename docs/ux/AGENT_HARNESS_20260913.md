# AI Agent 연결 UX 수정 — 폴더 직접 준비

2026-09-13 / 사용자 피드백 반영. 아래 v1의 복사·ZIP 안내는 이전 구현 기록이다.

현재 기본 흐름은 메뉴 → AI Agent에 연결 → 프로젝트 폴더 선택 → 이 폴더에 준비이다.
사용자에게 프롬프트 복사, ZIP 다운로드, 압축 해제, CLI 실행을 요구하지 않는다.
공개 주소와 생성되는 project.json의 siteUrl은 https://m-ill.github.io/s-structures/ 로 고정한다.
File System Access API의 사용자 폴더 선택/권한을 이용해 준비 파일을 생성한다.
기존 파일은 보존하고 기존 .sstructures 기록 충돌은 자동 병합하지 않는다.
폴더 준비 상태와 agentVerified:false를 WebMCP 조회에 제공한다. 폴더 핸들은 저장/노출하지 않는다.
파일 쓰기 중 다른 프로세스가 같은 경로를 변경하는 동시성 격리는 제공하지 않으므로 준비 중 동시 편집은 범위 밖이다.

지원하지 않는 브라우저에는 폴더 접근 미지원을 표시한다. 웹사이트가 AI 호스트의 현재 폴더를 감지하거나 대화를 자동 시작하는 기능은 구현하지 않았다. 따라서 사용자가 원한 완전한 원클릭 AI 연결은 아직 완료되지 않았다. 호스트 측 연동이 필요하다.

검증: 배포 필수 10개 검사 통과. 실제 브라우저에서 수동 버튼 부재와 폴더 선택 API 노출 확인, 브라우저의 격리된 origin-private 테스트 디렉터리에 16개 파일 쓰기 및 내용 확인. OS 폴더 선택창을 통한 실제 사용자 프로젝트 쓰기는 자동화하지 않았다. 화면: output/agent-harness/connection-folder.png.

---
# AI Agent 프로젝트 준비 하네스 v1

2026-09-13 / 로컬 구현 및 최소 검증 완료 / 공개 배포 전

## 사용 흐름

메뉴 → **AI Agent에 연결** → 시작 문장 복사 → AI 앱의 현재 프로젝트 대화에 붙여넣기.
WebMCP 지원 시 `get_agent_harness`와 `read_agent_harness_file`로 파일을 읽는다.
지원하지 않으면 **준비 패키지 다운로드**의 ZIP을 AI에게 전달한다.
브라우저가 현재 로컬 폴더를 감지하거나 쓰지 않는다. 다운로드를 연결 성공으로 표시하지 않는다.

ZIP은 README.md, harness-package.json, install.mjs를 포함한다. 임시 폴더에 풀고 설치 내용을 검토한다.
Node.js 설치기는 `node install.mjs --target "기존 프로젝트 폴더"`로 미리보기만 수행한다.
사용자가 요청한 범위에서 `--apply`로 신규 파일만 생성한다. 코드 실행 환경 준비는 AI 호스트가 담당한다.

## 설치 계약

- AGENTS.md / CLAUDE.md는 짧은 진입 안내이며 상세 지침은 `.sstructures/harness/instructions.md`에 둔다.
- `.sstructures`에 프로젝트 정보, 단계, 정책, 출처, 사실값, 질문, 사람의 결정 기록을 둔다.
- inputs/models/runs/reports는 전용 README만 추가한다. 원자료·현재 화면의 모델·결과를 복사하지 않는다.
- 기존 파일은 항상 보존한다. 기존 진입 파일 충돌은 명시적으로 보고하고 공통 지침을 직접 읽게 한다.
- 기존 하네스 파일이 달라졌으면 설치 전체를 차단한다. 업그레이드·사용자 상태 병합은 자동 수행하지 않는다.
- 정확한 경로 허용 목록, 경로별 파일/디렉터리 확인, symlink/junction 거절, exclusive create를 사용한다.
- 비동시 로컬 설치를 대상으로 한다. 악성 프로세스가 설치 중 경로를 교체하는 공격까지 격리하는 OS 샌드박스는 아니다.
- 자동 훅, 인증키, AI 호스트 전역 설정은 설치하지 않는다.

## 자료와 사람의 판단

값 상태는 missing/extracted/confirmed/proposed-assumption/approved-assumption으로 구분한다.
초기 사실값은 null이며 지반·물성·하중 등의 수치를 생성하지 않는다.
누락 질문에는 영향과 막힌 단계를 기록하고 사람이 답하기 전 상태를 해소하지 않는다.
사람의 결정에는 입력 해시, 판단자, 시각, 범위, 실제 답변의 근거 위치가 필요하다.
가정 계산은 scenario 및 사람의 가정 결정이 필요하며 최종 발행 준비 판정에는 사용하지 못한다.
KDS는 계산별 판·조항·출처·적용 조건을 남기고 미확보 근거를 꾸미지 않는다.

점검: `node .sstructures/harness/check.mjs "프로젝트 폴더" analysis|publication`.
미완료는 종료 코드 2, 깨진 기록은 1이다. 초기 프로젝트의 미완료는 정상이다.
입력 해시 변경, 미확인 값, 출처 누락, 미결 질문, 사람의 결정 누락을 검사한다.
발행 준비에는 추가로 해당 입력의 수치 검증, 공학 검토 기록, 사람의 발행 결정이 필요하다.

**이 점검은 프로젝트 기록의 준비 상태만 검사한다.** `ready:true`도 설계 적합성이 아니며
`humanIdentityVerified:false`, `designTransferAllowed:false`를 유지한다.
로컬 JSON은 수정 가능하므로 사람 신원 인증과 서명을 제공하지 않는다.
모든 기존 모델 변경·해석·보고서 명령에 대한 강제 게이트를 이번에 추가하지 않았다.
GPU는 선호 정책을 기록하며 이번 변경이 기존 CPU 고정 경로나 GPU 자격을 바꾸지는 않는다.

## 검증

- `node tests/agent-harness.mjs`: 실제 내려받기와 동일한 설치기/파일 패키지 CLI, 미리보기/적용, 기존 지침 보존, 재설치, 상태 충돌, 경로 이탈, junction 거절, 누락/가정/사람/현재성/발행 준비, 읽기 전용 도구, UTF-8 ZIP CRC.
- `node tests/webmcp-integration.mjs`: 기존 실제 해석·계획/결과 일치·중복/오래된 입력 보호, 총 90개 도구.
- `node tests/webmcp-bridge-security.mjs`: 기존 origin/source/변조 보호.
- `node tests/p25-m8-pages-assets.mjs`: 현재 작업 트리의 Pages 정적 의존 파일 검사.
- 로컬 브라우저: 메뉴 진입, 패키지 다운로드, 세션 브리지로 실제 두 조회 도구 호출. native WebMCP 호스트 자동 발견은 이번 검증 대상이 아니다.
- 화면 증거: `output/agent-harness/connection.png`. 실제 건물 해석과 전체 회귀는 수행하지 않았다.

## 다음 확장

신뢰 가능한 전문가 결정 저장·UI, 입력 해시와 승인 범위를 묶는 실행 게이트, 프로젝트 복원/업그레이드,
GPU 공통 Auto 정책을 별도 검증한다. JSON의 actor=human만으로 신원 검증을 대신하지 않는다.
