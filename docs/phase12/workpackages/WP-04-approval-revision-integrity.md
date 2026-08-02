# WP-04 — Approval and Revision Integrity

    milestone: P12-M4
    status: qualification-complete

- revision 저장 시 stable SHA-256 modelHash를 index에 기록한다.
- approved는 reviewer 이상, released는 owner만 전이할 수 있다.
- latest가 아닌 rev, 없는 rev, hash가 달라진 rev는 전이를 거부한다.
- released는 같은 rev/hash의 current approved 상태에서만 가능하다.
- 새 rev는 approved를 revoked, released를 stale로 만들고 immutable history를 유지한다.
- expectedVersion으로 동시 상태변경의 lost update를 막는다.

