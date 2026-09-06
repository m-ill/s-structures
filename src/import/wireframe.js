import { buildImportCandidate } from './candidate.js';
import { classifyMembers } from './memberClassify.js';
import { cleanSegments } from './segmentClean.js';
import { inferGrids, inferStories } from './storyGrid.js';

export function wireframeToImportCandidate(segments, options = {}) {
  const cleaned = cleanSegments(segments, options);
  const members = classifyMembers(cleaned.members, cleaned.nodes, options)
    .map((member, index) => ({ id: `m${index + 1}`, ...member }));
  const stories = inferStories(cleaned.nodes, options);
  const grids = inferGrids(cleaned.nodes, options);
  return buildImportCandidate({
    source: options.source || { type: 'wireframe' },
    nodes: cleaned.nodes,
    members,
    stories,
    grids,
    audit: {
      counts: { ...cleaned.audit },
      warnings: buildWarnings(stories, grids, members),
    },
  });
}

function buildWarnings(stories, grids, members) {
  const warnings = [];
  if (stories.length < 2) warnings.push('story-inference-low');
  if (grids.length < 4) warnings.push('grid-inference-low');
  if (members.some((member) => member.kind === 'unknown')) warnings.push('member-classification-unknown');
  return warnings;
}
