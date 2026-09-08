import assert from 'node:assert/strict';
import {auditPhase20} from '../verification/harnesses/p20-module-audit.mjs';
import {validateNonlinearAnalysisCase,runNonlinearAnalysisCase} from '../src/nonlinear/analysisRouter.js';
import {NONLINEAR_ENGINE_IDS} from '../src/nonlinear/capabilities.js';
const report=await auditPhase20();assert.deepEqual(report.issues,[]);assert.equal(report.ok,true);
assert.equal(validateNonlinearAnalysisCase({kind:'pushover',engineId:'missing'}).ok,false);
const result=runNonlinearAnalysisCase({}, {kind:'pushover',engineId:NONLINEAR_ENGINE_IDS.productionPushover,control:{type:'displacement'}});
assert.equal(result.reason,'NONLINEAR_ASYNC_RUNNER_REQUIRED');assert.equal(result.designBlocked,true);assert.equal(result.routing.fallbackUsed,false);
console.log(JSON.stringify({ok:true,registeredModules:report.registeredModules,rawFindings:report.rawArchitecture.forbiddenImports.length,publicCompatibilityBridge:report.compatibilityBridge,rawHistoricalPoliciesPreserved:report.rawArchitecture.compatibility.overduePolicies.length}));
