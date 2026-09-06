#!/usr/bin/env python3
"""Render and verify the evidence-only P17-M1 framework qualification report.

The canonical M1 evidence document is the sole source of reported counts and
statuses. Before rendering, this program verifies the canonical evidenceHash,
every implementation file byte length and SHA-256 digest, the implementation
aggregate hash, and all predecessor file bindings. It never imports or invokes
the structural product, a solver, a benchmark runner, or comparison code.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import shutil
import sys
from pathlib import Path

import reportlab
from PIL import Image as PillowImage
from pypdf import PdfReader
import pypdf
import pypdfium2
import pypdfium2 as pdfium
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    Flowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


REPO = Path(__file__).resolve().parents[4]
EVIDENCE_PATH = REPO / "verification/evidence/validation/phase17/p17-m1-case-contract-shared-harness-r6.json"
FINAL_DIR = REPO / "output/verification/phase17"
WORK_DIR = REPO / "tmp/verification/phase17/p17-m1-report"
DRAFT_DIR = WORK_DIR / "draft"
RENDER_DIR = WORK_DIR / "rendered"
REPORT_STEM = "P17-M1-CASE-CONTRACT-SHARED-HARNESS-REPORT-R3"
QA_PATH = WORK_DIR / "P17-M1-REPORT-QA-R3.json"
PERMANENT_QA_PATH = FINAL_DIR / f"{REPORT_STEM}.qa-r3.json"
FONT_REGULAR = Path("C:/Windows/Fonts/malgun.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/malgunbd.ttf")

EXPECTED_VERSION = "p17-m1-case-contract-shared-harness-evidence-v6"
EXPECTED_STATUS = "CONTRACT_READY_NO_BENCHMARK_RUNS"

NAVY = colors.HexColor("#17324D")
DEEP_NAVY = colors.HexColor("#0E2338")
TEAL = colors.HexColor("#007C83")
GREEN = colors.HexColor("#22865A")
AMBER = colors.HexColor("#B86E00")
RED = colors.HexColor("#B13A3A")
BLUE_GREY = colors.HexColor("#526D82")
MID_GREY = colors.HexColor("#657786")
LIGHT_GREY = colors.HexColor("#F5F7F8")
LIGHT_BLUE = colors.HexColor("#EBF3F8")
LIGHT_TEAL = colors.HexColor("#E8F5F3")
LIGHT_AMBER = colors.HexColor("#FFF5D9")
LIGHT_RED = colors.HexColor("#FCECEC")
LINE = colors.HexColor("#C9D4DC")
WHITE = colors.white


SCHEMA_PURPOSES = {
    "canonical-input-schema.json": "도구 독립 모델 입력과 잠금 상태",
    "capture-index-schema.json": "Chrome 캡처 인덱스와 자기 해시",
    "case-evidence-schema.json": "사례 증거 체인과 최종 상태",
    "case-manifest-schema.json": "사례 단위 파일 및 실행 계약",
    "comparison-schema.json": "비교 결과와 허용오차 판정",
    "expected-values-schema.json": "참조 기대값 잠금 상태",
    "model-equivalence-schema.json": "정본 모델과 제품 모델 등가성",
    "probe-manifest-schema.json": "응답량 추출 위치와 부호 규약",
    "reference-manifest-schema.json": "출전 및 참조값 바인딩",
    "report-manifest-schema.json": "증거 전용 사례 보고서 계약",
    "review-signoff-schema.json": "독립 검토 역할과 승인 상태",
    "run-record-schema.json": "단일 실행 기록과 라우팅 증거",
    "source-manifest-schema.json": "원자료 custody와 해시 바인딩",
    "sstructures-input-schema.json": "S-Structures 제품 입력 봉투",
    "suite-manifest-schema.json": "21개 공식 및 custom suite 계약",
    "tolerance-manifest-schema.json": "절대 및 상대 허용오차 정책",
}

RESPONSIBILITY_DESCRIPTIONS = {
    "modelBuilder": "잠긴 정본 입력을 제품 입력으로 변환",
    "referenceRepository": "출전 및 기대값 잠금만 제공",
    "resultExtractor": "제품 결과를 data-only artifact로 추출 및 replay 검증",
    "productAdapter": "src/index.js 공개 API만 호출",
    "comparisonEvaluator": "제품 결과와 잠긴 참조값만 비교",
    "appendOnlyWriter": "실행 디렉터리 원자적 생성 및 무결성 체인",
    "isolatedRunner": "사례별 child process, timeout, 실패 격리",
    "evidenceReport": "불변 증거만 읽어 캡처 및 보고서 생성",
    "productPublicEntrypoint": "제품 공개 진입점",
}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def canonical_hash(value) -> str:
    return sha256_bytes(canonical_json(value).encode("utf-8"))


def relative(path: Path) -> str:
    return path.relative_to(REPO).as_posix()


def repository_file(repository_path: str) -> Path:
    if (
        not isinstance(repository_path, str)
        or not repository_path
        or "\\" in repository_path
        or repository_path.startswith("/")
        or ":" in repository_path.split("/")[0]
        or any(part in ("", ".", "..") for part in repository_path.split("/"))
    ):
        raise RuntimeError(f"Unsafe repository path in evidence: {repository_path!r}")
    candidate = (REPO / repository_path).resolve(strict=True)
    try:
        candidate.relative_to(REPO.resolve())
    except ValueError as exc:
        raise RuntimeError(f"Evidence path escapes the repository: {repository_path}") from exc
    if not candidate.is_file():
        raise RuntimeError(f"Evidence path is not a regular file: {repository_path}")
    return candidate


def verify_binding(label: str, binding: dict) -> dict:
    path = repository_file(binding["path"])
    actual_bytes = path.stat().st_size
    actual_sha = sha256_file(path)
    if binding["byteLength"] != actual_bytes:
        raise RuntimeError(
            f"{label} byteLength mismatch: evidence={binding['byteLength']} actual={actual_bytes}"
        )
    if binding["sha256"] != actual_sha:
        raise RuntimeError(
            f"{label} SHA-256 mismatch: evidence={binding['sha256']} actual={actual_sha}"
        )
    return {"path": binding["path"], "byteLength": actual_bytes, "sha256": actual_sha}


def verify_evidence(evidence: dict) -> dict:
    if evidence.get("version") != EXPECTED_VERSION:
        raise RuntimeError(f"Unexpected evidence version: {evidence.get('version')}")
    if evidence.get("status") != EXPECTED_STATUS:
        raise RuntimeError(f"Unexpected M1 status: {evidence.get('status')}")
    if evidence.get("evidencePath") != relative(EVIDENCE_PATH):
        raise RuntimeError("The evidence self path is not canonical.")

    core = {key: value for key, value in evidence.items() if key != "evidenceHash"}
    computed_evidence_hash = canonical_hash(core)
    if evidence.get("evidenceHash") != computed_evidence_hash:
        raise RuntimeError(
            "Canonical evidenceHash mismatch: "
            f"evidence={evidence.get('evidenceHash')} actual={computed_evidence_hash}"
        )

    inventory = evidence["frameworkInventory"]
    files = inventory["implementationFiles"]
    if inventory["implementationFileCount"] != len(files):
        raise RuntimeError("implementationFileCount does not equal the inventory length.")
    verified_files = [verify_binding(f"implementation[{index}]", item) for index, item in enumerate(files)]
    aggregate_hash = canonical_hash(verified_files)
    if aggregate_hash != inventory["implementationAggregateHash"]:
        raise RuntimeError(
            "Implementation aggregate hash mismatch: "
            f"evidence={inventory['implementationAggregateHash']} actual={aggregate_hash}"
        )

    schema_paths = inventory["runtimeManifestSchemas"]
    if inventory["runtimeManifestSchemaCount"] != len(schema_paths):
        raise RuntimeError("runtimeManifestSchemaCount does not equal the schema path count.")
    implementation_paths = {item["path"] for item in verified_files}
    missing_schema_bindings = [path for path in schema_paths if path not in implementation_paths]
    if missing_schema_bindings:
        raise RuntimeError(f"Runtime schemas missing from implementation inventory: {missing_schema_bindings}")

    predecessor_audit = {}
    for name, binding in evidence["predecessorBindings"].items():
        predecessor_audit[name] = verify_binding(f"predecessor.{name}", binding)
        if name == "m0R4Document":
            continue
        document = read_json(repository_file(binding["path"]))
        for nested_key in ("closureHash", "correctionHash", "registryHash"):
            if nested_key in binding and document.get(nested_key) != binding[nested_key]:
                raise RuntimeError(f"predecessor.{name}.{nested_key} binding mismatch.")

    counters = evidence["resultCounters"]
    nonzero = {name: value for name, value in counters.items() if value != 0}
    if nonzero:
        raise RuntimeError(f"M1 evidence unexpectedly contains engineering results: {nonzero}")
    if evidence.get("releaseAllowed") is not False or evidence.get("finalDesignTransferAllowed") is not False:
        raise RuntimeError("M1 evidence must remain fail-closed for release and final design transfer.")
    smoke = evidence["contractSmoke"]
    if smoke.get("benchmarkExecuted") is not False or smoke.get("solverExecuted") is not False:
        raise RuntimeError("M1 contract smoke must not execute a benchmark or solver.")
    if smoke["contractValidatedCount"] != smoke["processIsolatedCaseCount"]:
        raise RuntimeError("Not every isolated contract case was validated.")
    if smoke["officialCaseCount"] != inventory["officialCaseCount"]:
        raise RuntimeError("Official case count differs between inventory and contract smoke.")
    if smoke["customCaseCount"] != inventory["customCaseCount"]:
        raise RuntimeError("Custom case count differs between inventory and contract smoke.")
    if len(inventory["officialOrder"]) != inventory["officialCaseCount"]:
        raise RuntimeError("Official order length differs from official case count.")
    if len(inventory["customCaseIds"]) != inventory["customCaseCount"]:
        raise RuntimeError("Custom case ID length differs from custom case count.")

    terminal = evidence["terminalAuthorization"]
    if terminal.get("enabled") is not False:
        raise RuntimeError("P17-M1 terminal authorization must remain disabled.")
    if terminal.get("candidateStatusOnly") != "QUALIFICATION_CANDIDATE":
        raise RuntimeError("P17-M1 may emit QUALIFICATION_CANDIDATE only.")
    required_gates = terminal.get("requiredBeforeEnablement")
    if not isinstance(required_gates, list) or len(required_gates) != 8 or len(set(required_gates)) != 8:
        raise RuntimeError("P17-M2 terminal authorization must bind eight unique required gates.")
    checks = evidence["checks"]
    expected_gate_ids = [f"P17-M1-G{index:02d}" for index in range(1, 7)]
    if [item.get("id") for item in checks] != expected_gate_ids:
        raise RuntimeError("P17-M1 must contain the canonical six-gate sequence.")
    custody_policy = set(evidence["negativeTests"].get("appendOnlyCustodyPolicy", []))
    required_custody = {
        "LOCAL_FIXTURE_NOT_TERMINAL",
        "EXTERNAL_SIGNED_ANCHOR_REQUIRED",
        "NO_AUTOMATIC_TOMBSTONE_REUSE",
        "LOCAL_FS_NOT_WORM",
    }
    if not required_custody.issubset(custody_policy):
        raise RuntimeError("Append-only evidence omits one or more custody limitations.")
    if not evidence["negativeTests"].get("resultExtractorMutations"):
        raise RuntimeError("Data-only result extractor mutation coverage is missing.")

    return {
        "status": "PASS",
        "evidenceHash": computed_evidence_hash,
        "evidenceFileSha256": sha256_file(EVIDENCE_PATH),
        "implementationFileCount": len(verified_files),
        "implementationAggregateHash": aggregate_hash,
        "runtimeManifestSchemaCount": len(schema_paths),
        "predecessorBindingCount": len(predecessor_audit),
        "zeroResultCounterCount": len(counters),
        "m1GateCount": len(checks),
        "m2TerminalGateCount": len(required_gates),
        "terminalAuthorizationEnabled": False,
    }


def md_escape(value) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")


def short_hash(value: str, head: int = 12, tail: int = 8) -> str:
    return f"{value[:head]}...{value[-tail:]}"


def make_markdown(evidence: dict, audit: dict) -> str:
    inventory = evidence["frameworkInventory"]
    smoke = evidence["contractSmoke"]
    boundary = evidence["architectureBoundary"]
    debt = evidence["historicalReleaseDebt"]
    counters = evidence["resultCounters"]
    lines = [
        "# P17-M1 Case Contract & Shared Harness 검증 보고서",
        "",
        f"- 상태: `{evidence['status']}`",
        f"- 기준일: `{evidence['auditDate']}`",
        f"- canonical evidenceHash: `{evidence['evidenceHash']}`",
        f"- 구현 파일 해시 검증: `PASS_{audit['implementationFileCount']}_OF_{audit['implementationFileCount']}`",
        f"- Release: `{'ALLOWED' if evidence['releaseAllowed'] else 'BLOCKED'}`",
        f"- Final design transfer: `{'ALLOWED' if evidence['finalDesignTransferAllowed'] else 'BLOCKED'}`",
        "",
        "## 1. 결론",
        "",
        f"P17-M1은 {inventory['officialCaseCount']}개 공식 사례와 {inventory['customCaseCount']}개 custom 사례를 위한 공통 계약, 엄격한 manifest schema, data-only result extractor, process isolation, append-only 저장 및 증거 전용 보고서 경계를 구축했다. 이 마일스톤은 구조 모델이나 공학 결과의 정확도를 검증한 단계가 아니다.",
        "",
        f"검증된 범위: {evidence['claimBoundary']['proven']}",
        "",
        f"검증하지 않은 범위: {evidence['claimBoundary']['notProven']}",
        "",
        "## 2. 수치 경계 - 모든 공학 결과는 0",
        "",
        "| Counter | 값 |",
        "|---|---:|",
    ]
    for key, value in counters.items():
        lines.append(f"| `{key}` | {value} |")
    lines += [
        "",
        "실제 모델 화면, 해석 결과 화면, Chrome 캡처 및 사례별 결과 보고서는 하나도 생성하지 않았다. 따라서 이 보고서에는 가짜 screenshot이나 대체 이미지를 넣지 않았다.",
        "",
        "## 3. M0 R4 carry-forward",
        "",
        f"- 이전 잔여 상태: `{evidence['m0R4CarryForward']['priorStatus']}`",
        f"- M1 권위 레코드 상태: `{evidence['m0R4CarryForward']['m1AuthoritativeRecordStatus']}`",
        f"- schema definition: {evidence['m0R4CarryForward']['strictSchemaDefinitionCount']}개",
        f"- unknown keyword 정책: `{evidence['m0R4CarryForward']['unknownKeywordPolicy']}`",
        f"- 저장 artifact 독립 검증: `{evidence['m0R4CarryForward']['storedArtifactValidation']}`",
        f"- M0 R3 schema 변경 여부: `{evidence['m0R4CarryForward']['historicalM0R3SchemasModified']}`",
        "",
        "R4에서 M1로 이관된 schema debt는 M1 권위 레코드 범위에서 닫혔다. M0 R3 봉인 자료는 수정하지 않았다.",
        "",
        "## 4. Terminal authorization - M1에서는 비활성",
        "",
        f"- enabled: `{evidence['terminalAuthorization']['enabled']}`",
        f"- 상태: `{evidence['terminalAuthorization']['status']}`",
        f"- 허용 가능한 최상위 candidate 상태: `{evidence['terminalAuthorization']['candidateStatusOnly']}`",
        "",
        "M1은 terminal PASS를 승인하지 않는다. 일반 child process의 exit code 0은 미검증이며, canonical suite wrapper가 manifest contract를 모두 검증한 경우에만 CONTRACT_VALIDATED를 기록한다. CONTRACT_VALIDATED 역시 benchmark PASS가 아니다.",
        "",
        "## 5. 책임 분리 구조",
        "",
        "```text",
        f"case contract + {inventory['runtimeManifestSchemaCount']} strict schemas",
        "          |",
        "          +--> caseModelBuilder --> productAdapter --> appendOnlyRunStore",
        "          |                            ^ public src/index.js only",
        "          +--> referenceRepository --> resultExtractor --> comparisonEvaluator",
        "                                           |",
        "isolatedSuiteRunner [child process + timeout + continue]",
        "                                           |",
        "                                  evidenceReport",
        "                         [committed evidence only; no solver]",
        "```",
        "",
        "| 책임 | 경로 | 역할 |",
        "|---|---|---|",
    ]
    for key, path in evidence["responsibilitySeparation"].items():
        lines.append(f"| `{key}` | `{path}` | {RESPONSIBILITY_DESCRIPTIONS[key]} |")

    lines += [
        "",
        f"## 6. {inventory['runtimeManifestSchemaCount']}개 runtime manifest schema",
        "",
        "| # | Schema | 역할 |",
        "|---:|---|---|",
    ]
    for index, path in enumerate(inventory["runtimeManifestSchemas"], start=1):
        lines.append(f"| {index} | `{path}` | {SCHEMA_PURPOSES[Path(path).name]} |")

    lines += [
        "",
        f"## 7. 공식 {inventory['officialCaseCount']}개 + custom {inventory['customCaseCount']}개 contract matrix",
        "",
        "| # | 구분 | Case | 파일 | 격리 contract | 모델/해석 | Terminal PASS | Chrome/보고서 |",
        "|---:|---|---|---:|---|---|---:|---:|",
    ]
    for index, case_id in enumerate(inventory["officialOrder"], start=1):
        lines.append(
            f"| {index} | official | `{case_id}` | {inventory['requiredFilesPerCase']} | CONTRACT_VALIDATED | NOT_RUN | 0 | 0 |"
        )
    for offset, case_id in enumerate(inventory["customCaseIds"], start=1):
        lines.append(
            f"| C{offset} | custom | `{case_id}` | {inventory['requiredFilesPerCase']} | CONTRACT_VALIDATED | NOT_RUN | 0 | 0 |"
        )
    lines += [
        "",
        f"Scaffold는 {inventory['generatedScaffoldFileCount']}개 파일이고 aggregate hash는 `{inventory['scaffoldAggregateHash']}`다. 격리된 contract smoke는 {smoke['processIsolatedCaseCount']}개를 검증했으며 실패, timeout, spawn blocked는 모두 0이었다. 이 smoke는 solver를 호출하지 않았다.",
        "",
        f"## 8. Gate 결과 - {len(evidence['checks'])}개",
        "",
        "| Gate | 목적 | 상태 | resultHash |",
        "|---|---|---|---|",
    ]
    for check in evidence["checks"]:
        lines.append(
            f"| `{check['id']}` | {md_escape(check['purpose'])} | `{check['commandStatus']}` | `{check['resultHash']}` |"
        )

    lines += [
        "",
        "## 9. 실패 격리 및 negative test",
        "",
        "- 격리 순서: " + " -> ".join(f"`{item}`" for item in evidence["negativeTests"]["isolationSequence"]),
        "- entrypoint/environment 정책 차단: " + ", ".join(f"`{item}`" for item in evidence["negativeTests"]["isolationPolicyBlocks"]),
        "- append-only 변조 차단: " + ", ".join(f"`{item}`" for item in evidence["negativeTests"]["appendOnlyTamperClasses"]),
        "- append-only custody 한계: " + ", ".join(f"`{item}`" for item in evidence["negativeTests"]["appendOnlyCustodyPolicy"]),
        "- product adapter 정책 차단: " + ", ".join(f"`{item}`" for item in evidence["negativeTests"]["productPolicyBlocks"]),
        "- report binding 변조 차단: " + ", ".join(f"`{item}`" for item in evidence["negativeTests"]["reportTamperClasses"]),
        "- schema mutation: " + ", ".join(f"`{item}`" for item in evidence["negativeTests"]["schemaMutations"]),
        "- data-only result extractor mutation: " + ", ".join(f"`{item}`" for item in evidence["negativeTests"]["resultExtractorMutations"]),
        "",
        "실패와 timeout 뒤에도 후속 사례가 CONTRACT_VALIDATED가 되어 suite가 중단되지 않음을 증명했다. 경로 이탈, 예약 환경변수, undeclared artifact 및 link 계열 변조는 fail-closed다.",
        "",
        "## 10. Append-only 보안과 report 경계",
        "",
        "run store는 허용 root 내부의 새 run ID만 원자적으로 commit하고, 기존 run 덮어쓰기와 undeclared 파일, 디렉터리, symlink 또는 junction, content 변경을 거부한다. 다만 local fixture는 terminal evidence가 아니고, 외부 signed anchor가 필요하며, local filesystem의 read-only mode bit는 WORM을 보장하지 않는다. evidence report는 commit된 local evidence와 capture index만 읽으며 solver 또는 비교 계산을 호출하지 않는다.",
        "",
        "## 11. 아키텍처 경계와 공개 debt",
        "",
        "| 범위 | 수치 | 판정 |",
        "|---|---:|---|",
        f"| active Phase 17 product -> verification import | {boundary['activePhase17ProductToVerificationImports']} | PASS |",
        f"| active Phase 17 deep product import | {boundary['activePhase17DeepProductImports']} | PASS |",
        f"| active Phase 17 public product import | {boundary['activePhase17PublicProductImports']} | 의도된 공개 진입점 |",
        f"| active Phase 17 reference leakage | {boundary['activePhase17ReferenceLeakage']} | PASS |",
        f"| evidence report solver import | {boundary['evidenceReportSolverImports']} | PASS |",
        f"| active Phase 17 import cycle | {boundary['activePhase17ImportCycles']} | PASS |",
        f"| legacy verification product import | {debt['legacyVerificationProductImportCount']} | OPEN_RELEASE_DEBT |",
        f"| legacy verification deep import | {debt['legacyVerificationDeepProductImportCount']} | OPEN_RELEASE_DEBT |",
        f"| legacy deep import file | {debt['legacyVerificationDeepProductFileCount']} | OPEN_RELEASE_DEBT |",
        f"| generic production expected-value debt | {debt['genericProductionExpectedValueDebtCount']} | OPEN_RELEASE_DEBT |",
        "",
        f"경계 주장의 정확한 범위: {boundary['claimScope']}",
        "",
        f"active Phase 17 범위의 0을 전체 코드베이스의 0으로 확대 해석하면 안 된다. legacy deep import {debt['legacyVerificationDeepProductImportCount']}건/{debt['legacyVerificationDeepProductFileCount']}파일과 generic production debt {debt['genericProductionExpectedValueDebtCount']}건은 release debt로 남아 있다.",
        "",
        "## 12. 코드 리뷰 결론과 M2 진입 조건",
        "",
        "M1 runtime은 model build, reference access, data-only result extraction, product call, comparison, append-only persistence, process isolation, evidence/report를 서로 다른 모듈로 분리했다. 공개 제품 진입점은 `src/index.js` 하나다. M2에서는 아래 8개 terminal-authorization gate를 모두 구현하고 시험하기 전에는 SB1도 QUALIFICATION_CANDIDATE를 넘어설 수 없다.",
        "",
        f"- 다음 milestone: `{evidence['nextMilestone']['id']}`",
        f"- 첫 사례: `{evidence['nextMilestone']['caseId']}`",
        f"- 진입 조건: {evidence['nextMilestone']['entryCondition']}",
        "",
        "### M2 terminal-authorization 필수 gate 8개",
        "",
    ]
    lines += [f"{index}. `{gate}`" for index, gate in enumerate(evidence["terminalAuthorization"]["requiredBeforeEnablement"], start=1)]
    lines += [
        "",
        "Release와 final design transfer는 계속 차단된다. 독립 검토 승인, STRIX 원시 기록 archive, legacy import debt 및 generic expected-value debt가 남아 있다.",
        "",
        "## 13. 재현 명령",
        "",
        "```powershell",
        "npm.cmd run check:p17:m1:scaffold",
        "npm.cmd run test:p17:m1:validator",
        "npm.cmd run test:p17:m1",
        "npm.cmd run check:p17:m1:boundaries",
        "npm.cmd run evidence:p17:m1",
        "node tools/render-p17-m1-report.mjs",
        "node tools/render-p17-m1-report.mjs --final",
        "node tools/render-p17-m1-report.mjs --verify-final",
        "```",
        "",
        "보고서 렌더러는 evidence와 파일 해시만 검증하고 structural product, solver, benchmark 또는 comparison을 실행하지 않는다.",
        "",
        "## 14. Reason codes",
        "",
    ]
    lines += [f"- `{code}`" for code in evidence["reasonCodes"]]
    lines += [
        "",
        "## 15. Artifact inventory와 hash",
        "",
        "### 15.1 Canonical evidence 및 predecessor",
        "",
        f"- evidence: `{evidence['evidencePath']}`",
        f"- evidenceHash: `{evidence['evidenceHash']}`",
        f"- evidence file SHA-256: `{audit['evidenceFileSha256']}`",
        f"- implementationAggregateHash: `{inventory['implementationAggregateHash']}`",
        "",
        "| Binding | Path | Bytes | SHA-256 |",
        "|---|---|---:|---|",
    ]
    for name, binding in evidence["predecessorBindings"].items():
        lines.append(f"| `{name}` | `{binding['path']}` | {binding['byteLength']} | `{binding['sha256']}` |")
    lines += [
        "",
        "### 15.2 Implementation files - 전 항목 렌더 전 재검증",
        "",
        "| # | Path | Bytes | SHA-256 |",
        "|---:|---|---:|---|",
    ]
    for index, item in enumerate(inventory["implementationFiles"], start=1):
        lines.append(f"| {index} | `{item['path']}` | {item['byteLength']} | `{item['sha256']}` |")
    lines += [
        "",
        "## 16. 최종 판정",
        "",
        f"`{evidence['status']}`",
        "",
        "P17-M1 framework는 M2 구현 gate 작업을 시작할 수 있는 계약 상태다. terminal PASS authorization은 비활성이고 최상위 허용 상태는 QUALIFICATION_CANDIDATE다. benchmark PASS, 구조 성능, MIDAS/STRIX 수치 일치, release 또는 설계 적용 가능성을 의미하지 않는다.",
    ]
    return "\n".join(lines) + "\n"


def register_fonts():
    if not FONT_REGULAR.exists() or not FONT_BOLD.exists():
        raise RuntimeError("Malgun Gothic fonts are required at C:/Windows/Fonts.")
    if "Malgun" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("Malgun", str(FONT_REGULAR)))
    if "MalgunBold" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("MalgunBold", str(FONT_BOLD)))


def styles():
    register_fonts()
    sample = getSampleStyleSheet()
    return {
        "cover_kicker": ParagraphStyle(
            "cover_kicker", parent=sample["Normal"], fontName="MalgunBold", fontSize=10,
            leading=14, textColor=TEAL, alignment=TA_LEFT, spaceAfter=5 * mm,
        ),
        "cover_title": ParagraphStyle(
            "cover_title", parent=sample["Title"], fontName="MalgunBold", fontSize=25,
            leading=34, textColor=NAVY, alignment=TA_LEFT, spaceAfter=7 * mm,
        ),
        "cover_subtitle": ParagraphStyle(
            "cover_subtitle", parent=sample["Normal"], fontName="Malgun", fontSize=11,
            leading=18, textColor=BLUE_GREY, alignment=TA_LEFT,
        ),
        "cover_status": ParagraphStyle(
            "cover_status", parent=sample["Normal"], fontName="MalgunBold", fontSize=10,
            leading=14, textColor=NAVY, alignment=TA_CENTER,
        ),
        "h1": ParagraphStyle(
            "h1", parent=sample["Heading1"], fontName="MalgunBold", fontSize=16,
            leading=22, textColor=NAVY, spaceBefore=2 * mm, spaceAfter=4 * mm,
            keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "h2", parent=sample["Heading2"], fontName="MalgunBold", fontSize=11,
            leading=16, textColor=TEAL, spaceBefore=2 * mm, spaceAfter=2 * mm,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "body", parent=sample["BodyText"], fontName="Malgun", fontSize=9.2,
            leading=15, textColor=DEEP_NAVY, spaceAfter=2.5 * mm, wordWrap="CJK",
        ),
        "small": ParagraphStyle(
            "small", parent=sample["BodyText"], fontName="Malgun", fontSize=7.5,
            leading=11, textColor=DEEP_NAVY, wordWrap="CJK",
        ),
        "tiny": ParagraphStyle(
            "tiny", parent=sample["BodyText"], fontName="Malgun", fontSize=6.2,
            leading=8.5, textColor=DEEP_NAVY, wordWrap="CJK",
        ),
        "table_header": ParagraphStyle(
            "table_header", parent=sample["BodyText"], fontName="MalgunBold", fontSize=7.1,
            leading=9.5, textColor=WHITE, alignment=TA_CENTER, wordWrap="CJK",
        ),
        "table": ParagraphStyle(
            "table", parent=sample["BodyText"], fontName="Malgun", fontSize=6.8,
            leading=9.2, textColor=DEEP_NAVY, wordWrap="CJK",
        ),
        "table_center": ParagraphStyle(
            "table_center", parent=sample["BodyText"], fontName="Malgun", fontSize=6.8,
            leading=9.2, textColor=DEEP_NAVY, alignment=TA_CENTER, wordWrap="CJK",
        ),
        "mono": ParagraphStyle(
            "mono", parent=sample["Code"], fontName="Courier", fontSize=6.7,
            leading=9.5, textColor=DEEP_NAVY, backColor=LIGHT_GREY,
            borderColor=LINE, borderWidth=0.5, borderPadding=5, spaceAfter=2 * mm,
        ),
        "hash": ParagraphStyle(
            "hash", parent=sample["Code"], fontName="Courier", fontSize=5.5,
            leading=7.2, textColor=DEEP_NAVY, wordWrap="CJK",
        ),
        "callout": ParagraphStyle(
            "callout", parent=sample["BodyText"], fontName="MalgunBold", fontSize=9,
            leading=14, textColor=NAVY, wordWrap="CJK",
        ),
        "caption": ParagraphStyle(
            "caption", parent=sample["BodyText"], fontName="Malgun", fontSize=7,
            leading=10, textColor=MID_GREY, alignment=TA_CENTER,
        ),
    }


def escaped(value) -> str:
    return html.escape(str(value)).replace("\n", "<br/>")


def para(value, style):
    return Paragraph(escaped(value), style)


def rich(value, style):
    return Paragraph(value, style)


def report_table(rows, widths, extra=None, repeat_rows=1, font_size=7):
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3.5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3.5),
        ("TOPPADDING", (0, 0), (-1, -1), 3.2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GREY]),
        ("FONTNAME", (0, 0), (-1, -1), "Malgun"),
        ("FONTSIZE", (0, 0), (-1, -1), font_size),
    ]
    if extra:
        commands.extend(extra)
    result = Table(rows, colWidths=widths, repeatRows=repeat_rows, hAlign="LEFT", splitByRow=1)
    result.setStyle(TableStyle(commands))
    return result


class StableCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        kwargs["invariant"] = 1
        kwargs["pageCompression"] = 1
        super().__init__(*args, **kwargs)


class ModuleDiagram(Flowable):
    """Compact, deterministic responsibility-flow diagram."""

    def __init__(self, official_count: int, custom_count: int, schema_count: int):
        super().__init__()
        self.width = 157 * mm
        self.height = 82 * mm
        self.official_count = official_count
        self.custom_count = custom_count
        self.schema_count = schema_count

    def draw(self):
        canv = self.canv
        canv.saveState()
        canv.setStrokeColor(LINE)
        canv.setLineWidth(0.7)
        canv.setFillColor(colors.white)
        canv.roundRect(0, 0, self.width, self.height, 3 * mm, fill=1, stroke=1)
        canv.setFillColor(LIGHT_BLUE)
        canv.roundRect(5 * mm, 64 * mm, 147 * mm, 12 * mm, 2 * mm, fill=1, stroke=0)
        canv.setFillColor(NAVY)
        canv.setFont("MalgunBold", 8.5)
        canv.drawCentredString(self.width / 2, 70.5 * mm, f"Case contract + {self.schema_count} strict runtime schemas")
        canv.setFont("Malgun", 6.5)
        canv.drawCentredString(
            self.width / 2,
            66.8 * mm,
            f"official {self.official_count} + custom {self.custom_count} / no expected values or solver result in M1",
        )

        nodes = [
            (5, 45, 45, 13, "caseModelBuilder", "model lock boundary", LIGHT_TEAL),
            (56, 45, 45, 13, "productAdapter", "public src/index.js only", LIGHT_TEAL),
            (107, 45, 45, 13, "appendOnlyRunStore", "local fixture / not WORM", LIGHT_TEAL),
            (5, 25, 45, 13, "referenceRepository", "reference lock only", LIGHT_AMBER),
            (56, 25, 45, 13, "resultExtractor", "data-only + replay", LIGHT_AMBER),
            (107, 25, 45, 13, "comparisonEvaluator", "locked inputs only", LIGHT_AMBER),
            (107, 6, 45, 13, "evidenceReport", "committed data / no solver", LIGHT_BLUE),
        ]
        for x, y, w, h, title, subtitle, fill in nodes:
            canv.setFillColor(fill)
            canv.setStrokeColor(LINE)
            canv.roundRect(x * mm, y * mm, w * mm, h * mm, 1.5 * mm, fill=1, stroke=1)
            canv.setFillColor(NAVY)
            canv.setFont("MalgunBold", 6.8)
            canv.drawCentredString((x + w / 2) * mm, (y + 7.5) * mm, title)
            canv.setFillColor(MID_GREY)
            canv.setFont("Malgun", 5.6)
            canv.drawCentredString((x + w / 2) * mm, (y + 3.4) * mm, subtitle)

        canv.setStrokeColor(TEAL)
        canv.setFillColor(TEAL)
        self._arrow(50 * mm, 51.5 * mm, 56 * mm, 51.5 * mm)
        self._arrow(101 * mm, 51.5 * mm, 107 * mm, 51.5 * mm)
        canv.setStrokeColor(AMBER)
        canv.setFillColor(AMBER)
        self._arrow(50 * mm, 31.5 * mm, 56 * mm, 31.5 * mm)
        self._arrow(101 * mm, 31.5 * mm, 107 * mm, 31.5 * mm)
        self._down_arrow(129.5 * mm, 25 * mm, 129.5 * mm, 19 * mm)

        canv.setFillColor(DEEP_NAVY)
        canv.setFont("MalgunBold", 6.2)
        canv.drawString(5 * mm, 13 * mm, "isolatedSuiteRunner")
        canv.setFont("Malgun", 5.8)
        canv.drawString(5 * mm, 9 * mm, "canonical wrapper + timeout + failure continuation")
        canv.drawString(5 * mm, 5.5 * mm, "arbitrary exit 0 remains unqualified")
        canv.restoreState()

    def _arrow(self, x1, y1, x2, y2):
        canv = self.canv
        canv.setLineWidth(1.1)
        canv.line(x1, y1, x2, y2)
        canv.line(x2, y2, x2 - 2.2 * mm, y2 + 1.3 * mm)
        canv.line(x2, y2, x2 - 2.2 * mm, y2 - 1.3 * mm)

    def _down_arrow(self, x1, y1, x2, y2):
        canv = self.canv
        canv.setLineWidth(1.1)
        canv.line(x1, y1, x2, y2)
        canv.line(x2, y2, x2 - 1.3 * mm, y2 + 2.2 * mm)
        canv.line(x2, y2, x2 + 1.3 * mm, y2 + 2.2 * mm)


def footer(canv, doc):
    canv.saveState()
    width, height = A4
    canv.setStrokeColor(LINE)
    canv.setLineWidth(0.5)
    canv.line(20 * mm, 14 * mm, width - 20 * mm, 14 * mm)
    canv.setFont("Malgun", 6.6)
    canv.setFillColor(MID_GREY)
    canv.drawString(20 * mm, 9.5 * mm, "S-Structures / P17-M1 / Evidence-only framework qualification")
    canv.drawRightString(width - 20 * mm, 9.5 * mm, f"Page {doc.page}")
    if doc.page > 1:
        canv.setFont("MalgunBold", 6.5)
        canv.setFillColor(BLUE_GREY)
        canv.drawString(20 * mm, height - 12.5 * mm, "P17-M1 Case Contract & Shared Harness 검증 보고서")
        canv.setFillColor(RED)
        canv.drawRightString(width - 20 * mm, height - 12.5 * mm, "NO BENCHMARK RUNS / RELEASE BLOCKED")
    canv.restoreState()


def status_card(label, value, background, sty):
    return report_table(
        [[rich(label, sty["table_header"])], [para(value, sty["cover_status"])]],
        [49.5 * mm],
        extra=[
            ("BACKGROUND", (0, 0), (0, 0), NAVY),
            ("BACKGROUND", (0, 1), (0, 1), background),
            ("TOPPADDING", (0, 1), (0, 1), 7),
            ("BOTTOMPADDING", (0, 1), (0, 1), 7),
        ],
    )


def build_pdf(pdf_path: Path, evidence: dict, audit: dict):
    sty = styles()
    inventory = evidence["frameworkInventory"]
    smoke = evidence["contractSmoke"]
    boundary = evidence["architectureBoundary"]
    debt = evidence["historicalReleaseDebt"]
    counters = evidence["resultCounters"]

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=21 * mm,
        bottomMargin=19 * mm,
        title="P17-M1 Case Contract & Shared Harness 검증 보고서",
        author="S-Structures Phase 17 Verification",
        subject="Evidence-only framework qualification; no benchmark or solver runs",
    )
    story = [
        Spacer(1, 13 * mm),
        para("S-STRUCTURES / PHASE 17", sty["cover_kicker"]),
        rich("P17-M1 Case Contract &amp;<br/>Shared Harness 검증 보고서", sty["cover_title"]),
        para(f"{inventory['officialCaseCount']}개 공식 사례 + custom {inventory['customCaseCount']}개를 위한 프로덕션 수준 검증 계약과 공통 실행 기반", sty["cover_subtitle"]),
        Spacer(1, 10 * mm),
        report_table(
            [[
                status_card("MILESTONE STATUS", evidence["status"], LIGHT_TEAL, sty),
                status_card("BENCHMARK / SOLVER", f"{counters['benchmarkExecutionCount']} / {counters['solverExecutionCount']}", LIGHT_BLUE, sty),
                status_card("RELEASE", "BLOCKED", LIGHT_RED, sty),
            ]],
            [52.3 * mm, 52.3 * mm, 52.4 * mm],
            repeat_rows=0,
            extra=[
                ("GRID", (0, 0), (-1, -1), 0, colors.white),
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 1.5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 1.5),
            ],
        ),
        Spacer(1, 11 * mm),
        report_table(
            [
                [para("Contract surface", sty["table_header"]), para("Artifact integrity", sty["table_header"]), para("Engineering evidence", sty["table_header"])],
                [para(f"official {inventory['officialCaseCount']} + custom {inventory['customCaseCount']}\n{inventory['runtimeManifestSchemaCount']} strict schemas", sty["cover_status"]),
                 para(f"{audit['implementationFileCount']}/{audit['implementationFileCount']} file hash PASS\nevidenceHash PASS", sty["cover_status"]),
                 para("model 0 / result 0\nChrome capture 0", sty["cover_status"])],
            ],
            [52.3 * mm, 52.3 * mm, 52.4 * mm],
            extra=[
                ("BACKGROUND", (0, 1), (-1, 1), LIGHT_GREY),
                ("TOPPADDING", (0, 1), (-1, 1), 8),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 8),
            ],
        ),
        Spacer(1, 12 * mm),
        para("판정 경계", sty["h2"]),
        para(evidence["claimBoundary"]["proven"], sty["body"]),
        para(evidence["claimBoundary"]["notProven"], sty["body"]),
        Spacer(1, 5 * mm),
        para(f"기준일 {evidence['auditDate']}  |  evidenceHash {short_hash(evidence['evidenceHash'])}", sty["small"]),
        PageBreak(),

        para("1. 경영진 요약", sty["h1"]),
        para(f"P17-M1은 사례별 수치 검증에 들어가기 전에 필요한 계약과 안전 경계를 완성했다. {inventory['officialCaseCount']}개 공식 사례와 {inventory['customCaseCount']}개 custom 사례가 동일한 {inventory['requiredFilesPerCase']}개 파일 계약을 사용하고, {inventory['runtimeManifestSchemaCount']}개 runtime manifest schema가 입력, 참조, 실행, 추출, 비교, 캡처, 증거 및 검토 상태를 엄격하게 제한한다.", sty["body"]),
        para("이 단계에서 실행한 것은 contract smoke와 negative test뿐이다. 구조 모델 생성, 제품 solver 실행, 기대값 비교, MIDAS/STRIX 교차검증 및 성능 측정은 수행하지 않았다. M1 terminal authorization은 비활성이고 최상위 허용 상태는 QUALIFICATION_CANDIDATE다. 따라서 benchmark PASS는 0이며 release와 final design transfer는 차단 상태다.", sty["body"]),
        report_table(
            [
                [para("항목", sty["table_header"]), para("M1 증거", sty["table_header"]), para("판정", sty["table_header"])],
                [para("공식 / custom 사례", sty["table"]), para(f"{inventory['officialCaseCount']} / {inventory['customCaseCount']}", sty["table_center"]), para("CONTRACT READY", sty["table_center"])],
                [para("Scaffold 파일", sty["table"]), para(str(inventory["generatedScaffoldFileCount"]), sty["table_center"]), para("UNCHANGED / RESULT-FREE", sty["table_center"])],
                [para("Runtime schema", sty["table"]), para(str(inventory["runtimeManifestSchemaCount"]), sty["table_center"]), para("STRICT + FAIL-CLOSED", sty["table_center"])],
                [para("Process-isolated contract", sty["table"]), para(f"{smoke['contractValidatedCount']}/{smoke['processIsolatedCaseCount']}", sty["table_center"]), para("PASS", sty["table_center"])],
                [para("Benchmark / solver", sty["table"]), para(f"{counters['benchmarkExecutionCount']} / {counters['solverExecutionCount']}", sty["table_center"]), para("NOT RUN", sty["table_center"])],
                [para("Official PASS / Chrome capture", sty["table"]), para(f"{counters['officialPassCount']} / {counters['chromeCaptureCount']}", sty["table_center"]), para("NO CLAIM", sty["table_center"])],
                [para("Terminal authorization", sty["table"]), para(str(evidence["terminalAuthorization"]["enabled"]), sty["table_center"]), para("CANDIDATE ONLY", sty["table_center"])],
            ],
            [62 * mm, 42 * mm, 53 * mm],
        ),
        Spacer(1, 5 * mm),
        report_table(
            [[para("중요", sty["table_header"])], [para("실제 모델, 해석 결과 및 Chrome 결과 화면은 0개다. 이 보고서에는 가짜 screenshot이나 결과 대체 이미지를 넣지 않았다.", sty["callout"])]],
            [157 * mm],
            extra=[("BACKGROUND", (0, 1), (0, 1), LIGHT_AMBER), ("BOX", (0, 0), (-1, -1), 0.8, AMBER)],
        ),
        Spacer(1, 5 * mm),
        para("Gate 결과", sty["h2"]),
    ]

    gate_rows = [[para("Gate", sty["table_header"]), para("목적", sty["table_header"]), para("상태", sty["table_header"]), para("resultHash", sty["table_header"])]]
    for check in evidence["checks"]:
        gate_rows.append([
            para(check["id"], sty["table_center"]),
            para(check["purpose"], sty["table"]),
            para(check["commandStatus"], sty["table_center"]),
            para(short_hash(check["resultHash"], 10, 6), sty["hash"]),
        ])
    story += [report_table(gate_rows, [25 * mm, 77 * mm, 20 * mm, 35 * mm]), PageBreak()]

    story += [
        para("2. 책임 분리형 공통 harness", sty["h1"]),
        para("사례 모델, 참조값, 제품 실행, 비교, 저장 및 보고를 서로 다른 모듈로 분리했다. report 경로는 solver를 import하지 않으며, 제품 호출은 공개 src/index.js 하나로 제한한다.", sty["body"]),
        ModuleDiagram(
            inventory["officialCaseCount"],
            inventory["customCaseCount"],
            inventory["runtimeManifestSchemaCount"],
        ),
        Spacer(1, 5 * mm),
    ]
    responsibility_rows = [[para("책임", sty["table_header"]), para("모듈", sty["table_header"]), para("역할", sty["table_header"])]]
    for key, path in evidence["responsibilitySeparation"].items():
        responsibility_rows.append([
            para(key, sty["table"]), para(path, sty["tiny"]), para(RESPONSIBILITY_DESCRIPTIONS[key], sty["table"]),
        ])
    story += [report_table(responsibility_rows, [38 * mm, 68 * mm, 51 * mm]), Spacer(1, 5 * mm)]
    story += [
        report_table(
            [
                [para("Active Phase 17 boundary", sty["table_header"]), para("측정", sty["table_header"]), para("해석", sty["table_header"])],
                [para("deep product import", sty["table"]), para(str(boundary["activePhase17DeepProductImports"]), sty["table_center"]), para("공개 진입점 외 deep import 없음", sty["table"])],
                [para("reference leakage", sty["table"]), para(str(boundary["activePhase17ReferenceLeakage"]), sty["table_center"]), para("제품 코드로 benchmark 참조값 유출 없음", sty["table"])],
                [para("report solver import", sty["table"]), para(str(boundary["evidenceReportSolverImports"]), sty["table_center"]), para("보고서가 해석을 재실행하지 않음", sty["table"])],
                [para("import cycle", sty["table"]), para(str(boundary["activePhase17ImportCycles"]), sty["table_center"]), para("M1 runtime 순환 참조 없음", sty["table"])],
            ],
            [53 * mm, 24 * mm, 80 * mm],
        ),
        PageBreak(),

        para(f"3. {inventory['runtimeManifestSchemaCount']}개 runtime manifest schema", sty["h1"]),
        para("M0 R4에서 이관된 schema debt는 M1 권위 레코드 범위에서 닫혔다. unknown keyword는 fail-closed이며 nested deletion, 추가 속성, oneOf ambiguity, local $ref, date-time 및 NaN mutation을 거부한다.", sty["body"]),
    ]
    schema_rows = [[para("#", sty["table_header"]), para("Schema", sty["table_header"]), para("계약 역할", sty["table_header"])]]
    for index, path in enumerate(inventory["runtimeManifestSchemas"], start=1):
        schema_rows.append([
            para(str(index), sty["table_center"]), para(path, sty["tiny"]), para(SCHEMA_PURPOSES[Path(path).name], sty["table"]),
        ])
    story += [
        report_table(schema_rows, [10 * mm, 92 * mm, 55 * mm]),
        Spacer(1, 5 * mm),
        report_table(
            [
                [para("R4 carry-forward", sty["table_header"]), para("M1 판정", sty["table_header"])],
                [para(evidence["m0R4CarryForward"]["priorStatus"], sty["table"]), para(evidence["m0R4CarryForward"]["m1AuthoritativeRecordStatus"], sty["table"])],
                [para("M0 R3 schema", sty["table"]), para("UNMODIFIED", sty["table_center"])],
                [para("Stored artifact validation", sty["table"]), para(evidence["m0R4CarryForward"]["storedArtifactValidation"], sty["table_center"])],
            ],
            [78.5 * mm, 78.5 * mm],
        ),
        PageBreak(),

        para("4. 공식 21개 + custom 1개 contract matrix", sty["h1"]),
        para("아래의 CONTRACT_VALIDATED는 canonical suite wrapper가 폴더와 manifest 계약을 별도 process에서 검증했다는 뜻이다. 일반 child process의 exit code 0은 미검증으로 남는다. CONTRACT_VALIDATED는 모델링 완료, solver 성공 또는 benchmark PASS를 뜻하지 않으며 M1은 terminal PASS를 승인하지 않는다.", sty["body"]),
    ]
    case_rows = [[
        para("#", sty["table_header"]), para("구분", sty["table_header"]), para("Case", sty["table_header"]),
        para("파일", sty["table_header"]), para("격리 contract", sty["table_header"]), para("모델/해석", sty["table_header"]),
        para("Terminal PASS", sty["table_header"]), para("Chrome/Report", sty["table_header"]),
    ]]
    for index, case_id in enumerate(inventory["officialOrder"], start=1):
        case_rows.append([
            para(str(index), sty["table_center"]), para("official", sty["table_center"]), para(case_id, sty["table_center"]),
            para(str(inventory["requiredFilesPerCase"]), sty["table_center"]), para("CONTRACT VALIDATED", sty["tiny"]),
            para("NOT RUN", sty["table_center"]), para("0", sty["table_center"]), para("0 / 0", sty["table_center"]),
        ])
    for index, case_id in enumerate(inventory["customCaseIds"], start=1):
        case_rows.append([
            para(f"C{index}", sty["table_center"]), para("custom", sty["table_center"]), para(case_id, sty["table_center"]),
            para(str(inventory["requiredFilesPerCase"]), sty["table_center"]), para("CONTRACT VALIDATED", sty["tiny"]),
            para("NOT RUN", sty["table_center"]), para("0", sty["table_center"]), para("0 / 0", sty["table_center"]),
        ])
    story += [
        report_table(case_rows, [8 * mm, 15 * mm, 17 * mm, 13 * mm, 30 * mm, 22 * mm, 24 * mm, 28 * mm], font_size=6.2),
        Spacer(1, 4 * mm),
        para(f"Scaffold aggregate: {inventory['generatedScaffoldFileCount']} files / {short_hash(inventory['scaffoldAggregateHash'])}", sty["small"]),
        PageBreak(),

        para("5. Process isolation과 negative tests", sty["h1"]),
        para("성공, 실패, 성공, timeout, 성공을 한 sequence에서 실행해 실패 또는 timeout 이후에도 다음 사례가 계속되는지 검증했다. entrypoint 경로 이탈과 예약 policy 환경변수 덮어쓰기는 child process 시작 전에 차단된다.", sty["body"]),
    ]
    sequence = evidence["negativeTests"]["isolationSequence"]
    story += [
        report_table(
            [[para(f"Step {i + 1}", sty["table_header"]) for i in range(len(sequence))],
             [para(item, sty["table_center"]) for item in sequence]],
            [31.4 * mm] * len(sequence),
            extra=[
                ("BACKGROUND", (0, 1), (0, 1), LIGHT_TEAL),
                ("BACKGROUND", (1, 1), (1, 1), LIGHT_RED),
                ("BACKGROUND", (2, 1), (2, 1), LIGHT_TEAL),
                ("BACKGROUND", (3, 1), (3, 1), LIGHT_AMBER),
                ("BACKGROUND", (4, 1), (4, 1), LIGHT_TEAL),
            ],
        ),
        Spacer(1, 5 * mm),
    ]
    negative_rows = [[para("경계", sty["table_header"]), para("차단 또는 mutation class", sty["table_header"]), para("의미", sty["table_header"])]]
    negative_groups = [
        ("Isolation policy", evidence["negativeTests"]["isolationPolicyBlocks"], "path/env policy fail-closed"),
        ("Append-only", evidence["negativeTests"]["appendOnlyTamperClasses"], "content/inventory/link tamper 거부"),
        ("Custody limits", evidence["negativeTests"]["appendOnlyCustodyPolicy"], "local fixture / external anchor / not WORM"),
        ("Product adapter", evidence["negativeTests"]["productPolicyBlocks"], "version/reference/fallback/runtime 차단"),
        ("Result extractor", evidence["negativeTests"]["resultExtractorMutations"], "data-only artifact와 replay 경계"),
        ("Report binding", evidence["negativeTests"]["reportTamperClasses"], "evidence/capture hash 바인딩 검증"),
        ("Schema", evidence["negativeTests"]["schemaMutations"], "nested 및 type mutation 거부"),
    ]
    for label, values, meaning in negative_groups:
        negative_rows.append([para(label, sty["table"]), para(", ".join(values), sty["tiny"]), para(meaning, sty["table"])])
    story += [
        report_table(negative_rows, [33 * mm, 79 * mm, 45 * mm]),
        Spacer(1, 6 * mm),
        para("Append-only security", sty["h2"]),
        para("허용 root 안의 새 run ID만 stage 후 atomic rename으로 commit한다. 기존 run ID 덮어쓰기, path escape, undeclared file/directory, symlink 또는 junction, content hash 변경을 거부한다. 그러나 local fixture는 terminal evidence가 아니며 external signed anchor가 필요하다. local filesystem read-only mode bit는 WORM custody를 보장하지 않는다. report는 commit된 evidence chain만 읽고 공학 계산을 재실행하지 않는다.", sty["body"]),
        PageBreak(),

        para("6. 코드 경계와 공개 release debt", sty["h1"]),
        para("Active Phase 17 runtime의 0건 판정을 전체 verification 코드베이스로 확대해서는 안 된다. 기존 verification과 generic production example에는 별도 release debt가 남아 있다.", sty["body"]),
    ]
    boundary_rows = [
        [para("측정 범위", sty["table_header"]), para("수치", sty["table_header"]), para("상태", sty["table_header"]), para("판정 범위", sty["table_header"])],
        [para("active P17 product -> verification", sty["table"]), para(str(boundary["activePhase17ProductToVerificationImports"]), sty["table_center"]), para("PASS", sty["table_center"]), para("canonical P17 runtime", sty["table"])],
        [para("active P17 deep product imports", sty["table"]), para(str(boundary["activePhase17DeepProductImports"]), sty["table_center"]), para("PASS", sty["table_center"]), para("canonical P17 runtime", sty["table"])],
        [para("active P17 public product imports", sty["table"]), para(str(boundary["activePhase17PublicProductImports"]), sty["table_center"]), para("INTENDED", sty["table_center"]), para("src/index.js", sty["table"])],
        [para("active P17 reference leakage", sty["table"]), para(str(boundary["activePhase17ReferenceLeakage"]), sty["table_center"]), para("PASS", sty["table_center"]), para("canonical P17 runtime", sty["table"])],
        [para("active P17 report solver imports", sty["table"]), para(str(boundary["evidenceReportSolverImports"]), sty["table_center"]), para("PASS", sty["table_center"]), para("evidence report", sty["table"])],
        [para("legacy verification product imports", sty["table"]), para(str(debt["legacyVerificationProductImportCount"]), sty["table_center"]), para("OPEN", sty["table_center"]), para("historical verification", sty["table"])],
        [para("legacy verification deep imports", sty["table"]), para(str(debt["legacyVerificationDeepProductImportCount"]), sty["table_center"]), para("OPEN", sty["table_center"]), para(f"{debt['legacyVerificationDeepProductFileCount']} files", sty["table"])],
        [para("generic production expected-value debt", sty["table"]), para(str(debt["genericProductionExpectedValueDebtCount"]), sty["table_center"]), para("OPEN", sty["table_center"]), para("production example/export", sty["table"])],
    ]
    story += [
        report_table(boundary_rows, [61 * mm, 20 * mm, 25 * mm, 51 * mm]),
        Spacer(1, 5 * mm),
        report_table(
            [[para("Claim scope", sty["table_header"])], [para(boundary["claimScope"], sty["callout"])]],
            [157 * mm],
            extra=[("BACKGROUND", (0, 1), (0, 1), LIGHT_AMBER), ("BOX", (0, 0), (-1, -1), 0.8, AMBER)],
        ),
        Spacer(1, 5 * mm),
        para("Generic production debt", sty["h2"]),
    ]
    generic_rows = [[para("경로", sty["table_header"]), para("Code", sty["table_header"]), para("발견", sty["table_header"])]]
    for item in debt["genericProductionExpectedValueDebt"]:
        generic_rows.append([para(item["path"], sty["table"]), para(item["code"], sty["tiny"]), para(str(item["occurrenceCount"]), sty["table_center"])])
    story += [report_table(generic_rows, [53 * mm, 82 * mm, 22 * mm]), PageBreak()]

    story += [
        para("7. 결과 화면과 공학 claim 부재", sty["h1"]),
        para("P17-M1에는 실제 구조 모델, 해석 결과, STRIX/MIDAS 수치 비교 또는 Chrome 결과 화면이 없다. 이는 누락이 아니라 framework-only milestone의 의도된 경계다.", sty["body"]),
        Spacer(1, 4 * mm),
    ]
    zero_rows = [[para("증거 종류", sty["table_header"]), para("수량", sty["table_header"]), para("보고서 처리", sty["table_header"])]]
    zero_labels = [
        ("Structural model", "structuralModelCount", "NOT CREATED"),
        ("Engineering result", "engineeringResultCount", "NOT CREATED"),
        ("Benchmark execution", "benchmarkExecutionCount", "NOT RUN"),
        ("Solver execution", "solverExecutionCount", "NOT RUN"),
        ("Chrome capture", "chromeCaptureCount", "NO SCREENSHOT"),
        ("Case report", "caseReportCount", "NOT CREATED"),
        ("Official terminal case", "officialTerminalCaseCount", "NO TERMINAL CLAIM"),
        ("Official PASS", "officialPassCount", "NO PASS CLAIM"),
        ("STRIX R4 / MIDAS R4 run", None, f"{counters['strixR4RunCount']} / {counters['midasR4RunCount']}"),
    ]
    for label, key, handling in zero_labels:
        value = counters[key] if key else 0
        zero_rows.append([para(label, sty["table"]), para(str(value), sty["table_center"]), para(handling, sty["table_center"])])
    story += [
        report_table(zero_rows, [68 * mm, 25 * mm, 64 * mm]),
        Spacer(1, 6 * mm),
        report_table(
            [[para("Screenshot policy", sty["table_header"])], [para("가짜 모델 화면, placeholder 결과 이미지 또는 다른 milestone의 화면을 P17-M1 증거로 재사용하지 않았다.", sty["callout"])]],
            [157 * mm],
            extra=[("BACKGROUND", (0, 1), (0, 1), LIGHT_RED), ("BOX", (0, 0), (-1, -1), 0.8, RED)],
        ),
        PageBreak(),
        para("8. Terminal authorization과 M2 필수 gate", sty["h1"]),
        para("M1은 terminal PASS를 절대 승인하지 않는다. terminal authorization은 fail-closed로 비활성이고, 향후 실제 실행이 생겨도 아래 gate가 모두 구현되고 시험되기 전의 최상위 상태는 QUALIFICATION_CANDIDATE다.", sty["body"]),
        report_table(
            [
                [para("enabled", sty["table_header"]), para("상태", sty["table_header"]), para("최상위 candidate", sty["table_header"])],
                [para(str(evidence["terminalAuthorization"]["enabled"]), sty["table_center"]), para(evidence["terminalAuthorization"]["status"], sty["tiny"]), para(evidence["terminalAuthorization"]["candidateStatusOnly"], sty["table_center"])],
            ],
            [24 * mm, 77 * mm, 56 * mm],
            extra=[("BACKGROUND", (0, 1), (-1, 1), LIGHT_RED)],
        ),
        Spacer(1, 5 * mm),
        para("P17-M2 requiredBeforeEnablement", sty["h2"]),
    ]
    terminal_gate_rows = [[para("#", sty["table_header"]), para("필수 gate", sty["table_header"]), para("M1 상태", sty["table_header"])]]
    for index, gate in enumerate(evidence["terminalAuthorization"]["requiredBeforeEnablement"], start=1):
        terminal_gate_rows.append([para(str(index), sty["table_center"]), para(gate, sty["tiny"]), para("REQUIRED / NOT ENABLED", sty["table_center"])])
    story += [
        report_table(terminal_gate_rows, [12 * mm, 102 * mm, 43 * mm]),
        Spacer(1, 5 * mm),
        report_table(
            [[para("Child process qualification rule", sty["table_header"])], [para("일반 child process exit code 0은 미검증이다. canonical suite wrapper가 case manifest와 contract를 검증한 경우만 CONTRACT_VALIDATED이며, 이 상태도 terminal PASS가 아니다.", sty["callout"])]],
            [157 * mm],
            extra=[("BACKGROUND", (0, 1), (0, 1), LIGHT_AMBER), ("BOX", (0, 0), (-1, -1), 0.8, AMBER)],
        ),
        Spacer(1, 7 * mm),
        para("9. 코드 리뷰와 M2 조건", sty["h1"]),
        para("M1은 modelBuilder, referenceRepository, data-only resultExtractor, productAdapter, comparisonEvaluator, appendOnlyWriter, isolatedRunner, evidenceReport를 독립 모듈로 구성했다. 각 책임은 schema와 negative test로 잠겼고 보고서 경로는 공학 계산에서 분리되었다.", sty["body"]),
        report_table(
            [
                [para("다음", sty["table_header"]), para("사례", sty["table_header"]), para("진입 조건", sty["table_header"])],
                [para(evidence["nextMilestone"]["id"], sty["table_center"]), para(evidence["nextMilestone"]["caseId"], sty["table_center"]), para(evidence["nextMilestone"]["entryCondition"], sty["table"])],
            ],
            [27 * mm, 24 * mm, 106 * mm],
        ),
        Spacer(1, 5 * mm),
        para("Release blockers", sty["h2"]),
    ]
    reason_rows = [[para("Reason code", sty["table_header"])]] + [[para(code, sty["tiny"])] for code in evidence["reasonCodes"]]
    story += [report_table(reason_rows, [157 * mm]), PageBreak()]

    story += [
        para("10. 재현 명령", sty["h1"]),
        para("다음 명령은 M1 contract 및 evidence를 재검증한다. 보고서 렌더러 자체는 evidence hash와 파일 hash만 읽고 검증한다.", sty["body"]),
        rich("npm.cmd run check:p17:m1:scaffold<br/>npm.cmd run test:p17:m1:validator<br/>npm.cmd run test:p17:m1<br/>npm.cmd run check:p17:m1:boundaries<br/>npm.cmd run evidence:p17:m1<br/>node tools/render-p17-m1-report.mjs<br/>node tools/render-p17-m1-report.mjs --final<br/>node tools/render-p17-m1-report.mjs --verify-final", sty["mono"]),
        Spacer(1, 6 * mm),
        para("무결성 검증", sty["h2"]),
        report_table(
            [
                [para("검사", sty["table_header"]), para("결과", sty["table_header"]), para("값", sty["table_header"])],
                [para("canonical evidenceHash", sty["table"]), para("PASS", sty["table_center"]), para(evidence["evidenceHash"], sty["hash"])],
                [para("implementation file hashes", sty["table"]), para(f"PASS {audit['implementationFileCount']}/{audit['implementationFileCount']}", sty["table_center"]), para(inventory["implementationAggregateHash"], sty["hash"])],
                [para("predecessor bindings", sty["table"]), para(f"PASS {audit['predecessorBindingCount']}/{audit['predecessorBindingCount']}", sty["table_center"]), para("file bytes + SHA-256 + nested hash", sty["table"])],
                [para("result counters", sty["table"]), para("ALL ZERO", sty["table_center"]), para(f"{audit['zeroResultCounterCount']} counters", sty["table"])],
            ],
            [53 * mm, 30 * mm, 74 * mm],
        ),
        Spacer(1, 6 * mm),
        para("Predecessor bindings", sty["h2"]),
    ]
    predecessor_rows = [[para("Binding", sty["table_header"]), para("Path", sty["table_header"]), para("Bytes", sty["table_header"]), para("SHA-256", sty["table_header"])]]
    for name, binding in evidence["predecessorBindings"].items():
        predecessor_rows.append([
            para(name, sty["table"]), para(binding["path"], sty["tiny"]), para(f"{binding['byteLength']:,}", sty["table_center"]), para(short_hash(binding["sha256"], 10, 6), sty["hash"]),
        ])
    story += [report_table(predecessor_rows, [32 * mm, 78 * mm, 18 * mm, 29 * mm]), PageBreak()]

    story += [
        para("11. Implementation artifact inventory", sty["h1"]),
        para(f"아래 {inventory['implementationFileCount']}개 파일은 PDF를 만들기 전에 byteLength와 SHA-256을 모두 다시 계산했다. 하나라도 evidence와 다르면 renderer는 보고서를 생성하지 않는다.", sty["body"]),
    ]
    artifact_rows = [[para("#", sty["table_header"]), para("Path", sty["table_header"]), para("Bytes", sty["table_header"]), para("SHA-256", sty["table_header"])]]
    for index, item in enumerate(inventory["implementationFiles"], start=1):
        artifact_rows.append([
            para(str(index), sty["table_center"]), para(item["path"], sty["tiny"]), para(f"{item['byteLength']:,}", sty["table_center"]), para(item["sha256"], sty["hash"]),
        ])
    story += [
        report_table(artifact_rows, [10 * mm, 87 * mm, 19 * mm, 41 * mm], font_size=6.0),
        Spacer(1, 5 * mm),
        para(f"implementationAggregateHash = {inventory['implementationAggregateHash']}", sty["hash"]),
        PageBreak(),

        para("12. 최종 판정", sty["h1"]),
        report_table(
            [
                [para("M1 status", sty["table_header"]), para("Release", sty["table_header"]), para("Final design", sty["table_header"])],
                [para(evidence["status"], sty["cover_status"]), para("BLOCKED", sty["cover_status"]), para("BLOCKED", sty["cover_status"])],
            ],
            [75 * mm, 41 * mm, 41 * mm],
            extra=[
                ("BACKGROUND", (0, 1), (0, 1), LIGHT_TEAL),
                ("BACKGROUND", (1, 1), (-1, 1), LIGHT_RED),
                ("TOPPADDING", (0, 1), (-1, 1), 10),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 10),
            ],
        ),
        Spacer(1, 8 * mm),
        para("P17-M1 framework는 M2 gate 구현을 시작할 수 있는 계약 상태다. terminal PASS authorization은 비활성이며 허용 가능한 최상위 상태는 QUALIFICATION_CANDIDATE다. 이 판정은 benchmark 성능, 구조해석 정확도, MIDAS/STRIX 결과 일치, release 또는 실제 설계 적용 가능성을 입증하지 않는다.", sty["body"]),
        para("P17-M2는 8개 terminal-authorization gate를 구현하고 시험해야 한다. 그 뒤 SB1 하나만 WIP로 열어 source/reference/probe/tolerance/model lock, 제품 실행, data-only extraction/replay, 결과 비교, Chrome 캡처, external signed custody 및 완전한 사례 보고서를 수행해야 한다.", sty["body"]),
        Spacer(1, 8 * mm),
        para("Canonical evidence", sty["h2"]),
        para(evidence["evidencePath"], sty["mono"]),
        para(f"evidenceHash={evidence['evidenceHash']}", sty["hash"]),
        Spacer(1, 8 * mm),
        report_table(
            [[para("NO MODEL / NO SOLVER / NO BENCHMARK RESULT / NO SCREENSHOT", sty["table_header"])], [para("Framework qualification only", sty["cover_status"])]],
            [157 * mm],
            extra=[("BACKGROUND", (0, 1), (0, 1), LIGHT_AMBER), ("BOX", (0, 0), (-1, -1), 0.9, AMBER)],
        ),
    ]

    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    doc.build(story, onFirstPage=footer, onLaterPages=footer, canvasmaker=StableCanvas)


def render_all_pages(pdf_path: Path, render_dir: Path):
    resolved = render_dir.resolve()
    try:
        resolved.relative_to(WORK_DIR.resolve())
    except ValueError as exc:
        raise RuntimeError(f"Render directory must stay under {WORK_DIR}") from exc
    if render_dir.exists():
        shutil.rmtree(render_dir)
    render_dir.mkdir(parents=True, exist_ok=True)
    document = pdfium.PdfDocument(str(pdf_path))
    paths = []
    try:
        for index in range(len(document)):
            page = document[index]
            output = render_dir / f"page-{index + 1:02d}.png"
            page.render(scale=1.5).to_pil().convert("RGB").save(output, format="PNG")
            page.close()
            paths.append(output)
    finally:
        document.close()
    return paths


def verify_pdf(pdf_path: Path, render_dir: Path, evidence: dict) -> dict:
    reader = PdfReader(str(pdf_path))
    if len(reader.pages) < 10:
        raise RuntimeError(f"PDF unexpectedly short: {len(reader.pages)} pages")
    page_texts = [page.extract_text() or "" for page in reader.pages]
    full_text = "\n".join(page_texts)
    inventory = evidence["frameworkInventory"]
    debt = evidence["historicalReleaseDebt"]
    required_tokens = [
        "P17-M1",
        EXPECTED_STATUS,
        f"official {inventory['officialCaseCount']}",
        f"custom {inventory['customCaseCount']}",
        f"{inventory['runtimeManifestSchemaCount']} strict",
        "legacy verification deep imports",
        str(debt["legacyVerificationDeepProductImportCount"]),
        "Benchmark execution",
        "P17-M2",
        evidence["terminalAuthorization"]["candidateStatusOnly"],
        "terminal PASS authorization",
        "EXTERNAL_SIGNED_ANCHOR_REQUIRED",
        "NO MODEL / NO SOLVER / NO BENCHMARK RESULT / NO SCREENSHOT",
    ]
    compact_text = "".join(full_text.split())
    missing = [
        token for token in required_tokens
        if token not in full_text and "".join(token.split()) not in compact_text
    ]
    if missing:
        raise RuntimeError(f"PDF text QA missing required tokens: {missing}")
    if "�" in full_text:
        raise RuntimeError("PDF extracted text contains replacement glyphs.")

    rendered = render_all_pages(pdf_path, render_dir)
    page_audits = []
    for index, (text_value, image_path) in enumerate(zip(page_texts, rendered), start=1):
        text_chars = len("".join(text_value.split()))
        if text_chars < 25:
            raise RuntimeError(f"PDF page {index} appears blank by extracted text ({text_chars} chars).")
        with PillowImage.open(image_path) as image:
            grey = image.convert("L")
            histogram = grey.histogram()
            non_white = sum(histogram[:250])
            fraction = non_white / float(image.width * image.height)
            if fraction < 0.002:
                raise RuntimeError(f"PDF page {index} appears visually blank ({fraction:.6f} non-white).")
            page_audits.append({
                "page": index,
                "path": relative(image_path),
                "sha256": sha256_file(image_path),
                "byteLength": image_path.stat().st_size,
                "width": image.width,
                "height": image.height,
                "extractedTextCharacters": text_chars,
                "nonWhiteFraction": round(fraction, 6),
                "status": "PASS_NONBLANK",
            })
    return {
        "status": "PASS",
        "pageCount": len(reader.pages),
        "renderedPageCount": len(rendered),
        "requiredTokens": required_tokens,
        "missingTokens": [],
        "blankPageCount": 0,
        "pageAudits": page_audits,
        "extractedTextSha256": sha256_bytes(full_text.encode("utf-8")),
    }


def write_immutable(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != data:
            raise RuntimeError(f"Refusing to overwrite non-identical final report artifact: {path}")
        return
    path.write_bytes(data)


def build_qa(evidence: dict, audit: dict, markdown_path: Path, pdf_path: Path, pdf_qa: dict, final_artifact: bool):
    reproduction_status = "PASS_BYTE_IDENTICAL" if final_artifact else "NOT_APPLICABLE_DRAFT"
    qa_core = {
        "version": "p17-m1-report-qa-v1",
        "auditDate": evidence["auditDate"],
        "artifactScope": "FINAL_ARTIFACT" if final_artifact else "DRAFT_ARTIFACT",
        "qaPath": relative(PERMANENT_QA_PATH if final_artifact else QA_PATH),
        "status": "PASS",
        "reportStatus": evidence["status"],
        "evidence": {
            "path": evidence["evidencePath"],
            "evidenceHash": evidence["evidenceHash"],
            "fileSha256": audit["evidenceFileSha256"],
            "canonicalHashVerification": "PASS",
        },
        "implementationIntegrity": {
            "status": f"PASS_{audit['implementationFileCount']}_OF_{audit['implementationFileCount']}",
            "aggregateHash": audit["implementationAggregateHash"],
        },
        "report": {
            "markdown": {
                "path": relative(markdown_path),
                "sha256": sha256_file(markdown_path),
                "byteLength": markdown_path.stat().st_size,
            },
            "pdf": {
                "path": relative(pdf_path),
                "sha256": sha256_file(pdf_path),
                "byteLength": pdf_path.stat().st_size,
                "pageCount": pdf_qa["pageCount"],
            },
        },
        "automatedPdfQa": pdf_qa,
        "reproduction": {
            "contract": "FRESH_INVARIANT_RENDER_MUST_BE_BYTE_IDENTICAL_TO_SEALED_FINAL_MD_PDF_AND_QA",
            "status": reproduction_status,
            "markdownByteIdentity": reproduction_status,
            "pdfByteIdentity": reproduction_status,
            "qaByteIdentity": reproduction_status,
        },
        "rendererRuntime": {
            "python": sys.version.split()[0],
            "reportlab": reportlab.Version,
            "pypdf": pypdf.__version__,
            "pypdfium2": getattr(pypdfium2, "__version__", "5.13.0"),
        },
        "engineeringExecution": {
            "benchmarkExecutionCount": evidence["resultCounters"]["benchmarkExecutionCount"],
            "solverExecutionCount": evidence["resultCounters"]["solverExecutionCount"],
            "structuralModelCount": evidence["resultCounters"]["structuralModelCount"],
            "engineeringResultCount": evidence["resultCounters"]["engineeringResultCount"],
            "chromeCaptureCount": evidence["resultCounters"]["chromeCaptureCount"],
            "fakeScreenshotCount": 0,
            "terminalAuthorizationEnabled": evidence["terminalAuthorization"]["enabled"],
            "candidateStatusOnly": evidence["terminalAuthorization"]["candidateStatusOnly"],
        },
        "gateInventory": {
            "m1QualificationGateCount": audit["m1GateCount"],
            "m2TerminalAuthorizationGateCount": audit["m2TerminalGateCount"],
        },
        "releaseAllowed": False,
        "finalDesignTransferAllowed": False,
    }
    return {**qa_core, "qaHash": canonical_hash(qa_core)}


def serialize_json(value: dict) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def verify_qa_artifact(path: Path, markdown_path: Path, pdf_path: Path) -> dict:
    qa = read_json(path)
    core = {key: value for key, value in qa.items() if key != "qaHash"}
    actual_qa_hash = canonical_hash(core)
    if qa.get("qaHash") != actual_qa_hash:
        raise RuntimeError(f"Permanent QA canonical hash mismatch: {path}")
    expected = qa.get("report", {})
    markdown = expected.get("markdown", {})
    pdf = expected.get("pdf", {})
    if markdown.get("path") != relative(markdown_path) or markdown.get("sha256") != sha256_file(markdown_path) or markdown.get("byteLength") != markdown_path.stat().st_size:
        raise RuntimeError("Permanent QA Markdown binding differs from the final Markdown.")
    if pdf.get("path") != relative(pdf_path) or pdf.get("sha256") != sha256_file(pdf_path) or pdf.get("byteLength") != pdf_path.stat().st_size:
        raise RuntimeError("Permanent QA PDF binding differs from the final PDF.")
    return {"status": "PASS", "qaHash": actual_qa_hash, "fileSha256": sha256_file(path)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("draft", "final", "verify"), default="draft")
    args = parser.parse_args()

    evidence = read_json(EVIDENCE_PATH)
    audit = verify_evidence(evidence)
    markdown = make_markdown(evidence, audit)

    DRAFT_DIR.mkdir(parents=True, exist_ok=True)
    draft_md = DRAFT_DIR / f"{REPORT_STEM}.md"
    draft_pdf = DRAFT_DIR / f"{REPORT_STEM}.pdf"
    draft_md.write_text(markdown, encoding="utf-8")
    build_pdf(draft_pdf, evidence, audit)

    final_md = FINAL_DIR / f"{REPORT_STEM}.md"
    final_pdf = FINAL_DIR / f"{REPORT_STEM}.pdf"
    if args.mode == "final":
        write_immutable(final_md, draft_md.read_bytes())
        write_immutable(final_pdf, draft_pdf.read_bytes())
        if final_md.read_bytes() != draft_md.read_bytes() or final_pdf.read_bytes() != draft_pdf.read_bytes():
            raise RuntimeError("Final report copy is not byte-identical to the fresh invariant render.")
        report_md = final_md
        report_pdf = final_pdf
    elif args.mode == "verify":
        if not final_md.exists() or not final_pdf.exists():
            raise RuntimeError("Final Markdown and PDF must exist before --mode verify.")
        if final_md.read_bytes() != draft_md.read_bytes():
            raise RuntimeError("Fresh Markdown is not byte-identical to the final Markdown.")
        if final_pdf.read_bytes() != draft_pdf.read_bytes():
            raise RuntimeError("Fresh invariant PDF is not byte-identical to the final PDF.")
        report_md = final_md
        report_pdf = final_pdf
    else:
        report_md = draft_md
        report_pdf = draft_pdf

    pdf_qa = verify_pdf(report_pdf, RENDER_DIR, evidence)
    final_artifact = args.mode in ("final", "verify")
    qa = build_qa(evidence, audit, report_md, report_pdf, pdf_qa, final_artifact)
    qa_bytes = serialize_json(qa)
    QA_PATH.parent.mkdir(parents=True, exist_ok=True)
    QA_PATH.write_bytes(qa_bytes)
    if args.mode == "final":
        write_immutable(PERMANENT_QA_PATH, qa_bytes)
        verify_qa_artifact(PERMANENT_QA_PATH, final_md, final_pdf)
    elif args.mode == "verify":
        if not PERMANENT_QA_PATH.exists():
            raise RuntimeError("Permanent final QA artifact is missing.")
        verify_qa_artifact(PERMANENT_QA_PATH, final_md, final_pdf)
        if PERMANENT_QA_PATH.read_bytes() != qa_bytes:
            sealed = read_json(PERMANENT_QA_PATH)
            raise RuntimeError(
                "Fresh QA is not byte-identical to permanent final QA: "
                f"sealedQaHash={sealed.get('qaHash')} freshQaHash={qa.get('qaHash')}"
            )
    qa_path = PERMANENT_QA_PATH if final_artifact else QA_PATH
    result = {
        "mode": args.mode,
        "status": evidence["status"],
        "evidenceHashVerification": "PASS",
        "implementationHashVerification": f"PASS_{audit['implementationFileCount']}_OF_{audit['implementationFileCount']}",
        "markdown": relative(report_md),
        "markdownSha256": sha256_file(report_md),
        "pdf": relative(report_pdf),
        "pdfSha256": sha256_file(report_pdf),
        "pageCount": pdf_qa["pageCount"],
        "renderedPageCount": pdf_qa["renderedPageCount"],
        "blankPageCount": pdf_qa["blankPageCount"],
        "qa": relative(qa_path),
        "qaSha256": sha256_file(qa_path),
        "qaHash": qa["qaHash"],
        "qaHashVerification": "PASS",
        "byteReproduction": qa["reproduction"]["status"],
        "benchmarkExecutionCount": evidence["resultCounters"]["benchmarkExecutionCount"],
        "solverExecutionCount": evidence["resultCounters"]["solverExecutionCount"],
        "chromeCaptureCount": evidence["resultCounters"]["chromeCaptureCount"],
        "releaseAllowed": False,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
