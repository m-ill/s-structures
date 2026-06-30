import { MEMBER_RELEASE_VERSION as RV, memberReleaseDofs, memberReleaseState } from './memberReleaseContract.js';

export const MEMBER_RELEASE_SUMMARY_VERSION = 'p2-t09-member-release-summary';

export function buildMemberReleaseSummary(model) {
  const counts = { rigid: 0, pin: 0, unsupported: 0 };
  const members = (model?.members || []).map((member) => row(member, counts));
  return {
    version: MEMBER_RELEASE_SUMMARY_VERSION,
    releaseVersion: RV,
    memberCount: members.length,
    releasedMemberCount: members.filter((item) => item.released).length,
    counts,
    members,
  };
}

function row(member, counts) {
  const releases = memberReleaseState(member);
  Object.values(releases).forEach((value) => {
    counts[value === 'pin' ? 'pin' : value === 'rigid' ? 'rigid' : 'unsupported'] += 1;
  });
  return {
    id: member.id || null,
    releases,
    releaseDofs: memberReleaseDofs(member),
    released: releases.i === 'pin' || releases.j === 'pin',
  };
}
