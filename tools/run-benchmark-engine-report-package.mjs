import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generator = path.join(repoRoot, "tools", "generate-benchmark-engine-report-package.py");
const bundledPython = path.join(
  os.homedir(),
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "python",
  process.platform === "win32" ? "python.exe" : "bin/python",
);

const candidates = [
  process.env.SSTRUCTURES_REPORT_PYTHON ? [process.env.SSTRUCTURES_REPORT_PYTHON] : null,
  fs.existsSync(bundledPython) ? [bundledPython] : null,
  process.platform === "win32" ? ["py", "-3"] : ["python3"],
  ["python"],
].filter(Boolean);

let selected = null;
for (const candidate of candidates) {
  const probe = spawnSync(candidate[0], [...candidate.slice(1), "-c", "import reportlab, pypdf"], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (probe.status === 0) {
    selected = candidate;
    break;
  }
}

if (!selected) {
  console.error("[ERROR] PDF 생성용 Python을 찾지 못했습니다.");
  console.error("        reportlab과 pypdf가 설치된 Python 경로를 SSTRUCTURES_REPORT_PYTHON에 지정하세요.");
  process.exit(1);
}

const result = spawnSync(selected[0], [...selected.slice(1), generator], {
  cwd: repoRoot,
  stdio: "inherit",
  windowsHide: true,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
