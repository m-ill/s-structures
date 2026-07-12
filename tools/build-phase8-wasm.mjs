import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const crateDirectory = path.join(repositoryRoot, 'native', 'phase8-solver');
const manifestPath = path.join(crateDirectory, 'Cargo.toml');
const builtWasm = path.join(
  crateDirectory,
  'target',
  'wasm32-unknown-unknown',
  'release',
  'phase8_solver.wasm',
);
const destination = path.join(
  repositoryRoot,
  'src',
  'nonlinear',
  'equilibrium',
  'backends',
  'phase8_solver.wasm',
);

await run(process.platform === 'win32' ? 'cargo.exe' : 'cargo', [
  'build',
  '--manifest-path', manifestPath,
  '--target', 'wasm32-unknown-unknown',
  '--release',
  '--locked',
]);

const sourceBytes = await readFile(builtWasm);
const module = new WebAssembly.Module(sourceBytes);
const imports = WebAssembly.Module.imports(module);
if (imports.length !== 0) {
  throw new Error(`Phase 8 solver must be self-contained; found ${imports.length} WASM import(s).`);
}

await mkdir(path.dirname(destination), { recursive: true });
await copyFile(builtWasm, destination);
const outputStat = await stat(destination);
const sha256 = createHash('sha256').update(sourceBytes).digest('hex');

console.log(JSON.stringify({
  ok: true,
  target: 'wasm32-unknown-unknown',
  source: path.relative(repositoryRoot, builtWasm).replaceAll('\\', '/'),
  output: path.relative(repositoryRoot, destination).replaceAll('\\', '/'),
  bytes: outputStat.size,
  sha256,
  imports: imports.length,
}, null, 2));

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        CARGO_INCREMENTAL: '0',
        SOURCE_DATE_EPOCH: '0',
      },
      shell: false,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(
        `${command} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}.`,
      ));
    });
  });
}
