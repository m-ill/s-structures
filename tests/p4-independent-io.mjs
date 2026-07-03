import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoutes = await readFile('server/routes/projects.mjs', 'utf8');
const projectStore = await readFile('server/store/projectStore.mjs', 'utf8');

assert.match(projectRoutes, /Promise\.all\(\[\s*requireProjectRole/);
assert.match(projectRoutes, /ctx\.userStore\.findById\(params\.userId\)/);
assert.match(projectStore, /Promise\.all\(\[this\.get\(id\), this\.listRevisions\(id\)\]\)/);

console.log(JSON.stringify({ ok: true, version: 'p4-independent-io' }, null, 2));
