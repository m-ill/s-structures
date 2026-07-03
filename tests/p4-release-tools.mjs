import assert from 'node:assert/strict';
import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import packageJson from '../package.json' with { type: 'json' };
import { loadConfig } from '../server/config.mjs';
import { canonicalPayload, LICENSE_VERSION, verifyLicense } from '../server/auth/license.mjs';
import { isMainEntry } from '../server/main.mjs';
import { PRODUCT_VERSION } from '../src/platform/platformVersion.js';

assert.equal(packageJson.version, PRODUCT_VERSION);
assert.equal(isMainEntry('C:/app/server/main.mjs'), true);
assert.equal(isMainEntry('C:/app/desktop/main.mjs'), false);

const tmp = await mkdtemp(join(tmpdir(), 's-structures-release-tools-'));
const configPath = join(tmp, 'config.json');
await writeFile(configPath, JSON.stringify({ port: 6123, host: '0.0.0.0', dataDir: './custom-data', allowRegistration: false }));
const config = loadConfig({ configPath, env: {} });
assert.equal(config.port, 6123);
assert.equal(config.host, '0.0.0.0');
assert.equal(config.allowRegistration, false);
assert.match(config.dataDir.replace(/\\/g, '/'), /custom-data$/);

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const payload = { plan: 'team', licensee: 'Release Test', expiry: '2099-12-31' };
const license = {
  version: LICENSE_VERSION,
  payload,
  signature: sign(null, Buffer.from(canonicalPayload(payload)), privateKey).toString('base64'),
};
const verified = verifyLicense(JSON.stringify(license), {
  publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
});
assert.equal(verified.ok, true);
assert.equal(verified.mode, 'licensed');

const tampered = verifyLicense(JSON.stringify({ ...license, payload: { ...payload, plan: 'changed' } }), {
  publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
});
assert.equal(tampered.ok, false);

assert.ok((await stat('tools/build-release.mjs')).isFile());
assert.ok((await stat('tools/backup-data.mjs')).isFile());
assert.ok((await stat('desktop/main.mjs')).isFile());
assert.match(await readFile('desktop/README.md', 'utf8'), /Desktop Packaging Decision/);

console.log(JSON.stringify({ ok: true, version: 'p4-release-tools', productVersion: PRODUCT_VERSION }, null, 2));
