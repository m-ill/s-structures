// Compatibility facade. Production sparse ownership is src/compute/sparse/matrix.js.
export const SPARSE_MATRIX_VERSION = 'p6-m1-csc-matrix-v1';
export {
  cscMatVec,
  cscToDense,
  denseToCsc,
  denseToTriplets,
  sparseStats,
  tripletsToCsc,
} from '../../compute/sparse/matrix.js';
