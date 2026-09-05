import assert from 'node:assert/strict';
import { buildPhase13ShellContainmentAudit, buildPhase13ShellLab } from '../src/solver/shell/phase13ShellLab.js';

const lab = buildPhase13ShellLab({ phase10EvidenceStatus: 'PASS', meshQa: { minDetJ: 0.2, invertedCount: 0, maxWarp: 0.05 }, meshResults: [{ meshSize: 1, quantity: 1, elementCount: 10 }, { meshSize: 0.5, quantity: 1.01, elementCount: 40 }, { meshSize: 0.25, quantity: 1.005, elementCount: 160 }], tolerance: 0.02 });
assert.equal(lab.converged, true); assert.equal(lab.designTransferAllowed, false); assert.equal(lab.coreFrameReleaseImpact, 'none'); assert.equal(lab.status, 'experimental-converged'); assert.equal(lab.rows.every((row) => row.meshHash && row.runHash), true);
const invalid = buildPhase13ShellLab({ phase10EvidenceStatus: 'PASS', meshQa: { minDetJ: -1 }, meshResults: [] }); assert.equal(invalid.status, 'experimental-review'); assert.ok(invalid.blockers.includes('SHELL_MESH_DETJ_NONPOSITIVE'));
const containment = buildPhase13ShellContainmentAudit({ ui: { shellDesignTransferAllowed: false }, api: { shellDesignTransferAllowed: false }, agent: { shellDesignTransferAllowed: false }, report: { shellDesignTransferAllowed: false }, calculationPackage: { shellDesignTransferAllowed: false }, frameDesignLeakageAllowed: false, gpuVerifiedRouteAllowed: false }); assert.equal(containment.status, 'PASS');
console.log(JSON.stringify({ ok: true, milestone: 'P13-M8', containment: true }, null, 2));
