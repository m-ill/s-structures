import { existsSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'verification', 'benchmarks', 'strix21', 'reporting', 'render_p17_m0_report.py');
const mode = process.argv.includes('--verify-final')
  ? 'verify'
  : (process.argv.includes('--final') ? 'final' : 'draft');
const userProfile = process.env.USERPROFILE || process.env.HOME || '';
const requirementsPath = path.join(root, 'verification', 'benchmarks', 'strix21', 'reporting', 'requirements-p17-m0.txt');
const requiredVersions = Object.fromEntries(readFileSync(requirementsPath, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => line.split('==')));
const candidates = [
  process.env.P17_PYTHON ? { command: process.env.P17_PYTHON, prefix: [] } : null,
  userProfile ? {
    command: path.join(userProfile, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe'),
    prefix: [],
  } : null,
  { command: 'python', prefix: [] },
  { command: 'py', prefix: ['-3'] },
].filter(Boolean);

const probe = [
  'import json',
  'from importlib.metadata import version',
  `print(json.dumps({name: version(name) for name in ${JSON.stringify(Object.keys(requiredVersions))}}))`,
].join(';');
let runtime = null;
for (const candidate of candidates) {
  if (path.isAbsolute(candidate.command) && !existsSync(candidate.command)) continue;
  try {
    const output = execFileSync(candidate.command, [...candidate.prefix, '-c', probe], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const actualVersions = JSON.parse(output);
    if (Object.entries(requiredVersions).some(([name, version]) => actualVersions[name] !== version)) continue;
    runtime = candidate;
    break;
  } catch {
    // Try the next runtime candidate.
  }
}

if (!runtime) {
  process.stderr.write('No Python runtime with the P17 report dependencies was found. Install verification/benchmarks/strix21/reporting/requirements-p17-m0.txt or set P17_PYTHON.\n');
  process.exit(1);
}

const result = spawnSync(runtime.command, [...runtime.prefix, script, '--mode', mode], {
  cwd: root,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
