#!/usr/bin/env python3
"""Reproduce the P17-M0 source value-presence audit without running a solver."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import platform
import re
import sys
import unicodedata
from html.parser import HTMLParser
from pathlib import Path

import pypdf
from pypdf import PdfReader


REPO = Path(__file__).resolve().parents[4]
SOURCE_ROOT = Path(os.environ.get("P17_SOURCE_ROOT", REPO.parent / "STRIX-verification-21")).resolve()
REGISTRY_PATH = REPO / "verification/benchmarks/strix21/suite-source-registry-r2.json"
LOCKS_DIR = REPO / "verification/benchmarks/strix21/references/source-locks-r2"
OUTPUT_PATH = REPO / "verification/evidence/validation/phase17/p17-m0-source-value-presence-audit-r3.json"
SUPERSEDED_OUTPUT_PATH = REPO / "verification/evidence/validation/phase17/p17-m0-source-value-presence-audit-r2.json"
SCHEMA_PATH = REPO / "verification/specs/phase17/p17-m0-content-audit-schema.json"
AUDIT_DATE = "2026-08-28"
NORMALIZATION_VERSION = "p17-visible-text-nfkc-no-whitespace-v1"


class VisibleTextParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.suppressed_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag.lower() in {"style", "script"}:
            self.suppressed_depth += 1

    def handle_endtag(self, tag):
        if tag.lower() in {"style", "script"} and self.suppressed_depth:
            self.suppressed_depth -= 1

    def handle_data(self, data):
        if not self.suppressed_depth:
            self.parts.append(data)

    def text(self) -> str:
        return " ".join(self.parts)


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_hash(value) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def normalize_visible(value: str | None) -> str:
    decoded = html.unescape(value or "").replace("\u00ad", "")
    normalized = unicodedata.normalize("NFKC", decoded)
    return re.sub(r"\s+", "", normalized)


def visible_html(path: Path) -> str:
    parser = VisibleTextParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return normalize_visible(parser.text())


def file_record(path: Path, logical: str) -> dict:
    return {"path": logical, "byteLength": path.stat().st_size, "sha256": sha256(path)}


def validate_hashed_json(value: dict, hash_key: str, label: str):
    expected = value.get(hash_key)
    actual = canonical_hash({key: item for key, item in value.items() if key != hash_key})
    if expected != actual:
        raise RuntimeError(f"{label} canonical hash mismatch: {expected} != {actual}")


def assertion(kind: str, field: str, expected: str, haystack: str, row_index: int | None = None) -> dict:
    found = normalize_visible(expected) in haystack
    result = {"kind": kind, "field": field, "expected": expected, "matched": found}
    if row_index is not None:
        result["rowIndex"] = row_index
    return result


def build_audit() -> dict:
    if not SOURCE_ROOT.is_dir():
        raise RuntimeError(f"P17 source root does not exist: {SOURCE_ROOT}")

    registry = read_json(REGISTRY_PATH)
    validate_hashed_json(registry, "registryHash", "registry")
    catalog_path = SOURCE_ROOT / "benchmark-catalog.json"
    manual_path = SOURCE_ROOT / "documents/StrixVerificationManual.pdf"
    catalog = read_json(catalog_path)
    catalog_by_id = {case["id"]: case for case in catalog["benchmarks"]}
    if set(registry["officialOrder"]) - set(catalog_by_id):
        raise RuntimeError("Catalog is missing one or more official cases")

    manual_reader = PdfReader(str(manual_path))
    manual_pages = [normalize_visible(page.extract_text() or "") for page in manual_reader.pages]
    cases = []
    html_metadata_assertions = []
    html_scalar_assertions = []
    html_row_sequence_assertions = []
    pdf_global_text_assertions = []
    manual_assertions = []
    source_hash_checks = []

    for case_id in registry["officialOrder"]:
        case = catalog_by_id[case_id]
        lock = read_json(LOCKS_DIR / f"{case_id}.source-lock.json")
        validate_hashed_json(lock, "sourceLockHash", f"source lock {case_id}")
        html_path = SOURCE_ROOT / case["source_html"]
        pdf_path = SOURCE_ROOT / case["source_pdf"]
        html_text = visible_html(html_path)
        pdf_reader = PdfReader(str(pdf_path))
        pdf_text = normalize_visible(" ".join(page.extract_text() or "" for page in pdf_reader.pages))

        expected_html_hash = lock["sourceRoles"]["strixPublishedResult"]["file"]["sha256"]
        expected_pdf_hash = lock["sourceRoles"]["archivalNarrative"]["casePdf"]["sha256"]
        expected_pdf_pages = lock["sourceRoles"]["archivalNarrative"]["casePdf"]["pdfPageCount"]
        actual_html_hash = sha256(html_path)
        actual_pdf_hash = sha256(pdf_path)
        if actual_html_hash != expected_html_hash or actual_pdf_hash != expected_pdf_hash:
            raise RuntimeError(f"Source hash changed for {case_id}")
        if len(pdf_reader.pages) != expected_pdf_pages:
            raise RuntimeError(f"PDF page count changed for {case_id}")
        source_hash_checks.extend([
            {"caseId": case_id, "kind": "HTML", "expected": expected_html_hash, "actual": actual_html_hash, "matched": True},
            {"caseId": case_id, "kind": "PDF", "expected": expected_pdf_hash, "actual": actual_pdf_hash, "matched": True},
        ])

        case_html_metadata = [
            assertion("HTML", "title", case["title"], html_text),
            assertion("HTML", "verdict", case["verdict"], html_text),
        ]
        case_html_scalars = []
        case_html_rows = []
        case_pdf_global_text = []
        html_row_cursor = 0
        for row_index, row in enumerate(case["results"], start=1):
            for field in ("STRIX", "Reference", "Δ"):
                case_html_scalars.append(assertion("HTML", field, row[field], html_text, row_index))
                case_pdf_global_text.append(assertion("PDF_GLOBAL_TEXT", field, row[field], pdf_text, row_index))
            row_sequence = "".join(str(value) for value in row.values())
            row_token = normalize_visible(row_sequence)
            row_offset = html_text.find(row_token, html_row_cursor)
            case_html_rows.append({
                "kind": "HTML_ORDERED_ROW_SEQUENCE",
                "field": "resultRow",
                "expected": row_sequence,
                "matched": row_offset >= 0,
                "rowIndex": row_index,
                "matchOffset": row_offset if row_offset >= 0 else None,
            })
            if row_offset >= 0:
                html_row_cursor = row_offset + len(row_token)

        title_pages = [index for index, page_text in enumerate(manual_pages) if normalize_visible(case["title"]) in page_text]
        manual_meta = lock["sourceRoles"]["archivalNarrative"]["manual"]
        expected_manual_page_index = manual_meta["printedPageStart"] + 1
        case_manual = [
            {
                "kind": "MANUAL",
                "field": "titleAtLockedStartPage",
                "expected": case["title"],
                "matched": expected_manual_page_index in title_pages,
                "expectedPdfPageIndex": expected_manual_page_index,
                "expectedDisplayPageNumber": expected_manual_page_index + 1,
                "lockedPrintedPageStart": manual_meta["printedPageStart"],
                "lockedPrintedPageEnd": manual_meta["printedPageEnd"],
                "pdfPageIndexes": title_pages,
                "displayPageNumbers": [index + 1 for index in title_pages],
            }
        ]
        html_metadata_assertions.extend({"caseId": case_id, **item} for item in case_html_metadata)
        html_scalar_assertions.extend({"caseId": case_id, **item} for item in case_html_scalars)
        html_row_sequence_assertions.extend({"caseId": case_id, **item} for item in case_html_rows)
        pdf_global_text_assertions.extend({"caseId": case_id, **item} for item in case_pdf_global_text)
        manual_assertions.extend({"caseId": case_id, **item} for item in case_manual)
        cases.append({
            "caseId": case_id,
            "catalogRowCount": len(case["results"]),
            "html": {
                "path": f"STRIX-verification-21/{case['source_html']}",
                "sha256": actual_html_hash,
                "metadataAssertionCount": len(case_html_metadata),
                "metadataMatchedCount": sum(item["matched"] for item in case_html_metadata),
                "scalarPresenceAssertionCount": len(case_html_scalars),
                "scalarPresenceMatchedCount": sum(item["matched"] for item in case_html_scalars),
                "rowSequenceAssertionCount": len(case_html_rows),
                "rowSequenceMatchedCount": sum(item["matched"] for item in case_html_rows),
            },
            "casePdf": {
                "path": f"STRIX-verification-21/{case['source_pdf']}",
                "sha256": actual_pdf_hash,
                "pageCount": len(pdf_reader.pages),
                "globalTextValuePresenceAssertionCount": len(case_pdf_global_text),
                "globalTextValuePresenceMatchedCount": sum(item["matched"] for item in case_pdf_global_text),
                "globalTextValuePresenceMissing": [item for item in case_pdf_global_text if not item["matched"]],
            },
            "manualTitleLocator": case_manual[0],
        })

    catalog_record = file_record(catalog_path, "STRIX-verification-21/benchmark-catalog.json")
    manual_record = file_record(manual_path, "STRIX-verification-21/documents/StrixVerificationManual.pdf")
    first_lock = read_json(LOCKS_DIR / f"{registry['officialOrder'][0]}.source-lock.json")
    if catalog_record["sha256"] != first_lock["sourceRoles"]["catalog"]["sha256"]:
        raise RuntimeError("Catalog source hash changed")
    if manual_record["sha256"] != first_lock["sourceRoles"]["archivalNarrative"]["manual"]["sha256"]:
        raise RuntimeError("Manual source hash changed")
    if len(manual_reader.pages) != first_lock["sourceRoles"]["archivalNarrative"]["manual"]["pdfPageCount"]:
        raise RuntimeError("Manual PDF page count changed")

    html_metadata_missing = [item for item in html_metadata_assertions if not item["matched"]]
    html_scalar_missing = [item for item in html_scalar_assertions if not item["matched"]]
    html_row_missing = [item for item in html_row_sequence_assertions if not item["matched"]]
    pdf_text_missing = [item for item in pdf_global_text_assertions if not item["matched"]]
    manual_missing = [item for item in manual_assertions if not item["matched"]]
    expected_pdf_missing = [
        {"caseId": "SH1", "rowIndex": 11, "field": "STRIX"},
        {"caseId": "SH1", "rowIndex": 11, "field": "Reference"},
    ]
    actual_pdf_missing = [
        {"caseId": item["caseId"], "rowIndex": item["rowIndex"], "field": item["field"]}
        for item in pdf_text_missing
    ]
    if html_metadata_missing or html_scalar_missing or html_row_missing:
        raise RuntimeError(
            "HTML/catalog presence or row-sequence mismatch: "
            f"metadata={html_metadata_missing}, scalar={html_scalar_missing}, rows={html_row_missing}"
        )
    if actual_pdf_missing != expected_pdf_missing:
        raise RuntimeError(f"Unexpected PDF visibility result: {actual_pdf_missing}")
    if manual_missing:
        raise RuntimeError(f"Manual title locator mismatch: {manual_missing}")

    superseded = read_json(SUPERSEDED_OUTPUT_PATH)
    validate_hashed_json(superseded, "auditHash", "superseded content audit")
    audit = {
        "version": "p17-m0-source-value-presence-audit-v3",
        "auditId": "P17-M0-SOURCE-VALUE-PRESENCE-AUDIT-R3",
        "supersedes": {
            "path": "verification/evidence/validation/phase17/p17-m0-source-value-presence-audit-r2.json",
            "sha256": sha256(SUPERSEDED_OUTPUT_PATH),
            "auditHash": superseded["auditHash"],
            "reason": "R2 checked each concatenated HTML row anywhere in the page but did not enforce catalog order; R3 records increasing match offsets and requires all 131 rows in locked order.",
        },
        "auditDate": AUDIT_DATE,
        "scope": "Published STRIX metadata, HTML result-row sequence and document-global PDF text-value presence only; no solver execution, PDF row-local parity or independent acceptance claim.",
        "sourceRoot": "STRIX-verification-21",
        "extractor": {
            "path": "verification/benchmarks/strix21/reporting/audit_p17_m0_sources.py",
            "sha256": sha256(Path(__file__).resolve()),
            "command": "npm run audit:p17:m0:check",
            "pythonImplementation": platform.python_implementation(),
            "pythonVersion": platform.python_version(),
            "pypdfVersion": pypdf.__version__,
            "normalizationVersion": NORMALIZATION_VERSION,
        },
        "sources": {
            "registry": file_record(REGISTRY_PATH, "verification/benchmarks/strix21/suite-source-registry-r2.json"),
            "catalog": catalog_record,
            "manual": {**manual_record, "pageCount": len(manual_reader.pages)},
            "caseSourceHashChecks": source_hash_checks,
        },
        "summary": {
            "officialCaseCount": len(cases),
            "catalogResultRowCount": sum(case["catalogRowCount"] for case in cases),
            "htmlMetadataPresenceAssertionCount": len(html_metadata_assertions),
            "htmlMetadataPresenceMatchedCount": len(html_metadata_assertions) - len(html_metadata_missing),
            "htmlScalarPresenceAssertionCount": len(html_scalar_assertions),
            "htmlScalarPresenceMatchedCount": len(html_scalar_assertions) - len(html_scalar_missing),
            "htmlResultRowOrderedSequenceAssertionCount": len(html_row_sequence_assertions),
            "htmlResultRowOrderedSequenceMatchedCount": len(html_row_sequence_assertions) - len(html_row_missing),
            "casePdfGlobalTextValuePresenceAssertionCount": len(pdf_global_text_assertions),
            "casePdfGlobalTextValuePresenceMatchedCount": len(pdf_global_text_assertions) - len(pdf_text_missing),
            "casePdfGlobalTextValuePresenceMissingCount": len(pdf_text_missing),
            "manualLockedStartPageTitleAssertionCount": len(manual_assertions),
            "manualLockedStartPageTitleMatchedCount": len(manual_assertions) - len(manual_missing),
            "sourceHashCheckCount": len(source_hash_checks),
            "sourceHashMatchedCount": sum(item["matched"] for item in source_hash_checks),
        },
        "methodLimitations": [
            "PDF value checks search normalized text document-wide; repeated strings can satisfy multiple scalar presence assertions and are not row-local parity.",
            "The SH1 two-row clipping classification is a visual source assessment retained separately from text extraction.",
            "No STRIX, MIDAS or S-Structures solver was executed in this audit.",
        ],
        "knownSourcePresentationDefects": [{
            "id": "P17-D005",
            "caseId": "SH1",
            "description": "The individual SH1 PDF does not fully display two final PCHIP rows: row 10 has only a visible label and row 11 is absent from the rendered table; HTML/catalog retains both complete rows.",
            "visualClassification": "TWO_PCHIP_ROWS_NOT_FULLY_VISIBLE",
            "textExtractionMissingScalarPresenceAssertions": pdf_text_missing,
            "sourcePdfPageIndex": 2,
            "sourcePdfDisplayPageNumber": 3,
            "classification": "SOURCE_PRESENTATION_DEFECT_NOT_SOLVER_RESULT",
        }],
        "cases": cases,
        "verdict": {
            "status": "PASS_SOURCE_CUSTODY_WITH_KNOWN_PRESENTATION_DEFECT",
            "htmlMetadataPresence": "PASS_42_OF_42",
            "htmlScalarPresence": "PASS_393_OF_393",
            "htmlResultRowOrderedSequence": "PASS_131_OF_131",
            "casePdfGlobalTextValuePresence": "OBSERVED_391_OF_393_WITH_SH1_VISUAL_TWO_ROW_CLIPPING",
            "manualLockedStartPageTitleLocators": "PASS_21_OF_21",
            "releaseAllowed": False,
        },
    }
    audit["auditHash"] = canonical_hash(audit)
    return audit


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("check", "write"), default="check")
    args = parser.parse_args()
    audit = build_audit()
    if args.mode == "write":
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        try:
            with OUTPUT_PATH.open("x", encoding="utf-8", newline="\n") as handle:
                json.dump(audit, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
        except FileExistsError as exc:
            raise SystemExit(f"Refusing to overwrite immutable audit: {OUTPUT_PATH}") from exc
    else:
        stored = read_json(OUTPUT_PATH)
        validate_hashed_json(stored, "auditHash", "stored content audit")
        if stored != audit:
            raise SystemExit("Stored content audit differs from the reproducible source extraction")
    print(json.dumps({"mode": args.mode, "status": audit["verdict"]["status"], **audit["summary"], "auditHash": audit["auditHash"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
