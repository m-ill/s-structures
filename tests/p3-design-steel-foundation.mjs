import assert from 'node:assert/strict';
import {
  analyzeModel,
  buildAgentManifest,
  buildConnectionDetailedDesignReport,
  buildFoundationDetailedDesignReport,
  buildP3DetailedDesignReport,
  buildSteelDetailedDesignReport,
  createCantileverTipLoad,
  createTwoStoryElasticFrameModel,
  designBoltGroup,
  designFilletWeld,
  DESIGN_FORMULA_REGISTRY_VERSION,
  P3_DETAILED_DESIGN_GATE_VERSION,
  P3_DETAILED_DESIGN_REPORT_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const cantilever = createCantileverTipLoad({ L: 4, P: 10 }).model;
cantilever.designParams.global.defaultDeflectionLimitTotal = 20;
const cantileverAnalysis = analyzeModel(cantilever);
assert.equal(cantileverAnalysis.ok, true);

const steel = buildSteelDetailedDesignReport(cantilever, cantileverAnalysis);
assert.equal(steel.rows.length, 1);
assert.ok(steel.rows[0].classification.formulaId);
assert.ok(steel.rows[0].compression.formulaId);
assert.ok(steel.rows[0].flexureLtb.formulaId);
assert.ok(steel.formulaTrace.some((row) => row.formulaId === 'KDS-ST-H1-INTERACTION-V1'));
assert.ok(steel.formulaTrace.every((row) => row.standard && row.clause && row.title));

const frame = createTwoStoryElasticFrameModel();
const frameAnalysis = analyzeModel(frame);
assert.equal(frameAnalysis.ok, true);

const connection = buildConnectionDetailedDesignReport(frame, frameAnalysis);
assert.ok(connection.rows.length > 0);
assert.ok(connection.basePlates.length > 0);
assert.ok(connection.formulaTrace.some((row) => row.formulaId === 'KDS-CONN-BOLT-V1'));
assert.ok(connection.formulaTrace.some((row) => row.formulaId === 'KDS-CONN-BASEPLATE-V1'));

const foundation = buildFoundationDetailedDesignReport(frame, frameAnalysis);
assert.ok(foundation.footings.length > 0);
assert.ok(foundation.piles.length > 0);
assert.equal(foundation.rows.length, foundation.summary.itemCount);
assert.ok(foundation.formulaTrace.some((row) => row.formulaId === 'KDS-FOUND-SPREAD-V1'));
assert.ok(foundation.formulaTrace.some((row) => row.formulaId === 'KDS-FOUND-MAT-V1'));

const bolt = designBoltGroup({ memberId: 'B1', demands: { shearY: 90, shearZ: 0, axial: 40 } });
const weld = designFilletWeld({ memberId: 'W1', equivalentDemand: 180 });
assert.ok(bolt.requiredCount >= 2);
assert.ok(weld.requiredLength >= 100);

const integrated = buildP3DetailedDesignReport(frame, frameAnalysis);
assert.equal(integrated.version, P3_DETAILED_DESIGN_REPORT_VERSION);
assert.equal(integrated.designGate.version, P3_DETAILED_DESIGN_GATE_VERSION);
assert.deepEqual(integrated.designGate.tickets, ['P3-T91', 'P3-T92', 'P3-T93', 'P3-T94', 'P3-T95']);
assert.ok(integrated.modules.steel.rows.length > 0);
assert.ok(integrated.modules.connection.rows.length > 0);
assert.ok(integrated.modules.foundation.footings.length > 0);
assert.ok(integrated.formulaTrace.length > 0);
assert.equal(integrated.designGate.formulaCount, integrated.formulaTrace.length);
assert.equal(integrated.designGate.issueCount, integrated.issueRows.length);
assert.equal(integrated.formulaRegistryVersion, DESIGN_FORMULA_REGISTRY_VERSION);
assert.equal(integrated.designGate.unregisteredFormulaCount, 0);
assert.deepEqual(integrated.designGate.coverage.map((row) => row.ticket), ['P3-T91', 'P3-T92', 'P3-T93', 'P3-T94', 'P3-T95']);
assert.ok(integrated.designGate.coverage.every((row) => row.covered));
assert.ok(integrated.issueRows.every((row) => Array.isArray(row.formulaIds)));
assert.ok(integrated.issueRows.some((row) => row.formulaIds.length > 0));

const target = { model: () => frame, reanalyze: () => {} };
const agent = createIndexAgentApi(target, { getLastResult: () => frameAnalysis });
const agentReport = agent.getP3DetailedDesignReport();
assert.equal(agentReport.version, P3_DETAILED_DESIGN_REPORT_VERSION);
assert.ok(agentReport.modules.connection.rows.length > 0);

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3DetailedDesignIntegration, P3_DETAILED_DESIGN_REPORT_VERSION);
assert.equal(manifest.modules.phase3DetailedDesignGate, P3_DETAILED_DESIGN_GATE_VERSION);
assert.equal(manifest.modules.phase3DesignFormulaRegistry, DESIGN_FORMULA_REGISTRY_VERSION);
assert.ok(manifest.readApis.includes('getP3DetailedDesignReport'));
assert.ok(manifest.dataContracts.includes('phase3DetailedDesignIntegration'));
assert.ok(manifest.dataContracts.includes('phase3DetailedDesignGate'));
assert.ok(manifest.dataContracts.includes('phase3DesignFormulaRegistry'));
assert.ok(manifest.dataContracts.includes('phase3DesignFormulaTrace'));
assert.ok(manifest.milestones.some((item) => item.id === 'P3-M18'));

console.log(JSON.stringify({
  ok: true,
  version: P3_DETAILED_DESIGN_REPORT_VERSION,
  steelRows: steel.rows.length,
  connectionRows: connection.rows.length,
  foundationRows: foundation.summary.itemCount,
  formulaRows: integrated.formulaTrace.length,
}, null, 2));
