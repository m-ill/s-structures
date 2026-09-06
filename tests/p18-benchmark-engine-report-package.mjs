import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vaultRoot = path.resolve(repoRoot, "..");
const caseRoot = path.join(vaultRoot, "testreport", "STRIX-21-검증");
const collectionRoot = path.join(caseRoot, "00_설득자료_모음");
const expectedIds = [
  "SB1", "SB2", "SB3", "SB5", "SB6", "SB7", "SB8", "SB9", "SB10", "SB12",
  "PD1", "SM5", "SM5b", "SM6", "SR1", "SR2", "SR2b", "P3S2", "SP1", "SH1", "TH1",
];

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function isFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

const folders = fs.readdirSync(caseRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

for (const [index, id] of expectedIds.entries()) {
  const prefix = `${String(index + 1).padStart(2, "0")}_${id}_`;
  const folder = folders.find((name) => name.startsWith(prefix));
  assert.ok(folder, `Missing case folder for ${id}`);
  const reportPath = path.join(caseRoot, folder, "07_해석엔진_설명", `${id}_해석엔진_설명보고서.md`);
  assert.ok(isFile(reportPath), `Missing engine report for ${id}`);
  const text = fs.readFileSync(reportPath, "utf8");
  for (const heading of [
    "## 3. 해석엔진에서 사용한 식",
    "## 4. S-Structures 모델링 방법",
    "## 5. 문제를 해결한 실행 절차",
    "## 6. 사용한 코드 모듈",
    "## 8. 근거와 한계",
  ]) {
    assert.ok(text.includes(heading), `${id} report missing section: ${heading}`);
  }
  assert.match(text, /`(?:src|verification)\//, `${id} report has no traceable module path`);
}

for (const id of ["XV1", "XV2"]) {
  const reportPath = path.join(collectionRoot, "02_추가_교차검증", `${id}_해석엔진_설명보고서.md`);
  assert.ok(isFile(reportPath), `Missing supplemental report for ${id}`);
}

const index = JSON.parse(fs.readFileSync(path.join(collectionRoot, "벤치마크_해석엔진_색인.json"), "utf8"));
assert.deepEqual(index.official21.map((row) => row.id), expectedIds, "Official report order must follow the 21 folder sequence");
assert.equal(index.official21.length, 21);
assert.equal(index.supplemental.length, 2);

const manifest = JSON.parse(fs.readFileSync(path.join(collectionRoot, "package-manifest.json"), "utf8"));
assert.equal(manifest.schemaVersion, "benchmark-engine-explanation-package-v2");
assert.equal(manifest.reportRevision, "R2_MODEL_GEOMETRY");
assert.deepEqual(manifest.counts, { officialReports: 21, supplementalReports: 2, finalPdfs: 2 });
for (const item of manifest.files) {
  const filePath = path.join(vaultRoot, ...item.path.split("/"));
  assert.ok(isFile(filePath), `Manifest file missing: ${item.path}`);
  assert.equal(fs.statSync(filePath).size, item.bytes, `Byte count mismatch: ${item.path}`);
  assert.equal(sha256(filePath), item.sha256, `SHA-256 mismatch: ${item.path}`);
}

console.log(JSON.stringify({
  ok: true,
  officialReports: expectedIds.length,
  supplementalReports: 2,
  manifestFiles: manifest.files.length,
}, null, 2));
