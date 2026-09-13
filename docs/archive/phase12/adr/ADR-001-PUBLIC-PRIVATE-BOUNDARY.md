# ADR-001 — Public, Data and Secrets Boundary

    status: accepted
    date: 2026-08-03

## 결정

- HTTP는 지정 HTML과 browser용 src 자산만 공개한다.
- release는 public 디렉터리를 별도 생성하고 server source·package metadata를 그 밖에 둔다.
- data와 secrets는 설치/public 밖의 형제 디렉터리로 둔다.
- canonical 경로가 중첩되면 서버는 fail-closed한다.
- 금지 경로는 존재 여부와 관계없이 404다.
- migration과 secret rotation은 서버 정지 상태에서 명시적 도구로 실행한다.

## 이유

현재 저장소 루트 정적 제공 구조는 data, Git metadata와 server source를 함께 노출한다. denylist는 새 파일이 생길 때
다시 열리므로 명시적 공개 경계가 필요하다.

