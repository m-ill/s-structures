import assert from 'node:assert/strict';
import { buildPhase13ReviewPackageSnapshot, buildPhase13RevisionDiff, commitPhase13MgtDraftRevision, createPhase13MgtImportCandidate, exportPhase13MgtSubset, importPhase13MgtSubset } from '../src/import/phase13MgtImport.js';
import { stableHash } from '../src/core/stableHash.js';

const text = '*NODE\nN1,0,0,0\nN2,4,0,0\n*MATERIAL\nMAT,Steel,200000,77000\n*SECTION\nSEC,H,0.01,0.001,0.002,0.0001\n*ELEMENT\nM1,FRAME,N1,N2,MAT,SEC\n*CONSTRAINT\nN1,1,1,1,1,1,1\n*LOADCASE\nD,dead\n*CONLOAD\nL1,N2,D,10,-z\n*UNKNOWN\nX';
const parsed = importPhase13MgtSubset(text);
assert.equal(parsed.status, 'review-required'); assert.equal(parsed.validation.ok, true); assert.equal(parsed.externalApplicationExecuted, false); assert.equal(parsed.security.macroExecuted, false); assert.equal(parsed.unsupported[0].section, 'UNKNOWN');
const current = { meta: { id: 'P1', revisionId: 'R0' }, nodes: [], members: [], materials: [], sections: [], loadCases: [], loads: [] };
const candidate = createPhase13MgtImportCandidate(current, text); assert.equal(candidate.commitAllowed, true); assert.equal(candidate.currentProjectMutationAllowed, false);
const committed = commitPhase13MgtDraftRevision(current, candidate, { revisionId: 'R1-DRAFT' }); assert.equal(committed.ok, true); assert.equal(committed.currentModelMutated, false); assert.equal(committed.draftRevision.meta.revisionStatus, 'draft');
assert.equal(current.nodes.length, 0);
const diff = buildPhase13RevisionDiff(parsed.model, { ...parsed.model, nodes: [...parsed.model.nodes, { id: 'N3' }] }); assert.deepEqual(diff.collections.nodes.added, ['N3']);
const packageSnapshot = buildPhase13ReviewPackageSnapshot({ model: current, run: { id: 'RUN1', status: 'completed', integrityHash: 'abc', designTransferAllowed: false }, current: true, reportHash: 'report-hash' }); assert.equal(packageSnapshot.status, 'ready'); assert.equal(packageSnapshot.immutable, true);
const roundTrip = importPhase13MgtSubset(exportPhase13MgtSubset(parsed.model).text); assert.equal(roundTrip.status, 'ready'); assert.equal(stableHash(roundTrip.model), stableHash(parsed.model));
const hostile = importPhase13MgtSubset('A'.repeat(200), { limits: { maxBytes: 10 } }); assert.equal(hostile.status, 'blocked'); assert.equal(hostile.externalApplicationExecuted, false);
console.log(JSON.stringify({ ok: true, milestone: 'P13-M7', atomicDraftImport: true, roundTripParity: true, externalExecution: false }, null, 2));
