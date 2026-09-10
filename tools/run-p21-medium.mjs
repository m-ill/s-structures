import fs from 'node:fs';
import {Worker} from 'node:worker_threads';
import {createP21MediumFixture} from '../tests/fixtures/p21-medium.js';
import {installIndexEngineBridge} from '../src/ui/indexBridge.js';
globalThis.Worker=Worker;
const out=process.argv[2];if(!out||fs.existsSync(out))throw Error('NEW_OUTPUT_REQUIRED');fs.mkdirSync(out,{recursive:true});
const model=createP21MediumFixture(),bridge=installIndexEngineBridge({model:()=>model,location:{search:''}}),started=performance.now();
bridge.getProductAnalysisService().subscribe(event=>fs.writeFileSync(out+'/progress.json',JSON.stringify(event,null,2)));
try{
 const result=await bridge.runElasticWorkflow({plan:bridge.planElasticWorkflow({caseIds:['M-FIRST','M-DIRECT']}),requestId:'M-diagnostic'});
 const data={result,jobs:bridge.listAnalysisRuns(),resources:bridge.getResourceState(),elapsedMs:performance.now()-started,maxRSSKiB:process.resourceUsage().maxRSS};
 fs.writeFileSync(out+'/result.json',JSON.stringify(data,null,2));console.log(JSON.stringify({ok:result.ok,jobs:data.jobs,resources:data.resources,elapsedMs:data.elapsedMs}));
}finally{await bridge.disposeRuntime();}
