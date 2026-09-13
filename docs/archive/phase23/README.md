# Phase23 강체 다이어프램 GPU

2026-09-11 · 코드 구현 및 작은 합성 GPU 검증 완료 · 검토용 후보 · 공개 배포 안 함

## 마일스톤

| 단계 | 구현 | 상태 |
| --- | --- | --- |
| G0 공통 제약 | 기존 CPU의 T·강제변위·축소·복원을 공유하고 원래 f64 영역의 제약 잔차 검사를 추가 | 구현 |
| G1 GPU 1차 탄성 | 기존 혼합정밀도 경로로 강체 편심 지붕 계산, 독립 기준 확인 | 실제 GPU PASS |
| G2 GPU Direct | 반복별 Kt 축소·GPU 보정·복원·평형 검사, 제품 Worker 실행과 진행 통지 | 실제 GPU PASS |
| G3 메모리 | 풀 총예산·캐시 퇴거, 초기화 실패 rollback, 실행 중 해제 대기, 진단 이력 상한 | 집중 검사 PASS |
| G4 제품 통합 | UI·WebMCP 공통 기능 조회에 GPU 검토용 경로, 실제 backend·자격 기록 | 후보 경로 구현; 출시 자격 미완료 |

## 계산 계약

수평 XY·소회전 강체 다이어프램의 면내 Ux/Uy/Rz를 공유한다. 수직·면외 자유도는 유지한다. CPU f64에서 D=Tq+lambda*d0, Kr=T^T Kt T, Fr=T^T(F-Kt*lambda*d0)를 구성하고 GPU f32 PCG와 CPU f64 반복 보정을 수행한다. 복원 후 T^T(Kt D-F)와 운동학 잔차를 추가 검사한다. 접선강성이 바뀌면 계산 세션을 새로 만들고 행렬·대각 전처리 값을 다시 업로드한다. 풀의 같은 크기·용도 버퍼만 재사용하며 오래된 행렬 값을 재사용하지 않는다.

## 사용 범위

- 프레임과 강체 다이어프램이 있는 static 해석은 WebGPU·보안 컨텍스트·Worker가 있으면 **GPU 검토용**을 선택할 수 있다. WebMCP도 기존 `computeTarget: gpu`를 사용한다.
- GPU Direct의 일반 MPC 혼합 등 후보 범위 밖 모델은 차단한다. 기존 CPU Direct의 비평면·중복 구속·release·불안정·메모리 제한은 유지한다.
- 후보 결과는 `preliminary`, `designBlocked:true`, `RIGID_GPU_RELEASE_QUALIFICATION_PENDING`을 기록한다. 수치 수렴과 최종 설계 자격을 구분한다.
- Auto는 CPU를 유지한다. 명시적 GPU 실패를 CPU 성공으로 바꾸지 않는다. GPU 비선형 재료해석·모달·반강체 슬래브 지원을 추가한 것이 아니다.
- 하드웨어별 전체 출시 자격, 전체 회귀, 대형 희소행렬 조립, 성능 기준에 따른 자동 라우팅은 후속 범위다.

검증 상세: [STATUS.md](STATUS.md).
