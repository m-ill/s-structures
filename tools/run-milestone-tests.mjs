import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const allTests = Object.keys(packageJson.scripts || {})
  .map((name) => {
    const match = /^test:m(\d+)$/.exec(name);
    return match ? { name, milestone: Number(match[1]) } : null;
  })
  .filter(Boolean)
  .sort((a, b) => a.milestone - b.milestone);

const selection = selectTests(allTests, process.argv.slice(2));
if (!selection.length) {
  throw new Error('No milestone tests matched the requested range.');
}

for (const item of selection) {
  await runNpmScript(item.name);
}

function selectTests(tests, args) {
  let from = null;
  let to = null;
  for (const arg of args) {
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

function parseMilestone(value) {
  const match = /^m?(\d+)$/i.exec(String(value).trim());
  if (!match) throw new Error(`Invalid milestone: ${value}`);
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
