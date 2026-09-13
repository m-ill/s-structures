const stages=new Set(['preparation','geometry','analysis','evaluation','quantity','comparison','application']);
export function createCandidateStageTiming(job,clock=()=>performance.now()){
 const state={activeStage:null,activeSince:null,durationsMs:{}};job.stageTiming=state;
 const close=()=>{if(state.activeStage){state.durationsMs[state.activeStage]=(state.durationsMs[state.activeStage]||0)+Math.max(0,clock()-state.activeSince);state.activeStage=null;state.activeSince=null;}};
 return {enter(stage){if(!stages.has(stage))throw Error('CANDIDATE_STAGE_INVALID');close();state.activeStage=stage;state.activeSince=clock();},finish:close};
}
export function candidateStageSnapshot(job,now=performance.now()){
 const state=job.stageTiming,active=['running','applying'].includes(job.status)&&stages.has(state?.activeStage)&&Number.isFinite(state.activeSince);
 const durationsMs={};for(const stage of stages){const value=state?.durationsMs?.[stage];if(Number.isFinite(value)&&value>=0)durationsMs[stage]=value;}
 return {activeStage:active?state.activeStage:null,activeElapsedMs:active?Math.max(0,now-state.activeSince):0,durationsMs,basis:'wall-clock stage duration; not CPU time or completion percentage'};
}
