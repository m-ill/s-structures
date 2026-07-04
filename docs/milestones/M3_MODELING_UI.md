# M3 Modeling UI

문서 버전: 0.1  
작성일: 2026-06-24  
대상: S-Structures M3 경량 모델링 UI

## 1. 목적

M3의 목적은 M0-M2에서 분리한 자체 해석 엔진을 실제 브라우저 UI에서 호출하는 것이다. 기존 난독화된 `index.html`을 바로 수정하지 않고, 별도 진입점인 `m3.html`을 추가하여 새 모듈 기반 모델링 흐름을 검증한다.

## 2. 진입점

파일:

- [m3.html](</C:/Users/mill/Downloads/dcr/S-Structures-main/m3.html>)
- [m3App.js](</C:/Users/mill/Downloads/dcr/S-Structures-main/src/ui/m3App.js>)
- [m3State.js](</C:/Users/mill/Downloads/dcr/S-Structures-main/src/ui/m3State.js>)
- [m3.css](</C:/Users/mill/Downloads/dcr/S-Structures-main/src/ui/m3.css>)

실행:

```powershell
npm.cmd run dev
```

URL:

```text
http://127.0.0.1:5173/m3.html
```

## 3. 구현 범위

M3에서 구현한 기능:

- 샘플 모델 로드
- X/Y bay, story 기반 프레임 자동 생성
- Plan/Elevation 보기 전환
- 노드/부재 선택
- 선택 부재 또는 선택 노드 연결 부재에 UDL 적용
- `Analyze` 버튼으로 새 `analyzeModel()` 엔진 호출
- 변위, 검토비, 평형 residual, 하중/반력 요약 표시
- 부재 테이블 표시
- 검토비 기반 부재 색상 표시
- 변형 형상 표시
- JSON export/import

## 4. 상태 모듈

`m3State.js`는 DOM과 분리된 상태/모델링 로직을 담당한다.

주요 함수:

- `createM3State()`
- `buildFrameModel()`
- `replaceModel()`
- `selectEntity()`
- `selectedMembers()`
- `applyUdlToSelection()`
- `importModelJson()`
- `exportModelJson()`
- `entitySummary()`

이 모듈은 Node 테스트에서 직접 검증 가능해야 한다.

## 5. 테스트

파일:

- [m3-ui-state.mjs](</C:/Users/mill/Downloads/dcr/S-Structures-main/tests/m3-ui-state.mjs>)

검증 내용:

- 2x1 bay, 2 story 프레임 생성
- base node fixed support 확인
- 생성 모델 해석 성공
- 노드 선택 시 연결 부재 검색
- 부재 선택 후 UDL 적용
- UDL 적용 후 자동 재해석
- JSON export/import round-trip

전체 테스트:

```powershell
npm.cmd run test
```

## 6. 현재 한계

M3는 기존 정식 UI를 대체하지 않는다. 새 엔진을 쓰는 경량 모델링 작업면이다.

남은 항목:

- 직접 노드 추가/삭제
- 직접 부재 추가/삭제
- 다중 선택 박스
- 단면/재료 편집 패널
- 지점조건 편집 패널
- 하중 목록 편집/삭제
- 조합 편집 UI
- 결과 다이어그램 상세 표시
- 기존 `index.html` UI와 새 엔진 연결

## 7. 다음 단계

M3 후속 작업은 다음 중 하나로 나뉜다.

1. 기존 `index.html`의 해석 호출부를 새 `src/solver` 엔진으로 교체
2. `m3.html`을 정식 UI로 확장

현재 코드 상태를 보면 기존 `index.html`은 난독화되어 있으므로, 안정적인 방향은 `m3.html`을 점진적으로 정식 UI로 키우는 것이다.
