import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  LOAD_DERIVATION_TRACE_VERSION,
  SERVICEABILITY_DRIFT_VERSION,
} from '../src/index.js';

const reportRoot = path.resolve('reports/representative-building-calculation-packages');
const pdfRoot = path.resolve('output/pdf/m42-representative-packages');

const reportIndex = readJson(path.join(reportRoot, 'index.json'));
assert.equal(reportIndex.count, 10);
assert.ok(reportIndex.version.includes(LOAD_DERIVATION_TRACE_VERSION));
assert.ok(reportIndex.version.includes(SERVICEABILITY_DRIFT_VERSION));

const first = reportIndex.buildings[0];
assert.ok(first.derivationTraceRows > 0);
assert.ok(['OK', 'WARN', 'NG'].includes(first.serviceabilityStatus));
assert.equal(typeof first.maxDriftRatio, 'number');

const firstSummary = readJson(path.join(reportRoot, first.id, 'analysis-summary.json'));
assert.equal(firstSummary.loadDerivationTrace.version, LOAD_DERIVATION_TRACE_VERSION);
assert.equal(firstSummary.serviceability.version, SERVICEABILITY_DRIFT_VERSION);

const firstPackage = readJson(path.join(reportRoot, first.id, 'calculation-package.json'));
assert.equal(firstPackage.detailed.loadDerivation.derivationTrace.version, LOAD_DERIVATION_TRACE_VERSION);
assert.equal(firstPackage.detailed.serviceability.version, SERVICEABILITY_DRIFT_VERSION);

const pdfIndex = readJson(path.join(pdfRoot, 'index.json'));
assert.equal(pdfIndex.count, 11);
assert.match(pdfIndex.pdfGeneratedBy, /M50/);
for (const file of pdfIndex.files) {
  const pdfPath = path.resolve(file.pdf);
  assert.equal(existsSync(pdfPath), true, `missing PDF: ${pdfPath}`);
  assert.ok(statSync(pdfPath).size > 20_000, `PDF is unexpectedly small: ${pdfPath}`);
}

const pdfReadme = readFileSync(path.join(pdfRoot, 'README.md'), 'utf8');
assert.match(pdfReadme, /M50 Representative Calculation Package PDFs/);
assert.match(pdfReadme, /M48 load-derivation trace/);
assert.match(pdfReadme, /M49 serviceability drift/);

console.log(JSON.stringify({
  ok: true,
  reports: reportIndex.count,
  pdfs: pdfIndex.count,
  version: reportIndex.version,
}, null, 2));

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}
