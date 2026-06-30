export function reducedFixedDofs(fixedDofs, map) {
  const fixed = new Set();
  for (const dof of fixedDofs) {
    const row = map.rows[dof];
    if (row?.length === 1 && Math.abs(row[0][1] - 1) <= 1e-12) fixed.add(row[0][0]);
  }
  return fixed;
}
