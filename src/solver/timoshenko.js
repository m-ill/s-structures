import {
  resolveGlobalShearDeformation,
  resolveMemberShearDeformationSetting,
} from '../core/shearDeformation.js';

export {
  resolveGlobalShearDeformation,
  resolveMemberShearDeformationSetting,
} from '../core/shearDeformation.js';

export const TIMOSHENKO_ELEMENT_VERSION = 'p10-m2-timoshenko-frame-v1';
export const TIMOSHENKO_KG_LIMITATION_CODE = 'TIMOSHENKO_CONSISTENT_KG_NOT_IMPLEMENTED';

export function resolveMemberTimoshenko(modelOrSettings = {}, member = {}, section = {}, material = {}, length = 0) {
  const setting = resolveMemberShearDeformationSetting(modelOrSettings, member);
  const behavior = member.behavior || member.type || 'frame';
  if (['truss', 'tensionOnly', 'compressionOnly'].includes(behavior)) {
    return {
      version: TIMOSHENKO_ELEMENT_VERSION,
      formulation: 'not-applicable-axial-only',
      requested: false,
      enabled: false,
      settingSource: `${setting.settingSource}:not-applicable-axial-only`,
      override: setting.override,
      settingValid: setting.valid,
      phiY: 0,
      phiZ: 0,
      shearAreaY: null,
      shearAreaZ: null,
      missingShearAreas: [],
      shapeFunctions: 'not-applicable-axial-only',
      fixedEndLoads: 'axial-only',
      recovery: 'axial-only',
      geometricStiffness: {
        formulation: 'truss-small-displacement',
        consistent: true,
        limitationCode: null,
      },
      limitations: [],
    };
  }
  const requested = setting.requested;
  const settingSource = setting.settingSource;
  const L = positive(length);
  const E = positive(material.E);
  const G = positive(material.G);
  const Iy = positive(section.Iy);
  const Iz = positive(section.Iz);
  const shearAreaY = firstPositive(section.Ay, section.As_y, section.AsY);
  const shearAreaZ = firstPositive(section.Az, section.As_z, section.AsZ);
  const phiY = requested && E && G && Iy && shearAreaZ && L
    ? (12 * E * Iy) / (G * shearAreaZ * L ** 2)
    : 0;
  const phiZ = requested && E && G && Iz && shearAreaY && L
    ? (12 * E * Iz) / (G * shearAreaY * L ** 2)
    : 0;
  const enabled = requested && (phiY > 0 || phiZ > 0);
  const missingShearAreas = [];
  if (requested && !shearAreaY) missingShearAreas.push('Ay');
  if (requested && !shearAreaZ) missingShearAreas.push('Az');
  const limitations = enabled ? [TIMOSHENKO_KG_LIMITATION_CODE] : [];

  return {
    version: TIMOSHENKO_ELEMENT_VERSION,
    formulation: enabled ? 'timoshenko-2node-exact-static' : 'euler-bernoulli',
    requested,
    enabled,
    settingSource,
    override: setting.override,
    settingValid: setting.valid,
    phiY,
    phiZ,
    shearAreaY: shearAreaY || null,
    shearAreaZ: shearAreaZ || null,
    missingShearAreas,
    shapeFunctions: enabled ? 'exact-static-timoshenko' : 'cubic-hermite',
    fixedEndLoads: enabled ? 'timoshenko-consistent' : 'euler-bernoulli-consistent',
    recovery: enabled ? 'moment-curvature-plus-shear-strain-force-integration' : 'cubic-hermite-plus-fixed-end-bubble',
    geometricStiffness: {
      formulation: 'euler-bernoulli-small-displacement',
      consistent: !enabled,
      limitationCode: enabled ? TIMOSHENKO_KG_LIMITATION_CODE : null,
    },
    limitations,
  };
}

export function timoshenkoPhi(E, I, G, shearArea, length) {
  const elastic = positive(E);
  const inertia = positive(I);
  const shear = positive(G);
  const area = positive(shearArea);
  const L = positive(length);
  return elastic && inertia && shear && area && L
    ? (12 * elastic * inertia) / (shear * area * L ** 2)
    : 0;
}

export function normalizedTimoshenkoPhi(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function firstPositive(...values) {
  for (const value of values) {
    const number = positive(value);
    if (number) return number;
  }
  return 0;
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
