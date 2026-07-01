# Phase 3 Material And Section Library Plan

status: active
milestone: P3-M10

## Goal

고정 카탈로그(`src/core/catalogs.js`)를 **versioned 커스텀 라이브러리**로 확장한다. 커스텀 재료는 비선형 엔진(M11-M12)의 힌지/곡선 파라미터까지 담는다.

## Material Schema

```js
{
  id: 'SS275',            // 라이브러리 내 고유
  version: 2,             // 수정 시 증가, 참조는 id@version 고정
  name: 'SS275 구조용 압연강재',
  kind: 'steel' | 'concrete' | 'timber' | 'custom',
  elastic: { E, G, nu, rho, alpha },          // 필수
  strength: {                                  // kind별 필수 세트
    steel:    { Fy, Fu },
    concrete: { fck, fy_rebar? },
    custom:   { ...자유 키, 단위 명시 },
  },
  nonlinear: {                                 // 옵션 (M12 힌지가 소비)
    model: 'bilinear' | 'trilinear' | 'table',
    backbone: [{ strain|rotation, stress|moment }],  // 정규화 좌표
    hardeningRatio: 0.02,
    ultimateDuctility: 9,
  },
  damping: { ratio: 0.05 },
  source: { standard: 'KS D 3503', note },
  createdAt, updatedAt, author,
}
```

## Section Schema

```js
{
  id: 'H-400x200x8x13',
  version: 1,
  kind: 'db' | 'parametric' | 'direct',
  shape: 'H' | 'BOX' | 'PIPE' | 'RECT' | 'CIRC' | 'CUSTOM',
  params: { H, B, tw, tf } | { D, t } | { b, h } | null,
  properties: { A, Iy, Iz, J, Zy, Zz, Sy, Sz, ry, rz },  // parametric은 자동 계산
  designMeta: { compactnessClass?, rebar? },
  source: { db: 'KS-H-2024' | 'user' },
}
```

| kind | properties 산정 |
| --- | --- |
| db | KS 형강 테이블 값 사용 (`src/materials/db/ks-h.json` 등 정적 데이터) |
| parametric | 형상 공식으로 자동 계산 + 단위 테스트로 검증 |
| direct | 사용자 직접 입력. 물리적 타당성 검사 (A>0, I>0, ry=√(Iy/A) 일관성 warning) |

## Versioned Registry (P3-T48)

| 규칙 | 내용 |
| --- | --- |
| 참조 형식 | 모델의 member는 `material: 'SS275@2'` 처럼 버전 고정 참조 |
| 수정 | 라이브러리 항목 수정 = 새 버전 생성 (append-only). 기존 모델 참조는 불변 |
| 스코프 | global(서버 공용) / project(프로젝트 내) 2단. 동일 id는 project가 우선 |
| 삭제 | soft delete (신규 참조만 차단, 기존 모델은 유지) |
| 계산서 | 사용된 모든 재료/단면의 `id@version` + source를 재료 장에 표기 |
| 기존 호환 | 버전 없는 참조(`'SS275'`)는 migration에서 최신 버전으로 고정하고 warning |

## Module Layout

```text
src/materials/
  materialSchema.js      # 스키마 + 검증
  sectionSchema.js
  sectionProperties.js   # parametric 공식 (H/BOX/PIPE/RECT/CIRC)
  registry.js            # id@version 해석, 스코프 병합, soft delete
  db/ks-h.json           # KS H형강 테이블 (정적)
  db/ks-pipe.json ...
  libraryStore.js        # 서버/로컬 저장 연동
```

`src/core/catalogs.js`는 registry의 built-in 기본 스코프로 흡수한다 (기존 모델 무변경 동작 보장).

## UI (P3-T49)

| 화면 | 기능 |
| --- | --- |
| 라이브러리 패널 | 목록(스코프/종류 필터), 검색, 버전 이력 |
| 재료 편집 | 탄성/강도/비선형 backbone 표 편집 + 곡선 미리보기 |
| 단면 편집 | 형상 선택 → 파라미터 → 특성 자동 계산 표시 |
| 검증 표시 | 물리 타당성 warning, 참조 중인 모델 수 |

agent action: `listLibrary`, `getLibraryItem`, `upsertMaterial`, `upsertSection` (capability manifest 등록).

## Verification

1. `tests/p3-materials.mjs` — 스키마 검증, 버전 고정/불변성, 스코프 우선순위, migration.
2. `tests/p3-section-properties.mjs` — parametric 공식 vs KS 테이블 값 tolerance 비교 (대표 10개 단면).
3. 해석 연동 회귀 — 기존 대표건물이 registry 경유로 동일 결과 (수치 diff 0).
4. 계산서 재료 장에 `id@version` 표기 확인.
