import {
  buildBarChart,
  buildGroupedBarChart,
  buildMultiSeriesLineChart,
} from './resultCharts.js';

export const ELASTIC_RESULT_VISUALIZATION_VERSION = 'p7-m11-elastic-result-visualization-v1';

export const ELASTIC_RESULT_KINDS = Object.freeze([
  'static',
  'modal',
  'responseSpectrum',
  'buckling',
  'linearTha',
]);

const PALETTE = ['#005a8d', '#1f8a58', '#d88716', '#8a5fb8', '#c34747', '#4f7c8f'];

export function isElasticResultKind(kind) {
  return ELASTIC_RESULT_KINDS.includes(String(kind || ''));
}

export function buildElasticResultViewModel(model = {}, analysisCase = null, result = null, uiState = {}) {
  const kind = result?.kind || analysisCase?.kind || null;
  const base = {
    version: ELASTIC_RESULT_VISUALIZATION_VERSION,
    available: !!analysisCase,
    resultAvailable: !!result,
    caseId: analysisCase?.id || result?.caseId || null,
    kind,
    title: analysisCase?.name || kindLabel(kind),
    status: result?.status || analysisCase?.status || 'not-run',
    qualification: result?.qualification || null,
    method: null,
    tabs: [],
    activeTab: null,
    controls: [],
    metrics: [],
    charts: [],
    structuralPreview: null,
    tables: [],
    notes: [],
    modeOrStep: 0,
    modeOrStepMax: 0,
    sizeProfile: 'compact',
  };
  if (!analysisCase) {
    return {
      ...base,
      title: '탄성해석 결과',
      notes: ['탄성해석 케이스를 선택하면 결과를 이 창에서 검토할 수 있습니다.'],
    };
  }
  if (!result) {
    return {
      ...base,
      notes: ['이 케이스는 아직 실행되지 않았습니다. 설정을 확인한 뒤 실행하십시오.'],
    };
  }
  if (kind === 'static' && result.payload?.pDelta?.enabled) return pDeltaView(model, analysisCase, result, uiState, base);
  if (kind === 'static') return staticView(model, analysisCase, result, uiState, base);
  if (kind === 'modal') return modalView(model, analysisCase, result, uiState, base);
  if (kind === 'responseSpectrum') return rsaView(model, analysisCase, result, uiState, base);
  if (kind === 'buckling') return bucklingView(model, analysisCase, result, uiState, base);
  if (kind === 'linearTha') return linearThaView(model, analysisCase, result, uiState, base);
  return { ...base, notes: ['이 결과 종류에는 전용 시각화가 없습니다.'] };
}

function staticView(model, analysisCase, result, state, base) {
  const payload = result.payload || {};
  const active = pickStaticResult(payload);
  const tabs = tabList([
    ['deformed', '변형'],
    ['forces', '부재력'],
    ['reactions', '반력'],
    ['checks', '검정'],
  ], state.view || 'deformed');
  const activeTab = activeTabId(tabs);
  const memberRows = Object.entries(active?.memberResults || {}).map(([memberId, row]) => ({ memberId, ...row }));
  const selectedMemberId = validMemberId(state.selectedMemberId, memberRows) || memberRows[0]?.memberId || null;
  const component = staticComponent(state.component);
  const maxDisplacement = finite(active?.dmax, maxNodeDisplacement(active?.disp || active?.nodeDisplacements));
  const view = {
    ...base,
    method: 'first-order-linear-static',
    tabs,
    activeTab,
    metrics: [
      metric('조합', active?.combo?.id || result.settings?.comboId || 'Envelope'),
      metric('최대 변위', formatLength(maxDisplacement, model)),
      metric('부재', memberRows.length),
      metric('상태', statusLabel(result.status), statusTone(result.status)),
    ],
    sizeProfile: activeTab === 'deformed' ? 'standard' : 'wide',
  };
  if (activeTab === 'deformed') {
    view.controls.push(segmentedControl('static-response', '모델 화면', ['def', 'defl'].includes(state.staticResponse) ? state.staticResponse : 'def', [
      ['def', '변형'], ['defl', '처짐'],
    ]));
    view.structuralPreview = buildStructuralResultSvg(model, {
      id: 'ssElasticStaticShapeSvg',
      title: '정적 변형 형상',
      displacements: active?.disp || active?.nodeDisplacements || {},
      selectedMemberId,
    });
    view.tables.push(table('ssElasticStaticDisplacementTable', '절점 변위', ['절점', 'dx', 'dy', 'dz'],
      displacementRows(active?.disp || active?.nodeDisplacements || {}, model).slice(0, 12)));
  } else if (activeTab === 'forces') {
    view.controls.push(selectControl('member', '부재', selectedMemberId, memberRows.map((row) => [row.memberId, row.memberId])));
    view.controls.push(segmentedControl('component', '성분', component, [
      ['N', 'N'], ['Vy', 'Vy'], ['Vz', 'Vz'], ['Tq', 'T'], ['My', 'My'], ['Mz', 'Mz'],
    ]));
    const member = memberRows.find((row) => row.memberId === selectedMemberId) || null;
    const stationValues = member?.[component] || [];
    const stationX = member?.xs || stationValues.map((_item, index) => index);
    view.charts.push(chart('ssElasticMemberForceChart', `${selectedMemberId || '-'} ${component} 선도`,
      buildMultiSeriesLineChart([{
        label: component,
        points: stationValues.map((value, index) => ({ x: stationX[index] ?? index, y: value })),
      }], { id: 'ssElasticMemberForceSvg', title: `${component} station diagram`, xLabel: 'x', yLabel: forceComponentUnit(component) }),
    ));
    const maxKey = `${component === 'Tq' ? 'T' : component}max`;
    view.charts.push(chart('ssElasticMemberForceMaxChart', `부재별 |${component}| 최대값`,
      buildBarChart(topMagnitudeRows(memberRows.map((row) => ({ label: row.memberId, value: finite(row[maxKey]) })), 12), {
        id: 'ssElasticMemberForceMaxSvg', title: `Member ${component} maximum`, width: 440, height: 170,
      })));
    view.tables.push(table('ssElasticMemberForceTable', '부재력 최대값', ['부재', 'N', 'Vy', 'Vz', 'T', 'My', 'Mz'],
      memberRows.slice(0, 16).map((row) => [
        row.memberId, formatNumber(row.Nmax), formatNumber(row.Vymax), formatNumber(row.Vzmax),
        formatNumber(row.Tmax), formatNumber(row.Mymax), formatNumber(row.Mzmax),
      ])));
  } else if (activeTab === 'reactions') {
    view.controls.push(segmentedControl('static-response', '모델 화면', 'react', [['react', '반력']]));
    const reactions = reactionRows(active?.reactions || {});
    view.charts.push(chart('ssElasticReactionChart', '지점별 반력 크기', buildGroupedBarChart(
      reactions.slice(0, 12).map((row) => ({
        label: row.nodeId,
        values: [['Fx', row.fx], ['Fy', row.fy], ['Fz', row.fz]].map(([label, value]) => ({ label, value })),
      })), { id: 'ssElasticReactionSvg', title: 'Support reactions', yLabel: model.units?.force || 'kN' },
    )));
    view.tables.push(table('ssElasticReactionTable', '지점 반력', ['절점', 'Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz'],
      reactions.map((row) => [row.nodeId, ...['fx', 'fy', 'fz', 'mx', 'my', 'mz'].map((key) => formatNumber(row[key]))])));
  } else {
    view.controls.push(segmentedControl('static-response', '모델 화면', 'chk', [['chk', '검정비']]));
    const checks = memberRows.map((row) => ({
      memberId: row.memberId,
      ratio: finite(row.check?.ratio ?? row.utilization),
      status: row.check?.status || row.status || null,
    })).sort((a, b) => b.ratio - a.ratio);
    view.charts.push(chart('ssElasticUtilizationChart', '부재 검정비', buildBarChart(
      checks.slice(0, 16).map((row) => ({ label: row.memberId, value: row.ratio })),
      { id: 'ssElasticUtilizationSvg', title: 'Member utilization', width: 440, height: 170, yLabel: 'ratio' },
    )));
    view.tables.push(table('ssElasticUtilizationTable', '검정 결과', ['부재', '검정비', '상태'],
      checks.map((row) => [row.memberId, formatNumber(row.ratio, 3), row.status || ratioStatus(row.ratio)])));
  }
  return view;
}

function pDeltaView(model, analysisCase, result, state, base) {
  const payload = result.payload || {};
  const pDelta = payload.pDelta || {};
  const method = pDelta.method || result.settings?.pDeltaMethod || 'legacy';
  const comboIds = pDeltaComboIds(pDelta);
  const selectedComboId = comboIds.includes(state.selectedComboId) ? state.selectedComboId : comboIds[0] || null;
  const tabs = tabList([
    ['global', '전체'],
    ['story', '층'],
    ['member', '부재'],
    ['convergence', '수렴'],
  ], state.view || (state.selectedMemberId ? 'member' : 'global'));
  const activeTab = activeTabId(tabs);
  const comboRun = selectedComboId ? pDelta.byCombo?.[selectedComboId] || null : null;
  const memberGraph = pDelta.graphs?.members?.find((item) => item.comboId === selectedComboId)
    || pDelta.curves?.members?.find((item) => item.comboId === selectedComboId)
    || null;
  const memberRows = memberGraph?.rows || comboRun?.split?.memberRows || [];
  const selectedMemberId = validMemberId(state.selectedMemberId, memberRows)
    || memberRows[0]?.memberId
    || model.members?.[0]?.id
    || null;
  const summary = pDelta.summary || {};
  const view = {
    ...base,
    method,
    title: `${analysisCase.name || 'P-Delta'} 결과`,
    tabs,
    activeTab,
    controls: comboIds.length > 1
      ? [selectControl('combo', '조합', selectedComboId, comboIds.map((id) => [id, id]))]
      : [],
    metrics: [
      metric('해석법', method === 'direct' ? 'Direct Kt' : 'Legacy 비교용', method === 'direct' ? 'ok' : 'warn'),
      metric('조합', selectedComboId || '-'),
      metric('수렴', `${summary.convergedCount ?? pDelta.convergence?.convergedCount ?? 0}/${summary.comboCount ?? pDelta.convergence?.comboCount ?? comboIds.length}`),
      metric('최대 증폭', formatNumber(summary.maxAmplification ?? comboRun?.amplification ?? 1, 3)),
    ],
    notes: [method === 'direct'
      ? 'Direct 결과는 하중스텝별 접선강성 해석값이며 1차 기준선과 구분해 표시합니다.'
      : 'Legacy 등가 횡하중 반복 결과는 비교용이며 설계 전달 대상이 아닙니다.'],
    sizeProfile: activeTab === 'member' || activeTab === 'convergence' ? 'wide' : 'standard',
  };
  if (activeTab === 'global') {
    const series = pDeltaGlobalSeries(pDelta, selectedComboId);
    const globalRows = pDeltaGlobalRows(pDelta);
    const hasLateralResponse = globalRows.some((row) => Math.abs(finite(row.maxDisplacement)) > 1e-12);
    view.charts.push(chart('ssElasticPDeltaGlobalChart', '하중계수-최대 횡변위', buildMultiSeriesLineChart(series, {
      id: 'ssElasticPDeltaGlobalSvg',
      title: 'Global P-Delta response',
      xLabel: 'load factor',
      yLabel: model.units?.length || 'm',
    }), hasLateralResponse
      ? '점선은 1차 기준, 실선은 선택한 P-Delta 해석 결과입니다.'
      : '현재 조합에는 횡응답이 없어 곡선이 0선으로 표시됩니다. 횡하중 조합을 선택해 P-Delta 증폭을 검토하십시오.'));
    view.tables.push(table('ssElasticPDeltaGlobalTable', '하중스텝', ['조합', 'λ', '최대 횡변위', '반복', '수렴'],
      globalRows.map((row) => [
        row.comboId, formatNumber(row.loadFactor, 3), formatLength(row.maxDisplacement, model),
        row.iterationCount ?? '-', row.converged === false ? 'NG' : 'OK',
      ])));
  } else if (activeTab === 'story') {
    const storyGraph = pDelta.graphs?.stories?.find((item) => item.comboId === selectedComboId)
      || pDelta.curves?.stories?.find((item) => item.comboId === selectedComboId)
      || null;
    const rows = storyGraph?.rows || comboRun?.split?.storyRows || [];
    view.charts.push(chart('ssElasticPDeltaStoryChart', '층별 1차·2차 층간변위', buildGroupedBarChart(
      rows.map((row) => ({
        label: `S${row.story}`,
        values: [
          { label: '1차', value: finite(row.firstOrderDrift) },
          { label: '2차', value: finite(row.secondOrderDrift) },
        ],
      })), { id: 'ssElasticPDeltaStorySvg', title: 'Story P-Delta drift', yLabel: model.units?.length || 'm' },
    )));
    view.tables.push(table('ssElasticPDeltaStoryTable', '층 응답', ['층', '높이', '1차 Δ', '2차 Δ', '증폭'],
      rows.map((row) => [
        `S${row.story}`, formatLength(row.height, model), formatLength(row.firstOrderDrift, model),
        formatLength(row.secondOrderDrift, model), formatNumber(amplification(row.firstOrderDrift, row.secondOrderDrift), 3),
      ])));
  } else if (activeTab === 'member') {
    view.controls.push(selectControl('member', '부재', selectedMemberId,
      memberRows.map((row) => [row.memberId, row.memberId])));
    const row = memberRows.find((item) => item.memberId === selectedMemberId) || null;
    view.charts.push(chart('ssElasticPDeltaMemberDriftChart', `${selectedMemberId || '-'} 부재 chord drift`, buildGroupedBarChart([
      {
        label: selectedMemberId || '-',
        values: [
          { label: 'local y', value: finite(row?.localChordDriftY) },
          { label: 'local z', value: finite(row?.localChordDriftZ) },
        ],
      },
    ], { id: 'ssElasticPDeltaMemberDriftSvg', title: 'Member chord drift', yLabel: model.units?.length || 'm' })));
    view.charts.push(chart('ssElasticPDeltaMemberAxialChart', `${selectedMemberId || '-'} 축력 비교`, buildGroupedBarChart([
      {
        label: selectedMemberId || '-',
        values: [
          { label: '1차 N', value: finite(row?.firstOrderAxial) },
          { label: '2차 N', value: finite(row?.secondOrderAxial) },
        ],
      },
    ], { id: 'ssElasticPDeltaMemberAxialSvg', title: 'Member axial force comparison', yLabel: model.units?.force || 'kN' })));
    view.tables.push(table('ssElasticPDeltaMemberTable', '부재별 P-delta 진단', ['부재', '길이', 'δy', 'δz', '|δ|', 'N1', 'N2'],
      memberRows.map((item) => [
        item.memberId, formatLength(item.length, model), formatLength(item.localChordDriftY, model),
        formatLength(item.localChordDriftZ, model), formatLength(item.localChordDrift, model),
        formatNumber(item.firstOrderAxial), formatNumber(item.secondOrderAxial),
      ])));
  } else {
    const iterations = pDeltaIterations(comboRun);
    view.charts.push(chart('ssElasticPDeltaConvergenceChart', '반복 수렴 노름', buildMultiSeriesLineChart([
      convergenceSeries(iterations, 'translationIncrement', 'Δu'),
      convergenceSeries(iterations, 'rotationIncrement', 'Δr'),
      convergenceSeries(iterations, 'forceResidual', 'Rf'),
      convergenceSeries(iterations, 'momentResidual', 'Rm'),
    ], {
      id: 'ssElasticPDeltaConvergenceSvg', title: 'P-Delta convergence norms', xLabel: 'iteration', yLabel: 'log10(norm)', signedY: true,
    }), '서로 다른 차원의 수렴값은 직접 합치지 않고 각각 log10 값으로 비교합니다.'));
    view.tables.push(table('ssElasticPDeltaConvergenceTable', '반복 이력', ['스텝', '반복', 'λ', 'Δu', 'Δr', 'Rf', 'Rm', '상태'],
      iterations.slice(-24).map((row) => [
        row.step ?? '-', row.iteration ?? '-', formatNumber(row.lambda, 3),
        formatScientific(row.convergenceNorms?.translationIncrement),
        formatScientific(row.convergenceNorms?.rotationIncrement),
        formatScientific(row.convergenceNorms?.forceResidual),
        formatScientific(row.convergenceNorms?.momentResidual), row.status || '-',
      ])));
  }
  return view;
}

function modalView(model, analysisCase, result, state, base) {
  const payload = result.payload || {};
  const modes = payload.modes || [];
  const selectedIndex = clampIndex(state.modeOrStep, modes.length);
  const selected = modes[selectedIndex] || null;
  const tabs = tabList([
    ['shape', '모드형상'],
    ['participation', '질량참여율'],
    ['periods', '주기'],
  ], state.view || 'shape');
  const activeTab = activeTabId(tabs);
  const view = {
    ...base,
    method: payload.type || 'modal-lumped-mass',
    tabs,
    activeTab,
    modeOrStep: selectedIndex,
    modeOrStepMax: Math.max(0, modes.length - 1),
    controls: modes.length > 1 ? [rangeControl('mode-step', '모드', selectedIndex, 0, modes.length - 1, selected ? `Mode ${selected.index}` : '-')]: [],
    metrics: [
      metric('모드', selected?.index || '-'),
      metric('주기', selected ? `${formatNumber(selected.period, 4)} s` : '-'),
      metric('진동수', selected ? `${formatNumber(selected.frequencyHz, 3)} Hz` : '-'),
      metric('질량 X/Y', selected ? `${formatPercent(selected.participation?.x?.massRatio)} / ${formatPercent(selected.participation?.y?.massRatio)}` : '-'),
    ],
    sizeProfile: activeTab === 'shape' ? 'standard' : 'wide',
  };
  if (activeTab === 'shape') {
    view.structuralPreview = buildStructuralResultSvg(model, {
      id: 'ssElasticModalShapeSvg', title: `Mode ${selected?.index || '-'} shape`,
      displacements: selected?.shape || {}, selectedMemberId: state.selectedMemberId,
    });
    view.tables.push(table('ssElasticModalShapeTable', '선택 모드', ['Mode', 'T(s)', 'Hz', 'X 질량', 'Y 질량', 'Z 질량'], selected ? [[
      selected.index, formatNumber(selected.period, 4), formatNumber(selected.frequencyHz, 3),
      formatPercent(selected.participation?.x?.massRatio), formatPercent(selected.participation?.y?.massRatio),
      formatPercent(selected.participation?.z?.massRatio),
    ]] : []));
  } else if (activeTab === 'participation') {
    view.charts.push(chart('ssElasticModalParticipationChart', '모드별 유효 질량 참여율', buildGroupedBarChart(
      modes.map((mode) => ({
        label: String(mode.index),
        values: ['x', 'y', 'z'].map((direction) => ({
          label: direction.toUpperCase(), value: finite(mode.participation?.[direction]?.massRatio),
        })),
      })), { id: 'ssElasticModalParticipationSvg', title: 'Modal participating mass ratio', yLabel: 'ratio' },
    )));
    view.tables.push(table('ssElasticModalParticipationTable', '질량참여율', ['Mode', 'X', '누적 X', 'Y', '누적 Y', 'Z', '누적 Z'], cumulativeParticipationRows(modes)));
  } else {
    view.charts.push(chart('ssElasticModalPeriodChart', '고유주기', buildBarChart(
      modes.map((mode) => ({ label: String(mode.index), value: finite(mode.period) })),
      { id: 'ssElasticModalPeriodSvg', title: 'Natural periods', yLabel: 's', width: 440, height: 180 },
    )));
    view.tables.push(table('ssElasticModalPeriodTable', '고유치 결과', ['Mode', 'T(s)', 'Hz', 'ω(rad/s)'], modes.map((mode) => [
      mode.index, formatNumber(mode.period, 5), formatNumber(mode.frequencyHz, 4), formatNumber(mode.omega, 4),
    ])));
  }
  return view;
}

function rsaView(model, analysisCase, result, state, base) {
  const payload = result.payload || {};
  const directions = Object.keys(payload.combined || {});
  const direction = directions.includes(state.direction) ? state.direction : directions[0] || 'x';
  const combined = payload.combined?.[direction] || {};
  const tabs = tabList([
    ['response', '계산응답'],
    ['spectrum', '입력스펙트럼'],
    ['modes', '모드기여'],
    ['shape', '응답형상'],
  ], state.view || 'response');
  const activeTab = activeTabId(tabs);
  const view = {
    ...base,
    method: payload.method || result.settings?.spectrum?.method || 'SRSS',
    tabs,
    activeTab,
    controls: directions.length > 1
      ? [segmentedControl('direction', '방향', direction, directions.map((item) => [item, item.toUpperCase()]))]
      : [],
    metrics: [
      metric('조합법', payload.method || '-'),
      metric('방향', direction.toUpperCase()),
      metric('밑면전단력', formatForce(combined.baseShear ?? combined.rsaBaseShear, model)),
      metric('최대변위', formatLength(combined.displacement ?? combined.combinedDisplacement, model)),
    ],
    notes: payload.designBlocked ? ['현재 RSA 결과의 일부 회복 범위가 예비 또는 미지원이므로 설계 전달 조건을 별도로 확인해야 합니다.'] : [],
    sizeProfile: activeTab === 'shape' ? 'standard' : 'wide',
  };
  if (activeTab === 'response') {
    view.charts.push(chart('ssElasticRsaBaseShearChart', '방향별 밑면전단력', buildBarChart(
      directions.map((item) => ({ label: item.toUpperCase(), value: finite(payload.combined?.[item]?.baseShear ?? payload.combined?.[item]?.rsaBaseShear) })),
      { id: 'ssElasticRsaBaseShearSvg', title: 'RSA base shear', yLabel: model.units?.force || 'kN', width: 440, height: 175 },
    )));
    view.charts.push(chart('ssElasticRsaDisplacementChart', '방향별 최대변위', buildBarChart(
      directions.map((item) => ({ label: item.toUpperCase(), value: finite(payload.combined?.[item]?.displacement ?? payload.combined?.[item]?.combinedDisplacement) })),
      { id: 'ssElasticRsaDisplacementSvg', title: 'RSA displacement', yLabel: model.units?.length || 'm', width: 440, height: 175 },
    )));
    view.tables.push(table('ssElasticRsaResponseTable', '조합 응답', ['방향', '방법', '변위', '밑면전단력', '질량참여율', '부재력 회복'], directions.map((item) => {
      const row = payload.combined?.[item] || {};
      return [item.toUpperCase(), row.method || payload.method || '-', formatLength(row.displacement ?? row.combinedDisplacement, model),
        formatForce(row.baseShear ?? row.rsaBaseShear, model), formatPercent(row.participatingMassRatio), row.memberForceRecoveryStatus || '-'];
    })));
  } else if (activeTab === 'spectrum') {
    const points = payload.spectrum?.points || [];
    view.charts.push(chart('ssElasticRsaSpectrumChart', '입력 응답스펙트럼', buildMultiSeriesLineChart([{
      label: 'Sa',
      points: points.map((point, index) => ({ x: finite(point.period ?? point.t ?? index), y: finite(point.sa ?? point.acceleration ?? point.y) })),
    }], { id: 'ssElasticRsaSpectrumSvg', title: 'Input response spectrum', xLabel: 'T(s)', yLabel: 'Sa' })));
    view.tables.push(table('ssElasticRsaSpectrumTable', '스펙트럼 점', ['T(s)', 'Sa'], points.map((point) => [
      formatNumber(point.period ?? point.t), formatNumber(point.sa ?? point.acceleration ?? point.y),
    ])));
  } else if (activeTab === 'modes') {
    const modal = payload.modal?.find((item) => item.direction === direction) || { responses: [] };
    view.charts.push(chart('ssElasticRsaModalChart', `${direction.toUpperCase()} 방향 모드별 변위`, buildBarChart(
      (modal.responses || []).map((row) => ({ label: String(row.modeIndex ?? row.mode), value: finite(row.displacement) })),
      { id: 'ssElasticRsaModalSvg', title: 'RSA modal displacement', yLabel: model.units?.length || 'm', width: 440, height: 175 },
    )));
    view.charts.push(chart('ssElasticRsaModalBaseShearChart', `${direction.toUpperCase()} 방향 모드별 밑면전단력`, buildBarChart(
      (modal.responses || []).map((row) => ({ label: String(row.modeIndex ?? row.mode), value: finite(row.baseShear) })),
      { id: 'ssElasticRsaModalBaseShearSvg', title: 'RSA modal base shear', yLabel: model.units?.force || 'kN', width: 440, height: 175 },
    )));
    view.tables.push(table('ssElasticRsaModalTable', '모드별 응답', ['Mode', 'T(s)', 'Sa', 'γ', '변위', '밑면전단력', '질량비'],
      (modal.responses || []).map((row) => [
        row.modeIndex ?? row.mode, formatNumber(row.period, 4), formatNumber(row.sa, 4), formatNumber(row.gamma, 4),
        formatLength(row.displacement, model), formatForce(row.baseShear, model), formatPercent(row.massRatio),
      ])));
  } else {
    view.structuralPreview = buildStructuralResultSvg(model, {
      id: 'ssElasticRsaShapeSvg', title: `${direction.toUpperCase()} combined RSA displacement`,
      displacements: combined.nodeDisplacements || rowsToDisplacementMap(combined.nodalDisplacements),
      selectedMemberId: state.selectedMemberId,
    });
    view.tables.push(table('ssElasticRsaNodeTable', '절점 조합변위', ['절점', 'dx', 'dy', 'dz'],
      displacementRows(combined.nodeDisplacements || rowsToDisplacementMap(combined.nodalDisplacements), model).slice(0, 16)));
  }
  return view;
}

function bucklingView(model, analysisCase, result, state, base) {
  const payload = result.payload || {};
  const modes = payload.modes || [];
  const selectedIndex = clampIndex(state.modeOrStep, modes.length);
  const selected = modes[selectedIndex] || payload.primaryMode || null;
  const tabs = tabList([
    ['shape', '좌굴형상'],
    ['factors', '고유값'],
    ['preload', '선행축력'],
  ], state.view || 'shape');
  const activeTab = activeTabId(tabs);
  const view = {
    ...base,
    method: payload.method || 'elastic-eigen-buckling',
    tabs,
    activeTab,
    modeOrStep: selectedIndex,
    modeOrStepMax: Math.max(0, modes.length - 1),
    controls: modes.length > 1 ? [rangeControl('mode-step', '좌굴모드', selectedIndex, 0, modes.length - 1, selected ? `Mode ${selected.mode}` : '-')]: [],
    metrics: [
      metric('모드', selected?.mode || '-'),
      metric('λcr', formatNumber(selected?.loadFactor ?? payload.criticalLoadFactor, 4)),
      metric('잔차', formatScientific(selected?.residual ?? payload.residual)),
      metric('상태', payload.status || statusLabel(result.status), payload.status === 'available' ? 'ok' : 'warn'),
    ],
    notes: payload.limitations || [],
    sizeProfile: activeTab === 'shape' ? 'standard' : 'wide',
  };
  if (activeTab === 'shape') {
    view.structuralPreview = buildStructuralResultSvg(model, {
      id: 'ssElasticBucklingShapeSvg', title: `Buckling mode ${selected?.mode || '-'}`,
      displacements: bucklingDisplacementMap(model, selected), selectedMemberId: state.selectedMemberId,
    });
  } else if (activeTab === 'factors') {
    view.charts.push(chart('ssElasticBucklingFactorChart', '좌굴 하중계수', buildBarChart(
      modes.map((mode) => ({ label: String(mode.mode), value: finite(mode.loadFactor) })),
      { id: 'ssElasticBucklingFactorSvg', title: 'Buckling load factors', yLabel: 'lambda', width: 440, height: 180 },
    )));
    view.tables.push(table('ssElasticBucklingFactorTable', '좌굴 고유값', ['Mode', 'λcr', '잔차', '수렴'], modes.map((mode) => [
      mode.mode, formatNumber(mode.loadFactor, 6), formatScientific(mode.residual), mode.converged === false ? 'NG' : 'OK',
    ])));
  } else {
    const rows = payload.referenceCompression || [];
    view.charts.push(chart('ssElasticBucklingPreloadChart', '부재 압축 선행력', buildBarChart(
      topMagnitudeRows(rows.map((row) => ({ label: row.memberId, value: finite(row.compression) })), 16),
      { id: 'ssElasticBucklingPreloadSvg', title: 'Buckling preload compression', yLabel: model.units?.force || 'kN', width: 440, height: 180 },
    )));
    view.tables.push(table('ssElasticBucklingPreloadTable', '선행 정적해석 축력', ['부재', '압축력', '조합', '출처'], rows.map((row) => [
      row.memberId, formatForce(row.compression, model), row.combinationId || '-', row.source || '-',
    ])));
  }
  return view;
}

function linearThaView(model, analysisCase, result, state, base) {
  const payload = result.payload || {};
  const tabs = tabList([
    ['displacement', '변위'],
    ['velocity', '속도'],
    ['acceleration', '가속도'],
    ['record', '입력기록'],
  ], state.view || 'displacement');
  const activeTab = activeTabId(tabs);
  const component = activeTab === 'record' ? 'groundAcceleration' : activeTab;
  const rows = combinedThaRows(payload, component);
  const selectedStep = clampIndex(state.modeOrStep, rows.length);
  const selected = rows[selectedStep] || null;
  const units = payload.units || {};
  const unit = units[component] || (component === 'acceleration' ? units.relativeAcceleration : null) || '-';
  const view = {
    ...base,
    method: payload.method || 'linear-modal-superposition-newmark',
    tabs,
    activeTab,
    modeOrStep: selectedStep,
    modeOrStepMax: Math.max(0, rows.length - 1),
    controls: rows.length > 1 ? [rangeControl('mode-step', '시간스텝', selectedStep, 0, rows.length - 1, selected ? `${formatNumber(selected.time, 3)} s` : '-')]: [],
    metrics: [
      metric('방향', String(payload.direction || '-').toUpperCase()),
      metric('시각', selected ? `${formatNumber(selected.time, 4)} s` : '-'),
      metric('현재값', selected ? `${formatNumber(selected.value, 5)} ${unit}` : '-'),
      metric('최대 절대값', rows.length ? `${formatNumber(Math.max(...rows.map((row) => Math.abs(row.value))), 5)} ${unit}` : '-'),
    ],
    notes: ['선형 THA는 모드중첩 Newmark 예비 결과이며 전체 구조 응답의 독립 실증 완료 전에는 설계 전달이 차단됩니다.'],
    sizeProfile: 'wide',
  };
  view.charts.push(chart('ssElasticThaChart', thaComponentLabel(component), buildMultiSeriesLineChart([{
    label: thaComponentLabel(component),
    points: rows.map((row) => ({ x: row.time, y: row.value })),
  }], {
    id: 'ssElasticThaSvg', title: thaComponentLabel(component), xLabel: 't(s)', yLabel: unit, signedY: true,
  })));
  view.tables.push(table('ssElasticThaTable', '시간응답', ['Step', 't(s)', thaComponentLabel(component)], rows.slice(0, 80).map((row) => [
    row.step, formatNumber(row.time, 4), formatNumber(row.value, 6),
  ])));
  return view;
}

export function buildStructuralResultSvg(model = {}, options = {}) {
  const nodes = model.nodes || [];
  const members = model.members || [];
  if (!nodes.length || !members.length) return null;
  const displacementMap = normalizeDisplacementMap(options.displacements);
  const maxDisplacement = maxNodeDisplacement(displacementMap);
  const modelDiagonal = coordinateDiagonal(nodes);
  const scale = maxDisplacement > 0 ? Math.max(modelDiagonal, 1) * 0.12 / maxDisplacement : 1;
  const base = new Map(nodes.map((node) => [node.id, point3(node)]));
  const displaced = new Map(nodes.map((node) => {
    const d = displacementMap[node.id] || [0, 0, 0];
    return [node.id, {
      x: finite(node.x) + finite(d[0]) * scale,
      y: finite(node.y) + finite(d[1]) * scale,
      z: finite(node.z) + finite(d[2]) * scale,
    }];
  }));
  const projected = [...base.values(), ...displaced.values()].map(projectIso);
  const bounds = pointBounds(projected);
  const width = 440;
  const height = 230;
  const pad = 18;
  const fit = (point) => {
    const projectedPoint = projectIso(point);
    const sx = (width - pad * 2) / Math.max(1e-9, bounds.maxX - bounds.minX);
    const sy = (height - pad * 2) / Math.max(1e-9, bounds.maxY - bounds.minY);
    const fitScale = Math.min(sx, sy);
    const usedWidth = (bounds.maxX - bounds.minX) * fitScale;
    const usedHeight = (bounds.maxY - bounds.minY) * fitScale;
    return {
      x: (width - usedWidth) / 2 + (projectedPoint.x - bounds.minX) * fitScale,
      y: (height - usedHeight) / 2 + (projectedPoint.y - bounds.minY) * fitScale,
    };
  };
  const memberLines = (nodeMap, color, dash, opacity, resultLine) => members.map((member) => {
    const a = nodeMap.get(member.n1);
    const b = nodeMap.get(member.n2);
    if (!a || !b) return '';
    const p1 = fit(a);
    const p2 = fit(b);
    const selected = member.id === options.selectedMemberId;
    return `<line data-member-id="${escapeAttr(member.id)}" x1="${round(p1.x)}" y1="${round(p1.y)}" x2="${round(p2.x)}" y2="${round(p2.y)}" stroke="${selected ? '#d88716' : color}" stroke-width="${selected ? 3.5 : resultLine ? 2.4 : 1.2}"${dash ? ` stroke-dasharray="${dash}"` : ''} opacity="${opacity}"/>`;
  }).join('');
  const nodeDots = nodes.map((node) => {
    const point = fit(displaced.get(node.id));
    return `<circle cx="${round(point.x)}" cy="${round(point.y)}" r="2.2" fill="#005a8d"><title>${escapeText(node.id)}</title></circle>`;
  }).join('');
  const title = options.title || 'Structural result shape';
  const svg = `<svg id="${escapeAttr(options.id || 'ssElasticStructuralShapeSvg')}" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${escapeAttr(title)}" preserveAspectRatio="xMidYMid meet"><rect width="${width}" height="${height}" fill="#fbfdff"/>${memberLines(base, '#8798a8', '', 0.42, false)}${memberLines(displaced, '#005a8d', '6 3', 0.95, true)}${nodeDots}<g font-family="Segoe UI,Arial,sans-serif" font-size="9" fill="#5c6d7f"><line x1="16" y1="16" x2="34" y2="16" stroke="#8798a8"/><text x="38" y="19">원형상</text><line x1="85" y1="16" x2="103" y2="16" stroke="#005a8d" stroke-width="2" stroke-dasharray="6 3"/><text x="107" y="19">결과형상</text><text x="${width - 12}" y="19" text-anchor="end">scale ${formatNumber(scale, 2)}</text></g></svg>`;
  return {
    id: options.id || 'ssElasticStructuralShapeSvg',
    title,
    svg,
    scale,
    maxDisplacement,
    nodeCount: nodes.length,
    memberCount: members.length,
  };
}

function pickStaticResult(payload) {
  return payload.pDelta?.envelope
    || payload.envelope
    || Object.values(payload.byCombo || {}).find((item) => item?.ok)
    || Object.values(payload.byCombo || {})[0]
    || null;
}

function pDeltaComboIds(pDelta) {
  return [...new Set([
    ...Object.keys(pDelta.byCombo || {}),
    ...(pDelta.graphs?.global || []).map((item) => item.comboId),
    ...(pDelta.curves?.global || []).map((item) => item.comboId),
  ].filter(Boolean))];
}

function pDeltaGlobalSeries(pDelta, selectedComboId) {
  const series = [];
  const graphs = pDelta.graphs?.global || pDelta.curves?.global || [];
  for (const graph of graphs) {
    const colorIndex = Math.max(0, pDeltaComboIds(pDelta).indexOf(graph.comboId));
    series.push({
      label: `${graph.comboId} 2차`,
      color: PALETTE[colorIndex % PALETTE.length],
      points: (graph.points || []).map((point) => ({
        x: finite(point.loadFactor),
        y: finite(point.maxDisplacement ?? point.secondOrder?.roofDisplacement ?? point.secondOrderRoofDisplacement),
      })),
    });
    if (graph.comboId === selectedComboId) {
      const run = pDelta.byCombo?.[graph.comboId] || {};
      const firstMax = maxLateralNodeDisplacement(run.linear?.disp || run.linear?.nodeDisplacements || {});
      const firstPoints = (graph.points || []).map((point) => ({
        x: finite(point.loadFactor),
        y: point.firstOrder?.roofDisplacement != null
          ? finite(point.firstOrder.roofDisplacement)
          : point.firstOrderRoofDisplacement != null
            ? finite(point.firstOrderRoofDisplacement)
            : firstMax * finite(point.loadFactor),
      }));
      if (firstPoints.some((point) => point.y !== 0)) series.push({
        label: `${graph.comboId} 1차`, color: PALETTE[colorIndex % PALETTE.length], dash: '5 4', points: firstPoints,
      });
    }
  }
  if (series.length) return series;
  for (const [comboId, run] of Object.entries(pDelta.byCombo || {})) {
    const legacyPoints = run.curve?.global?.points || [];
    series.push({
      label: `${comboId} 2차`,
      points: legacyPoints.map((point) => ({ x: finite(point.loadFactor), y: finite(point.secondOrder?.roofDisplacement) })),
    });
    if (comboId === selectedComboId) series.push({
      label: `${comboId} 1차`, dash: '5 4',
      points: legacyPoints.map((point) => ({ x: finite(point.loadFactor), y: finite(point.firstOrder?.roofDisplacement) })),
    });
  }
  return series;
}

function pDeltaGlobalRows(pDelta) {
  const graphs = pDelta.graphs?.global || pDelta.curves?.global || [];
  if (graphs.length) return graphs.flatMap((graph) => (graph.points || []).map((point) => ({ comboId: graph.comboId, ...point })));
  return Object.entries(pDelta.byCombo || {}).flatMap(([comboId, run]) => (run.curve?.global?.points || []).map((point) => ({
    comboId,
    loadFactor: point.loadFactor,
    maxDisplacement: point.secondOrder?.roofDisplacement,
    iterationCount: point.iterationCount,
    converged: run.converged,
  })));
}

function pDeltaIterations(run) {
  if (!run) return [];
  if (Array.isArray(run.iterations) && run.iterations.length) return run.iterations;
  return (run.steps || []).flatMap((step) => (step.iterations || []).map((iteration) => ({ step: step.step, ...iteration })));
}

function convergenceSeries(iterations, key, label) {
  return {
    label,
    points: iterations.map((row, index) => ({
      x: index + 1,
      y: Math.log10(Math.max(1e-16, Math.abs(finite(row.convergenceNorms?.[key])))),
    })),
  };
}

function cumulativeParticipationRows(modes) {
  const cumulative = { x: 0, y: 0, z: 0 };
  return modes.map((mode) => {
    const values = Object.fromEntries(['x', 'y', 'z'].map((direction) => {
      const value = finite(mode.participation?.[direction]?.massRatio);
      cumulative[direction] += value;
      return [direction, value];
    }));
    return [mode.index, formatPercent(values.x), formatPercent(cumulative.x), formatPercent(values.y), formatPercent(cumulative.y), formatPercent(values.z), formatPercent(cumulative.z)];
  });
}

function bucklingDisplacementMap(model, mode) {
  if (!mode) return {};
  if (Array.isArray(mode.dofValues)) {
    const map = {};
    for (const row of mode.dofValues) {
      if (!row.nodeId || !['ux', 'uy', 'uz'].includes(row.component)) continue;
      map[row.nodeId] ||= [0, 0, 0];
      map[row.nodeId][['ux', 'uy', 'uz'].indexOf(row.component)] = finite(row.value);
    }
    return map;
  }
  const vector = mode.fullModeShape || [];
  return Object.fromEntries((model.nodes || []).map((node, index) => [node.id, [
    finite(vector[index * 6]), finite(vector[index * 6 + 1]), finite(vector[index * 6 + 2]),
  ]]));
}

function combinedThaRows(payload, component) {
  if (component === 'displacement') return (payload.rows || []).map((row, index) => ({
    step: row.step ?? index, time: finite(row.time ?? index * payload.time?.dt), value: finite(row.displacement),
  }));
  const modal = payload.modal || [];
  const count = Math.max(payload.rows?.length || 0, ...modal.map((item) => item.trace?.rows?.length || 0));
  return Array.from({ length: count }, (_item, index) => {
    if (component === 'groundAcceleration') {
      const row = modal[0]?.trace?.rows?.[index] || {};
      return { step: index, time: finite(row.time ?? index * payload.time?.dt), value: finite(row.groundAcceleration) };
    }
    const value = modal.reduce((sum, item) => sum + finite(item.gamma, 1) * finite(item.trace?.rows?.[index]?.[component]), 0);
    return { step: index, time: finite(payload.rows?.[index]?.time ?? index * payload.time?.dt), value };
  });
}

function reactionRows(reactions) {
  return Object.entries(reactions || {}).map(([nodeId, row]) => ({
    nodeId,
    fx: finite(row.rx ?? row.fx ?? row.x),
    fy: finite(row.ry ?? row.fy ?? row.y),
    fz: finite(row.rz ?? row.fz ?? row.z),
    mx: finite(row.rmx ?? row.mx),
    my: finite(row.rmy ?? row.my),
    mz: finite(row.rmz ?? row.mz),
  }));
}

function displacementRows(displacements, model) {
  const map = normalizeDisplacementMap(displacements);
  return Object.entries(map).map(([nodeId, row]) => [nodeId, ...row.slice(0, 3).map((value) => formatLength(value, model))]);
}

function rowsToDisplacementMap(rows) {
  return Object.fromEntries((rows || []).map((row) => [row.nodeId, row.vector || [row.x, row.y, row.z]]));
}

function normalizeDisplacementMap(input) {
  if (!input || typeof input !== 'object') return {};
  if (Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input).map(([nodeId, value]) => {
    if (Array.isArray(value)) return [nodeId, value.slice(0, 3).map((item) => finite(item))];
    if (Array.isArray(value?.vector)) return [nodeId, value.vector.slice(0, 3).map((item) => finite(item))];
    return [nodeId, [finite(value?.x ?? value?.dx), finite(value?.y ?? value?.dy), finite(value?.z ?? value?.dz)]];
  }));
}

function maxNodeDisplacement(displacements) {
  const map = normalizeDisplacementMap(displacements);
  return Math.max(0, ...Object.values(map).map((row) => Math.hypot(finite(row[0]), finite(row[1]), finite(row[2]))));
}

function maxLateralNodeDisplacement(displacements) {
  const map = normalizeDisplacementMap(displacements);
  return Math.max(0, ...Object.values(map).map((row) => Math.hypot(finite(row[0]), finite(row[1]))));
}

function coordinateDiagonal(nodes) {
  if (!nodes.length) return 1;
  const xs = nodes.map((node) => finite(node.x));
  const ys = nodes.map((node) => finite(node.y));
  const zs = nodes.map((node) => finite(node.z));
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), Math.max(...zs) - Math.min(...zs));
}

function point3(value) {
  return { x: finite(value.x), y: finite(value.y), z: finite(value.z) };
}

function projectIso(point) {
  return {
    x: finite(point.x) - finite(point.y) * 0.72,
    y: -finite(point.z) + (finite(point.x) + finite(point.y)) * 0.24,
  };
}

function pointBounds(points) {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function topMagnitudeRows(rows, limit) {
  return [...rows].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, limit);
}

function validMemberId(memberId, rows) {
  return memberId && rows.some((row) => row.memberId === memberId) ? memberId : null;
}

function staticComponent(value) {
  return ['N', 'Vy', 'Vz', 'Tq', 'My', 'Mz'].includes(value) ? value : 'Mz';
}

function forceComponentUnit(component) {
  return ['My', 'Mz', 'Tq'].includes(component) ? 'moment' : 'force';
}

function amplification(first, second) {
  const a = Math.abs(finite(first));
  return a > 0 ? Math.abs(finite(second)) / a : 0;
}

function thaComponentLabel(component) {
  return {
    displacement: '변위 시간이력',
    velocity: '속도 시간이력',
    acceleration: '상대가속도 시간이력',
    groundAcceleration: '입력 지반가속도',
  }[component] || component;
}

function tabList(rows, selected) {
  const active = rows.some(([id]) => id === selected) ? selected : rows[0]?.[0];
  return rows.map(([id, label]) => ({ id, label, active: id === active }));
}

function activeTabId(tabs) {
  return tabs.find((tab) => tab.active)?.id || tabs[0]?.id || null;
}

function metric(label, value, tone = '') {
  return { label, value: String(value ?? '-'), tone };
}

function chart(id, title, chartResult, caption = '') {
  return { id, title, caption, chart: chartResult, svg: chartResult?.svg || '' };
}

function table(id, title, columns, rows) {
  return { id, title, columns, rows };
}

function segmentedControl(id, label, value, options) {
  return { type: 'segmented', id, label, value, options: options.map(([optionValue, optionLabel]) => ({ value: optionValue, label: optionLabel })) };
}

function selectControl(id, label, value, options) {
  return { type: 'select', id, label, value: value || '', options: options.map(([optionValue, optionLabel]) => ({ value: optionValue, label: optionLabel })) };
}

function rangeControl(id, label, value, min, max, valueLabel) {
  return { type: 'range', id, label, value, min, max, step: 1, valueLabel };
}

function clampIndex(value, length) {
  if (!length) return 0;
  return Math.max(0, Math.min(length - 1, Math.trunc(finite(value))));
}

function formatLength(value, model) {
  const number = finiteOrNull(value);
  if (number == null) return '-';
  const unit = model?.units?.length || model?.unitSystem?.internal?.length || 'm';
  if (unit === 'm') return `${formatNumber(number * 1000, 3)} mm`;
  return `${formatNumber(number, 4)} ${unit}`;
}

function formatForce(value, model) {
  const number = finiteOrNull(value);
  return number == null ? '-' : `${formatNumber(number, 3)} ${model?.units?.force || 'kN'}`;
}

function formatPercent(value) {
  const number = finiteOrNull(value);
  return number == null ? '-' : `${formatNumber(number * 100, 2)}%`;
}

function formatScientific(value) {
  const number = finiteOrNull(value);
  return number == null ? '-' : number.toExponential(2);
}

function formatNumber(value, digits = 3) {
  const number = finiteOrNull(value);
  if (number == null) return '-';
  if (number !== 0 && (Math.abs(number) < 1e-4 || Math.abs(number) >= 1e6)) return number.toExponential(2);
  return number.toFixed(digits).replace(/\.?0+$/, '');
}

function statusLabel(status) {
  return {
    ok: '완료',
    preliminary: '예비',
    failed: '실패',
    stale: '재실행 필요',
    'review-required': '검토 필요',
    designBlocked: '설계전달 차단',
    'not-run': '미실행',
  }[status] || status || '-';
}

function statusTone(status) {
  if (status === 'ok') return 'ok';
  if (['failed', 'designBlocked'].includes(status)) return 'ng';
  if (['preliminary', 'stale', 'review-required'].includes(status)) return 'warn';
  return '';
}

function ratioStatus(ratio) {
  if (ratio >= 1) return 'NG';
  if (ratio >= 0.7) return 'Review';
  return 'OK';
}

function kindLabel(kind) {
  return {
    static: '정적해석',
    modal: '모달해석',
    responseSpectrum: '응답스펙트럼해석',
    buckling: '탄성 고유치 좌굴',
    linearTha: '선형 시간이력',
  }[kind] || '탄성해석 결과';
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value) {
  return Number(value).toFixed(1);
}

function escapeAttr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeText(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
