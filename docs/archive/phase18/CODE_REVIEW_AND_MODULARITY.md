# Phase 18 코드베이스 리뷰·모듈화 점검

## 결론

P18에서 추가한 수치 기능은 `src/` 생산 모듈에, 독립 기준과 STRIX 공개값은 `verification/`에 분리했다. 생산 코드가 검증 폴더를 import하지 않는 기존 경계를 유지했고 공개 import 검사와 P15 아키텍처 회귀에서 import cycle 0건을 확인했다.

## 모듈 소유권

| 기능 | 생산 모듈 | 검증 소유자 | 통합 상태 |
|---|---|---|---|
| 6-DOF 탄성링크 | `src/solver/link/elasticLink6dof.js` | `strix21Completion.js` 독립 합동변환·가우스 해 | 전역 선형·모달 강성 조립 연결 |
| PCHIP | `src/nonlinear/math/monotonePchip.js` | SH1 공개 보간 프로브·단조성 시험 | PMM 축력별 모멘트 용량에서 재사용 |
| P–My–Mz 재료 | `src/nonlinear/materials/pmmHinge3d.js` | SH1 A/B/C/D 프로브 | 탄성 시작, 소성회전 직접입력 분리 |
| zero-length PMM 요소 | `src/nonlinear/elements/zeroLengthPmmHinge3d.js` | 작용·반작용, 전역 DOF 조립 | 다요소 전역 접선·내력 도메인 API 제공 |
| 응답스펙트럼 | 기존 `src/dynamics/`, `src/results/rsa/` | SR1·SR2·SR2b 독립 조합 closure | 기능 PASS, 공식 입력만 보류 |
| 안정화 민감도 | 기존 `src/solver/shell/` | P3S2 실제 solve sweep | 기능 PASS |

## 리뷰에서 수정한 결함

1. PMM 일반 요소가 소성회전 직접입력을 기본으로 해 회전 0에서도 항복모멘트가 생길 수 있던 경로를 수정했다.
2. 일반 해석은 탄성구간에서 시작하고, SH1 공개 체크포인트만 `inputIsPlasticRotation: true`를 명시한다.
3. 상호작용 투영 기준을 `yield-capacity`와 `current-backbone-ordinate`로 분리해 생산 기본값과 공개 문제의 특수 정의를 섞지 않았다.
4. SB12 링크를 독립 커널에 두는 데서 끝내지 않고 모델 `links[]`, 검증, canonical domain, 해시, 트랜잭션, 전역 강성 조립에 연결했다.
5. P17 서명 case 폴더에 P18 파일을 넣었을 때 exact-inventory gate가 실패한 것을 확인하고, P18 패키지를 별도 milestone 폴더로 격리해 P17 무결성을 복구했다.
6. `links: []`를 모든 새 모델에 강제로 직렬화하면 P10의 동결 모델·해시 계약이 바뀌는 회귀를 발견했다. 링크 컬렉션을 선택 필드로 유지하고 명시 입력·마이그레이션·트랜잭션에서만 생성하도록 수정해 이전 모델 바이트 계약을 보존했다.
7. P18 시험 4개가 추가된 뒤 재귀 시험 taxonomy가 421건에 머무는 회귀를 발견했다. 생성기를 P18 qualification 분류까지 확장하고 현재 425건 taxonomy를 재생성했다.

## 남은 제품 통합 부채

| 우선순위 | 항목 | 현재 상태 | 다음 gate |
|---|---|---|---|
| P1 | SH1 비선형 증분해석기 자동 연결 | 재료·요소·전역 도메인 조립 완료, 기존 Newton/상태 커밋 루프 자동 배정은 미연결 | 반복해석 rollback·commit·재시작·경로의존 시험 |
| P1 | SH1 접선 | one-sided 수치 algorithmic tangent | 해석적/일관 접선 또는 양방향 차분 교차검증 |
| P1 | SB12 결과 복원·UI | 강성·모달 조립과 요소 단독 복원 완료 | 일반 정적 결과의 링크 변형·력 표 및 보고서 연결 |
| P1 | SR 공식 입력 | 엔진 fixture PASS | 원문 전체 입력 lock 후 동일모델 수치 비교 |
| P2 | P18 입력 스냅숏 | 감사 가능한 핵심 입력 보관 | 모든 fixture의 완전한 canonical model 직렬화 |

따라서 “핵심 수치 모듈이 없다”는 상태는 해소됐지만, SH1의 기존 비선형 제품 워크플로 자동 연결과 SB12 결과 UI는 후속 통합 항목이다. 이 제한은 엔진 검증 PASS와 별도로 유지한다.

## 회귀 결과

- `npm run test:p18`: PASS
- `npm run test:p10`: PASS
- Phase 11 M0~M9: PASS
- `npm run test:p12`: PASS (425개 시험 inventory)
- `npm run test:p13`: PASS
- `npm run test:p14`: PASS
- `npm run test:p15`: PASS
- `npm run check:test-taxonomy`: PASS
- `npm run check:public-imports`: PASS
- `npm run check:verification-layout`: PASS
- `npm run check:p17:m1:scaffold`: PASS

P15 아키텍처 검사에는 기존 코드베이스의 `report-solver-reexecution-risk` 1건과 `ui-numeric-core` 40건이 계속 기록돼 있다. P18 신규 모듈에서 생긴 import cycle이나 생산→verification 역참조는 없다.
