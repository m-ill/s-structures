import assert from 'node:assert/strict';
import {
  buildReportData,
  createHtmlReport,
  createModel,
  validateModel,
} from '../src/index.js';
import {
  analyzeForIndex,
  createIndexAgentApi,
  INDEX_LEGACY_RESULT_SHAPE_VERSION,
  installIndexEngineBridge,
  normalizeIndexResult,
  validateForIndex,
} from '../src/ui/indexBridge.js';

function run() {
const model = createOriginalIndexStartupSample();
const analysis = analyzeForIndex(model, { requestedAt: '2026-06-25T00:00:00.000Z' });

assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));
assert.equal(analysis.legacyResultShape.version, INDEX_LEGACY_RESULT_SHAPE_VERSION);
assert.equal(analysis.legacyResultShape.compatible, true);
assert.ok(analysis.legacyResultShape.resultToggles.includes('def'));
assert.ok(analysis.legacyResultShape.resultToggles.includes('M'));
assert.ok(analysis.legacyResultShape.resultToggles.includes('Q'));
assert.ok(analysis.legacyResultShape.resultToggles.includes('N'));
assert.ok(analysis.legacyResultShape.resultToggles.includes('react'));
assert.ok(analysis.legacyResultShape.resultToggles.includes('chk'));
assert.ok(analysis.legacyResultShape.resultToggles.includes('design'));
assert.ok(analysis.legacyResultShape.resultToggles.includes('defl'));

for (const resultSet of [analysis.envelope, ...Object.values(analysis.byCombo)]) {
  assert.equal(resultSet.legacyShape.version, INDEX_LEGACY_RESULT_SHAPE_VERSION);
  assert.equal(resultSet.legacyShape.compatible, true);
  assert.equal(resultSet.disp, resultSet.nodeDisplacements);
  assert.equal(resultSet.displacements, resultSet.nodeDisplacements);
  assert.ok(resultSet.summary.maxDisplacement > 0);
  assert.ok(resultSet.summary.maxRatio >= 0);
  assert.equal(resultSet.envelopeSummary, resultSet.summary);

  const member = Object.values(resultSet.memberResults)[0];
  assert.ok(member.memberId);
  assert.ok(Array.isArray(member.N));
  assert.ok(Array.isArray(member.Vy));
  assert.ok(Array.isArray(member.Vz));
  assert.ok(Array.isArray(member.My));
  assert.ok(Array.isArray(member.Mz));
  assert.equal(member.values.My, member.My);
  assert.equal(member.shear.y, member.Vy);
  assert.equal(member.moments.z, member.Mz);
  assert.equal(typeof member.Nmax, 'number');
  assert.equal(typeof member.Vymax, 'number');
  assert.equal(typeof member.Vzmax, 'number');
  assert.equal(typeof member.Mymax, 'number');
  assert.equal(typeof member.Mzmax, 'number');
  assert.equal(typeof member.utilization, 'number');
  assert.ok(member.status);
  assert.ok(member.deflection);

  const reaction = Object.values(resultSet.reactions)[0];
  assert.ok(reaction.nodeId);
  assert.equal(reaction.values.length, 6);
  assert.equal(reaction.force.x, reaction.rx);
  assert.equal(reaction.moment.z, reaction.rmz);
  assert.equal(reaction.RMz, reaction.rmz);
}

const firstNodeId = model.nodes.find((node) => node.support === 'fixed').id;
const arrayReactionAnalysis = analyzeForIndex(model);
arrayReactionAnalysis.envelope.reactions[firstNodeId] = [1, 2, 3, 4, 5, 6];
normalizeIndexResult(arrayReactionAnalysis, { requestedAt: '2026-06-25T00:00:00.000Z' });
const normalizedArrayReaction = arrayReactionAnalysis.envelope.reactions[firstNodeId];
assert.equal(normalizedArrayReaction.values.length, 6);
assert.equal(normalizedArrayReaction.force.z, normalizedArrayReaction.rz);
assert.equal(normalizedArrayReaction.rmx, 4);

assert.ok(analysis.design.summary);
assert.ok(analysis.design.summary.maxUtilization >= 0);
assert.equal(validateForIndex(model).errors.length, 0);
assert.equal(validateModel(model).errors.length, 0);

const reportData = buildReportData(model, analysis);
assert.equal(reportData.analysis.status, 'OK');
assert.ok(reportData.memberForces.length > 0);
assert.ok(reportData.design.rows.length > 0);

const report = createHtmlReport(model, analysis);
assert.match(report.html, /Member Force Envelope/);
assert.match(report.html, /Design Summary/);

const document = createRuntimeDocument();
let result = null;
let drawCount = 0;
const target = {
  document,
  model: () => model,
  activeResult: () => result?.envelope || null,
  draw: () => {
    drawCount += 1;
  },
  reanalyze: () => {
    result = target.analyzeModel(model);
    document.getElementById('statusTxt').textContent = result.ok
      ? `OK ${Object.keys(result.envelope.memberResults).length}`
      : 'NG';
    document.getElementById('statusChip').textContent = result.ok ? 'OK' : 'NG';
    target.draw();
  },
  getComputedStyle(element) {
    return {
      display: element.style?.display || 'block',
      visibility: element.style?.visibility || 'visible',
    };
  },
};
document.defaultView = target;

const bridge = installIndexEngineBridge(target);
bridge.reanalyze();
assert.equal(result.legacyResultShape.compatible, true);
assert.equal(document.getElementById('statusTxt').textContent, 'OK 8');
assert.equal(document.getElementById('statusChip').textContent, 'OK');
assert.ok(drawCount >= 1);

const agent = createIndexAgentApi(target, bridge);
const snapshot = agent.getSnapshot();
assert.equal(snapshot.runtime.activeResult.available, true);
assert.equal(snapshot.runtime.activeResult.compatible, true);
assert.equal(snapshot.runtime.activeResult.memberResultCount, 8);
assert.equal(snapshot.runtime.statusText, 'OK 8');
assert.equal(agent.getCapabilities().modules.legacyResultShape, INDEX_LEGACY_RESULT_SHAPE_VERSION);
assert.ok(agent.getCapabilities().milestones.some((item) => item.id === 'M24'));

console.log(JSON.stringify({
  ok: true,
  compatibilityVersion: INDEX_LEGACY_RESULT_SHAPE_VERSION,
  members: model.members.length,
  toggles: analysis.legacyResultShape.resultToggles.length,
  drawCount,
}, null, 2));
}

function createOriginalIndexStartupSample() {
  const sample = createModel();
  const points = [
    [0, 0],
    [6, 0],
    [6, 4],
    [0, 4],
  ];
  const bottom = [];
  const top = [];
  let next = 1;
  const uid = () => `I${next++}`;

  for (const [x, y] of points) {
    const base = { id: uid(), x, y, z: 0, support: 'fixed' };
    const roof = { id: uid(), x, y, z: 3, support: null };
    sample.nodes.push(base, roof);
    bottom.push(base);
    top.push(roof);
  }

  for (let i = 0; i < 4; i += 1) {
    sample.members.push({
      id: uid(),
      n1: bottom[i].id,
      n2: top[i].id,
      matId: 'steel',
      secId: 'h300',
      localAxis: { roll: 0, strongAxis: 'z' },
    });
  }

  const beams = [];
  for (let i = 0; i < 4; i += 1) {
    const beam = {
      id: uid(),
      n1: top[i].id,
      n2: top[(i + 1) % 4].id,
      matId: 'steel',
      secId: 'h400',
      localAxis: { roll: 0, strongAxis: 'z' },
    };
    sample.members.push(beam);
    beams.push(beam);
  }

  sample.loads.push({
    id: uid(),
    type: 'udl',
    member: beams[0].id,
    w: 8,
    dir: '-z',
    direction: [0, 0, -1],
    coordinate: 'global',
    unit: 'kN/m',
    case: 'D',
  });
  sample.loads.push({
    id: uid(),
    type: 'udl',
    member: beams[2].id,
    w: 8,
    dir: '-z',
    direction: [0, 0, -1],
    coordinate: 'global',
    unit: 'kN/m',
    case: 'D',
  });
  return sample;
}

function createRuntimeDocument() {
  const doc = new FakeDocument();
  doc.add(byId('statusTxt', 'Idle'));
  doc.add(byId('statusChip', '-'));
  doc.add(byId('pageInfo', '1 / 1'));

  const combo = byId('comboSel');
  combo.value = 'CO1';
  combo.selectedIndex = 0;
  combo.options = [element('option', '1.0D + 1.0L')];
  doc.add(combo);

  for (const value of ['def', 'M', 'Q', 'N', 'react', 'chk', 'design', 'defl']) {
    doc.add(button({ attr: 'data-res', value, text: value, classes: value === 'def' ? ['on'] : [] }));
  }
  doc.add(button({ attr: 'data-view', value: 'iso', text: '3D', classes: ['active'] }));
  doc.add(button({ attr: 'data-tool', value: 'smove', text: 'Select', classes: ['active'] }));
  doc.add(byId('palette', '', ['show']));
  doc.add(byId('reportModal'));
  return doc;
}

function byId(id, text = '', classes = []) {
  const item = element('div', text, classes);
  item.setAttribute('id', id);
  return item;
}

function button({ attr, value, text, classes = [] }) {
  const item = element('button', text, classes);
  item.setAttribute(attr, value);
  return item;
}

function element(tagName, text = '', classes = []) {
  return new FakeElement(tagName, text, classes);
}

class FakeDocument {
  constructor() {
    this.elements = [];
    this.defaultView = null;
  }

  add(item) {
    this.elements.push(item);
    return item;
  }

  getElementById(id) {
    return this.elements.find((item) => item.getAttribute('id') === id) || null;
  }

  querySelectorAll(selector) {
    return this.elements.filter((item) => matches(item, selector));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

class FakeElement {
  constructor(tagName, text = '', classes = []) {
    this.tagName = tagName.toUpperCase();
    this.textContent = text;
    this.attributes = {};
    this.style = {};
    this.disabled = false;
    this.hidden = false;
    this.value = '';
    this.max = '';
    this.options = [];
    this.selectedIndex = -1;
    this._classes = new Set(classes);
    this.classList = {
      contains: (item) => this._classes.has(item),
      add: (...items) => items.forEach((item) => this._classes.add(item)),
      remove: (...items) => items.forEach((item) => this._classes.delete(item)),
    };
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }
}

function matches(element, selector) {
  const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
  if (attr) {
    const value = element.getAttribute(attr[1]);
    return attr[2] == null ? value != null : value === attr[2];
  }
  if (selector.startsWith('#')) return element.getAttribute('id') === selector.slice(1);
  if (selector === '[id]') return !!element.getAttribute('id');
  return false;
}

run();
