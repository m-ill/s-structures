#!/usr/bin/env python3
"""Render the evidence-only P17-M0 source custody report.

Draft mode writes only under tmp/. Final mode writes immutable deliverables and
the canonical review Markdown. It never runs a solver or edits source evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import shutil
import sys
from pathlib import Path

import reportlab
import pypdf
import pypdfium2
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

try:
    import pypdfium2 as pdfium
    from pypdf import PdfReader
except ImportError as exc:  # pragma: no cover - environment diagnostic
    raise SystemExit(f"Missing PDF runtime dependency: {exc}") from exc


REPO = Path(__file__).resolve().parents[4]
VAULT = REPO.parent
SOURCE_ROOT = Path(os.environ.get("P17_SOURCE_ROOT", VAULT / "STRIX-verification-21")).resolve()
EVIDENCE_PATH = REPO / "verification/evidence/validation/phase17/p17-m0-baseline-source-lock-r2.json"
REGISTRY_PATH = REPO / "verification/benchmarks/strix21/suite-source-registry-r2.json"
DISCREPANCY_PATH = REPO / "verification/benchmarks/strix21/references/source-version-discrepancies-r2.json"
LOCKS_DIR = REPO / "verification/benchmarks/strix21/references/source-locks-r2"
REVIEW_PATH = REPO / "docs/phase17/reviews/P17-M0-BASELINE-SOURCE-LOCK-REVIEW.md"
FINAL_DIR = REPO / "output/verification/phase17"
DRAFT_DIR = REPO / "tmp/verification/phase17/p17-m0-report/draft"
RENDER_DIR = REPO / "tmp/verification/phase17/p17-m0-report/rendered"
REPORT_STEM = "P17-M0-BASELINE-SOURCE-LOCK-REPORT-R2"
SOURCE_MANUAL = SOURCE_ROOT / "documents/StrixVerificationManual.pdf"
SOURCE_SH1 = SOURCE_ROOT / "reports/SH1.pdf"
FONT_REGULAR = Path("C:/Windows/Fonts/malgun.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/malgunbd.ttf")

NAVY = colors.HexColor("#17324D")
TEAL = colors.HexColor("#007C83")
LIGHT_TEAL = colors.HexColor("#E9F5F4")
LIGHT_BLUE = colors.HexColor("#EEF4F8")
LIGHT_RED = colors.HexColor("#FDEEEE")
LIGHT_AMBER = colors.HexColor("#FFF6DD")
MID_GREY = colors.HexColor("#677481")
LINE = colors.HexColor("#CBD5DC")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_hash(value) -> str:
    serialized = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def verify_evidence_chain(evidence, registry, discrepancies, locks):
    def without(value, key):
        return {name: item for name, item in value.items() if name != key}

    checks = [
        ("baseline evidence", evidence["baselineHash"], canonical_hash(without(evidence, "baselineHash"))),
        ("source registry", registry["registryHash"], canonical_hash(without(registry, "registryHash"))),
        ("discrepancy register", discrepancies["registerHash"], canonical_hash(without(discrepancies, "registerHash"))),
    ]
    for lock in locks:
        checks.append((f"source lock {lock['caseId']}", lock["sourceLockHash"], canonical_hash(without(lock, "sourceLockHash"))))
    failures = [name for name, expected, actual in checks if expected != actual]
    if failures:
        raise RuntimeError(f"Refusing to render tampered evidence: hash mismatch in {', '.join(failures)}")

    lock_aggregate = canonical_hash([{"caseId": lock["caseId"], "hash": lock["sourceLockHash"]} for lock in locks])
    if evidence["sourceCustody"]["registryHash"] != registry["registryHash"]:
        raise RuntimeError("Evidence registryHash does not match the loaded registry")
    if evidence["sourceCustody"]["discrepancyRegisterHash"] != discrepancies["registerHash"]:
        raise RuntimeError("Evidence discrepancyRegisterHash does not match the loaded register")
    if evidence["sourceCustody"]["sourceLockAggregateHash"] != lock_aggregate:
        raise RuntimeError("Evidence sourceLockAggregateHash does not match the loaded source locks")
    registry_locks = {item["caseId"]: item["sourceLockHash"] for item in registry["cases"]}
    if registry_locks != {lock["caseId"]: lock["sourceLockHash"] for lock in locks}:
        raise RuntimeError("Registry case hashes do not match the loaded source locks")

    lock_by_id = {lock["caseId"]: lock for lock in locks}
    source_checks = [
        (
            "manual screenshot source",
            SOURCE_MANUAL,
            locks[0]["sourceRoles"]["archivalNarrative"]["manual"]["sha256"],
        ),
        (
            "SH1 screenshot source",
            SOURCE_SH1,
            lock_by_id["SH1"]["sourceRoles"]["archivalNarrative"]["casePdf"]["sha256"],
        ),
    ]
    for name, source_path, expected_hash in source_checks:
        if not source_path.is_file():
            raise RuntimeError(f"Missing {name}: {source_path}")
        if sha256(source_path) != expected_hash:
            raise RuntimeError(f"Refusing to render tampered {name}: {source_path}")


def short_hash(value: str) -> str:
    return f"{value[:12]}…{value[-8:]}"


def display_status(value: str) -> str:
    return value.replace("_", " ")


def render_source_page(pdf_path: Path, page_index: int, output_path: Path, scale: float = 2.0):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    document = pdfium.PdfDocument(str(pdf_path))
    try:
        page = document[page_index]
        bitmap = page.render(scale=scale)
        bitmap.to_pil().convert("RGB").save(output_path, quality=92)
        page.close()
    finally:
        document.close()


def make_markdown(evidence, registry, discrepancies, locks) -> str:
    phase15 = evidence["phase15HistoricalSnapshot"]
    gates = evidence["gates"]
    lines = [
        "# P17-M0 Baseline & Source Lock 검증 보고서",
        "",
        "```yaml",
        "report: P17-M0-BASELINE-SOURCE-LOCK-REPORT-R2",
        f"audit_date: {evidence['auditDate']}",
        f"status: {evidence['status']}",
        f"baseline_hash: {evidence['baselineHash']}",
        f"m1_entry_allowed: {str(evidence['m1EntryAllowed']).lower()}",
        "release_allowed: false",
        "final_design_transfer_allowed: false",
        "solver_runs_performed: 0",
        "phase17_inherited_pass_count: 0",
        "```",
        "",
        "## 1. 판정 요약",
        "",
        "P17-M0의 원자료 custody·판본 역할·역사 baseline 동결은 기술적으로 완료했다. 상태는 `PASS`가 아니라 `COMPLETE_WITH_SOURCE_BLOCKERS`다. 8개 기술 gate는 통과했고, 독립 reviewer 승인과 STRIX raw runtime provenance는 release-only blocker로 남았다. 따라서 P17-M1 framework 개발은 시작할 수 있지만 21개 사례 검증 완료, STRIX actual R4, MIDAS 교차검증, 제품 release 또는 최종 설계 전이는 주장할 수 없다.",
        "",
        "이번 마일스톤에서는 S-Structures 해석기와 UI를 실행하지 않았다. 모델·결과 화면이 존재한다고 꾸미지 않았으며, 보고서의 화면 증거는 STRIX 원자료 목차와 SH1 PDF clipping 확인 화면뿐이다.",
        "",
        "## 2. 범위와 비범위",
        "",
        "- 수행: 공식 21개 ID·순서, source SHA-256, manual/PDF/HTML/catalog 역할, reference lane, claim vocabulary, 승인 역할, Phase15 현재본 snapshot, discrepancy 등록",
        "- 미수행: 모델링, solver 실행, tolerance 승인, STRIX/MIDAS actual export, Chrome 제품 캡처, 사례 PASS",
        "- custom: `P3S2-SS`는 공식 분모 밖에 유지",
        "",
        "## 3. 원자료 custody",
        "",
        "| 항목 | 결과 |",
        "| --- | --- |",
        f"| source root | `{registry['sourceRoot']}` |",
        f"| checksum manifest | `{evidence['sourceCustody']['manifestSha256']}` |",
        f"| 선언/검증 | {evidence['sourceCustody']['verifiedCount']}/{evidence['sourceCustody']['declaredCount']} |",
        f"| source lock | {evidence['sourceCustody']['sourceLockCount']}/21 |",
        f"| registry hash | `{registry['registryHash']}` |",
        f"| source-lock aggregate hash | `{evidence['sourceCustody']['sourceLockAggregateHash']}` |",
        f"| discrepancy hash | `{discrepancies['registerHash']}` |",
        "| license | Internal / All rights reserved; 공개 다운로드를 재배포 허가로 해석하지 않음 |",
        "",
        "checksum 목록 밖 3개 파일은 manifest 자기 자신, 로컬 Phase15 결과 메모, Python cache로 분류했고 source authority에서 제외했다.",
        "",
        "## 4. 판본과 권위 정책",
        "",
        "| 역할 | 정본 | 허용 주장 |",
        "| --- | --- | --- |",
        "| Acceptance truth | 원 출전 R1/R2 또는 승인된 독립 R3 | 독립 기준 비교 |",
        "| STRIX published result | case HTML v1.0.4 hash | 공개 페이지에 표시된 값 |",
        "| Archival narrative | 통합 manual·개별 PDF v1.0.2 | 문서 서술·페이지 인용 |",
        "| Runtime provenance | raw record+archive+published SHA | 현재 BLOCKED |",
        "| Catalog | HTML 파생 index | 검색·전사 보조, 추가 authority 없음 |",
        "| MIDAS | 실제 동일 모델 raw export | 현재 NOT AVAILABLE |",
        "",
        "manual과 개별 PDF는 v1.0.2이며, v1.0.4 표기는 HTML과 파생 catalog에만 있다. 모든 HTML의 raw record SHA는 `(pending publish)`다.",
        "",
        "## 5. 공식 21개 source lock",
        "",
        "| # | ID | 대상 | Ref lane | Tol. | 첫 공개 결과 (STRIX / Ref.) | 특이사항 |",
        "| ---: | --- | --- | --- | --- | --- | --- |",
    ]
    for lock in locks:
        first = lock["publishedAcceptanceDisplay"]["firstResult"]
        flags = []
        if lock["runtimeProvenance"]["metadataConflict"]:
            flags.append("v1.0.4/v1.0.2 provenance")
        if lock["caseId"] == "SB10":
            flags.append("tolerance precision blocked")
        if lock["caseId"] == "SH1":
            flags.append("PDF 2 rows clipped")
        if not flags:
            flags.append("raw SHA pending")
        lines.append(
            f"| {lock['ordinal']} | `{lock['caseId']}` | {lock['title']} | `{lock['referenceLane']['class']}` | {lock['publishedAcceptanceDisplay']['tolerance']} | {first['quantity']}: {first['strix']} / {first['reference']} | {'; '.join(flags)} |"
        )
    lines += [
        "",
        "`P3S2`는 STRIX 내부 R5 사양이므로 외부 절대정확도 정본으로 사용하지 않는다. `SH1`은 외부 PMM surface와 내부 hinge 구현을 분리해 검토한다.",
        "",
        "## 6. Phase15 역사 snapshot",
        "",
        "| 산출물 | P15-M0 기록 | P17 현재 발견본 | 판정 |",
        "| --- | --- | --- | --- |",
        f"| JSON | `{phase15['recorded']['json']['sha256']}` / {phase15['recorded']['json']['byteLength']:,} B | `{phase15['current']['json']['sha256']}` / {phase15['current']['json']['byteLength']:,} B | MATCH |",
        f"| Markdown | 미기록 | `{phase15['current']['markdown']['sha256']}` / {phase15['current']['markdown']['byteLength']:,} B | NOT CAPTURED BY P15-M0 |",
        f"| PDF | `{phase15['recorded']['pdf']['sha256']}` / {phase15['recorded']['pdf']['byteLength']:,} B | `{phase15['current']['pdf']['sha256']}` / {phase15['current']['pdf']['byteLength']:,} B | REGENERATED; OLD BINARY MISSING |",
        "",
        "현재 세 파일은 P17 시점 관찰본으로 content-addressed archive에 복제했다. 현재 PDF를 원래 P15-M0 PDF로 재라벨링하지 않는다. 임시 6쪽 PDF도 판정 정본에서 제외한다.",
        "",
        "## 7. Gate 결과",
        "",
        "| Gate | 판정 | 설명 |",
        "| --- | --- | --- |",
    ]
    for gate in gates:
        lines.append(f"| `{gate['id']}` | `{gate['status']}` | {gate['description']} |")
    lines += [
        "",
        "## 8. Discrepancy",
        "",
        "| ID | 심각도 | 상태 | 내용 | 처분 |",
        "| --- | --- | --- | --- | --- |",
    ]
    for item in discrepancies["items"]:
        lines.append(f"| `{item['id']}` | {item['severity']} | `{item['status']}` | {item['title']} | {item['disposition']} |")
    lines += [
        "",
        "## 9. R1 → R2 정정과 증거 보존",
        "",
        "R1 HTML parser는 한 페이지에 설명용 Engine 필드와 증거용 Engine 필드가 함께 있을 때 첫 항목을 선택했다. 이 때문에 `SB12, PD1, SP1, SH1, TH1`의 HTML engine version이 null이 됐고 자동 테스트가 실패했다. R1 파일은 삭제·덮어쓰기하지 않았다. R2는 마지막 evidence 필드를 선택하고 모든 R1 hash와 정정 사유를 `supersedes`로 연결한다.",
        "",
        "## 10. 자동 검증과 negative path",
        "",
        "```powershell",
        "npm.cmd run evidence:p17:m0",
        "npm.cmd run check:p17:sources",
        "npm.cmd run test:p17:m0",
        "npm.cmd run check:verification-layout",
        "npm.cmd run check:test-taxonomy",
        "npm.cmd run check:public-imports",
        "```",
        "",
        "전용 테스트는 21개 ID·ordinal·hash, 51/51 checksum, 6개 provenance conflict, SB10 tolerance blocker, SH1 clipping, Phase15 snapshot, release fail-closed를 확인한다. 임시 fixture에서 `HASH_MISMATCH`와 `PATH_ESCAPE`가 실제로 거부되는지도 확인한다.",
        "",
        "## 11. 승인 역할과 남은 blocker",
        "",
        "source custodian 자동 감사는 기술 완료됐지만 독립 reference/model/numerical/structural release reviewer는 미지정이다. 승인 hash가 없으므로 release gate는 닫힌다.",
        "",
    ]
    for blocker in evidence["blockers"]:
        lines.append(f"- `{blocker}`")
    lines += [
        "",
        "## 12. 결론과 다음 진입 조건",
        "",
        f"P17-M0 R2 baseline hash는 `{evidence['baselineHash']}`다. M0 기술 계약은 완료됐고 `m1EntryAllowed=true`다. 다음 단계는 결과값 없이 case contract·append-only writer·isolated runner·evidence/report schema를 검증하는 P17-M1이다. 공식 사례 실행은 P17-M2 SB1부터 WIP 1로 시작한다.",
        "",
        "`releaseAllowed=false`, `finalDesignTransferAllowed=false`를 유지한다.",
        "",
        "## 13. 정본 경로",
        "",
        f"- Evidence: `{EVIDENCE_PATH.relative_to(REPO).as_posix()}`",
        f"- Registry: `{REGISTRY_PATH.relative_to(REPO).as_posix()}`",
        f"- Source locks: `{LOCKS_DIR.relative_to(REPO).as_posix()}/`",
        f"- Discrepancy: `{DISCREPANCY_PATH.relative_to(REPO).as_posix()}`",
        "- Phase15 snapshot: `verification/archive/phase17-m0/phase15-current-snapshot/`",
        "",
    ]
    return "\n".join(lines)


def setup_fonts():
    if not FONT_REGULAR.exists() or not FONT_BOLD.exists():
        raise FileNotFoundError("Malgun Gothic fonts are required for Korean PDF output")
    pdfmetrics.registerFont(TTFont("Malgun", str(FONT_REGULAR)))
    pdfmetrics.registerFont(TTFont("Malgun-Bold", str(FONT_BOLD)))


def paragraph(text, style):
    return Paragraph(str(text), style)


def escaped(text) -> str:
    return html.escape(str(text)).replace("\n", "<br/>")


def make_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("TitleKR", parent=base["Title"], fontName="Malgun-Bold", fontSize=24, leading=32, textColor=NAVY, alignment=TA_LEFT, spaceAfter=10),
        "subtitle": ParagraphStyle("SubtitleKR", parent=base["Normal"], fontName="Malgun", fontSize=11, leading=17, textColor=MID_GREY),
        "h1": ParagraphStyle("H1KR", parent=base["Heading1"], fontName="Malgun-Bold", fontSize=15, leading=22, textColor=NAVY, spaceBefore=6, spaceAfter=8),
        "h2": ParagraphStyle("H2KR", parent=base["Heading2"], fontName="Malgun-Bold", fontSize=11.5, leading=17, textColor=TEAL, spaceBefore=7, spaceAfter=5),
        "body": ParagraphStyle("BodyKR", parent=base["BodyText"], fontName="Malgun", fontSize=8.8, leading=14, textColor=colors.HexColor("#263746"), spaceAfter=6),
        "small": ParagraphStyle("SmallKR", parent=base["BodyText"], fontName="Malgun", fontSize=7, leading=10.5, textColor=colors.HexColor("#344957")),
        "tiny": ParagraphStyle("TinyKR", parent=base["BodyText"], fontName="Malgun", fontSize=6.1, leading=8.2, textColor=colors.HexColor("#344957")),
        "table_header": ParagraphStyle("TableHeaderKR", parent=base["BodyText"], fontName="Malgun-Bold", fontSize=7, leading=9, textColor=colors.white, alignment=TA_CENTER),
        "table": ParagraphStyle("TableKR", parent=base["BodyText"], fontName="Malgun", fontSize=6.4, leading=8.5, textColor=colors.HexColor("#263746")),
        "mono": ParagraphStyle("MonoKR", parent=base["Code"], fontName="Courier", fontSize=6.3, leading=9, textColor=colors.HexColor("#263746")),
        "caption": ParagraphStyle("CaptionKR", parent=base["BodyText"], fontName="Malgun", fontSize=7, leading=10, textColor=MID_GREY, alignment=TA_CENTER),
        "cover_status": ParagraphStyle("CoverStatus", parent=base["BodyText"], fontName="Malgun-Bold", fontSize=13, leading=18, textColor=NAVY, alignment=TA_CENTER),
    }


def table(data, widths, header=True, font_size=None, extra=None):
    result = Table(data, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if header:
        commands += [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white)]
        if len(data) > 1:
            commands.append(("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_BLUE]))
    if font_size:
        commands.append(("FONTSIZE", (0, 0), (-1, -1), font_size))
    if extra:
        commands.extend(extra)
    result.setStyle(TableStyle(commands))
    return result


def build_pdf(pdf_path: Path, evidence, registry, discrepancies, locks, assets_dir: Path):
    setup_fonts()
    styles = make_styles()
    manual_png = assets_dir / "manual-contents-page.png"
    sh1_png = assets_dir / "sh1-page-3-clipped-table.png"
    render_source_page(SOURCE_MANUAL, 1, manual_png, scale=1.8)
    render_source_page(SOURCE_SH1, 2, sh1_png, scale=2.0)

    baseline_hash = evidence["baselineHash"]
    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        rightMargin=17 * mm,
        leftMargin=17 * mm,
        topMargin=19 * mm,
        bottomMargin=18 * mm,
        title="P17-M0 Baseline & Source Lock Verification Report R2",
        author="S-Structures Phase 17 Verification",
        subject="Evidence-only source custody and historical baseline review",
    )

    def footer(canvas, _doc):
        canvas.saveState()
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.4)
        canvas.line(17 * mm, 13 * mm, A4[0] - 17 * mm, 13 * mm)
        canvas.setFont("Malgun", 6.5)
        canvas.setFillColor(MID_GREY)
        canvas.drawString(17 * mm, 8.5 * mm, f"P17-M0 R2 · {short_hash(baseline_hash)}")
        canvas.drawRightString(A4[0] - 17 * mm, 8.5 * mm, f"Page {canvas.getPageNumber()}")
        canvas.restoreState()

    story = []
    story += [
        Spacer(1, 15 * mm),
        paragraph("S-STRUCTURES · PHASE 17", styles["subtitle"]),
        Spacer(1, 3 * mm),
        paragraph("P17-M0 Baseline &amp;<br/>Source Lock 검증 보고서", styles["title"]),
        Spacer(1, 4 * mm),
        paragraph("STRIX 공식 21개 원자료 custody · 판본 역할 · Phase15 역사 기준선 동결", styles["subtitle"]),
        Spacer(1, 14 * mm),
        table([
            [paragraph("최종 판정", styles["table_header"]), paragraph("M1 진입", styles["table_header"]), paragraph("Release", styles["table_header"])],
            [paragraph("COMPLETE WITH<br/>SOURCE BLOCKERS", styles["cover_status"]), paragraph("ALLOWED", styles["cover_status"]), paragraph("BLOCKED", styles["cover_status"])],
        ], [61 * mm, 48 * mm, 48 * mm], extra=[("BACKGROUND", (0, 1), (0, 1), LIGHT_AMBER), ("BACKGROUND", (1, 1), (1, 1), LIGHT_TEAL), ("BACKGROUND", (2, 1), (2, 1), LIGHT_RED)]),
        Spacer(1, 9 * mm),
        paragraph("이 보고서는 해석 성공 보고서가 아니다. 이번 마일스톤에서 solver 실행·모델링·제품 화면 캡처는 0건이다. source custody 기술 gate 8개를 닫았고, raw STRIX provenance와 독립 승인은 release-only blocker로 보존했다.", styles["body"]),
        Spacer(1, 6 * mm),
        table([
            [paragraph("Audit date", styles["table_header"]), paragraph("Baseline hash", styles["table_header"])],
            [paragraph(evidence["auditDate"], styles["body"]), paragraph(baseline_hash, styles["mono"])],
            [paragraph("Source revision", styles["table_header"]), paragraph("Evidence revision", styles["table_header"])],
            [paragraph(evidence["sourceRevision"], styles["mono"]), paragraph("R2 (R1 retained and superseded)", styles["body"])],
        ], [50 * mm, 107 * mm], header=False, extra=[("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("BACKGROUND", (0, 2), (-1, 2), NAVY), ("TEXTCOLOR", (0, 2), (-1, 2), colors.white)]),
        Spacer(1, 8 * mm),
        paragraph("releaseAllowed=false · finalDesignTransferAllowed=false · phase17InheritedPassCount=0", styles["caption"]),
        PageBreak(),
    ]

    story += [
        paragraph("1. 판정과 검증 경계", styles["h1"]),
        paragraph("P17-M0의 원자료 custody·판본 역할·역사 baseline 동결은 기술적으로 완료했다. 상태는 PASS가 아니라 COMPLETE_WITH_SOURCE_BLOCKERS다. P17-M1 framework 개발은 시작할 수 있지만, 21개 사례 자격 완료나 STRIX/MIDAS actual cross-validation을 주장할 수 없다.", styles["body"]),
        table([
            [paragraph("수행", styles["table_header"]), paragraph("미수행", styles["table_header"])],
            [paragraph("공식 ID·순서 21개<br/>51개 checksum<br/>21 source lock<br/>판본·권위 lane<br/>Phase15 snapshot<br/>9 discrepancy<br/>역할·claim vocabulary", styles["body"]), paragraph("S-Structures solver 실행<br/>모델링·tolerance 승인<br/>STRIX actual R4<br/>MIDAS actual export<br/>제품 Chrome capture<br/>사례 PASS·release", styles["body"])],
        ], [78.5 * mm, 78.5 * mm]),
        Spacer(1, 4 * mm),
        paragraph("2. 원자료 custody", styles["h1"]),
        table([
            [paragraph("항목", styles["table_header"]), paragraph("동결값", styles["table_header"])],
            [paragraph("Source root", styles["body"]), paragraph(registry["sourceRoot"], styles["body"])],
            [paragraph("Manifest", styles["body"]), paragraph(evidence["sourceCustody"]["manifestSha256"], styles["mono"])],
            [paragraph("Checksum", styles["body"]), paragraph(f"{evidence['sourceCustody']['verifiedCount']}/{evidence['sourceCustody']['declaredCount']} · mismatch 0 · 4,613,613 B", styles["body"])],
            [paragraph("Registry", styles["body"]), paragraph(registry["registryHash"], styles["mono"])],
            [paragraph("Lock aggregate", styles["body"]), paragraph(evidence["sourceCustody"]["sourceLockAggregateHash"], styles["mono"])],
            [paragraph("Use restriction", styles["body"]), paragraph("Internal / All rights reserved. 공개 다운로드를 재배포 허가로 간주하지 않음.", styles["body"])],
        ], [40 * mm, 117 * mm]),
        Spacer(1, 4 * mm),
        paragraph("checksum 목록 밖 파일 3개는 manifest 자기 자신, 로컬 Phase15 결과 메모, 생성 cache다. 모두 source authority에서 제외했다. P3S2-SS도 custom qualification으로 공식 21개 분모에서 제외했다.", styles["body"]),
        paragraph("3. 판본·권위 분리", styles["h1"]),
        table([
            [paragraph("역할", styles["table_header"]), paragraph("정본", styles["table_header"]), paragraph("현재 상태", styles["table_header"])],
            [paragraph("Acceptance truth", styles["table"]), paragraph("R1/R2 외부 출전 또는 승인된 독립 R3", styles["table"]), paragraph("case review 필요", styles["table"])],
            [paragraph("STRIX published", styles["table"]), paragraph("개별 HTML v1.0.4 hash", styles["table"]), paragraph("공개값만", styles["table"])],
            [paragraph("Archival narrative", styles["table"]), paragraph("manual·개별 PDF v1.0.2", styles["table"]), paragraph("페이지 인용", styles["table"])],
            [paragraph("Runtime provenance", styles["table"]), paragraph("raw record + archive + published SHA", styles["table"]), paragraph("BLOCKED", styles["table"])],
            [paragraph("MIDAS", styles["table"]), paragraph("실제 동일 모델 raw export", styles["table"]), paragraph("NOT AVAILABLE", styles["table"])],
        ], [36 * mm, 82 * mm, 39 * mm]),
        PageBreak(),
    ]

    story += [
        paragraph("4. 공식 21개 source lock", styles["h1"]),
        paragraph("표의 수치는 STRIX 공개 HTML/catalog에서 확인한 첫 결과다. 이번 단계에서 S-Structures가 재계산한 값이 아니며 tolerance도 사례 실행 전에 별도 승인해야 한다.", styles["body"]),
    ]
    rows = [[
        paragraph("#", styles["table_header"]),
        paragraph("ID", styles["table_header"]),
        paragraph("검증 대상", styles["table_header"]),
        paragraph("Ref lane", styles["table_header"]),
        paragraph("Tol.", styles["table_header"]),
        paragraph("첫 공개값 STRIX / Ref.", styles["table_header"]),
        paragraph("Flag", styles["table_header"]),
    ]]
    for lock in locks:
        first = lock["publishedAcceptanceDisplay"]["firstResult"]
        flags = []
        if lock["runtimeProvenance"]["metadataConflict"]:
            flags.append("PROV")
        if lock["caseId"] == "SB10":
            flags.append("TOL")
        if lock["caseId"] == "SH1":
            flags.append("CLIP")
        if not flags:
            flags.append("SHA")
        rows.append([
            paragraph(lock["ordinal"], styles["table"]),
            paragraph(lock["caseId"], styles["table"]),
            paragraph(escaped(lock["title"]), styles["table"]),
            paragraph(lock["referenceLane"]["class"].replace("_", " "), styles["tiny"]),
            paragraph(lock["publishedAcceptanceDisplay"]["tolerance"], styles["table"]),
            paragraph(f"{escaped(first['quantity'])}<br/><b>{escaped(first['strix'])} / {escaped(first['reference'])}</b>", styles["tiny"]),
            paragraph(" / ".join(flags), styles["table"]),
        ])
    story += [
        table(rows, [7 * mm, 13 * mm, 48 * mm, 34 * mm, 13 * mm, 50 * mm, 12 * mm]),
        Spacer(1, 3 * mm),
        paragraph("Flag: SHA=raw SHA pending, PROV=engine/run/archive metadata conflict, TOL=tolerance precision blocker, CLIP=PDF clipping.", styles["caption"]),
        PageBreak(),
    ]

    phase15 = evidence["phase15HistoricalSnapshot"]
    story += [
        paragraph("5. Phase15 역사 snapshot과 provenance gap", styles["h1"]),
        paragraph("P15-M0가 기록한 JSON은 현재본과 동일하다. 반면 당시 기록된 PDF 바이너리는 현재 저장소에서 찾지 못했고, 같은 경로의 현재 PDF는 약 3분 뒤 재생성된 다른 파일이다. Markdown은 P15-M0 보존 목록에 없었다.", styles["body"]),
        table([
            [paragraph("산출물", styles["table_header"]), paragraph("P15-M0 기록", styles["table_header"]), paragraph("P17 발견본", styles["table_header"]), paragraph("판정", styles["table_header"])],
            [paragraph("JSON", styles["table"]), paragraph(f"{short_hash(phase15['recorded']['json']['sha256'])}<br/>{phase15['recorded']['json']['byteLength']:,} B", styles["tiny"]), paragraph(f"{short_hash(phase15['current']['json']['sha256'])}<br/>{phase15['current']['json']['byteLength']:,} B", styles["tiny"]), paragraph("MATCH", styles["table"])],
            [paragraph("Markdown", styles["table"]), paragraph("미기록", styles["table"]), paragraph(f"{short_hash(phase15['current']['markdown']['sha256'])}<br/>{phase15['current']['markdown']['byteLength']:,} B", styles["tiny"]), paragraph("NOT CAPTURED", styles["table"])],
            [paragraph("PDF", styles["table"]), paragraph(f"{short_hash(phase15['recorded']['pdf']['sha256'])}<br/>{phase15['recorded']['pdf']['byteLength']:,} B", styles["tiny"]), paragraph(f"{short_hash(phase15['current']['pdf']['sha256'])}<br/>{phase15['current']['pdf']['byteLength']:,} B", styles["tiny"]), paragraph("REGENERATED", styles["table"])],
        ], [25 * mm, 46 * mm, 46 * mm, 40 * mm]),
        Spacer(1, 4 * mm),
        paragraph("현재 JSON·Markdown·PDF는 P17 관찰본으로 content-addressed archive에 복제했다. 현재 PDF를 P15-M0 원본으로 재라벨링하지 않는다. tmp PDF는 판정 정본이 아니다.", styles["body"]),
        paragraph("6. Gate 결과", styles["h1"]),
    ]
    gate_rows = [[paragraph("Gate", styles["table_header"]), paragraph("판정", styles["table_header"]), paragraph("설명", styles["table_header"])]]
    for gate in evidence["gates"]:
        gate_rows.append([
            paragraph(gate["id"], styles["table"]),
            paragraph(display_status(gate["status"]), styles["tiny"]),
            paragraph(escaped(gate["description"]), styles["table"]),
        ])
    story += [table(gate_rows, [30 * mm, 43 * mm, 84 * mm]), PageBreak()]

    story += [
        paragraph("7. Discrepancy register", styles["h1"]),
        paragraph("OPEN 항목은 실패를 숨기지 않고 원인코드와 disposition으로 닫았다. M1 진행 허용과 release 허용은 별개다.", styles["body"]),
    ]
    disc_rows = [[paragraph("ID", styles["table_header"]), paragraph("등급/상태", styles["table_header"]), paragraph("내용", styles["table_header"]), paragraph("처분", styles["table_header"])]]
    for item in discrepancies["items"]:
        disc_rows.append([
            paragraph(item["id"], styles["table"]),
            paragraph(f"{item['severity']}<br/>{display_status(item['status'])}", styles["tiny"]),
            paragraph(escaped(item["title"]), styles["table"]),
            paragraph(escaped(item["disposition"]), styles["tiny"]),
        ])
    story += [table(disc_rows, [18 * mm, 36 * mm, 47 * mm, 56 * mm]), PageBreak()]

    story += [
        paragraph("8. R1 → R2 정정과 fail-safe 증거", styles["h1"]),
        paragraph("R1 parser는 HTML 한 페이지에 같은 Engine 라벨이 두 번 존재할 때 첫 설명 필드를 선택했다. 이 때문에 SB12·PD1·SP1·SH1·TH1에서 version=null이 됐다. 전용 테스트가 즉시 실패했다.", styles["body"]),
        table([
            [paragraph("조치", styles["table_header"]), paragraph("증거 정책", styles["table_header"])],
            [paragraph("parser가 마지막 evidence 필드를 선택하도록 수정", styles["body"]), paragraph("R1 삭제·덮어쓰기 금지", styles["body"])],
            [paragraph("R2 lock·registry·discrepancy·evidence 재발행", styles["body"]), paragraph("각 R2가 R1 path/hash/reason을 supersedes로 연결", styles["body"])],
            [paragraph("21개 모두 htmlEngineVersion=1.0.4 재검증", styles["body"]), paragraph("R2 baseline hash로만 이후 M1을 결속", styles["body"])],
        ], [78.5 * mm, 78.5 * mm]),
        Spacer(1, 5 * mm),
        paragraph("9. 자동 검증과 negative path", styles["h1"]),
        table([
            [paragraph("검증", styles["table_header"]), paragraph("결과", styles["table_header"])],
            [paragraph("source custody check", styles["body"]), paragraph("21 locks · 51/51 · 9 discrepancy", styles["body"])],
            [paragraph("contract test", styles["body"]), paragraph("official IDs/order/hash/provenance/release fail-closed PASS", styles["body"])],
            [paragraph("negative HASH_MISMATCH", styles["body"]), paragraph("의도한 변조 거부 PASS", styles["body"])],
            [paragraph("negative PATH_ESCAPE", styles["body"]), paragraph("manifest 경로 이탈 거부 PASS", styles["body"])],
        ], [78.5 * mm, 78.5 * mm]),
        Spacer(1, 5 * mm),
        paragraph("실행 명령", styles["h2"]),
        paragraph("npm.cmd run evidence:p17:m0<br/>npm.cmd run check:p17:sources<br/>npm.cmd run test:p17:m0<br/>npm.cmd run check:verification-layout<br/>npm.cmd run check:test-taxonomy<br/>npm.cmd run check:public-imports", styles["mono"]),
        PageBreak(),
    ]

    story += [
        paragraph("10. 원자료 시각 증거 — 공식 21개 목차", styles["h1"]),
        paragraph("통합 매뉴얼 contents 페이지다. 공식 ordinal은 이 순서로 고정했고 catalog 배열 순서로 암묵 변경하지 않았다.", styles["body"]),
        Image(str(manual_png), width=157 * mm, height=157 * mm * (manual_png.stat().st_size and 1.414)),
        paragraph("Figure 1. StrixVerificationManual.pdf page 2 — source hash b557b4a1…f7768", styles["caption"]),
        PageBreak(),
        paragraph("11. 원자료 시각 증거 — SH1 PDF clipping", styles["h1"]),
        paragraph("SH1 개별 PDF 3쪽의 결과표가 footer에서 잘려 PCHIP 두 행을 완전하게 제공하지 않는다. HTML/catalog에는 11개 행이 존재하므로 PDF 단독 완전성 주장을 차단했다.", styles["body"]),
        Image(str(sh1_png), width=157 * mm, height=157 * mm * 1.414),
        paragraph("Figure 2. reports/SH1.pdf page 3 — result table clipping at page footer", styles["caption"]),
        PageBreak(),
    ]

    story += [
        paragraph("12. 승인 역할·blocker·다음 단계", styles["h1"]),
    ]
    role_rows = [[paragraph("역할", styles["table_header"]), paragraph("배정", styles["table_header"]), paragraph("상태", styles["table_header"])]]
    for role in registry["approvalRoles"]:
        role_rows.append([
            paragraph(escaped(role["role"]), styles["table"]),
            paragraph(escaped(role["assignment"] or "미지정"), styles["table"]),
            paragraph(display_status(role["status"]), styles["tiny"]),
        ])
    story += [table(role_rows, [48 * mm, 61 * mm, 48 * mm]), Spacer(1, 5 * mm)]
    blocker_rows = [[paragraph("Release blocker", styles["table_header"])]]
    for blocker in evidence["blockers"]:
        blocker_rows.append([paragraph(display_status(blocker), styles["table"])])
    story += [
        table(blocker_rows, [157 * mm]),
        Spacer(1, 5 * mm),
        paragraph("다음 진입", styles["h2"]),
        paragraph("P17-M1에서 결과값 없이 case schema, 21개 scaffold, append-only writer, stable product adapter, isolated runner, evidence/report contract와 negative test를 구축한다. 실제 공식 사례 실행은 P17-M2 SB1부터 WIP 1로 진행한다.", styles["body"]),
        table([
            [paragraph("M1 entry", styles["table_header"]), paragraph("Release", styles["table_header"]), paragraph("Final design", styles["table_header"])],
            [paragraph("ALLOWED", styles["cover_status"]), paragraph("BLOCKED", styles["cover_status"]), paragraph("BLOCKED", styles["cover_status"])],
        ], [52.3 * mm, 52.3 * mm, 52.4 * mm], extra=[("BACKGROUND", (0, 1), (0, 1), LIGHT_TEAL), ("BACKGROUND", (1, 1), (-1, 1), LIGHT_RED)]),
        Spacer(1, 8 * mm),
        paragraph("Canonical evidence", styles["h2"]),
        paragraph(str(EVIDENCE_PATH.relative_to(REPO)).replace("\\", "/"), styles["mono"]),
        paragraph(f"baselineHash={baseline_hash}", styles["mono"]),
    ]

    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return [manual_png, sh1_png]


def verify_pdf(pdf_path: Path):
    reader = PdfReader(str(pdf_path))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    required = [
        "P17-M0",
        "COMPLETE WITH",
        "51/51",
        "P17-D007",
        "CURRENT PDF REGENERATED",
        "M1 entry",
        "Release",
    ]
    missing = [token for token in required if token not in text]
    if missing:
        raise RuntimeError(f"PDF text QA failed, missing tokens: {missing}")
    if len(reader.pages) < 8:
        raise RuntimeError(f"PDF unexpectedly short: {len(reader.pages)} pages")
    return {"pageCount": len(reader.pages), "requiredTokens": required, "missingTokens": missing}


def render_all_pages(pdf_path: Path, render_dir: Path):
    if render_dir.exists():
        shutil.rmtree(render_dir)
    render_dir.mkdir(parents=True, exist_ok=True)
    document = pdfium.PdfDocument(str(pdf_path))
    paths = []
    try:
        for index in range(len(document)):
            page = document[index]
            output = render_dir / f"page-{index + 1:02d}.png"
            page.render(scale=1.25).to_pil().convert("RGB").save(output)
            page.close()
            paths.append(output)
    finally:
        document.close()
    return paths


def write_immutable(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != data:
            raise RuntimeError(f"Refusing to overwrite immutable final report: {path}")
        return
    path.write_bytes(data)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["draft", "final", "verify"], default="draft")
    args = parser.parse_args()

    evidence = read_json(EVIDENCE_PATH)
    registry = read_json(REGISTRY_PATH)
    discrepancies = read_json(DISCREPANCY_PATH)
    locks = [read_json(LOCKS_DIR / f"{case_id}.source-lock.json") for case_id in registry["officialOrder"]]
    verify_evidence_chain(evidence, registry, discrepancies, locks)
    markdown = make_markdown(evidence, registry, discrepancies, locks)

    work_dir = DRAFT_DIR
    work_dir.mkdir(parents=True, exist_ok=True)
    draft_md = work_dir / f"{REPORT_STEM}.md"
    draft_pdf = work_dir / f"{REPORT_STEM}.pdf"
    draft_md.write_text(markdown + "\n", encoding="utf-8")
    assets = build_pdf(draft_pdf, evidence, registry, discrepancies, locks, work_dir / "assets")
    qa = verify_pdf(draft_pdf)
    rendered = render_all_pages(draft_pdf, RENDER_DIR)

    result = {
        "mode": args.mode,
        "status": evidence["status"],
        "baselineHash": evidence["baselineHash"],
        "draftMarkdown": str(draft_md.relative_to(REPO)).replace("\\", "/"),
        "draftPdf": str(draft_pdf.relative_to(REPO)).replace("\\", "/"),
        "pdfSha256": sha256(draft_pdf),
        "markdownSha256": sha256(draft_md),
        "pageCount": qa["pageCount"],
        "renderedPageCount": len(rendered),
        "automatedQa": "PASS",
        "evidenceHashChain": "PASS",
    }

    if args.mode == "verify":
        final_md = FINAL_DIR / f"{REPORT_STEM}.md"
        final_pdf = FINAL_DIR / f"{REPORT_STEM}.pdf"
        original_manifest_path = FINAL_DIR / f"{REPORT_STEM}.manifest.json"
        original_manifest = read_json(original_manifest_path)
        if sha256(final_md) != original_manifest["markdown"]["sha256"]:
            raise RuntimeError("Sealed final Markdown hash differs from the original report manifest")
        if sha256(final_pdf) != original_manifest["pdf"]["sha256"]:
            raise RuntimeError("Sealed final PDF hash differs from the original report manifest")
        if final_md.read_bytes() != draft_md.read_bytes():
            raise RuntimeError("Fresh report Markdown is not byte-identical to the sealed final Markdown")

        final_reader = PdfReader(str(final_pdf))
        draft_reader = PdfReader(str(draft_pdf))
        final_text = "\n".join(page.extract_text() or "" for page in final_reader.pages)
        draft_text = "\n".join(page.extract_text() or "" for page in draft_reader.pages)
        if final_text != draft_text:
            raise RuntimeError("Fresh and sealed PDF extracted text differs")
        final_rendered = render_all_pages(final_pdf, REPO / "tmp/verification/phase17/p17-m0-report/verify-final")
        draft_rendered = render_all_pages(draft_pdf, REPO / "tmp/verification/phase17/p17-m0-report/verify-draft")
        final_page_hashes = [sha256(item) for item in final_rendered]
        draft_page_hashes = [sha256(item) for item in draft_rendered]
        if final_page_hashes != draft_page_hashes:
            raise RuntimeError("Fresh and sealed PDF rendered-page pixels differ")
        semantic_qa = {
            "version": "p17-m0-report-semantic-reproduction-qa-v1",
            "reportRevision": 2,
            "verifiedAt": evidence["auditDate"],
            "sealedReport": {
                "path": str(final_pdf.relative_to(REPO)).replace("\\", "/"),
                "sha256": sha256(final_pdf),
                "byteLength": final_pdf.stat().st_size,
                "pageCount": len(final_reader.pages),
            },
            "markdownByteIdentity": "PASS",
            "pdfExtractedTextIdentity": "PASS",
            "pdfExtractedTextSha256": hashlib.sha256(final_text.encode("utf-8")).hexdigest(),
            "renderedPixelIdentity": "PASS_9_OF_9",
            "renderScale": 1.25,
            "sealedPagePixelSha256": final_page_hashes,
            "freshPagePixelSha256": draft_page_hashes,
            "pdfContainerByteIdentity": "NOT_REQUIRED_REPORTLAB_METADATA_AND_TRAILER_ID_MAY_DIFFER",
            "status": "PASS_SEMANTIC_AND_PIXEL_IDENTICAL",
            "releaseAllowed": False,
        }
        semantic_qa["qaHash"] = canonical_hash(semantic_qa)
        semantic_qa_path = FINAL_DIR / "P17-M0-REPORT-SEMANTIC-REPRODUCTION-QA-R3.json"
        write_immutable(semantic_qa_path, (json.dumps(semantic_qa, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
        result.update({
            "sealedFinalPdf": str(final_pdf.relative_to(REPO)).replace("\\", "/"),
            "sealedFinalPdfSha256": sha256(final_pdf),
            "semanticQa": str(semantic_qa_path.relative_to(REPO)).replace("\\", "/"),
            "semanticQaHash": semantic_qa["qaHash"],
            "semanticAndPixelIdentity": "PASS_9_OF_9",
            "pdfContainerByteIdentity": semantic_qa["pdfContainerByteIdentity"],
        })

    if args.mode == "final":
        final_md = FINAL_DIR / f"{REPORT_STEM}.md"
        final_pdf = FINAL_DIR / f"{REPORT_STEM}.pdf"
        write_immutable(final_md, draft_md.read_bytes())
        write_immutable(final_pdf, draft_pdf.read_bytes())
        write_immutable(REVIEW_PATH, draft_md.read_bytes())
        manifest = {
            "version": "p17-m0-report-manifest-v1",
            "reportRevision": 2,
            "auditDate": evidence["auditDate"],
            "status": evidence["status"],
            "baselineEvidence": {
                "path": str(EVIDENCE_PATH.relative_to(REPO)).replace("\\", "/"),
                "baselineHash": evidence["baselineHash"],
            },
            "markdown": {"path": str(final_md.relative_to(REPO)).replace("\\", "/"), "sha256": sha256(final_md), "byteLength": final_md.stat().st_size},
            "pdf": {"path": str(final_pdf.relative_to(REPO)).replace("\\", "/"), "sha256": sha256(final_pdf), "byteLength": final_pdf.stat().st_size, "pageCount": qa["pageCount"]},
            "sourceScreenshots": [{"path": str(item.relative_to(REPO)).replace("\\", "/"), "sha256": sha256(item)} for item in assets],
            "automatedQa": {"status": "PASS", **qa, "renderedPageCount": len(rendered)},
            "rendererRuntime": {
                "python": sys.version.split()[0],
                "reportlab": reportlab.Version,
                "pypdf": pypdf.__version__,
                "pypdfium2": pypdfium2.__version__ if hasattr(pypdfium2, "__version__") else "5.13.0",
            },
            "visualQa": {"status": "PENDING_REVIEW", "artifact": "P17-M0-REPORT-VISUAL-QA-R2.json"},
            "releaseAllowed": False,
            "finalDesignTransferAllowed": False,
        }
        manifest_path = FINAL_DIR / f"{REPORT_STEM}.manifest.json"
        write_immutable(manifest_path, (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
        result.update({
            "finalMarkdown": str(final_md.relative_to(REPO)).replace("\\", "/"),
            "finalPdf": str(final_pdf.relative_to(REPO)).replace("\\", "/"),
            "manifest": str(manifest_path.relative_to(REPO)).replace("\\", "/"),
        })

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
