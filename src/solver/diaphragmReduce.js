export function reduceSystem(K, F, map) {
  const Kr = Array.from({ length: map.ncols }, () => new Array(map.ncols).fill(0));
  const Fr = new Array(map.ncols).fill(0);
  for (let i = 0; i < map.rows.length; i += 1) {
    for (const [a, ca] of map.rows[i]) Fr[a] += ca * F[i];
    for (let j = 0; j < map.rows.length; j += 1) {
      const kij = K[i][j];
      if (!kij) continue;
      for (const [a, ca] of map.rows[i]) {
        for (const [b, cb] of map.rows[j]) Kr[a][b] += ca * kij * cb;
      }
    }
  }
  return { K: Kr, F: Fr };
}

export function expandReducedDisplacements(q, map) {
  return map.rows.map((row) => row.reduce((sum, [col, coeff]) => sum + coeff * q[col], 0));
}
