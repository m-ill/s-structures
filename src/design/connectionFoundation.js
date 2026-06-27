export const CONNECTION_FOUNDATION_VERSION = 'm41-connection-foundation';

export function buildConnectionFoundationReport(model, analysis, options = {}) {
  const result = options.resultSet || analysis?.pDelta?.envelope || analysis?.envelope || firstResult(analysis);
  const assumptions = {
    allowableBearing: finite(options.allowableBearing, model?.foundationParams?.allowableBearing, 150),
    frictionCoefficient: finite(options.frictionCoefficient, model?.foundationParams?.frictionCoefficient, 0.45),
    nominalConnectionCapacity: finite(options.nominalConnectionCapacity, model?.connectionParams?.nominalCapacity, 250),
  };
  const connectionRows = buildConnectionRows(model, result, assumptions);
  const foundationRows = buildFoundationRows(model, result, assumptions);
  return {
    version: CONNECTION_FOUNDATION_VERSION,
    summary: {
      connectionCount: connectionRows.length,
      foundationCount: foundationRows.length,
      maxConnectionUtilization: connectionRows.reduce((max, row) => Math.max(max, row.utilization), 0),
      maxBearingRatio: foundationRows.reduce((max, row) => Math.max(max, row.bearingRatio), 0),
      maxSlidingRatio: foundationRows.reduce((max, row) => Math.max(max, row.slidingRatio), 0),
      warningCount: [...connectionRows, ...foundationRows].filter((row) => row.status !== 'OK').length,
    },
    connectionRows,
    foundationRows,
    assumptions,
    limitations: [
      'Connection rows are design-force envelopes, not final bolt, weld, plate, or rebar anchorage designs.',
      'Foundation rows are preliminary bearing/sliding screens based on support reactions.',
      'Soil report, settlement, uplift anchorage, punching, reinforcement, and constructability checks remain project-specific work.',
    ],
  };
}

function buildConnectionRows(model, result, assumptions) {
  const rows = [];
  for (const member of model?.members || []) {
    const forces = result?.memberResults?.[member.id];
    if (!forces) continue;
    const demands = {
      axial: finite(forces.Nmax),
      shearY: finite(forces.Vymax),
      shearZ: finite(forces.Vzmax),
      torsion: finite(forces.Tmax),
      momentY: finite(forces.Mymax),
      momentZ: finite(forces.Mzmax),
    };
    const equivalent = Math.hypot(demands.axial, demands.shearY, demands.shearZ)
      + Math.hypot(demands.momentY, demands.momentZ) * 0.05;
    const utilization = assumptions.nominalConnectionCapacity > 0 ? equivalent / assumptions.nominalConnectionCapacity : 0;
    rows.push({
      memberId: member.id,
      n1: member.n1,
      n2: member.n2,
      materialId: member.matId || null,
      sectionId: member.secId || null,
      demands,
      equivalentDemand: equivalent,
      utilization,
      status: statusForRatio(utilization),
      action: utilization > 1
        ? 'Connection capacity must be explicitly designed.'
        : 'Carry forces to bolt/weld/plate design.',
    });
  }
  return rows;
}

function buildFoundationRows(model, result, assumptions) {
  const allowableBearing = assumptions.allowableBearing;
  const frictionCoefficient = assumptions.frictionCoefficient;
  const supportedNodes = (model?.nodes || []).filter((node) => node.support);
  return supportedNodes.map((node) => {
    const reaction = result?.reactions?.[node.id] || {};
    const vertical = Math.abs(finite(reaction.rz));
    const horizontal = Math.hypot(finite(reaction.rx), finite(reaction.ry));
    const moment = Math.hypot(finite(reaction.rmx), finite(reaction.rmy), finite(reaction.rmz));
    const requiredArea = allowableBearing > 0 ? vertical / allowableBearing : 0;
    const slidingCapacity = vertical * frictionCoefficient;
    const slidingRatio = slidingCapacity > 0 ? horizontal / slidingCapacity : 0;
    const bearingRatio = requiredArea > 0 ? 1 : 0;
    const uplift = finite(reaction.rz) < 0;
    const status = uplift || slidingRatio > 1 ? 'NG' : slidingRatio > 0.8 ? 'WARN' : 'OK';
    return {
      nodeId: node.id,
      support: node.support,
      reaction: {
        vertical,
        horizontal,
        moment,
        rx: finite(reaction.rx),
        ry: finite(reaction.ry),
        rz: finite(reaction.rz),
      },
      allowableBearing,
      requiredArea,
      equivalentSquareSize: Math.sqrt(Math.max(0, requiredArea)),
      slidingRatio,
      bearingRatio,
      uplift,
      status,
      action: uplift
        ? 'Check uplift anchorage and footing weight.'
        : slidingRatio > 1
          ? 'Increase footing weight, key, pile, or lateral resistance.'
          : 'Carry reactions to footing and geotechnical design.',
    };
  });
}

function firstResult(analysis) {
  return Object.values(analysis?.byCombo || {})[0] || null;
}

function statusForRatio(ratio) {
  if (ratio > 1) return 'NG';
  if (ratio > 0.8) return 'WARN';
  return 'OK';
}

function finite(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}
