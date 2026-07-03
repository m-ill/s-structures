export const FEATURE_CATALOG_VERSION = 'p4-feature-catalog-v1';

/**
 * 프로그램 전 기능의 단일 카탈로그.
 *
 * 1) manual.html 이 이 데이터를 렌더링해 사용자 설명서가 된다.
 * 2) 각 기능의 control.key 는 향후 기능 토글(설정/라이선스 플랜)의 키가 된다 —
 *    resolveFeatureEnabled() 가 그 진입점이다.
 * 3) tests/p4-feature-manual.mjs 가 agent-contract 의 executeActions/readApis 와
 *    이 카탈로그의 상호 커버리지를 강제하므로, 액션/API 를 추가하면
 *    반드시 여기 어딘가에 등재해야 한다.
 */

function feature(id, name, summary, extra = {}) {
  return {
    id,
    name,
    summary,
    description: extra.description || summary,
    howTo: extra.howTo || [],
    limits: extra.limits || [],
    relatedActions: extra.relatedActions || [],
    relatedReadApis: extra.relatedReadApis || [],
    manualPage: extra.manualPage || null,
    status: extra.status || 'stable',
    control: {
      key: `feature.${id}`,
      toggleable: extra.toggleable ?? false,
      defaultEnabled: true,
    },
  };
}

export const FEATURE_CATEGORIES = [
  {
    id: 'platform',
    name: '프로젝트·계정·저장',
    summary: '로그인, 프로젝트 관리, 3계층 저장(로컬/파일/서버), 리비전과 승인.',
    features: [
      feature('accounts-roles', '계정과 역할', '이메일 가입/로그인과 프로젝트별 4단계 역할(owner/engineer/reviewer/viewer).', {
        description: '서버 계정은 scrypt 해시와 서명 토큰으로 보호된다. 프로젝트마다 멤버별 역할이 있어 저장(engineer 이상), 승인(reviewer 이상), 멤버 관리(owner)가 구분된다.',
        howTo: ['app.html 접속 → 가입 또는 로그인', '프로젝트 소유자가 멤버 추가와 역할 지정', '읽기 전용 공유는 viewer 역할 사용'],
        limits: ['비밀번호 재설정은 관리자 임시 발급 방식', '외부 IdP(OAuth) 미지원'],
        manualPage: '08-collaboration.md',
      }),
      feature('projects', '프로젝트 관리', '프로젝트 생성/열기/이름 변경/멤버십, 목록은 내가 멤버인 것만 표시.', {
        howTo: ['로그인 → 프로젝트 목록에서 생성', '프로젝트 클릭 → 모델러로 진입'],
        manualPage: '01-getting-started.md',
      }),
      feature('save-revisions', '서버 저장과 리비전', 'Ctrl+S 저장마다 리비전이 쌓이고(append-only), 과거 리비전 열람/복원이 가능하다.', {
        description: '저장은 모델 스냅샷을 서버 리비전으로 기록한다. 오래된 리비전에서 이어서 저장하면 lineage 경고 배너로 분기를 알린다. 복원은 새 리비전 저장으로 처리되어 이력이 지워지지 않는다.',
        howTo: ['모델러에서 Ctrl+S 또는 저장 버튼', '리비전 목록 화면에서 특정 rev 열람', 'lineage 경고가 뜨면 리비전 화면에서 분기 확인'],
        manualPage: '01-getting-started.md',
      }),
      feature('autosave', '자동 저장과 복구', '편집 중 유휴 5초/최대 60초 간격 자동 저장, 최근 3개 링버퍼, 비정상 종료 후 복구 프롬프트.', {
        relatedActions: ['saveNativeAutosave', 'restoreNativeAutosave'],
        manualPage: '01-getting-started.md',
      }),
      feature('file-book', '파일 내보내기/가져오기', '모델을 JSON 북 파일로 다운로드/업로드 — 오프라인 전달과 백업용(L2 저장 계층).', {
        description: '서버 없이도 모델을 파일로 저장·이동할 수 있다. 구버전 파일은 로드 시 스키마 마이그레이션이 자동 수행된다.',
        relatedActions: ['exportNativeBook', 'importNativeBook'],
        manualPage: '01-getting-started.md',
      }),
      feature('approval-workflow', '검토 승인 워크플로', 'reviewer가 특정 리비전을 승인/배포 상태로 지정, 이후 새 저장이 생기면 승인이 자동 해제된다.', {
        howTo: ['reviewer 계정으로 프로젝트 열기', '승인 API/화면에서 대상 rev 지정', '승인 후 수정 저장 시 상태가 revoked로 바뀌는지 확인'],
        manualPage: '08-collaboration.md',
      }),
    ],
  },
  {
    id: 'modeling',
    name: '모델링',
    summary: '절점/부재/지지/단부조건/벽체/다이어프램/층 — 3D 골조 건물 모델 작성.',
    features: [
      feature('nodes', '절점', '3D 좌표의 절점 생성/이동/삭제. 모든 요소의 기준.', {
        relatedActions: ['addNode', 'updateNode', 'deleteNode', 'nativeMoveNode'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('members', '부재 (보/기둥/가새)', '두 절점을 잇는 3D 프레임 부재. 단면·재료 배정, 로컬축 지정.', {
        relatedActions: ['addMember', 'updateMember', 'deleteMember', 'nativeDrawMember', 'nativeAddColumn', 'setMemberSection', 'setMemberMaterial', 'assignSection'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('member-behavior', '부재 거동 타입', '프레임 외에 트러스/인장전담/압축전담 부재를 지원 — X-brace, 케이블 모델링.', {
        description: '인장·압축전담 부재는 조합별 반복해석으로 위배 부재를 비활성화한다. 조합마다 활성 상태가 다를 수 있으므로 envelope 해석 시 유의.',
        limits: ['tension/compression-only 반복은 최대 반복 수 내 수렴 필요 — 실패 시 해석 audit에 경고'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('supports', '지지 조건', '고정/힌지/롤러/사용자 정의 DOF에 더해 6-자유도 스프링 지지와 지점 침하를 지원.', {
        description: '스프링 지지는 지반 스프링(기초·지하층)에, 지점 침하는 부동침하 검토에 사용한다.',
        relatedActions: ['setSupport', 'nativeSetSupport'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('releases-offsets', '단부 해제와 강역(offset)', '부재 단부 모멘트 해제(핀), 단부 강역 길이 지정으로 clear span 설계 길이 반영.', {
        relatedReadApis: ['getMemberReleaseSummary', 'getMemberReleaseBenchmark'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('walls-midpier', '전단벽 (mid-pier)', '벽 패널을 등가 기둥+강체 보로 모델링하고 pier 단면력을 회복해 벽체 설계에 전달.', {
        status: 'preliminary',
        limits: ['정밀 쉘 응력회복은 예비 수준 — 등가 프레임 결과를 우선 사용'],
        relatedReadApis: ['getWallSlabEquivalentTrace'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('stories-diaphragms', '층과 다이어프램', 'z좌표 기반 층 자동 인식, 강막(rigid diaphragm) 구속과 층 질량중심/편심 관리.', {
        relatedActions: ['copyStory'],
        relatedReadApis: ['getStorySummary', 'getDiaphragmSummary', 'getRigidDiaphragmBenchmark'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('grid-generation', '그리드 골조 생성', 'X/Y 간격과 층고 입력으로 정형 골조를 일괄 생성 — 빠른 초기 모델링.', {
        relatedActions: ['createGridFrame'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('selection-editing', '선택·편집 도구', '개체 선택/박스선택/삭제/모드 전환 등 화면 편집 도구 일체.', {
        relatedActions: ['selectEntity', 'clearSelection', 'nativeSelectTool', 'nativeSelectMember', 'nativeDeleteElement', 'nativeClearPage', 'setNativeMode', 'clickNativeControl'],
        manualPage: '01-getting-started.md',
      }),
      feature('node-mass', '절점 질량', '동적 해석용 절점 질량 직접 입력 (질량 소스 자동 생성과 병용).', {
        relatedActions: ['setNodeMass'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('member-roles', '부재 역할 자동 분류', '방향 기반으로 기둥/보/가새 역할을 자동 배정 — 설계 모듈이 소비.', {
        relatedActions: ['autoAssignMemberRoles'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('onboarding-samples', '예제 모델', '내장 예제(라멘/벽식/철골)를 원클릭 로드해 바로 학습 시작.', {
        relatedActions: ['loadNativeExample'],
        manualPage: '01-getting-started.md',
      }),
    ],
  },
  {
    id: 'materials',
    name: '재료·단면',
    summary: '내장 카탈로그와 커스텀 재료/단면, id@version 불변 라이브러리.',
    features: [
      feature('material-catalog', '내장 재료/단면 카탈로그', '강재·콘크리트 표준 재료와 H형강 등 표준 단면 기본 제공.', {
        manualPage: '06-materials-library.md',
      }),
      feature('custom-materials', '커스텀 재료', '탄성(E/G/ν/ρ)과 강도, 비선형 backbone(이선형 등)까지 갖는 사용자 재료 등록.', {
        description: '비선형 파라미터는 소성힌지/fiber 단면이 소비한다. 수정 시 새 버전이 생기고 기존 모델 참조는 불변.',
        relatedActions: ['upsertMaterial'],
        manualPage: '06-materials-library.md',
      }),
      feature('custom-sections', '커스텀 단면', 'DB 선택, 파라메트릭(H/BOX/PIPE/RECT/CIRC) 자동 계산, 특성 직접 입력 3방식.', {
        relatedActions: ['upsertSection'],
        manualPage: '06-materials-library.md',
      }),
      feature('library-registry', '버전 라이브러리', 'id@version 고정 참조 — 라이브러리를 고쳐도 기존 모델 결과가 변하지 않는다. 계산서에 버전 표기.', {
        relatedActions: ['listLibrary', 'getLibraryItem'],
        relatedReadApis: ['getMaterialSectionRegistry', 'listLibrary', 'getLibraryItem', 'upsertMaterial', 'upsertSection'],
        manualPage: '06-materials-library.md',
      }),
      feature('library-ui', '라이브러리 화면', '프로젝트 화면(#/p/:id/library)에서 재료/단면 목록·편집·서버 저장.', {
        toggleable: true,
        manualPage: '06-materials-library.md',
      }),
    ],
  },
  {
    id: 'loads',
    name: '하중',
    summary: '하중 케이스, 절점/부재 하중 9종, 자동 하중산정(중력/풍/지진/설/토압), 질량.',
    features: [
      feature('load-cases', '하중 케이스', 'D/L/W/E 등 케이스 정의와 관리 — 모든 하중은 케이스에 소속.', {
        relatedActions: ['addLoadCase', 'updateLoadCase'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('nodal-loads', '절점 하중', '절점 집중력과 절점 모멘트.', {
        relatedActions: ['addLoad', 'updateLoad', 'deleteLoad', 'nativeAddNodalLoad'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('member-loads', '부재 하중', '전장 등분포, 부분 분포, 사다리꼴, 부재 위 집중력/모멘트 — 실무 재하 패턴 전체.', {
        relatedActions: ['nativeAddUdl'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('temperature-loads', '온도 하중', '균일 온도 변화와 단면 온도구배 — 구속 축력/휨 발생 검토.', {
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('load-templates', '하중 템플릿', '용도별 하중 프리셋을 모델에 일괄 적용.', {
        relatedActions: ['applyLoadTemplate'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('design-basis-loads', '자동 하중산정 (KDS)', '고정/활하중 기초값과 풍하중·지진하중을 KDS 기준식으로 산정해 하중 케이스로 생성 — 산정 trace가 계산서에 남는다.', {
        description: '설계 기본 입력(용도, 지역, 지반 등)을 넣으면 층별 하중과 방향별 횡하중(WX/WY, EX/EY)을 자동 생성한다. 모든 값은 기준식 ID와 함께 추적된다.',
        relatedActions: ['applyDesignBasisLoads', 'setDesignBasisInput'],
        relatedReadApis: ['getDesignBasisLoadEstimation', 'getDesignBasisInput', 'getLoadsV2Trace'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('floor-mass', '층 질량과 편심', '하중→질량 변환으로 층 질량 생성, 질량중심/강성중심과 우발편심 관리.', {
        relatedActions: ['generateFloorMass'],
        relatedReadApis: ['getStoryMassSummary', 'getEccentricStoryLoadDistribution'],
        manualPage: '03-loads-design-and-reports.md',
      }),
    ],
  },
  {
    id: 'combinations',
    name: '하중조합',
    summary: 'KDS 조합 자동 생성, 조합군 분류, 누락 감사, envelope.',
    features: [
      feature('kds-combinations', 'KDS 하중조합', '보유 하중케이스 기반 KDS 강도/사용성 조합 일괄 생성과 수동 조합 편집.', {
        relatedActions: ['applyKdsLoadCombinations', 'openNativeLoadCombinations', 'addLoadCombination', 'updateLoadCombination'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('rule-combinations', '규칙 기반 조합 생성', '방향·부호 규칙으로 조합을 확장 생성 (EX± 등) — 수동 누락 방지.', {
        relatedActions: ['applyKdsRuleBasedLoadCombinations'],
        relatedReadApis: ['getKdsLoadCombinationRules'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('combination-audit', '조합 누락 감사', '하중케이스 대비 빠진 조합/케이스를 검출하고 기준 registry와 대조.', {
        relatedReadApis: ['getKdsLoadCombinationCoverage', 'getKdsLoadStandardRegistry', 'getKdsLoadStandardAudit'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('envelope', 'Envelope과 지배조합', '부재력/반력/변위의 조합 포락과 demand별 지배조합 추적.', {
        relatedReadApis: ['getCombinationEnvelopeContract'],
        manualPage: '03-loads-design-and-reports.md',
      }),
    ],
  },
  {
    id: 'analysis',
    name: '탄성해석',
    summary: '3D 선형정적, P-Delta, 모달, 응답스펙트럼(SRSS/CQC), 선형 시간이력, 좌굴.',
    features: [
      feature('linear-static', '선형 정적해석', '3D 강성법 해석 — 조합별 변위/부재력/반력. 해석 전 validation, 해석 후 평형 audit.', {
        relatedActions: ['runAnalysis', 'setAnalysisSetting'],
        relatedReadApis: ['getResults'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('validation-gate', '모델 검증 게이트', '오류(중복/기구/참조 깨짐 등)가 있으면 solver 진입을 차단하고, 경고는 계산서에 남긴다.', {
        relatedActions: ['runNativeValidation'],
        relatedReadApis: ['getBaselineContract'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('pdelta', 'P-Delta (2차효과)', '축력-변위 반복 증폭 방식 P-Delta. 조합별 수렴/증폭 로그가 남는다.', {
        relatedActions: ['setNativePDeltaEnabled', 'setNativePDeltaStep', 'setPDeltaStep'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('modal', '고유치(모달) 해석', '고유주기·모드형상·질량참여율.', {
        relatedActions: ['showNativeModalReport'],
        manualPage: '07-nonlinear-analysis.md',
      }),
      feature('response-spectrum', '응답스펙트럼 (RSA)', '스펙트럼 함수 기반 모드 응답 조합 — SRSS/CQC, base shear scaling.', {
        manualPage: '07-nonlinear-analysis.md',
      }),
      feature('linear-tha', '선형 시간이력', '모드중첩 기반 선형 시간이력 응답 (지반가속도 입력).', {
        status: 'preliminary',
        manualPage: '07-nonlinear-analysis.md',
      }),
      feature('buckling', '선형 좌굴해석', 'K·φ=λ·KG·φ 고유치 좌굴 — 좌굴계수와 모드.', {
        status: 'preliminary',
        manualPage: '07-nonlinear-analysis.md',
      }),
      feature('elastic-expansion-trace', '탄성 확장 trace', '스프링/침하/트러스/offset/부분하중/온도 등 확장 기능의 적용 내역 추적.', {
        relatedReadApis: ['getElasticExpansionTrace', 'getDynamicCompletenessTrace', 'getAdvancedElasticTrace'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
    ],
  },
  {
    id: 'nonlinear',
    name: '비선형해석',
    summary: '정식 pushover(힌지/변위·arc-length 제어), PMM·fiber, 비선형 시간이력(NLTH).',
    features: [
      feature('pushover', 'Pushover 해석', '소성힌지 기반 비선형 정적 — capacity curve, 힌지 상태 이력, 수렴 로그.', {
        relatedActions: ['runPushover', 'setPushoverOption', 'setPushoverPanelOpen', 'runNativePushoverReport'],
        relatedReadApis: ['runPushover'],
        status: 'preliminary',
        limits: ['production 내진 성능검증 수준의 외부 대조는 Phase 4 실증(WP-02) 대기'],
        manualPage: '07-nonlinear-analysis.md',
        toggleable: true,
      }),
      feature('hinges-fiber', '소성힌지와 fiber 단면', 'M-θ backbone 힌지, 축력 연동 PMM 힌지, RC/강재 fiber 모멘트-곡률.', {
        status: 'preliminary',
        manualPage: '07-nonlinear-analysis.md',
        toggleable: true,
      }),
      feature('nlth', '비선형 시간이력 (NLTH)', 'Newmark-β 직접적분 + Rayleigh 감쇠, 지진파 기록 입력과 scaling trace.', {
        status: 'preliminary',
        limits: ['집중 소성 모델 기준 — 분포 소성 미지원'],
        relatedReadApis: ['getNonlinearAnalysisTrace'],
        manualPage: '07-nonlinear-analysis.md',
        toggleable: true,
      }),
    ],
  },
  {
    id: 'results',
    name: '결과 확인',
    summary: '결과 패널, 3D overlay, 층 결과표, 부재 station 최대력, 기초 반력, 층간변위.',
    features: [
      feature('results-panel', '결과 패널', '조합 선택, 변위/모멘트/전단/축력/반력 표시 토글, 결과 스케일.', {
        relatedActions: ['setResultsPanelOpen', 'setResultTab', 'setNativeResultToggle', 'setNativeCombo', 'setNativeResultScale', 'showNativeMemberResult'],
        relatedReadApis: ['getResultView'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('result-overlays', '3D 결과 overlay', '변형도/부재력 다이어그램을 모델 위에 겹쳐 표시, P-Delta 스텝 뷰 포함.', {
        relatedActions: ['setOverlayOption', 'setOverlayMode', 'setOverlayPDeltaStep'],
        relatedReadApis: ['getResultVisuals'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('viewer-navigation', '뷰어 탐색', '층 슬라이스, 개체 포커스 이동 등 3D 화면 탐색 도구.', {
        relatedActions: ['setViewerSlice', 'focusEntity'],
        relatedReadApis: ['getViewerState'],
        manualPage: '01-getting-started.md',
      }),
      feature('story-results', '층 결과표', '층 중량/누적 전단/전도/비틀림/층간변위비 표 — 횡력 검토의 기준 표.', {
        relatedReadApis: ['getResultPostprocessing', 'getStorySummary'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('member-station-forces', '부재 station 최대력', '부재 내 위치별 N/V/M과 경간 최대값, 지배조합 — 설계 demand의 원천.', {
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('foundation-reactions', '기초 반력 envelope', '지점별 max/min 반력과 인발(uplift) 플래그 — 기초 설계 입력.', {
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('drift-serviceability', '층간변위 사용성', '조합별 층간변위비와 허용치 판정.', {
        relatedReadApis: ['getServiceabilityDriftReport'],
        manualPage: '03-loads-design-and-reports.md',
      }),
    ],
  },
  {
    id: 'design',
    name: '설계 검토',
    summary: 'RC(보/기둥/벽/슬래브), 철골(부재/가새), 접합/베이스플레이트, 기초 — 일람표와 지배식 trace.',
    features: [
      feature('rc-design', 'RC 설계 검토', '보 휨/전단/배근, 기둥 PM 상관, 벽체, 슬래브 검토와 배근 일람.', {
        status: 'preliminary',
        limits: ['수계산 검증서 확충은 Phase 4 실증(WP-03) 대기 — 최종 조항 선정 포함'],
        relatedReadApis: ['getRcDetailingReport', 'getRcDetailedDesignReport'],
        manualPage: '03-loads-design-and-reports.md',
        toggleable: true,
      }),
      feature('steel-design', '철골 설계 검토', '조밀성, 압축좌굴, 휨(LTB), P-M 상관, 가새 검토.', {
        status: 'preliminary',
        relatedReadApis: ['getSteelDetailingReport'],
        manualPage: '03-loads-design-and-reports.md',
        toggleable: true,
      }),
      feature('connection-foundation', '접합·기초 검토', '볼트/용접/베이스플레이트와 확대기초/매트/말뚝 검토.', {
        status: 'preliminary',
        relatedReadApis: ['getConnectionFoundationReport'],
        manualPage: '03-loads-design-and-reports.md',
        toggleable: true,
      }),
      feature('design-demand', '설계 demand 패키지', '해석 결과에서 부재/기초 demand(지배조합 포함)를 설계 모듈로 전달하는 계약.', {
        relatedReadApis: ['getDesignDemandPackage', 'getMemberDesignTraceReport'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('integrated-design-report', '통합 설계 리포트', '설계 모듈 전체를 묶은 통합 결과와 일람.', {
        relatedActions: ['openNativeDesignReport'],
        relatedReadApis: ['getP3DetailedDesignReport', 'getP3IntegratedResults'],
        manualPage: '03-loads-design-and-reports.md',
      }),
    ],
  },
  {
    id: 'reports',
    name: '계산서·품질 감사',
    summary: '상세 보고서, 계산서 패키지, 이슈 추적, 실무 검증 리포트, 완성도 감사.',
    features: [
      feature('detailed-report', '상세 보고서', '모델/하중/해석/설계 전 과정을 담은 HTML 상세 보고서.', {
        relatedActions: ['openNativeDetailedReport'],
        relatedReadApis: ['getReport', 'getDetailedReport'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('calculation-package', '계산서 패키지', '실무 목차 기반 계산서 — 미검토 장은 숨기지 않고 not checked로 표기.', {
        relatedActions: ['openNativeCalculationPackage'],
        relatedReadApis: ['getCalculationPackage'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('practice-validation', '실무 검증 리포트', 'P-Delta/결과표/계산서 준비 상태를 점검하고 warning/NG를 이슈로 남긴다.', {
        relatedActions: ['runNativeProductAudit'],
        relatedReadApis: ['getPracticeValidationReport', 'getPracticePlatformReadiness', 'getPilotProjectValidation'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('quality-audit', '완성도·마일스톤 감사', '기능별 proven/preliminary 상태와 exit criteria를 코드가 스스로 보고 — 출시 게이트의 근거.', {
        relatedReadApis: [
          'getLaunchReadinessReport', 'getPhase3CompletionAuditReview', 'getPhase3PlanAlignment',
          'getPhase3DesignMilestoneReview', 'getPhase3DrawingImportValidationReview', 'getPhase3EngineeringValidationReview',
          'getPhase3ElasticMilestoneReview', 'getPhase3ImportMilestoneReview', 'getPhase3NonlinearMilestoneReview',
          'getPhase3PointCloudValidationReview', 'getPhase3PracticeValidationReview', 'getPhase3ProductizationMilestoneReview',
          'getPhase3OwnerSignoffReview', 'getPhase3EvidenceRegister',
        ],
        manualPage: 'STATUS_AND_LIMITS.md',
      }),
      feature('evidence-register', '증빙 등록', '실증 증빙(검증서/실측 리포트)을 프로젝트에 등록해 감사가 읽게 한다.', {
        relatedReadApis: ['listProjectEvidence', 'submitProjectEvidence'],
        manualPage: 'STATUS_AND_LIMITS.md',
      }),
    ],
  },
  {
    id: 'import',
    name: '도면·점군 가져오기',
    summary: 'DXF 직접 파싱, DWG 변환, 2D 평면 인식, 점군 구조 추출 — 후보 검토 후 확정.',
    features: [
      feature('dxf-import', 'DXF 가져오기', 'ASCII DXF를 직접 파싱해 3D wireframe을 부재 후보로 변환, layer→단면/재료 매핑.', {
        howTo: ['프로젝트에 DXF 업로드', '후보 생성 → 검토 화면에서 확정/수정/거부', 'validation 통과 시 모델 생성'],
        manualPage: '04-import-drawings.md',
        toggleable: true,
      }),
      feature('plan-recognition', '2D 평면 인식', '층별 평면 도면에서 grid/기둥/보를 인식하고 층고와 조립해 3D 모델 생성.', {
        status: 'preliminary',
        manualPage: '04-import-drawings.md',
        toggleable: true,
      }),
      feature('dwg-conversion', 'DWG 변환', 'ODA File Converter 연동으로 DWG→DXF 자동 변환. 변환기 부재 시 안내 UX.', {
        status: 'preliminary',
        limits: ['외부 변환기 설치 필요 — 실파일 e2e 실증은 WP-04 대기'],
        manualPage: '04-import-drawings.md',
        toggleable: true,
      }),
      feature('import-review', '가져오기 검토·확정', '후보(층/그리드/부재)를 confidence와 함께 3D overlay로 검토 — 확정 전에는 모델이 되지 않는다.', {
        relatedReadApis: ['listImportCandidates', 'resolveImportCandidate', 'confirmImport', 'rejectImport'],
        manualPage: '04-import-drawings.md',
      }),
      feature('pointcloud-load', '점군 로드·뷰어', 'XYZ/PLY/PCD/LAS 로드, voxel 다운샘플, 이상점 제거, WebGL2 점군 뷰어(슬라이스).', {
        status: 'preliminary',
        manualPage: '05-import-pointcloud.md',
        toggleable: true,
      }),
      feature('pointcloud-detect', '점군 구조 추출', 'z-히스토그램+RANSAC 층 검출, 클러스터 기둥/보/벽 검출 → 현황 모델 후보.', {
        status: 'preliminary',
        limits: ['실측 스캔 검증은 WP-04 대기 — 자동 검출은 보조 도구이며 확정은 사람이 한다'],
        manualPage: '05-import-pointcloud.md',
        toggleable: true,
      }),
    ],
  },
  {
    id: 'agent',
    name: 'AI 에이전트',
    summary: 'AI가 화면·모델·결과를 읽고 조작하는 공식 계약 — 78개 실행 액션, 75개 읽기 API.',
    features: [
      feature('agent-api', '에이전트 API', '모델 스냅샷/화면 상태/진단을 읽고 setModel 등으로 조작하는 버전 계약.', {
        relatedActions: ['setModel'],
        relatedReadApis: ['getSnapshot', 'getModel', 'getScreenState', 'getRuntimeDiagnostics', 'getCapabilities'],
        manualPage: 'AI_AGENT_GUIDE.md',
      }),
      feature('agent-command-bridge', '커맨드 브리지', 'DOM 이벤트/postMessage/URL 해시 3경로로 외부에서 액션 실행 — iframe 모델러 호스트도 이 경로 사용.', {
        relatedReadApis: ['DOM event: sstructures:agent-command', 'window.postMessage: sstructures:agent-command', 'URL hash: #sstructures-command='],
        manualPage: 'AI_AGENT_GUIDE.md',
      }),
    ],
  },
  {
    id: 'admin',
    name: '관리·운영',
    summary: '서버 설정, 백업/복구, 라이선스, 감사 로그, 배포 빌드.',
    features: [
      feature('server-config', '서버 설정', 'config.json/환경변수로 포트·데이터 경로·가입 허용을 제어. 동일 데이터 폴더 2중 기동은 lockfile이 차단.', {
        manualPage: '00-install.md',
      }),
      feature('backup-restore', '백업·복구', 'tools/backup-data.mjs로 실행 중 안전 백업과 무결성 검증(--verify).', {
        manualPage: '00-install.md',
      }),
      feature('license', '라이선스 키', '오프라인 서명 검증 방식 라이선스 v1 (발급 스크립트 별도).', {
        status: 'preliminary',
        manualPage: '00-install.md',
        toggleable: true,
      }),
      feature('audit-log', '감사 로그', '로그인 실패/권한 거부/승인·멤버 변경을 append-only JSONL로 기록.', {
        manualPage: '08-collaboration.md',
      }),
      feature('release-build', '배포 빌드', 'tools/build-release.mjs 단일 명령으로 배포 폴더+zip+SHA256 생성.', {
        manualPage: '00-install.md',
      }),
    ],
  },
];

export function getFeatureCatalog() {
  return {
    version: FEATURE_CATALOG_VERSION,
    categories: FEATURE_CATEGORIES,
    featureCount: listAllFeatures().length,
  };
}

export function listAllFeatures() {
  return FEATURE_CATEGORIES.flatMap((category) => category.features.map((item) => ({ ...item, categoryId: category.id })));
}

export function findFeature(featureId) {
  for (const category of FEATURE_CATEGORIES) {
    const found = category.features.find((item) => item.id === featureId);
    if (found) return { ...found, categoryId: category.id, categoryName: category.name };
  }
  return null;
}

/**
 * 기능 토글 진입점 (향후 설정/플랜 연동용).
 * overrides: { 'feature.<id>': boolean } 형태 — 설정 저장소가 채워서 넘긴다.
 * toggleable=false 기능은 override와 무관하게 항상 켜져 있다.
 */
export function resolveFeatureEnabled(featureId, overrides = {}) {
  const found = findFeature(featureId);
  if (!found) throw new Error(`Unknown feature id: ${featureId}`);
  if (!found.control.toggleable) return true;
  const override = overrides[found.control.key];
  return typeof override === 'boolean' ? override : found.control.defaultEnabled;
}

export function validateFeatureCatalog() {
  const errors = [];
  const seenIds = new Set();
  const seenKeys = new Set();
  for (const category of FEATURE_CATEGORIES) {
    if (!category.id || !category.name) errors.push(`Category missing id/name: ${category.id}`);
    if (!category.features?.length) errors.push(`Category has no features: ${category.id}`);
    for (const item of category.features || []) {
      if (!item.id || !item.name || !item.summary) errors.push(`Feature missing required fields: ${item.id || '(no id)'}`);
      if (seenIds.has(item.id)) errors.push(`Duplicate feature id: ${item.id}`);
      seenIds.add(item.id);
      if (seenKeys.has(item.control.key)) errors.push(`Duplicate control key: ${item.control.key}`);
      seenKeys.add(item.control.key);
      if (!['stable', 'preliminary'].includes(item.status)) errors.push(`Bad status on ${item.id}: ${item.status}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
