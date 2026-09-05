import { MEMBER_RELEASE_BENCHMARK_CASES } from './memberReleaseBenchmarkCases.js';
import { runMemberReleaseBenchmarkCase } from './memberReleaseBenchmarkRunCase.js';

export const MEMBER_RELEASE_BENCHMARK_VERSION = 'p2-t09-member-release-benchmark';

export function runMemberReleaseBenchmark() {
  const cases = MEMBER_RELEASE_BENCHMARK_CASES.map(runMemberReleaseBenchmarkCase);
  return {
    version: MEMBER_RELEASE_BENCHMARK_VERSION,
    count: cases.length,
    ok: cases.every((item) => item.status === 'OK'),
    cases,
  };
}
