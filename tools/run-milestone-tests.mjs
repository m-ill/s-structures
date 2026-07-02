import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const legacyTests = Object.keys(packageJson.scripts || {})
  .map((name) => {
    const match = /^test:m(\d+)$/.exec(name);
    return match ? { name, milestone: Number(match[1]) } : null;
  })
  .filter(Boolean)
  .sort((a, b) => a.milestone - b.milestone);
const phase3Tests = [
  p3('P3-M0', 'test:m0'),
  p3('P3-M1', 'test:p3server'),
  p3('P3-M2', 'test:p3auth'),
  p3('P3-M3', 'test:p3persistence'),
  p3('P3-M4', 'test:p3appshell'),
  p3('P3-M4', 'test:p3viewer'),
  p3('P3-M5', 'test:p3import'),
  p3('P3-M6', 'test:p3m6'),
  p3('P3-M7', 'test:p3m7'),
  p3('P3-M7', 'test:p3m7-ui'),
  p3('P3-M7', 'test:p3drawing'),
  p3('P3-M8', 'test:p3m8'),
  p3('P3-M9', 'test:p3m9'),
  p3('P3-M9', 'test:p3m9-e2e'),
  p3('P3-M9', 'test:p3pointcloud'),
  p3('P3-M9', 'test:p3import-review'),
  p3('P3-M10', 'test:p3m10'),
  p3('P3-M10', 'test:p3section'),
  p3('P3-M11', 'test:p3m11'),
  p3('P3-M12', 'test:p3m12'),
  p3('P3-M13', 'test:p3m13'),
  p3('P3-M13', 'test:p3elastic-review'),
  p3('P3-M14', 'test:p3m14'),
  p3('P3-M15', 'test:p3m15'),
  p3('P3-M16', 'test:p3m16'),
  p3('P3-M16', 'test:p3nonlinear-review'),
  p3('P3-M17', 'test:p3m17'),
  p3('P3-M18', 'test:p3m18'),
  p3('P3-M18', 'test:p3design-review'),
  p3('P3-M18', 'test:p3engineering'),
  p3('P3-M19', 'test:p3m19'),
  p3('P3-M20', 'test:p3productization-review'),
  p3('P3-M20', 'test:p3owner-signoff'),
  p3('P3-M20', 'test:p3completion-audit'),
  p3('P3-M20', 'test:p3m20'),
  p3('P3-M20', 'test:p3alignment'),
  p3('P3-M20', 'test:p3runner'),
  p3('P3-M20', 'test:p3docs'),
  p3('P3-M20', 'test:p3practice'),
  p3('P3-M20', 'test:p3routes'),
];

const args = process.argv.slice(2);
const usePhase3 = args.some((arg) => arg === '--phase3' || arg === 'phase3' || arg === 'p3');
const listOnly = args.includes('--list');
const selection = usePhase3 ? selectPhase3Tests(phase3Tests, args) : selectLegacyTests(legacyTests, args);
if (!selection.length) {
  throw new Error('No milestone tests matched the requested range.');
}

if (listOnly) {
  for (const item of selection) {
    console.log(`${item.milestone}\t${item.name}\t${packageJson.scripts?.[item.name]}`);
  }
  process.exit(0);
}

for (const item of selection) {
  await runNpmScript(item.name);
}

function selectLegacyTests(tests, args) {
  let from = null;
  let to = null;
  for (const arg of args) {
    if (arg === '--list') continue;
    if (arg.startsWith('--from=')) from = parseMilestone(arg.slice('--from='.length));
    else if (arg.startsWith('--to=')) to = parseMilestone(arg.slice('--to='.length));
    else if (/^m?\d+$/i.test(arg)) {
      from = parseMilestone(arg);
      to = from;
    } else if (arg !== 'all') {
      throw new Error(`Unsupported test runner argument: ${arg}`);
    }
  }
  return tests.filter((item) => (
    (from == null || item.milestone >= from) &&
    (to == null || item.milestone <= to)
  ));
}

function selectPhase3Tests(tests, args) {
  let from = null;
  let to = null;
  for (const arg of args) {
    if (arg === '--phase3' || arg === 'phase3' || arg === 'p3' || arg === '--list' || arg === 'all') continue;
    if (arg.startsWith('--from=')) from = parsePhase3Milestone(arg.slice('--from='.length));
    else if (arg.startsWith('--to=')) to = parsePhase3Milestone(arg.slice('--to='.length));
    else if (/^P3-M\d+$/i.test(arg)) {
      from = parsePhase3Milestone(arg);
      to = from;
    } else {
      throw new Error(`Unsupported Phase 3 test runner argument: ${arg}`);
    }
  }
  return tests.filter((item) => (
    (from == null || item.order >= from) &&
    (to == null || item.order <= to)
  ));
}

function parseMilestone(value) {
  const match = /^m?(\d+)$/i.exec(String(value).trim());
  if (!match) throw new Error(`Invalid milestone: ${value}`);
  return Number(match[1]);
}

function parsePhase3Milestone(value) {
  const match = /^P3-M(\d+)$/i.exec(String(value).trim());
  if (!match) throw new Error(`Invalid Phase 3 milestone: ${value}`);
  return Number(match[1]);
}

function runNpmScript(scriptName) {
  return new Promise((resolve, reject) => {
    const script = packageJson.scripts?.[scriptName];
    const command = parseNodeScript(script, scriptName);
    const child = spawn(process.execPath, command.args, {
      stdio: 'inherit',
      shell: false,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptName} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}.`));
    });
  });
}

function parseNodeScript(script, scriptName) {
  const parts = String(script || '').trim().split(/\s+/).filter(Boolean);
  if (parts[0] !== 'node') {
    throw new Error(`${scriptName} must be a node-based test script for the milestone runner.`);
  }
  return { args: parts.slice(1) };
}

function p3(milestone, name) {
  return { milestone, order: parsePhase3Milestone(milestone), name };
}
