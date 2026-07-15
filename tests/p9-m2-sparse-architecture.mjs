import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const commonRoot = path.resolve('src/compute/sparse');
for (const required of ['matrix.js', 'symbolic.js', 'ldlt.js', 'lu.js', 'factorRuntime.js', 'reducedAssembly.js']) {
  assert.ok(fs.existsSync(path.join(commonRoot, required)), `P9-REF-04 common owner missing ${required}`);
}

const facades = [
  'src/solver/sparse/cscMatrix.js',
  'src/solver/sparse/symbolicFactor.js',
  'src/solver/sparse/ldlt.js',
  'src/nonlinear/equilibrium/typedSparse.js',
  'src/nonlinear/dynamics/sparseMatrix.js',
  'src/nonlinear/equilibrium/backends/wasmSparseBackend.js',
];
for (const file of facades) {
  const source = fs.readFileSync(file, 'utf8');
  assert.ok(source.length < 900, `P9-REF-04 facade contains duplicate implementation: ${file}`);
  assert.match(source, /compute\//, `P9-REF-05 facade must delegate to common owner: ${file}`);
}

for (const file of walk(path.resolve('src/compute')).filter((value) => value.endsWith('.js'))) {
  const source = fs.readFileSync(file, 'utf8');
  if (file.includes(`${path.sep}adapters${path.sep}`) || file.includes(`${path.sep}compatibility${path.sep}`)) continue;
  assert.doesNotMatch(source, /from ['"]\.\.\/\.\.\/(?:solver|nonlinear)\//, `P9-REF-05 dependency direction: ${file}`);
}

const wasmOwner = fs.readFileSync('src/compute/backends/wasmCpuBackend.js', 'utf8');
assert.match(wasmOwner, /denseFallbackAllocated:\s*false/);
assert.doesNotMatch(wasmOwner, /cscToDense|denseToCsc/);
const cpuOwner = fs.readFileSync('src/compute/backends/cpuSparseBackend.js', 'utf8');
assert.doesNotMatch(cpuOwner, /solver\/sparse|nonlinear\/equilibrium/);

console.log('P9-M2 sparse ownership/architecture: PASS');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}
