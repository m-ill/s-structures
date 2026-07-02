import { materialOf, sectionOf } from '../core/catalogs.js';
import { buildMassSourceTrace } from '../loads/loadsV2.js';
import { assembleStiffness3D, solveLinear } from '../solver/linear3d.js';
import { effectiveSectionMaterial } from '../solver/linear3dPost.js';
import { combineModalCqc } from './elasticCompleteness.js';

const DOF_DIR = ['x', 'y', 'z'];

export function analyzeDynamics(model, options = {}) {
  const settings = { ...(model.analysisSettings || {}), ...(options || {}) };
  const modeCount = Math.max(1, settings.modalModeCount | 0 || 6);
  const system = assembleStiffness3D(model.nodes || [], model.members || [], {
    mat: (id) => materialOf(model, id),
    sec: (id) => sectionOf(model, id),
  });
  if (!system.ok) return { ok: false, reason: system.reason || 'NO_STIFFNESS' };

  const massSourceSpec = settings.massSource || null;
  const massSourceTrace = massSourceSpec ? buildMassSourceTrace(model, massSourceSpec) : null;
  const mass = buildLumpedMass(model, system, massSourceSpec);
  const modalDofs = system.free.filter((dof) => dof % 6 < 3 && mass[dof] > 0);
  if (!modalDofs.length) return { ok: false, reason: 'NO_MASS', modes: [], rsa: null };

  const residualDofs = system.free.filter((dof) => !modalDofs.includes(dof));
  const K = condenseToModalDofs(system.K, modalDofs, residualDofs);
  const M = modalDofs.map((dof) => mass[dof]);
  const A = massNormalize(K, M);
  const eig = jacobiEigen(A);
  const modes = eig.values
    .map((value, i) => modeFromEigen(value, eig.vectors.map((row) => row[i]), modalDofs, M, model.nodes || []))
    .filter((mode) => mode && Number.isFinite(mode.frequencyHz) && mode.frequencyHz > 0)
    .sort((a, b) => a.omega - b.omega)
    .slice(0, modeCount)
    .map((mode, index) => ({ ...mode, id: `MODE${index + 1}`, index: index + 1 }));

  const totalMass = totalDirectionalMass(mass, system.free);
  for (const mode of modes) {
    mode.participation = participation(mode.vector, modalDofs, mass, totalMass);
  }

  const rsa = settings.responseSpectrum?.enabled === false
    ? null
    : runResponseSpectrum(modes, modalDofs, mass, totalMass, settings.responseSpectrum || {});

  return {
    ok: modes.length > 0,
    type: 'modal_lumped_mass',
    modes,
    mass: {
      total: totalMass,
      modalDofCount: modalDofs.length,
      freeDofCount: system.free.length,
      source: massSourceTrace ? 'analysisSettings.massSource' : 'node-and-member-mass',
      massSource: massSourceTrace,
    },
    rsa,
  };
}

export function buildLumpedMass(model, system, massSource = null) {
  const mass = new Array(system.ndof || (model.nodes || []).length * 6).fill(0);
  const idx = system.idx || Object.fromEntries((model.nodes || []).map((node, i) => [node.id, i]));

  for (const member of model.members || []) {
    const md = system.memData?.[member.id];
    if (!md) continue;
    const { section, material } = effectiveSectionMaterial((id) => sectionOf(model, id), (id) => materialOf(model, id), member);
    const m = Math.max(0, Number(material.density || 0) * Number(section.A || 0) * Number(md.ax.L || 0));
    if (!(m > 0)) continue;
    for (const nodeId of [member.n1, member.n2]) {
      const base = idx[nodeId] * 6;
      for (let i = 0; i < 3; i += 1) mass[base + i] += m / 2;
    }
  }

  if (massSource) {
    const trace = buildMassSourceTrace(model, massSource);
    for (const row of trace.rows || []) {
      const base = idx[row.node] * 6;
      if (!Number.isFinite(base)) continue;
      for (let i = 0; i < 3; i += 1) mass[base + i] += Math.max(0, Number(row.mass) || 0);
    }
  } else {
    for (const node of model.nodes || []) {
      const base = idx[node.id] * 6;
      if (Number(node.mass) > 0) {
        for (let i = 0; i < 3; i += 1) mass[base + i] += Number(node.mass);
      } else if (Array.isArray(node.mass)) {
        for (let i = 0; i < 3; i += 1) mass[base + i] += Math.max(0, Number(node.mass[i]) || 0);
      }
    }
  }
  return mass;
}

export function runResponseSpectrum(modes, modalDofs, mass, totalMass, spectrum = {}) {
  const directions = spectrum.directions || ['x', 'y'];
  const modal = [];
  const combined = {};

  for (const direction of directions) {
    const dirIndex = { x: 0, y: 1, z: 2 }[direction] ?? 0;
    const responses = modes.map((mode) => {
      const gamma = mode.participation[direction]?.gamma || 0;
      const sa = spectralAcceleration(mode.period, spectrum);
      const displacement = mode.omega > 0 ? Math.abs(gamma * sa / (mode.omega ** 2)) : 0;
      return {
        mode: mode.id,
        period: mode.period,
        gamma,
        sa,
        displacement,
        massRatio: mode.participation[direction]?.massRatio || 0,
      };
    });
    modal.push({ direction, responses });
    const method = String(spectrum.method || 'SRSS').toUpperCase();
    combined[direction] = {
      maxModalDisplacement: Math.max(0, ...responses.map((item) => item.displacement)),
      srssDisplacement: Math.sqrt(responses.reduce((sum, item) => sum + item.displacement ** 2, 0)),
      cqcDisplacement: combineModalCqc(responses, spectrum.dampingRatio ?? 0.05),
      method,
      participatingMassRatio: Math.min(1, responses.reduce((sum, item) => sum + item.massRatio, 0)),
      totalMass: totalMass[dirIndex] || 0,
    };
  }

  return {
    method: String(spectrum.method || 'SRSS').toUpperCase(),
    spectrum: {
      dampingRatio: spectrum.dampingRatio ?? 0.05,
      scale: spectrum.scale ?? 9.80665,
      points: spectrum.points || [{ period: 0, sa: 0.4 }, { period: 5, sa: 0.4 }],
    },
    modal,
    combined,
  };
}

function condenseToModalDofs(K, modalDofs, residualDofs) {
  const Ktt = submatrix(K, modalDofs, modalDofs);
  if (!residualDofs.length) return Ktt;
  const Ktr = submatrix(K, modalDofs, residualDofs);
  const Krt = submatrix(K, residualDofs, modalDofs);
  const Krr = submatrix(K, residualDofs, residualDofs);
  const solved = [];
  for (let j = 0; j < modalDofs.length; j += 1) {
    const rhs = Krt.map((row) => row[j]);
    const x = solveLinear(Krr.map((row) => row.slice()), rhs);
    if (!x) return Ktt;
    solved.push(x);
  }
  const out = Ktt.map((row) => row.slice());
  for (let i = 0; i < modalDofs.length; i += 1) {
    for (let j = 0; j < modalDofs.length; j += 1) {
      let correction = 0;
      for (let r = 0; r < residualDofs.length; r += 1) correction += Ktr[i][r] * solved[j][r];
      out[i][j] -= correction;
    }
  }
  return symmetrize(out);
}

function massNormalize(K, M) {
  return K.map((row, i) => row.map((value, j) => value / Math.sqrt(M[i] * M[j])));
}

function modeFromEigen(lambda, y, modalDofs, M, nodes) {
  if (!(lambda > 1e-9)) return null;
  const omega = Math.sqrt(lambda);
  const vector = new Array(nodes.length * 6).fill(0);
  for (let i = 0; i < modalDofs.length; i += 1) vector[modalDofs[i]] = y[i] / Math.sqrt(M[i]);
  normalizeModeVector(vector);
  return {
    omega,
    frequencyHz: omega / (2 * Math.PI),
    period: (2 * Math.PI) / omega,
    vector,
    shape: Object.fromEntries(nodes.map((node, i) => [node.id, vector.slice(i * 6, i * 6 + 3)])),
  };
}

function participation(vector, modalDofs, mass, totalMass) {
  const out = {};
  for (let dir = 0; dir < 3; dir += 1) {
    let numerator = 0;
    let modalMass = 0;
    for (const dof of modalDofs) {
      const value = vector[dof];
      modalMass += mass[dof] * value * value;
      if (dof % 6 === dir) numerator += mass[dof] * value;
    }
    const gamma = modalMass > 0 ? numerator / modalMass : 0;
    const massRatio = totalMass[dir] > 0 ? (numerator * numerator) / (modalMass * totalMass[dir]) : 0;
    out[DOF_DIR[dir]] = { gamma, modalMass, massRatio };
  }
  return out;
}

function totalDirectionalMass(mass, free) {
  const total = [0, 0, 0];
  for (const dof of free) {
    if (dof % 6 < 3) total[dof % 6] += mass[dof] || 0;
  }
  return total;
}

function spectralAcceleration(period, spectrum = {}) {
  const scale = Number(spectrum.scale ?? 9.80665);
  const points = (spectrum.points || [{ period: 0, sa: 0.4 }, { period: 5, sa: 0.4 }])
    .map((point) => ({ period: Number(point.period), sa: Number(point.sa) }))
    .filter((point) => Number.isFinite(point.period) && Number.isFinite(point.sa))
    .sort((a, b) => a.period - b.period);
  if (!points.length) return 0;
  if (period <= points[0].period) return points[0].sa * scale;
  if (period >= points.at(-1).period) return points.at(-1).sa * scale;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (a.period <= period && period <= b.period) {
      const t = (period - a.period) / Math.max(1e-12, b.period - a.period);
      return (a.sa * (1 - t) + b.sa * t) * scale;
    }
  }
  return points[0].sa * scale;
}

function jacobiEigen(A) {
  const n = A.length;
  const a = A.map((row) => row.slice());
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (i === j ? 1 : 0)));
  const maxIter = Math.max(50, n * n * 50);
  for (let iter = 0; iter < maxIter; iter += 1) {
    let p = 0;
    let q = 1;
    let max = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        if (Math.abs(a[i][j]) > max) {
          max = Math.abs(a[i][j]);
          p = i;
          q = j;
        }
      }
    }
    if (max < 1e-8) break;
    const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
    const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const c = 1 / Math.sqrt(t * t + 1);
    const s = t * c;
    const app = a[p][p];
    const aqq = a[q][q];
    const apq = a[p][q];
    a[p][p] = app - t * apq;
    a[q][q] = aqq + t * apq;
    a[p][q] = 0;
    a[q][p] = 0;
    for (let k = 0; k < n; k += 1) {
      if (k === p || k === q) continue;
      const akp = a[k][p];
      const akq = a[k][q];
      a[k][p] = c * akp - s * akq;
      a[p][k] = a[k][p];
      a[k][q] = s * akp + c * akq;
      a[q][k] = a[k][q];
    }
    for (let k = 0; k < n; k += 1) {
      const vkp = v[k][p];
      const vkq = v[k][q];
      v[k][p] = c * vkp - s * vkq;
      v[k][q] = s * vkp + c * vkq;
    }
  }
  return { values: a.map((row, i) => row[i]), vectors: v };
}

function submatrix(A, rows, cols) {
  return rows.map((row) => cols.map((col) => A[row][col]));
}

function symmetrize(A) {
  const out = A.map((row) => row.slice());
  for (let i = 0; i < out.length; i += 1) {
    for (let j = i + 1; j < out.length; j += 1) {
      const value = (out[i][j] + out[j][i]) / 2;
      out[i][j] = value;
      out[j][i] = value;
    }
  }
  return out;
}

function normalizeModeVector(vector) {
  const max = Math.max(1e-12, ...vector.map((value) => Math.abs(value)));
  for (let i = 0; i < vector.length; i += 1) vector[i] /= max;
}
