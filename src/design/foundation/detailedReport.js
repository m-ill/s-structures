import { buildConnectionFoundationReport } from '../connectionFoundation.js';
import { designCombinedFooting } from './combined.js';
import { designSpreadFooting } from './footing.js';
import { designMatFoundation } from './mat.js';
import { designPileGroup } from './pile.js';

export const FOUNDATION_DETAILED_DESIGN_VERSION = 'p3-m18-foundation-detailed-design';

export function buildFoundationDetailedDesignReport(model, analysis, options = {}) {
  const base = buildConnectionFoundationReport(model, analysis, options);
  const footings = base.foundationRows.map((row) => designSpreadFooting(row, options));
  const piles = base.foundationRows.map((row) => designPileGroup(row, options));
  const combined = designCombinedFooting(base.foundationRows, options);
  const mat = designMatFoundation(base.foundationRows, options);
  const rows = [...footings, ...piles, combined, mat];
  return { version: FOUNDATION_DETAILED_DESIGN_VERSION, summary: summarize(rows), rows, footings, piles, combined, mat, formulaTrace: rows.flatMap((row) => collectFormula(row)), limitations: ['Foundation rows are preliminary geotechnical and reinforcement sizing traces for review.'] };
}

function summarize(rows) {
  return { itemCount: rows.length, okCount: rows.filter((r) => r.status === 'OK').length, warnCount: rows.filter((r) => r.status === 'WARN').length, ngCount: rows.filter((r) => r.status === 'NG').length };
}

function collectFormula(row) {
  return JSON.stringify(row).match(/KDS-[A-Z0-9-]+/g)?.map((formulaId) => ({ id: row.nodeId || row.version, formulaId })) || [];
}
