import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  CALCULATION_PACKAGE_VERSION,
  KDS_LOAD_STANDARD_REGISTRY_VERSION,
  MEMBER_DESIGN_TRACE_VERSION,
} from '../src/index.js';

const reportRoot = path.resolve('reports/representative-building-calculation-packages');
const pdfRoot = path.resolve('output/pdf/m42-representative-packages');

const reportIndex = readJson(path.join(reportRoot, 'index.json'));
assert.equal(reportIndex.count, 10);
assert.ok(reportIndex.version.includes(CALCULATION_PACKAGE_VERSION));
assert.ok(reportIndex.version.includes(KDS_LOAD_STANDARD_REGISTRY_VERSION));
assert.ok(reportIndex.version.includes(MEMBER_DESIGN_TRACE_VERSION));

const first = reportIndex.buildings[0];
assert.equal(first.traceRows > 0, true);
assert.equal(first.mappedLoadSymbols > 0, true);

const firstPackage = readJson(path.join(reportRoot, first.id, 'calculation-package.json'));
assert.equal(firstPackage.detailed.codeBasis.loadStandardAudit.version, KDS_LOAD_STANDARD_REGISTRY_VERSION);
assert.equal(firstPackage.detailed.memberDesignTrace.version, MEMBER_DESIGN_TRACE_VERSION);
assert.equal(firstPackage.detailed.memberDesignTrace.rows.length, first.traceRows);

const pdfIndex = readJson(path.join(pdfRoot, 'index.json'));
assert.equal(pdfIndex.count, 11);
assert.match(pdfIndex.pdfGeneratedBy, /M46/);
for (const file of pdfIndex.files) {
  const pdfPath = path.resolve(file.pdf);
  assert.equal(existsSync(pdfPath), true, `missing PDF: ${pdfPath}`);
  assert.ok(statSync(pdfPath).size > 20_000, `PDF is unexpectedly small: ${pdfPath}`);
}

const pdfReadme = readFileSync(path.join(pdfRoot, 'README.md'), 'utf8');
assert.match(pdfReadme, /M46 Representative Calculation Package PDFs/);
assert.match(pdfReadme, /M44 load-standard audit/);
assert.match(pdfReadme, /M45 member design trace/);

console.log(JSON.stringify({
  ok: true,
  reports: reportIndex.count,
  pdfs: pdfIndex.count,
  version: reportIndex.version,
}, null, 2));

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}
