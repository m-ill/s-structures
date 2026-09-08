import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import os from 'node:os';
import * as current from '../../src/nonlinear/math/secondOrderJet.js';

const baselineRef=process.argv[2]||'3e877d5';
const baselineSource=execFileSync('git',['-c',`safe.directory=${resolve('.').replaceAll('\\','/')}`,'show',`${baselineRef}:src/nonlinear/math/secondOrderJet.js`]);
const baseline=await import(`data:text/javascript;base64,${baselineSource.toString('base64')}`);
function expression(api,i,size){
  const x=api.jetVariable(0.2+(i%101)/100,0,size);
  const y=api.jetVariable(1.5+(i%73)/200,1,size);
  return api.jetAdd(api.jetSin(api.jetMul(x,y)),api.jetDiv(x,y));
}
for(const size of [2,12,18])for(let i=0;i<100;i++)assert.deepEqual(expression(current,i,size),expression(baseline,i,size));
function measure(api,size){
  let checksum=0;const start=performance.now();
  for(let i=0;i<1500;i++){const r=expression(api,i,size);checksum+=r.value+r.hessian[1];}
  return {ms:performance.now()-start,checksum};
}
const median=rows=>[...rows].sort((a,b)=>a-b)[Math.floor(rows.length/2)];
const results=[];
for(const size of [12,18]){
  for(let i=0;i<3;i++){measure(baseline,size);measure(current,size);}
  const before=[],after=[];
  for(let i=0;i<7;i++){
    const b=i%2?null:measure(baseline,size);const a=measure(current,size);const old=b||measure(baseline,size);
    assert.equal(a.checksum,old.checksum);before.push(old.ms);after.push(a.ms);
  }
  const baselineMedianMs=median(before),optimizedMedianMs=median(after);
  results.push({size,iterations:1500,baselineMs:before,optimizedMs:after,baselineMedianMs,optimizedMedianMs,speedup:baselineMedianMs/optimizedMedianMs});
}
const report={scope:'Second-order derivative arithmetic microbenchmark; not a full-model performance qualification',baselineRef,
  baselineSha256:createHash('sha256').update(baselineSource).digest('hex'),node:process.version,cpu:os.cpus()[0]?.model,
  exactDerivativeComparisons:300,results};
mkdirSync('output/review-20260907',{recursive:true});
writeFileSync('output/review-20260907/jet-benchmark.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
