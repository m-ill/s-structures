// Deprecated source-compatible facade. The implementation moved to MITC4.
export {
  SLAB_PLATE_MITC4_VERSION,
  SLAB_PLATE_NUMERICAL_QUALIFICATION_VERSION,
  buildSlabPlateMitc4,
  buildSlabPressureLoad,
  plateClosedForm,
  lumpedPlateMass,
} from './slabPlateMitc4.js';

import {
  SLAB_PLATE_MITC4_VERSION,
  buildSlabPlateMitc4,
} from './slabPlateMitc4.js';

export const SLAB_PLATE_DKQ_VERSION = SLAB_PLATE_MITC4_VERSION;

/** @deprecated Use buildSlabPlateMitc4. */
export function buildSlabPlateDkq(input = {}) {
  return buildSlabPlateMitc4(input);
}
