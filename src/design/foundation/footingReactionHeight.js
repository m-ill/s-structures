// Shared by typed-input staging and force-ledger preparation. No guessed
// application height is introduced when a horizontal reaction is present.
export function footingReactionHeight(f,reaction){
 const reference=f.reactionVerticalReference,value=f.reactionHeightAboveBase;
 const fail=reason=>({ok:false,reason});
 if(reference===undefined){
  if(value!==undefined)return fail('FOOTING_REACTION_HEIGHT_CONTRACT_INVALID');
  if(reaction&&(reaction.rx!==0||reaction.ry!==0))return fail('FOOTING_REACTION_HEIGHT_REFERENCE_REQUIRED');
  return {ok:true,height:reaction?0:null,reference:reaction?'height-irrelevant-zero-horizontal-force':null};
 }
 if(!['footing-base','footing-top','specified-height'].includes(reference))return fail('FOOTING_REACTION_HEIGHT_CONTRACT_INVALID');
 if(reference!=='specified-height'&&value!==undefined)return fail('FOOTING_REACTION_HEIGHT_CONTRACT_INVALID');
 const height=reference==='footing-base'?0:reference==='footing-top'?f.thickness:value;
 if(!Number.isFinite(height)||height<0||height>1000)return fail('FOOTING_REACTION_HEIGHT_INVALID');
 return {ok:true,height,reference};
}
