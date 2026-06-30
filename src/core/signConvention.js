export const SIGN_CONVENTION_VERSION = 'p2-t02-sign-convention';

export const SIGN_CONVENTION = {
  version: SIGN_CONVENTION_VERSION,
  globalAxes: { x: '+X global', y: '+Y global', z: '+Z up' },
  memberLocalAxes: {
    axis1: 'i to j member axis',
    axis2: 'local weak axis from section orientation',
    axis3: 'local strong axis from section orientation',
  },
  memberForces: ['P axial tension positive', 'V2/V3 positive local shear', 'T positive local torsion', 'M2/M3 positive local bending'],
  loads: ['nodal force sign follows global or explicit direction vector', 'member UDL sign follows load direction'],
  reactions: 'reaction is support force acting on the structure in global axes',
};

export function getSignConvention() {
  return JSON.parse(JSON.stringify(SIGN_CONVENTION));
}
