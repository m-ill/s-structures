import assert from 'node:assert/strict';
import { bootTestApp, registerAndLogin } from './helpers/serverTestApp.mjs';

const app = await bootTestApp();

try {
  for(const [path,expected] of [['/index.html?shell=1','SAMEORIGIN'],['/index.html','DENY'],['/app.html?shell=1','DENY'],['/api/health?shell=1','DENY']]) {
    const response=await app.api('GET',path);
    assert.equal(response.headers.get('x-frame-options'),expected);
    assert.ok(response.headers.get('content-security-policy').includes(expected==='SAMEORIGIN'?"frame-ancestors 'self'":"frame-ancestors 'none'"));
  }

  const owner = await registerAndLogin(app, 'p4-security@example.com');
  const created = await app.api('POST', '/api/projects', {
    token: owner.token,
    body: { name: 'P4 Security Headers' },
  });
  const projectId = created.data.data.project.id;

  const riskyUpload = await app.api('POST', `/api/projects/${projectId}/files`, {
    token: owner.token,
    raw: '<html><script>alert(1)</script></html>',
    headers: {
      'x-file-name': 'field-note.txt',
      'content-type': 'text/html',
    },
  });
  assert.equal(riskyUpload.status, 200, JSON.stringify(riskyUpload.data));

  const riskyFileId = riskyUpload.data.data.file.id;
  const riskyDownload = await app.api('GET', `/api/projects/${projectId}/files/${riskyFileId}`, {
    token: owner.token,
  });
  assert.equal(riskyDownload.status, 200);
  assert.equal(riskyDownload.headers.get('content-type'), 'application/octet-stream');
  assert.equal(riskyDownload.headers.get('x-content-type-options'), 'nosniff');

  const jsonUpload = await app.api('POST', `/api/projects/${projectId}/files`, {
    token: owner.token,
    raw: '{"ok":true}',
    headers: {
      'x-file-name': 'model.json',
      'content-type': 'application/json',
    },
  });
  assert.equal(jsonUpload.status, 200, JSON.stringify(jsonUpload.data));

  const jsonFileId = jsonUpload.data.data.file.id;
  const jsonDownload = await app.api('GET', `/api/projects/${projectId}/files/${jsonFileId}`, {
    token: owner.token,
  });
  assert.equal(jsonDownload.status, 200);
  assert.equal(jsonDownload.headers.get('content-type'), 'application/json');
  assert.equal(jsonDownload.headers.get('x-content-type-options'), 'nosniff');

  console.log(JSON.stringify({
    ok: true,
    version: 'p4-security-headers',
    riskyContentType: riskyDownload.headers.get('content-type'),
  }, null, 2));
} finally {
  await app.close();
}
