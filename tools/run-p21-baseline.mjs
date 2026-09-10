import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const out = path.join(root, 'output/phase21/m0-baseline');
if (fs.existsSync(out)) throw new Error('BASELINE_ALREADY_EXISTS');
fs.mkdirSync(out, { recursive: true });
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const files = [];
function preserve(relative) {
  const bytes = fs.readFileSync(path.join(root, relative));
  const target = path.join(out, 'original', relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  files.push({ path: relative.replaceAll('\\', '/'), bytes: bytes.length, sha256: digest(bytes) });
}
function walk(relative) {
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) walk(child); else if (entry.isFile()) preserve(child);
  }
}
walk('src');
walk('output/reports/design-workflow-pilot-20260910/run-001');
const git = (...args) => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { encoding: 'utf8' }).trim();
const manifest = { version: 'p21-baseline-v1', created: new Date().toISOString(), commit: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'), worktree: git('status', '--short'), evidenceStatus: 'original HTML complete; native JSON/CSV partial; reconstructed model is not original identity', files };
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ baseline: out, files: files.length, bytes: files.reduce((n, r) => n + r.bytes, 0), manifestSha256: digest(fs.readFileSync(path.join(out, 'manifest.json'))) }));
