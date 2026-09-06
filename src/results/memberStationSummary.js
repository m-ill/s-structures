import { governingMemberPeak } from './memberPeak.js';

export function memberStationSummary(member, stations, peaks) {
  return {
    memberId: member.id,
    role: member.role || member.type || 'member',
    stationCount: stations.length,
    stations,
    peaks,
    governing: governingMemberPeak(peaks),
  };
}
