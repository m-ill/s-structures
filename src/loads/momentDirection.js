import {resolveLoadDirection} from './fixedEnd/common.js';
// Explicit UI/WebMCP directions follow the same global/local convention as
// forces. Legacy axis-only nodal moments are global; member moments are local.
export function resolveMomentDirection(load,axes=null) {
 if(load.direction!=null||load.dir!=null)return resolveLoadDirection(load,axes);
 const axis=load.axis??'z';
 if(!['x','y','z'].includes(axis)){const code=load.type==='mmoment'?'UNSUPPORTED_MEMBER_MOMENT_AXIS':'UNSUPPORTED_NODAL_MOMENT_AXIS';return {ok:false,reason:code,issue:{code,entityId:load.id,component:'axis',value:axis}};}
 return resolveLoadDirection({...load,dir:`+${axis}`,coordinate:load.coordinate??load.coordinateSystem??load.coord??(load.type==='mmoment'?'local':'global')},axes);
}
