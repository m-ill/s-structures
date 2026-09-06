import { stableHash } from './stableHash.js';

export const MODEL_HASH_VERSION = 'p15-m8-canonical-model-hash-v1';

export function modelHash(value) {
  return stableHash(value).slice(0, 16);
}

