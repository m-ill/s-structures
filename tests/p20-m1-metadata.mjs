import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import * as versions from '../src/metadata/numericVersions.js';
import {buildAgentManifest} from '../src/ui/agentManifest.js';
const baseline=JSON.parse(readFileSync('verification/evidence/phase20/m0/public-api.json'));
assert.deepEqual(buildAgentManifest(),baseline.manifest);
for(const {name,owner} of JSON.parse(readFileSync('verification/specs/phase20/version-owners.json'))){
  const original=await import(pathToFileURL(resolve(owner)));assert.equal(original[name],versions[name],name);
}
assert.doesNotMatch(readFileSync('src/metadata/numericVersions.js','utf8'),/\bimport\s|\bfrom\s*['"]|import\(/);
const oldScope=await import('../src/solver/shell/equivalentScope.js'),scope=await import('../src/results/equivalentShellScope.js');
assert.equal(oldScope.equivalentShellBadge,scope.equivalentShellBadge);
for(const m of [{},{shells:[{id:'S1'}],wallEquivalents:[{id:'W1'}]}])assert.deepEqual(oldScope.equivalentShellBadge(m),scope.equivalentShellBadge(m));
console.log('PASS P20 metadata, public constants, manifest and display compatibility');
