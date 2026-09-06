export const MEMBRANE_WORKFLOW_REPORT_VERSION = 'p14-m5-membrane-workflow-report-v1';

export function buildMembraneWorkflowReport(input = {}) {
  const mesh = input.mesh || null;
  const field = input.field || null;
  const probes = Array.from(input.probes || []);
  const loads = Array.from(input.loads || (input.load ? [input.load] : []));
  const comparison = input.comparison || null;
  return {
    version: MEMBRANE_WORKFLOW_REPORT_VERSION,
    available: Boolean(mesh && field),
    mesh: mesh ? {
      id: mesh.id,
      meshHash: mesh.meshHash,
      nodeCount: mesh.nodes?.length || 0,
      elementCount: mesh.elements?.length || 0,
      lineage: mesh.lineage,
      geometry: mesh.geometry,
    } : null,
    result: field ? {
      resultHash: field.resultHash,
      formulation: field.formulation,
      integrationPointCount: field.integrationPoints?.length || 0,
      averagedNodeCount: field.averagedNodes?.length || 0,
      resultKinds: field.resultKinds || [],
      stressRange: stressRange(field.integrationPoints || []),
    } : null,
    probes: probes.map((row) => ({ id: row.probeId, elementId: row.elementId, xi: row.xi, eta: row.eta, ...row.stress, probeHash: row.probeHash })),
    loads: loads.map((row) => ({ edge: row.edge, resultant: row.resultant, momentAboutOrigin: row.momentAboutOrigin, equilibriumResidual: row.equilibriumResidual, loadHash: row.loadHash })),
    comparison,
    benchmarkExecutionStarted: false,
    designTransferAllowed: false,
    limitations: [
      'Membrane workflow results remain implementation evidence until SB2 independent qualification is executed.',
      'Raw integration-point, extrapolated and averaged stresses are reported as distinct result kinds.',
    ],
  };
}

function stressRange(rows) {
  return Object.fromEntries(['sx', 'sy', 'txy'].map((key) => [key, {
    min: rows.length ? Math.min(...rows.map((row) => Number(row[key]))) : null,
    max: rows.length ? Math.max(...rows.map((row) => Number(row[key]))) : null,
  }]));
}
