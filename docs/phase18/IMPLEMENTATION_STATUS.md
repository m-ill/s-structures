# Phase 18 구현 상태

기준일: 2026-08-29

## 최종 판정

잔여 10개 문제에 필요한 S-Structures 엔진 경로는 모두 실행됐고 검증 프로브 0건 실패로 마감했다. 이 판정은 S-Structures 생산 모듈의 기능 검증이며 MIDAS·STRIX 프로그램을 직접 실행했다는 뜻은 아니다.

| 문제 | 엔진 상태 | 공식 동일문제 상태 | 핵심 실행 경로 |
|---|---|---|---|
| TH1 | PASS | NOT_CLAIMED | Newmark 평균가속도, 독립 RK4, 시간간격 수렴 |
| SP1 | PASS | NOT_CLAIMED | 생산 pushover, 집중 모멘트힌지, 평형·자기일관성 |
| SM6 | PASS | NOT_CLAIMED | 3D Timoshenko 프레임 고유치, LARSA 공개 비교 범위 |
| SM5b | PASS | NOT_CLAIMED | 편심 강체격막 고유치, 독립 15-DOF 행렬 |
| SR1 | PASS | INPUT_BLOCKED | 2D RSA, SRSS/CQC, 절점·부재 복원 |
| SR2 | PASS | INPUT_BLOCKED | 3D 편심 강체격막, 6-DOF 질량, 네 조합법 |
| SR2b | PASS | INPUT_BLOCKED | L형 가새골조 RSA, 축력 복원 |
| P3S2 | PASS | NOT_CLAIMED | 실제 셸 조립 안정화·메시 민감도 sweep |
| SB12 | PASS | NOT_CLAIMED | 6-DOF 탄성링크 커널·전역 선형/모달 조립 |
| SH1 | PASS | NOT_CLAIMED | P–My–Mz 재료·PCHIP·zero-length 전역 도메인 조립 |

`NOT_CLAIMED`는 외부 프로그램 PASS를 부정하는 값이 아니라, 이번 단계에서 외부 프로그램 실행·동일 모델 증거를 판정 대상으로 삼지 않았다는 뜻이다.

## 결과 위치

- 통합 매니페스트: `verification/benchmarks/strix21/milestones/P18/p18-completion-manifest.json`
- 통합 요약: `verification/benchmarks/strix21/milestones/P18/P18-STRIX21-ENGINE-COMPLETION.md`
- 문제별 패키지: `verification/benchmarks/strix21/milestones/P18/<CASE>/`
- 최종 PDF: `output/pdf/S-Structures_Phase18_STRIX21_엔진완성_검증보고서.pdf`
- 자동 시험: `npm run test:p18`
- 증거 재생성: `npm run evidence:p18`

## 남은 공식 비교 입력

- SR1: 집중질량 절대값, 전체 응답스펙트럼 표, 정확한 단면·8요소 연결
- SR2: 기둥·보 전체 단면, 층 질량·회전관성, 전체 연결·스펙트럼 설정
- SR2b: L형 좌표·4개 프레임 배치, El Centro 스펙트럼 전체 표, 부재번호 대응표

이 세 항목은 추정값으로 공식 PASS를 만들지 않는다. 원문 입력이 확보되면 현재 엔진 fixture를 동일문제 canonical input으로 교체하고 기존 프로브에 STRIX 수치 lane을 추가한다.
