import { buildConnectionDetailedDesignReport } from './connection/detailedReport.js';
import { buildFoundationDetailedDesignReport } from './foundation/detailedReport.js';
import { buildRcDetailedDesignReport } from './rc/detailedReport.js';
import { buildSteelDetailedDesignReport } from './steel/detailedReport.js';

export const P3_DETAILED_DESIGN_REPORT_VERSION = 'p3-m18-detailed-design-integration';

export function buildP3DetailedDesignReport(model, analysis, options = {}) {
  const rc = buildRcDetailedDesignReport(model, analysis, options.rc || options);
  const steel = buildSteelDetailedDesignReport(model, analysis, options.steel || options);
  const connection = buildConnectionDetailedDesignReport(model, analysis, options.connection || options);
  const foundation = buildFoundationDetailedDesignReport(model, analysis, options.foundation || options);
  const modules = { rc, steel, connection, foundation };
  return {
    version: P3_DETAILED_DESIGN_REPORT_VERSION,
    modelName: model?.meta?.name || null,
    summary: summarize(modules),
    modules,
    issueRows: buildIssueRows(modules),
    formulaTrace: Object.values(modules).flatMap((module) => module.formulaTrace || []),
    limitations: ['P3-M18 integrates RC, steel, connection, and foundation detailed-design trace modules for agent/report consumption.'],
  };
}

function summarize(modules) {
  const items = Object.values(modules).map((module) => module.summary || {});
  return {
    itemCount: items.reduce((sum, item) => sum + (item.itemCount || item.memberCount || 0), 0),
    warnCount: items.reduce((sum, item) => sum + (item.warnCount || 0), 0),
    ngCount: items.reduce((sum, item) => sum + (item.ngCount || 0), 0),
  };
}

function buildIssueRows(modules) {
  return Object.entries(modules).flatMap(([moduleId, module]) => rowsOf(module).filter((row) => row.status && row.status !== 'OK').map((row) => ({
    moduleId,
    itemId: row.memberId || row.nodeId || row.wallId || row.slabId || moduleId,
    status: row.status,
    action: `${moduleId} item requires review.`,
  })));
}

function rowsOf(module) {
  return [...(module.rows || []), ...(module.footings || []), ...(module.piles || []), ...(module.basePlates || [])];
}
