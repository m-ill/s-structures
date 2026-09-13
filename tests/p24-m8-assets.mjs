import assert from 'node:assert/strict';
import {resolvePublicAsset} from '../server/staticAssets.mjs';
assert.equal(resolvePublicAsset(process.cwd(),'/assets/fonts/phase24/SStructuresSans.ttf')?.contentType,'font/ttf');
assert.equal(resolvePublicAsset(process.cwd(),'/assets/fonts/phase24/OFL.txt')?.contentType,'text/plain; charset=utf-8');
assert.equal(resolvePublicAsset(process.cwd(),'/assets/fonts/phase24/../../tmp/private.ttf'),null);
assert.equal(resolvePublicAsset(process.cwd(),'/assets/unknown.ttf'),null);
console.log('PASS T16 bundled font and license served through explicit public allowlist');
