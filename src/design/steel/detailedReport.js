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
    modelName: model?.meta?.name || null,
    summary: summarize(rows),
    rows,
    formulaTrace: rows.flatMap((row) => collectFormula(row)),
    limitations: [
      'P3-M18 steel member checks are traceable detailed-review rows based on current elastic design demand.',
      'Local buckling tables, bracing plans, fabrication details, and final seismic detailing remain engineer review items.',
    ],
  };
}

export function detailSteelMemberP3(check = {}, options = {}) {
  const classification = classifySteelSection(check);
  const compression = checkSteelCompression(check);
  const flexureLtb = checkSteelFlexureLtb(check, options);
  const interaction = checkSteelInteraction(check);
  const brace = check.role === 'brace' ? checkSteelBrace(check) : null;
  const status = worst([check.status, compression.status, flexureLtb.status, interaction.status, brace?.status]);
  return { version: STEEL_DETAILED_DESIGN_VERSION, memberId: check.memberId, role: check.role, status, utilization: check.utilization || 0, classification, compression, flexureLtb, interaction, brace };
}

function summarize(rows) {
  return { memberCount: rows.length, okCount: rows.filter((r) => r.status === 'OK').length, warnCount: rows.filter((r) => r.status === 'WARN').length, ngCount: rows.filter((r) => r.status === 'NG').length };
}

function collectFormula(row) {
  return collectDesignFormulaReferences(row, { id: row.memberId, role: row.role });
}

function worst(values) {
  if (values.includes('NG')) return 'NG';
  if (values.includes('WARN')) return 'WARN';
  return 'OK';
}
