import {
  createPhase15MandatoryGate,
  evaluatePhase15Metric,
} from './qualificationGates.js';
import { immutable, strictCanonicalHash } from './strictCanonical.js';

export const PHASE15_EXISTING_PASS_QUALIFICATION_VERSION = 'p15-m7-existing-pass-qualification-v1';

export const PHASE15_EXISTING_PASS_CASES = Object.freeze([
  'SB1',
  'SB8',
  'SB9',
  'SB10',
  'PD1',
  'SM5',
]);

export function blockPhase15ExistingPassQualification(caseIdInput, reasonCodesInput, partialEvidence = {}) {
  const caseId = requiredText(caseIdInput, 'caseId').toUpperCase();
  if (!PHASE15_EXISTING_PASS_CASES.includes(caseId)) throw new RangeError(`Unsupported Phase 15 M7 case ${caseId}.`);
  const reasonCodes = Array.from(new Set(Array.from(reasonCodesInput || [], (value, index) => requiredText(value, `reasonCodes[${index}]`)))).sort();
  if (!reasonCodes.length) throw new TypeError('At least one qualification blocker is required.');
  const mandatoryGates = reasonCodes.map((reasonCode, index) => createPhase15MandatoryGate({
    id: `P15-M7-${caseId}-BLOCKER-${index + 1}`,
    status: 'BLOCKED',
    reasonCode,
    details: 'Required production or independent-reference evidence is unavailable; preliminary metrics cannot promote this case.',
  }));
  const core = {
    version: PHASE15_EXISTING_PASS_QUALIFICATION_VERSION,
    milestone: 'P15-M7',
    caseId,
    status: 'BLOCKED',
    metricPassed: false,
    mandatoryGatePassed: false,
    metrics: [],
    mandatoryGates,
    reasonCodes,
    audit: partialEvidence,
    limitations: ['Preliminary numerical agreement is retained separately and is not a Phase 15 qualification PASS.'],
  };
  return immutable({ ...core, qualificationHash: strictCanonicalHash(core, `${caseId} blocked existing PASS qualification`) });
}

const SB1_QUANTITIES = Object.freeze([
  metricDefinition('tip-displacement', 'tipDisplacement', 'tip displacement', 'length', 'global-z', 'positive-global-z'),
  metricDefinition('tip-rotation', 'tipRotation', 'tip rotation', 'rad', 'global-y', 'positive-right-hand-rule-global-y'),
  metricDefinition('support-reaction', 'supportReaction', 'support reaction', 'force', 'global-z', 'positive-global-z'),
  metricDefinition('support-moment', 'supportMoment', 'support moment', 'moment', 'global-y', 'positive-right-hand-rule-global-y'),
]);

const SB9_QUANTITIES = Object.freeze([
  metricDefinition('bending-component', 'bending', 'midspan bending deflection component', 'length', 'global-z', 'positive-global-z'),
  metricDefinition('axial-component', 'axial', 'midspan axial-shortening deflection component', 'length', 'global-z', 'positive-global-z'),
  metricDefinition('combined-response', 'combined', 'midspan combined deflection', 'length', 'global-z', 'positive-global-z'),
]);

const PD1_QUANTITIES = Object.freeze([
  metricDefinition('displacement-without-tension', 'displacementWithoutTension', 'midspan displacement without axial tension', 'length', 'global-z', 'positive-global-z'),
  metricDefinition('moment-without-tension', 'momentWithoutTension', 'maximum bending moment without axial tension', 'moment', 'member-local-y', 'positive-right-hand-rule-member-local-y'),
  metricDefinition('displacement-with-tension', 'displacementWithTension', 'midspan displacement with axial tension', 'length', 'global-z', 'positive-global-z'),
  metricDefinition('moment-with-tension', 'momentWithTension', 'maximum bending moment with axial tension', 'moment', 'member-local-y', 'positive-right-hand-rule-member-local-y'),
]);

const SB10_RESPONSE_IDS = Object.freeze([
  'brace-e1-axial',
  'brace-e2-axial',
  'apex-displacement-x',
  'apex-displacement-z',
  'support-n1-reaction-x',
  'support-n1-reaction-z',
  'support-n2-reaction-x',
  'support-n2-reaction-z',
]);

export function qualifyPhase15Sb1(input = {}) {
  const levels = normalizeLevels(input.levels, 'SB1 levels');
  const lineagePassed = exactLineage(levels, [1, 2, 4, 8]);
  const final = levels.at(-1) || {};
  const relativeTolerance = nonnegative(input.relativeTolerance, 1e-4, 'relativeTolerance');
  const convergenceTolerance = nonnegative(input.convergenceTolerance, 1e-8, 'convergenceTolerance');
  const equilibriumTolerance = nonnegative(input.equilibriumTolerance, 1e-8, 'equilibriumTolerance');
  const energyTolerance = nonnegative(input.energyTolerance, 1e-8, 'energyTolerance');
  const metrics = signedMetrics('SB1', SB1_QUANTITIES, final, input.references, input.binding, relativeTolerance, input.units);
  const convergence = maximumFinalChange(levels, SB1_QUANTITIES.map((row) => row.field));
  const equilibriumRows = levels.map((row) => optionalFinite(row.equilibriumResidual));
  const energyRows = levels.map(linearEnergyResidual);
  const equilibriumResidual = maxFinite(equilibriumRows);
  const energyResidual = maxFinite(energyRows);
  const responseComplete = levels.every((row) => SB1_QUANTITIES.every((definition) => optionalFinite(row[definition.field]) != null));
  const gates = [
    gate('P15-PASS-01-LINEAGE', lineagePassed, 'SB1_LINEAGE_INVALID', `observed=${levels.map((row) => row.elements).join(',')}`),
    gate('P15-PASS-01-CONVERGENCE', responseComplete && convergence != null && convergence <= convergenceTolerance, 'SB1_CONVERGENCE_EXCEEDED', detail(convergence, convergenceTolerance)),
    gate('P15-PASS-01-EQUILIBRIUM', equilibriumRows.every((value) => value != null) && equilibriumResidual <= equilibriumTolerance, 'SB1_EQUILIBRIUM_EXCEEDED', detail(equilibriumResidual, equilibriumTolerance)),
    gate('P15-PASS-01-ENERGY', energyRows.every((value) => value != null) && energyResidual <= energyTolerance, 'SB1_ENERGY_BALANCE_EXCEEDED', detail(energyResidual, energyTolerance)),
  ];
  return qualification('SB1', metrics, gates, {
    lineage: levels.map((row) => row.elements),
    finalChange: convergence,
    maximumEquilibriumResidual: equilibriumResidual,
    maximumEnergyResidual: energyResidual,
  });
}

export function qualifyPhase15Sb8(input = {}) {
  const levels = normalizeModalLevels(input.levels, 'SB8 levels');
  const lineagePassed = exactLineage(levels, [32, 64, 128, 256]);
  const final = levels.at(-1) || { modes: [] };
  const references = requireFiniteArray(input.references, 6, 'SB8 references');
  const relativeTolerance = nonnegative(input.relativeTolerance, 1e-3, 'relativeTolerance');
  const convergenceTolerance = nonnegative(input.convergenceTolerance, 1e-3, 'convergenceTolerance');
  const residualTolerance = nonnegative(input.residualTolerance, 1e-8, 'residualTolerance');
  const massTolerance = nonnegative(input.massTolerance, 1e-8, 'massTolerance');
  const orthogonalityTolerance = nonnegative(input.orthogonalityTolerance, 1e-8, 'orthogonalityTolerance');
  const minimumMac = finite(input.minimumMac, 0.99, 'minimumMac');
  const metrics = references.map((reference, index) => signedMetric('SB8', {
    id: `frequency-${index + 1}`,
    quantity: `natural frequency ${index + 1}`,
    unit: input.frequencyUnit || 'Hz',
    axis: 'modal-order',
    signConvention: 'positive-frequency-ascending-mode-order',
    actual: final.modes[index]?.frequencyHz,
    reference,
    relativeTolerance,
  }, input.binding));
  const frequencyChange = maximumModalFinalChange(levels, 6, 'frequencyHz');
  const audits = levels.map((level) => auditModalLevel(level, {
    modeCount: 6,
    residualTolerance,
    massTolerance,
    orthogonalityTolerance,
    minimumMac,
  }));
  const scope = input.scope || {};
  const scopePassed = scope.formulation === 'timoshenko-2node'
    && scope.shearDeformation === true
    && scope.mass === 'lumped-translational'
    && scope.rotaryInertia === false;
  const gates = [
    gate('P15-PASS-02-LINEAGE', lineagePassed, 'SB8_LINEAGE_INVALID', `observed=${levels.map((row) => row.elements).join(',')}`),
    gate('P15-PASS-02-CONVERGENCE', frequencyChange != null && frequencyChange <= convergenceTolerance, 'SB8_FREQUENCY_CONVERGENCE_EXCEEDED', detail(frequencyChange, convergenceTolerance)),
    gate('P15-PASS-02-RESIDUAL', audits.every((row) => row.residualPassed), 'SB8_EIGEN_RESIDUAL_EXCEEDED', modalAuditDetails(audits, 'maximumResidual')),
    gate('P15-PASS-02-MAC', audits.every((row) => row.macPassed), 'SB8_MODE_MAC_BELOW_LIMIT', modalAuditDetails(audits, 'minimumMac')),
    gate('P15-PASS-02-MASS', audits.every((row) => row.massPassed), 'SB8_MODAL_MASS_AUDIT_FAILED', modalAuditDetails(audits, 'maximumMassResidual')),
    gate('P15-PASS-02-SCOPE', scopePassed, 'SB8_TIMOSHENKO_SCOPE_INVALID', JSON.stringify(scope)),
  ];
  return qualification('SB8', metrics, gates, {
    lineage: levels.map((row) => row.elements),
    finalFrequencyChange: frequencyChange,
    modalAudits: audits,
    scope,
  });
}

export function qualifyPhase15Sb9(input = {}) {
  const levels = normalizeLevels(input.levels, 'SB9 levels');
  const lineagePassed = progressiveLineage(levels, 3);
  const final = levels.at(-1) || {};
  const relativeTolerance = nonnegative(input.relativeTolerance, 1e-3, 'relativeTolerance');
  const convergenceTolerance = nonnegative(input.convergenceTolerance, 1e-3, 'convergenceTolerance');
  const identityTolerance = nonnegative(input.identityTolerance, 1e-8, 'identityTolerance');
  const metrics = signedMetrics('SB9', SB9_QUANTITIES, final, input.references, input.binding, relativeTolerance, input.units);
  const convergence = maximumFinalChange(levels, SB9_QUANTITIES.map((row) => row.field));
  const identityRows = levels.map(componentIdentityResidual);
  const identityResidual = maxFinite(identityRows);
  const responseComplete = levels.every((row) => SB9_QUANTITIES.every((definition) => optionalFinite(row[definition.field]) != null));
  const componentEvidencePassed = componentRunEvidenceSetPassed(levels);
  const gates = [
    gate('P15-PASS-03-LINEAGE', lineagePassed, 'SB9_LINEAGE_INVALID', `observed=${levels.map((row) => row.elements).join(',')}`),
    gate('P15-PASS-03-CONVERGENCE', responseComplete && convergence != null && convergence <= convergenceTolerance, 'SB9_COMPONENT_CONVERGENCE_EXCEEDED', detail(convergence, convergenceTolerance)),
    gate('P15-PASS-03-COMPONENT-RUNS', componentEvidencePassed, 'SB9_COMPONENT_RUN_EVIDENCE_MISSING', 'bending, axial, and combined runs are mandatory at every level'),
    gate('P15-PASS-03-IDENTITY', identityRows.every((value) => value != null) && identityResidual <= identityTolerance, 'SB9_COMPONENT_IDENTITY_FAILED', detail(identityResidual, identityTolerance)),
  ];
  return qualification('SB9', metrics, gates, {
    lineage: levels.map((row) => row.elements),
    finalChange: convergence,
    maximumComponentIdentityResidual: identityResidual,
  });
}

export function qualifyPhase15Sb10(input = {}) {
  const rows = Array.from(input.responses || [], normalizeSignedResponse);
  const observedIds = rows.map((row) => row.id);
  const contractPassed = exactStringSet(observedIds, SB10_RESPONSE_IDS);
  const relativeTolerance = nonnegative(input.relativeTolerance, 1e-3, 'relativeTolerance');
  const equilibriumTolerance = nonnegative(input.equilibriumTolerance, 1e-8, 'equilibriumTolerance');
  const metrics = rows.map((row) => signedMetric('SB10', { ...row, relativeTolerance }, input.binding));
  const negativeRows = rows.filter((row) => row.reference < 0);
  const mutations = negativeRows.map((row) => signedMetric('SB10-MAGNITUDE-MUTATION', {
    ...row,
    id: `${row.id}-absolute-value-mutation`,
    actual: Math.abs(row.actual),
    relativeTolerance,
  }, input.binding));
  const mutationKilled = mutations.length > 0 && mutations.every((row) => row.status === 'FAIL');
  const equilibriumResidual = optionalFinite(input.equilibriumResidual);
  const gates = [
    gate('P15-PASS-04-RESPONSE-CONTRACT', contractPassed, 'SB10_SIGNED_RESPONSE_SET_INVALID', `observed=${observedIds.sort().join(',')}`),
    gate('P15-PASS-04-MAGNITUDE-MUTATION', mutationKilled, 'SB10_MAGNITUDE_MUTATION_SURVIVED', `negative-response-count=${negativeRows.length}`),
    gate('P15-PASS-04-EQUILIBRIUM', equilibriumResidual != null && equilibriumResidual <= equilibriumTolerance, 'SB10_EQUILIBRIUM_EXCEEDED', detail(equilibriumResidual, equilibriumTolerance)),
  ];
  return qualification('SB10', metrics, gates, {
    responseIds: observedIds.sort(),
    magnitudeMutationMetrics: mutations,
    equilibriumResidual,
  });
}

export function qualifyPhase15Pd1(input = {}) {
  const runs = Array.from(input.runs || [], normalizePd1Run);
  if (!runs.length) throw new TypeError('PD1 runs are required.');
  const meshValues = uniqueSorted(runs.map((row) => row.elements));
  const stepValues = uniqueSorted(runs.map((row) => row.loadSteps));
  const runKeys = runs.map((row) => `${row.elements}:${row.loadSteps}`);
  const runContractPassed = new Set(runKeys).size === runKeys.length;
  const final = runs.reduce((best, row) => (
    !best || row.elements > best.elements || (row.elements === best.elements && row.loadSteps > best.loadSteps) ? row : best
  ), null);
  const relativeTolerance = nonnegative(input.relativeTolerance, 1e-3, 'relativeTolerance');
  const convergenceTolerance = nonnegative(input.convergenceTolerance, 1e-3, 'convergenceTolerance');
  const stageResidualTolerance = nonnegative(input.stageResidualTolerance, 1e-8, 'stageResidualTolerance');
  const workTolerance = nonnegative(input.workTolerance, 1e-6, 'workTolerance');
  const metrics = signedMetrics('PD1', PD1_QUANTITIES, final.responses, input.references, input.binding, relativeTolerance, input.units);
  const meshChange = pd1AxisChange(runs, 'elements', final.loadSteps, PD1_QUANTITIES.map((row) => row.field));
  const loadStepChange = pd1AxisChange(runs, 'loadSteps', final.elements, PD1_QUANTITIES.map((row) => row.field));
  const stages = runs.flatMap((row) => row.stages);
  const maximumStageResidual = maxFinite(stages.flatMap((row) => [row.forceResidual, row.momentResidual]));
  const maximumWorkResidual = maxFinite(stages.map((row) => row.workBalanceResidual));
  const convergencePassed = runs.every((row) => row.converged && row.stages.length > 0 && row.stages.every((stage) => stage.converged));
  const trendPassed = Math.abs(final.responses.displacementWithTension) < Math.abs(final.responses.displacementWithoutTension)
    && Math.abs(final.responses.momentWithTension) < Math.abs(final.responses.momentWithoutTension);
  const gates = [
    gate('P15-PASS-05-RUN-CONTRACT', runContractPassed, 'PD1_DUPLICATE_MESH_LOAD_STEP_RUN', `run-count=${runs.length};unique-count=${new Set(runKeys).size}`),
    gate('P15-PASS-05-MESH-LINEAGE', progressiveNumbers(meshValues, 3), 'PD1_MESH_LINEAGE_INVALID', `observed=${meshValues.join(',')}`),
    gate('P15-PASS-05-LOAD-STEP-LINEAGE', progressiveNumbers(stepValues, 3), 'PD1_LOAD_STEP_LINEAGE_INVALID', `observed=${stepValues.join(',')}`),
    gate('P15-PASS-05-MESH-CONVERGENCE', meshChange != null && meshChange <= convergenceTolerance, 'PD1_MESH_CONVERGENCE_EXCEEDED', detail(meshChange, convergenceTolerance)),
    gate('P15-PASS-05-LOAD-STEP-CONVERGENCE', loadStepChange != null && loadStepChange <= convergenceTolerance, 'PD1_LOAD_STEP_CONVERGENCE_EXCEEDED', detail(loadStepChange, convergenceTolerance)),
    gate('P15-PASS-05-STAGE-CONVERGENCE', convergencePassed, 'PD1_STAGE_NOT_CONVERGED', `run-count=${runs.length};stage-count=${stages.length}`),
    gate('P15-PASS-05-STAGE-RESIDUAL', maximumStageResidual != null && maximumStageResidual <= stageResidualTolerance, 'PD1_STAGE_RESIDUAL_EXCEEDED', detail(maximumStageResidual, stageResidualTolerance)),
    gate('P15-PASS-05-WORK', maximumWorkResidual != null && maximumWorkResidual <= workTolerance, 'PD1_WORK_BALANCE_EXCEEDED', detail(maximumWorkResidual, workTolerance)),
    gate('P15-PASS-05-TENSION-TREND', trendPassed, 'PD1_TENSION_TREND_FAILED', 'tension must reduce both transverse displacement and moment magnitude'),
  ];
  return qualification('PD1', metrics, gates, {
    meshLineage: meshValues,
    loadStepLineage: stepValues,
    meshFinalChange: meshChange,
    loadStepFinalChange: loadStepChange,
    maximumStageResidual,
    maximumWorkResidual,
  });
}

export function qualifyPhase15Sm5(input = {}) {
  const modes = normalizeModes(input.modes, 'SM5 modes');
  if (modes.length !== 3) throw new RangeError('SM5 requires exactly three modes.');
  const references = requireFiniteArray(input.references, 3, 'SM5 references');
  const referenceModes = normalizeVectorArray(input.referenceModes, 3, 'SM5 referenceModes');
  const massMatrix = normalizeSquareMatrix(input.massMatrix, 'SM5 massMatrix');
  const stiffnessMatrix = normalizeSquareMatrix(input.stiffnessMatrix, 'SM5 stiffnessMatrix');
  assertCompatibleModalDimensions(modes, massMatrix, stiffnessMatrix, referenceModes);
  const relativeTolerance = nonnegative(input.relativeTolerance, 5e-3, 'relativeTolerance');
  const residualTolerance = nonnegative(input.residualTolerance, 1e-8, 'residualTolerance');
  const massTolerance = nonnegative(input.massTolerance, 1e-8, 'massTolerance');
  const orthogonalityTolerance = nonnegative(input.orthogonalityTolerance, 1e-8, 'orthogonalityTolerance');
  const participationTolerance = nonnegative(input.participationTolerance, 1e-8, 'participationTolerance');
  const minimumMac = finite(input.minimumMac, 0.99, 'minimumMac');
  const metrics = references.map((reference, index) => signedMetric('SM5', {
    id: `eigenvalue-${index + 1}`,
    quantity: `eigenvalue omega squared mode ${index + 1}`,
    unit: input.eigenvalueUnit || '1/s2',
    axis: 'modal-order',
    signConvention: 'positive-eigenvalue-ascending-mode-order',
    actual: modeEigenvalue(modes[index]),
    reference,
    relativeTolerance,
  }, input.binding));
  const residuals = modes.map((mode) => generalizedEigenResidual(stiffnessMatrix, massMatrix, mode.vector, modeEigenvalue(mode)));
  const mac = modes.map((mode, index) => massWeightedMac(mode.vector, referenceModes[index], massMatrix));
  const modalMass = modes.map((mode) => quadratic(mode.vector, massMatrix));
  const orthogonality = maximumMassOrthogonality(modes.map((mode) => mode.vector), massMatrix);
  const participation = auditParticipation(modes, input.participationDirection || 'x', participationTolerance);
  const expectedMassUnit = String(input.expectedMassUnit || 't');
  const massUnit = String(input.massUnit || '');
  const gates = [
    gate('P15-PASS-06-INDEPENDENT', input.independentReference === true, 'SM5_INDEPENDENT_REFERENCE_MISSING', 'independent generalized-eigen reference is mandatory'),
    gate('P15-PASS-06-RESIDUAL', Math.max(...residuals) <= residualTolerance, 'SM5_EIGEN_RESIDUAL_EXCEEDED', detail(Math.max(...residuals), residualTolerance)),
    gate('P15-PASS-06-MAC', Math.min(...mac) >= minimumMac, 'SM5_MODE_MAC_BELOW_LIMIT', `minimum=${Math.min(...mac)};limit=${minimumMac}`),
    gate('P15-PASS-06-MASS-NORMALIZATION', Math.max(...modalMass.map((value) => Math.abs(value - 1))) <= massTolerance, 'SM5_MODAL_MASS_NORMALIZATION_FAILED', detail(Math.max(...modalMass.map((value) => Math.abs(value - 1))), massTolerance)),
    gate('P15-PASS-06-MASS-ORTHOGONALITY', orthogonality <= orthogonalityTolerance, 'SM5_MASS_ORTHOGONALITY_FAILED', detail(orthogonality, orthogonalityTolerance)),
    gate('P15-PASS-06-PARTICIPATION', participation.passed, 'SM5_PARTICIPATION_AUDIT_FAILED', `maximum-residual=${participation.maximumResidual}`),
    gate('P15-PASS-06-MASS-UNIT', massUnit === expectedMassUnit, 'SM5_MASS_UNIT_INVALID', `actual=${massUnit};expected=${expectedMassUnit}`),
  ];
  return qualification('SM5', metrics, gates, {
    eigenResiduals: residuals,
    massWeightedMac: mac,
    generalizedMass: modalMass,
    maximumMassOrthogonality: orthogonality,
    participation,
    massUnit,
    expectedMassUnit,
  });
}

export function massWeightedMac(leftInput, rightInput, massInput) {
  const left = normalizeVector(leftInput, 'left mode');
  const right = normalizeVector(rightInput, 'right mode');
  if (left.length !== right.length) throw new RangeError('Mode vectors must have equal length.');
  const mass = normalizeMassOperator(massInput, left.length, 'mass');
  const ll = weightedDot(left, left, mass);
  const rr = weightedDot(right, right, mass);
  if (!(ll > 0) || !(rr > 0)) return 0;
  const lr = weightedDot(left, right, mass);
  return clamp((lr * lr) / (ll * rr), 0, 1);
}

export function generalizedEigenResidual(stiffnessInput, massInput, vectorInput, eigenvalueInput) {
  const vector = normalizeVector(vectorInput, 'mode vector');
  const stiffness = normalizeSquareMatrix(stiffnessInput, 'stiffness');
  const mass = normalizeSquareMatrix(massInput, 'mass');
  if (stiffness.length !== vector.length || mass.length !== vector.length) throw new RangeError('Matrix and mode dimensions must match.');
  const eigenvalue = finite(eigenvalueInput, null, 'eigenvalue');
  const kv = matrixVector(stiffness, vector);
  const mv = matrixVector(mass, vector);
  const residual = kv.map((value, index) => value - eigenvalue * mv[index]);
  return norm2(residual) / Math.max(norm2(kv), Math.abs(eigenvalue) * norm2(mv), Number.EPSILON);
}

export function maximumMassOrthogonality(vectorsInput, massInput) {
  const vectors = normalizeVectorArray(vectorsInput, null, 'mode vectors');
  if (vectors.length < 2) return 0;
  const mass = normalizeMassOperator(massInput, vectors[0].length, 'mass');
  let maximum = 0;
  for (let i = 0; i < vectors.length; i += 1) for (let j = i + 1; j < vectors.length; j += 1) {
    const cross = Math.abs(weightedDot(vectors[i], vectors[j], mass));
    const scale = Math.sqrt(Math.max(Number.EPSILON, weightedDot(vectors[i], vectors[i], mass) * weightedDot(vectors[j], vectors[j], mass)));
    maximum = Math.max(maximum, cross / scale);
  }
  return maximum;
}

function auditModalLevel(level, options) {
  const modes = level.modes.slice(0, options.modeCount);
  const residuals = modes.map((mode) => modalResidual(mode, level));
  const massResiduals = modes.map((mode) => modalMassResidual(mode, level));
  const mac = modes.map((mode) => modalMac(mode, level));
  const orthogonality = level.massOrthogonalityMax != null
    ? optionalFinite(level.massOrthogonalityMax)
    : level.massMatrix && modes.every((mode) => Array.isArray(mode.vector))
      ? maximumMassOrthogonality(modes.map((mode) => mode.vector), level.massMatrix)
      : null;
  const maximumResidual = maxFinite(residuals);
  const maximumMassResidual = maxFinite(massResiduals);
  const minimumMac = minFinite(mac);
  const residualComplete = residuals.every((value) => value != null);
  const massComplete = massResiduals.every((value) => value != null);
  const macComplete = mac.every((value) => value != null);
  return {
    elements: level.elements,
    modeCount: modes.length,
    maximumResidual,
    maximumMassResidual,
    maximumMassOrthogonality: orthogonality,
    minimumMac,
    residualPassed: modes.length === options.modeCount && residualComplete && maximumResidual <= options.residualTolerance,
    macPassed: modes.length === options.modeCount && macComplete && minimumMac >= options.minimumMac,
    massPassed: modes.length === options.modeCount
      && massComplete && maximumMassResidual <= options.massTolerance
      && orthogonality != null && orthogonality <= options.orthogonalityTolerance,
  };
}

function modalResidual(mode, level) {
  const explicit = optionalFinite(mode.eigenResidual ?? mode.residual);
  if (explicit != null) return Math.abs(explicit);
  if (level.stiffnessMatrix && level.massMatrix && mode.vector) {
    return generalizedEigenResidual(level.stiffnessMatrix, level.massMatrix, mode.vector, modeEigenvalue(mode));
  }
  return null;
}

function modalMassResidual(mode, level) {
  const explicit = optionalFinite(mode.massNormalizationResidual);
  if (explicit != null) return Math.abs(explicit);
  if (mode.generalizedMass != null) return Math.abs(finite(mode.generalizedMass, null, 'generalizedMass') - 1);
  if (level.massMatrix && mode.vector) return Math.abs(quadratic(mode.vector, level.massMatrix) - 1);
  return null;
}

function modalMac(mode, level) {
  const explicit = optionalFinite(mode.macToReference ?? mode.macToPrevious ?? mode.mac);
  if (explicit != null) return explicit;
  if (mode.referenceVector && level.massMatrix && mode.vector) return massWeightedMac(mode.vector, mode.referenceVector, level.massMatrix);
  return null;
}

function auditParticipation(modes, direction, tolerance) {
  const rows = modes.map((mode) => mode.participation?.[direction] || mode.participation || null);
  let maximumResidual = 0;
  let passed = rows.every(Boolean);
  for (const row of rows) {
    if (!row) continue;
    const gamma = optionalFinite(row.gamma);
    const modalMass = optionalFinite(row.modalMass ?? row.generalizedMass);
    const effectiveMass = optionalFinite(row.effectiveMass ?? row.effectiveModalMass);
    const massRatio = optionalFinite(row.massRatio);
    if (gamma == null || modalMass == null || effectiveMass == null || massRatio == null
      || modalMass <= 0 || effectiveMass < 0 || massRatio < 0 || massRatio > 1 + tolerance) {
      passed = false;
      continue;
    }
    const residual = Math.abs(effectiveMass - gamma * gamma * modalMass) / Math.max(Math.abs(effectiveMass), Number.EPSILON);
    maximumResidual = Math.max(maximumResidual, residual);
    if (residual > tolerance) passed = false;
  }
  const cumulativeMassRatio = rows.reduce((sum, row) => sum + (optionalFinite(row?.massRatio) || 0), 0);
  if (cumulativeMassRatio > 1 + tolerance) passed = false;
  return { direction, passed, maximumResidual, cumulativeMassRatio };
}

function signedMetrics(caseId, definitions, actual, references, binding, relativeTolerance, units = {}) {
  const values = references || {};
  return definitions.map((definition) => signedMetric(caseId, {
    id: definition.id,
    quantity: definition.quantity,
    unit: units[definition.field] || definition.unit,
    axis: definition.axis,
    signConvention: definition.signConvention,
    actual: actual?.[definition.field],
    reference: values[definition.field],
    relativeTolerance,
  }, binding));
}

function signedMetric(caseId, input, bindingInput) {
  const binding = requireBinding(bindingInput);
  return evaluatePhase15Metric({
    id: `${caseId}:${input.id}`,
    probeId: `${caseId}:${input.id}:probe`,
    quantity: input.quantity,
    unit: input.unit,
    axis: input.axis,
    signConvention: input.signConvention,
    referenceHash: binding.referenceHash,
    toleranceHash: binding.toleranceHash,
    probeHash: binding.probeHash,
    metricType: 'signed',
    actual: input.actual,
    reference: input.reference,
    relativeTolerance: input.relativeTolerance,
    absoluteTolerance: input.absoluteTolerance,
    characteristicFloor: input.characteristicFloor ?? 0,
    comparisonPolicy: input.comparisonPolicy || 'relative-only',
  });
}

function qualification(caseId, metrics, mandatoryGates, audit) {
  const metricPassed = metrics.length > 0 && metrics.every((row) => row.status === 'PASS' && row.passed === true);
  const gatePassed = mandatoryGates.length > 0 && mandatoryGates.every((row) => row.status === 'PASS');
  const core = {
    version: PHASE15_EXISTING_PASS_QUALIFICATION_VERSION,
    milestone: 'P15-M7',
    caseId,
    status: metricPassed && gatePassed ? 'PASS' : 'FAIL',
    metricPassed,
    mandatoryGatePassed: gatePassed,
    metrics,
    mandatoryGates,
    audit,
    limitations: ['Independent structural-domain and release-owner approvals remain outside this numerical qualification artifact.'],
  };
  return immutable({ ...core, qualificationHash: strictCanonicalHash(core, `${caseId} existing PASS qualification`) });
}

function gate(id, passed, failureCode, details) {
  return createPhase15MandatoryGate({
    id,
    status: passed ? 'PASS' : 'FAIL',
    reasonCode: passed ? 'P15_M7_GATE_SATISFIED' : failureCode,
    details,
  });
}

function normalizeLevels(input, label) {
  const rows = Array.from(input || [], (row, index) => {
    if (!row || typeof row !== 'object') throw new TypeError(`${label}[${index}] must be an object.`);
    return { ...row, elements: positiveInteger(row.elements, `${label}[${index}].elements`) };
  });
  if (!rows.length) throw new TypeError(`${label} are required.`);
  return rows.sort((left, right) => left.elements - right.elements);
}

function normalizeModalLevels(input, label) {
  return normalizeLevels(input, label).map((row, index) => ({ ...row, modes: normalizeModes(row.modes, `${label}[${index}].modes`) }));
}

function normalizeModes(input, label) {
  return Array.from(input || [], (mode, index) => {
    if (!mode || typeof mode !== 'object') throw new TypeError(`${label}[${index}] must be an object.`);
    const frequencyHz = optionalFinite(mode.frequencyHz);
    const eigenvalue = optionalFinite(mode.eigenvalue ?? (mode.omega != null ? Number(mode.omega) ** 2 : null));
    if (frequencyHz == null && eigenvalue == null) throw new TypeError(`${label}[${index}] requires frequencyHz, eigenvalue, or omega.`);
    return { ...mode, frequencyHz, eigenvalue };
  });
}

function normalizeSignedResponse(row, index) {
  if (!row || typeof row !== 'object') throw new TypeError(`responses[${index}] must be an object.`);
  return {
    id: requiredText(row.id, `responses[${index}].id`),
    quantity: requiredText(row.quantity, `responses[${index}].quantity`),
    unit: requiredText(row.unit, `responses[${index}].unit`),
    axis: requiredText(row.axis, `responses[${index}].axis`),
    signConvention: requiredText(row.signConvention, `responses[${index}].signConvention`),
    actual: finite(row.actual, null, `responses[${index}].actual`),
    reference: finite(row.reference, null, `responses[${index}].reference`),
  };
}

function normalizePd1Run(row, index) {
  if (!row || typeof row !== 'object') throw new TypeError(`runs[${index}] must be an object.`);
  const responses = {};
  for (const definition of PD1_QUANTITIES) responses[definition.field] = finite(row.responses?.[definition.field], null, `runs[${index}].responses.${definition.field}`);
  const stages = Array.from(row.stages || [], (stage, stageIndex) => ({
    converged: stage?.converged === true,
    forceResidual: finite(stage?.forceResidual, null, `runs[${index}].stages[${stageIndex}].forceResidual`),
    momentResidual: finite(stage?.momentResidual, null, `runs[${index}].stages[${stageIndex}].momentResidual`),
    workBalanceResidual: finite(stage?.workBalanceResidual, null, `runs[${index}].stages[${stageIndex}].workBalanceResidual`),
  }));
  return {
    elements: positiveInteger(row.elements, `runs[${index}].elements`),
    loadSteps: positiveInteger(row.loadSteps, `runs[${index}].loadSteps`),
    converged: row.converged === true,
    responses,
    stages,
  };
}

function linearEnergyResidual(row) {
  const strainEnergy = optionalFinite(row.strainEnergy);
  const externalWork = optionalFinite(row.externalWork);
  if (strainEnergy == null || externalWork == null) return null;
  return Math.abs(2 * strainEnergy - externalWork) / Math.max(Math.abs(2 * strainEnergy), Math.abs(externalWork), Number.EPSILON);
}

function componentIdentityResidual(row) {
  const bending = optionalFinite(row.bending);
  const axial = optionalFinite(row.axial);
  const combined = optionalFinite(row.combined);
  if (bending == null || axial == null || combined == null) return null;
  return Math.abs(combined - bending - axial) / Math.max(Math.abs(combined), Math.abs(bending) + Math.abs(axial), Number.EPSILON);
}

function componentRunEvidenceSetPassed(levels) {
  const runs = levels.flatMap((row) => ['bending', 'axial', 'combined'].map((kind) => row.componentRuns?.[kind]));
  if (runs.some((run) => run?.executed !== true || !isHash64(run?.calculationHash))) return false;
  return new Set(runs.map((run) => run.calculationHash.toLowerCase())).size === runs.length;
}

function maximumFinalChange(levels, fields) {
  if (levels.length < 2) return null;
  const previous = levels.at(-2);
  const current = levels.at(-1);
  return maxFinite(fields.map((field) => relativeDifference(current[field], previous[field])));
}

function maximumModalFinalChange(levels, count, field) {
  if (levels.length < 2) return null;
  const previous = levels.at(-2)?.modes || [];
  const current = levels.at(-1)?.modes || [];
  if (previous.length < count || current.length < count) return null;
  return maxFinite(Array.from({ length: count }, (_item, index) => relativeDifference(current[index][field], previous[index][field])));
}

function pd1AxisChange(runs, axis, fixedValue, fields) {
  const otherAxis = axis === 'elements' ? 'loadSteps' : 'elements';
  const rows = runs.filter((row) => row[otherAxis] === fixedValue).sort((left, right) => left[axis] - right[axis]);
  return maximumFinalChange(rows.map((row) => ({ ...row.responses, elements: row[axis] })), fields);
}

function modalAuditDetails(rows, field) {
  return rows.map((row) => `${row.elements}:${row[field] == null ? 'missing' : row[field]}`).join(';');
}

function exactLineage(levels, expected) {
  return levels.length === expected.length && levels.every((row, index) => row.elements === expected[index]);
}

function progressiveLineage(levels, minimumCount) {
  return progressiveNumbers(levels.map((row) => row.elements), minimumCount);
}

function progressiveNumbers(values, minimumCount) {
  return values.length >= minimumCount && values.every((value, index) => index === 0 || value > values[index - 1]);
}

function exactStringSet(actual, expected) {
  return actual.length === expected.length && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function modeEigenvalue(mode) {
  const eigenvalue = optionalFinite(mode.eigenvalue ?? (mode.omega != null ? Number(mode.omega) ** 2 : null));
  if (!(eigenvalue > 0)) throw new TypeError('Mode requires a positive eigenvalue or omega.');
  return eigenvalue;
}

function quadratic(vector, matrix) {
  return dot(vector, matrixVector(matrix, vector));
}

function weightedDot(left, right, mass) {
  return mass.kind === 'diagonal'
    ? left.reduce((sum, value, index) => sum + value * mass.values[index] * right[index], 0)
    : dot(left, matrixVector(mass.values, right));
}

function normalizeMassOperator(input, length, label) {
  if (Array.isArray(input) && input.length === length && input.every((value) => Number.isFinite(Number(value)))) {
    const values = input.map(Number);
    if (values.some((value) => value < 0)) throw new RangeError(`${label} diagonal must be nonnegative.`);
    return { kind: 'diagonal', values };
  }
  const values = normalizeSquareMatrix(input, label);
  if (values.length !== length) throw new RangeError(`${label} dimension must match the mode vectors.`);
  return { kind: 'matrix', values };
}

function normalizeSquareMatrix(input, label) {
  const matrix = Array.from(input || [], (row, index) => normalizeVector(row, `${label}[${index}]`));
  if (!matrix.length || matrix.some((row) => row.length !== matrix.length)) throw new RangeError(`${label} must be a non-empty square matrix.`);
  return matrix;
}

function normalizeVector(input, label) {
  const values = Array.from(input || [], (value, index) => finite(value, null, `${label}[${index}]`));
  if (!values.length) throw new RangeError(`${label} must be a non-empty finite vector.`);
  return values;
}

function normalizeVectorArray(input, expectedLength, label) {
  const rows = Array.from(input || [], (row, index) => normalizeVector(row, `${label}[${index}]`));
  if (expectedLength != null && rows.length !== expectedLength) throw new RangeError(`${label} must contain ${expectedLength} vectors.`);
  if (rows.length && rows.some((row) => row.length !== rows[0].length)) throw new RangeError(`${label} vectors must have equal lengths.`);
  return rows;
}

function assertCompatibleModalDimensions(modes, mass, stiffness, references) {
  const size = mass.length;
  if (stiffness.length !== size || modes.some((mode) => !Array.isArray(mode.vector) || mode.vector.length !== size)
    || references.some((vector) => vector.length !== size)) throw new RangeError('SM5 matrix and mode dimensions must match.');
}

function matrixVector(matrix, vector) {
  return matrix.map((row) => dot(row, vector));
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function norm2(values) {
  return Math.hypot(...values);
}

function relativeDifference(leftInput, rightInput) {
  const left = optionalFinite(leftInput);
  const right = optionalFinite(rightInput);
  if (left == null || right == null) return null;
  return Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), Number.EPSILON);
}

function maxFinite(values) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  return finiteValues.length ? Math.max(...finiteValues) : null;
}

function minFinite(values) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  return finiteValues.length ? Math.min(...finiteValues) : null;
}

function requireFiniteArray(input, length, label) {
  const values = Array.from(input || [], (value, index) => finite(value, null, `${label}[${index}]`));
  if (values.length !== length) throw new RangeError(`${label} must contain ${length} values.`);
  return values;
}

function requireBinding(input) {
  if (!input || typeof input !== 'object') throw new TypeError('Phase 15 manifest hash binding is required.');
  return input;
}

function finite(value, fallback, label) {
  if (value == null) {
    if (fallback != null) return fallback;
    throw new TypeError(`${label || 'value'} must be finite.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label || 'value'} must be finite.`);
  return number;
}

function optionalFinite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonnegative(value, fallback, label) {
  const number = finite(value, fallback, label);
  if (number < 0) throw new RangeError(`${label} must be nonnegative.`);
  return number;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new TypeError(`${label} must be a positive integer.`);
  return number;
}

function requiredText(value, label) {
  const text = value == null ? '' : String(value).trim();
  if (!text) throw new TypeError(`${label} is required.`);
  return text;
}

function isHash64(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

function detail(value, tolerance) {
  return `value=${value == null ? 'missing' : value};limit=${tolerance}`;
}

function metricDefinition(id, field, quantity, unit, axis, signConvention) {
  return Object.freeze({ id, field, quantity, unit, axis, signConvention });
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
