# Phase25 M3 재료별 초기변형 단면 계산

2026-09-13 · cracked elastic section v3 / RC policy14 / evaluator189

## 구현

`solveCrackedElasticSection`에 명시 `initialStrains:{concrete,steel}`를 추가했다. 기본값은 각각0이며 단위는 무차원, 수축은 음수다. 이는 주어진 초기변형의 평형 계산이며 크리프/건조수축 계수를 예측하는 모델이 아니다. 유효탄성계수는 기존 Ec 인자로 공급한다. ±0.02 입력 한도는 수치 입력 보호이며 KDS 허용 변형률이 아니다.

총 평면 변형률 ε(y,z)=ε0−zκy+yκz에서 각 재료의 초기변형을 뺀다. 콘크리트 응력은 Ec·min(ε−εc0,0), 철근 응력은 Es·(ε−εs0)이다. 압축 영역 clip도 ε가 아닌 ε−εc0에 적용한다. 철근이 차지한 압축 콘크리트 면적을 뺄 때도 같은 기계적 변형률을 사용한다. tangent는 현재 압축 영역의 도함수이며 출력 strain은 총변형률이다. steelForces/sectionComponents/recovered는 같은 응력 분해로 계산한다.

## 독립 최소 검증

B=.3m,H=.5m,4개 철근 각As=.0003m²,Ec=10000MPa,Es=200000MPa,N=−500kN,εc0=−.0003,εs0=0. 전체 콘크리트 압축이 유지되는 경우:

ε=(N/1000+Ec·Ac·εc0+Es·As·εs0)/(Ec·Ac+Es·As), Ac=BH−As.

예측 ε=−0.0005476851851851852. 해석 철근축력−131.44444444444443kN, 순콘크리트축력−368.55555555555566kN, 합−500.00000000000006kN. 두 재료 동일 자유변형/무외력에서는 그 자유변형과 영 응력을 회복한다. 부분 압축·이축휨에서는 두 재료 초기변형에 같은 상수를 더하면 총축변형만 그만큼 이동하고 곡률/압축면적/철근력은 불변임을 확인했다. 초기변형0은 기존 경로와 동일하다.

RED focused-2026-09-12T23-25-34-552Z → GREEN focused-2026-09-12T23-26-12-573Z: 신규55ms, 기존 균열폭2056ms, 실제 크리프/WebMCP4611ms PASS. 이축 자유변형 불변성을 추가한 focused-2026-09-12T23-27-16-040Z 56ms PASS.

## 아직 연결하지 않은 부분

이 단계는 단면 kernel이다. 공개 WebMCP에서 건조수축을 고려한 전체 골조 해석/장기 균열폭이 완료된 것은 아니다. 다음 작업은 단면 총변형률과 접선 flexibility·부재력의 차로 나타나는 초기변형 항을 해석 profile과 부재 적합/등가하중에 전달하는 것이다. 단면에만 초기변형을 넣고 기존 강성 profile을 재사용하면 구속력/자유변형이 누락되므로 그렇게 연결하지 않는다.

그 이후 명시 재료 입력·재령/근거·적용범위, Worker/WebMCP, 철근응력·균열폭 및 수축/재하 이력 검토를 연결해야 한다. 콘크리트 인장무시 모델에서는 수축에 따른 인장강성·균열 사이 부착 효과를 자동 입증하지 못한다. 현재 장기 균열폭의 명시 미검토 사유는 유지한다. M0~M9 PARTIAL/M10 미마감 유지.


## 2026-09-13 M3 골조 초기변형 등가하중·변위 복원

Private flexibility profile에 `initialGeneralizedStrain=[epsilon,kappaY,kappaZ]`를 추가했다. epsilon은 무차원, 곡률은 1/m이며 원 부재 좌표의 generalized strain이다. coupled flexibility가 있는 명시 구간에서만 허용하며 부정확한 벡터/비유한 값을 거부한다. 물리 모델을 수정하지 않는다. profile hash와 taper snapshot에 초기변형을 포함한다.

Force-based basic formulation에서 d0=∫Rᵀε0 dx를 준비하고 q0=−BᵀF⁻¹d0를 기존 fixed-end 벡터에 더한다. 외력과 같이 단부 release/연결 처리 및 전역 조립을 거친다. 이 항을 후처리 표시값에만 더하지 않는다. 부재 내부 변위 적분도 실제 compliance×부재력에 구간 초기변형을 더하며 기존 온도하중의 별도 초기변형을 중복 생성하지 않는다. profile 반복 수렴 검사에도 초기변형 차이를 포함했다.

독립 확인: 길이3m의 자유단 부재, 초기 epsilon=−.0003/kappaY=.0004/kappaZ=−.0002에서 축변위−.0009m, 양축 끝변위−.0009m/.0018m, 회전ry=−.0012/rz=−.0006rad를 회복한다. 완전 구속에서는 EA=1e6kN에 대해 인장축력300kN. 중간1.5m 위치 변위/회전도 독립 적분식과 일치한다. 두 반구간의 초기변형이 서로 다를 때는 축/회전의 구간 적분과 횡변위의 (L−x) 가중 적분을 별도로 검증했다.

RED focused-2026-09-12T23-30-41-097Z → GREEN23-31-22. 내부 변위/기존 실제 크리프 인접 focused-2026-09-12T23-32-34-834Z 428/4773ms PASS. 최종 구간별 독립 적분/입력거부 focused-2026-09-12T23-33-28-483Z 506ms PASS. flexural profile v3/taper v4/RC policy15/evaluator190.

이 단계는 명시 초기변형 profile의 실제 골조 전달이다. 다음은 재료의 지정 수축 입력 및 단면 평형에서 `strain−flexibility×demand`로 얻는 초기변형 항을 coupled 반복에 연결하는 작업이다. 아직 공개 입력에서 건조수축/시간 이력 전체를 해석한다고 주장하지 않는다. 장기 균열폭/인장강성·부착/전역 시간 이력은 잔여. M0~M9 PARTIAL/M10 미마감 유지.


## 2026-09-13 M2/M3 지정 자유수축 입력과 공개 반복 해석 연결

재료 공통 typed schema/UI/WebMCP에 shrinkageMicrostrain(양수 수축량, με)과 shrinkageReference를 추가했다. 기존 creepLoadingAgeDays~creepEvaluationAgeDays 구간의 지정 자유수축이며 시간별 수축을 자동 예측하지 않는다. 관련 크리프 재령/탄성계수/근거와 함께 저장·검증한다. 값이나 근거의 부분 입력은 거부하고, 동일 재령에서 비영 수축은 거부한다. 0~20000με 한도는 수치 입력 보호이며 코드 허용수축 기준이 아니다.

지속 유효탄성계수 모드에서는 εc0=−shrinkageMicrostrain/1e6, εs0=0을 단면 kernel에 적용한다. 각 실제 평형에서 `initial strain offset = total strain − flexibility × concurrent section demand`를 계산하고 frame 좌표로 변환해 private profile에 전달한다. 이를 통해 강성 변화와 초기변형에 따른 등가하중/변위가 함께 반복된다. 수축을 입력하지 않은 기존 모드에는 임의 초기변형 항을 추가하지 않는다. instantaneous 모드는 기존 순간 상태를 유지한다.

공개 run_rc_service_iteration/get_rc_service_iteration은 specifiedShrinkageIncluded를 표시한다. source creepEffects 및 get_rc_service_bar_forces는 실제 재료 초기변형/단면 초기변형 항을 전달한다. 재령/수축/계수/근거를 복원 가능한 원천에 보존하며 timeHistoryCreepRedistributionIncluded=false를 유지한다. concrete creep v2/coupled iteration v6/RC policy16/evaluator191.

집중 TDD: typed schema RED focused-2026-09-12T23-35-44-792Z → GREEN focused-2026-09-12T23-36-38-059Z 입력1333ms/실제 해석6614ms. 결과/철근력 공개 초기변형 조회까지 연결한 최종 focused-2026-09-12T23-37-44-335Z 6727ms PASS. Ec,eff=10000MPa, 4D20, .3×.6m, 길이3m, 축압축500kN 및 지정 자유수축300με에서 독립 합성단면식 기대 축변위−0.0015201090643588674m, 실제−0.0015201090643588685m. 물리 입력 hash 불변 및 기존 단기/크리프 경로를 확인했다.

선택한 압축 전용 콘크리트/탄성 철근 모델에서의 명시 수축 근사 구현이다. 자유 수축만으로 발생하는 인장 콘크리트/부착·tension stiffening, ageing/시간별 응력이력, 전체 장기 균열폭 방법은 구현 완료로 주장하지 않는다. 이전 기록의 '재료 수축 입력/profile/WebMCP 연결 잔여' 중 위 범위는 구현했고, 장기 균열폭/전체 프로파일 마감은 계속 잔여다. M0~M9 PARTIAL/M10 미마감 유지.
