# STRIX 공개 21개 검증군: Reference와 S-Structures 비교

문서 정리: 2026-09-06 · **수치 비교 스냅샷: 2026-08-29**

공개 대표값·로컬 실행·엔진 체크포인트를 구분한 비교표다. 이번 문서 갱신은 21개 모델을 새로 재실행한 검증이 아니다. 원자료의 판정과 수치를 보존하며, 단일 최대오차나 21/21 동일응답을 주장하지 않는다.

[README](../../README.md) · [전체 정밀도 JSON](strix21-comparison-summary.json) · [공개 기준값 출처](https://dcr-st.com/ko/verification.html)

## 읽는 방법

- Reference는 실제 비교에 사용한 `compareReference`를 우선 표시한다. SB1·TH1은 공개 페이지의 반올림값보다 정밀한 비교값을 사용한다. JSON에는 두 값을 모두 남겼다.
- 상대오차는 `(S − R) / |R| × 100`이다. 표시는 반올림하며 판정은 원래 관측량·허용기준을 따른다.
- SP1·P3S2의 Reference 칸은 응답값이 아니라 허용한계다. 상대오차 칸을 계산하지 않는다.
- 동일모델 미완료 6개는 공개 Reference만 표시하고 S-Structures 값과 오차는 비워 둔다. 내부 fixture 결과로 이 빈칸을 채우지 않는다.

## 21개 전체 비교

| ID | 관측량 · 단위 | Reference / 기준 | S-Structures | 상대오차 % | 구분 |
|---|---|---:|---:|---:|---|
| SB1 | Tip deflection u_z · mm | -0.107865168539 | -0.107865168539 | 3.85975973405e-14 | 로컬 수치 PASS |
| SB2 | Tangential edge stress at D · MPa | 92.7 | 90.8574258078 | -1.98767442526 | 로컬 수치 PASS |
| SB3 | Normalized tip displacement · norm. | 23.91 | 23.8832776711 | -0.111762145282 | 로컬 수치 PASS |
| SB5 | Deflection coefficient alpha · - | 0.00406 | 0.00405925270642 | -0.0184062458872 | 로컬 수치 PASS |
| SB6 | Deflection coefficient alpha, 1x1-R10 · - | 0.004273 | 0.0042648194474 | -0.191447521567 | 로컬 수치 PASS |
| SB7 | Center deflection U_z · in | -0.089333 | -0.08933268215 | 0.000355803620136 | 로컬 수치 PASS |
| SB8 | Natural frequency f1 · Hz | 102.149414 | 102.149358888 | -5.39526937743e-05 | 로컬 수치 PASS |
| SB9 | Midspan deflection, combined · mm | -69.372833 | -69.3728331312 | -1.890874582e-07 | 로컬 수치 PASS |
| SB10 | Brace E1 axial magnitude · N | 10000 | 10000 | 0 | 로컬 수치 PASS |
| SB12 | Oblique U_x · mm | 0.152961 | — | — | 동일모델 미완료 |
| PD1 | U_z with tension · in | -0.543305 | -0.543304756463 | 4.48250616654e-05 | 수치 PASS·검증 보류 |
| SM5 | Eigenvalue mode 1 omega^2 · rad^2/s^2 | 0.589541 | 0.589534310958 | -0.00113461863526 | 수치 PASS·검증 보류 |
| SM5b | Eigenvalue mode 1 omega^2 · rad^2/s^2 | 2070.117026 | — | — | 동일모델 미완료 |
| SM6 | Eigenvalue mode 1 omega^2 · rad^2/s^2 | 506331.91595 | — | — | 동일모델 미완료 |
| SR1 | Period mode 1 · s | 1.562 | — | — | 동일모델 미완료 |
| SR2 | Period mode 1 · s | 0.2271 | — | — | 동일모델 미완료 |
| SR2b | Frequency mode 1 · Hz | 3.0592 | — | — | 동일모델 미완료 |
| SP1 | Pre-peak self-consistency worst error · % | ≤ 1 | 0.0177664578435 | — | 동등 기준 PASS |
| SH1 | Uniaxial cap boundary · N-mm | 125000000 | 125000000 | 0 | 체크포인트 PASS |
| TH1 | Peak relative displacement, zeta=5% · mm | 200.786208832 | 200.782798334 | -0.00169857196656 | 체크포인트 PASS |
| P3S2 | Maximum dominant membrane-mode period shift · % | ≤ 0.5 | 0.000240544602965 | — | 동등 기준 PASS |

## 사례별 해석과 남은 조건

- **SB1 · Euler-Bernoulli 1D cantilever**: 제품 API로 3회 결정론적 실행을 확인했다. 외부 독립 custody는 수행하지 않았다.
- **SB2 · NAFEMS LE1 elliptic membrane**: QM6-EAS mesh 수렴 결과다. S probe는 D점 최근접 Gauss점의 원시 최대주응력으로, 접선응력 probe와의 등가성 검토가 남았다.
- **SB3 · Cook's membrane**: QM6-EAS 평면응력 membrane을 사용한 mesh 수렴 로컬 실행이다.
- **SB5 · Thin rectangular plate**: 얇은 판 workflow의 공개 대표행 SS-1x1-UDL을 표시했다.
- **SB6 · Thick rectangular plate**: 두꺼운 판 workflow의 공개 대표행 1x1-R10을 표시했다.
- **SB7 · Beam on Winkler foundation**: Winkler 탄성지반 kernel과 중앙 응답복원을 확인했다.
- **SB8 · Deep Timoshenko beam**: Timoshenko modal 경로의 6개 주파수 probe 중 1차 주파수를 표시했다.
- **SB9 · Rigid portal frame under UDL**: 축변형과 휨을 합한 변위이며 성분합 closure를 확인했다.
- **SB10 · Asymmetric two-bar truss**: 공개 페이지는 절댓값을 표시한다. S-Structures 압축력 -10,000 N의 절댓값을 비교했다.
- **SB12 · Elastic link beta-angle transform**: 6-DOF 링크와 beta-angle 좌표변환은 PASS했다. P18 fixture는 공개 0.152961 mm 모델과 동일하지 않다.
- **PD1 · P-Delta tension stiffening**: 대표 수치는 통과했지만 단계별 work-balance 증거가 없어 적격성 판정은 보류했다.
- **SM5 · Bathe-Wilson eigenvalue frame**: 첫 3개 고유값은 통과했지만 독립 mode vector가 없어 적격성 판정은 보류했다.
- **SM5b · Rigid-diaphragm condensation**: 축약 해석엔진은 PASS했다. 공개 질량 / 회전관성 배율 mapping이 미완료이고 P18 값은 독립 합격 기준값이 아니다.
- **SM6 · ASME 3D pipe-frame eigenproblem**: 3D Timoshenko pipe-frame 엔진은 LARSA E08 주파수와 비교해 PASS했다. STRIX 모델의 정확한 중간 절점 좌표가 없다.
- **SR1 · 2D response-spectrum frame**: RSA / SRSS / CQC 엔진은 PASS했다. 절대 질량, 전체 스펙트럼, 단면과 8요소 위상정보가 없다.
- **SR2 · 3D eccentric rigid diaphragm RSA**: 3D 강체격막, 6-DOF 질량과 4개 모드조합은 PASS했다. 단면, 질량 / Jz, 위상과 스펙트럼 입력이 미완료다.
- **SR2b · 3D L-shaped braced-frame RSA**: L형 RSA와 가새 축력복원 엔진은 PASS했다. 정확한 평면 / 부재 mapping과 El Centro 스펙트럼이 없다.
- **SP1 · Pushover cantilever moment hinge**: 공개 SP1과 같은 pre-peak self-consistency 판정법을 생산 pushover 엔진에 적용했다. Point 2 목표변위를 결과값으로 재사용하지 않았다.
- **SH1 · Custom P-M-M column hinge**: 신규 PMM 재료 / zero-length 요소 경로로 공개 cap-boundary checkpoint를 재현했다.
- **TH1 · SDOF Newmark time integration**: Newmark 평균가속도 결과를 독립 RK4와 시간간격 수렴으로 교차확인했다.
- **P3S2 · Stabilization sensitivity**: 공개 3×6 membrane 형상으로 안정화 민감도를 재실행했다. STRIX plate-mode와 literal parameter 단위의 완전 동일성은 주장하지 않는다.

## 근거와 재현 범위

비교 수치는 로컬 비교 보고서 JSON에서 추출했다. 원본 요약 SHA-256과 사례별 실행 증거 SHA-256은 공개 요약 JSON에 기록했다. 11개 로컬 수치 실행 기록의 원본은 이 공개 저장소에 포함되어 있지 않으며, 해시만으로 독립 재현 가능성을 주장하지 않는다. 공개 저장소에서 열 수 있는 P18·P18A 실행 증거는 다음과 같다.

- [P18 엔진 완료 manifest](../../verification/benchmarks/strix21/milestones/P18/p18-completion-manifest.json)
- [SH1 실행 결과](../../verification/benchmarks/strix21/milestones/P18/SH1/runs/p18-engine-result.json)
- [TH1 실행 결과](../../verification/benchmarks/strix21/milestones/P18/TH1/runs/p18-engine-result.json)
- [SP1·P3S2 및 별도 XV1 추가 비교](../../verification/benchmarks/strix21/milestones/P18A/p18a-additional-comparison-evidence.json)
- [2026-09-06 Release: 이후 회귀·WebMCP·GitHub CI 증거](https://github.com/m-ill/s-structures/releases/tag/webmcp-preview-20260906)

전체 분류는 로컬 수치 PASS 9, 수치 PASS·검증 보류 2, 체크포인트 2, 동등 기준 2, 동일모델 미완료 6이다. SB2의 응력 관측량 동등성은 별도로 미확정이다. 외부 독립 실행·동일모델 적격 판정은 0/21이며 STRIX 또는 MIDAS 공식 인증을 의미하지 않는다.
