import assert from 'node:assert/strict';
import {
  analyzeModel,
  buildAnalysisDomainHashes,
  classifyElasticFactorGroups,
  createModel,
  createWinklerLineFoundationProperty,
  packDomainBinary,
  unpackDomainBinary,
  validateDomainBinary,
  validateModel,
} from '../src/index.js';

const base = beamModel(false);
const supported = beamModel(true);
assert.equal(validateModel(supported).ok, true, JSON.stringify(validateModel(supported).errors, null, 2));

const withoutFoundation = analyzeModel(base);
const withFoundation = analyzeModel(supported);
assert.equal(withoutFoundation.ok, true, JSON.stringify(withoutFoundation.validation.errors, null, 2));
assert.equal(withFoundation.ok, true, JSON.stringify(withFoundation.validation.errors, null, 2));
const plain = withoutFoundation.byCombo.D_ONLY;
const result = withFoundation.byCombo.D_ONLY;
assert.equal(result.ok, true);
assert.ok(Math.abs(result.disp.N2[2]) < Math.abs(plain.disp.N2[2]), 'foundation must reduce center displacement');
assert.equal(Object.keys(result.foundationResults).length, 2);
assert.equal(result.memberResults.M1.matrixOwnership.assembly, 'klTotal');
assert.equal(result.memberResults.M1.matrixOwnership.structuralEndForce, 'klStructural*d+f0External');
assert.ok(result.memberResults.M1.foundation.strainEnergy > 0);
assert.ok(Math.abs(result.summary.totalFoundationReaction[2]) > 0);
assert.ok(result.summary.equilibriumResidual <= 1e-8, `equilibrium ${result.summary.equilibriumResidual}`);

const baseHashes = buildAnalysisDomainHashes(base);
const foundationHashes = buildAnalysisDomainHashes(supported);
assert.notEqual(baseHashes.propertyHash, foundationHashes.propertyHash);
assert.notEqual(baseHashes.domainHash, foundationHashes.domainHash);
const factorBase = classifyElasticFactorGroups(base, base.loadCombinations);
const factorFoundation = classifyElasticFactorGroups(supported, supported.loadCombinations);
assert.notEqual(factorBase.baseStiffnessHash, factorFoundation.baseStiffnessHash);

const packed = packDomainBinary(supported);
assert.equal(validateDomainBinary(packed).ok, true, validateDomainBinary(packed).errors.join(', '));
const unpacked = unpackDomainBinary(packed);
assert.equal(unpacked.members[0].foundationId, 'WF-1');
assert.equal(unpacked.foundationProperties[0].localZ.lineStiffness, 25000);
assert.equal(unpacked.model.foundationProperties[0].id, 'WF-1');

const bad = beamModel(true);
bad.members[0] = { ...bad.members[0], type: 'truss' };
const badValidation = validateModel(bad);
assert.equal(badValidation.ok, false);
assert.ok(badValidation.errors.some((row) => row.code === 'FOUNDATION_MEMBER_BEHAVIOR_UNSUPPORTED'));

console.log(JSON.stringify({
  ok: true,
  milestone: 'P14-M1',
  centerDisplacement: result.disp.N2[2],
  plainCenterDisplacement: plain.disp.N2[2],
  foundationReaction: result.summary.totalFoundationReaction,
  equilibriumResidual: result.summary.equilibriumResidual,
  domainBinaryVersion: packed.version,
}, null, 2));

function beamModel(withFoundation) {
  const model = createModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'pin' },
    { id: 'N2', x: 3, y: 0, z: 0, support: null },
    { id: 'N3', x: 6, y: 0, z: 0, support: 'custom', fix: [false, true, true, false, false, false] },
  ];
  model.members = [
    { id: 'M1', type: 'frame', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300', releases: { i: 'rigid', j: 'rigid' }, ...(withFoundation ? { foundationId: 'WF-1' } : {}) },
    { id: 'M2', type: 'frame', n1: 'N2', n2: 'N3', matId: 'steel', secId: 'h300', releases: { i: 'rigid', j: 'rigid' }, ...(withFoundation ? { foundationId: 'WF-1' } : {}) },
  ];
  model.foundationProperties = withFoundation ? [createWinklerLineFoundationProperty({
    id: 'WF-1',
    name: 'Test distributed foundation',
    localY: { lineStiffness: 25000 },
    localZ: { lineStiffness: 25000 },
  })] : [];
  model.loadCases = [{ id: 'D', name: 'Point load', type: 'dead' }];
  model.loadCombinations = [{ id: 'D_ONLY', name: '1.0D', type: 'strength', factors: { D: 1 } }];
  model.loads = [{ id: 'P1', type: 'nodal', node: 'N2', P: 100, dir: '-z', case: 'D' }];
  model.analysisSettings = { ...model.analysisSettings, includeSelfWeight: false, validateBeforeSolve: true, memberStations: 21 };
  return model;
}
