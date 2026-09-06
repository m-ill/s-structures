import assert from 'node:assert/strict';
import { createCantileverTipLoad } from '../src/index.js';
import {
  DOMAIN_BINARY_VERSION,
  packDomainBinary,
  unpackDomainBinary,
  validateDomainBinary,
} from '../src/compute/contracts/domainBinary.js';
import {
  INDEX_AGENT_ACTIONS_VERSION,
  executeModelingAction,
  ensureAgentState,
} from '../src/ui/indexAgentActions.js';
import { resolveCriterion } from '../src/core/analysisCriteria.js';

const model = createCantileverTipLoad().model;
model.nodes.push({ id: 'S', x: 4, y: 1, z: 0 });
model.constraints = [{ id: 'RL1', type: 'rigidLink', master: { node: 'N2' }, slave: { node: 'S' } }];
const domain = packDomainBinary(model);
assert.equal(DOMAIN_BINARY_VERSION, 'p14-domain-binary-v7-foundation');
assert.equal(validateDomainBinary(domain).ok, true);
assert.equal(domain.metadata.counts.constraints, 1);
assert.equal(domain.metadata.counts.constraintEquations, 6);
assert.equal(domain.buffers.constraintSlaveDofs.length, 6);
assert.equal(domain.buffers.constraintTermOffsets.length, 7);
assert.deepEqual(unpackDomainBinary(domain).model.constraints, model.constraints);

const agentModel = createCantileverTipLoad().model;
agentModel.nodes.push({ id: 'S', x: 4, y: 0, z: 0 });
const state = ensureAgentState({});
executeModelingAction(agentModel, state, 'addConstraint', {
  id: 'MPC1', type: 'mpc', slave: { node: 'S', dof: 'uz' }, terms: [{ node: 'N2', dof: 'uz', c: 1 }],
});
assert.equal(agentModel.constraints.length, 1);
executeModelingAction(agentModel, state, 'updateConstraint', { id: 'MPC1', d: 0.001 });
assert.equal(agentModel.constraints[0].d, 0.001);
executeModelingAction(agentModel, state, 'deleteConstraint', { id: 'MPC1' });
assert.equal(agentModel.constraints.length, 0);
assert.equal(INDEX_AGENT_ACTIONS_VERSION, 'p14-m1-agent-modeling-actions-v6-foundation');
assert.equal(resolveCriterion(model, 'constraint.consistencyTol'), 1e-10);

console.log(JSON.stringify({
  ok: true,
  version: 'p10-m5-schema-domain-contract-v1',
  domainVersion: DOMAIN_BINARY_VERSION,
  equationCount: domain.metadata.counts.constraintEquations,
  agentVersion: INDEX_AGENT_ACTIONS_VERSION,
}, null, 2));
