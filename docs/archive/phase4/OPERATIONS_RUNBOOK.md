# Operations Runbook

status: draft — P4-M8에서 절차 확정, P4-M11 전 리허설 필수
audience: 사무소 관리자(비개발자 포함)를 가정해 명령 단위로 작성

## 1. Install (웹 배포 A형)

```text
1. Node.js LTS 설치 확인: node --version (v20+)
2. 배포 폴더 압축 해제 (예: C:\s-structures)
3. 초기 설정: config.json에서 port / dataDir / allowRegistration 확인
4. 기동: node server/main.mjs
5. 확인: http://127.0.0.1:5180/api/health 가 {"ok":true,...}
6. (선택) Windows 서비스 등록: NSSM 가이드 §7
```

첫 가입 계정이 admin이 된다. 사무소 배포 시 관리자가 먼저 가입한 뒤 `allowRegistration`을 false로 바꾸고 재기동하는 절차를 권장 (초대제 전환).

## 2. Backup

| 항목 | 절차 |
| --- | --- |
| 대상 | `data/` 전체 (users.json, secret.key, projects/) |
| 도구 | `node tools/backup-data.mjs --out <백업경로>` (P4-T45) — 실행 중 백업 안전(원자적 쓰기 + 스냅샷 복사) |
| 주기 권장 | 일 1회 + 승인 이벤트 직후 |
| secret.key | 별도 보안 저장 권장 — 유출 시 전 세션 위조 가능. 유출 의심 시 §5 절차 |
| 검증 | 백업 후 `node tools/backup-data.mjs --verify <백업경로>` 로 무결성 확인 |

## 3. Restore

```text
1. 서버 중지
2. 기존 data/를 data.broken-<날짜>로 이동 (삭제 금지)
3. 백업본을 data/로 복사
4. node tools/backup-data.mjs --verify data
5. 서버 기동 -> 관리자 로그인 -> 최근 프로젝트/revision 확인
```

부분 복구(프로젝트 1건)는 `data/projects/<id>/` 폴더 단위 교체로 가능 — revision은 append-only라 폴더 병합 금지, 통째 교체만.

## 4. Upgrade

```text
1. §2 백업 필수
2. 서버 중지
3. 프로그램 폴더 교체 (data/는 건드리지 않음)
4. 기동 -> /api/meta 버전 확인
5. 모델 로드 시 schema migration은 클라이언트에서 자동 수행됨
```

CHANGELOG의 "데이터 비호환" 표시가 있는 버전은 다운그레이드 불가 — 업그레이드 전 백업 보존 기간을 늘린다.

## 5. Incident Response

| 증상 | 진단 | 조치 |
| --- | --- | --- |
| 서버 미기동 | 콘솔 오류 확인. lockfile 잔존? | stale lock이면 안내 문구대로 회수 후 재기동 (P4-T25 구현 후) |
| 로그인 전체 실패 | `data/secret.key` 손상/교체 여부 | 백업 secret.key 복원. 교체 시 전 사용자 재로그인 |
| 계정 잠김 | audit.log에서 실패 이력 확인 | 잠금 해제: 15분 대기 또는 관리자 개입 절차(문서화 예정) |
| 프로젝트 손상 의심 | revision 목록/파일 index 대조 | §3 부분 복구. 사고 경위를 audit.log와 함께 보존 |
| 토큰 유출 의심 | - | 해당 사용자 강제 로그아웃(tokenVersion 증가) — 관리자 API/절차 P4-M5에서 확정 |
| 성능 저하 | 프로젝트 수/revision 용량 확인 | 대형 프로젝트 아카이브 절차 (수동 이동) |

## 6. Log Locations

| 로그 | 위치 | 내용 |
| --- | --- | --- |
| 요청 로그 | 콘솔(stdout) — 서비스 등록 시 파일 리다이렉트 | 메서드/경로/상태 |
| 감사 로그 | `data/audit.log` (P4-T28) | 로그인 실패, 권한 거부, 승인/멤버 변경 |

## 7. Windows Service (NSSM) 가이드

P4-T40에서 확정. 골자: NSSM으로 `node server/main.mjs` 등록, 작업 디렉터리 = 설치 폴더, stdout/stderr 파일 지정, 재시작 정책 on-failure.

## 8. Known Operational Limits

1. 단일 프로세스 전제 — 동일 data/에 서버 2개 기동 금지 (lockfile이 거부하지만 우회 금지).
2. 다중 서버 스케일아웃 미지원 (PRD 비목표).
3. 해석은 브라우저에서 실행 — 서버 사양보다 클라이언트 사양이 해석 성능을 결정.
