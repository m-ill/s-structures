import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// A project readiness check, not a signature authority or engineering solver.
export function checkReadiness({ state, facts, sources, questions, decisions }, stage = 'analysis') {
  if (!['analysis', 'publication'].includes(stage)) throw new Error('INVALID_STAGE');
  if (!state || ![facts,sources,questions,decisions].every(Array.isArray)) throw new Error('INVALID_RECORDS');
  const reasons = [];
  const block = (code, id) => reasons.push({code, ...(id ? {id} : {})});
  const hash = state.inputHash;
  if (!/^[a-f0-9]{64}$/.test(hash || '')) block('CURRENT_INPUT_HASH_REQUIRED');
  if (!['confirmed','scenario'].includes(state.mode)) block('MODE_REQUIRED');
  if (state.requiredFactsReviewed !== true) block('REQUIRED_FACTS_REVIEW_REQUIRED');
  if (!Array.isArray(state.requiredFacts) || !state.requiredFacts.length) block('REQUIRED_FACTS_REQUIRED');
  for (const rows of [facts,sources,questions,decisions]) {
    const ids = new Set();
    for (const row of rows) {
      if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw new Error('INVALID_OR_DUPLICATE_RECORD_ID');
      ids.add(row.id);
    }
  }
  const validDecision = row => row?.status === 'approved' && row.inputHash === hash
    && row.actor?.type === 'human' && typeof row.actor.name === 'string' && row.actor.name.trim()
    && typeof row.evidenceRef === 'string' && row.evidenceRef.trim()
    && typeof row.scope === 'string' && row.scope.trim() && Number.isFinite(Date.parse(row.decidedAt));
  for (const id of state.requiredFacts || []) {
    const fact = facts.find(row => row.id === id);
    if (!fact || fact.value === null || fact.value === undefined || fact.value === '') { block('MISSING_FACT', id); continue; }
    if (fact.inputHash !== hash) block('STALE_FACT', id);
    if (fact.status === 'approved-assumption') {
      if (state.mode !== 'scenario' || stage === 'publication') block('ASSUMPTION_NOT_FINAL', id);
      if (!decisions.some(row => row.id === fact.decisionId && row.kind === 'assumption' && validDecision(row))) block('HUMAN_ASSUMPTION_DECISION_REQUIRED', id);
    } else if (fact.status !== 'confirmed') block('UNCONFIRMED_FACT', id);
    if (!Array.isArray(fact.sourceRefs) || !fact.sourceRefs.length || fact.sourceRefs.some(ref => !sources.some(s => s.id === ref && s.file && s.locator))) block('SOURCE_REQUIRED', id);
  }
  for (const question of questions) {
    if (!Array.isArray(question.blocks) || question.blocks.some(s => !['analysis','publication'].includes(s))) { block('INVALID_QUESTION_SCOPE',question.id); continue; }
    if (question.blocks.includes(stage) && (question.status !== 'resolved' || !question.answerRef)) block('UNRESOLVED_QUESTION',question.id);
  }
  if (!decisions.some(row => row.kind === 'design-basis' && validDecision(row))) block('HUMAN_DESIGN_BASIS_REQUIRED');
  if (stage === 'publication') {
    if (state.mode !== 'confirmed') block('SCENARIO_NOT_PUBLISHABLE');
    if (state.numericalValidation?.inputHash !== hash || state.numericalValidation?.status !== 'passed' || !state.numericalValidation?.evidenceRef) block('NUMERICAL_VALIDATION_REQUIRED');
    if (state.engineeringReview?.inputHash !== hash || state.engineeringReview?.status !== 'complete' || !state.engineeringReview?.evidenceRef) block('ENGINEERING_REVIEW_REQUIRED');
    if (!decisions.some(row => row.kind === 'publication' && validDecision(row))) block('HUMAN_PUBLICATION_REQUIRED');
  }
  return { ready: reasons.length === 0, stage, reasons, scope: 'project-record-readiness-only', humanIdentityVerified: false, designTransferAllowed: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const root = resolve(process.argv[2] || '.');
    const read = async path => JSON.parse(await readFile(join(root,'.sstructures',path),'utf8'));
    const [state,facts,sources,questions,decisions] = await Promise.all(['state.json','records/facts.json','records/sources.json','records/questions.json','records/decisions.json'].map(read));
    const result = checkReadiness({state,facts,sources,questions,decisions},process.argv[3] || 'analysis');
    console.log(JSON.stringify(result,null,2));
    if (!result.ready) process.exitCode = 2;
  } catch (error) { console.error(JSON.stringify({ready:false,code:'HARNESS_CHECK_FAILED',message:error.message})); process.exitCode=1; }
}
