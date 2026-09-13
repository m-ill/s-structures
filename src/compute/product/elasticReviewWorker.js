import {preparePracticalResult} from '../../design/evaluation/practicalResultPreparation.js';
import {calculateReview} from './elasticReviewCalculation.js';
let endpoint;
if(typeof self!=='undefined'&&typeof document==='undefined')endpoint=self;
else if(typeof process!=='undefined'&&process.versions?.node){const {parentPort}=await import('node:worker_threads');endpoint=parentPort;}
function handle(event){
 const {model,rows,prepared}=endpoint.addEventListener?event.data:event;
 try{const practical=prepared||preparePracticalResult(model,rows);endpoint.postMessage({ok:true,result:{review:calculateReview(model,rows,practical),practical:prepared?null:practical}});}
 catch(error){endpoint.postMessage({ok:false,code:error.code||error.message||'DESIGN_REVIEW_FAILED'});}
}
if(endpoint?.addEventListener)endpoint.addEventListener('message',handle);else endpoint?.on('message',handle);
