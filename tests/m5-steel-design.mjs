import assert from 'node:assert/strict';
import {
  analyzeModel,
  createCantileverTipLoad,
  createVerticalAxialColumn,
  runSteelDesign,
  steelAllowables,
} from '../src/index.js';
import { materialOf, sectionOf } from '../src/core/catalogs.js';
import { createM3State } from '../src/ui/m3State.js';

const EPS = 1e-9;

const cantilever = createCantileverTipLoad({ L: 4, P: 10 }).model;
cantilever.designParams.global.defaultDeflectionLimitTotal = 20;
const cantileverAnalysis = analyzeModel(cantilever);
assert.equal(cantileverAnalysis.ok, true, JSON.stringify(cantileverAnalysis.validation.errors, null, 2));
assert.ok(cantileverAnalysis.design?.steel, 'analysis should include steel design results');

const steel = cantileverAnalysis.design.steel;
const m1 = steel.memberResults.M1;
assert.equal(m1.role, 'beam');
assert.equal(m1.status, 'OK');
assert.equal(m1.governingCheck, 'steel-flexure-z');

const section = sectionOf(cantilever, 'bench-rect');
const material = materialOf(cantilever, 'bench-steel');
const allow = steelAllowables(material, section);
const expectedFlexure = 40 / allow.Maz;
close(m1.utilization, expectedFlexure, EPS, 'cantilever flexure utilization');
close(m1.capacities.Maz, 200, EPS, 'strong-axis moment capacity');
assert.equal(steel.summary.governing.memberId, 'M1');
assert.equal(steel.summary.governing.checkId, 'steel-flexure-z');

const direct = runSteelDesign(cantilever, cantileverAnalysis);
close(direct.summary.maxUtilization, steel.summary.maxUtilization, EPS, 'direct design facade should match analysis design');

const slender = createVerticalAxialColumn({ L: 20, P: 20 }).model;
slender.designParams.global.defaultCompressionSlendernessLimit = 200;
const slenderAnalysis = analyzeModel(slender);
assert.equal(slenderAnalysis.ok, true, JSON.stringify(slenderAnalysis.validation.errors, null, 2));
const columnCheck = slenderAnalysis.design.steel.memberResults.M1;
assert.equal(columnCheck.role, 'column');
assert.equal(columnCheck.governingCheck, 'steel-slenderness');
assert.equal(columnCheck.status, 'NG');
assert.ok(columnCheck.messages.some((message) => message.code === 'STEEL_SLENDERNESS'));

const state = createM3State(cantilever);
assert.ok(state.analysis.design.steel.memberResults.M1, 'UI state should carry steel design results');

console.log(JSON.stringify({
  ok: true,
  checkedMembers: steel.summary.checkedMembers,
  governingCheck: m1.governingCheck,
  slendernessStatus: columnCheck.status,
}, null, 2));

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}`,
  );
}
