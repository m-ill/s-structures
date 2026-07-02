import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAgentManifest, buildPhase3PlanAlignmentReport } from '../src/index.js';

const routeFiles = [
  'server/main.mjs',
  'server/routes/auth.mjs',
  'server/routes/projects.mjs',
  'server/routes/revisions.mjs',
  'server/routes/files.mjs',
  'server/routes/imports.mjs',
  'server/routes/approval.mjs',
  'server/routes/libraries.mjs',
];

const actual = routeFiles.flatMap((file) => extractRoutes(file));
const planned = buildPhase3PlanAlignmentReport(buildAgentManifest()).serverApi.endpoints
  .map((row) => `${row.method} ${row.path}`)
  .sort();

assert.deepEqual(actual.map((row) => `${row.method} ${row.path}`).sort(), planned);
assert.equal(actual.length, 29);

console.log(JSON.stringify({
  ok: true,
  routeFiles: routeFiles.length,
  endpoints: actual.length,
}, null, 2));

function extractRoutes(file) {
  const text = readFileSync(file, 'utf8');
  const routes = [];
  const pattern = /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = pattern.exec(text))) {
    routes.push({
      file,
      method: match[1].toUpperCase(),
      path: match[2],
    });
  }
  return routes;
}
