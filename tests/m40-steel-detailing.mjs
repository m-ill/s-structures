import assert from 'node:assert/strict';
import {
  analyzeModel,
  buildSteelDetailingReport,
  createCantileverTipLoad,
  createDetailedHtmlReport,
  createVerticalAxialColumn,
  STEEL_DETAILING_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const cantilever = createCantileverTipLoad({ L: 4, P: 10 }).model;
cantilever.designParams.global.defaultDeflectionLimitTotal = 20;
const analysis = analyzeModel(cantilever);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));

const detail = buildSteelDetailingReport(cantilever, analysis);
assert.equal(detail.version, STEEL_DETAILING_VERSION);
assert.equal(detail.summary.memberCount, 1);
assert.equal(detail.rows[0].memberId, 'M1');
assert.equal(detail.rows[0].governingCheck, 'steel-flexure-z');
assert.ok(detail.rows[0].checks.some((item) => item.id === 'steel-interaction'));
assert.ok(detail.rows[0].reviewActions.length > 0);

const report = createDetailedHtmlReport(cantilever, analysis);
assert.equal(report.data.steelDetailing.version, STEEL_DETAILING_VERSION);
assert.match(report.html, /Steel Member Review Schedule/);
assert.match(report.html, /KL\/r/);

const slender = createVerticalAxialColumn({ L: 20, P: 20 }).model;
slender.designParams.global.defaultCompressionSlendernessLimit = 200;
const slenderAnalysis = analyzeModel(slender);
const slenderDetail = buildSteelDetailingReport(slender, slenderAnalysis);
assert.equal(slenderDetail.rows[0].slenderness.status, 'NG');
assert.ok(slenderDetail.rows[0].reviewActions.some((item) => item.includes('slenderness')));

const target = {
  model: () => cantilever,
  reanalyze: () => {},
};
const agent = createIndexAgentApi(target, {
  getLastResult: () => analysis,
});
const agentDetail = agent.prepareResultView('getSteelDetailingReport');
assert.equal(agentDetail.version, STEEL_DETAILING_VERSION);
assert.equal(agentDetail.rows.length, 1);

console.log(JSON.stringify({
  ok: true,
  version: STEEL_DETAILING_VERSION,
  governing: detail.rows[0].governingCheck,
  slendernessStatus: slenderDetail.rows[0].slenderness.status,
}, null, 2));
