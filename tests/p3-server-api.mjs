import assert from 'node:assert/strict';
import { bootTestApp, registerAndLogin } from './helpers/serverTestApp.mjs';
import { createTwoStoryElasticFrameModel } from '../src/index.js';

const app = await bootTestApp();

try {
  // health / meta
  const health = await app.api('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.data.status, 'ok');
  const meta = await app.api('GET', '/api/meta');
  assert.equal(meta.data.data.version, 'p3-server-api-v1');

  const rootPage = await fetch(`${app.baseUrl}/`);
  assert.equal(rootPage.status, 200);
  const rootHtml = await rootPage.text();
  assert.match(rootHtml, /id="canvasWrap"/);
  assert.match(rootHtml, /app\.html#\/login/);

  // register/login/me/logout
  const reg = await app.api('POST', '/api/auth/register', {
    body: { email: 'owner@example.com', password: 'super-secret-pw', name: 'Owner' },
  });
  assert.equal(reg.status, 200, JSON.stringify(reg.data));
  assert.equal(reg.data.data.user.email, 'owner@example.com');

  const dupe = await app.api('POST', '/api/auth/register', {
    body: { email: 'owner@example.com', password: 'super-secret-pw', name: 'Owner' },
  });
  assert.equal(dupe.status, 409);
  assert.equal(dupe.data.error.code, 'CONFLICT');

  const badLogin = await app.api('POST', '/api/auth/login', { body: { email: 'owner@example.com', password: 'wrong' } });
  assert.equal(badLogin.status, 401);

  const login = await app.api('POST', '/api/auth/login', { body: { email: 'owner@example.com', password: 'super-secret-pw' } });
  assert.equal(login.status, 200);
  const token = login.data.data.token;
  assert.ok(token);

  const me = await app.api('GET', '/api/auth/me', { token });
  assert.equal(me.data.data.user.email, 'owner@example.com');

  const noAuth = await app.api('GET', '/api/auth/me');
  assert.equal(noAuth.status, 401);
  assert.equal(noAuth.data.error.code, 'UNAUTHORIZED');

  const forged = await app.api('GET', '/api/auth/me', { token: `${token}x` });
  assert.equal(forged.status, 401);

  // project CRUD
  const blankProjectName = await app.api('POST', '/api/projects', { token, body: { name: '   ' } });
  assert.equal(blankProjectName.status, 400);
  assert.equal(blankProjectName.data.error.code, 'VALIDATION');

  const longProjectName = await app.api('POST', '/api/projects', { token, body: { name: 'P'.repeat(121) } });
  assert.equal(longProjectName.status, 400);
  assert.equal(longProjectName.data.error.code, 'VALIDATION');

  const createProject = await app.api('POST', '/api/projects', { token, body: { name: 'Test Project' } });
  assert.equal(createProject.status, 200, JSON.stringify(createProject.data));
  const projectId = createProject.data.data.project.id;

  const list = await app.api('GET', '/api/projects', { token });
  assert.equal(list.data.data.projects.length, 1);

  const patch = await app.api('PATCH', `/api/projects/${projectId}`, { token, body: { name: 'Renamed' } });
  assert.equal(patch.data.data.project.name, 'Renamed');

  const longDescriptionPatch = await app.api('PATCH', `/api/projects/${projectId}`, {
    token, body: { description: 'D'.repeat(2001) },
  });
  assert.equal(longDescriptionPatch.status, 400);
  assert.equal(longDescriptionPatch.data.error.code, 'VALIDATION');

  // membership + role gate
  const engineerLogin = await registerAndLogin(app, 'engineer2@example.com');
  const forbidden = await app.api('GET', `/api/projects/${projectId}`, { token: engineerLogin.token });
  assert.equal(forbidden.status, 404); // non-member sees not-found, not forbidden (no membership leak)

  const addMember = await app.api('PUT', `/api/projects/${projectId}/members/${engineerLogin.user.id}`, {
    token, body: { role: 'reviewer' },
  });
  assert.equal(addMember.status, 200);

  const reviewerTriesEngineerAction = await app.api('POST', `/api/projects/${projectId}/revisions`, {
    token: engineerLogin.token, body: { model: createTwoStoryElasticFrameModel() },
  });
  assert.equal(reviewerTriesEngineerAction.status, 403);
  assert.equal(reviewerTriesEngineerAction.data.error.code, 'FORBIDDEN');

  // revision round trip
  const model = createTwoStoryElasticFrameModel();
  const badRevisionNote = await app.api('POST', `/api/projects/${projectId}/revisions`, {
    token, body: { model, note: { text: 'not allowed' } },
  });
  assert.equal(badRevisionNote.status, 400);
  assert.equal(badRevisionNote.data.error.code, 'VALIDATION');

  const longRevisionNote = await app.api('POST', `/api/projects/${projectId}/revisions`, {
    token, body: { model, note: 'N'.repeat(1001) },
  });
  assert.equal(longRevisionNote.status, 400);
  assert.equal(longRevisionNote.data.error.code, 'VALIDATION');

  const saveRev1 = await app.api('POST', `/api/projects/${projectId}/revisions`, { token, body: { model } });
  assert.equal(saveRev1.status, 200, JSON.stringify(saveRev1.data));
  assert.equal(saveRev1.data.data.revision.rev, 1);
  assert.equal(saveRev1.data.data.lineageWarning, false);

  const getRev1 = await app.api('GET', `/api/projects/${projectId}/revisions/1`, { token });
  assert.equal(getRev1.status, 200);
  assert.equal(getRev1.data.data.model.nodes.length, model.nodes.length);
  assert.deepEqual(getRev1.data.data.model.schemaVersion, model.schemaVersion);

  // lineage warning: save with a stale parentRev
  const saveRev2 = await app.api('POST', `/api/projects/${projectId}/revisions`, {
    token, body: { model, parentRev: 0 },
  });
  assert.equal(saveRev2.data.data.revision.rev, 2);
  assert.equal(saveRev2.data.data.lineageWarning, true);

  const revList = await app.api('GET', `/api/projects/${projectId}/revisions`, { token });
  assert.equal(revList.data.data.revisions.length, 2);

  // file upload: allowlist + traversal safety
  const upload = await app.api('POST', `/api/projects/${projectId}/files`, {
    token, raw: 'LINE\n0\n', headers: { 'x-file-name': 'plan.dxf', 'content-type': 'application/dxf' },
  });
  assert.equal(upload.status, 200, JSON.stringify(upload.data));
  const fileId = upload.data.data.file.id;
  assert.match(fileId, /^[0-9a-f-]{36}$/);

  const rejectedExt = await app.api('POST', `/api/projects/${projectId}/files`, {
    token, raw: 'nope', headers: { 'x-file-name': 'virus.exe' },
  });
  assert.equal(rejectedExt.status, 400);

  const badEncodedName = await app.api('POST', `/api/projects/${projectId}/files`, {
    token, raw: 'nope', headers: { 'x-file-name': '%E0%A4%A' },
  });
  assert.equal(badEncodedName.status, 400);
  assert.equal(badEncodedName.data.error.code, 'BAD_URI');

  const pathLikeName = await app.api('POST', `/api/projects/${projectId}/files`, {
    token, raw: 'nope', headers: { 'x-file-name': '..%2Fplan.dxf' },
  });
  assert.equal(pathLikeName.status, 400);
  assert.equal(pathLikeName.data.error.code, 'VALIDATION');

  const download = await app.api('GET', `/api/projects/${projectId}/files/${fileId}`, { token });
  assert.equal(download.status, 200);

  const traversal = await app.api('GET', `/api/projects/${projectId}/files/../../secret`, { token });
  assert.equal(traversal.status, 404);

  // Phase 3 evidence register: project-scoped field and owner evidence rows
  const emptyEvidence = await app.api('GET', `/api/projects/${projectId}/evidence`, { token });
  assert.equal(emptyEvidence.status, 200);
  assert.equal(emptyEvidence.data.data.register.summary.acceptedCount, 0);
  assert.deepEqual(emptyEvidence.data.data.finalApprovals, {});
  assert.ok(emptyEvidence.data.data.register.summary.missing.includes('real-office-dxf-fixtures'));

  const evidenceWrite = await app.api('POST', `/api/projects/${projectId}/evidence`, {
    token,
    body: { evidence: { id: 'real-office-dxf-fixtures', accepted: true, fileId, reportPath: 'reports/import-validation/dxf.md' } },
  });
  assert.equal(evidenceWrite.status, 200, JSON.stringify(evidenceWrite.data));
  assert.equal(evidenceWrite.data.data.evidence.accepted, true);
  assert.equal(evidenceWrite.data.data.register.summary.acceptedCount, 1);

  const evidenceList = await app.api('GET', `/api/projects/${projectId}/evidence`, { token: engineerLogin.token });
  assert.equal(evidenceList.status, 200);
  assert.equal(evidenceList.data.data.evidence.length, 1);
  assert.equal(evidenceList.data.data.register.rows.find((row) => row.id === 'real-office-dxf-fixtures').status, 'ACCEPTED');

  const invalidEvidenceWrite = await app.api('POST', `/api/projects/${projectId}/evidence`, {
    token,
    body: { evidence: { accepted: true } },
  });
  assert.equal(invalidEvidenceWrite.status, 400);
  assert.equal(invalidEvidenceWrite.data.error.code, 'VALIDATION');

  const unknownEvidenceWrite = await app.api('POST', `/api/projects/${projectId}/evidence`, {
    token,
    body: { evidence: { id: 'not-in-phase3-plan', accepted: true } },
  });
  assert.equal(unknownEvidenceWrite.status, 400);
  assert.equal(unknownEvidenceWrite.data.error.code, 'VALIDATION');
  assert.equal(unknownEvidenceWrite.data.error.details.reason, 'unknown-phase3-evidence');
  assert.ok(unknownEvidenceWrite.data.error.details.allowedIds.includes('security-signoff'));

  const missingEvidenceFileWrite = await app.api('POST', `/api/projects/${projectId}/evidence`, {
    token,
    body: { evidence: { id: 'real-pointcloud-files', accepted: true, fileId: '00000000-0000-0000-0000-000000000000' } },
  });
  assert.equal(missingEvidenceFileWrite.status, 400);
  assert.equal(missingEvidenceFileWrite.data.error.code, 'VALIDATION');
  assert.equal(missingEvidenceFileWrite.data.error.details.reason, 'missing-evidence-file');

  const securityEvidenceWrite = await app.api('POST', `/api/projects/${projectId}/evidence`, {
    token,
    body: { evidence: { id: 'security-signoff', accepted: true, owner: 'owner', reportPath: 'reports/launch-readiness/security.md' } },
  });
  assert.equal(securityEvidenceWrite.status, 200, JSON.stringify(securityEvidenceWrite.data));
  assert.equal(securityEvidenceWrite.data.data.register.summary.acceptedCount, 2);
  assert.equal(securityEvidenceWrite.data.data.register.rows.find((row) => row.id === 'security-signoff').status, 'ACCEPTED');
  assert.deepEqual(securityEvidenceWrite.data.data.finalApprovals, {});

  const finalApprovalEvidenceWrite = await app.api('POST', `/api/projects/${projectId}/evidence`, {
    token,
    body: {
      evidence: {
        id: 'final-structural-signoff',
        accepted: true,
        approved: true,
        finalApprovalField: 'finalStructuralSignoff',
        owner: 'owner',
      },
    },
  });
  assert.equal(finalApprovalEvidenceWrite.status, 200, JSON.stringify(finalApprovalEvidenceWrite.data));
  assert.equal(finalApprovalEvidenceWrite.data.data.finalApprovals.finalStructuralSignoff, true);
  assert.equal(finalApprovalEvidenceWrite.data.data.register.summary.acceptedCount, 3);

  const finalApprovalEvidenceList = await app.api('GET', `/api/projects/${projectId}/evidence`, { token });
  assert.equal(finalApprovalEvidenceList.data.data.finalApprovals.finalStructuralSignoff, true);

  const reviewerTriesEvidenceWrite = await app.api('POST', `/api/projects/${projectId}/evidence`, {
    token: engineerLogin.token,
    body: { evidence: { id: 'security-signoff', accepted: true } },
  });
  assert.equal(reviewerTriesEvidenceWrite.status, 403);

  // project library: M10 material/section records through server store
  const putMaterial = await app.api('PUT', `/api/projects/${projectId}/library/materials/SS400`, {
    token,
    body: {
      item: {
        id: 'SS400',
        version: 1,
        kind: 'steel',
        elastic: { E: 205000, G: 79000 },
        strength: { steel: { Fy: 235, Fu: 400 } },
      },
    },
  });
  assert.equal(putMaterial.status, 200, JSON.stringify(putMaterial.data));
  assert.equal(putMaterial.data.data.item.source.scope, 'project');

  const putSection = await app.api('PUT', `/api/projects/${projectId}/library/sections/H-300x150`, {
    token,
    body: { item: { id: 'H-300x150', version: 1, kind: 'direct', shape: 'H', properties: { A: 0.006, Iy: 8.4e-5, Iz: 1.2e-5 } } },
  });
  assert.equal(putSection.status, 200, JSON.stringify(putSection.data));

  const materialList = await app.api('GET', `/api/projects/${projectId}/library/materials`, { token: engineerLogin.token });
  assert.equal(materialList.status, 200);
  assert.equal(materialList.data.data.items.length, 1);

  const materialItem = await app.api('GET', `/api/projects/${projectId}/library/materials/SS400?version=1`, { token });
  assert.equal(materialItem.status, 200);
  assert.equal(materialItem.data.data.item.id, 'SS400');

  const reviewerTriesLibraryWrite = await app.api('PUT', `/api/projects/${projectId}/library/materials/SM490`, {
    token: engineerLogin.token,
    body: { item: { id: 'SM490', version: 1, kind: 'steel', elastic: { E: 205000, G: 79000 } } },
  });
  assert.equal(reviewerTriesLibraryWrite.status, 403);

  // approval workflow: reviewer can approve, subsequent save revokes it
  const approve = await app.api('POST', `/api/projects/${projectId}/approval`, {
    token: engineerLogin.token, body: { state: 'approved', rev: 2 },
  });
  assert.equal(approve.status, 200, JSON.stringify(approve.data));
  assert.equal(approve.data.data.approval.state, 'approved');

  const saveRev3 = await app.api('POST', `/api/projects/${projectId}/revisions`, { token, body: { model, parentRev: 2 } });
  assert.equal(saveRev3.data.data.revision.rev, 3);
  const approvalAfter = await app.api('GET', `/api/projects/${projectId}/approval`, { token });
  assert.equal(approvalAfter.data.data.approval.state, 'revoked');

  // error envelope shape
  const notFound = await app.api('GET', '/api/projects/not-a-uuid', { token });
  assert.equal(notFound.status, 404);
  assert.ok(notFound.data.error.code);

  const routeMiss = await app.api('GET', '/api/does-not-exist');
  assert.equal(routeMiss.status, 404);
  assert.equal(routeMiss.data.ok, false);

  const malformedApiPath = await app.api('GET', '/api/projects/%E0%A4%A', { token });
  assert.equal(malformedApiPath.status, 400);
  assert.equal(malformedApiPath.data.error.code, 'BAD_URI');

  const malformedStaticPath = await app.api('GET', '/%E0%A4%A');
  assert.equal(malformedStaticPath.status, 400);

  console.log(JSON.stringify({
    ok: true, version: 'p3-server-api', projectId, revisions: 3,
  }, null, 2));
} finally {
  await app.close();
}
