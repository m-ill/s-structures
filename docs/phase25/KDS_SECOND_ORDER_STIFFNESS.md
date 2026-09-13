# M3 KDS 탄성 2차 해석용 강성 연결

2026-09-13 · RC service policy v10 · 국부 안정 및 전체 설계 적합성 미완료

## 근거와 적용

저장된 KCSC 공식 KDS 14 20 20:2022 원문 `verification/evidence/phase24/kcsc/KDS-142020-official.json`의 **4.4.4(1)~(3)**에 따라 보 0.35Ig, 기둥 0.70Ig와 횡방향 지속하중 보정을 연결했다. 기둥은 `0.70/(1+βds)`를 두 주축에 적용한다. βds는 층 최대 계수지속전단력/최대 계수전단력의 비로 0~1 범위이며, 값과 산정 근거를 사용자가 명시한다. βds를 축방향 지속하중 비 βdns와 혼용하지 않는다.

새 typed 필드는 `secondOrderStiffnessStandard`, `lateralSustainedRatio`, `lateralSustainedReference`다. 기존 `memberRole`을 함께 사용한다. 보·기둥 역할과 기준이 없는 부재를 추정하지 않는다. 기둥의 모든 배근 구간에서 비율이 같고 근거가 있어야 한다. 전 구간 배근의 공백·중복도 거부한다. 현재는 직사각형 프리즘 RC frame이며, 변단면·실제 이음 강성은 별도 경로다.

## 실행 경로

`run_rc_service_iteration`에 `stiffnessMode: kds-elastic-second-order`, `comboIds`를 전달한다. 모델의 `analysisSettings.pDeltaMethod`는 명시적으로 `direct`여야 한다. UI RC 강성 방식에도 같은 선택지가 있고, 이 모드에서는 계수 강도 조합을 선택할 수 있다. 기존 휨 사용성 모드의 활하중 필터나 크리프 timeEffect 옵션을 섞지 않는다.

`kdsSecondOrderStiffness.js`가 수치용 강성 프로파일을 만들고 `kdsSecondOrderIteration.js`가 기존 Worker/강성 프로파일/Direct 해석을 재사용한다. 물리 단면 치수·면적·질량·전단·비틀림 강성은 기존 값으로 보존한다. 해석용 사본에만 휨강성을 적용한다. 조합별 적용 프로파일 해시와 부재별 계수/출처, 2차 해석 trace가 공통 결과에 남는다.

기존 Direct에는 기하강성이 이미 있으므로 결과에 국부 확대계수를 추가로 곱하지 않는다(`localMagnifierApplied=false`). 이 변경은 전체 국부 안정 검토를 대신하지 않는다. 4.4.2 총모멘트 한계, 전 구간 국부 곡률/격자 수렴, 최소 편심 및 적용 경로의 정합성, 횡구속 판정, 층별 βds 독립 검토가 남아 있다. 모든 반환값에서 전역 방법 자격은 false를 유지한다.

## 최소 검증

`p25-m3-kds-second-order-stiffness`에서 독립적으로 보/기둥 계수를 확인하고 공개 WebMCP→Worker Direct→상세 검토, 사본 해석과 원 모델 hash 불변, 저장·복원, 취소 후 transient 메모리 해제를 확인했다. 기둥 βds=0.5의 적용계수는 0.4666666666666666이다. 작은 합성 외팔부재에서 고정단 합모멘트가 gross Direct **4.211633480613491kN·m**에서 지정강성 Direct **4.224928283584104kN·m**로 변해, 표시값뿐 아니라 실제 수치에 적용됐음을 확인했다. 이 외팔부재는 강성 전달 시험이며 횡구속 기둥의 자격 사례가 아니다.

저장된 현재 판본 결과는 정책·Direct 수렴·프로파일 해시·부재계수 기록의 내부 일치를 확인한 뒤 복원한다. 이전 정책 판본은 stale로 남긴다. 신규 모드도 기존 Worker 10초/조합 8개/RC 결과 2개 제한과 자원 예산을 사용한다. 후보 재해석은 원 모드와 조합 선택을 유지한다.

최종 통합 증거 `focused-2026-09-12T22-33-59-972Z` (3171ms). UI 강도조합 선택과 정확한 공개 인자는 `focused-2026-09-12T22-34-52-290Z` (162ms). 기존 UI 및 브라우저 도구 정의는 `focused-2026-09-12T22-31-00-714Z`에서 통과했다. 실제 건물, 전체 성능·수치 캠페인 및 배포는 미실행이다.


## 2026-09-13 M3 Direct 실제 요소 분할 및 M7 자원 예산

RC policy v11로 KDS 지정강성 모드의 해석 사본을 1→2→4개(설정에 따라 최대8개) 요소로 분할한다. refineFrameModel.js는 부재·절점 ID를 분리하고 점하중/부재모멘트의 위치, 선형분포하중의 구간과 강도를 옮긴다. 원 모델과 물리 단면은 불변이다. 편심/회전릴리스·스프링/변단면/패널 등 분할 전달을 검증하지 않은 경로는 명시적으로 거부하며 전체 기존 Direct 기능을 제거하지 않는다. KDS 새모드의 제한이다.

collapseFrameResult.js는 원 부재 ID로 결과를 복원하며 각 요소의 탄성+기하강성 forceRecoveryInput을 piecewise로 보존한다. 단부 모멘트 직선 보간으로 국부 효과를 지우지 않는다. 분할점의 하중 불연속을 제외한 평형을 검사한다. 실제 분할 모델의 물리 절점 변위·회전, 두 분할의 복원 위치 합집합에서 축력/전단/비틀림/휨을 비교하고 수렴해야 결과를 제공한다. 공간 수렴 실패는 KDS_SECOND_ORDER_FRAME_REFINEMENT_LIMIT로 남긴다. 같은 최종 분할의 1차 seed와 2차 결과를 복원해 총모멘트 비교를 재생성한다.

WebMCP 기존 run_rc_service_iteration의 KDS 모드에서 spatialTolerance/maxRefinements를 사용한다. 설정 저장·복원 시 분할 수준/수렴값/허용값/프로파일 근거가 일치해야 한다. 취소 경로와 10초 Worker 제한을 유지하고, 사전 메모리 예산은 최대 분할 절점의 dense 행렬과 최대600개 부재 결과 위치를 포함하도록 확대했다. maximumAnalysisDofs는 추정 상한이며 실측 heap이 아니다. 프로젝트보다 완화하지 않는 반복 수/허용오차를 사본 해석에 명시 적용한다.

작은 독립 Euler-Bernoulli 외팔 beam-column 공식: 기대 끝변위0.00029717731488474006m. 1/2/4/8요소 절대오차 각각2.783265772802329e-10,2.123637024694855e-11,1.387193528448738e-12,8.761529913040023e-14m. 원 fixture의 전단변형 기본값을 켠 상태는 이 공식의 조건과 달라 별도였고, 시험에서 전단변형을 명시 false로 맞췄다. 제품의 전단변형 선택을 무단 변경하지 않았다. 상승 삼각형하중 합력6kN·1차모멘트12kNm, 경계 점하중 위치1.5m 보존 확인.

집중 실행 focused-2026-09-12T22-49-34-229Z: 분할970ms, 공개 Worker/평가/저장복원/취소3069ms, UI157ms PASS. 합력·1차모멘트·점하중 위치 추가 검증 focused-2026-09-12T22-50-17-116Z 960ms PASS. 전체 실제건물/종합/배포 미실행. 수렴은 독립 방법 인증 또는 전체KDS 적합이 아니며 globalMethodQualified=false 유지. prepareProvidedStability의 기준별 국부 안정 판정 연결, 최소편심·횡구속·세장 효과 적용성, Timoshenko 기하강성의 기존 한계는 후속으로 남는다. M0~M9 PARTIAL/M10 미마감 유지.


## 2026-09-13 M3 분할 Direct 안정 검토 연결 (evaluator185)

`refinedDirectStability.js`를 `prepareProvidedStability`에 연결했다. 현재 입력 hash·RC 강성 정책·실제 적용 계수 근거, 분할 수렴과 절단점 평형, Direct 수렴/해석기 제한, 현 판본의 전 부재 구간 모멘트 비교를 확인한다. 충족하면 rc-stability 계산은 OK, 1.4 한계 초과는 NG, 필요한 근거가 없으면 NOT_CHECKED로 반환한다. 이미 2차 해석한 부재력에 국부 magnifier를 다시 곱하지 않는다. KDS142020 4.4.2(2),(3),(4) 및 4.4.4 참조와 적용 강성/분할 근거를 결과에 보존한다. 계산 완료와 방법 자격은 별개로 methodReviewRequired=true, globalStabilityQualified=false, designTransferAllowed=false를 유지한다.

공개 Worker→평가 snapshot에서 memberResults.refinement가 누락되어 정상 수렴 결과도 미검토가 되던 문제를 수정했다. 추가 TDD에서 이전 판본 모멘트 비교의 EXCEEDS 문자열이 현재 NG가 되던 오류를 재현하고 차단했다. 원 모델 변경, Timoshenko 등 formulation 제한, 평형 근거 소실, 구판 비교를 각각 미검토로 확인했다. 현 판본 초과 NG 및 영점 분모 ratio=null도 검사한다.

증거: snapshot RED focused-2026-09-12T22-53-27-298Z → 통합 GREEN focused-2026-09-12T22-54-01-258Z. 구판 비교 RED focused-2026-09-12T22-58-21-662Z → GREEN focused-2026-09-12T22-58-37-399Z (새 통합3157ms/기존 비교3670ms). 저장·복원 후 실제 재평가까지 추가한 최종 focused-2026-09-12T22-59-34-527Z 3364ms PASS. 공개 WebMCP 입력/실제 Worker/평가/체크포인트 재평가/취소 해제를 포함하며 실제 브라우저 화면 또는 실제 건물 종합 검증을 대신하지 않는다.

이전 기록의 'Direct 안정 판정 연결 잔여' 중 위의 명시 지정강성·분할 경로 연결은 구현했다. 압축부재 사용성, 이축 균열/시간 의존 단면 응력, 모델 초기 불완전성과 독립 방법 검증은 여전히 잔여다. M0~M9 PARTIAL/M10 미마감을 유지하며 전체 완료 또는 배포를 주장하지 않는다.


## 2026-09-13 M3 분할 Direct 순간 횡처짐 연결 (evaluator186 / RC policy12)

분할 해석 내부 절점을 제거하기 전에 실제 변위·회전을 원 부재 좌표로 변환하여 구간별 Hermite 변위장을 보존한다(`refinedFrameServiceResponses.js`). `candidateAnalysisSnapshot`은 `memberServiceResponses`를 전달한다. 기존 `instant-live-frame` 입력과 공개 `run_rc_service_iteration`의 KDS 지정강성 모드를 연결했다. 명시 전체 D+L 및 기준 D 조합의 변위장을 동일 위치에서 차감한 뒤 chord/고정단 기준 v/w 극값을 구한다. 압축력이 존재해도 휨만 허용하는 Ie 곡률 적분으로 되돌아가지 않는다.

현재 입력·강성 정책·분할 평형/수렴·Direct 제한·비교 판본 근거가 모두 있는 두 결과에 한정한다. 누락 시 REFINED_FRAME_SERVICE_PROOF_REQUIRED 및 원 차단 사유를 보존한다. 기존 RC 이음 프레임 경로도 유지하고 frameSourceMethod로 구분한다. 분할 수렴 비교에 양축의 세 가지 기준 처짐 극값을 추가했다. 근사 변위장에는 하중 particular solution을 임의로 추가하지 않으며 loadParticularSolutionIncluded=false를 유지한다. 이 결과는 지정강성 해석의 순간 횡처짐이며 장기 크리프/수축·축방향 단축이나 전체 압축부재 사용성 완료가 아니다. 사용자가 명시한 live-floor/live-roof 한도를 적용하고 KDS142030 4.2.1/Table4.2-2 참조와 방법 검토 미완료(incomplete=true, methodReviewRequired=true)를 함께 출력한다.

메모리 사전 예약 v4는 최대 분할 수 × 부재 수 × 조합 수의 변위장/극값/전달 사본 예산을 별도 포함한다. 부재 조회는 Map을 사용한다. 평가186/RC policy12로 결과 판본을 갱신하여 구판의 미보존 변위장을 현재 근거로 재사용하지 않는다.

TDD RED focused-2026-09-12T23-02-48-602Z: 공개 서비스 평가가 원래 rc-splice-frame 이외 해석 결과를 받지 못함. GREEN focused-2026-09-12T23-03-21-429Z. 최종 인접 확인 focused-2026-09-12T23-04-26-287Z: 새 공개 경로5420ms, 기존 이음 WebMCP3127ms, 독립 외팔 beam-column/분할 변위955ms PASS. 후속 근거 누락/메모리 반영 focused-2026-09-12T23-05-32-668Z 5424ms PASS. 작은 합성 압축+횡하중 부재의 증가 횡처짐0.00031625562631778245m, 명시한 L/360 한도0.008333333333333333m. 실제 건물이나 독립 KDS 방법 자격 증거가 아니다.

M3 남은 범위: 장기 시간 의존 응력·크리프/수축, 이축 균열폭 및 전체 압축부재 프로파일 통합. M0~M9 PARTIAL/M10 미마감 유지. 실제 브라우저·종합 캠페인·배포 미실행.
