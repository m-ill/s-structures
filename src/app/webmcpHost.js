import { registerDefinitions } from '../ui/webmcp/register.js';

// Same-origin direct capability forwarding. No arbitrary postMessage dispatch.
// Each registration captures the actual frame Document and its session nonce.
export function installHostWebMcp({window,iframe,projectId,onActivity=()=>{}}) {
  let registration=null,child=null,disposed=false;
  function revoke(){registration?.dispose();child?.dispose();registration=null;child=null;}
  function connect(){
    revoke();if(disposed)return;
    try {
      const frame=iframe.contentWindow,document=frame.document;
      if(frame.location.origin!==window.location.origin||!/^https?:/.test(frame.location.protocol))return;
      const session=frame.SStructuresWebMcp;
      if(!session||session.project!==projectId||!session.active)return;
      child=session;const binding={nonce:session.nonce,session:session.session,project:projectId};
      const definitions=session.definitions.map(def=>({...def,async execute(args){
        if(disposed||iframe.contentWindow!==frame||frame.document!==document||frame.location.origin!==window.location.origin||frame.SStructuresWebMcp!==session||!session.active||session.project!==projectId)throw Object.assign(new Error('SESSION_BINDING_INVALID'),{code:'SESSION_BINDING_INVALID'});
        const value=await session.call(binding,def.name,args);
        if(disposed||!session.active)throw new Error('SESSION_DISPOSED');onActivity(def.name);return value;
      }}));
      registration=registerDefinitions(window,definitions,{version:session.version,project:projectId});window.SStructuresHostWebMcp=registration;
      session.status=`host-${registration.status}`;session.registered=[...registration.registered];session.render?.();
    }catch{revoke();}
  }
  iframe.addEventListener?.('load',connect);
  return {connect,dispose(){disposed=true;iframe.removeEventListener?.('load',connect);revoke();}};
}
