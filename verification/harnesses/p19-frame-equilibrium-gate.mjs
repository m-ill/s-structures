import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {runNonlinearAnalysisCaseAsync} from '../../src/nonlinear/analysisRouter.js';
const model=JSON.parse(readFileSync('verification/fixtures/phase19/eight-member-hinged-frame.json','utf8'));
const analysisCase=model.analysisCases.find(c=>c.id==='M5-FINAL-PUSH');
const result=await runNonlinearAnalysisCaseAsync(model,analysisCase,analysisCase.settings,{production:true});
mkdirSync('output/phase19',{recursive:true});
writeFileSync('output/phase19/frame-equilibrium-gate.json',JSON.stringify(result));
const rejected=result.details?.acceptedSteps?.find(s=>s.evaluation?.audit?.ok===false);
const witness={version:'p19-frame-equilibrium-gate-v1',ok:result.ok===true,engine:result.engine,
  reason:result.reason||result.termination?.reason,cause:result.details?.callbackError||null,
  equilibrium:rejected?.evaluation?.audit||null,qualification:'not-qualified',
  input:'verification/fixtures/phase19/eight-member-hinged-frame.json',raw:'output/phase19/frame-equilibrium-gate.json'};
console.log(JSON.stringify(witness,null,2));process.exitCode=witness.ok?0:1;
