import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../server/main.mjs';

export async function bootTestApp(overrides = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 's-structures-test-'));
  const { server, config, ctx } = createApp({ dataDir, port: 0, allowRegistration: true, ...overrides });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function close() {
    await new Promise((resolve) => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  }

  async function api(method, path, { body, token, raw, headers } = {}) {
    const reqHeaders = { ...(headers || {}) };
    let payload;
    if (raw != null) {
      payload = raw;
    } else if (body !== undefined) {
      reqHeaders['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    if (token) reqHeaders.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${path}`, { method, headers: reqHeaders, body: payload });
    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, data, headers: res.headers };
  }

  return { server, config, ctx, baseUrl, api, close };
}

export async function registerAndLogin(app, email = 'engineer@example.com', password = 'super-secret-pw') {
  await app.api('POST', '/api/auth/register', { body: { email, password, name: 'Test Engineer' } });
  const login = await app.api('POST', '/api/auth/login', { body: { email, password } });
  return login.data.data;
}
