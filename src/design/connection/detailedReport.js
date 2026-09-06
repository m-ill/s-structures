import { buildConnectionFoundationReport } from '../connectionFoundation.js';
import { designBasePlate } from './basePlate.js';
import { designBoltGroup } from './bolt.js';
import { designFilletWeld } from './weld.js';
import { collectDesignFormulaReferences } from '../../standards/designFormulaRegistry.js';

export const CONNECTION_DETAILED_DESIGN_VERSION = 'p3-m18-connection-detailed-design';

export function buildConnectionDetailedDesignReport(model, analysis, options = {}) {
  const base = buildConnectionFoundationReport(model, analysis, options);
  const rows = base.connectionRows.map((row) => {
    const bolt = designBoltGroup(row, options);
    const weld = designFilletWeld(row, options);
    return {
      contract: {
        milestone: 'P3-M18',
        tickets: ['P3-T92'],
        scope: 'Member connection demand with bolt and weld sizing trace.',
      },
      memberId: row.memberId,
      status: worst([row.status, bolt.status, weld.status]),
      demand: row.demands,
      summary: {
        boltStatus: bolt.status,
        weldStatus: weld.status,
        boltCount: bolt.requiredCount,
        weldLength: weld.requiredLength,
      },
      bolt,
      weld,
    };
  });
  const basePlates = base.foundationRows.map((row) => designBasePlate(row, options));
  return {
    version: CONNECTION_DETAILED_DESIGN_VERSION,
    contract: {
      milestone: 'P3-M18',
      tickets: ['P3-T92'],
      scope: 'Connection, bolt, weld, and base-plate detailed-design schedule trace.',
    },
    summary: summarize(rows, basePlates),
    rows,
    basePlates,
    formulaTrace: [...rows, ...basePlates].flatMap((row) => collectFormula(row)),
    limitations: ['Connection rows are v1 bolt, weld, and base-plate sizing traces for review.'],
  };
}

function summarize(rows, basePlates) {
  const all = [...rows, ...basePlates];
  return { itemCount: all.length, okCount: all.filter((r) => r.status === 'OK').length, warnCount: all.filter((r) => r.status === 'WARN').length, ngCount: all.filter((r) => r.status === 'NG').length };
}

function collectFormula(row) {
  return collectDesignFormulaReferences(row, { id: row.memberId || row.nodeId });
}

function worst(values) {
  if (values.includes('NG')) return 'NG';
  if (values.includes('WARN')) return 'WARN';
  return 'OK';
}
