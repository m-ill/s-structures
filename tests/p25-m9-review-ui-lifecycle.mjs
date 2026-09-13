import assert from 'node:assert/strict';
import {createFakeIndexDocument} from './helpers/fakeIndexDom.mjs';
import {installIndexDesignReview} from '../src/ui/indexDesignReview.js';
const doc=createFakeIndexDocument(),host=doc.createElement('div');host.setAttribute('data-ss-ribbon-panel','elastic');doc.body.appendChild(host);
let resolveRun,reports=0,downloads=0;
const bridge={getCurrentModel:()=>({analysisCases:[]}),listDesignAnalysisSources:()=>[],getDesignReview:id=>({ok:!!id}),planDesignReview:()=>({ok:true}),startDesignReviewAsync:()=>new Promise(resolve=>{resolveRun=resolve;}),cancelDesignReview:()=>({ok:true}),createDesignReviewReport:id=>{reports++;return {ok:true,reportSnapshotHash:id,reports:{'ko-KR':{html:'old'}},json:'{}',csv:''};},getDesignReviewExportCapability:()=>({automaticPdf:false}),getDesignReviewReport:()=>({ok:true,stale:false})};
const target={document:doc,URL:{createObjectURL(){downloads++;return 'blob:test';}},Blob:class{},setTimeout(){}};
const ui=installIndexDesignReview(target,bridge),button=label=>doc.querySelectorAll('button').find(b=>b.textContent===label),tick=()=>new Promise(resolve=>setTimeout(resolve,0));
assert.equal(button('보고서 생성').disabled,true);
ui.adoptReview('old');ui.open();assert.equal(button('보고서 생성').disabled,false);button('보고서 생성').click();const oldDownload=button('HTML 저장');assert.ok(oldDownload);
button('설계 검토 실행').click();assert.equal(button('보고서 생성').disabled,true);button('보고서 생성').click();oldDownload.click();assert.equal(reports,1);assert.equal(downloads,0);
resolveRun({ok:false,code:'FAILED'});await tick();assert.equal(button('보고서 생성').disabled,true);assert.equal(button('설계 검토 실행').disabled,false);
button('설계 검토 실행').click();button('설계 검토 취소').click();resolveRun({ok:true,designRunId:'cancelled-late'});await tick();assert.equal(button('보고서 생성').disabled,true);
button('설계 검토 실행').click();resolveRun({ok:true,designRunId:'new'});await tick();assert.equal(button('보고서 생성').disabled,false);
oldDownload.click();assert.equal(downloads,0,'detached old download must not validate old content using a new review ID');
console.log('PASS review UI disables stale report actions, clears failed selection and ignores late cancelled completion');

bridge.startDesignReviewAsync=()=>Promise.reject(new Error('simulated'));button('설계 검토 실행').click();await tick();assert.equal(button('설계 검토 실행').disabled,false);assert.equal(button('보고서 생성').disabled,true);
