import assert from 'node:assert/strict';
import {
  analyzeModel,
  buildConnectionFoundationReport,
  buildDesignDemandPackage,
  createCalculationPackageHtml,
  createDetailedHtmlReport,
  createTwoStoryElasticFrameModel,
  DESIGN_DEMAND_PACKAGE_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createTwoStoryElasticFrameModel();
model.meta = { name: 'P2 Design Demand Package Test' };
const analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));

const demands = buildDesignDemandPackage(model, analysis);
assert.equal(demands.version, DESIGN_DEMAND_PACKAGE_VERSION);
assert.equal(demands.summary.memberCount, model.members.length);
assert.ok(demands.summary.foundationCount > 0);
assert.ok(demands.members.M1.governing.comboId);

assert.equal(analysis.design.demandPackage.version, DESIGN_DEMAND_PACKAGE_VERSION);
const steelCheck = Object.values(analysis.design.steel.memberResults)[0];
assert.equal(steelCheck.demandTrace.version, DESIGN_DEMAND_PACKAGE_VERSION);
assert.ok(steelCheck.demandTrace.traceId.startsWith('MEM-DEMAND-'));

const connection = buildConnectionFoundationReport(model, analysis);
assert.equal(connection.demandPackage.version, DESIGN_DEMAND_PACKAGE_VERSION);

const detailed = createDetailedHtmlReport(model, analysis);
assert.equal(detailed.data.designDemandPackage.version, DESIGN_DEMAND_PACKAGE_VERSION);
assert.match(detailed.html, /Demand package/);

const pkg = createCalculationPackageHtml(model, analysis);
assert.equal(pkg.data.detailed.designDemandPackage.version, DESIGN_DEMAND_PACKAGE_VERSION);

const agent = createIndexAgentApi({ model: () => model, reanalyze: () => {} }, {
  getLastResult: () => analysis,
});
assert.equal(agent.getDesignDemandPackage().version, DESIGN_DEMAND_PACKAGE_VERSION);
assert.equal(agent.getCapabilities().modules.designDemandPackage, DESIGN_DEMAND_PACKAGE_VERSION);
assert.ok(agent.getCapabilities().readApis.includes('getDesignDemandPackage'));

console.log(JSON.stringify({
  ok: true,
  version: DESIGN_DEMAND_PACKAGE_VERSION,
  members: demands.summary.memberCount,
  foundations: demands.summary.foundationCount,
}, null, 2));
