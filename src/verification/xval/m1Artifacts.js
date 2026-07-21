import { resolveCriterion } from '../../core/analysisCriteria.js';
import { modelHash } from '../matrix/record.js';
import { buildXvalReferenceArtifact } from './referenceArtifact.js';
import {
  createXvalCaseDefinitions,
  xv01HandCalculation,
  xv02HandCalculation,
} from './cases.js';

export const P10_M1_XVAL_ARTIFACT_SET_VERSION = 'p10-m1-xval-artifact-set-v1';

export function buildM1XvalReferenceArtifacts(definitions = createXvalCaseDefinitions()) {
  return definitions.map((definition) => {
    if (definition.caseId === 'XV-01') {
      return buildXvalReferenceArtifact(artifactInput(definition, 'ready', xv01Quantities(definition.model)));
    }
    if (definition.caseId === 'XV-02') {
      return buildXvalReferenceArtifact(artifactInput(definition, 'ready', xv02Quantities(definition.model)));
    }
    return buildXvalReferenceArtifact(artifactInput(definition, 'pending-reference', []));
  });
}

export function xv01ReferenceQuantities(model) {
  return xv01Quantities(model);
}

export function xv02ReferenceQuantities(model) {
  return xv02Quantities(model);
}

function artifactInput(definition, status, quantities) {
  return {
    status,
    caseId: definition.caseId,
    source: status === 'ready' ? 'hand-calc' : pendingSource(definition.caseId),
    sourceVersion: status === 'ready' ? `${definition.caseId.toLowerCase()}-closed-form-v1` : 'owner-reference-pending',
    date: '2026-07-20',
    author: 'Phase 10 verification team',
    model: {
      modelHash: modelHash(definition.model),
      unitSystem: definition.model.unitSystem,
    },
    quantities,
    provenance: {
      inputFiles: [`tests/fixtures/phase10/xval/${definition.caseId}.model.json`],
      notes: status === 'ready'
        ? 'Independent closed-form calculation; production solver output is not used as the reference.'
        : 'Model fixture is committed; owner-supplied external reference values are pending.',
    },
  };
}

function xv01Quantities(model) {
  const reference = xv01HandCalculation();
  const displacementReaction = resolveCriterion(model, 'xval.displacementReaction', 1e-4);
  const memberForce = resolveCriterion(model, 'xval.memberForce', 1e-3);
  return [
    quantity('static.topDisplacementX', reference.static.topDisplacementX, 'm', displacementReaction),
    quantity('static.baseReactionX', reference.static.baseReactionX, 'kN', displacementReaction),
    quantity('static.baseMomentY', reference.static.baseMomentY, 'kN.m', displacementReaction),
    quantity('static.columnBaseMomentZ', reference.static.columnBaseMomentZ, 'kN.m', memberForce),
  ];
}

function xv02Quantities(model) {
  const reference = xv02HandCalculation();
  const displacementReaction = resolveCriterion(model, 'xval.displacementReaction', 1e-4);
  const memberForce = resolveCriterion(model, 'xval.memberForce', 1e-3);
  const period = resolveCriterion(model, 'xval.period', 1e-3);
  const massParticipation = resolveCriterion(model, 'xval.massParticipation', 1e-3);
  return [
    quantity('static.floor1DisplacementX', reference.static.floor1DisplacementX, 'm', displacementReaction),
    quantity('static.floor2DisplacementX', reference.static.floor2DisplacementX, 'm', displacementReaction),
    quantity('static.roofDisplacementX', reference.static.roofDisplacementX, 'm', displacementReaction),
    quantity('static.baseReactionX', reference.static.baseReactionX, 'kN', displacementReaction),
    quantity('static.baseMomentY', reference.static.baseMomentY, 'kN.m', displacementReaction),
    quantity('static.columnBaseMomentZ', reference.static.columnBaseMomentZ, 'kN.m', memberForce),
    ...[1, 2, 3].flatMap((index) => [
      quantity(`modal.period${index}`, reference.modal[`period${index}`], 's', period),
      quantity(`modal.massRatioX${index}`, reference.modal[`massRatioX${index}`], '1', massParticipation),
    ]),
  ];
}

function quantity(path, value, unit, tolerance) {
  return { path, value, unit, tolerance, scale: 1e-12 };
}

function pendingSource(caseId) {
  if (['XV-03', 'XV-04', 'XV-06'].includes(caseId)) return 'opensees';
  if (['XV-05', 'XV-08'].includes(caseId)) return 'etabs';
  return 'sap2000';
}
