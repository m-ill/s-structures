import { buildConnectionDetailedDesignReport } from './connection/detailedReport.js';
import { buildFoundationDetailedDesignReport } from './foundation/detailedReport.js';
import { buildRcDetailedDesignReport } from './rc/detailedReport.js';
import { buildSteelDetailedDesignReport } from './steel/detailedReport.js';
import { DESIGN_FORMULA_REGISTRY_VERSION } from '../standards/designFormulaRegistry.js';

export const P3_DETAILED_DESIGN_REPORT_VERSION = 'p3-m18-detailed-design-integration';
export const P3_DETAILED_DESIGN_GATE_VERSION = 'p3-m18-detailed-design-gate-v1';

export function buildP3DetailedDesignReport(model, analysis, options = {}) {
  const rc = buildRcDetailedDesignReport(model, analysis, options.rc || options);
  const steel = buildSteelDetailedDesignReport(model, analysis, options.steel || options);
  const connection = buildConnectionDetailedDesignReport(model, analysis, options.connection || options);
  const foundation = buildFoundationDetailedDesignReport(model, analysis, options.foundation || options);
  const modules = { rc, steel, connection, foundation };
  const issueRows = buildIssueRows(modules);
  const formulaTrace = Object.values(modules).flatMap((module) => module.formulaTrace || []);
  return {
    version: P3_DETAILED_DESIGN_REPORT_VERSION,
    modelName: model?.meta?.name || null,
    summary: summarize(modules),
    modules,
    designGate: buildP3DetailedDesignGate(modules, { issueRows, formulaTrace }),
    issueRows,
    formulaTrace,
    formulaRegistryVersion: DESIGN_FORMULA_REGISTRY_VERSION,
    limitations: ['P3-M18 integrates RC, steel, connection, and foundation detailed-design trace modules for agent/report consumption.'],
  };
}

export function buildP3DetailedDesignGate(modules = {}, evidence = {}) {
  const issueRows = evidence.issueRows || buildIssueRows(modules);
  const formulaTrace = evidence.formulaTrace || Object.values(modules).flatMap((module) => module.formulaTrace || []);
  return {
    version: P3_DETAILED_DESIGN_GATE_VERSION,
    milestone: 'P3-M18',
    tickets: ['P3-T91', 'P3-T92', 'P3-T93', 'P3-T94', 'P3-T95'],
    modules: Object.fromEntries(Object.entries(modules).map(([id, module]) => [id, {
      version: module.version || null,
      itemCount: module.summary?.itemCount || module.summary?.memberCount || rowsOf(module).length,
      warnCount: module.summary?.warnCount || 0,
      ngCount: module.summary?.ngCount || 0,
    }])),
    issueCount: issueRows.length,
    formulaCount: formulaTrace.length,
    formulaRegistryVersion: DESIGN_FORMULA_REGISTRY_VERSION,
    unregisteredFormulaCount: formulaTrace.filter((row) => row.standard === 'UNREGISTERED').length,
    serviceabilityHook: 'drift-deflection-vibration-ready',
    limitations: [
      'P3-M18 is a preliminary integrated detailed-design trace gate.',
      'Fabrication detailing, geotechnical settlement, final permits, and construction drawings remain engineer review scope.',
    ],
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
  return Object.entries(modules).flatMap(([moduleId, module]) => {
    const rows = module.issueRows || rowsOf(module).filter((row) => row.status && row.status !== 'OK').map((row) => ({
      moduleId,
      itemId: row.memberId || row.nodeId || row.wallId || row.slabId || moduleId,
      status: row.status,
      action: `${moduleId} item requires review.`,
    }));
    return rows.map((row) => ({
      moduleId: row.moduleId || moduleId,
      itemId: row.itemId || row.memberId || row.nodeId || row.wallId || row.slabId || moduleId,
      status: row.status,
      action: row.action || `${moduleId} item requires review.`,
    }));
  });
}

function rowsOf(module) {
  const schedules = module.schedules || {};
  return [
    ...(module.rows || []),
    ...(schedules.beams || []),
    ...(schedules.columns || []),
    ...(schedules.walls || []),
    ...(schedules.slabs || []),
    ...(module.footings || []),
    ...(module.piles || []),
    ...(module.basePlates || []),
    ...(module.combined ? [module.combined] : []),
    ...(module.mat ? [module.mat] : []),
  ];
}
