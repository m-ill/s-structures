export function purposeForCombinationGroup(group) {
  return {
    strength: 'member strength design',
    service: 'drift and deflection review',
    seismic: 'seismic strength and service review',
    foundation: 'support reaction and stability review',
    construction: 'temporary condition review',
  }[group] || 'general review';
}
