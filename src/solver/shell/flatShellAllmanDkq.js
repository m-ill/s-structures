// Deprecated source-compatible facade. The implementation is QM6-EAS + MITC4
// with a Hughes-Brezzi curl-compatible drilling penalty.
export {
  FLAT_SHELL_QM6_MITC4_VERSION,
  buildFlatShellQm6Mitc4,
} from './flatShellQm6Mitc4.js';

import {
  FLAT_SHELL_QM6_MITC4_VERSION,
  buildFlatShellQm6Mitc4,
} from './flatShellQm6Mitc4.js';

export const FLAT_SHELL_ALLMAN_DKQ_VERSION = FLAT_SHELL_QM6_MITC4_VERSION;

/** @deprecated Use buildFlatShellQm6Mitc4. */
export function buildFlatShellAllmanDkq(input = {}, options = {}) {
  return buildFlatShellQm6Mitc4(input, options);
}
