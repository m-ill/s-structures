import assert from 'node:assert/strict';
import {
  domainBinaryTransferables,
  packDomainBinary,
  unpackDomainBinary,
  validateDomainBinary,
} from '../src/compute/contracts/domainBinary.js';
import { createSparsePattern, createSparsePatternFromDomain, validateSparsePattern } from '../src/compute/contracts/sparsePattern.js';
import { p9M1CantileverModel } from './helpers/p9M1Fixture.mjs';

const model = p9M1CantileverModel();
model.loads.push({ id: 'T1', type: 'trapezoid', member: 'M1', w1: 2, w2: 5, from: 0.2, to: 0.8, dir: '-z', case: 'W' });
model.nodes[1].settlement = { uz: -0.002 };
const first = packDomainBinary(model);
const second = packDomainBinary(structuredClone(model));
assert.equal(first.domainHash, second.domainHash, 'P9-CMP-01 deterministic domain hash');
assert.deepEqual(first.metadata.units, { length: 'm', force: 'kN', moment: 'kN.m' });
assert.equal(validateDomainBinary(first).ok, true, 'P9-CMP-01 domain schema');
const unpacked = unpackDomainBinary(first);
assert.deepEqual(unpacked.nodes.map((row) => row.id), ['N1', 'N2'], 'P9-CMP-02 node ID parity');
assert.deepEqual(unpacked.members.map((row) => [row.id, row.n1, row.n2]), [['M1', 'N1', 'N2']], 'P9-CMP-02 member ID parity');
assert.deepEqual(unpacked.model.loads[1], model.loads[1], 'P9-CMP-02 advanced load payload parity');
assert.deepEqual(unpacked.model.nodes[1].settlement, model.nodes[1].settlement, 'P9-CMP-02 support payload parity');
assert.equal(domainBinaryTransferables(first).length, Object.keys(first.buffers).length, 'P9-CMP-02 transferable ownership');

const firstPattern = createSparsePatternFromDomain(first);
const secondPattern = createSparsePatternFromDomain(second);
assert.equal(firstPattern.patternHash, secondPattern.patternHash, 'P9-CMP-03 deterministic sparse pattern');
assert.equal(validateSparsePattern(firstPattern).ok, true, 'P9-CMP-03 CSR schema');
assert.equal(firstPattern.scatter.length, model.members.length * 144, 'P9-CMP-04 member scatter size');
assert.ok([...firstPattern.scatter].some((value) => value >= 0), 'P9-CMP-04 reduced assembly scatter');
const csc = createSparsePattern({ format: 'csc', rowCount: 2, colCount: 2, pointers: [0, 2, 3], indices: [0, 1, 1] });
assert.equal(validateSparsePattern(csc).ok, true, 'P9-CMP-04 CSC contract');

console.log('P9-M1 DomainBinary/SparsePattern: PASS');
