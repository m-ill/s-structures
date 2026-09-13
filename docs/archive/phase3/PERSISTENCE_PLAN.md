# Phase 3 Persistence Plan

status: active
milestone: P3-M3

## Scope

모델 저장을 3계층으로 통합하고, autosave/revision/충돌 규칙을 정의한다. 현재 구현(`src/ui/indexNativePersistence.js`: localStorage + JSON 파일 export/import)을 계층 1-2로 흡수한다.

## Three Storage Layers

| 계층 | 대상 | 용도 | 신뢰 수준 |
| --- | --- | --- | --- |
| L1 browser local | localStorage/IndexedDB | autosave, 세션 복구 | 임시 |
| L2 파일 | `.json` export/import | 오프라인 전달, 백업 | 사용자 관리 |
| L3 server project | `/api/projects/:id/revisions` | 공식 저장, 협업, 승인 대상 | 기준 |

세 계층 모두 **동일한 `modelToJson` snapshot 형식**을 쓴다. 어느 경로로 저장하든 로드 시 `src/core/migration.js` 단일 경로로 마이그레이션한다.

## Snapshot Envelope

```js
{
  format: 's-structures-model',
  formatVersion: 1,
  savedAt: 'ISO8601',
  app: { platformVersion },
  origin: { projectId?, rev?, parentRev? },   // L3 저장 시 기록
  model: { schemaVersion, ... },              // 기존 modelToJson 결과
}
```

L2 파일도 envelope을 포함해 이후 서버 업로드 시 lineage를 복원할 수 있게 한다. envelope 없는 구형 파일(model 단독 JSON)은 로드 시 자동 감지해 수용한다.

## Autosave (M3-2)

| 항목 | 규칙 |
| --- | --- |
| 트리거 | 모델 변경 후 idle 5초, 최대 간격 60초 |
| 위치 | L1 (`autosave:<projectId or 'local'>`) |
| 보존 | 최근 3개 링 버퍼 |
| 복구 | 시작 시 마지막 정상 저장보다 새 autosave가 있으면 복구 프롬프트 |
| 제외 | 해석 결과는 저장하지 않음 (모델만; 결과는 재실행으로 재현) |

## Revision History (M3-3)

| 항목 | 규칙 |
| --- | --- |
| 생성 | 사용자의 명시적 저장(save to server)마다 새 rev |
| rev 번호 | 프로젝트 내 단조 증가 정수 |
| 메타 | author, savedAt, note, schemaVersion, parentRev |
| 복원 | 과거 rev 로드 → 편집 → 저장하면 새 rev (덮어쓰기 없음, append-only) |
| 보존 정책 | v1 전체 보존. 용량 경고는 프로젝트 메타에 표시 |

## Conflict Rule (M3-4)

v1은 잠금 없는 last-write-wins + 경고 방식이다.

```text
저장 요청의 parentRev != 서버 최신 rev
  -> 저장은 성공 (새 rev 생성)
  -> 응답 lineageWarning: true + 최신 rev 정보
  -> 클라이언트는 분기 발생을 배너로 표시하고
     revision 목록에서 두 분기를 모두 보여준다
```

병합 도구는 만들지 않는다 (비목표). 승인 workflow(M13)에서 승인 대상 rev를 명시해 분기 혼동을 차단한다.

## Save UX Contract

| 동작 | 단축 | 결과 |
| --- | --- | --- |
| 저장 | Ctrl+S | 로그인+프로젝트 열림: L3 저장. 아니면 L2 다운로드 |
| 다른 이름으로 | - | L2 파일 다운로드 |
| 열기 | - | L2 파일 업로드 또는 L3 revision 선택 |
| 상태 표시 | - | 마지막 저장 시각/rev, unsaved 표시, autosave 시각 |

## Migration Guarantees

1. 모든 로드는 `migrateModel()` 경유. 성공 시 현재 schemaVersion으로 정규화.
2. 미래 schemaVersion(더 높은 버전) 로드는 명시적 오류 + 안내.
3. revision 복원 후에도 동일 규칙. 서버는 마이그레이션하지 않는다.
4. deprecated field warning은 validation health에 노출 (P2 계약 유지).

## Tests

`tests/p3-persistence.mjs`:

1. L1/L2/L3 3경로 round-trip 물리량 동일.
2. envelope 유무 파일 모두 로드.
3. autosave 링 버퍼 + 복구 프롬프트 조건.
4. lineage warning 시나리오 (parentRev 불일치).
5. 구버전 schema 파일 로드 → migration → 저장 → 재로드.
6. 결과 미저장 확인 (snapshot에 analysis 없음).
