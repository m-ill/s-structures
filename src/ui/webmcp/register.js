import { createWebMcpTools, WEBMCP_VERSION } from './tools.js';

export function registerDefinitions(target,definitions,state) {
  const context=target.document?.modelContext,controller=new AbortController();let active=true;
  state.status='unsupported';state.registered=[];state.errors=[];
  state.dispose=()=>{active=false;controller.abort();state.status='disposed';definitions.dispose?.();};
  if(target.isSecureContext===false||typeof context?.registerTool!=='function')return state;
  for(const definition of definitions) {
    try {
      const registration=context.registerTool({...definition,execute(args){if(!active)throw new Error('WebMCP page session is inactive.');return definition.execute(args);}},{signal:controller.signal});
      state.registered.push(definition.name);
      Promise.resolve(registration).catch(error=>{if(active){state.errors.push({tool:definition.name,message:String(error?.message||error)});state.status='registration-failed';state.render?.();}});
    }catch(error){state.errors.push({tool:definition.name,message:String(error?.message||error)});}
  }
  state.status=state.errors.length?'registration-failed':'registered';return state;
}

export function installWebMcp(target,bridge) {
  if(target.SStructuresWebMcp)return target.SStructuresWebMcp;
  const project=new URLSearchParams(target.location?.search||'').get('project')||'local-model';
  const nonce=target.crypto?.randomUUID?.()||`session-${Date.now()}-${Math.random()}`;
  const state={version:WEBMCP_VERSION,status:'unsupported',registered:[],errors:[],project,nonce,session:nonce,active:true,lastAction:null};
  target.SStructuresWebMcp=state;
  const doc=target.document,host=doc?.querySelector?.('[data-ss-ribbon-panel="elastic"]');
  const label=host?doc.createElement('p'):null;
  if(label){label.id='ssWebMcpStatus';label.setAttribute('role','status');label.style.cssText='font:12px system-ui;margin:4px;color:#284d73';host.appendChild(label);}
  state.render=()=>{const stale=state.reviewId?bridge.getDesignReview(state.reviewId).stale:null;if(label)label.textContent=`WebMCP ${state.status} · 도구 ${state.registered.length}개 · ${state.lastAction||'작업 없음'} · ${stale===true?'검토 결과 오래됨':stale===false?'검토 결과 최신':state.changed?'입력 변경됨: 해석 필요':'검토 결과 없음'} · 탄성 예비 검토 · 비선형 candidate` ;};
  const definitions=createWebMcpTools({agent:target.SStructuresAgent,bridge,onActivity:action=>{state.lastAction=action.tool;if(action.changed)state.changed=true;if(action.designRunId){state.reviewId=action.designRunId;bridge.designReviewPanel?.adoptReview?.(action.designRunId);}state.render();},setView:view=>{
    if(['design-input','design-review'].includes(view)){target.SStructuresNativeUI?.setMode?.('elastic');const panel=view==='design-input'?bridge.designInputPanel:bridge.designReviewPanel;if(!panel)return {ok:false,code:'VIEW_UNAVAILABLE'};panel.open();}
    else {if(!target.SStructuresNativeUI?.setMode)return {ok:false,code:'VIEW_UNAVAILABLE'};target.SStructuresNativeUI.setMode(view);}
    return {ok:true,view};
  }});
  state.definitions=definitions;
  state.call=(binding,name,args)=>{
    if(!state.active||binding.session!==state.session||binding.nonce!==state.nonce||binding.project!==state.project)throw Object.assign(new Error('SESSION_BINDING_INVALID'),{code:'SESSION_BINDING_INVALID'});
    const tool=definitions.find(x=>x.name===name);if(!tool)throw new Error('TOOL_NOT_FOUND');return tool.execute(structuredClone(args));
  };
  if(target.top&&target.top!==target){state.status='top-level-required';state.dispose=()=>{state.active=false;definitions.dispose();state.status='disposed';};}
  else {registerDefinitions(target,definitions,state);const dispose=state.dispose;state.dispose=()=>{state.active=false;dispose();state.render();};}
  state.render();target.addEventListener?.('pagehide',event=>{if(!event.persisted)state.dispose();});return state;
}
