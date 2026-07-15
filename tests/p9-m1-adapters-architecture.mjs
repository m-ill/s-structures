import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeModel } from '../src/solver/linear3d.js';
import {
  ANALYSIS_OPERATION_KINDS,
  analysisResultParityHash,
  executeCurrentAnalysis,
  prepareAnalysisContracts,
} from '../src/compute/adapters/analysisAdapters.js';
import {
  SYNC_ANALYSIS_DEPRECATION_INVENTORY,
  analyzeModelSyncCompatibility,
} from '../src/compute/compatibility/syncFacade.js';
import { p9M1CantileverModel } from './helpers/p9M1Fixture.mjs';

const model = p9M1CantileverModel();
const directContracts = prepareAnalysisContracts(structuredClone(model));
const adapter = await executeCurrentAnalysis(ANALYSIS_OPERATION_KINDS.elasticStatic, {
  model: structuredClone(model),
  expectedDomainHash: directContracts.domain.domainHash,
}, {
  throwIfCancelled() {},
  reportProgress() {},
  commitBoundary() {},
});
const direct = analyzeModel(structuredClone(model));
assert.equal(adapter.domainHash, directContracts.domain.domainHash, 'P9-API-03 DomainBinary byte-equivalent adapter input');
assert.equal(adapter.patternHash, directContracts.sparsePattern.patternHash, 'P9-API-03 SparsePattern byte-equivalent adapter input');
assert.equal(adapter.resultHash, analysisResultParityHash(direct), 'P9-API-03 current engine result parity');
const compatibility = analyzeModelSyncCompatibility(structuredClone(model), { caller: 'tests' });
assert.equal(analysisResultParityHash(compatibility), analysisResultParityHash(direct), 'P9-REF-03 synchronous facade result parity');
assert.throws(() => analyzeModelSyncCompatibility({ ...model, nodes: Array.from({ length: 41 }, (_, i) => ({ id: 'N' + i })) }, { caller: 'tests' }), {
  code: 'SYNC_COMPATIBILITY_SIZE_LIMIT',
}, 'P9-REF-03 synchronous facade is size limited');
assert.equal(SYNC_ANALYSIS_DEPRECATION_INVENTORY.length, 2, 'P9-REF-03 deprecation inventory');

const computeFiles = walk(path.resolve('src/compute')).filter((file) => file.endsWith('.js'));
for (const file of computeFiles) {
  const source = fs.readFileSync(file, 'utf8');
  assert.equal(/from ['"]\.\.\/\.\.\/ui\//.test(source), false, 'compute layer must not depend on UI: ' + file);
  if (!file.includes(`${path.sep}adapters${path.sep}`) && !file.includes(`${path.sep}compatibility${path.sep}`)) {
    assert.equal(/from ['"]\.\.\/\.\.\/(?:solver|nonlinear)\//.test(source), false, 'compute core dependency direction: ' + file);
  }
}
const oldProtocol = fs.readFileSync(path.resolve('src/nonlinear/runtime/protocol.js'), 'utf8');
assert.equal((oldProtocol.match(/WORKER_PROTOCOL_VERSION\s*=\s*'p8-m10-worker-protocol-v4'/g) || []).length, 1, 'P9-REF-02 legacy protocol declaration allowlist');
assert.match(oldProtocol, /compute\/runtime\/transferables\.js/, 'P9-REF-02 common transferable owner');
const root = await import('../src/index.js');
assert.equal(typeof root.packDomainBinary, 'function', 'P9-REF-03 public common compute contract');
assert.equal(typeof root.createComputeWorkerClient, 'function', 'P9-REF-03 public async Worker client');

console.log('P9-M1 adapters/architecture compatibility: PASS');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}
