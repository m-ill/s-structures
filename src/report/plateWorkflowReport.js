export const PLATE_WORKFLOW_REPORT_VERSION = 'p14-m7-plate-workflow-report-v1';

export function buildPlateWorkflowReport(input = {}) {
  const mesh = input.mesh || null;
  const run = input.run || null;
  const comparison = input.comparison || null;
  const qualification = input.qualification || null;
  return {
    version: PLATE_WORKFLOW_REPORT_VERSION,
    available: Boolean(mesh && run),
    mesh: mesh ? {
      id: mesh.id,
      meshHash: mesh.meshHash,
      nodeCount: mesh.nodes?.length || 0,
      elementCount: mesh.elements?.length || 0,
      lineage: mesh.lineage,
      geometry: mesh.plateGeometry,
      quality: mesh.geometry,
    } : null,
    analysis: run ? {
      runHash: run.runHash,
      formulation: run.formulation,
      support: run.support,
      center: run.center,
      dimensionlessCoefficient: run.dimensionlessCoefficient,
      load: run.load,
      energy: run.energy,
      factorizationDisposed: run.factorization?.disposed === true,
    } : null,
    comparison,
    qualification: qualification ? {
      version: qualification.version,
      qualificationHash: qualification.qualificationHash,
      status: qualification.status,
      reasonCodes: qualification.reasonCodes,
      geometry: qualification.geometry,
      constitutive: qualification.constitutive,
      energy: qualification.energy,
      lockingDiagnostic: qualification.lockingDiagnostic,
    } : null,
    benchmarkExecutionStarted: false,
    designTransferAllowed: false,
    limitations: [
      'Plate workflow results remain implementation evidence until SB5 independent qualification is executed.',
      'Model-level mesh convergence is required before engineering design transfer.',
      'Central point load is a mathematical nodal or isoparametric load and does not represent punching behavior.',
    ],
  };
}
