# M5 Steel Preliminary Design

문서 버전: 0.1  
작성일: 2026-06-24  
대상: S-Structures M5 철골 1차 설계검토

## 1. 목적

M5의 목적은 M4에서 만든 조합/포락 결과를 설계 demand로 받아 철골 부재의 1차 검토 결과를 생성하는 것이다. 이 단계의 검토는 초기 설계와 교육용 검증을 위한 탄성 허용응력 기반 검토이며, 최종 법규 자동 검토가 아니다.

## 2. 구현 범위

이번 단계에서 구현한 범위:

- 철골 설계검토 전용 모듈 추가
- 축력, 강축 휨, 약축 휨, 전단, 축력+휨 조합 검토
- 기둥/브레이스 성격 부재의 KL/r 세장비 검토
- 부재 처짐 검토
- OK/WARN/NG 상태 판정
- 부재별 지배 검토 항목 추적
- 해석 결과의 `analysis.design.steel` 연결
- M3 화면의 Steel Design 요약 및 테이블 표시

## 3. 주요 파일

- [steel.js](</C:/Users/mill/Downloads/dcr/S-Structures-main/src/design/steel.js>)
- [linear3d.js](</C:/Users/mill/Downloads/dcr/S-Structures-main/src/solver/linear3d.js>)
- [m3App.js](</C:/Users/mill/Downloads/dcr/S-Structures-main/src/ui/m3App.js>)
- [m3State.js](</C:/Users/mill/Downloads/dcr/S-Structures-main/src/ui/m3State.js>)
- [m5-steel-design.mjs](</C:/Users/mill/Downloads/dcr/S-Structures-main/tests/m5-steel-design.mjs>)

## 4. 설계검토 데이터 구조

해석 결과에는 다음 형태의 설계 결과가 추가된다.

```js
analysis.design = {
  ok: true,
  steel: {
    type: "steel_allowable_preliminary",
    ok: true,
    memberResults: {
      M1: {
        memberId: "M1",
        role: "beam",
        status: "OK",
        utilization: 0.42,
        governingCheck: "steel-flexure-z",
        comboId: "CO1",
        x: 3.0,
        checks: []
      }
    },
    summary: {
      checkedMembers: 8,
      maxUtilization: 0.42,
      governing: {
        memberId: "M1",
        checkId: "steel-flexure-z",
        ratio: 0.42
      }
    }
  }
};
```

## 5. 검토식

1차 검토 항목:

- `steel-axial`: `max |N| / Pa`
- `steel-flexure-z`: `max |Mz| / Maz`
- `steel-flexure-y`: `max |My| / May`
- `steel-shear-y`: `max |Vy| / Vay`
- `steel-shear-z`: `max |Vz| / Vaz`
- `steel-interaction`: `N/Pa + Mz/Maz + My/May`
- `steel-slenderness`: `max(KL/ry, KL/rz) / limit`
- `steel-deflection`: `member deformation / (L / limit)`

허용값:

- `Pa = A * Fa`
- `Maz = Zz * Fb`
- `May = Zy * Fb`
- `Vay = Vaz = A * Fv / 1.5`

## 6. 판정 기준

- `NG`: 검토비가 1.0 초과
- `WARN`: 검토비가 `warnAtRatio` 이상
- `OK`: 검토비가 `warnAtRatio` 미만

기본 `warnAtRatio`는 `0.7`이다.

## 7. 제한사항

아직 구현하지 않은 정밀 항목:

- 판폭두께비 기반 국부좌굴 검토
- 횡좌굴 보정계수
- 상세 압축재 좌굴곡선
- 설계기준별 조항 번호 매핑
- 접합부 검토
- 합성보 검토

이 항목들은 후속 M5 세부 또는 별도 설계기준 모듈에서 구현한다.

## 8. 검증

검증 명령:

```powershell
npm.cmd run test:m5
```

검증 항목:

- 캔틸레버 휨 검토비 계산
- 허용모멘트 산정
- `analysis.design.steel` 연결
- 직접 설계 facade 결과와 해석 결과 일치
- 장주 기둥의 세장비 NG 판정
- UI 상태 모듈의 설계 결과 보존
