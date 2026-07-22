export const FEATURE_CATALOG_VERSION = 'p4-feature-catalog-v2';

/**
 * 프로그램 전 기능의 단일 카탈로그.
 *
 * 1) manual.html 이 이 데이터를 렌더링해 사용자 설명서가 된다.
 * 2) 각 기능의 control.key 는 향후 기능 토글(설정/라이선스 플랜)의 키가 된다 —
 *    resolveFeatureEnabled() 가 그 진입점이다.
 * 3) tests/p4-feature-manual.mjs 가 (a) agent-contract 의 executeActions/readApis 와
 *    양방향 커버리지, (b) 항목별 본문 충실도(howTo 2단계 이상, 상세 설명, preliminary 한계 명기)를
 *    강제한다. 기능/액션을 추가하면 여기 등재 없이는 테스트가 실패한다.
 *
 * UI 용어 기준: 상단 모드 탭 = [모델링 | 탄성해석 | 비선형해석 | 태블릿메모],
 * 모델링 팔레트 도구 = 절점/부재/기둥/지지(고정·힌지·롤러)/절점하중/등분포/모멘트/이동/박스선택/삭제,
 * 앱 셸 라우트 = #/login, #/projects, #/p/:id/modeler, #/p/:id/revisions, #/p/:id/library, #/p/:id/import/:jobId.
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
        description: '서버 계정은 scrypt 해시와 서명 토큰으로 보호되고, 연속 로그인 실패 시 계정이 일시 잠긴다. 역할은 프로젝트 단위로 부여된다: viewer는 열람만, reviewer는 열람+승인, engineer는 모델 저장과 파일 업로드, owner는 멤버 관리와 프로젝트 삭제까지 가능하다. 비멤버에게는 프로젝트 존재 자체가 보이지 않는다(404).',
        howTo: [
          'app.html 접속 → 이메일/비밀번호(10자 이상)로 가입 — 서버의 첫 계정이 관리자(admin)가 된다',
          '로그인하면 프로젝트 목록(#/projects)으로 이동한다',
          '프로젝트 소유자는 멤버 관리에서 상대 계정에 역할을 부여한다',
          '읽기 전용 공유가 필요하면 viewer, 계산서 승인 담당자는 reviewer로 지정한다',
        ],
        limits: ['비밀번호 재설정은 관리자 임시 발급 방식 (셀프 재설정 메일 미지원)', '외부 IdP(OAuth) 미지원'],
        manualPage: '08-collaboration.md',
      }),
      feature('projects', '프로젝트 관리', '프로젝트 생성/열기/이름 변경/멤버십, 목록은 내가 멤버인 것만 표시.', {
        description: '프로젝트는 모델 리비전, 업로드 파일(도면/점군), import 검토 기록, 재료 라이브러리, 승인 상태를 묶는 단위다. 삭제는 soft-delete로 처리되어 목록에서만 사라진다.',
        howTo: [
          '#/projects 화면에서 이름을 입력하고 "Create project"를 누른다',
          '목록에서 프로젝트를 클릭하면 모델러(#/p/:id/modeler)로 진입한다',
          '이름/설명 변경과 삭제는 owner 역할만 가능하다',
        ],
        limits: ['프로젝트 간 모델 복사는 파일 내보내기/가져오기를 경유'],
        manualPage: '01-getting-started.md',
      }),
      feature('save-revisions', '서버 저장과 리비전', 'Ctrl+S 저장마다 리비전이 쌓이고(append-only), 과거 리비전 열람/복원이 가능하다.', {
        description: '저장은 모델 스냅샷을 서버 리비전(rev 1, 2, 3…)으로 기록한다. 리비전은 절대 덮어쓰지 않으므로 언제든 과거 상태로 돌아갈 수 있다. 오래된 리비전에서 이어서 저장하면 lineage 경고 배너가 떠서 이력 분기를 알려주고, 복원 역시 새 리비전 저장으로 처리되어 이력이 보존된다.',
        howTo: [
          '프로젝트 모델러에서 Ctrl+S(또는 저장 버튼) — 저장 상태줄에 rev 번호와 시각이 표시된다',
          '#/p/:id/revisions에서 리비전 목록을 확인하고 원하는 rev를 연다',
          '과거 rev를 연 상태에서 저장하면 lineage 경고가 표시된다 — 분기 여부를 확인하고 진행',
        ],
        limits: ['동시 편집 병합은 미지원 — 마지막 저장이 최신이 되고 경고로만 알림'],
        manualPage: '01-getting-started.md',
      }),
      feature('autosave', '자동 저장과 복구', '편집 중 유휴 5초/최대 60초 간격 자동 저장, 최근 3개 링버퍼, 비정상 종료 후 복구 프롬프트.', {
        description: '자동 저장은 브라우저 로컬 저장소에 기록되며 서버 리비전과 별개다. 최근 3개를 링버퍼로 유지해 저장 직전 상태로 돌아갈 수 있고, 브라우저 강제 종료 후 다시 열면 마지막 자동 저장 복구를 제안한다.',
        howTo: [
          '별도 설정 없이 편집을 시작하면 자동으로 동작한다',
          '비정상 종료 후 같은 브라우저로 다시 열면 복구 프롬프트에서 "복구"를 선택한다',
          '에이전트/콘솔에서는 saveNativeAutosave / restoreNativeAutosave 액션으로 수동 실행할 수 있다',
        ],
        limits: ['로컬 저장소 기반 — 다른 PC/브라우저에는 전달되지 않음 (서버 저장과 병행 필수)', '해석 결과는 저장하지 않고 모델만 저장 (재해석으로 재현)'],
        relatedActions: ['saveNativeAutosave', 'restoreNativeAutosave'],
        manualPage: '01-getting-started.md',
      }),
      feature('file-book', '파일 내보내기/가져오기', '모델을 JSON 북 파일로 다운로드/업로드 — 오프라인 전달과 백업용(L2 저장 계층).', {
        description: '서버 없이도 모델을 파일 하나로 저장·이동할 수 있다. 파일에는 모델과 페이지(메모/이미지 포함) 정보가 담기며, 구버전 파일도 로드 시 스키마 마이그레이션이 자동 수행된다. 이메일/메신저로 모델을 주고받거나 개인 백업을 만들 때 사용한다.',
        howTo: [
          '모델러에서 내보내기(책 저장) 실행 → .json 파일이 다운로드된다',
          '가져오기(책 열기)에서 파일을 선택하면 현재 화면의 모델이 교체된다',
          '에이전트에서는 exportNativeBook / importNativeBook 액션을 사용한다',
        ],
        limits: ['가져오기는 현재 모델을 교체 — 병합 아님. 필요하면 먼저 서버 저장으로 리비전을 남길 것'],
        relatedActions: ['exportNativeBook', 'importNativeBook'],
        manualPage: '01-getting-started.md',
      }),
      feature('approval-workflow', '검토 승인 워크플로', 'reviewer가 특정 리비전을 승인/배포 상태로 지정, 이후 새 저장이 생기면 승인이 자동 해제된다.', {
        description: '계산서 검토가 끝난 리비전을 reviewer 이상이 approved로 지정하면 프로젝트에 승인 상태가 기록된다. 승인 이후 누군가 새 리비전을 저장하면 승인은 자동으로 revoked가 되어 "승인된 것과 다른 모델" 문제가 구조적으로 차단된다. 모든 승인 변경은 감사 로그에 남는다.',
        howTo: [
          '엔지니어가 최종 모델을 저장하고 rev 번호를 검토자에게 알린다',
          'reviewer 계정으로 승인 API/화면에서 해당 rev를 approved로 지정한다',
          '이후 수정 저장이 생기면 승인 상태가 revoked로 바뀐 것을 확인하고 재승인 절차를 밟는다',
        ],
        limits: ['승인 잠금은 저장을 막지 않고 상태 해제로 알리는 방식 (강제 잠금 아님)'],
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
        description: '절점은 부재 연결점이자 지지·하중·질량이 놓이는 위치다. 화면 클릭으로 만들면 그리드에 스냅되고, 좌표를 직접 지정하려면 에이전트 액션이나 속성 편집을 쓴다. 같은 위치의 중복 절점은 검증 게이트가 경고한다.',
        howTo: [
          '상단 모드 탭에서 [모델링] 선택 → 팔레트에서 절점 추가 도구를 켠다',
          '캔버스를 클릭해 절점을 배치한다 (평면/입면 뷰 전환은 상단 뷰 버튼)',
          '이동 도구(smove)로 드래그해 위치를 수정하고, 삭제 도구로 제거한다',
          '정밀 좌표가 필요하면 addNode({ x, y, z }) 에이전트 액션을 사용한다',
        ],
        relatedActions: ['addNode', 'updateNode', 'deleteNode', 'nativeMoveNode'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('members', '부재 (보/기둥/가새)', '두 절점을 잇는 3D 프레임 부재. 단면·재료 배정, 로컬축 지정.', {
        description: '부재는 두 절점을 잇는 3D 보 요소로, 단면과 재료를 배정해야 해석이 가능하다. 팔레트의 부재 도구는 절점 두 개를 차례로 클릭해 잇고, 기둥 도구는 클릭 지점 위로 수직 부재를 만든다. 로컬축(강축 방향)은 부재 속성의 roll 각으로 제어한다.',
        howTo: [
          '[모델링] 모드 → 팔레트에서 부재 도구 선택 → 시작 절점, 끝 절점 순서로 클릭',
          '기둥은 기둥 도구로 평면 위치를 클릭하면 층고만큼 수직 생성된다',
          '부재를 선택하고 단면/재료를 배정한다 (setMemberSection / setMemberMaterial)',
          '로컬축 표시는 탄성해석 모드의 결과 토글 axes로 확인한다',
        ],
        relatedActions: ['addMember', 'updateMember', 'deleteMember', 'nativeDrawMember', 'nativeAddColumn', 'setMemberSection', 'setMemberMaterial', 'assignSection', 'setMemberBehavior', 'nativeSetMemberBehavior'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('member-behavior', '부재 거동 타입', '프레임 외에 트러스/인장전담/압축전담 부재를 지원 — X-brace, 케이블 모델링.', {
        description: '부재 type을 frame/truss/tensionOnly/compressionOnly 중에서 지정한다. 트러스는 양단 모멘트를 전달하지 않고, 인장전담(tensionOnly)은 압축을 받으면 조합별 반복해석에서 자동 비활성화된다 — X-brace 한 쌍 중 인장 쪽만 유효한 실무 모델이 그대로 재현된다.',
        howTo: [
          '부재를 선택하고 속성에서 거동 타입을 지정하거나, updateMember({ id, type: "tensionOnly" }) 액션을 사용한다',
          'X-brace는 대각 2개를 모두 그리고 둘 다 tensionOnly로 지정한다',
          '해석 후 조합별로 어떤 부재가 비활성화됐는지 탄성 확장 trace에서 확인한다',
        ],
        limits: ['인장/압축전담 반복은 최대 반복 수 내 수렴 필요 — 실패 시 해석 audit에 경고', '조합마다 활성 상태가 달라 envelope 해석 시 주의'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('supports', '지지 조건', '고정/힌지/롤러/사용자 정의 DOF에 더해 6-자유도 스프링 지지와 지점 침하를 지원.', {
        description: '팔레트의 고정/힌지/롤러 도구로 절점을 클릭하면 지지가 배정된다. 자유도별 임의 구속(custom)과 6-자유도 스프링(kx…krz), 하중 케이스에 속한 지점 침하(강제 변위)는 절점 속성 또는 setSupport 액션으로 지정한다. 스프링 반력은 반력 결과와 평형 audit에 포함된다.',
        howTo: [
          '[모델링] 모드 → 팔레트에서 고정(fixed)/힌지(pin)/롤러(roller) 도구 선택 → 절점 클릭',
          '지반 스프링: setSupport로 support:"spring"과 spring:{kx,ky,kz,...} 계수를 지정한다',
          '부동침하 검토: 절점에 settlement(케이스 소속 강제 변위)를 지정하고 해당 케이스를 조합에 포함한다',
        ],
        limits: ['스프링/침하 입력은 속성·에이전트 경로 중심 (팔레트 버튼은 고정/힌지/롤러 3종)'],
        relatedActions: ['setSupport', 'setSpringSupport', 'setSettlement', 'nativeSetSupport', 'nativeSetSpringSupport', 'nativeSetSettlement'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('releases-offsets', '단부 해제·부분강절과 3D 강역(offset)', 'pin/rigid, 4축 회전스프링, 3D 강체팔·삽입점·패널존으로 접합부 강역과 편심을 반영.', {
        description: '단부 해제와 local y/z 회전스프링에 더해 숫자형 축방향 또는 local/global 3D 강체팔을 지정한다. 삽입점은 단면 기준점 편심을 같은 강체팔로 변환하며, 절점 panelZone은 G·tp·db·dc 회전스프링으로 자동 모델링한다.',
        howTo: [
          '부재 속성에서 releases(i/j: pin|rigid)를 지정하거나 updateMember 액션을 사용한다',
          '부분강절은 releases.spring.{ryI,rzI,ryJ,rzJ}에 유한 비음수 회전강성을 지정한다. 키 미지정은 강접, 명시적 0은 release 극한이다',
          'updateMember의 spring patch는 기존 축을 보존한다. spring:null은 전체 삭제, spring.{축}:null은 해당 축만 삭제한다',
          '축방향 강역은 endOffset({i,j})에 길이(m)를 입력한다. 3D 편심은 각 단부를 {dx,dy,dz}로 쓰고 frame을 local 또는 global로 지정한다',
          'insertionPoint는 centroid/top-center/bottom-center/좌우 중심/네 모서리 중 선택한다',
          '패널존은 절점 panelZone:{tp,db,dc,axis?}로 지정하며 axis 생략 시 부재 strongAxis를 따른다',
          '적용 결과는 부재 해제 요약(getMemberReleaseSummary)과 해제 benchmark로 교차 확인한다',
        ],
        limits: [
          '유한 회전스프링 Direct P-Delta는 raw prismatic KG 근사이며 PARTIAL_FIXITY_PRISMATIC_KG_APPROXIMATION을 표시한다',
          '명시적 zero spring Direct P-Delta, global buckling, nonlinear/corotational 해석은 canonical reason code로 차단된다',
          '벡터 오프셋과 비도심 삽입점의 nonlinear/corotational 해석은 NONLINEAR_3D_OFFSET_UNSUPPORTED로 차단된다',
          'rigidFactor<1과 패널존·명시 spring의 동일 축 중복은 지원하지 않는다',
        ],
        relatedActions: ['addConstraint', 'updateConstraint', 'deleteConstraint'],
        relatedReadApis: ['getMemberReleaseSummary', 'getMemberReleaseBenchmark'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('walls-midpier', '전단벽 (mid-pier)', '벽 패널을 등가 기둥+강체 보로 모델링하고 pier 단면력을 회복해 벽체 설계에 전달.', {
        description: '벽 패널(4 모서리 절점+두께+재료)을 정의하면 중앙 수직 등가 기둥과 상하 강체 연결로 변환되어 해석된다. pier의 축력/전단/모멘트가 회복되어 RC 벽체 검토의 demand가 된다. 개구부가 있는 벽은 pier/spandrel로 나눠 입력한다.',
        howTo: [
          '벽 패널을 모서리 절점 4개와 두께·재료로 정의한다',
          '해석 실행 후 벽·슬래브 등가 trace(getWallSlabEquivalentTrace)에서 pier 단면력을 확인한다',
          'RC 설계 검토의 벽체 항목에서 검토 결과를 확인한다',
        ],
        status: 'preliminary',
        limits: ['정밀 쉘 응력회복은 예비 수준 — 등가 프레임(mid-pier) 결과를 우선 사용', '개구부 자동 분해 미지원 — 패널 분할은 사용자가 지정'],
        relatedReadApis: ['getWallSlabEquivalentTrace'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('stories-diaphragms', '층과 다이어프램', 'z좌표 기반 층 자동 인식, 강막(rigid diaphragm) 구속과 층 질량중심/편심 관리.', {
        description: '절점 z좌표에서 층이 자동 유도되어 층 요약표(층고/절점/질량)가 생성된다. 강막 다이어프램을 지정하면 같은 층 절점들의 면내 자유도가 묶여 횡하중이 강성 비례로 분배되고, 층 질량중심·강성중심과 편심이 계산되어 지진하중 분배와 우발편심에 쓰인다. 층 복사로 기준층을 위로 반복할 수 있다.',
        howTo: [
          '모델링 후 층 요약(getStorySummary)에서 자동 인식된 층을 확인한다',
          '다이어프램 대상 층을 지정하면 강막 구속이 적용된다 — 다이어프램 요약과 benchmark로 확인',
          '기준층 완성 후 copyStory로 상부층을 복제한다',
        ],
        limits: ['semi-rigid(면내 유연) 다이어프램은 예비 — 전이층 등은 결과 재분배 확인 필요'],
        relatedActions: ['copyStory'],
        relatedReadApis: ['getStorySummary', 'getDiaphragmSummary', 'getRigidDiaphragmBenchmark'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('grid-generation', '그리드 골조 생성', 'X/Y 간격과 층고 입력으로 정형 골조를 일괄 생성 — 빠른 초기 모델링.', {
        description: 'X방향 스팬 배열, Y방향 스팬 배열, 층고 배열을 주면 기둥·보가 배치된 정형 3D 골조가 한 번에 생성된다. 초기 스터디 모델이나 벤치마크 모델을 몇 초 만에 만들 때 사용하고, 생성 후 개별 수정으로 비정형을 반영한다.',
        howTo: [
          'createGridFrame({ xSpacings:[6,6], ySpacings:[6], storyHeights:[3.5,3.3] }) 액션을 실행한다',
          '생성 직후 검증(mValidate)으로 모델 상태를 확인한다',
          '필요한 위치의 부재를 삭제/수정해 개구부·셋백을 반영한다',
        ],
        relatedActions: ['createGridFrame'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('selection-editing', '선택·편집 도구', '개체 선택/박스선택/삭제/모드 전환 등 화면 편집 도구 일체.', {
        description: '팔레트의 선택·이동·박스선택·삭제 도구와 상단 모드 탭(모델링/탄성해석/비선형해석/태블릿메모) 전환이 편집의 기본기다. 개체를 선택하면 속성이 표시되고, 박스선택으로 여러 개체를 한 번에 잡는다. 페이지 전체 초기화(nativeClearPage)는 현재 페이지 모델을 비운다.',
        howTo: [
          '상단 모드 탭으로 작업 모드를 전환한다 (모델링 ↔ 탄성해석 등)',
          '팔레트에서 선택/박스선택 도구를 켜고 개체를 클릭 또는 드래그로 선택한다',
          '삭제 도구(sdelete) 또는 deleteElement로 선택 개체를 제거한다',
        ],
        relatedActions: ['selectEntity', 'clearSelection', 'nativeSelectTool', 'nativeSelectMember', 'nativeDeleteElement', 'nativeClearPage', 'setNativeMode', 'clickNativeControl'],
        manualPage: '01-getting-started.md',
      }),
      feature('node-mass', '절점 질량', '동적 해석용 절점 질량 직접 입력 (질량 소스 자동 생성과 병용).', {
        description: '모달/응답스펙트럼/시간이력 해석은 절점 질량을 사용한다. 층 질량 자동 생성(generateFloorMass)이 기본 경로이고, 특정 위치의 장비 하중 등은 setNodeMass로 직접 입력해 보탠다.',
        howTo: [
          '일반 층 질량은 자동 하중산정 후 generateFloorMass로 일괄 생성한다',
          '국부 질량(장비 등)은 setNodeMass({ node, mass })로 개별 입력한다',
          '층 질량 요약(getStoryMassSummary)에서 층별 합계와 질량중심을 검산한다',
        ],
        relatedActions: ['setNodeMass'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('member-roles', '부재 역할 자동 분류', '방향 기반으로 기둥/보/가새 역할을 자동 배정 — 설계 모듈이 소비.', {
        description: '부재 방향 벡터로 수직=기둥, 수평=보, 경사=가새 역할을 일괄 배정한다. 설계 검토(RC/철골)와 일람표는 이 역할로 검토식을 고른다. import로 생성한 모델을 설계까지 잇는 중간 단계로 특히 유용하다.',
        howTo: [
          '모델 완성 후 autoAssignMemberRoles 액션을 실행한다',
          '설계 demand 패키지에서 역할별 분류가 반영됐는지 확인한다',
          '특수 부재(전이보 등)는 개별 속성에서 역할을 수동 조정한다',
        ],
        relatedActions: ['autoAssignMemberRoles'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('onboarding-samples', '예제 모델', '내장 예제(라멘/벽식/철골)를 원클릭 로드해 바로 학습 시작.', {
        description: '학습·데모용 내장 예제가 포함되어 있다. 시작 샘플은 loadNativeExample로 즉시 로드되고, 온보딩 샘플 3종(라멘 사무소/벽식/철골)은 튜토리얼 T1~T3와 1:1로 연결된다.',
        howTo: [
          '빈 화면에서 loadNativeExample을 실행하면 시작 샘플이 로드된다',
          'samples/onboarding/의 3종 파일은 파일 가져오기로 연다',
          '튜토리얼 문서(tutorials/T1~T3)를 따라 각 샘플로 전체 흐름을 연습한다',
        ],
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
        description: '설치 직후 바로 쓸 수 있는 표준 재료(구조용 강재, 콘크리트 강도 등급)와 표준 단면(H형강 등)이 내장되어 있다. 부재에 이름으로 배정하면 되고, 내장 항목은 라이브러리의 기본(built-in) 스코프로 취급된다.',
        howTo: [
          '부재 선택 → 단면/재료 필드에서 내장 이름을 지정한다 (예: H-300x150, C24)',
          '전체 목록은 재료/단면 registry(getMaterialSectionRegistry)로 조회한다',
          '내장 값과 다른 물성이 필요하면 커스텀 재료/단면으로 등록해 사용한다',
        ],
        manualPage: '06-materials-library.md',
      }),
      feature('custom-materials', '커스텀 재료', '탄성(E/G/ν/ρ)과 강도, 비선형 backbone(이선형 등)까지 갖는 사용자 재료 등록.', {
        description: '탄성계수·전단탄성계수·포아송비·밀도와 강도값(Fy/Fu 또는 fck)을 갖는 재료를 직접 등록한다. 비선형 파라미터(backbone 곡선, 경화율)를 넣으면 소성힌지와 fiber 단면이 이를 소비해 비선형해석의 재료 모델이 된다. backbone 좌표는 단조 증가 검증을 거친다.',
        howTo: [
          '#/p/:id/library 화면 또는 upsertMaterial 액션으로 재료를 등록한다',
          '비선형 검토가 필요하면 nonlinear.backbone 좌표와 hardeningRatio를 함께 입력한다',
          '부재의 재료 필드에 등록한 id를 배정하면 즉시 적용된다',
        ],
        limits: ['재료 물성의 공학적 타당성은 사용자 책임 — 출처를 source 필드에 남길 것'],
        relatedActions: ['upsertMaterial'],
        manualPage: '06-materials-library.md',
      }),
      feature('custom-sections', '커스텀 단면', 'DB 선택, 파라메트릭(H/BOX/PIPE/RECT/CIRC) 자동 계산, 특성 직접 입력 3방식.', {
        description: '단면은 세 방식으로 만든다: (1) 내장 DB에서 선택, (2) 형상 치수(H/B/tw/tf 등)를 넣으면 A·I·Z가 자동 계산되는 파라메트릭, (3) 특성값 직접 입력. 직접 입력은 A>0, I>0 같은 물리 타당성 검사를 거치고 의심 값은 경고된다.',
        howTo: [
          '#/p/:id/library 또는 upsertSection 액션으로 단면을 등록한다',
          '파라메트릭은 shape(H/BOX/PIPE/RECT/CIRC)와 치수만 입력 — 특성은 자동 계산된다',
          '부재에 단면 id를 배정하고, 해석 후 설계 검토에서 단면 성능을 확인한다',
        ],
        relatedActions: ['upsertSection'],
        manualPage: '06-materials-library.md',
      }),
      feature('library-registry', '버전 라이브러리', 'id@version 고정 참조 — 라이브러리를 고쳐도 기존 모델 결과가 변하지 않는다. 계산서에 버전 표기.', {
        description: '라이브러리 항목을 수정하면 덮어쓰지 않고 새 버전이 생긴다(append-only). 모델은 id@version으로 고정 참조하므로 라이브러리를 나중에 고쳐도 기존 계산 결과가 조용히 바뀌는 사고가 없다. 계산서 재료 장에는 사용된 항목의 id@version과 출처가 표기된다.',
        howTo: [
          '항목 수정 시 자동으로 버전이 올라간다 — 목록에서 버전 이력을 확인한다',
          '기존 모델을 새 버전으로 올리려면 부재 배정을 명시적으로 갱신한다',
          '조회는 listLibrary/getLibraryItem, 계약 전체는 getMaterialSectionRegistry로 읽는다',
        ],
        relatedActions: ['listLibrary', 'getLibraryItem'],
        relatedReadApis: ['getMaterialSectionRegistry', 'listLibrary', 'getLibraryItem', 'upsertMaterial', 'upsertSection'],
        manualPage: '06-materials-library.md',
      }),
      feature('library-ui', '라이브러리 화면', '프로젝트 화면(#/p/:id/library)에서 재료/단면 목록·편집·서버 저장.', {
        description: '프로젝트별 재료/단면 라이브러리를 목록으로 보고 편집·저장하는 화면이다. 저장하면 서버에 기록되어 프로젝트 멤버가 공유하고, 에이전트 액션과 같은 경로를 쓰므로 화면/자동화 어느 쪽으로 만들어도 동일하게 관리된다.',
        howTo: [
          '프로젝트에 들어간 뒤 주소창 해시를 #/p/<프로젝트id>/library로 이동한다',
          '목록에서 항목을 선택해 편집하거나 새 재료/단면을 추가한다',
          '저장을 누르면 서버에 새 버전으로 기록된다',
        ],
        toggleable: true,
        manualPage: '06-materials-library.md',
      }),
    ],
  },
  {
    id: 'loads',
    name: '하중',
    summary: '하중 케이스, 절점/부재 하중 9종, 자동 하중산정(중력/풍/지진), 질량.',
    features: [
      feature('load-cases', '하중 케이스', 'D/L/W/E 등 케이스 정의와 관리 — 모든 하중은 케이스에 소속.', {
        description: '하중은 반드시 케이스(D 고정, L 활, WX/WY 풍, EX/EY 지진 등)에 속한다. 케이스 타입(dead/live/wind/seismic…)은 KDS 조합 생성이 계수를 고를 때 사용된다. 케이스 없는 하중, 조합에 안 잡힌 케이스는 감사가 경고한다.',
        howTo: [
          'addLoadCase({ id:"L", name:"활하중", type:"live" })로 케이스를 만든다',
          '하중 입력 시 case 필드로 소속 케이스를 지정한다',
          '조합 누락 감사에서 미사용 케이스 경고를 확인한다',
        ],
        relatedActions: ['addLoadCase', 'updateLoadCase', 'deleteLoadCase'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('nodal-loads', '절점 하중', '절점 집중력과 절점 모멘트.', {
        description: '절점에 방향별 집중력(P)과 집중 모멘트(M)를 재하한다. 팔레트의 절점하중 도구로 클릭 입력하거나, 크기·방향·케이스를 명시해 액션으로 넣는다.',
        howTo: [
          '[모델링] 팔레트에서 절점하중(pload) 도구 선택 → 절점 클릭 → 크기 입력',
          '정밀 입력은 addLoad({ type:"nodal", node, P, direction, case })를 사용한다',
          '절점 모멘트는 type:"nmoment"로 입력한다',
        ],
        relatedActions: ['addLoad', 'updateLoad', 'deleteLoad', 'nativeAddNodalLoad'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('member-loads', '부재 하중', '전장 등분포, 부분 분포, 사다리꼴, 부재 위 집중력/모멘트 — 실무 재하 패턴 전체.', {
        description: '부재 하중 5종을 지원한다: 전장 등분포(udl), 구간 등분포(udl-partial, from~to 비율), 사다리꼴(trapezoid, w1→w2), 부재 위 임의 위치 집중력(point, at 비율), 부재 위 집중 모멘트(mmoment). 고정단력 공식으로 등가 절점하중이 만들어지고 부재 내력 회복에 하중 불연속이 반영된다.',
        howTo: [
          '등분포는 팔레트의 등분포(udl) 도구로 부재 클릭 → 크기 입력',
          '부분/사다리꼴/집중은 addLoad에 type과 from/to/at(0~1 비율)을 지정한다',
          '입력 후 부재를 선택해 하중 화살표 표시로 방향·구간을 확인한다',
        ],
        relatedActions: ['addLoad', 'addPartialLoad', 'updateLoad', 'deleteLoad', 'nativeAddUdl', 'nativeAddPartialLoad'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('temperature-loads', '온도 하중', '균일 온도 변화와 단면 온도구배 — 구속 축력/휨 발생 검토.', {
        description: '부재의 균일 온도 변화(temperature, dT)는 구속 조건에서 축력을, 단면 상하 온도차(tgradient, dTtop/dTbot/h)는 곡률과 휨을 유발한다. 장스팬 지붕이나 외기 노출 부재의 온도 응력 검토에 사용하며, 재료의 열팽창계수(alpha)를 사용한다.',
        howTo: [
          'addLoad({ type:"temperature", member, dT, case })로 균일 온도를 입력한다',
          '구배는 type:"tgradient"에 dTtop/dTbot과 단면 깊이 h를 지정한다',
          '온도 케이스를 별도 케이스로 두고 조합에 포함해 해석한다',
        ],
        relatedActions: ['addLoad', 'addTemperatureLoad', 'nativeAddTemperatureLoad'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('load-templates', '하중 템플릿', '용도별 하중 프리셋을 모델에 일괄 적용.', {
        description: '바닥 용도별 표준 하중 세트(고정+활)를 템플릿으로 일괄 재하한다. 반복적인 층 하중 입력을 줄이고, 적용 내역은 하중 산정 trace에 남는다.',
        howTo: [
          'applyLoadTemplate으로 대상과 템플릿을 지정해 실행한다',
          '적용된 하중을 케이스별로 확인하고 필요 부분만 수동 보정한다',
        ],
        relatedActions: ['applyLoadTemplate'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('design-basis-loads', '자동 하중산정 (KDS)', '설계 기본 입력으로 중력/풍/지진 하중을 KDS 기준식으로 산정 — 산정 trace가 계산서에 남는다.', {
        description: '용도(occupancy)·지역·지반 등 설계 기본 입력을 넣으면 층별 중력하중과 방향별 횡하중(WX/WY 풍, EX/EY 지진)이 케이스로 자동 생성된다. 모든 값은 기준식 ID·입력값·중간값이 있는 산정 trace로 남아 계산서에 그대로 출력되므로 "어디서 나온 숫자인지"를 항상 추적할 수 있다.',
        howTo: [
          'setDesignBasisInput으로 용도/지역/지반/중요도 등 기본 입력을 저장한다',
          'applyDesignBasisLoads를 실행하면 하중 케이스와 층별 하중이 생성된다',
          '산정 근거는 getDesignBasisLoadEstimation / getLoadsV2Trace로 확인하고 계산서에서 재검토한다',
          '이어서 KDS 조합 생성과 층 질량 생성을 실행한다',
        ],
        limits: ['풍·지진 상세 계수의 프로젝트별 예외(특수 형상 등)는 사용자 검토 필요', '설하중/토압/수압 v2 상세는 예비 수준'],
        relatedActions: ['applyDesignBasisLoads', 'setDesignBasisInput'],
        relatedReadApis: ['getDesignBasisLoadEstimation', 'getDesignBasisInput', 'getLoadsV2Trace'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('floor-mass', '층 질량과 편심', '하중→질량 변환으로 층 질량 생성, 질량중심/강성중심과 우발편심 관리.', {
        description: '중력하중(D+계수×L)을 질량으로 환산해 층별 절점 질량을 만든다. 층 질량중심과 강성중심의 편심이 계산되고, 우발편심(±5%)을 부호별 케이스로 만들어 비틀림 영향을 조합에 반영한다. 동적 해석과 지진하중 분배의 기초 데이터다.',
        howTo: [
          '중력하중 입력(또는 자동 산정) 후 generateFloorMass를 실행한다',
          '층 질량 요약(getStoryMassSummary)에서 층별 질량·질량중심을 검산한다',
          '우발편심 분배 결과는 getEccentricStoryLoadDistribution으로 확인한다',
        ],
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
        description: '모델의 하중 케이스 구성(D/L/W/E…)을 읽어 KDS 강도설계 조합과 사용성 조합을 일괄 생성한다. 조합마다 그룹(strength/service/seismic/foundation)이 붙어 결과·설계에서 목적별로 걸러 쓸 수 있고, 특수 조합은 수동으로 추가·수정한다.',
        howTo: [
          '하중 케이스 구성 완료 후 applyKdsLoadCombinations를 실행한다',
          '탄성해석 리본의 [하중조합] 버튼으로 조합표를 확인한다',
          '특수 조합은 addLoadCombination({ id, factors })으로 직접 추가한다',
        ],
        relatedActions: ['applyKdsLoadCombinations', 'openNativeLoadCombinations', 'addLoadCombination', 'updateLoadCombination'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('rule-combinations', '규칙 기반 조합 생성', '방향·부호 규칙으로 조합을 확장 생성 (EX± 등) — 수동 누락 방지.', {
        description: '횡하중의 방향(X/Y)과 부호(±), 우발편심 부호까지 규칙으로 전개해 조합을 자동 생성한다. 사람이 손으로 만들 때 빠지기 쉬운 "반대 부호 조합"이 구조적으로 채워진다.',
        howTo: [
          'applyKdsRuleBasedLoadCombinations를 실행한다',
          '생성 규칙과 조합 수는 getKdsLoadCombinationRules로 확인한다',
          '이어서 조합 누락 감사로 커버리지를 검증한다',
        ],
        relatedActions: ['applyKdsRuleBasedLoadCombinations'],
        relatedReadApis: ['getKdsLoadCombinationRules'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('combination-audit', '조합 누락 감사', '하중케이스 대비 빠진 조합/케이스를 검출하고 기준 registry와 대조.', {
        description: '보유 케이스에 비해 빠진 조합, 조합에 참조됐지만 없는 케이스, 미사용 케이스를 검출한다. 기준식 registry(getKdsLoadStandardRegistry)와 대조한 감사 결과는 계산서에 실려 검토자가 누락 여부를 한눈에 본다.',
        howTo: [
          '조합 생성 후 getKdsLoadCombinationCoverage로 커버리지를 확인한다',
          '경고 항목(누락 조합/케이스)을 해소하거나 사유를 기록한다',
          '기준 근거는 getKdsLoadStandardRegistry/Audit로 조회한다',
        ],
        relatedReadApis: ['getKdsLoadCombinationCoverage', 'getKdsLoadStandardRegistry', 'getKdsLoadStandardAudit'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('envelope', 'Envelope과 지배조합', '부재력/반력/변위의 조합 포락과 demand별 지배조합 추적.', {
        description: '전 조합 해석 결과에서 부재력·반력·변위의 최대/최소 포락을 만들고, 각 demand가 어느 조합에서 나왔는지(지배조합)를 함께 기록한다. 설계 모듈과 일람표는 이 지배조합 정보를 그대로 표기해 "이 값이 어떤 조합의 값인지"가 계산서에서 추적된다.',
        howTo: [
          '조합 생성 후 해석을 실행하면 envelope이 함께 계산된다',
          'getCombinationEnvelopeContract로 그룹별 조합 수와 envelope 감사를 확인한다',
          '결과 패널에서 조합 선택 시 ENVELOPE 항목으로 포락값을 본다',
        ],
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
        description: '3D 프레임 강성법으로 전 조합을 해석해 절점 변위, 부재 단력과 station별 내력, 반력을 만든다. 해석 전 검증 게이트가 오류 모델을 차단하고, 해석 후에는 조합별 힘·모멘트 평형 잔차를 검사하는 audit이 별도로 남아 "해석이 돌았다"와 "결과가 믿을 만하다"를 구분한다.',
        howTo: [
          '모델·하중·조합을 준비하고 해석 실행(runAnalysis)을 누른다',
          '상단 모드 탭 [탄성해석]으로 전환해 조합 선택 후 결과를 본다',
          '해석 설정(반복 허용오차, station 수 등)은 setAnalysisSetting으로 조정한다',
        ],
        relatedActions: ['runAnalysis', 'setAnalysisSetting', 'addAnalysisCase', 'updateAnalysisCase', 'deleteAnalysisCase', 'listAnalysisCases', 'runAnalysisCase', 'runAnalysisCases', 'runAllAnalysisCases', 'getAnalysisCaseResult'],
        relatedReadApis: ['getResults', 'getAnalysisCases', 'listAnalysisCases', 'getAnalysisResults', 'getAnalysisCaseResult'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('analysis-center', 'Analysis Center', 'Phase 5 analysis case workflow for static, modal, RSA, buckling, THA, pushover, and NLTH.', {
        description: 'Analysis Center is the Phase 5 case-based execution panel. It creates analysis cases, stores kind-specific settings, runs one case or all cases, tracks not-run/running/ok/failed/stale status, and reuses result handles for result switching, charts, overlays, and calculation-package output.',
        howTo: [
          'Open Analysis Center and add static, modal, responseSpectrum, buckling, linearTha, pushover, or nlth cases.',
          'Run one case or Run all, then review each case status and failure message.',
          'Use the result case selector and mode/step slider to switch the displayed result without re-running the model.',
          'Open the calculation package and verify executed cases plus not-run cases are listed.',
        ],
        status: 'preliminary',
        limits: ['RSA, pushover, and NLTH display the current preliminary trace scope and limitations instead of hiding them.'],
        relatedActions: [
          'addAnalysisCase', 'updateAnalysisCase', 'deleteAnalysisCase', 'listAnalysisCases',
          'runAnalysisCase', 'runAnalysisCases', 'runAllAnalysisCases',
          'getAnalysisCapabilities', 'validateAnalysisRun', 'planAnalysisRun', 'startAnalysisRun',
          'getAnalysisRunStatus', 'listAnalysisRuns', 'getAnalysisRunResult', 'getAnalysisResultSlice',
          'cancelAnalysisRun', 'retryAnalysisRun', 'getAnalysisRunReport', 'exportAnalysisTelemetry',
        ],
        relatedReadApis: [
          'getAnalysisCases', 'listAnalysisCases', 'getAnalysisResults', 'getAnalysisCaseResult',
          'getCalculationPackage', 'getAnalysisCapabilities', 'validateAnalysisRun', 'planAnalysisRun',
          'startAnalysisRun', 'getAnalysisRunStatus', 'listAnalysisRuns', 'getAnalysisRunResult',
          'getAnalysisResultSlice', 'cancelAnalysisRun', 'retryAnalysisRun', 'getAnalysisRunReport',
          'exportAnalysisTelemetry',
        ],
        manualPage: '02-modeling-and-elastic-analysis.md',
        toggleable: true,
      }),
      feature('validation-gate', '모델 검증 게이트', '오류(중복/기구/참조 깨짐 등)가 있으면 solver 진입을 차단하고, 경고는 계산서에 남긴다.', {
        description: '해석 전에 모델을 검사해 오류(참조 깨진 부재, 지지 없는 모델, 0길이 부재 등)는 해석을 차단하고, 경고(자유 절점, 중복 좌표, 미사용 케이스 등)는 통과시키되 계산서에 표기한다. 리본의 [검증] 버튼으로 언제든 수동 실행할 수 있다.',
        howTo: [
          '탄성해석 리본의 [검증](mValidate)을 눌러 오류/경고 목록을 확인한다',
          '오류 항목을 먼저 해소한다 — 오류가 있으면 해석이 실행되지 않는다',
          '경고는 사유를 확인하고 의도된 것인지 판단한다 (계산서에 그대로 남음)',
        ],
        relatedActions: ['runNativeValidation'],
        relatedReadApis: ['getBaselineContract'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('pdelta', 'P-Delta (2차효과)', 'Direct 접선강성 P-Delta와 비교용 등가하중 반복 결과를 Global/Story/Member/수렴으로 구분해 제공한다.', {
        description: '설계 검토 기본 경로는 축력으로 기하강성을 조립하는 Direct Kt 방식이다. 각 하중조합의 최종 수렴값에서 층 안정성, 최종 2차 부재력과 반력을 산정하고, 1차·2차 전역 횡변위 곡선과 부재 진단값을 분리한다. 등가 횡하중 반복 방식은 비교용 legacy 결과로만 유지한다.',
        howTo: [
          '탄성해석 리본에서 [전체 탄성해석]을 실행한다',
          '결과 그룹의 [P-Delta]를 눌러 우측 결과 팝업을 연다',
          '[전체]와 [층] 탭에서 같은 전역 횡변위 기준의 1차·2차 응답과 층 drift를 비교한다',
          '수직부재를 선택하고 [부재] 탭에서 chord drift, 축력, N/Pcr을 진단한다',
          '[수렴] 탭에서 조합별 load step과 접선강성 수렴 상태를 확인한다',
        ],
        limits: ['Direct P-Delta의 지원 요소·릴리스 범위를 벗어나면 설계 전달을 차단한다. legacy 등가하중 반복 결과는 비교용이며 설계값으로 전달하지 않는다.'],
        relatedActions: ['setNativePDeltaEnabled', 'setNativePDeltaStep', 'setPDeltaStep'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('modal', '고유치(모달) 해석', '고유주기·모드형상·질량참여율.', {
        description: '집중질량 기반 고유치 해석으로 모드별 주기·형상·방향별 질량참여율을 계산한다. 응답스펙트럼과 시간이력의 기초이며, 참여질량 합계가 기준(보통 90%)에 도달하는 모드 수 확인에 쓴다.',
        howTo: [
          '층 질량(또는 절점 질량)을 먼저 생성한다',
          '모달 리포트(showNativeModalReport)를 실행해 주기·참여질량 표를 본다',
          '해석 설정의 모드 수(modalModeCount)를 조정해 참여질량 90%를 확보한다',
        ],
        relatedActions: ['showNativeModalReport'],
        manualPage: '07-nonlinear-analysis.md',
      }),
      feature('response-spectrum', '응답스펙트럼 (RSA)', '스펙트럼 함수 기반 모드 응답 조합 — SRSS/CQC, base shear scaling.', {
        description: '설계 스펙트럼(주기-가속도 표)을 입력해 모드별 응답을 SRSS 또는 CQC로 조합한다. 방향별(X/Y) 밑면전단과 층응답이 산출되고, 등가정적 대비 scaling 근거가 trace로 남는다.',
        howTo: [
          '해석 설정의 responseSpectrum에 스펙트럼 점·감쇠비·방향을 지정한다',
          '모달 해석이 선행되어야 한다 (질량 생성 → 모달 → RSA)',
          '결과의 방향별 층응답과 조합 방법(SRSS/CQC)을 리포트에서 확인한다',
        ],
        limits: ['CQC 상관계수는 일정 감쇠 가정'],
        manualPage: '07-nonlinear-analysis.md',
      }),
      feature('linear-tha', '선형 시간이력', '모드중첩 기반 선형 시간이력 응답 (지반가속도 입력).', {
        description: '지반가속도 기록을 입력해 모드중첩법으로 선형 시간이력 응답을 계산한다. 응답스펙트럼 결과의 교차 검증이나 특정 기록에 대한 응답 확인에 사용한다.',
        howTo: [
          '모달 해석 준비(질량·모드 수)를 완료한다',
          '지반가속도 기록과 시간간격을 지정해 실행한다',
          '최대 응답과 시간이력 곡선을 동적 trace에서 확인한다',
        ],
        status: 'preliminary',
        limits: ['실증(문헌 대조)은 Phase 4 검증 단계 대기 — 결과는 교차 확인 용도로 사용 권장'],
        manualPage: '07-nonlinear-analysis.md',
      }),
      feature('buckling', '선형 좌굴해석', 'K·φ=λ·KG·φ 고유치 좌굴 — 좌굴계수와 모드.', {
        description: '기하강성 기반 고유치 문제로 좌굴계수(λcr)와 좌굴 모드형상을 구한다. 장주·가새의 임계하중 확인과 유효좌굴길이 판단 보조에 쓴다.',
        howTo: [
          '기준 하중조합(축력 상태)을 지정하고 좌굴해석을 실행한다',
          '최저 좌굴계수와 모드형상으로 취약 부재를 확인한다',
        ],
        status: 'preliminary',
        limits: ['탄성 좌굴 — 비탄성 좌굴 강도는 설계 검토식으로 별도 판단'],
        manualPage: '07-nonlinear-analysis.md',
      }),
      feature('elastic-expansion-trace', '탄성 확장 trace', '스프링/침하/트러스/offset/부분하중/온도 등 확장 기능의 적용 내역 추적.', {
        description: '탄성 확장 기능들이 모델 어디에 어떻게 적용됐는지(스프링 계수, 침하량, 활성/비활성 부재, 강역 길이, 하중 구간, 온도값)를 한 계약으로 모아 보여준다. P-Delta·모달·RSA 가정은 고급 탄성 trace로, 동적 완전성(CQC/좌굴/THA)은 동적 trace로 함께 확인한다.',
        howTo: [
          '해석 후 getElasticExpansionTrace로 확장 기능 적용 내역을 조회한다',
          '2차효과·동적 가정은 getAdvancedElasticTrace / getDynamicCompletenessTrace로 본다',
          '계산서 검토 시 이 trace들이 방법·한계 표기의 근거가 된다',
        ],
        relatedReadApis: ['getElasticExpansionTrace', 'getDynamicCompletenessTrace', 'getAdvancedElasticTrace'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('phase10-advanced-elastic', 'Phase 10 고급 탄성해석', 'Timoshenko·부분강접·offset/MPC·변단면·prestress·LTB·shell FEM·슬래브 하중생성을 하나의 추적 가능한 제품 계약으로 제공한다.', {
        description: 'Phase 10에서 추가된 보·구속·동적·shell·하중생성 기능을 Analysis Center, 결과, 보고서, 계산서와 Agent API에 같은 기능명·제한사항으로 노출한다. getPhase10ReleaseStatus는 내부 구현 완료와 외부 교차검증·실장 WebGPU 자격을 분리해 반환하므로, 차단된 기능을 최종 검증 완료로 오인하지 않게 한다.',
        howTo: [
          '모델에서 필요한 Phase 10 요소·구속·하중 옵션을 켜고 Analysis Center에서 해석한다',
          '결과와 계산서의 limitations 및 적용 trace를 확인한다',
          '자동화에서는 getPhase10ReleaseStatus의 release.allowed와 blockers를 반드시 확인한다',
        ],
        status: 'preliminary',
        limits: ['XV-01~10 외부 기준자료가 모두 green이 될 때까지 externally-cross-validated 표시는 금지', '네이티브 WebGPU는 실제 브라우저·GPU 장치 자격이 완료될 때까지 CPU fallback을 유지'],
        relatedReadApis: ['getPhase10ReleaseStatus', 'getResults', 'getDetailedReport', 'getCalculationPackage'],
        manualPage: '02-modeling-and-elastic-analysis.md',
        toggleable: true,
      }),
    ],
  },
  {
    id: 'nonlinear',
    name: '비선형해석',
    summary: '정식 pushover(힌지/변위·arc-length 제어), PMM·fiber, 비선형 시간이력(NLTH).',
    features: [
      feature('pushover', 'Pushover 해석', '소성힌지 기반 비선형 정적 — capacity curve, 힌지 상태 이력, 수렴 로그.', {
        description: '횡하중 패턴을 증분 재하하며 소성힌지의 발생·진전을 추적해 capacity curve(밑면전단-지붕변위)를 만든다. 하중제어/변위제어/arc-length 제어를 지원해 최대 내력 이후 연화 구간도 추적하며, 스텝별 힌지 상태와 수렴 로그가 결과 계약에 남는다.',
        howTo: [
          '상단 모드 탭 [비선형해석]으로 전환하고 pushover 패널을 연다',
          '방향(±X/±Y), 하중 패턴, 스텝 수, 제어 방식을 설정한다(setPushoverOption)',
          'runPushover 실행 → capacity curve와 힌지 분포를 확인한다',
          '보고서는 [비선형 보고](runNativePushoverReport)로 출력한다',
        ],
        status: 'preliminary',
        limits: ['production 내진 성능평가 수준의 외부 대조는 Phase 4 실증(WP-02) 대기', '집중 소성힌지 모델 — 분포 소성 미지원'],
        relatedActions: [
          'runPushover',
          'setPushoverOption',
          'setPushoverPanelOpen',
          'runNativePushoverReport',
          'assignHinge',
          'removeHinge',
          'validateNonlinearCase',
          'createProductionNonlinearCase',
          'previewNonlinearAssignments',
          'applyNonlinearAssignments',
          'startNonlinearRun',
          'pauseNonlinearRun',
          'cancelNonlinearRun',
          'resumeNonlinearRun',
          'retryNonlinearRun',
          'getNonlinearRunStatus',
          'listNonlinearRuns',
          'getNonlinearRunGraph',
          'getNonlinearResult',
          'getNonlinearResultSlice',
          'explainNonlinearFailure',
          'exportNonlinearHistory',
          'getNonlinearReport',
        ],
        relatedReadApis: [
          'runPushover',
          'getHingeAssignments',
          'validateProductionNonlinearCase',
          'createProductionNonlinearCase',
          'previewNonlinearAssignments',
          'getNonlinearRunStatus',
          'listNonlinearRuns',
          'getNonlinearRunGraph',
          'getNonlinearResult',
          'getNonlinearResultSlice',
          'exportNonlinearHistory',
          'explainNonlinearFailure',
          'getNonlinearReport',
        ],
        manualPage: '07-nonlinear-analysis.md',
        toggleable: true,
      }),
      feature('hinges-fiber', '소성힌지와 fiber 단면', 'M-θ backbone 힌지, 축력 연동 PMM 힌지, RC/강재 fiber 모멘트-곡률.', {
        description: '부재 단부의 집중 소성힌지는 재료 라이브러리의 비선형 backbone에서 M-θ 곡선을 만들고, PMM 힌지는 축력 수준에 따라 backbone을 보간한다. fiber 단면은 단면을 섬유로 나눠 재료 σ-ε로 모멘트-곡률을 적분한다 — 힌지 특성 산정의 정밀 경로다.',
        howTo: [
          '재료에 비선형 backbone을 등록한다 (커스텀 재료 참조)',
          '힌지 배정 대상 부재(기둥·보 단부)를 지정한다',
          'pushover/NLTH 실행 후 힌지 상태 이력(항복→극한→잔류)을 결과에서 확인한다',
        ],
        status: 'preliminary',
        limits: ['제하(unloading)는 초기강성 평행 모델', '동시 다힌지 평형의 수계산 대조는 실증 단계 대기'],
        manualPage: '07-nonlinear-analysis.md',
        toggleable: true,
      }),
      feature('nlth', '비선형 시간이력 (NLTH)', 'Newmark-β 직접적분 + Rayleigh 감쇠, 지진파 기록 입력과 scaling trace.', {
        description: '지반가속도 기록을 Newmark-β로 직접 적분하며 스텝 내 Newton-Raphson으로 힌지 비선형 평형을 푼다. Rayleigh 감쇠(두 모드 지정)와 기록 scaling(설계 스펙트럼 맞춤 배율)을 지원하고, scaling 근거가 계산서에 남는다. 발산이 감지되면 스텝을 자동 분할한다.',
        howTo: [
          '힌지/재료 비선형 준비를 완료한다 (소성힌지 항목 참조)',
          '지진파 기록을 선택·업로드하고 방향 배율과 감쇠 목표를 지정한다',
          '실행 후 시간이력 응답(변위/층전단/힌지 상태)과 수렴 로그를 확인한다',
        ],
        status: 'preliminary',
        limits: ['집중 소성 모델 기준 — 분포 소성 미지원', '탄소성 문헌 대조 실증은 Phase 4 검증 대기'],
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
        description: '탄성해석 모드 리본에서 조합을 고르고 결과 토글로 표시 항목을 겹친다: 변형(def), 모멘트(M), 전단(Q), 축력(N), 반력(react), 수치(val), 판정(chk), 절점/부재 번호(nid/mid), 길이(len), 로컬축(axes), 설계(design), 처짐한계(defl). 결과 스케일 슬라이더로 다이어그램 크기를 조절하고, 부재를 클릭하면 상세 내력이 표시된다.',
        howTo: [
          '[탄성해석] 모드에서 조합 콤보(#comboSel)로 볼 조합을 선택한다',
          '결과 토글 버튼(M/Q/N/def/react 등)을 눌러 표시 항목을 켠다',
          '결과 스케일(ssNativeResultScale)로 다이어그램 크기를 조절한다',
          '부재 클릭(showNativeMemberResult)으로 station별 상세 내력을 본다',
        ],
        relatedActions: ['setResultsPanelOpen', 'setResultTab', 'setNativeResultToggle', 'setNativeCombo', 'setNativeResultScale', 'showNativeMemberResult'],
        relatedReadApis: ['getResultView'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('result-overlays', '3D 결과 overlay', '변형도/부재력 다이어그램을 모델 위에 겹쳐 표시, P-Delta 단계 뷰 포함.', {
        description: '해석 결과를 3D 모델 위에 겹쳐 그리는 표시 계층이다. 표시 모드(변형/다이어그램)와 옵션을 전환하고, P-Delta를 켰다면 내부 반복 단계 재생 또는 load-step 결과 표시와 연동할 수 있다.',
        howTo: [
          '결과 표시 상태에서 overlay 모드(setOverlayMode)와 옵션(setOverlayOption)을 전환한다',
          'P-Delta 단계 뷰는 setOverlayPDeltaStep으로 단계를 이동한다',
          '표시 데이터 계약은 getResultVisuals로 읽는다 (에이전트 판독용)',
        ],
        relatedActions: ['setOverlayOption', 'setOverlayMode', 'setOverlayPDeltaStep'],
        relatedReadApis: ['getResultVisuals'],
        manualPage: '02-modeling-and-elastic-analysis.md',
      }),
      feature('analysis-case-results', 'Analysis case results', 'Phase 5 result switching, member ratio legend, SVG charts, and calculation-package reuse.', {
        description: 'Analysis case results reuse stored Phase 5 result handles. The result case selector changes modal, buckling, static, pushover, response-spectrum, and time-history output without re-running. The view exposes member design ratio colors, capacity/time-history/spectrum/modal charts, and the same result details used in the calculation package.',
        howTo: [
          'Run Phase 5 analysis cases from Analysis Center.',
          'Select a result in the result case selector and use the mode/step slider where available.',
          'Review the ratio legend and result charts for capacity, time-history, spectrum, or modal participation output.',
          'Open the calculation package to confirm the selected result handle is included in the report trace.',
        ],
        status: 'preliminary',
        limits: ['Charts summarize the current result handle data and do not replace project-specific engineering review.'],
        relatedActions: ['runAnalysisCase', 'runAnalysisCases', 'runAllAnalysisCases'],
        relatedReadApis: ['getAnalysisResults', 'getAnalysisCaseResult', 'getResultVisuals', 'getCalculationPackage'],
        manualPage: '03-loads-design-and-reports.md',
        toggleable: true,
      }),
      feature('viewer-navigation', '뷰어 탐색', '층 슬라이스, 개체 포커스 이동 등 3D 화면 탐색 도구.', {
        description: '큰 모델에서 특정 층·구간만 보려면 z-슬라이스를 걸고, 특정 절점/부재로 화면을 이동하려면 포커스 기능을 쓴다. 뷰어 상태는 계약으로 노출되어 에이전트가 현재 보이는 범위를 알 수 있다.',
        howTo: [
          'setViewerSlice({ enabled:true, zMin, zMax })로 표시 구간을 제한한다',
          'focusEntity로 특정 개체에 화면을 맞춘다',
          '현재 슬라이스/카메라 상태는 getViewerState로 확인한다',
        ],
        relatedActions: ['setViewerSlice', 'focusEntity'],
        relatedReadApis: ['getViewerState'],
        manualPage: '01-getting-started.md',
      }),
      feature('story-results', '층 결과표', '층 중량/누적 전단/전도/비틀림/층간변위비 표 — 횡력 검토의 기준 표.', {
        description: '조합별 층 결과(층 중량, 층전단 누적, 전도모멘트, 비틀림, 층간변위비)를 표로 만든다. 횡력 저항 시스템 검토와 계산서의 층별 검토 장이 이 표를 사용한다.',
        howTo: [
          '해석 후 getResultPostprocessing의 storyResults에서 층 표를 읽는다',
          '층 구성 확인은 getStorySummary로 한다',
          '계산서 패키지의 층 결과 장에서 동일 표를 확인한다',
        ],
        relatedReadApis: ['getResultPostprocessing', 'getStorySummary'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('member-station-forces', '부재 station 최대력', '부재 내 위치별 N/V/M과 경간 최대값, 지배조합 — 설계 demand의 원천.', {
        description: '부재를 station으로 나눠 위치별 내력을 회복하고, 경간 내 최대 모멘트·전단의 크기/위치/지배조합을 기록한다. 부재 설계는 단부값이 아니라 이 station 최대값을 demand로 쓴다.',
        howTo: [
          '해석 후 결과 패널에서 부재를 클릭해 station 다이어그램을 본다',
          '표 형태는 getResultPostprocessing의 memberStationForces로 읽는다',
          'station 개수는 해석 설정(memberStations)으로 조절한다',
        ],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('foundation-reactions', '기초 반력 envelope', '지점별 max/min 반력과 인발(uplift) 플래그 — 기초 설계 입력.', {
        description: '전 조합에서 지점 반력의 최대/최소와 지배조합을 뽑고, 수직 반력이 인발이 되는 지점에 uplift 플래그를 붙인다. 기초 검토 모듈과 계산서 기초 장의 입력 데이터다.',
        howTo: [
          '해석 후 getResultPostprocessing의 foundationReactions를 확인한다',
          'uplift 지점은 기초 인발 대책(앵커/자중) 검토로 연결한다',
        ],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('drift-serviceability', '층간변위 사용성', '조합별 층간변위비와 허용치 판정.', {
        description: '사용성 조합의 층간변위비를 층별로 계산해 허용치와 비교 판정한다. 결과 토글(defl)로 화면에서도 한계 대비 상태를 볼 수 있고, 계산서 사용성 장에 표로 실린다.',
        howTo: [
          '해석 후 getServiceabilityDriftReport로 층별 변위비·판정을 읽는다',
          '허용 기준은 설계 파라미터에서 조정한다',
        ],
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
        description: 'RC 부재의 휨(소요철근), 전단(스터럽), 기둥 PM 상관, 벽체 pier, 슬래브 검토를 수행하고 배근 일람을 만든다. 각 검토 행에는 적용 조항과 지배조합이 붙어 계산서에서 근거가 추적된다. NG/WARN 항목은 이슈로 자동 등재된다.',
        howTo: [
          '재료(콘크리트/철근)와 부재 역할 배정을 확인한다',
          '해석 후 RC 검토 리포트(getRcDetailedDesignReport)를 생성한다',
          'NG 항목의 지배조합·검토식을 확인하고 단면/배근을 조정해 재검토한다',
        ],
        status: 'preliminary',
        limits: ['수계산 검증서 확충과 최종 조항 선정은 Phase 4 실증(WP-03) 대기', '배근도(도면) 생성은 미지원 — 일람표까지'],
        relatedReadApis: ['getRcDetailingReport', 'getRcDetailedDesignReport'],
        manualPage: '03-loads-design-and-reports.md',
        toggleable: true,
      }),
      feature('steel-design', '철골 설계 검토', '조밀성, 압축좌굴, 휨(LTB), P-M 상관, 가새 검토.', {
        description: '철골 부재의 판폭두께비 분류, 압축재 좌굴강도, 휨재 횡좌굴(LTB, Lb·Cb 반영), 조합력 P-M 상관, 가새(인장/압축) 검토를 수행한다. 지배 한계상태가 행마다 표기되어 어떤 파괴 모드가 결정적인지 바로 보인다.',
        howTo: [
          '강재 재료와 비지지길이(Lb)·유효좌굴계수(K)를 설정한다',
          '해석 후 철골 검토 리포트(getSteelDetailingReport)를 생성한다',
          '지배 한계상태와 검토비(D/C)를 확인하고 단면을 조정한다',
        ],
        status: 'preliminary',
        limits: ['수계산 검증 케이스 확충은 실증 단계 대기'],
        relatedReadApis: ['getSteelDetailingReport'],
        manualPage: '03-loads-design-and-reports.md',
        toggleable: true,
      }),
      feature('connection-foundation', '접합·기초 검토', '볼트/용접/베이스플레이트와 확대기초/매트/말뚝 검토.', {
        description: '접합부(볼트 전단/지압, 용접 목두께, 베이스플레이트 지압·두께·앵커)와 기초(편심 접지압, 1방향/뚫림 전단, 매트 스트립, 말뚝 반력 분배)를 검토한다. demand는 기초 반력 envelope과 부재 단부력에서 자동으로 온다.',
        howTo: [
          '지반 허용지지력 등 기초 조건을 입력한다',
          '해석 후 접합·기초 리포트(getConnectionFoundationReport)를 생성한다',
          '접지압 분포와 인발 지점 대책을 확인한다',
        ],
        status: 'preliminary',
        limits: ['지반 정수는 입력값 — 지반 해석은 범위 외', '수계산 검증 확충은 실증 단계 대기'],
        relatedReadApis: ['getConnectionFoundationReport'],
        manualPage: '03-loads-design-and-reports.md',
        toggleable: true,
      }),
      feature('design-demand', '설계 demand 패키지', '해석 결과에서 부재/기초 demand(지배조합 포함)를 설계 모듈로 전달하는 계약.', {
        description: '부재별 지배 N/V/M(발생 위치·조합 포함)과 지점별 반력 envelope을 설계 모듈 공통 입력으로 묶는다. 모든 설계 검토 행은 이 demand trace ID로 역추적되어 "설계값이 어느 해석값에서 왔는지"가 끊기지 않는다.',
        howTo: [
          '해석 후 getDesignDemandPackage로 부재/기초 demand를 확인한다',
          '부재별 검토-해석 연결은 getMemberDesignTraceReport로 역추적한다',
        ],
        relatedReadApis: ['getDesignDemandPackage', 'getMemberDesignTraceReport'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('integrated-design-report', '통합 설계 리포트', '설계 모듈 전체를 묶은 통합 결과와 일람.', {
        description: 'RC/철골/접합/기초 검토를 한 화면과 한 계약으로 통합해 부재 일람표를 만든다. 리본의 [설계요약] 버튼이 요약 화면을 열고, 통합 결과 계약은 계산서 설계 장의 원본 데이터가 된다.',
        howTo: [
          '탄성해석 리본의 [설계요약](openNativeDesignReport)을 연다',
          '전체 통합 데이터는 getP3DetailedDesignReport / getP3IntegratedResults로 읽는다',
          'NG 부재를 수정하고 재해석→재검토 사이클을 돈다',
        ],
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
        description: '모델 요약, 하중 산정 trace, 조합, 해석 결과, 설계 검토를 한 문서로 출력한다. 모든 산정값에 근거(기준식 ID·입력값)가 병기되어 검토자가 값의 출처를 문서 안에서 추적할 수 있다.',
        howTo: [
          '해석 완료 후 상세 보고서(openNativeDetailedReport)를 연다',
          '브라우저 인쇄(PDF 저장)로 파일화한다',
          '데이터 계약은 getDetailedReport / getReport로 읽는다 (자동화·검증용)',
        ],
        relatedActions: ['openNativeDetailedReport'],
        relatedReadApis: ['getReport', 'getDetailedReport'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('calculation-package', '계산서 패키지', '실무 목차 기반 계산서 — 미검토 장은 숨기지 않고 not checked로 표기.', {
        description: '구조계산서 표준 목차(개요/재료/하중/해석/부재 설계/기초…)로 장을 구성한 제출용 문서다. 수행하지 않은 검토는 장을 빼는 대신 "not checked"로 명시해 누락이 숨겨지지 않는다. 실무 검증 리포트와 이슈 목록이 부록으로 붙는다.',
        howTo: [
          '해석·설계 검토 완료 후 계산서 패키지(openNativeCalculationPackage)를 연다',
          'not checked 장을 확인하고 필요한 검토를 보강한다',
          '최종본을 인쇄(PDF)하고 검토자 승인 워크플로로 넘긴다',
        ],
        relatedActions: ['openNativeCalculationPackage'],
        relatedReadApis: ['getCalculationPackage'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('practice-validation', '실무 검증 리포트', 'P-Delta/결과표/계산서 준비 상태를 점검하고 warning/NG를 이슈로 남긴다.', {
        description: '해석·설계 결과가 검토 가능한 상태인지(P-Delta 수렴, 결과표 생성, trace 연결, 설계 NG 존재 여부)를 자동 점검하고 상태(OK/WARN/NG)를 준다. 발견된 warning/NG는 이슈 레지스트리에 open 상태로 쌓여 resolve/accept 처리 전까지 남는다. 리본의 [제품 감사]로 수동 실행할 수 있다.',
        howTo: [
          'runNativeProductAudit 또는 계산서 생성 시 자동 실행된다',
          'getPracticeValidationReport에서 상태와 open 이슈 수를 확인한다',
          '이슈를 하나씩 resolve(수정) 또는 accept(사유 기록)로 닫는다',
        ],
        relatedActions: ['runNativeProductAudit'],
        relatedReadApis: ['getPracticeValidationReport', 'getPracticePlatformReadiness', 'getPilotProjectValidation'],
        manualPage: '03-loads-design-and-reports.md',
      }),
      feature('quality-audit', '완성도·마일스톤 감사', '기능별 proven/preliminary 상태와 exit criteria를 코드가 스스로 보고 — 출시 게이트의 근거.', {
        description: '개발 마일스톤별 완성 수준(proven=계약 테스트로 입증 / preliminary=실증 대기)과 남은 한계를 프로그램이 스스로 보고한다. 사용자는 어떤 기능이 어느 신뢰 수준인지 이 감사로 확인할 수 있고, 출시 게이트(launch readiness)가 이 상태를 근거로 판정한다.',
        howTo: [
          'getPhase3CompletionAuditReview로 마일스톤별 상태를 확인한다',
          '영역별 상세는 elastic/nonlinear/design/import 등 개별 review API로 본다',
          '출시 판정 요약은 getLaunchReadinessReport로 확인한다',
        ],
        relatedReadApis: [
          'getLaunchReadinessReport', 'getPhase3CompletionAuditReview', 'getPhase3PlanAlignment',
          'getPhase3DesignMilestoneReview', 'getPhase3DrawingImportValidationReview', 'getPhase3EngineeringValidationReview',
          'getPhase3ElasticMilestoneReview', 'getPhase3ImportMilestoneReview', 'getPhase3NonlinearMilestoneReview',
          'getPhase3PointCloudValidationReview', 'getPhase3PracticeValidationReview', 'getPhase3ProductizationMilestoneReview',
          'getPhase3OwnerSignoffReview', 'getPhase3EvidenceRegister',
        ],
        manualPage: 'STATUS_AND_LIMITS.md',
      }),
      feature('final-use-release-review', 'Final-use release review', 'Post-Phase 5 gate that composes practice validation, evidence register, owner sign-off, and launch readiness.', {
        description: 'A single read-only review for deciding whether the completed Phase 5 workflow is still blocked from final structural-office use by missing project evidence, owner sign-off, or deployment approval.',
        howTo: [
          'Read getFinalUseReleaseReview before any final-use automation',
          'Inspect summary.blockingReviews and summary.missing',
          'Treat FINAL_USE_APPROVED as valid only when productionReady is true',
        ],
        relatedReadApis: [
          'getFinalUseReleaseReview',
          'getLaunchReadinessReport',
          'getPhase3PracticeValidationReview',
          'getPhase3OwnerSignoffReview',
          'getPhase3EvidenceRegister',
        ],
        manualPage: 'STATUS_AND_LIMITS.md',
      }),
      feature('evidence-register', '증빙 등록', '실증 증빙(검증서/실측 리포트)을 프로젝트에 등록해 감사가 읽게 한다.', {
        description: '수계산 검증서, 상용 대조표, 실측 리포트, 승인 기록 같은 증빙을 프로젝트에 등록하면 완성도 감사와 owner 서명 검토가 이를 읽어 상태를 갱신한다. "무엇이 어디까지 입증됐는지"의 장부 역할.',
        howTo: [
          'submitProjectEvidence로 증빙(유형/경로/설명)을 등록한다',
          'listProjectEvidence로 등록 현황을 조회한다',
          '감사 review에서 요구 증빙의 충족 여부를 확인한다',
        ],
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
        description: 'DXF의 LINE/POLYLINE/INSERT 등을 파싱해 끝점 병합(tolerance merge) 후 수직=기둥/수평=보/경사=가새 후보로 분류한다. layer 이름은 단면·재료 매핑 테이블의 초안이 되고, 단위($INSUNITS)와 좌표가 자동 정규화되며 의심 항목은 audit에 남는다. 자동 인식은 어디까지나 후보 — 확정 없이는 모델이 되지 않는다.',
        howTo: [
          '프로젝트 파일 업로드로 .dxf를 올린다',
          '후보 생성 후 검토 화면(#/p/:id/import/:jobId)에서 층/부재 후보를 확인한다',
          'layer 매핑 패널에서 단면/재료를 지정하고, 후보를 확정/수정/거부한다',
          '확정하면 validation을 거쳐 모델이 생성된다 — 이어서 하중·해석으로 진행',
        ],
        limits: ['바이너리 DXF 미지원 (ASCII로 저장 필요)', '치수·문자 기반 단면 자동 인식은 layer 매핑을 보조하는 수준'],
        manualPage: '04-import-drawings.md',
        toggleable: true,
      }),
      feature('plan-recognition', '2D 평면 인식', '층별 평면 도면에서 grid/기둥/보를 인식하고 층고와 조립해 3D 모델 생성.', {
        description: '층별 2D 구조평면에서 축선(grid)과 라벨, 기둥 심볼(원/사각/블록), 보 중심선을 인식하고, 층고 입력과 결합해 여러 장의 평면을 3D 골조로 조립한다. 인식률은 도면 작도 스타일에 좌우되므로 검토 화면 보완을 전제로 한다.',
        howTo: [
          '층별 평면 DXF를 업로드하고 평면 인식 모드로 후보를 생성한다',
          '층고표를 입력해 평면들을 z방향으로 조립한다',
          '인식 누락 부재를 검토 화면에서 추가·수정한 뒤 확정한다',
        ],
        status: 'preliminary',
        limits: ['정형 작도(축선 layer 분리, 표준 심볼) 기준 인식률 — 비정형 도면은 수동 보완 비중 증가'],
        manualPage: '04-import-drawings.md',
        toggleable: true,
      }),
      feature('dwg-conversion', 'DWG 변환', 'ODA File Converter 연동으로 DWG→DXF 자동 변환. 변환기 부재 시 안내 UX.', {
        description: 'DWG는 사유 포맷이라 직접 파싱하지 않고 무료 배포되는 ODA File Converter를 호출해 DXF로 변환한 뒤 표준 파이프라인을 태운다. 변환기 경로가 설정되지 않은 환경에서는 명확한 안내(설치 방법 또는 CAD에서 DXF로 저장)를 보여준다.',
        howTo: [
          'ODA File Converter를 설치하고 설정에 실행 경로를 지정한다',
          '.dwg 업로드 시 자동 변환 → DXF 파이프라인으로 이어진다',
          '변환기가 없으면 안내에 따라 CAD에서 DXF(ASCII)로 저장해 업로드한다',
        ],
        status: 'preliminary',
        limits: ['외부 변환기 의존 — 실무 도면 e2e 실증은 WP-04 대기'],
        manualPage: '04-import-drawings.md',
        toggleable: true,
      }),
      feature('import-review', '가져오기 검토·확정', '후보(층/그리드/부재)를 confidence와 함께 3D overlay로 검토 — 확정 전에는 모델이 되지 않는다.', {
        description: '모든 import(도면/점군)는 후보 목록과 confidence, audit(미매핑·고아 절점·단위 의심)을 보여주는 검토 화면을 거친다. 목록 선택과 3D 하이라이트가 양방향 연동되고, 확정/거부 이력은 서버에 남아 누가 무엇을 승인했는지 추적된다. validation을 통과해야 모델 생성 버튼이 활성화된다.',
        howTo: [
          '#/p/:id/import/:jobId 화면에서 후보 목록과 3D overlay를 함께 본다',
          '항목별로 확정/수정/거부를 지정한다 (낮은 confidence는 기본 해제)',
          'audit 패널의 경고(미매핑 layer 등)를 해소하고 "모델 생성"을 누른다',
        ],
        relatedReadApis: ['listImportCandidates', 'resolveImportCandidate', 'confirmImport', 'rejectImport'],
        manualPage: '04-import-drawings.md',
      }),
      feature('pointcloud-load', '점군 로드·뷰어', 'XYZ/PLY/PCD/LAS 로드, voxel 다운샘플, 이상점 제거, WebGL2 점군 뷰어(슬라이스).', {
        description: '스캔 점군 파일을 스트리밍 파싱해 voxel 다운샘플과 통계적 이상점 제거를 거쳐 WebGL2 뷰어에 올린다. 무거운 전처리는 Web Worker에서 돌아 화면이 멈추지 않고, z-슬라이스로 층 단위 단면을 확인할 수 있다.',
        howTo: [
          '프로젝트에 점군 파일(.ply/.xyz/.pcd/.las)을 업로드한다',
          '로드 후 뷰어에서 회전/줌과 z-슬라이스로 스캔 상태를 확인한다',
          '이어서 구조 추출을 실행해 후보를 만든다',
        ],
        status: 'preliminary',
        limits: ['LAZ/E57은 미지원 — CloudCompare 등으로 변환 후 사용', '대용량(1e7점) 성능 실측은 실증 단계 대기'],
        manualPage: '05-import-pointcloud.md',
        toggleable: true,
      }),
      feature('pointcloud-detect', '점군 구조 추출', 'z-히스토그램+RANSAC 층 검출, 클러스터 기둥/보/벽 검출 → 현황 모델 후보.', {
        description: 'z-히스토그램 피크와 수평면 RANSAC으로 층(슬래브)을 찾고, 층 사이 점을 xy로 투영·클러스터링해 기둥을, 천장 하부 선형 클러스터로 보를, 수직 평면으로 벽을 검출한다. 각 후보에 confidence와 근거(지지 점 수·잔차)가 붙어 검토 화면으로 넘어간다. 리모델링·안전진단의 현황 모델 작성이 목적이다.',
        howTo: [
          '점군 로드 후 구조 추출을 실행한다 (Worker에서 진행률 표시)',
          '검토 화면에서 층 elevation과 기둥/보/벽 후보를 점군 위에 겹쳐 확인한다',
          '누락 부재를 수동 추가하고 오검출을 거부한 뒤 확정한다',
        ],
        status: 'preliminary',
        limits: ['실측 스캔 검증은 WP-04 대기 — 자동 검출은 보조 도구이며 확정은 사람이 한다', '가구·설비가 많은 스캔은 오검출 증가'],
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
        description: 'AI(또는 외부 자동화)가 프로그램을 조작하는 공식 표면이다. getSnapshot/getModel/getScreenState로 현재 상태를 읽고, setModel과 78개 실행 액션으로 조작하며, getCapabilities가 사용 가능한 전체 목록과 모듈 버전을 알려준다. 계약은 버전으로 관리되어 UI가 바뀌어도 자동화가 깨지지 않게 유지된다.',
        howTo: [
          'getCapabilities()로 사용 가능한 액션/읽기 API 목록을 확인한다',
          '상태 판독은 getSnapshot/getScreenState, 모델 교체는 setModel을 사용한다',
          '문제 진단은 getRuntimeDiagnostics로 런타임 상태를 읽는다',
          '전체 규약과 예시는 AI_AGENT_GUIDE.md와 agent-contract.json을 참조한다',
        ],
        relatedActions: ['setModel'],
        relatedReadApis: ['getSnapshot', 'getModel', 'getScreenState', 'getRuntimeDiagnostics', 'getCapabilities'],
        manualPage: 'AI_AGENT_GUIDE.md',
      }),
      feature('agent-command-bridge', '커맨드 브리지', 'DOM 이벤트/postMessage/URL 해시 3경로로 외부에서 액션 실행 — iframe 모델러 호스트도 이 경로 사용.', {
        description: '외부 컨텍스트(부모 창, 확장, 스크립트)에서 액션을 실행하는 3가지 채널: DOM CustomEvent, window.postMessage, URL 해시 명령. 앱 셸의 iframe 모델러 호스트도 이 브리지로 저장 명령을 전달하므로, 자동화와 실제 UI가 같은 경로를 공유한다.',
        howTo: [
          '같은 문서에서는 sstructures:agent-command CustomEvent를 dispatch한다',
          'iframe/팝업 간에는 window.postMessage로 같은 페이로드를 보낸다',
          '링크 진입 시 1회 실행은 URL 해시 #sstructures-command=…를 사용한다',
        ],
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
        description: '서버는 config.json 파일과 환경변수(PORT, S_STRUCTURES_DATA_DIR 등)로 설정한다 — 우선순위는 환경변수 > 파일 > 기본값. 데이터 폴더에는 lockfile이 걸려 같은 폴더로 두 프로세스를 띄우면 명확한 오류로 거부된다(무경고 데이터 손상 방지). 사내 배포 시 첫 관리자 가입 후 allowRegistration을 꺼 초대제로 전환하는 절차를 권장한다.',
        howTo: [
          'config.sample.json을 config.json으로 복사해 포트/데이터 경로를 수정한다',
          'node server/main.mjs로 기동하고 /api/health로 상태를 확인한다',
          '가입 정책 변경 시 allowRegistration 수정 후 재기동한다',
        ],
        manualPage: '00-install.md',
      }),
      feature('backup-restore', '백업·복구', 'tools/backup-data.mjs로 실행 중 안전 백업과 무결성 검증(--verify).', {
        description: '데이터 폴더(계정/프로젝트/리비전/업로드) 전체를 스냅샷 백업하고 해시 manifest로 무결성을 검증한다. 서버 실행 중에도 안전하게 백업되며, 복구는 폴더 교체 방식이다. secret.key는 유출 시 전 세션 위조가 가능하므로 별도 보안 보관을 권장한다.',
        howTo: [
          '정기 백업: npm run backup:data (또는 node tools/backup-data.mjs --out <경로>)',
          '백업 검증: --verify 옵션으로 manifest 해시를 확인한다',
          '복구: 서버 중지 → 기존 data를 보존 이동 → 백업본 복사 → 재기동 (runbook §3)',
        ],
        manualPage: '00-install.md',
      }),
      feature('license', '라이선스 키', '오프라인 서명 검증 방식 라이선스 v1 (발급 스크립트 별도).', {
        description: '서명된 라이선스 페이로드(플랜/사용자/만료)를 서버가 공개키로 오프라인 검증한다. 발급은 개인키를 가진 관리 스크립트(tools/issue-license.mjs)로만 가능하고, 위조·만료 키는 검증에서 거부된다.',
        howTo: [
          '발급자가 issue-license 스크립트로 키 파일을 생성해 전달한다',
          '서버 데이터 폴더에 라이선스 키를 배치한다',
          '기동 로그/메타에서 라이선스 인식 상태를 확인한다',
        ],
        status: 'preliminary',
        limits: ['미등록 시 동작(평가 모드 정책)은 출시 전 오너 확정 대기'],
        manualPage: '00-install.md',
        toggleable: true,
      }),
      feature('audit-log', '감사 로그', '로그인 실패/권한 거부/승인·멤버 변경을 append-only JSONL로 기록.', {
        description: '보안·책임 추적 이벤트(로그인 실패, 403 권한 거부, 승인 상태 변경, 멤버 역할 변경, 전체 로그아웃)가 data/audit.log에 시각·행위자와 함께 누적된다. 침해 조사와 승인 이력 증빙에 사용하며, 기록에는 비밀번호·토큰이 포함되지 않는다.',
        howTo: [
          '사고/분쟁 시 data/audit.log를 시간순으로 확인한다',
          '백업 정책에 audit.log를 포함한다',
        ],
        manualPage: '08-collaboration.md',
      }),
      feature('release-build', '배포 빌드', 'tools/build-release.mjs 단일 명령으로 배포 폴더+zip+SHA256 생성.', {
        description: '실행에 필요한 파일만 추려 배포 폴더를 만들고 zip과 SHA256 체크섬, 빌드 manifest를 생성한다. 수작업 단계가 없어 누가 빌드해도 같은 구성이 나오며, 버전은 package.json과 동기화 테스트로 잠겨 있다.',
        howTo: [
          'npm run build:release를 실행한다',
          'output/release/의 zip과 .sha256을 배포 채널로 전달한다',
          '설치는 runbook(00-install)의 절차를 따른다',
        ],
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
      if (!item.howTo || item.howTo.length < 2) errors.push(`Feature needs at least 2 howTo steps: ${item.id}`);
      if (!item.description || item.description === item.summary) errors.push(`Feature needs a real description (not the summary): ${item.id}`);
      if (item.status === 'preliminary' && (!item.limits || item.limits.length === 0)) {
        errors.push(`Preliminary feature must state its limits: ${item.id}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
