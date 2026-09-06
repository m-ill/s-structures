import { materialOf, sectionOf } from '../../core/catalogs.js';
import { createMomentRotationBackbone } from './momentHinge.js';

export const HINGE_ASSIGNMENT_VERSION = 'p3-m15-hinge-assignment';

export function assignMemberHinges(model = {}, options = {}) {
  const rows = [];
  for (const member of model.members || []) {
    const material = materialOf(model, member.matId);
    const section = sectionOf(model, member.secId);
    const ends = member.nonlinear?.hingeEnds || options.ends || ['i', 'j'];
    for (const end of ends) {
      rows.push(buildAssignedHinge(member, end, material, section, options));
    }
  }
  return {
    version: HINGE_ASSIGNMENT_VERSION,
    method: 'member-nonlinear-overrides-then-material-backbone-then-section-strength',
    hinges: rows,
    summary: {
      memberCount: new Set(rows.map((row) => row.memberId)).size,
      hingeCount: rows.length,
      materialBackboneCount: rows.filter((row) => row.source === 'material.nonlinear.backbone').length,
      defaultBackboneCount: rows.filter((row) => row.source === 'section-strength-default').length,
      overrideCount: rows.filter((row) => row.source === 'member.nonlinear.hinge').length,
    },
    limitations: [
      'M15 hinge assignment is concentrated at member ends.',
      'PMM interaction and fiber-generated backbone assignment are handled by P3-M16 traces.',
    ],
  };
}

function buildAssignedHinge(member, end, material, section, options) {
  const override = findOverride(member, end);
  const base = override || materialBackbone(material) || strengthBackbone(material, section, member, options);
  const backbone = createMomentRotationBackbone(base);
  return {
    id: `${member.id}:${end}`,
    memberId: member.id,
    end,
    type: override?.type || 'moment',
    backboneId: override?.backbone || material?.id || null,
    source: override ? 'member.nonlinear.hinge' : material?.nonlinear?.backbone?.length ? 'material.nonlinear.backbone' : 'section-strength-default',
    rotation: Number(options.initialRotation || 0),
    My: backbone.points[1].moment,
    thetaY: backbone.points[1].theta,
    backbone,
  };
}

function findOverride(member, end) {
  const hinges = member.nonlinear?.hinges || [];
  return hinges.find((hinge) => hinge.end === end || hinge.id === `${member.id}:${end}`) || null;
}

function materialBackbone(material = {}) {
  const points = material.nonlinear?.backbone;
  if (!Array.isArray(points) || points.length < 2) return null;
  const yieldPoint = points.find((point) => positive(point.moment ?? point.stress, 0) > 0) || points[1];
  const thetaY = positive(yieldPoint.rotation ?? yieldPoint.strain, 0.01);
  const My = positive(yieldPoint.moment ?? yieldPoint.stress, strength(material));
  return {
    My,
    thetaY,
    capRatio: positive(material.nonlinear.capRatio, 1 + positive(material.nonlinear.hardeningRatio, 0.02) * 4),
    residualRatio: positive(material.nonlinear.residualRatio, 0.25),
  };
}

function strengthBackbone(material = {}, section = {}, member = {}, options = {}) {
  const fy = strength(material);
  const plasticModulus = Math.max(
    positive(section.Zz, 0),
    positive(section.Zy, 0),
    positive(section.Sz, 0),
    positive(section.Sy, 0),
    positive(section.A, 0.01) * positive(member.length, options.defaultLength || 3) / 8,
  );
  const My = positive(options.defaultMy, fy * plasticModulus);
  return {
    My,
    thetaY: positive(options.defaultThetaY, My / Math.max(1e-9, fy * plasticModulus * 100)),
    capRatio: 1.08,
    residualRatio: 0.25,
  };
}

function strength(material = {}) {
  return positive(material.Fy ?? material.strength?.steel?.Fy ?? material.fc, 240000);
}

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
