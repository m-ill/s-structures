export function combinationEnvelopeSummary(groups, rules, coverage, envelope) {
  return {
    t21CombinationGroups: groups.rowCount > 0,
    t22RuleGeneration: rules.generatedCount > 0,
    t23CoverageAudit: !!coverage.audit,
    t24EnvelopeAudit: envelope.members.rowCount > 0 || envelope.reactions.rowCount > 0,
    status: envelope.available ? 'available' : 'check',
  };
}
