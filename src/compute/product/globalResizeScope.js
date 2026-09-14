import { stableHash } from '../../core/stableHash.js';
import { sectionOf } from '../../core/catalogs.js';

export const GLOBAL_RESIZE_SCOPE_VERSION = 'p30-global-resize-scope-v1';

// Phase30 M6. What the global loop is permitted to resize.
//
// Closing the section -> self weight -> base shear feedback means the loop
// changes member sections, which is a change to the user's model. It does that
// only inside a scope the user declares: a member set and, for each set, the
// ordered section ladder the loop may move along.
//
// A member outside the scope cannot be resized by any path through here. The
// loop proposes; the scope decides what is proposable.
//
// The ladder is ORDERED and must be strictly increasing in gross area, because
// "the demand went up, take the next section" is only meaningful against an
// order. An unordered candidate list would make the step direction arbitrary
// and the oscillation detection meaningless.

const MAX_LADDER = 24;
const MAX_SETS = 64;

/**
 * Validate and freeze a resize scope.
 *
 * Every failure names the offending entry: a scope that silently drops a
 * member would let the loop believe it had exhausted its options when it had
 * merely lost one.
 */
export function declareResizeScope(model, input = {}) {
  const sets = Array.isArray(input.sets) ? input.sets : [];
  if (!sets.length) return failure('RESIZE_SCOPE_EMPTY');
  if (sets.length > MAX_SETS) return failure('RESIZE_SCOPE_TOO_MANY_SETS', { limit: MAX_SETS });

  const memberIds = new Set((model?.members || []).map((row) => row.id));
  const claimed = new Map();
  const normalized = [];

  for (const [index, set] of sets.entries()) {
    const ids = Array.isArray(set?.memberIds) ? set.memberIds : [];
    const ladder = Array.isArray(set?.sectionLadder) ? set.sectionLadder : [];
    if (!ids.length) return failure('RESIZE_SET_MEMBERS_REQUIRED', { setIndex: index });
    if (ladder.length < 2) return failure('RESIZE_SET_LADDER_REQUIRES_TWO_SECTIONS', { setIndex: index });
    if (ladder.length > MAX_LADDER) return failure('RESIZE_SET_LADDER_TOO_LONG', { setIndex: index, limit: MAX_LADDER });

    for (const id of ids) {
      if (!memberIds.has(id)) return failure('RESIZE_SET_MEMBER_NOT_IN_MODEL', { setIndex: index, memberId: id });
      // One member, one ladder. Two sets claiming the same member would make
      // the next step depend on iteration order.
      if (claimed.has(id)) return failure('RESIZE_SET_MEMBER_CLAIMED_TWICE', { memberId: id, setIndex: index, alsoIn: claimed.get(id) });
      claimed.set(id, index);
    }

    const rungs = [];
    for (const secId of ladder) {
      let section;
      try {
        section = sectionOf(model, secId);
      } catch {
        return failure('RESIZE_SET_SECTION_NOT_RESOLVABLE', { setIndex: index, secId });
      }
      const area = Number(section?.A);
      if (!Number.isFinite(area) || area <= 0) return failure('RESIZE_SET_SECTION_AREA_UNKNOWN', { setIndex: index, secId });
      rungs.push({ secId, area });
    }

    for (let rung = 1; rung < rungs.length; rung += 1) {
      if (!(rungs[rung].area > rungs[rung - 1].area)) {
        return failure('RESIZE_SET_LADDER_NOT_INCREASING', {
          setIndex: index,
          at: rungs[rung].secId,
          after: rungs[rung - 1].secId,
          note: 'the ladder must be strictly increasing in gross area so a step has a direction',
        });
      }
    }

    normalized.push({
      setIndex: index,
      label: typeof set.label === 'string' ? set.label : null,
      memberIds: [...ids],
      ladder: rungs,
    });
  }

  const scope = {
    version: GLOBAL_RESIZE_SCOPE_VERSION,
    ok: true,
    reason: null,
    sets: normalized,
    memberCount: claimed.size,
    scopeHash: stableHash({ sets: normalized.map((set) => ({ memberIds: set.memberIds, ladder: set.ladder.map((row) => row.secId) })) }),
    basis: 'user-declared resize permission; members outside this scope are never resized',
  };
  return Object.freeze(scope);
}

/**
 * The next section up the ladder for a member, or null at the top.
 *
 * A member outside the scope returns a refusal rather than null, because
 * "not permitted" and "already at the largest section" are different answers
 * and the loop reports them differently.
 */
export function nextSectionUp(scope, memberId, currentSecId) {
  const set = scope?.ok ? scope.sets.find((row) => row.memberIds.includes(memberId)) : null;
  if (!set) return { ok: false, reason: 'MEMBER_NOT_IN_RESIZE_SCOPE', memberId };

  const rung = set.ladder.findIndex((row) => row.secId === currentSecId);
  if (rung < 0) {
    // The member is carrying a section the ladder does not contain, so the
    // loop has no defined step from here.
    return { ok: false, reason: 'CURRENT_SECTION_NOT_ON_LADDER', memberId, currentSecId, ladder: set.ladder.map((row) => row.secId) };
  }
  if (rung === set.ladder.length - 1) {
    return { ok: true, exhausted: true, secId: null, memberId, currentSecId, reason: 'LADDER_EXHAUSTED' };
  }
  return { ok: true, exhausted: false, secId: set.ladder[rung + 1].secId, memberId, currentSecId, setIndex: set.setIndex };
}

/**
 * A member-assignment command for the requested section changes.
 *
 * Every assignment is re-checked against the scope here as well: a caller that
 * built its list some other way still cannot reach a member the user did not
 * declare.
 */
export function resizeCommands(scope, assignments = []) {
  if (!scope?.ok) return { ok: false, reason: scope?.reason ?? 'RESIZE_SCOPE_REQUIRED' };
  const bySection = new Map();
  for (const { memberId, secId } of assignments) {
    const set = scope.sets.find((row) => row.memberIds.includes(memberId));
    if (!set) return { ok: false, reason: 'MEMBER_NOT_IN_RESIZE_SCOPE', memberId };
    if (!set.ladder.some((row) => row.secId === secId)) {
      return { ok: false, reason: 'SECTION_NOT_ON_LADDER', memberId, secId, ladder: set.ladder.map((row) => row.secId) };
    }
    if (!bySection.has(secId)) bySection.set(secId, []);
    bySection.get(secId).push(memberId);
  }
  return {
    ok: true,
    commands: [...bySection].map(([secId, memberIds]) => ({ type: 'member-assignment', memberIds: memberIds.sort(), secId })),
    scopeHash: scope.scopeHash,
  };
}

export { MAX_LADDER, MAX_SETS };

function failure(reason, detail = {}) {
  return Object.freeze({ version: GLOBAL_RESIZE_SCOPE_VERSION, ok: false, reason, ...detail, sets: [], memberCount: 0, scopeHash: null });
}
