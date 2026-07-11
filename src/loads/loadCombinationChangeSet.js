import {
  createLoadCombinationsFromRulePack,
  KDS_LOAD_RULE_PACK,
  LOAD_RULE_PACK_CONTRACT_VERSION,
  LOAD_RULE_PUBLICATION_STATUSES,
} from '../core/kdsLoadCombinations.js';
import { inferLoadCaseFamily } from './loadCaseMetadata.js';
import { stableHash } from '../core/stableHash.js';

export const LOAD_COMBINATION_CHANGE_SET_VERSION = 'p7-m5-load-combination-change-set-v1';
export const LOAD_COMBINATION_APPROVAL_VERSION = 'p7-m5-project-load-combination-approval-v1';

export function normalizeLoadRulePack(input = {}) {
  const status = normalizeEnum(input.status || input.verificationStatus, ['candidate', 'verified'], 'candidate');
  const rules = (input.rules || input.combinationPresets || []).map((rule) => normalizeRule(rule, status));
  return {
    contractVersion: input.contractVersion || LOAD_RULE_PACK_CONTRACT_VERSION,
    id: String(input.id || '').trim(),
    authority: nullableString(input.authority),
    code: nullableString(input.code),
    edition: nullableString(input.edition),
    editionDate: nullableString(input.editionDate),
    amendmentsReviewed: uniqueStrings(input.amendmentsReviewed, false),
    notice: nullableString(input.notice),
    noticeDate: nullableString(input.noticeDate),
    publicationStatus: normalizeEnum(input.publicationStatus, LOAD_RULE_PUBLICATION_STATUSES, input.publicationStatus || 'draft'),
    effectiveDate: nullableString(input.effectiveDate),
    verifiedAt: nullableString(input.verifiedAt),
    sourceUrls: uniqueStrings(input.sourceUrls, false),
    sourceHash: nullableString(input.sourceHash),
    status,
    verificationStatus: input.verificationStatus || status,
    evidenceStatus: input.evidenceStatus || status,
    sourceAttachmentStatus: input.sourceAttachmentStatus || (input.sourceUrls?.length ? 'source-linked' : 'unattached'),
    methods: uniqueStrings(input.methods || rules.map((rule) => rule.method)),
    purposes: uniqueStrings(input.purposes || rules.flatMap((rule) => rule.purposes)),
    automationStatus: input.automationStatus || (status === 'verified' ? 'eligible' : 'comparison-only'),
    factorEvidence: nullableString(input.factorEvidence),
    rules,
  };
}

export function validateLoadRulePack(input = {}) {
  const rulePack = normalizeLoadRulePack(input);
  const errors = [];
  const warnings = [];
  if (!rulePack.id) errors.push(issue('rule-pack-id-required', 'Rule-pack id is required.'));
  if (!LOAD_RULE_PUBLICATION_STATUSES.includes(rulePack.publicationStatus)) {
    errors.push(issue('rule-pack-publication-status-invalid', `Unsupported publication status: ${rulePack.publicationStatus}.`));
  }
  if (!rulePack.methods.length) errors.push(issue('rule-pack-methods-required', 'At least one design method is required.'));
  if (!rulePack.rules.length) errors.push(issue('rule-pack-rules-required', 'At least one combination rule is required.'));

  const seenRuleIds = new Set();
  for (const rule of rulePack.rules) {
    if (!rule.id) errors.push(issue('rule-id-required', 'Every combination rule requires an id.'));
    else if (seenRuleIds.has(rule.id)) errors.push(issue('rule-id-duplicate', `Duplicate rule id: ${rule.id}.`, { ruleId: rule.id }));
    seenRuleIds.add(rule.id);
    if (!rulePack.methods.includes(rule.method)) {
      errors.push(issue('rule-method-not-declared', `Rule ${rule.id} uses undeclared method ${rule.method}.`, { ruleId: rule.id }));
    }
    if (!rule.purposes.length) errors.push(issue('rule-purpose-required', `Rule ${rule.id} requires at least one purpose.`, { ruleId: rule.id }));
    for (const purpose of rule.purposes) {
      if (!rulePack.purposes.includes(purpose)) {
        errors.push(issue('rule-purpose-not-declared', `Rule ${rule.id} uses undeclared purpose ${purpose}.`, { ruleId: rule.id, purpose }));
      }
    }
    for (const [family, factor] of Object.entries(rule.terms)) {
      if (!family || !Number.isFinite(Number(factor))) {
        errors.push(issue('rule-factor-invalid', `Rule ${rule.id} has an invalid factor for ${family || 'unknown family'}.`, { ruleId: rule.id, family }));
      }
    }
    const seenAlternativeSymbols = new Set();
    for (const group of rule.alternativeGroups) {
      if (!group.id || !group.symbols.length) {
        errors.push(issue('rule-alternative-group-invalid', `Rule ${rule.id} has an invalid alternative group.`, { ruleId: rule.id }));
      }
      for (const family of group.symbols) {
        if (!Object.prototype.hasOwnProperty.call(rule.terms, family)) {
          errors.push(issue('rule-alternative-factor-missing', `Rule ${rule.id} has no factor for alternative ${family}.`, { ruleId: rule.id, family }));
        }
        if (seenAlternativeSymbols.has(family)) {
          errors.push(issue('rule-alternative-duplicate', `Rule ${rule.id} repeats ${family} across alternative groups.`, { ruleId: rule.id, family }));
        }
        seenAlternativeSymbols.add(family);
      }
    }
  }

  const verifiedFields = [
    ['authority', rulePack.authority],
    ['code', rulePack.code],
    ['edition', rulePack.edition],
    ['effectiveDate', rulePack.effectiveDate],
    ['verifiedAt', rulePack.verifiedAt],
    ['sourceHash', rulePack.sourceHash],
  ];
  if (rulePack.status === 'verified') {
    for (const [field, value] of verifiedFields) {
      if (!value) errors.push(issue('verified-rule-pack-metadata-missing', `Verified rule pack is missing ${field}.`, { field }));
    }
    if (!rulePack.sourceUrls.length) errors.push(issue('verified-rule-pack-metadata-missing', 'Verified rule pack requires at least one source URL.', { field: 'sourceUrls' }));
  } else {
    warnings.push(issue(
      'candidate-rule-pack-comparison-only',
      'Candidate factors may be previewed but cannot be applied by the guarded service.',
    ));
  }
  return {
    ok: errors.length === 0,
    status: errors.length ? 'invalid' : warnings.length ? 'candidate' : 'verified',
    rulePack,
    errors,
    warnings,
  };
}

export function evaluateLoadRulePackGuards(model = {}, rulePackInput = {}, options = {}) {
  const validation = validateLoadRulePack(rulePackInput);
  const rulePack = validation.rulePack;
  const selectedMethod = normalizeSelectedMethod(model, rulePack, options);
  const selectedPurpose = options.purpose ? String(options.purpose).trim().toLowerCase() : null;
  const generationBlockers = [];
  const applyBlockers = [];
  const warnings = validation.warnings.slice();

  if (!validation.ok) generationBlockers.push(...validation.errors.map((item) => item.code));
  if (!selectedMethod) generationBlockers.push('design-method-required');
  else if (!rulePack.methods.includes(selectedMethod)) generationBlockers.push('rule-pack-method-mismatch');

  const basisMethod = model.designBasis?.designMethod
    ? String(model.designBasis.designMethod).trim().toLowerCase()
    : null;
  if (basisMethod && selectedMethod && basisMethod !== selectedMethod && options.ignoreDesignBasisMethod !== true) {
    generationBlockers.push('design-basis-method-mismatch');
  }
  if (selectedPurpose && !rulePack.purposes.includes(selectedPurpose)) generationBlockers.push('rule-pack-purpose-mismatch');
  if (rulePack.publicationStatus !== 'effective') applyBlockers.push(`rule-pack-publication-${rulePack.publicationStatus}`);
  if (rulePack.status !== 'verified') applyBlockers.push('rule-pack-not-verified');
  if (rulePack.automationStatus === 'comparison-only') applyBlockers.push('rule-pack-comparison-only');

  const otherCases = (model.loadCases || []).filter((loadCase) => inferLoadCaseFamily(loadCase) === 'OTHER');
  const explicitOtherRules = rulePack.rules.some((rule) => Object.prototype.hasOwnProperty.call(rule.terms, 'OTHER'));
  if (otherCases.length && !explicitOtherRules && options.approveUnmappedOther !== true) {
    applyBlockers.push('unmapped-other-load-family');
    warnings.push(issue(
      'unmapped-other-load-family',
      'OTHER load cases are not covered by this rule pack and require explicit review.',
      { caseIds: otherCases.map((item) => item.id) },
    ));
  }

  return {
    previewAllowed: generationBlockers.length === 0,
    applyAllowed: generationBlockers.length === 0 && applyBlockers.length === 0,
    selectedMethod,
    selectedPurpose,
    generationBlockers: [...new Set(generationBlockers)],
    applyBlockers: [...new Set(applyBlockers)],
    warnings,
    validation,
  };
}

export function previewLoadCombinationChangeSet(model = {}, rulePackInput = {}, options = {}) {
  const validation = validateLoadRulePack(rulePackInput);
  const rulePack = validation.rulePack;
  const guard = evaluateLoadRulePackGuards(model, rulePack, options);
  const canGenerate = guard.previewAllowed;
  const generated = canGenerate
    ? createLoadCombinationsFromRulePack(model, rulePack, {
      ...options,
      method: guard.selectedMethod,
      purpose: guard.selectedPurpose,
    })
    : [];
  const noCompatibleCombinations = canGenerate && generated.length === 0;
  const applyBlockers = noCompatibleCombinations
    ? [...guard.applyBlockers, 'no-compatible-combinations']
    : guard.applyBlockers.slice();
  const applyAllowed = guard.applyAllowed && !noCompatibleCombinations;
  const exclusions = buildRuleExclusions(model, rulePack, generated, guard.selectedMethod, guard.selectedPurpose);
  const mode = normalizeMode(options.mode);
  const merge = mergeCombinations(model.loadCombinations || [], generated, mode, options);
  const conflicts = merge.conflicts;
  const warnings = [...guard.warnings];
  if (exclusions.length) warnings.push(issue(
    'combination-rules-excluded',
    `${exclusions.length} rule(s) produced no combination; inspect exclusion reasons.`,
  ));
  if (conflicts.length) warnings.push(issue(
    'combination-user-modified-conflicts',
    `${conflicts.length} user-modified combination(s) will be preserved.`,
  ));
  const errors = validation.errors.slice();
  const status = errors.length || !guard.previewAllowed
    ? 'blocked'
    : conflicts.length || warnings.length || !applyAllowed
      ? 'review-required'
      : 'ready';

  return {
    version: LOAD_COMBINATION_CHANGE_SET_VERSION,
    status,
    mode,
    rulePack: rulePackMetadata(rulePack),
    rulePackSnapshot: clonePlain(rulePack),
    snapshot: {
      projectId: resolveProjectId(model, options),
      designMethod: guard.selectedMethod,
      modelHash: approvalModelHash(model),
      ruleFactorSnapshotHash: ruleFactorSnapshotHash(rulePack, generated),
      generationOptions: {
        method: guard.selectedMethod,
        purpose: guard.selectedPurpose,
        includeReverseLateral: options.includeReverseLateral !== false,
        includeMissing: options.includeMissing === true,
      },
    },
    guard: {
      previewAllowed: guard.previewAllowed,
      applyAllowed,
      selectedMethod: guard.selectedMethod,
      selectedPurpose: guard.selectedPurpose,
      generationBlockers: guard.generationBlockers,
      applyBlockers,
    },
    generated: generated.map((combo) => clonePlain(combo)),
    exclusions,
    changes: merge.changes,
    conflicts,
    warnings,
    errors,
    next: {
      loadCombinations: merge.next,
    },
    summary: {
      generatedCount: generated.length,
      created: merge.changes.create.length,
      updated: merge.changes.update.length,
      unchanged: merge.changes.unchanged.length,
      preserved: merge.changes.preserve.length,
      removed: merge.changes.remove.length,
      conflictCount: conflicts.length,
      excludedRuleCount: exclusions.length,
    },
    setupStatus: generated.length ? 'combination-candidates-available' : 'load-setup-required',
  };
}

export function approveLoadCombinationChangeSet(model, changeSet = {}, review = {}, options = {}) {
  const blockers = [];
  if (changeSet?.version !== LOAD_COMBINATION_CHANGE_SET_VERSION) blockers.push('approval-preview-required');
  if (!changeSet.guard?.previewAllowed || changeSet.status === 'blocked' || changeSet.errors?.length) {
    blockers.push('approval-preview-blocked');
  }
  if (!changeSet.generated?.length) blockers.push('approval-combinations-required');

  const rulePack = normalizeLoadRulePack(changeSet.rulePackSnapshot || changeSet.rulePack || {});
  if (rulePack.publicationStatus !== 'effective') blockers.push('project-approval-publication-not-effective');
  if (rulePack.sourceAttachmentStatus !== 'source-attached') blockers.push('project-approval-source-not-attached');
  if (!rulePack.sourceUrls.length) blockers.push('project-approval-source-url-required');

  const projectId = nullableString(review.projectId);
  const currentProjectId = resolveProjectId(model, options);
  const reviewer = normalizeReviewer(review.reviewer);
  const reviewedAt = nullableString(review.reviewedAt);
  const note = nullableString(review.note);
  if (!projectId) blockers.push('project-approval-project-required');
  if (!currentProjectId || projectId !== currentProjectId) blockers.push('project-approval-project-mismatch');
  if (!reviewer) blockers.push('project-approval-reviewer-required');
  if (!reviewedAt || Number.isNaN(Date.parse(reviewedAt))) blockers.push('project-approval-reviewed-at-invalid');
  if (!note) blockers.push('project-approval-note-required');

  const method = changeSet.guard?.selectedMethod || changeSet.snapshot?.designMethod || null;
  const currentMethod = normalizeSelectedMethod(model, rulePack, { ...options, method });
  if (!method || method !== currentMethod) blockers.push('project-approval-method-mismatch');

  const modelHash = approvalModelHash(model);
  if (changeSet.snapshot?.modelHash !== modelHash) blockers.push('project-approval-model-stale');
  const suppliedSnapshotHash = ruleFactorSnapshotHash(rulePack, changeSet.generated || []);
  if (changeSet.snapshot?.ruleFactorSnapshotHash !== suppliedSnapshotHash) blockers.push('project-approval-preview-tampered');
  const currentGenerated = createLoadCombinationsFromRulePack(model, rulePack, {
    ...(changeSet.snapshot?.generationOptions || {}),
    method,
  });
  if (ruleFactorSnapshotHash(rulePack, currentGenerated) !== suppliedSnapshotHash) {
    blockers.push('project-approval-rule-snapshot-stale');
  }

  if (blockers.length) throw approvalError(changeSet, blockers);

  const approvalCore = {
    version: LOAD_COMBINATION_APPROVAL_VERSION,
    status: 'project-approved',
    scope: 'project-only',
    projectId,
    designMethod: method,
    rulePackId: rulePack.id,
    modelHash,
    ruleFactorSnapshotHash: suppliedSnapshotHash,
    reviewer,
    reviewedAt,
    note,
    globalCertification: false,
  };
  const approvalHash = stableHash(approvalCore);
  const projectApproval = deepFreeze({
    ...approvalCore,
    approvalId: `project-load-approval:${approvalHash.slice(0, 16)}`,
    approvalHash,
  });
  return {
    ...clonePlain(changeSet),
    projectApproval,
    guard: {
      ...clonePlain(changeSet.guard),
      globalApplyAllowed: changeSet.guard?.applyAllowed === true,
      projectApprovalAllowed: true,
      applyAllowed: true,
      approvalBypass: 'project-approved',
    },
  };
}

export function applyLoadCombinationChangeSet(model, changeSetOrRulePack = {}, options = {}) {
  if (!model || typeof model !== 'object') throw new Error('applyLoadCombinationChangeSet requires a model.');
  const initial = changeSetOrRulePack?.version === LOAD_COMBINATION_CHANGE_SET_VERSION
    ? clonePlain(changeSetOrRulePack)
    : previewLoadCombinationChangeSet(model, changeSetOrRulePack, options);
  const globalApplyAllowed = initial.guard?.globalApplyAllowed ?? initial.guard?.applyAllowed === true;
  const approvalReview = evaluateProjectApproval(model, initial, initial.projectApproval || options.projectApproval, options);
  const projectApprovalAllowed = !globalApplyAllowed && approvalReview.ok;
  if ((!globalApplyAllowed && !projectApprovalAllowed) || initial.status === 'blocked' || initial.errors?.length) {
    throw blockedChangeSetError(initial, approvalReview.blockers);
  }

  const currentGuard = evaluateLoadRulePackGuards(model, initial.rulePackSnapshot || initial.rulePack, {
    ...options,
    method: initial.guard.selectedMethod,
    purpose: initial.guard.selectedPurpose,
  });
  if ((globalApplyAllowed && !currentGuard.applyAllowed)
    || (projectApprovalAllowed && currentGuard.generationBlockers.length)) {
    throw blockedChangeSetError({
      ...initial,
      guard: {
        ...initial.guard,
        applyAllowed: false,
        generationBlockers: currentGuard.generationBlockers,
        applyBlockers: currentGuard.applyBlockers,
      },
    }, approvalReview.blockers);
  }

  const proposed = projectApprovalAllowed
    ? projectApprovedCombinations(initial.generated || [], approvalReview.approval)
    : initial.generated || [];
  const merge = mergeCombinations(model.loadCombinations || [], proposed, initial.mode, options);
  const changeSet = {
    ...initial,
    generated: proposed,
    projectApproval: projectApprovalAllowed ? approvalReview.approval : initial.projectApproval || null,
    guard: {
      ...initial.guard,
      globalApplyAllowed,
      projectApprovalAllowed,
      applyAllowed: true,
      approvalBypass: projectApprovalAllowed ? 'project-approved' : null,
    },
    status: merge.conflicts.length ? 'review-required' : initial.status,
    changes: merge.changes,
    conflicts: merge.conflicts,
    next: { loadCombinations: merge.next },
    summary: {
      ...initial.summary,
      created: merge.changes.create.length,
      updated: merge.changes.update.length,
      unchanged: merge.changes.unchanged.length,
      preserved: merge.changes.preserve.length,
      removed: merge.changes.remove.length,
      conflictCount: merge.conflicts.length,
    },
  };

  const previous = model.loadCombinations;
  try {
    model.loadCombinations = clonePlain(changeSet.next.loadCombinations);
    for (const combination of model.loadCombinations) {
      if (combination.approvalProvenance) deepFreeze(combination.approvalProvenance);
    }
  } catch (error) {
    try {
      model.loadCombinations = previous;
    } catch {
      // Preserve the original transaction error.
    }
    throw error;
  }
  return { ...changeSet, applied: true };
}

export function previewKdsLoadCombinationChangeSet(model = {}, options = {}) {
  return previewLoadCombinationChangeSet(model, KDS_LOAD_RULE_PACK, {
    method: options.method || model.designBasis?.designMethod || 'strength',
    ...options,
  });
}

export function applyKdsLoadCombinationChangeSet(model, options = {}) {
  const changeSet = previewKdsLoadCombinationChangeSet(model, options);
  return applyLoadCombinationChangeSet(model, changeSet, options);
}

export function selectLoadCombinationsForPurpose(modelOrCombinations = {}, purpose, options = {}) {
  const combinations = Array.isArray(modelOrCombinations)
    ? modelOrCombinations
    : modelOrCombinations.loadCombinations || [];
  const normalizedPurpose = String(purpose || '').trim().toLowerCase();
  const method = options.method ? String(options.method).trim().toLowerCase() : null;
  const selected = [];
  const excluded = [];
  for (const combination of combinations) {
    const purposes = uniqueStrings(combination.purposes || combination.purpose || []);
    const methodMatches = !method || combination.method === method;
    const purposeMatches = purposes.includes(normalizedPurpose);
    if (methodMatches && purposeMatches) selected.push(clonePlain(combination));
    else excluded.push({
      id: combination.id || null,
      reason: !methodMatches ? 'method-mismatch' : purposes.length ? 'purpose-mismatch' : 'purpose-metadata-missing',
    });
  }
  return {
    status: selected.length ? 'available' : 'no-compatible-combinations',
    purpose: normalizedPurpose || null,
    method,
    combinations: selected,
    excluded,
  };
}

function normalizeRule(rule = {}, defaultStatus) {
  const rawType = String(rule.type || '').trim().toLowerCase();
  const method = String(rule.method || rawType || '').trim().toLowerCase();
  const type = ['strength', 'service', 'envelope', 'user'].includes(rawType)
    ? rawType
    : method === 'service'
      ? 'service'
      : 'strength';
  const purposes = uniqueStrings(rule.purposes || rule.purpose || method);
  const terms = {};
  for (const [family, factor] of Object.entries(rule.terms || {})) terms[family] = Number(factor);
  return {
    ...clonePlain(rule),
    id: String(rule.id || '').trim(),
    name: String(rule.name || rule.id || '').trim(),
    type,
    method,
    purposes,
    terms,
    required: uniqueStrings(rule.required, false),
    requiredAny: uniqueStrings(rule.requiredAny, false),
    alternativeGroups: normalizeAlternativeGroups(rule.alternativeGroups),
    optional: uniqueStrings(rule.optional, false),
    directional: rule.directional || null,
    status: normalizeEnum(rule.status, ['candidate', 'verified'], defaultStatus),
  };
}

function normalizeSelectedMethod(model, rulePack, options) {
  const selected = options.method || model.designBasis?.designMethod || (rulePack.methods.length === 1 ? rulePack.methods[0] : null);
  return selected ? String(selected).trim().toLowerCase() : null;
}

function buildRuleExclusions(model, rulePack, generated, method, purpose) {
  const generatedRuleIds = new Set(generated.map((combo) => combo.sourcePreset));
  const available = new Set((model.loadCases || []).map((loadCase) => inferLoadCaseFamily(loadCase)));
  const exclusions = [];
  for (const rule of rulePack.rules) {
    if (method && rule.method !== method) {
      exclusions.push({ ruleId: rule.id, reason: 'method-filtered', required: rule.required, missing: [] });
      continue;
    }
    if (purpose && !rule.purposes.includes(purpose)) {
      exclusions.push({ ruleId: rule.id, reason: 'purpose-filtered', required: rule.required, missing: [] });
      continue;
    }
    if (generatedRuleIds.has(rule.id)) continue;
    const missing = rule.required.filter((family) => !available.has(family));
    const alternativeGroups = rule.alternativeGroups.length
      ? rule.alternativeGroups
      : rule.requiredAny.length
        ? [{ id: 'required-any', symbols: rule.requiredAny, required: true }]
        : [];
    const missingAny = alternativeGroups
      .filter((group) => group.required && !group.symbols.some((family) => available.has(family)))
      .flatMap((group) => group.symbols);
    exclusions.push({
      ruleId: rule.id,
      reason: missing.length || missingAny.length ? 'missing-required-load-case' : 'no-compatible-expansion',
      required: rule.required.slice(),
      requiredAny: rule.requiredAny.slice(),
      alternativeGroups: clonePlain(alternativeGroups),
      missing: [...missing, ...missingAny],
    });
  }
  return exclusions;
}

function mergeCombinations(currentInput, proposedInput, mode, options) {
  const current = clonePlain(Array.isArray(currentInput) ? currentInput : []);
  const proposed = clonePlain(Array.isArray(proposedInput) ? proposedInput : []);
  const changes = { create: [], update: [], unchanged: [], preserve: [], remove: [] };
  const conflicts = [];
  const next = current.slice();
  const proposedKeys = new Set();

  if (mode === 'append-custom') {
    const usedIds = new Set(next.map((item) => item.id));
    for (const combo of proposed) {
      const custom = {
        ...combo,
        id: uniqueId(combo.id, usedIds),
        origin: 'manual',
        generatedKey: null,
        userModified: true,
      };
      usedIds.add(custom.id);
      next.push(custom);
      changes.create.push(summary(custom));
    }
    return { next, changes, conflicts };
  }

  for (const candidate of proposed) {
    const key = candidate.generatedKey || candidate.id;
    proposedKeys.add(key);
    const index = next.findIndex((item) => sameRecord(item, candidate));
    if (index < 0) {
      next.push(candidate);
      changes.create.push(summary(candidate));
      continue;
    }
    const existing = next[index];
    if (sameCombination(existing, candidate)) {
      changes.unchanged.push(summary(existing));
      continue;
    }
    if (existing.userModified === true || !existing.generatedKey || existing.origin === 'manual') {
      conflicts.push({
        code: 'combination-user-modified-conflict',
        id: existing.id || candidate.id,
        generatedKey: existing.generatedKey || candidate.generatedKey || null,
        existing: clonePlain(existing),
        proposed: clonePlain(candidate),
      });
      changes.preserve.push(summary(existing));
      continue;
    }
    next[index] = { ...candidate, id: existing.id || candidate.id };
    changes.update.push({ before: summary(existing), after: summary(candidate) });
  }

  const filtered = mode === 'replace-generated'
    ? next.filter((combo) => {
      const owned = combo.origin === 'rule-pack' || !!combo.generatedKey;
      const key = combo.generatedKey || combo.id;
      const sourceAllowed = !options.replaceSourceIds?.length || options.replaceSourceIds.includes(combo.sourceId);
      const remove = owned && sourceAllowed && !proposedKeys.has(key) && combo.userModified !== true;
      if (remove) changes.remove.push(summary(combo));
      return !remove;
    })
    : next;
  return { next: deduplicateById(filtered), changes, conflicts };
}

function sameRecord(a, b) {
  if (a?.generatedKey && b?.generatedKey && a.generatedKey === b.generatedKey) return true;
  return a?.id === b?.id;
}

function sameCombination(a, b) {
  return stableJson(comparable(a)) === stableJson(comparable(b));
}

function comparable(value = {}) {
  const copy = clonePlain(value);
  delete copy.userModified;
  delete copy.generatedAt;
  return copy;
}

function rulePackMetadata(rulePack) {
  const { rules, ...metadata } = rulePack;
  return clonePlain(metadata);
}

function summary(value = {}) {
  return {
    id: value.id || null,
    name: value.name || value.id || null,
    generatedKey: value.generatedKey || null,
    sourceId: value.sourceId || null,
    method: value.method || null,
    purposes: uniqueStrings(value.purposes || value.purpose || []),
    userModified: value.userModified === true,
  };
}

function deduplicateById(items) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function uniqueId(base, used) {
  let id = base || 'COMB';
  let index = 2;
  while (used.has(id)) id = `${base}-${index++}`;
  return id;
}

function normalizeMode(value) {
  if (value === 'replace-generated' || value === 'append-custom') return value;
  return 'merge';
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeAlternativeGroups(value) {
  const groups = Array.isArray(value) ? value : [];
  return groups.map((group, index) => ({
    id: String(group?.id || `alternative-${index + 1}`).trim(),
    symbols: uniqueStrings(group?.symbols || group?.families, false),
    required: group?.required !== false,
  }));
}

function evaluateProjectApproval(model, changeSet, approvalInput, options = {}) {
  const blockers = [];
  if (!approvalInput || typeof approvalInput !== 'object') {
    return { ok: false, approval: null, blockers: ['project-approval-required'] };
  }
  const approval = clonePlain(approvalInput);
  const rulePack = normalizeLoadRulePack(changeSet.rulePackSnapshot || changeSet.rulePack || {});
  const projectId = resolveProjectId(model, options);
  const method = changeSet.guard?.selectedMethod || changeSet.snapshot?.designMethod || null;

  if (approval.version !== LOAD_COMBINATION_APPROVAL_VERSION) blockers.push('project-approval-version-invalid');
  if (approval.status !== 'project-approved' || approval.scope !== 'project-only') blockers.push('project-approval-status-invalid');
  if (!projectId || approval.projectId !== projectId) blockers.push('project-approval-project-mismatch');
  if (!method || approval.designMethod !== method) blockers.push('project-approval-method-mismatch');
  if (approval.rulePackId !== rulePack.id) blockers.push('project-approval-rule-pack-mismatch');
  if (rulePack.publicationStatus !== 'effective') blockers.push('project-approval-publication-not-effective');
  if (rulePack.sourceAttachmentStatus !== 'source-attached') blockers.push('project-approval-source-not-attached');
  if (!rulePack.sourceUrls.length) blockers.push('project-approval-source-url-required');
  if (!normalizeReviewer(approval.reviewer)) blockers.push('project-approval-reviewer-required');
  if (!approval.reviewedAt || Number.isNaN(Date.parse(approval.reviewedAt))) blockers.push('project-approval-reviewed-at-invalid');
  if (!nullableString(approval.note)) blockers.push('project-approval-note-required');

  const modelHash = approvalModelHash(model);
  if (approval.modelHash !== modelHash || changeSet.snapshot?.modelHash !== modelHash) {
    blockers.push('project-approval-model-stale');
  }
  const suppliedSnapshotHash = ruleFactorSnapshotHash(rulePack, changeSet.generated || []);
  if (approval.ruleFactorSnapshotHash !== suppliedSnapshotHash
    || changeSet.snapshot?.ruleFactorSnapshotHash !== suppliedSnapshotHash) {
    blockers.push('project-approval-rule-snapshot-stale');
  }
  const currentGenerated = createLoadCombinationsFromRulePack(model, rulePack, {
    ...(changeSet.snapshot?.generationOptions || {}),
    method,
  });
  if (ruleFactorSnapshotHash(rulePack, currentGenerated) !== suppliedSnapshotHash) {
    blockers.push('project-approval-rule-snapshot-stale');
  }

  const expectedHash = stableHash(approvalHashInput(approval));
  if (approval.approvalHash !== expectedHash
    || approval.approvalId !== `project-load-approval:${expectedHash.slice(0, 16)}`) {
    blockers.push('project-approval-hash-invalid');
  }
  return {
    ok: blockers.length === 0,
    approval: blockers.length ? approval : deepFreeze(approval),
    blockers: [...new Set(blockers)],
  };
}

function approvalHashInput(approval = {}) {
  return {
    version: approval.version,
    status: approval.status,
    scope: approval.scope,
    projectId: approval.projectId,
    designMethod: approval.designMethod,
    rulePackId: approval.rulePackId,
    modelHash: approval.modelHash,
    ruleFactorSnapshotHash: approval.ruleFactorSnapshotHash,
    reviewer: approval.reviewer,
    reviewedAt: approval.reviewedAt,
    note: approval.note,
    globalCertification: approval.globalCertification,
  };
}

function ruleFactorSnapshotHash(rulePackInput, generatedInput) {
  const rulePack = normalizeLoadRulePack(rulePackInput);
  const combinations = (generatedInput || []).map((combination) => ({
    id: combination.id || null,
    sourceId: combination.sourceId || rulePack.id,
    sourcePreset: combination.sourcePreset || null,
    type: combination.type || null,
    method: combination.method || null,
    purposes: uniqueStrings(combination.purposes || combination.purpose || []).sort(),
    factors: Object.fromEntries(Object.entries(combination.factors || {})
      .filter(([, factor]) => Math.abs(Number(factor) || 0) > 0)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([caseId, factor]) => [caseId, Number(factor)])),
  })).sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return stableHash({ rulePack, combinations });
}

function approvalModelHash(model) {
  const snapshot = clonePlain(model || {});
  delete snapshot.loadCombinations;
  return stableHash(snapshot);
}

function resolveProjectId(model, options = {}) {
  return nullableString(options.projectId || model?.projectId || model?.meta?.projectId);
}

function normalizeReviewer(value) {
  if (typeof value === 'string') {
    const id = value.trim();
    return id ? { id } : null;
  }
  if (!value || typeof value !== 'object') return null;
  const reviewer = clonePlain(value);
  const identity = [reviewer.id, reviewer.name, reviewer.email, reviewer.licenseNumber]
    .map(nullableString)
    .filter(Boolean);
  return identity.length ? reviewer : null;
}

function projectApprovedCombinations(combinations, approval) {
  return combinations.map((combination) => ({
    ...clonePlain(combination),
    origin: 'manual-reviewed',
    approvalStatus: 'project-approved',
    userModified: true,
    approvalProvenance: clonePlain(approval),
  }));
}

function approvalError(changeSet, blockers) {
  const error = new Error('Load-combination project approval could not be created.');
  error.code = 'LOAD_COMBINATION_APPROVAL_BLOCKED';
  error.changeSet = clonePlain(changeSet);
  error.approvalBlockers = [...new Set(blockers)];
  return error;
}

function blockedChangeSetError(changeSet, approvalBlockers = []) {
  const error = new Error('Load-combination change set is blocked by rule-pack guards.');
  error.code = 'LOAD_COMBINATION_CHANGE_SET_BLOCKED';
  error.changeSet = {
    ...clonePlain(changeSet),
    guard: {
      ...clonePlain(changeSet.guard || {}),
      applyAllowed: false,
      approvalBlockers: [...new Set(approvalBlockers)],
    },
  };
  return error;
}

function nullableString(value) {
  if (value == null || value === '') return null;
  return String(value).trim() || null;
}

function uniqueStrings(value, lower = true) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(list.map((item) => {
    const text = String(item).trim();
    return lower ? text.toLowerCase() : text;
  }).filter(Boolean))];
}

function issue(code, message, detail = null) {
  return { code, message, detail };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function clonePlain(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}
