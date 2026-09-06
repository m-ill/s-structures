import { classifySteelSection } from './classify.js';
import { checkSteelBrace } from './brace.js';
import { checkSteelCompression } from './compression.js';
import { checkSteelFlexureLtb } from './flexureLTB.js';
import { checkSteelInteraction } from './interaction.js';
import { collectDesignFormulaReferences } from '../../standards/designFormulaRegistry.js';

export const STEEL_DETAILED_DESIGN_VERSION = 'p3-m18-steel-detailed-design';

export function buildSteelDetailedDesignReport(model, analysis, options = {}) {
  const rows = Object.values(analysis?.design?.steel?.memberResults || {})
    .map((check) => detailSteelMemberP3(check, options))
    .sort((a, b) => a.memberId.localeCompare(b.memberId));
  return {
    version: STEEL_DETAILED_DESIGN_VERSION,
    contract: {
      milestone: 'P3-M18',
      tickets: ['P3-T91'],
      scope: 'Steel member classification, compression, flexure LTB, shear/brace, interaction, and serviceability-ready schedule trace.',
    },
    modelName: model?.meta?.name || null,
    summary: summarize(rows),
    rows,
    formulaTrace: rows.flatMap((row) => collectFormula(row)),
    limitations: [
      'P3-M18 steel member checks are traceable detailed-review rows based on current elastic design demand.',
      'P10-M8 elastic Mcr is a design-check value; it does not add a warping DOF or produce warping stress analysis results.',
      'Local buckling tables, bracing plans, fabrication details, and final seismic detailing remain engineer review items.',
    ],
  };
}

export function detailSteelMemberP3(check = {}, options = {}) {
  const classification = classifySteelSection(check);
  const compression = checkSteelCompression(check);
  const flexureLtb = check.ltb || checkSteelFlexureLtb(check, options);
  const interaction = checkSteelInteraction(check);
  const brace = check.role === 'brace' ? checkSteelBrace(check) : null;
  const status = worst([check.status, compression.status, flexureLtb.status, interaction.status, brace?.status]);
  return {
    version: STEEL_DETAILED_DESIGN_VERSION,
    contract: {
      milestone: 'P3-M18',
      tickets: ['P3-T91'],
      role: check.role || 'member',
      scope: 'Steel member detailed-design trace row.',
    },
    memberId: check.memberId,
    role: check.role,
    status,
    utilization: check.utilization || 0,
    summary: {
      classification: classification.classification || classification.status || null,
      compressionStatus: compression.status,
      flexureStatus: flexureLtb.status,
      interactionStatus: interaction.status,
      braceStatus: brace?.status || null,
      governingUtilization: Math.max(check.utilization || 0, compression.ratio || 0, flexureLtb.ratio || 0, interaction.ratio || 0, brace?.ratio || 0),
    },
    classification,
    compression,
    flexureLtb,
    interaction,
    brace,
  };
}

function summarize(rows) {
  return { memberCount: rows.length, okCount: rows.filter((r) => r.status === 'OK').length, warnCount: rows.filter((r) => r.status === 'WARN').length, ngCount: rows.filter((r) => r.status === 'NG').length };
}

function collectFormula(row) {
  return collectDesignFormulaReferences(row, { id: row.memberId, role: row.role });
}

function worst(values) {
  if (values.includes('NG')) return 'NG';
  if (values.includes('WARN') || values.includes('BLOCKED')) return 'WARN';
  return 'OK';
}
