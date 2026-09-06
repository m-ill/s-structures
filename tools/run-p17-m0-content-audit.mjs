import { existsSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'verification', 'benchmarks', 'strix21', 'reporting', 'audit_p17_m0_sources.py');
const requirementsPath = path.join(root, 'verification', 'benchmarks', 'strix21', 'reporting', 'requirements-p17-m0.txt');
const requiredPypdf = readFileSync(requirementsPath, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => line.startsWith('pypdf=='))
  ?.split('==')[1];
if (!requiredPypdf) throw new Error('requirements-p17-m0.txt must pin pypdf');

const mode = process.argv.includes('--write') ? 'write' : 'check';
const userProfile = process.env.USERPROFILE || process.env.HOME || '';
const candidates = [
  process.env.P17_PYTHON ? { command: process.env.P17_PYTHON, prefix: [] } : null,
  userProfile ? {
    command: path.join(userProfile, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe'),
    prefix: [],
  } : null,
  { command: 'python', prefix: [] },
  { command: 'py', prefix: ['-3'] },
].filter(Boolean);

const probe = 'from importlib.metadata import version; print(version("pypdf"))';
let runtime = null;
for (const candidate of candidates) {
  if (path.isAbsolute(candidate.command) && !existsSync(candidate.command)) continue;
  try {
    const actual = execFileSync(candidate.command, [...candidate.prefix, '-c', probe], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (actual !== requiredPypdf) continue;
    runtime = candidate;
    break;
  } catch {
    // Try the next runtime candidate.
  }
}

if (!runtime) {
  process.stderr.write(`No Python runtime with pypdf==${requiredPypdf} was found. Install verification/benchmarks/strix21/reporting/requirements-p17-m0.txt or set P17_PYTHON.\n`);
  process.exit(1);
}

const result = spawnSync(runtime.command, [...runtime.prefix, script, '--mode', mode], {
  cwd: root,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
