export function storyShearRows(items, baseZ) {
  const rows = [];
  let shearX = 0;
  let shearY = 0;
  for (let i = items.length - 1; i >= 0; i -= 1) {
    shearX += items[i].forceX;
    shearY += items[i].forceY;
    rows.unshift({
      ...items[i],
      cumulativeShearX: shearX,
      cumulativeShearY: shearY,
      overturningX: shearY * (items[i].z - baseZ),
      overturningY: shearX * (items[i].z - baseZ),
    });
  }
  return rows;
}
