// Admission limits, not qualified maximum-building capacity or measured heap.
export const PRACTICAL_DESIGN_LIMITS=Object.freeze({
 version:'p25-bounded-profile-v2-300-members',
 qualification:'development-admission-limits; production-size-campaign-pending',
 maxSources:8,
 maxMembers:300,
 // Default force recovery emits 21 stations/member. Refined meshes share this total.
 maxStationsPerSet:6300,
 // Up to two distinct endpoints/member; actual matrix/working-set checks still apply.
 maxReanalysisNodes:600,
 maxCandidates:16,maxCandidateMillis:10000,
 maxEvaluationMillis:120000,
 maxChecksPerPage:50,maxResultChars:44000,maxCheckChunkChars:8000,
 maxEvaluationEntries:8,maxPlanEntries:16,maxJobEntries:16,maxApplicationEntries:64,maxPdfPages:60,
});
