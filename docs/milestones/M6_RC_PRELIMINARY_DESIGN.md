# M6 RC Preliminary Design

문서 버전: 0.1  
작성일: 2026-06-24  
대상: S-Structures M6 RC 1차 설계검토

## 1. 목적

M6의 목적은 M4 포락 결과를 사용해 RC 부재의 1차 설계검토 결과를 생성하는 것이다. 이 단계는 초기 설계 검토와 교육용 검증을 위한 간이 강도 검토이며, 최종 설계기준 자동 판정은 아니다.

## 2. 구현 범위

이번 단계에서 구현한 범위:

- RC 설계검토 전용 모듈 추가
- RC 보 강축/약축 휨 요구 철근량 산정
- RC 보 전단 간이 검토
- RC 기둥 축압축 간이 검토
- RC 기둥 축력+휨 간이 조합 검토
- 최소/최대 철근비 warning
- OK/WARN/NG 상태 판정
- 해석 결과의 `analysis.design.concrete` 연결
- M3 화면의 RC Design 요약 및 테이블 표시

## 3. 주요 파일

- [concrete.js](</C:/Users/mill/Downloads/dcr/s-structures-review/src/design/concrete.js>)
- [steel.js](</C:/Users/mill/Downloads/dcr/s-structures-review/src/design/steel.js>)
- [schema.js](</C:/Users/mill/Downloads/dcr/s-structures-review/src/core/schema.js>)
- [migration.js](</C:/Users/mill/Downloads/dcr/s-structures-review/src/core/migration.js>)
- [m3App.js](</C:/Users/mill/Downloads/dcr/s-structures-review/src/ui/m3App.js>)
- [m6-rc-design.mjs](</C:/Users/mill/Downloads/dcr/s-structures-review/tests/m6-rc-design.mjs>)

## 4. 설계검토 데이터 구조

해석 결과에는 다음 형태의 RC 설계 결과가 추가된다.

```js
analysis.design.concrete = {
  type: "rc_preliminary",
  ok: true,
  memberResults: {
    M1: {
      memberId: "M1",
      role: "beam",
      status: "OK",
      utilization: 0.32,
      governingCheck: "rc-shear-z",
      requiredRebar: {
        AsZ: 267.38,
        AsY: 0,
        AvsZ: 0,
        AvsY: 0
      },
      providedRebar: {
        AsZ: 1650,
        AsY: 1500,
        AsTotal: 1650
      }
    }
  }
};
```

## 5. 기본값

기본 RC 설계 파라미터:

- 피복: `50 mm`
- 철근 항복강도: `400 MPa`
- 보 기본 철근비: `1.0%`
- 기둥 기본 철근비: `1.5%`
- 보 최소 철근비: `0.2%`
- 기둥 최소 철근비: `1.0%`
- 기둥 최대 철근비: `4.0%`
- 휨 강도감소계수: `0.85`
- 전단 강도감소계수: `0.75`
- 압축 강도감소계수: `0.65`

## 6. 검토식

1차 검토 항목:

- `rc-flexure-z`: `Mu / phiMn`
- `rc-flexure-y`: `Mu / phiMn`
- `rc-shear-z`: `Vu / phiVc`
- `rc-shear-y`: `Vu / phiVc`
- `rc-axial`: `Pu / phiPn`
- `rc-column-interaction`: `P/Pn + max(Mz/Mnz, My/Mny)`

요구 철근량:

```text
As_req = Mu / (phi * fy * 0.9d)
```

전단 콘크리트 강도:

```text
Vc = 0.17 * sqrt(fc) * b * d
```

축압축 강도:

```text
phiPn = phi * (0.85fc(Ag - As) + fyAs)
```

## 7. 제한사항

아직 구현하지 않은 정밀 항목:

- 정밀 P-M interaction surface
- 철근 배근 위치별 복근보 검토
- 전단철근 간격/최소 전단철근 상세 검토
- 장주 효과
- 최소/최대 철근 간격 검토
- 설계기준 조항 번호 매핑

이 항목들은 후속 RC 상세 설계 단계에서 구현한다.

## 8. 검증

검증 명령:

```powershell
npm.cmd run test:m6
```

검증 항목:

- RC 보 요구 휨철근량 산정
- RC 보 전단강도 산정
- `analysis.design.concrete` 연결
- 직접 RC design facade 결과와 해석 결과 일치
- RC 기둥 축압축 NG 판정
- UI 상태 모듈의 RC 설계 결과 보존
