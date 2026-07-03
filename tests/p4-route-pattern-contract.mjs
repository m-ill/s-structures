import assert from 'node:assert/strict';
import { createRouter, ApiError } from '../server/router.mjs';
import { buildHash, matchRoute } from '../src/app/routes.js';
import { compileRoutePattern, matchCompiledRoute, ROUTE_PATTERN_VERSION } from '../src/core/routePattern.js';

const compiled = compileRoutePattern('/p/:projectId/import/:jobId');
assert.equal(compiled.version, ROUTE_PATTERN_VERSION);
assert.deepEqual(compiled.keys, ['projectId', 'jobId']);
assert.deepEqual(matchCompiledRoute(compiled, '/p/a%20b/import/job-1'), {
  projectId: 'a b',
  jobId: 'job-1',
});
assert.equal(matchCompiledRoute(compiled, '/p/a/modeler'), null);

assert.deepEqual(matchRoute('#/p/a%20b/import/job-1'), {
  name: 'importReview',
  params: { projectId: 'a b', jobId: 'job-1' },
  path: '/p/a%20b/import/job-1',
});
assert.equal(matchRoute('#/p/%E0%A4%A/modeler'), null);
assert.equal(buildHash('modeler', { projectId: 'a b' }), '#/p/a%20b/modeler');

const router = createRouter();
router.get('/api/projects/:id/revisions/:rev', () => ({ ok: true }));
const matched = router.match('GET', '/api/projects/a%20b/revisions/3');
assert.deepEqual(matched.params, { id: 'a b', rev: '3' });

assert.throws(
  () => router.match('GET', '/api/projects/%E0%A4%A/revisions/3'),
  (error) => error instanceof ApiError && error.status === 400 && error.code === 'BAD_URI',
);

console.log(JSON.stringify({ ok: true, version: 'p4-route-pattern-contract' }, null, 2));
