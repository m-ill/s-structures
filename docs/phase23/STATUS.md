# Phase23 구현·최소 검증 기록

2026-09-11 · 기준 커밋 68fd9d3 이후 변경

## 실제로 확인한 것

`tests/browser/p23-rigid-gpu.html`에서 내부 브라우저의 NVIDIA Ampere WebGPU를 사용했다. fallback adapter는 false이며 원자료는 [webgpu-synthetic.json](../../verification/evidence/phase23/webgpu-synthetic.json)이다.

| 합성 검사 | 결과 |
| --- | --- |
| 8절점 편심 다이어프램 P=0 Direct / 독립 3자유도 기준 | PASS |
| 동일 지붕 압축 P=100 Direct / 독립 기준 | PASS |
| 1차 탄성 제품 GPU 경로 | PASS |
| 실제 Worker + 기본 GPU factory의 제품 Direct 경로 | PASS, 진행 이벤트 11개 |
| 지점 강제변위 0.001의 affine 복원 | PASS |
| 과대 압축 불안정 모델 | 성공·설계 적격으로 내보내지 않음 PASS |

독립 기준 비교 허용값은 max(1e-11, |기준값|×1e-6)다. 기존 해석기의 수렴·복원·평형 검사를 약화하지 않았다. 원래 f64 제약 잔차 검사는 별도로 1e-8, 운동학 잔차는 1e-11을 적용한다.

Worker 제품 경로는 GPU 버퍼 16개 생성/16개 해제, active/cached bytes 0을 확인했다. 별도 저수준 검사 플랫폼은 8개 생성/8개 해제였다. 이는 관리 버퍼 생명주기 기록이며 전체 VRAM·브라우저 heap 누수 자격이 아니다.

`node tests/p23-rigid-gpu-focused.mjs`는 약 1~2초 규모의 집중 검사다. reference adapter 제품 수치, 후보 capability와 GPU 금지 정책, 제품 조회에 자격·backend 보존, 자동 GPU 차단, 풀 예산·캐시 퇴거, 할당/컴파일/장치 손실 주입 시 rollback, 실행 중 dispose의 지연 반환, 사전 취소를 확인했다. 장치 손실은 주입 테스트이며 실제 장치 강제 리셋 시험은 수행하지 않았다.

브라우저 최종 실행 이후에는 기능 조회의 명시적 GPU 금지 정책·Worker/보안 컨텍스트 조건만 보강하고 집중 검사를 다시 통과했다. 수치·GPU 버퍼 실행 코드는 동일하다. UI의 실제 버튼 클릭부터 보고서까지의 전체 E2E는 이번에 실행하지 않았다.

## 메모리 변경

- 풀 총 active+cached 기본 상한 256MiB. 캐시가 예산을 막으면 새 할당 전 퇴거한다.
- 실제 device의 binding/buffer 한도를 사용한다. 어댑터가 지원해도 요청한 device에서 불가능한 크기는 할당 전 거부한다.
- 버퍼 할당·파이프라인 컴파일·binding 준비 중 실패하면 취득한 lease를 반환한다.
- GPU 작업이 진행 중이면 dispose가 종료를 기다린 뒤 버퍼를 반환한다. dispose 중 완료된 결과는 성공으로 내보내지 않는다.
- Direct tangent 진단 상세는 최근 64건으로 제한하고 누적 건수·실패·자원 반환 상태는 별도로 유지한다.

## 남은 범위

사용자 요청대로 실제 건물 시험, 전체 회귀, 긴 성능 반복을 하지 않았다. 다른 GPU/브라우저의 출시 자격 및 속도 향상률은 미확인이다. 현재 밀집 행렬 준비·CPU 안정성 계산은 유지한다. 다음 단계는 요소 단위 희소 축소 조립, CPU 작업 메모리 감소, 다중 하드웨어 확인 후 자동 라우팅 판단이다. 최종 설계 전이와 공개 배포는 이번 범위에 포함하지 않는다.
