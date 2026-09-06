import { STORY_MASS_SUMMARY_VERSION } from '../core/storyMassSummary.js';

export function attachStoryMassToLateralRows(rows, storyMassSummary) {
  const byStory = new Map((storyMassSummary?.rows || []).map((row) => [row.story, row]));
  return rows.map((row) => {
    const mass = byStory.get(row.story);
    if (!mass) return row;
    return {
      ...row,
      storyMassVersion: STORY_MASS_SUMMARY_VERSION,
      mass: mass.mass,
      massCenter: mass.massCenter,
      diaphragmCenter: mass.diaphragmCenter,
      stiffnessCenter: mass.stiffnessCenter,
      eccentricity: mass.eccentricity,
    };
  });
}
