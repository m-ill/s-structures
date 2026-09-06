import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = await mkdtemp(join(tmpdir(), 's-structures-backup-'));
const dataDir = join(tmp, 'data');
const outDir = join(tmp, 'backup');
await mkdir(join(dataDir, 'projects', 'p1'), { recursive: true });
await writeFile(join(dataDir, 'projects', 'p1', 'project.json'), JSON.stringify({ id: 'p1' }));

const output = execFileSync(process.execPath, ['tools/backup-data.mjs', `--dataDir=${dataDir}`, `--out=${outDir}`, '--verify'], { encoding: 'utf8' });
const result = JSON.parse(output);
assert.equal(result.ok, true);
assert.equal(result.verified, true);
const manifest = JSON.parse(await readFile(join(outDir, 'backup-manifest.json'), 'utf8'));
assert.equal(manifest.files.length, 1);
assert.equal(manifest.files[0].path, 'projects/p1/project.json');

console.log(JSON.stringify({ ok: true, version: 'p4-backup-tool', fileCount: manifest.files.length }, null, 2));
