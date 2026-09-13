import {STEEL_TEST_INPUT_MAP} from '../materials/steelTestEvidence.js';
import {parseDifferentialPeers} from '../metadata/differentialPeers.js';
import {parseSecondaryCompressionLayers} from '../metadata/secondaryCompressionLayers.js';
import {parseConsolidationStages} from '../metadata/consolidationStages.js';
import {parseConsolidationLayers} from '../metadata/consolidationLayers.js';
import {parseSettlementLayers} from '../metadata/settlementLayers.js';
import {parseBarLayerGroups} from '../metadata/barLayerGroups.js';
import {REBAR_CATALOG_ID,expandRebarCatalogInput} from '../materials/rebarProductCatalog.js';
const text=(key,label,required=true)=>({key,label,kind:'text',required});
const number=(key,label,unit,required=true,min=0,max=1e9)=>({key,label,kind:'number',unit,required,min,max});
const select=(key,label,values,required=true)=>({key,label,kind:'select',values,required});
const base=[text('id','재료 ID'),text('name','이름'),{...number('version','버전','-',true,1,1000000),integer:true},select('kind','재료 종류',['steel','concrete','timber','masonry'])];
const elastic=[number('E','탄성계수 E','MPa'),number('G','전단탄성계수 G (등방성은 생략 시 계산)','MPa',false),number('nu','포아송비','-',true,-0.99,0.499),number('density','밀도','t/m3')];
const source=[text('sourceReference','규격·근거 자료'),text('edition','판본 또는 시험 자료 버전'),text('sourceNote','출처·가정 설명'),select('basisStatus','입력 근거 상태',['assumed','specified']),text('product','제품 형식'),text('grade','등급·강도 구분')];
const material={
  steel:[text('testReportProduct','성적서에 기재된 제품 종류',false),text('testReportGrade','성적서에 기재된 등급',false),...['testReportReference','testReportSha256','testReportBatch','testReportEdition','testReportDate'].map(key=>text(key,{testReportReference:'시험성적서 근거 경로·URL',testReportSha256:'성적서 SHA-256 (진본 확인 별도)',testReportBatch:'시험 대상 배치·히트 번호',testReportEdition:'시험 규격·판본',testReportDate:'시험일 YYYY-MM-DD'}[key],false)),number('testReportSize','시험 대상 제품 치수 (철근 직경/강재 두께)','mm',false,.001,10000),number('testedYieldStrength','시험 항복강도 (설계값 별도)','MPa',false,.001,10000),number('testedTensileStrength','시험 인장강도 (설계값 별도)','MPa',false,.001,10000),{...number('testedElongation','시험 연신율 (연성 적합성 별도)','%',false,0,100),allowZero:true},number('Fy','항복강도','MPa'),number('Fu','인장강도','MPa'),number('thickness','강도 적용 판두께 (제품 rebar는 생략)','mm',false)],
  concrete:[{...number('creepAttachmentCoefficient','부착 재령의 지정 크리프 계수','-',false,0,100),allowZero:true},number('creepAttachmentAgeDays','비구조요소 부착 재령','day',false),text('creepAttachmentReference','부착 재령 계수 근거',false),{...number('attachmentShrinkageMicrostrain','재하~부착 재령의 자유수축','με',false,0,20000),allowZero:true},text('attachmentShrinkageReference','부착 재령 수축 근거',false),number('fck','콘크리트 압축강도','MPa'),{...number('creepCoefficient','지정 크리프 계수 (관련 재령·탄성계수·근거 함께 입력)','-',false,0,100),allowZero:true},number('creepLoadingAgeDays','지속하중 재하 재령','day',false),number('creepEvaluationAgeDays','크리프 평가 재령','day',false),number('creepElasticModulusAtLoading','재하 시점 콘크리트 탄성계수','MPa',false),text('creepReference','해당 재령 크리프 계수의 산정·시험 근거',false),{...number('shrinkageMicrostrain','재하~평가 재령의 지정 자유수축 (양수 크기)','με',false,0,20000),allowZero:true},text('shrinkageReference','해당 재령 구간 자유수축 산정·시험 근거',false)],
  timber:[number('G','섬유방향 전단탄성계수','MPa'),number('E90','섬유 직각 탄성계수','MPa'),text('species','수종'),number('moisture','함수율','%',true,0,100),select('serviceClass','사용환경',['dry','wet']),text('durationClass','하중 지속 조건'),select('analysisAssumption','해석 이상화',['frame-longitudinal']),...['fb','ft0','fc0','fc90','fv'].map(key=>number(key,{fb:'휨강도',ft0:'섬유방향 인장강도',fc0:'섬유방향 압축강도',fc90:'섬유 직각 압축강도',fv:'전단강도'}[key],'MPa'))],
  masonry:[number('fm','조적체 압축강도','MPa'),text('unitType','조적 유닛'),text('mortar','모르타르'),text('grout','그라우트/무충전 설명'),{key:'reinforced',label:'보강 조적 여부',kind:'boolean',required:true}],
};
const shapes={RECT:['B','H'],SQUARE:['B'],H:['B','H','tw','tf'],BOX:['B','H','t'],PIPE:['D','t'],CIRC:['D']};
const ids=(key,label)=>({key,label,kind:'ids',required:true});
const detailBase=[...base.slice(0,3),text('sourceNote','입력 근거')];
const detailFields={
  'splice-record':[...detailBase,{key:'locked',label:'자동 변경 금지',kind:'boolean',required:false},text('memberId','Member ID'),text('reinforcementId','Reinforcement ID@version'),ids('barIndices','Bar numbers (1-based)'),{...number('start','Splice start fraction','-',true,0,1),allowZero:true},number('end','Splice end fraction','-',true,0,1),{...number('offsetY','Additional bar local y offset','m',true,-10,10),allowZero:true},{...number('offsetZ','Additional bar local z offset','m',true,-10,10),allowZero:true},select('spliceType','Lap type',['tension-A','tension-B','compression-with-tension-envelope']),select('spliceSystem','Detailing system',['ordinary-no-seismic-detail']),select('continuationSide','이음 추가 철근의 연속 방향',['offset-toward-start','offset-toward-end'],false),number('transferStiffness','철근쌍 등가 분포 전달강성 (시험·산정 근거 필요)','kN/m2',false),number('transferElasticSlipLimit','입력 전달강성의 탄성 미끄럼 한계','m',false),text('transferReference','등가 전달강성·탄성 한계 산정 근거',false)],
  'design-profile-record':[...base.slice(0,3),select('structuralSystem','RC 구조 시스템',['ordinary-rc-frame','intermediate-rc-frame','special-rc-frame']),select('construction','시공 형식',['cast-in-place']),select('concreteWeight','콘크리트 종류',['normal']),select('sectionScope','단면·배근 범위',['rectangular-single-bars']),select('stiffnessBasis','강성 적용 범위',['gross-section-only']),ids('requiredFamilies','적용 하중군'),{...ids('excludedFamilies','제외 하중군'),required:false},ids('confirmedCaseIds','값과 근거를 검토한 하중 케이스 ID'),text('decisionReference','하중 적용·제외 판단 근거'),text('loadScopeHash','실무설계 상태 조회의 loadScopeHash'),text('rulePackHash','현재 규칙 카탈로그 해시')],
  'reinforcement-record':[...detailBase,text('memberId','부재 ID'),{...number('start','구간 시작 (부재 길이 비율)','-',true,0,1),allowZero:true},number('end','구간 끝 (부재 길이 비율, 끝 제외·1은 포함)','-',true,0,1),number('cover','피복','m'),text('barMaterialId','철근 재료 ID@버전'),{key:'bars',label:'주근 각 행: y(m), z(m), 직경(mm); 공칭 입력은 면적(mm²), 제품명 추가',kind:'bars',required:true},number('stirrupDiameter','스터럽 직경','mm',false),{...number('stirrupLegs','스터럽 다리 수','-',false,2,20),integer:true},number('stirrupSpacing','스터럽 간격','mm',false),number('anchorageLength','정착길이','m',false),number('lapLength','이음길이','m',false),number('hookAngle','후크 각도','deg',false,0,180),{key:'locked',label:'자동 변경 금지',kind:'boolean',required:false}],
  'connection-record':[...detailBase,text('nodeId','접합 절점 ID'),ids('memberIds','연결 부재 ID (쉼표 구분)'),select('connectionType','접합 형식',['rc-joint','rc-anchorage','steel','timber','masonry']),select('restraint','해석 연결 가정',['rigid','pinned','semi-rigid']),number('rotationalStiffness','회전강성','kN.m/rad',false),number('jointWidth','접합부 폭','m',false),number('jointDepth','접합부 깊이','m',false),text('barMaterialId','접합 철근 ID@버전',false),number('tieDiameter','구속철근 직경','mm',false),number('tieSpacing','구속철근 간격','mm',false),{...number('tieLegs','구속철근 다리 수','-',false,2,20),integer:true},number('anchorageLength','정착길이','m',false)],
  'ground-record':[...detailBase,number('allowableBearing','허용지지력','kPa'),select('bearingBasis','지지력 정의',['net','gross']),{...number('friction','마찰계수','-',false,0,1),allowZero:true},number('settlementLimit','허용침하','m',false),number('subgradeModulus','지반반력계수','kN/m3',false),number('groundwaterDepth','지하수위 깊이','m',false,-1000,10000),text('sourceReference','지반 근거 자료'),select('basisStatus','입력 근거 상태',['assumed','specified'])],
  'foundation-record':[...detailBase,text('nodeId','지점 절점 ID'),select('foundationType','기초 형식',['isolated']),number('B','기초 폭','m'),number('L','기초 길이','m'),number('thickness','기초 두께','m'),number('cover','기초 피복','m'),text('materialId','콘크리트 ID@버전'),text('groundId','지반 ID@버전'),text('barMaterialId','기초 철근 ID@버전',false),number('bottomDiameterB','하부 B방향 철근 직경','mm',false),number('bottomDiameterL','하부 L방향 철근 직경','mm',false),number('bottomSpacingB','하부 B방향 철근 간격','mm',false),number('bottomSpacingL','하부 L방향 철근 간격','mm',false)],
};
for(const type of ['reinforcement-record','connection-record','foundation-record']){
 const roles=type==='reinforcement-record'?['bar','stirrup']:['bar'];
 for(const role of roles)detailFields[type].push(text(`${role}Product`,`${role==='bar'?'주근·배근':'스터럽'} 실제 사용 제품 종류`,false),text(`${role}Batch`,`${role==='bar'?'주근·배근':'스터럽'} 실제 사용 배치·heat 번호`,false),text(`${role}BatchReference`,`${role==='bar'?'주근·배근':'스터럽'} 제품·배치 배정 근거`,false));
}
detailFields['foundation-record'].push({...number('footprintClearance','등록된 인접 기초와 최소 평면 이격 (0도 겹침 금지)','m',false),allowZero:true},text('footprintClearanceReference','평면 이격 적용·허용 기준 근거',false));
detailFields['foundation-record'].push(number('footprintLimitB','현재 위치·방향에서 허용 기초 B 치수','m',false),number('footprintLimitL','현재 위치·방향에서 허용 기초 L 치수','m',false),text('footprintLimitReference','허용 치수의 배치·건축 검토 근거',false));
detailFields['foundation-record'].push(select('differentialSettlementBasis','기초간 침하 비교 기준',['primary-ultimate','at-evaluation-time'],false),{...ids('differentialPeerIds','비교 기초 ID@버전 (최대50)'),required:false},number('differentialSettlementLimit','허용 부등침하','m',false),number('differentialRotationLimit','허용 각변위 (침하차/지점거리)','m/m',false,0,1),text('differentialReference','비교대상·허용기준·공통시간원점 근거',false));
detailFields['reinforcement-record'].push(
 {...ids('barLayerGroups','명시적 주근 층·측면 역할 (예: bottom-1:1/2, top-1:3/4, side-left:5)'),required:false},
 select('stabilityStandard','압축부재 안정성 기준',['KDS-142020-2022'],false),
 select('stabilitySystem','횡구속 시스템 분류',['braced-column'],false),
 select('secondOrderStiffnessStandard','탄성 2차 해석 단면강성 기준',['KDS-142020-2022'],false),
 {...number('lateralSustainedRatio','층 최대 계수지속전단력 / 최대 계수전단력','-',false,0,1),allowZero:true},
 text('lateralSustainedReference','층 횡방향 지속하중 비율 산정 근거',false),
 text('stabilityClassificationReference','횡구속 판정 근거',false),
 select('torsionStandard','비틀림 검토 기준',['KDS-142022-2022'],false),
 select('torsionDesignMode','비틀림 배근 검토',['solid-rectangular-45deg'],false),
 select('torsionHookCorner','비틀림 후크 정착 모서리',['+y+z','+y-z','-y+z','-y-z'],false),
 number('torsionLongitudinalFraction','각 주근에서 비틀림에 배정할 면적 비율','-',false,.001,.999),
 select('crackControlStandard','균열 제어 기준',['KDS-142020-2022','KDS-142030-2021-appendix'],false),
 select('crackWidthEnvironment','균열폭 내구성 환경',['dry','wet','corrosive','highly-corrosive'],false),
 number('crackEffectiveTensileStrength','균열 검토 재령의 유효인장강도','MPa',false,0,100),
 text('crackTensileStrengthReference','유효인장강도·재령 산정 또는 시험 근거',false),
 number('crackEvaluationFactor','균열폭 평가계수 (평균 1.0 / 최대 1.7)','-',false,1,10),
 text('crackSustainedLoadReference','설계수명 중 지속하중 선택 근거',false),
 select('crackEnvironment','균열 제어 환경',['dry','other'],false),
 select('crackSpecialRequirements','균열 특별 요구',['ordinary-no-special-water-or-appearance'],false),
 {key:'temperatureReinforcementRequired',label:'온도·수축 추가 보강 필요',kind:'boolean',required:false},
 select('confinementStandard','일반 기둥 띠철근 검토 기준',['KDS-142050-2022'],false),
 select('anchorBoltTieEnd','앵커볼트 추가 띠를 검토할 부재 끝',['start','end','both'],false),
 {...ids('crossTieBarPairs','크로스타이 양단 철근 번호 쌍 (예: 2:6,4:8)'),required:false},
 {...ids('crossTieHookSides','크로스타이 본체 방향 (각 쌍의 y-z 방향 기준 left/right)'),required:false,unique:false},
 {...ids('crossTiePlaneOffsets','크로스타이 배치 높이 (띠 위치 기준 m, 쌍별 숫자 문자열)'),required:false,unique:false},
 select('confinementSystem','띠철근 적용 시스템',['ordinary-tied-column','ordinary-flexural-member'],false),
 select('tieClosure','띠철근 폐합 후크',['standard-135'],false),
 select('tieClosureCorner','외곽 띠 폐합 모서리',['+y+z','+y-z','-y+z','-y-z'],false),
 {...number('tieClosureSeparation','외곽 띠 양단 접선점 높이 차이','m',false,0,1),allowZero:true},
 number('tieHookTail','띠철근 후크 꼬리 길이','m',false),
 number('tieBendInsideRadius','띠철근 구부림 내면 반지름','m',false),
 {...number('tieFirstStart','시작 접합면에서 첫 띠철근 거리','m',false),allowZero:true},
 {...number('tieFirstEnd','종료 접합면에서 첫 띠철근 거리','m',false),allowZero:true},
 {key:'topAnchorBolts',label:'기둥 상단 앵커볼트 존재',kind:'boolean',required:false},
 select('spacingStandard','철근 간격 검토 기준',['KDS-142050-2022'],false),
 number('aggregateMaxSize','굵은 골재 최대 공칭치수','m',false,0,0.2),
 select('coverStandard','피복 검토 기준',['KDS-142050-2022'],false),
 select('coverExposure','피복 노출 조건',['indoor','earth-weather','cast-against-earth','underwater'],false),
 select('chlorideExposure','염화물 노출 등급',['none','ES1','ES2','ES3','ES4'],false),
 {...number('fireCoverRequired','내화 요구 피복 (해당 없음은 0)','m',false,0,1),allowZero:true},
 {...number('abrasionCoverRequired','마모·침식 요구 피복 (해당 없음은 0)','m',false,0,1),allowZero:true},
 text('coverExternalReference','내화·마모 피복 요구 근거',false),
 select('stirrupAreaBasis','스터럽 면적 근거',['geometric-diameter','specified-nominal'],false),
 number('stirrupNominalAreaMm2','스터럽 한 다리 공칭 면적','mm2',false,0,20000),
 text('stirrupProductReference','스터럽 제품 자료',false),text('stirrupProductEdition','스터럽 자료 판본',false),text('stirrupProductGrade','스터럽 제품 등급',false),
 select('barAreaBasis','주근 면적 근거',['geometric-diameter','specified-nominal'],false),
 text('barProductReference','공칭 면적 제품·규격 자료 (자동 인증 아님)',false),text('barProductEdition','제품 자료 판본',false),text('barProductGrade','제품 철근 등급',false),
 select('memberRole','부재 설계 역할',['flexural-member','compression-member'],false),
 select('detailingStandard','휨·압축부재 철근량 규칙',['KDS-142020-2022'],false),

 select('shearStandard','전단 기준',['KDS-142022-2022'],false),select('shearScope','전단 적용 범위',['ordinary-prismatic-no-opening'],false),select('stirrupForm','전단 철근 형식',['closed-rectangular-two-leg'],false),text('stirrupMaterialId','스터럽 재료 ID@버전 (생략 시 주근과 동일)',false),
 select('fabricationShape','주근 끝 형상',['straight','L90','J180'],false),
 select('startFabricationShape','주근 시작단 형상',['straight','L90','J180'],false),
 select('endFabricationShape','주근 종료단 형상',['straight','L90','J180'],false),
 number('startBendInsideRadius','시작단 구부림 내면 반지름','m',false),
 number('endBendInsideRadius','종료단 구부림 내면 반지름','m',false),
 number('startHookTailLength','시작단 후크 꼬리 길이','m',false),
 number('endHookTailLength','종료단 후크 꼬리 길이','m',false),
 {...number('endSetbackStart','시작단 철근 끝 거리','m',false),allowZero:true},{...number('endSetbackEnd','종료단 철근 끝 거리','m',false),allowZero:true},
 number('bendInsideRadius','후크 안쪽 반지름','m',false),number('hookTailLength','후크 직선 꼬리길이','m',false),
 select('serviceabilityMode','사용성 검토 방식 (배근 구간별 강성)',['instant-live-curvature','long-term-curvature','instant-live-frame'],false),
 select('serviceBoundary','처짐 경계',['chord','cantilever-start','cantilever-end'],false),
 select('serviceDeflectionLimit','KDS 순간 활하중 처짐 한계',['live-floor','live-roof'],false),
 text('serviceSustainedComboId','지속하중 SLS 조합 ID',false),
 number('serviceDurationMonths','지속기간 (3/6/12 또는 60개월 이상)','month',false),
 select('serviceLoadSequence','지속하중 도입 시점',['sustained-before-attachment'],false),
 {...number('servicePreAttachmentMultiplier','부착 전 추가 장기처짐 계수 (기술자료 필요)','-',false,0,2),allowZero:true},
 text('servicePreAttachmentReference','부착 전 처짐 차감 기술자료',false),
 select('serviceDeflectionAxis','프레임 처짐 검토 로컬 축',['v','w'],false),
 text('serviceBaselineComboId','프레임 처짐 기준 고정하중 조합 ID',false),
 text('serviceCrackingComboId','균열 강성용 전체 사용하중 조합 ID',false),
 {key:'nonstructuralDamageSensitive',label:'비구조요소 처짐 손상 민감',kind:'boolean',required:false},
 select('strengthStandard','단면 강도 기준 (비프리스트레스 직사각형 띠철근 단면)',['KDS-142020-2022'],false),
 select('anchorageStandard','정착 검토 기준',['KDS-142052-2024'],false),
 select('anchorageMode','정착 형식',['straight-tension','straight-compression','hook-tension'],false),
 {...number('anchorageStartCriticalX','시작단 정착 위험단면 위치 (배근 구간 시작 기준)','m',false,0),allowZero:true},
 number('anchorageEndCriticalX','종료단 정착 위험단면 위치 (배근 구간 시작 기준)','m',false),
 select('reinforcementForm','철근 구성',['single-deformed'],false),
 select('concreteWeight','콘크리트 종류',['normal','lightweight'],false),
 number('lightweightFactor','경량콘크리트 계수','-',false,0,1),
 select('barPosition','타설 시 주근 위치',['top','other'],false),
 select('barCoating','주근 도막',['uncoated','galvanized','epoxy'],false),
 select('spliceClass','인장 겹침이음 등급',['B'],false),
 {key:'lapRequired',label:'겹침이음 필요',kind:'boolean',required:false}
);
detailFields['reinforcement-record'].push(...['start','end'].map(end=>({...number(`${end}Extension`,`${end} joint bar extension`,'m',false,0,5),allowZero:true})));
detailFields['foundation-record'].push(number('aggregateMaxSize','기초 굵은 골재 최대 공칭치수','m',false,0,0.2));
detailFields['foundation-record'].push(select('barDistribution','기초 철근 분배 (균등 / KDS 중앙 유효폭)',['uniform','kds-centered-band'],false));
detailFields['foundation-record'].push(select('columnInterfaceSurface','기둥 접촉면 시공면',['monolithic','roughened-6mm','unroughened'],false),{key:'columnInterfaceClean',label:'접촉면 청소·레이턴스 제거 확인',kind:'boolean',required:false},text('columnInterfacePreparationReference','접촉면 처리 근거',false));
detailFields['foundation-record'].push(select('columnTransferType','기둥-기초 전달 상세',['cast-in-place-continuous-straight-bars'],false),text('columnMemberId','기초에 연결된 기둥 ID',false),number('columnEmbedmentLength','기둥 연속 주근의 기초 내 매입길이','m',false),number('columnDevelopmentAbove','접촉면 위 기둥 주근 연속길이','m',false));
detailFields['foundation-record'].push(...['B','L'].flatMap(axis=>[number(`topDiameter${axis}`,`상부 ${axis}방향 철근 직경`,'mm',false),number(`topSpacing${axis}`,`상부 ${axis}방향 철근 간격`,'mm',false)]));
detailFields['foundation-record'].push(select('punchingMomentMethod','편심 펀칭 검토 방법',['conservative-perimeter-shear'],false),select('punchingPerimeterScope','펀칭 위험둘레 범위',['interior-solid-no-openings','rectangular-solid-no-openings'],false));
detailFields['foundation-record'].push(select('shrinkageRestraint','기초 수축·온도 구속 조건',['ordinary-not-severely-restrained'],false));
detailFields['foundation-record'].push(select('barShape','기초판 철근 형상',['straight'],false));
export const PRACTICAL_DESIGN_TYPES=Object.freeze(['material-record','section-record',...Object.keys(detailFields)]);
detailFields['foundation-record'].push(text('footingWeightCaseId','기초 자중 하중 케이스 ID',false),text('overburdenCaseId','균등 상재토 하중 케이스 ID',false),text('buoyancyCaseId','균등 부력 하중 케이스 ID',false),{...number('uniformOverburdenPressure','균등 상재토 압력','kPa',false),allowZero:true},{...number('uniformBuoyancyPressure','균등 부력','kPa',false),allowZero:true},select('flexureStandard','기초 휨·일방향 전단 기준',['KDS-142020-2022'],false));
detailFields['foundation-record'].push(select('reactionVerticalReference','반력 모멘트의 높이 기준',['footing-base','footing-top','specified-height'],false),{...number('reactionHeightAboveBase','지정 반력 기준 높이 (기초 저면 기준)','m',false,0,1000),allowZero:true});
detailFields['foundation-record'].push(...['X','Y'].map(axis=>({...number(`columnOffset${axis}`,`기초 중심 기준 기둥 중심 ${axis} 편심`,'m',false,-1000,1000),allowZero:true})),select('reactionMomentReference','반력 모멘트 기준점',['column-center','footing-center'],false));
detailFields['foundation-record'].push(select('reactionBasis','반력 자중 포함 범위',['includes-footing-weight','superstructure-only'],false),number('columnWidth','기둥 X방향 폭','m',false),number('columnDepth','기둥 Y방향 폭','m',false));
detailFields['foundation-record'].push(select('punchingStandard','뚫림전단 기준',['KDS-142022-2022'],false),select('concreteWeight','기초 콘크리트 종류',['normal'],false),select('barCoating','기초 하부 주근 도막',['uncoated'],false));
detailFields['connection-record'].push(select('jointCongestionMode','Longitudinal path clearance',['longitudinal-paths'],false),{...number('jointMinimumClearance','Required path clearance','m',false,0,.1),allowZero:true});
detailFields['connection-record'].push(select('jointStrengthMode','Column-beam strength comparison',['conservative-column-design-beam-nominal'],false));
detailFields['connection-record'].push(select('jointColumnContinuity','Column longitudinal continuity',['aligned-through-bars'],false));
detailFields['reinforcement-record'].push(select('barCatalogId','주근 공칭 규격표 (선택 시 직경란 16 → D16 15.9mm)',[REBAR_CATALOG_ID],false),select('stirrupCatalogId','스터럽 공칭 규격표 (선택 시 10 → D10 9.53mm)',[REBAR_CATALOG_ID],false));
detailFields['foundation-record'].push(...detailFields['reinforcement-record'].filter(f=>['barCatalogId','barAreaBasis','barProductGrade','barProductReference','barProductEdition'].includes(f.key)));
detailFields['connection-record'].push(...detailFields['reinforcement-record'].filter(f=>['barCatalogId','barAreaBasis','barProductGrade','barProductReference','barProductEdition'].includes(f.key)).map(f=>({...f,label:f.key==='barCatalogId'?'접합부 후프 공칭 규격표':f.label})));
detailFields['connection-record'].push(select('jointAnchorageMode','특수골조 보 철근 정착 경로',['special-frame-beam-90-hooks','special-frame-beam-through-bars','special-frame-beam-mixed'],false),select('jointThroughAxis','관통 철근 방향 (혼합 정착)',['X','Y'],false),select('jointBeamContinuity','보 관통 철근 연속성',['aligned-through-bars'],false));
detailFields['connection-record'].push(select('capacityBeamScope','예상강도 보·슬래브 참여 범위',['rectangular-no-slab-participation'],false));
detailFields['connection-record'].push(select('jointTieClosure','접합부 후프 양단 후크',['seismic-135'],false),number('jointHookTail','후프 내진갈고리 꼬리 길이','m',false),number('jointBendInsideRadius','후프 내면 구부림 반지름','m',false),number('jointPanelHeight','후프 배치 패널 높이','m',false),{...number('jointFirstStart','패널 하단 첫 후프 거리','m',false),allowZero:true},{...number('jointFirstEnd','패널 상단 첫 후프 거리','m',false),allowZero:true});
detailFields['connection-record'].push(select('jointCrossTiePattern','접합부 크로스타이 반복 방향',['fixed-hook-side','alternating-hook-side'],false));
detailFields['connection-record'].push({...ids('jointCrossTieBarPairs','접합부 크로스타이 기둥 철근 번호 쌍'),required:false},{...ids('jointCrossTieHookSides','접합부 크로스타이 본체 방향 left/right'),required:false,unique:false},{...ids('jointCrossTiePlaneOffsets','접합부 크로스타이 후프 기준 높이 m'),required:false,unique:false});
detailFields['connection-record'].push(select('jointClosureCorner','접합부 후프 폐합 모서리',['+y+z','+y-z','-y+z','-y-z'],false),{...number('jointClosureSeparation','접합부 후프 양단 접선점 높이 차이','m',false,0,1),allowZero:true});
detailFields['connection-record'].push(number('jointCover','접합부 후프 외면 피복','m',false),select('jointHoopForm','접합부 후프 형식',['closed-rectangular-two-leg'],false));
detailFields['connection-record'].push(select('jointDesignStandard','접합부 기준/구조 시스템',['KDS-142080-2021-special-frame'],false),text('columnMemberId','접합부 기준 기둥 ID',false),text('jointMaterialId','접합부 콘크리트 ID@버전',false),select('concreteWeight','접합부 콘크리트 종류',['normal'],false),select('capacityDemandBasis','접합부 수요 산정 근거',['1.25fy-capacity-design','derived-1.25fy-no-column-shear-credit'],false),text('capacityDemandReference','예상강도 수요 계산 자료/참조',false),{...number('capacityDesignShearX','X방향 예상강도 접합 전단 수요','kN',false),allowZero:true},{...number('capacityDesignShearY','Y방향 예상강도 접합 전단 수요','kN',false),allowZero:true});
detailFields['ground-record'].push(select('secondaryCompressionModel','2차 압축 모델',['log-time-reference-strain'],false),{...ids('secondaryCompressionLayers','지층별 기준두께 대비 2차변형률계수:최종재하 후 1차압밀 종료기준일(day)'),required:false,unique:false},text('secondaryCompressionReference','2차 변형률계수 시험·기준두께·1차압밀 종료시간 근거',false));
detailFields['ground-record'].push({...ids('consolidationStages','단계별 재하일(day):최종하중 대비 누적비율 (마지막 1, 생략 시 0일 전량 재하)'),required:false});
detailFields['ground-record'].push(select('consolidationModel','시간별 압밀 모델',['independent-uniform-layers'],false),{...ids('consolidationLayers','침하 지층과 같은 순서: 압밀계수(m²/day):배수(single 또는 double)'),required:false,unique:false},{...number('consolidationElapsedDays','재하 일정 기준일 이후 경과시간','day',false,0,1000000),allowZero:true},text('consolidationReference','압밀계수 시험·독립 배수층·균등 초기 간극수압 가정 근거',false));
detailFields['ground-record'].push(select('settlementMethod','침하 계산 방법',['layered-constrained-modulus','layered-two-to-one-gross'],false),{...ids('settlementLayers','지층별 두께(m):구속탄성계수(kPa), 직접 영향계수 방법은 :유효응력증가/qmax 추가 (위에서 아래 순서)'),required:false,unique:false},text('settlementReference','지층 시험·유효응력 영향계수·적용범위 근거',false));
detailFields['ground-record'].push(select('slidingMethod','미끄럼 검토 방법',['coulomb-service-safety-factor'],false),number('slidingSafetyFactor','미끄럼 저항 안전율','-',false,1,100),text('slidingFactorReference','미끄럼 안전율 선정 근거',false));
detailFields['ground-record'].push({...ids('reviewScopeHashes','동일 외부 보고서가 검토한 결과 해시 목록 (최대 50개)'),required:false});
detailFields['ground-record'].push(...['reviewer','reviewDocument','reviewEdition','reviewDate','reviewEvidenceSha256','reviewScopeHash','reviewMethod','reviewConditions','reviewKdsReferences'].map(key=>text(key,({reviewer:'독립 검토자',reviewDocument:'검토 보고서',reviewEdition:'보고서 판본',reviewDate:'검토일 YYYY-MM-DD',reviewEvidenceSha256:'검토 증거 SHA-256',reviewScopeHash:'평가 결과의 지반 검토 대상 해시',reviewMethod:'외부 지반 검토 방법',reviewConditions:'검토 적용 조건',reviewKdsReferences:'외부 검토 KDS 근거'})[key],false)),select('reviewConclusion','외부 검토 결론',['accepted','rejected'],false));
detailFields['ground-record'].push({...number('overburdenPressure','순지지력 기준 상재압','kPa',false,0,100000),allowZero:true});
export const DESIGN_RECORD_CHANNELS=Object.freeze(['materials','sections','reinforcement','connections','ground','foundations','profiles','splices']);
export const PRACTICAL_RECORD_CHANNEL=Object.freeze({'splice-record':'splices','design-profile-record':'profiles','material-record':'materials','section-record':'sections','reinforcement-record':'reinforcement','connection-record':'connections','ground-record':'ground','foundation-record':'foundations'});
export const PRACTICAL_INPUT_VERSION='p24-practical-input-v1';

export function practicalInputFields(type,kind='steel') {
  if(detailFields[type])return structuredClone(detailFields[type]);
  if(type==='section-record') {
    const selected=shapes[kind]?kind:'RECT';
    return structuredClone([...base.slice(0,3),select('shape','단면 형상',Object.keys(shapes)),select('dimensionUnit','단면 치수 단위',['mm']),...shapes[selected].map(key=>number(key,key,'mm')),text('sourceNote','형상·치수 근거')]);
  }
  if(type!=='material-record') throw Object.assign(new Error('Unsupported input type'),{code:'INPUT_TYPE_UNSUPPORTED'});
  const chosen=material[kind]?kind:'steel';
  const merged=new Map([...base,...elastic,...source,...material[chosen]].map(row=>[row.key,row]));
  return structuredClone([...merged.values()]);
}

export function practicalInputSchema(type) {
  if(!PRACTICAL_DESIGN_TYPES.includes(type)) throw Object.assign(new Error('Unsupported input type'),{code:'INPUT_TYPE_UNSUPPORTED'});
  const fields=detailFields[type]?practicalInputFields(type):[...new Map(Object.keys(type==='section-record'?shapes:material).flatMap(kind=>practicalInputFields(type,kind)).map(row=>[row.key,row])).values()];
  const properties={type:{type:'string',enum:[type]}};
  for(const f of fields) {
    const description=`${f.label}${f.unit?` (${f.unit})`:''}`;
    if(f.kind==='ids') {properties[f.key]={type:'array',minItems:1,maxItems:50,uniqueItems:f.unique!==false,items:{type:'string',minLength:1,maxLength:128},description};continue;}
    if(f.kind==='bars') {properties[f.key]={type:'array',minItems:1,maxItems:100,items:{type:'object',properties:{y:{type:'number',minimum:-100,maximum:100},z:{type:'number',minimum:-100,maximum:100},diameter:{type:'number',minimum:0.1,maximum:100},nominalAreaMm2:{type:'number',exclusiveMinimum:0,maximum:20000},designation:{type:'string',minLength:1,maxLength:64}},required:['y','z','diameter'],additionalProperties:false},description};continue;}
    properties[f.key]=f.kind==='number'?{type:f.integer?'integer':'number',minimum:f.min,maximum:f.max,description}
      :f.kind==='boolean'?{type:'boolean',description}
      :{type:'string',minLength:1,maxLength:f.key==='sourceNote'?2000:256,...(f.values?{enum:f.values}:{}),description};
  }
  // Conditional requirements are enforced by the same product validator used by UI.
  return {type:'object',properties,required:['type','id','name','version',...(detailFields[type]?[]:[type==='section-record'?'shape':'kind'])],additionalProperties:false};
}

export function validatePracticalCommand(input) {
  const command=expandRebarCatalogInput(input);
  const fields=practicalInputFields(command.type,command.kind??command.shape);
  const allowed=new Set(['type',...fields.map(f=>f.key)]);
  const errors=Object.keys(command).filter(key=>!allowed.has(key)).map(key=>`${key}:unsupported`);
  for(const f of fields) {
    const value=command[f.key];
    if(value===undefined){if(f.required)errors.push(`${f.key}:required`);continue;}
    if(f.kind==='bars') {
      if(!Array.isArray(value)||!value.length||value.length>100||value.some(row=>!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(k=>!['y','z','diameter','nominalAreaMm2','designation'].includes(k))||!['y','z','diameter'].every(k=>typeof row[k]==='number'&&Number.isFinite(row[k]))||Math.abs(row.y)>100||Math.abs(row.z)>100||row.diameter<0.1||row.diameter>100))errors.push(`${f.key}:geometry`);
      if(Array.isArray(value))for(const row of value){
        if(!row||typeof row!=='object')continue;
        if(command.barAreaBasis==='specified-nominal'){
          if(!Number.isFinite(row.nominalAreaMm2)||row.nominalAreaMm2<=0||row.nominalAreaMm2>20000||typeof row.designation!=='string'||!row.designation.trim()||row.designation.length>64)errors.push('bars:nominal-product-required');
        }else if(row.nominalAreaMm2!==undefined||row.designation!==undefined)errors.push('bars:explicit-nominal-basis-required');
      }
    } else if(f.kind==='ids') {
      if(!Array.isArray(value)||!value.length||value.length>50||(f.unique!==false&&new Set(value).size!==value.length)||value.some(x=>typeof x!=='string'||!x.trim()||x.length>128))errors.push(`${f.key}:ids`);
    } else if(f.kind==='number') {
      if(typeof value!=='number'||!Number.isFinite(value)||value<f.min||value>f.max||(f.integer&&!Number.isInteger(value))) errors.push(`${f.key}:number`);
      else if(f.min===0&&value===0&&!f.allowZero&&f.key!=='moisture') errors.push(`${f.key}:positive`);
    } else if(f.kind==='boolean') {if(typeof value!=='boolean')errors.push(`${f.key}:boolean`);}
    else if(typeof value!=='string'||!value.trim()||value.length>(f.key==='sourceNote'?2000:256)||(f.values&&!f.values.includes(value))) errors.push(`${f.key}:value`);
  }
  if(command.type==='foundation-record'){if(command.differentialPeerIds!==undefined){try{parseDifferentialPeers(command.differentialPeerIds,command.id);}catch{errors.push('differentialPeerIds:unique-peer-version-required');}}if(['differentialPeerIds','differentialSettlementLimit','differentialRotationLimit','differentialReference'].some(k=>command[k]!==undefined)&&command.differentialSettlementBasis===undefined)errors.push('differentialSettlementBasis:required');}
  if(command.type==='ground-record'){
   if(command.consolidationStages!==undefined){try{parseConsolidationStages(command.consolidationStages);}catch{errors.push('consolidationStages:ordered-increasing-final-one-required');}}
   if(command.consolidationLayers!==undefined){try{const rows=parseConsolidationLayers(command.consolidationLayers);if(rows.length!==command.settlementLayers?.length)errors.push('consolidationLayers:layer-count');}catch{errors.push('consolidationLayers:invalid');}}
   if(['consolidationLayers','consolidationReference'].some(k=>command[k]!==undefined)&&command.consolidationModel!=='independent-uniform-layers')errors.push('consolidationModel:required');
   if(['consolidationStages','consolidationElapsedDays'].some(k=>command[k]!==undefined)&&command.consolidationModel===undefined&&command.secondaryCompressionModel===undefined)errors.push('consolidationModel:time-method-required');
   if(command.secondaryCompressionLayers!==undefined){try{const rows=parseSecondaryCompressionLayers(command.secondaryCompressionLayers);if(rows.length!==command.settlementLayers?.length)errors.push('secondaryCompressionLayers:layer-count');}catch{errors.push('secondaryCompressionLayers:invalid');}}
   if(['secondaryCompressionLayers','secondaryCompressionReference'].some(k=>command[k]!==undefined)&&command.secondaryCompressionModel!=='log-time-reference-strain')errors.push('secondaryCompressionModel:required');
   if(command.secondaryCompressionModel!==undefined&&!['layered-constrained-modulus','layered-two-to-one-gross'].includes(command.settlementMethod))errors.push('settlementMethod:layered-required-for-secondary');
   if(command.consolidationModel!==undefined&&!['layered-constrained-modulus','layered-two-to-one-gross'].includes(command.settlementMethod))errors.push('settlementMethod:layered-required-for-consolidation');
  }
  if(command.type==='ground-record'&&command.settlementLayers!==undefined){try{parseSettlementLayers(command.settlementLayers,{automaticStress:command.settlementMethod==='layered-two-to-one-gross'});}catch{errors.push('settlementLayers:invalid-layer-data');}if(!['layered-constrained-modulus','layered-two-to-one-gross'].includes(command.settlementMethod))errors.push('settlementMethod:required-for-layers');}
  if(command.type==='ground-record'&&(command.slidingSafetyFactor!==undefined||command.slidingFactorReference!==undefined)&&command.slidingMethod!=='coulomb-service-safety-factor')errors.push('slidingMethod:required-for-factor');
  if(command.type==='ground-record'&&command.reviewScopeHashes!==undefined&&(command.reviewScopeHash!==undefined||!Array.isArray(command.reviewScopeHashes)||command.reviewScopeHashes.some(h=>typeof h!=='string'||!/^[a-f0-9]{64}$/.test(h))))errors.push('reviewScopeHashes:exclusive-valid-hashes-required');
  if(command.type==='reinforcement-record'&&command.barLayerGroups!==undefined){try{parseBarLayerGroups(command.barLayerGroups,command.bars);}catch{errors.push('barLayerGroups:partition-or-horizontal-geometry');}}
  if(command.barAreaBasis==='specified-nominal')for(const key of ['barProductReference','barProductEdition','barProductGrade'])if(typeof command[key]!=='string'||!command[key].trim())errors.push(`${key}:required`);
  if(command.type==='connection-record'&&command.barAreaBasis==='specified-nominal'&&!command.barCatalogId)errors.push('connection:nominal-catalog-required');
  if(command.type==='foundation-record'&&command.barAreaBasis==='specified-nominal'&&!command.barCatalogId)errors.push('foundation:nominal-catalog-required');
  if(command.stirrupAreaBasis==='specified-nominal'){
   for(const key of ['stirrupProductReference','stirrupProductEdition','stirrupProductGrade'])if(typeof command[key]!=='string'||!command[key].trim())errors.push(`${key}:required`);
   if(!(command.stirrupNominalAreaMm2>0)||!(command.stirrupDiameter>0))errors.push('stirrup:nominal-product-required');
  }else if(command.stirrupNominalAreaMm2!==undefined)errors.push('stirrup:explicit-nominal-basis-required');
  if(command.detailingStandard&&command.memberRole===undefined)errors.push('memberRole:required');
  if(command.type==='material-record'&&command.kind==='steel'&&command.product!=='rebar'&&!(command.thickness>0))errors.push('thickness:required-for-structural-steel-product');
  if(command.torsionDesignMode){if(command.torsionStandard!=='KDS-142022-2022'||command.strengthStandard!=='KDS-142020-2022'||!(command.torsionLongitudinalFraction>0&&command.torsionLongitudinalFraction<1))errors.push('torsion:standard-and-longitudinal-allocation-required');}
  else if(command.torsionLongitudinalFraction!==undefined)errors.push('torsion:explicit-design-mode-required');
  if(typeof command.id==='string'&&command.id.includes('@'))errors.push('id:version-must-be-separate');
  if(errors.length)throw Object.assign(new Error('Invalid practical design input'),{code:'PRACTICAL_INPUT_INVALID',details:errors});
}

export function practicalCommandFromFields(type,values) {
  const command={type};
  for(const f of practicalInputFields(type,type==='section-record'?values.shape:values.kind)) {
    const raw=values[f.key];if(raw===undefined||String(raw).trim()==='')continue;
    if(f.kind==='ids')command[f.key]=Array.isArray(raw)?[...raw]:String(raw).split(/[,\s]+/).filter(Boolean);
    else if(f.kind==='bars')command[f.key]=Array.isArray(raw)?structuredClone(raw):String(raw).split(/\r?\n/).filter(x=>x.trim()).map(line=>{const parts=line.trim().split(/[,\s]+/);if(![3,5].includes(parts.length))throw new Error('주근은 y, z, 직경 또는 y, z, 직경, 공칭면적, 제품명을 입력하세요.');const [y,z,diameter]=parts.slice(0,3).map(Number);return {y,z,diameter,...(parts.length===5?{nominalAreaMm2:Number(parts[3]),designation:parts[4]}:{})};});
    else if(f.kind==='boolean') {
      if(![true,false,'true','false'].includes(raw))throw new Error(`${f.label}: true/false 값을 입력하세요.`);
      command[f.key]=raw===true||raw==='true';
    } else command[f.key]=f.kind==='number'?Number(raw):String(raw).trim();
  }
  const expanded=expandRebarCatalogInput(command);validatePracticalCommand(expanded);
  return expanded;
}

// Reconstruct an editable typed request from the canonical record. Internal
// geometry uses metres; the public reinforcement fields explicitly use mm.
export function practicalCommandFromRecord(type,record) {
  const values={...record};
  if(type==='material-record') {
    const e=record.elastic||{},s=record.specification||{};
    for(const [field,key] of Object.entries(STEEL_TEST_INPUT_MAP))if(record.testEvidence?.[key]!==undefined)values[field]=record.testEvidence[key];
    if(record.creep){
      const c=record.creep,a=c.attachment;
      Object.assign(values,{creepCoefficient:c.coefficient,creepLoadingAgeDays:c.loadingAgeDays,creepEvaluationAgeDays:c.evaluationAgeDays,creepElasticModulusAtLoading:c.elasticModulusAtLoading,creepReference:c.reference,shrinkageMicrostrain:c.shrinkageMicrostrain,shrinkageReference:c.shrinkageReference});
      if(a)Object.assign(values,{creepAttachmentCoefficient:a.coefficient,creepAttachmentAgeDays:a.evaluationAgeDays,creepAttachmentReference:a.reference,attachmentShrinkageMicrostrain:a.shrinkageMicrostrain,attachmentShrinkageReference:a.shrinkageReference});
    }
    Object.assign(values,e,record.strength?.[record.kind]||{},s,{density:e.rho,sourceReference:s.reference,sourceNote:s.note,thickness:s.thicknessMm,moisture:s.moisturePercent,analysisAssumption:record.elasticity});
  } else if(type==='section-record')Object.assign(values,record.params||{},{sourceNote:record.source?.note});
  else if(type==='reinforcement-record') {
    values.bars=record.bars?.map(bar=>({y:bar.y,z:bar.z,diameter:bar.diameter*1000,...(record.areaBasis==='specified-nominal'?{nominalAreaMm2:bar.nominalArea*1e6,designation:bar.designation}:{})}));
    if(record.stirrups)Object.assign(values,{stirrupDiameter:record.stirrups.diameter*1000,stirrupLegs:record.stirrups.legs,stirrupSpacing:record.stirrups.spacing*1000});
  } else if(type==='connection-record'&&record.reinforcement) {
    const r=record.reinforcement;Object.assign(values,{barMaterialId:r.materialId,tieDiameter:r.diameter*1000,tieLegs:r.legs,tieSpacing:r.spacing*1000});
  } else if(type==='foundation-record'&&record.reinforcement) {
    const r=record.reinforcement;Object.assign(values,{barMaterialId:r.materialId,bottomDiameterB:r.bottomB?.diameter*1000,bottomDiameterL:r.bottomL?.diameter*1000,bottomSpacingB:r.bottomB?.spacing*1000,bottomSpacingL:r.bottomL?.spacing*1000,topDiameterB:r.topB?r.topB.diameter*1000:undefined,topDiameterL:r.topL?r.topL.diameter*1000:undefined,topSpacingB:r.topB?r.topB.spacing*1000:undefined,topSpacingL:r.topL?r.topL.spacing*1000:undefined});
  }
  const result={type};
  for(const f of practicalInputFields(type,type==='section-record'?values.shape:values.kind))if(values[f.key]!==undefined)result[f.key]=structuredClone(values[f.key]);
  validatePracticalCommand(result);
  return result;
}
