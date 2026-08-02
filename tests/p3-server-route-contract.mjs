import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAgentManifest, buildPhase3PlanAlignmentReport } from '../src/index.js';
import { requireProjectRole } from '../server/auth/guard.mjs';
import { createApp } from '../server/main.mjs';
import { createRouter } from '../server/router.mjs';

const routeFiles = [
  'server/main.mjs',
  'server/routes/auth.mjs',
  'server/routes/projects.mjs',
  'server/routes/revisions.mjs',
  'server/routes/files.mjs',
  'server/routes/imports.mjs',
  'server/routes/evidence.mjs',
  'server/routes/approval.mjs',
  'server/routes/libraries.mjs',
];

const actual = routeFiles.flatMap((file) => extractRoutes(file));
const planned = buildPhase3PlanAlignmentReport(buildAgentManifest()).serverApi.endpoints
  .map((row) => `${row.method} ${row.path}`)
  .sort();

assert.deepEqual(actual.map((row) => `${row.method} ${row.path}`).sort(), planned);
assert.equal(actual.length, 32);

const app = createApp({
  port: 0,
  dataDir: join(tmpdir(), 's-structures-p3-route-contract-data'),
  secretsDir: join(tmpdir(), 's-structures-p3-route-contract-secrets'),
});
const registered = app.router.listRoutes();
const projectRoutes = registered.filter((row) => row.path === '/api/projects' || row.path.startsWith('/api/projects/'));
assert.equal(projectRoutes.length, 25);
for (const route of projectRoutes) {
  assert.ok(route.auth, `${route.method} ${route.path} must declare auth metadata`);
  if (route.path === '/api/projects') {
    assert.equal(route.auth.user, true, `${route.method} ${route.path} must declare user auth`);
    assert.equal(route.auth.project, false, `${route.method} ${route.path} must not require project auth`);
  } else {
    assert.equal(route.auth.project, true, `${route.method} ${route.path} must declare project auth`);
    assert.ok(['viewer', 'reviewer', 'engineer', 'owner'].includes(route.auth.role), `${route.method} ${route.path} must declare a valid role`);
  }
}

assert.throws(() => {
  const router = createRouter();
  router.get('/api/projects/:id/bad', async () => ({}), { auth: { project: true, role: 'viewr' } });
}, /Invalid route auth role/);

await assert.rejects(
  () => requireProjectRole(app.ctx, '00000000-0000-0000-0000-000000000000', 'user', 'viewr'),
  /Project role guard is misconfigured/,
);

console.log(JSON.stringify({
  ok: true,
  routeFiles: routeFiles.length,
  endpoints: actual.length,
  projectAuthRoutes: projectRoutes.length,
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
