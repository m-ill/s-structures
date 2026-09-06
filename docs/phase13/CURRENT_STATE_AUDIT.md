# Phase 13 Current State Audit

```yaml
version: p13-current-state-audit-v1
status: planning-baseline
audited_at: 2026-08-05
basis: running-ui + source-review + phase7/10/11/12 status documents
```

## 1. 제품 기준선

S-Structures는 브라우저 3D 모델러, 자체 frame/truss 탄성 solver, 하중조합, Direct P-Delta, modal/RSA,
탄성좌굴, 결과 시각화, 보고서와 로컬 revision/approval/backup 기반을 가진다. Phase 12의 허용 운영범위는
Windows 단일 PC loopback-only 로컬 파일럿이다.

공학적으로는 Phase 10 외부 교차검증과 shell design transfer가 차단돼 있다. Phase 13이 UI와 workflow를 개선해도
이 판정을 자동 해제하지 않는다.

## 2. 실행 UI 확인

2026-08-05 `http://127.0.0.1:5180/`의 탄성해석 화면에서 확인한 사항이다.

### 장점

- 기본설정→하중·질량→하중조합→모델검증→1차→고급→결과의 7단계 진입 흐름
- 변형·M/Q/N·반력·검정과 정적/P-Delta/modal/RSA/buckling result entry
- 지원되지 않은 결과 버튼 비활성화와 fail-closed 설명
- 3D/평면/정면/측면, undo/redo와 접이식 모델링 도구
- 한국어 중심의 빠른 브라우저 UX

### 재현된 핵심 결함

| ID | 현상 | 영향 | Phase 13 |
| --- | --- | --- | --- |
| P13-A01 | 메인 상태는 `해석 OK · δmax 4.73mm`이나 1차 결과 버튼은 비활성 | 결과 신뢰·상태 혼란 | M0~M1 |
| P13-A02 | 7단계 결과검토의 해석 케이스·완료 수가 0 | wizard와 result store 불일치 | M0~M1 |
| P13-A03 | 상단에 절차·실행·결과·보고·상태가 과밀 | 작은 화면에서 핵심상태 잘림 | M1 |
| P13-A04 | Model Check는 오류·경고 개수만 제공 | 위치·수정 흐름 없음 | M2 |
| P13-A05 | 하중·질량은 전역 숫자 중심 | 층·구역·패널과 보존량 검토 부족 | M3~M4 |
| P13-A06 | 큰 모델용 story/member/load tree·grid 부족 | 탐색·일괄수정 비용 증가 | M1, M5 |
| P13-A07 | 결과 label 겹침·지배 source와 상세표 분산 | 결과판독 오류·시간 증가 | M6 |

## 3. 이미 구현된 코어와 제품표면 격차

| 코어 자산 | 코드·문서 상태 | 일반 UI 상태 | Phase 13 |
| --- | --- | --- | --- |
| Analysis run/domain hash | Phase 7/9 자산 | 여러 consumer 통합 필요 | M1 |
| validate/repair/load audit | 검사·repair API 존재 | 통합 issue center 없음 | M2 |
| slab load generation | qA 평형·dedup 검증 | panel 작성·preview UI 없음 | M3 |
| KDS rule/change-set | candidate preview·audit 존재 | full source-bound procedure 부족 | M4 |
| Timoshenko | Phase 10 구현 | 일반 inspector 부족 | M5 |
| partial fixity | Phase 10 구현 | JSON/Agent 중심 | M5 |
| 3D offset/insertion/panel zone | Phase 10 구현 | glyph·bulk editor 부족 | M5 |
| MPC/rigid link·tapered | Phase 10 구현 | 일반 editor 부족 | M5 |
| story drift/shear/overturning | result core 존재 | 통합 dashboard 부족 | M6 |
| RSA scale·mass participation | 후처리 존재 | before/after·provenance 약함 | M6 |
| report snapshot/revision | Phase 11/12 구현 | workflow composer·diff 부족 | M7 |
| MGT | export 존재 | import parser/mapping 미구현 | M7 |
| CPU flat-shell | 내부 수치 qualification | 제품 mesh provenance·외부 자격 부족 | M8 |

## 4. 실제 신규 구현

- single run repository/coordinator와 stale dependency
- Elastic Review Workspace shell과 common data-grid
- unified issue/repair/waiver registry
- load/mass/slab panel workspace
- official source-bound KDS procedure registry
- advanced member/story/diaphragm UI
- normalized result query/governing index/dashboard
- review/revision package와 limited MGT parser
- shell experimental containment surface
- Phase 13 release/evidence runner

## 5. 유지할 안전 경계

- 자체 solver만 production runtime에서 사용
- unsupported/preliminary/experimental state 보존
- current result와 historical result 구분
- load/repair/import의 Preview·Apply·Undo
- Phase 12 loopback/data/secrets/backup 경계
- Phase 10 engineering·shell release blockers 상속

## 6. Phase 13 착수 전 조건

- plan 승인과 구현 기준 branch/commit
- 기존 dirty worktree 사용자 변경 보존
- M0에서 capability·fixture·test inventory 재감사
- KDS source, MGT fixture와 pilot owner input 계획
- feature flags 기본 off와 N-1 rollback 기준선
