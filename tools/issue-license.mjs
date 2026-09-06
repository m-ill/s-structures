import { generateKeyPairSync, sign } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { canonicalPayload, LICENSE_VERSION } from '../server/auth/license.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, ...rest] = item.replace(/^--/, '').split('=');
  return [key, rest.join('=') || true];
}));

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const payload = {
  plan: String(args.plan || 'evaluation'),
  licensee: String(args.licensee || 'local-evaluation'),
  expiry: String(args.expiry || '2099-12-31'),
  issuedAt: new Date().toISOString(),
};
const signature = sign(null, Buffer.from(canonicalPayload(payload)), privateKey).toString('base64');
const license = { version: LICENSE_VERSION, payload, signature };
const output = String(args.out || 'data/license.key');
await writeFile(output, JSON.stringify(license, null, 2));
console.log(JSON.stringify({
  ok: true,
  output,
  publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
}, null, 2));
