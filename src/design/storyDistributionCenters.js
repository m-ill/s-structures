export function hasDistributionCenters(story) {
  return validCenter(story?.massCenter) && validCenter(story?.diaphragmCenter);
}

function validCenter(center) {
  return Number.isFinite(center?.x) && Number.isFinite(center?.y);
}
