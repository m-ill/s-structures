#!/usr/bin/env python3
"""Render the P17-M2 SB1 pre-execution readiness report.

This renderer consumes committed lock/gate artifacts only. It never imports the
product, invokes a solver, runs a benchmark, or manufactures result imagery.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

import reportlab
import pypdf
import pypdfium2
import pypdfium2 as pdfium
from PIL import Image as PillowImage
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

REPO = Path(__file__).resolve().parents[4]
OVERLAY = REPO / "verification/benchmarks/strix21/milestones/P17-M2/SB1"
PACKAGE_PATH = OVERLAY / "m2-case-package-r1.json"
GATE_PATH = OVERLAY / "gates/gate-assessment-r1.json"
EXPECTED_PATH = OVERLAY / "reference/expected-values-r1.json"
TOLERANCE_PATH = OVERLAY / "reference/tolerance-manifest-r1.json"
PROBE_PATH = OVERLAY / "reference/probe-manifest-r1.json"
CANONICAL_PATH = OVERLAY / "model/canonical-input-r1.json"
EQUIVALENCE_PATH = OVERLAY / "model/model-equivalence-r1.json"
BYTE_AUDIT_PATH = OVERLAY / "source/reference-byte-audit-r1.json"
TRUST_PATH = REPO / "verification/benchmarks/strix21/trust/external-custodian-trust-registry.json"
FINAL_DIR = REPO / "output/verification/phase17"
WORK_DIR = REPO / "tmp/verification/phase17/p17-m2-sb1-readiness"
DRAFT_DIR = WORK_DIR / "draft"
RENDER_DIR = WORK_DIR / "rendered"
STEM = "P17-M2-SB1-READINESS-REPORT-R1"
QA_PATH = WORK_DIR / f"{STEM}.qa-r1.json"
FINAL_QA = FINAL_DIR / f"{STEM}.qa-r1.json"
FONT_REGULAR = Path("C:/Windows/Fonts/malgun.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/malgunbd.ttf")

NAVY = colors.HexColor("#17324D")
TEAL = colors.HexColor("#007C83")
GREEN = colors.HexColor("#22865A")
AMBER = colors.HexColor("#B86E00")
RED = colors.HexColor("#B13A3A")
GREY = colors.HexColor("#657786")
LIGHT = colors.HexColor("#F5F7F8")
LIGHT_BLUE = colors.HexColor("#EBF3F8")
LIGHT_TEAL = colors.HexColor("#E8F5F3")
LIGHT_AMBER = colors.HexColor("#FFF5D9")
LIGHT_RED = colors.HexColor("#FCECEC")
LINE = colors.HexColor("#C9D4DC")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_hash(value) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def relative(path: Path) -> str:
    return path.relative_to(REPO).as_posix()


def verify_inputs():
    package = read_json(PACKAGE_PATH)
    gates = read_json(GATE_PATH)
    if package["status"] != "CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL":
        raise RuntimeError("Unexpected M2 package status")
    if gates["status"] != "BLOCKED_PRE_EXECUTION" or gates["executionAuthorized"] is not False:
        raise RuntimeError("Renderer refuses an unexpected execution authorization state")
    if gates["assessmentHash"] != canonical_hash({k: v for k, v in gates.items() if k != "assessmentHash"}):
        raise RuntimeError("Gate assessment self-hash mismatch")
    if package["gateAssessmentHash"] != gates["assessmentHash"]:
        raise RuntimeError("Package/gate binding mismatch")
    counters = package["counters"]
    forbidden = ("officialExecutionCount", "solverExecutionCount", "benchmarkExecutionCount", "engineeringResultCount", "caseReportCount", "officialPassCount")
    if any(counters[key] != 0 for key in forbidden):
        raise RuntimeError("Pre-execution report requires all engineering execution counters to remain zero")
    bound = {row["path"]: row for row in package["artifacts"]}
    for repository_path, binding in bound.items():
        path = (REPO / repository_path).resolve(strict=True)
        path.relative_to(REPO.resolve())
        if path.stat().st_size != binding["byteLength"] or sha256_file(path) != binding["sha256"]:
            raise RuntimeError(f"Package artifact binding mismatch: {repository_path}")
    return {
        "package": package,
        "gates": gates,
        "expected": read_json(EXPECTED_PATH),
        "tolerance": read_json(TOLERANCE_PATH),
        "probes": read_json(PROBE_PATH),
        "canonical": read_json(CANONICAL_PATH),
        "equivalence": read_json(EQUIVALENCE_PATH),
        "byteAudit": read_json(BYTE_AUDIT_PATH),
        "trust": read_json(TRUST_PATH),
    }


def register_fonts():
    if not FONT_REGULAR.exists() or not FONT_BOLD.exists():
        raise RuntimeError("Required Malgun Gothic fonts are unavailable")
    pdfmetrics.registerFont(TTFont("Malgun", str(FONT_REGULAR)))
    pdfmetrics.registerFont(TTFont("MalgunBold", str(FONT_BOLD)))


def styles():
    register_fonts()
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("title", parent=base["Title"], fontName="MalgunBold", fontSize=25, leading=33, textColor=NAVY, alignment=TA_LEFT, spaceAfter=10),
        "h1": ParagraphStyle("h1", parent=base["Heading1"], fontName="MalgunBold", fontSize=16, leading=22, textColor=NAVY, spaceAfter=8),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="MalgunBold", fontSize=11, leading=16, textColor=TEAL, spaceBefore=5, spaceAfter=5),
        "body": ParagraphStyle("body", parent=base["BodyText"], fontName="Malgun", fontSize=8.4, leading=13, textColor=NAVY, spaceAfter=5),
        "small": ParagraphStyle("small", parent=base["BodyText"], fontName="Malgun", fontSize=6.8, leading=9.5, textColor=GREY),
        "cell": ParagraphStyle("cell", parent=base["BodyText"], fontName="Malgun", fontSize=6.8, leading=9, textColor=NAVY),
        "cellb": ParagraphStyle("cellb", parent=base["BodyText"], fontName="MalgunBold", fontSize=6.8, leading=9, textColor=NAVY),
        "banner": ParagraphStyle("banner", parent=base["BodyText"], fontName="MalgunBold", fontSize=12, leading=17, textColor=RED, alignment=TA_CENTER),
        "number": ParagraphStyle("number", parent=base["BodyText"], fontName="MalgunBold", fontSize=20, leading=24, textColor=NAVY, alignment=TA_CENTER),
    }


def p(text, style):
    safe = str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
    return Paragraph(safe, style)


def table(rows, widths, header=True, extra=None):
    if header:
        header_style = ParagraphStyle("dynamic_header", fontName="MalgunBold", fontSize=6.8, leading=9, textColor=colors.white)
        rows = [[Paragraph(cell.getPlainText(), header_style) if isinstance(cell, Paragraph) else Paragraph(str(cell), header_style) for cell in rows[0]], *rows[1:]]
    result = Table(rows, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("GRID", (0, 0), (-1, -1), 0.45, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if header:
        commands += [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white)]
    if extra:
        commands += extra
    result.setStyle(TableStyle(commands))
    return result


class StableCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        kwargs["invariant"] = 1
        kwargs["pageCompression"] = 1
        super().__init__(*args, **kwargs)


def footer(canv, doc):
    canv.saveState()
    width, height = A4
    canv.setStrokeColor(LINE)
    canv.line(20 * mm, 14 * mm, width - 20 * mm, 14 * mm)
    canv.setFont("Malgun", 6.5)
    canv.setFillColor(GREY)
    canv.drawString(20 * mm, 9.5 * mm, "S-Structures / P17-M2 / SB1 pre-execution readiness")
    canv.drawRightString(width - 20 * mm, 9.5 * mm, f"Page {doc.page}")
    if doc.page > 1:
        canv.setFont("MalgunBold", 6.4)
        canv.setFillColor(RED)
        canv.drawRightString(width - 20 * mm, height - 12.5 * mm, "NO SOLVER / NO BENCHMARK RUN / RELEASE BLOCKED")
    canv.restoreState()


def metric_label(metric_id):
    return {"tip-uz": "N2 tip uz", "tip-ry": "N2 tip ry", "support-rz": "N1 reaction Rz", "support-my": "N1 reaction My"}[metric_id]


def make_markdown(data):
    g = data["gates"]
    values = [row for row in data["expected"]["values"] if row["lane"] == "PRIMARY_INDEPENDENT"]
    lines = [
        "# P17-M2 SB1 실행 준비 보고서 R1", "", f"상태: **{data['package']['status']}** / **{g['status']}**", "",
        "> NO SOLVER / NO BENCHMARK RUN / RELEASE BLOCKED", "",
        "이 문서는 SB1 공식 실행 전 잠금·감사 준비 상태를 기록한다. S-Structures 해석 결과나 벤치마크 PASS를 주장하지 않는다.", "",
        "## 실행 카운터", "", "| 공식 실행 | 해석기 실행 | 벤치마크 실행 | 공학 결과 | 사례 보고서 |", "|---:|---:|---:|---:|---:|",
        "| 0 | 0 | 0 | 0 | 0 |", "", "## 잠긴 독립 기준값", "", "| 응답 | 값 | 단위 |", "|---|---:|---|",
    ]
    lines += [f"| {metric_label(row['metricId'])} | {row['value']:.16g} | {row['unit']} |" for row in values]
    lines += ["", "## 8개 게이트", "", "| 게이트 | 준비 | 종결 증거 |", "|---|---|---|"]
    lines += [f"| {row['id']} | {row['readinessStatus']} | {row['terminalEvidenceStatus']} |" for row in g["gates"]]
    lines += ["", "## 현재 차단 조건", ""] + [f"- {item}" for item in g["externalDependencies"]]
    lines += ["", "외부 신뢰 레지스트리와 out-of-band SHA-256 pin, 독립 검토자 서명 전에는 공식 실행이 허용되지 않는다.", ""]
    return "\n".join(lines)


def build_pdf(pdf_path: Path, data):
    s = styles()
    g, package = data["gates"], data["package"]
    primary = [row for row in data["expected"]["values"] if row["lane"] == "PRIMARY_INDEPENDENT"]
    published = [row for row in data["expected"]["values"] if row["lane"] == "STRIX_PUBLISHED"]
    doc = SimpleDocTemplate(str(pdf_path), pagesize=A4, leftMargin=20*mm, rightMargin=20*mm, topMargin=20*mm, bottomMargin=19*mm,
                            title="P17-M2 SB1 실행 준비 보고서 R1", author="S-Structures Phase 17 Verification",
                            subject="Pre-execution lock and readiness evidence; no solver or benchmark run")
    story = [Spacer(1, 12*mm), p("S-STRUCTURES / PHASE 17", s["h2"]), p("P17-M2 SB1\n실행 준비 보고서", s["title"]),
             p("Euler–Bernoulli 1D cantilever tip-deflection benchmark — content lock and external-approval boundary", s["body"]), Spacer(1, 8*mm),
             table([[p("MILESTONE STATUS", s["cellb"]), p("GATE STATUS", s["cellb"]), p("RELEASE", s["cellb"])],
                    [p("CONTENT LOCKED\nPENDING EXTERNAL APPROVAL", s["cell"]), p(g["status"], s["cell"]), p("BLOCKED", s["cellb"])]], [55*mm, 55*mm, 47*mm],
                   extra=[("BACKGROUND", (0,1),(0,1),LIGHT_TEAL),("BACKGROUND",(1,1),(1,1),LIGHT_AMBER),("BACKGROUND",(2,1),(2,1),LIGHT_RED)]),
             Spacer(1, 8*mm), p("NO SOLVER / NO BENCHMARK RUN / RELEASE BLOCKED", s["banner"]), Spacer(1, 8*mm),
             table([[p("공식 실행", s["cellb"]), p("해석기 실행", s["cellb"]), p("벤치마크", s["cellb"]), p("공학 결과", s["cellb"])],
                    [p("0", s["number"]), p("0", s["number"]), p("0", s["number"]), p("0", s["number"])]], [39.25*mm]*4,
                   extra=[("BACKGROUND", (0,1),(-1,1),LIGHT_BLUE)]), Spacer(1, 8*mm),
             p("이 보고서는 SB1 모델·출전·기준값·허용오차·결과 probe를 실행 전에 고정한 증거다. S-Structures의 실제 해석 결과, STRIX R4 재실행, MIDAS 결과 또는 벤치마크 PASS를 포함하지 않는다.", s["body"]),
             PageBreak(), p("1. 원자료와 독립 기준식", s["h1"]),
             p("원자료 HTML, STRIX 검증 매뉴얼, SB1 사례 PDF의 byteLength와 SHA-256을 다시 읽어 3/3 일치시켰다. 공개되지 않은 records/SB1.json과 evidence archive는 R4 증거로 간주하지 않았다.", s["body"]),
             table([[p("항목",s["cellb"]),p("잠긴 값",s["cellb"]),p("근거",s["cellb"])],
                    [p("형상",s["cell"]),p("L=3.0 m; section 0.3×0.5 m",s["cell"]),p("SB1.pdf §2",s["cell"])],
                    [p("재료",s["cell"]),p("E=26,700 MPa; ν=0.2; G=11,125 MPa",s["cell"]),p("SB1.pdf §2",s["cell"])],
                    [p("경계/하중",s["cell"]),p("N1 6DOF fixed; N2 Fz=-1 kN; self-weight off",s["cell"]),p("SB1.pdf §3–4",s["cell"])],
                    [p("정식",s["cell"]),p("uz=-PL³/(3EI); ry=+PL²/(2EI); Rz=+P; My=-PL",s["cell"]),p("Timoshenko & Gere closed form",s["cell"])]], [28*mm,82*mm,47*mm]),
             Spacer(1,6*mm), p("독립 full-precision 기준과 STRIX 공개 표시값",s["h2"]),
             table([[p("응답",s["cellb"]),p("독립 기준",s["cellb"]),p("STRIX 공개값",s["cellb"]),p("단위",s["cellb"])]] +
                   [[p(metric_label(a["metricId"]),s["cell"]),p(f"{a['value']:.16g}",s["cell"]),p(f"{b['value']:.16g}",s["cell"]),p(a["unit"],s["cell"])] for a,b in zip(primary,published)],
                   [44*mm,46*mm,46*mm,21*mm]),
             Spacer(1,6*mm), p("P17-M2 제안 허용오차는 네 응답 모두 signed relative 0.01%이며, 외부 수치검토자 승인 전에는 공식 판정에 사용할 수 없다.",s["body"]),
             PageBreak(), p("2. 모델링 잠금과 결과 추출 계약",s["h1"]),
             p("도구 독립 canonical input과 제품 schema v6 입력을 별도로 고정했다. S-Structures는 단국대 자체 3D frame 해석기를 사용하지만, 이 사례에서는 Euler–Bernoulli, strong Iz, no shear, no geometric stiffness 조건으로 고전식과 공학적으로 등가여야 한다.",s["body"]),
             table([[p("정본 모델",s["cellb"]),p("S-Structures native model",s["cellb"]),p("등가성 방어",s["cellb"])],
                    [p("N1(0,0,0) → N2(3,0,0)\n3D Euler–Bernoulli frame",s["cell"]),p("schema v6 / frame M1\npublic src/index.js route only",s["cell"]),p("signed response + equilibrium + energy + 1/2/4/8 mesh + load reversal",s["cell"])]], [52.3*mm]*3,
                   extra=[("BACKGROUND",(0,1),(-1,1),LIGHT_TEAL)]), Spacer(1,7*mm),
             p("Identity-only 제품 결과 probe",s["h2"]),
             table([[p("응답",s["cellb"]),p("JSON Pointer",s["cellb"]),p("부호/단위",s["cellb"])]] +
                   [[p(metric_label(row["metricId"]),s["cell"]),p(row["jsonPointer"],s["cell"]),p(f"{row['signConvention']} / {row['unit']}",s["cell"])] for row in data["probes"]["probes"]], [38*mm,68*mm,51*mm]),
             Spacer(1,6*mm), p("단위 변환을 결과 추출기에 숨기지 않는다. 제품 결과는 m, rad, kN, kN-m로 그대로 읽고, STRIX 공개 표시값만 잠긴 reference lane에서 사전 변환한다.",s["body"]),
             PageBreak(), p("3. 8개 M2 게이트",s["h1"]),
             p(f"준비 게이트 {g['readyGateCount']}/8, 종결 증거 PASS {g['passedTerminalGateCount']}/8. 준비와 종결은 서로 다른 상태이며, 현재 공식 실행 권한은 false다.",s["body"]),
             table([[p("#",s["cellb"]),p("Gate",s["cellb"]),p("준비",s["cellb"]),p("종결 증거",s["cellb"]),p("상태 설명",s["cellb"])]] +
                   [[p(str(i),s["cell"]),p(row["id"],s["cell"]),p(row["readinessStatus"],s["cellb"]),p(row["terminalEvidenceStatus"],s["cellb"]),p(", ".join(row["reasonCodes"]) or "byte audit PASS",s["cell"])] for i,row in enumerate(g["gates"],1)],
                   [8*mm,63*mm,18*mm,24*mm,44*mm]), Spacer(1,7*mm),
             table([[p("잠금",s["cellb"]),p("상태",s["cellb"])]] + [[p(k,s["cell"]),p(v,s["cell"]) ] for k,v in g["lockSummary"].items()], [55*mm,102*mm]),
             PageBreak(), p("4. 외부 신뢰 경계와 실행 차단",s["h1"]),
             p("레지스트리 템플릿은 의도적으로 UNPROVISIONED 상태다. 로컬에서 임시 키나 가짜 검토자를 만들어 공식 증거처럼 사용하지 않는다. 레지스트리 원문과 별도 전달된 SHA-256 pin이 일치하고, 역할별 Ed25519 공개키와 독립 principal이 확인되어야 한다.",s["body"]),
             table([[p("필수 외부 입력",s["cellb"]),p("현재 상태",s["cellb"]),p("해제 조건",s["cellb"])],
                    [p("External custodian registry",s["cell"]),p(data["trust"].get("status","UNPROVISIONED"),s["cellb"]),p("5개 고유 역할/principal + Ed25519 keys + out-of-band SHA-256 pin",s["cell"])],
                    [p("Reference reviewer",s["cell"]),p("PENDING",s["cellb"]),p("source/reference proposal scope 서명",s["cell"])],
                    [p("Model reviewer",s["cell"]),p("PENDING",s["cellb"]),p("canonical/native/equivalence scope 서명",s["cell"])],
                    [p("Numerical reviewer",s["cell"]),p("PENDING",s["cellb"]),p("probe/tolerance/physics scope 서명",s["cell"])],
                    [p("Release reviewer",s["cell"]),p("PENDING",s["cellb"]),p("3개 독립 공식 run 및 terminal report scope 서명",s["cell"])]] , [43*mm,34*mm,80*mm]),
             Spacer(1,7*mm), p("현재 차단 코드",s["h2"]), p("\n".join(f"• {item}" for item in g["externalDependencies"]),s["body"]),
             Spacer(1,7*mm), p("공식 실행 요청이 들어와도 assertP17M2ExecutionAuthorized가 차단 게이트와 미승인 잠금을 확인한 뒤 제품 adapter 호출 전에 거부한다.",s["body"]),
             PageBreak(), p("5. 완료된 준비 작업과 다음 순서",s["h1"]),
             table([[p("완료",s["cellb"]),p("외부 승인 후",s["cellb"]),p("종결 조건",s["cellb"])],
                    [p("SB1 source 3/3 byte audit\nclosed-form full precision\ncanonical/native model lock\nprobe/tolerance content lock\nproduct build hash lock\nmutation contract tests\ndeterministic report renderer",s["cell"]),
                     p("registry pin 검증\n4개 scoped reviewer attestation\nlock APPROVED 전환\n공식 실행 intent/receipt 생성\n제품 공개 API로 3개 독립 실행\ncomparison/physics/replay audit",s["cell"]),
                     p("8/8 readiness\n8/8 terminal evidence PASS\nexternally custodied run ≥3\nsolver execution ≥3\nbenchmark execution ≥3\nPDF visual parity audit\nrelease reviewer attestation",s["cell"])]], [52.3*mm]*3,
                   extra=[("BACKGROUND",(0,1),(0,1),LIGHT_TEAL),("BACKGROUND",(1,1),(1,1),LIGHT_AMBER),("BACKGROUND",(2,1),(2,1),LIGHT_BLUE)]),
             Spacer(1,8*mm), p("판정",s["h2"]), p("P17-M2 기반과 SB1 내용 잠금은 준비되었다. 그러나 SB1 벤치마크 검증은 아직 시작되지 않았다. 현재 올바른 상태는 CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL / BLOCKED_PRE_EXECUTION이며, 결과에 대한 PASS 또는 FAIL 판정은 없다.",s["body"]),
             Spacer(1,8*mm), p("NO SOLVER / NO BENCHMARK RUN / RELEASE BLOCKED",s["banner"])]
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    doc.build(story, onFirstPage=footer, onLaterPages=footer, canvasmaker=StableCanvas)


def render_and_verify(pdf_path: Path):
    reader = PdfReader(str(pdf_path))
    if len(reader.pages) != 6:
        raise RuntimeError(f"Expected exactly 6 pages, got {len(reader.pages)}")
    texts = [page.extract_text() or "" for page in reader.pages]
    full = "\n".join(texts)
    required = ["P17-M2", "SB1", "CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL", "BLOCKED_PRE_EXECUTION", "NO SOLVER", "NO BENCHMARK RUN", "8개 M2 게이트", "외부 신뢰 경계", "공식 실행", "벤치마크 검증은 아직 시작되지 않았다"]
    compact = "".join(full.split())
    missing = [token for token in required if token not in full and "".join(token.split()) not in compact]
    if missing or "�" in full:
        raise RuntimeError(f"PDF text QA failed; missing={missing}")
    if RENDER_DIR.exists():
        shutil.rmtree(RENDER_DIR)
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    document = pdfium.PdfDocument(str(pdf_path))
    page_audits = []
    try:
        for index in range(len(document)):
            output = RENDER_DIR / f"page-{index+1:02d}.png"
            page = document[index]
            page.render(scale=1.5).to_pil().convert("RGB").save(output, format="PNG")
            page.close()
            with PillowImage.open(output) as image:
                non_white = sum(image.convert("L").histogram()[:250]) / float(image.width * image.height)
                text_chars = len("".join(texts[index].split()))
                if non_white < 0.002 or text_chars < 25:
                    raise RuntimeError(f"Page {index+1} appears blank")
                page_audits.append({"page": index+1, "path": relative(output), "sha256": sha256_file(output), "byteLength": output.stat().st_size, "width": image.width, "height": image.height, "extractedTextCharacters": text_chars, "nonWhiteFraction": round(non_white,6), "status":"PASS_NONBLANK"})
    finally:
        document.close()
    return {"status":"PASS", "pageCount":len(reader.pages), "renderedPageCount":len(page_audits), "blankPageCount":0, "requiredTokens":required, "missingTokens":[], "pages":page_audits, "extractedTextSha256":hashlib.sha256(full.encode("utf-8")).hexdigest()}


def serialize_json(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def write_immutable(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() != data:
        raise RuntimeError(f"Refusing to overwrite non-identical final artifact: {path}")
    if not path.exists():
        path.write_bytes(data)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("draft","final","verify"), default="draft")
    args = parser.parse_args()
    data = verify_inputs()
    DRAFT_DIR.mkdir(parents=True, exist_ok=True)
    draft_md, draft_pdf = DRAFT_DIR/f"{STEM}.md", DRAFT_DIR/f"{STEM}.pdf"
    draft_md.write_text(make_markdown(data), encoding="utf-8")
    build_pdf(draft_pdf, data)
    final_md, final_pdf = FINAL_DIR/f"{STEM}.md", FINAL_DIR/f"{STEM}.pdf"
    if args.mode == "final":
        write_immutable(final_md, draft_md.read_bytes()); write_immutable(final_pdf, draft_pdf.read_bytes())
        report_md, report_pdf = final_md, final_pdf
    elif args.mode == "verify":
        if not final_md.exists() or not final_pdf.exists() or final_md.read_bytes()!=draft_md.read_bytes() or final_pdf.read_bytes()!=draft_pdf.read_bytes():
            raise RuntimeError("Fresh invariant render is not byte-identical to sealed final report")
        report_md, report_pdf = final_md, final_pdf
    else:
        report_md, report_pdf = draft_md, draft_pdf
    pdf_qa = render_and_verify(report_pdf)
    final_scope = args.mode in ("final","verify")
    reproduction = "PASS_BYTE_IDENTICAL" if final_scope else "NOT_APPLICABLE_DRAFT"
    qa_core = {
        "version":"p17-m2-sb1-readiness-report-qa-v1", "status":"PASS", "reportStatus":data["package"]["status"],
        "gateStatus":data["gates"]["status"], "artifactScope":"FINAL_ARTIFACT" if final_scope else "DRAFT_ARTIFACT",
        "package":{"path":relative(PACKAGE_PATH),"packageHash":data["package"]["packageHash"],"sha256":sha256_file(PACKAGE_PATH)},
        "report":{"markdown":{"path":relative(report_md),"sha256":sha256_file(report_md),"byteLength":report_md.stat().st_size},"pdf":{"path":relative(report_pdf),"sha256":sha256_file(report_pdf),"byteLength":report_pdf.stat().st_size,"pageCount":pdf_qa["pageCount"]}},
        "automatedPdfQa":pdf_qa, "reproduction":{"contract":"FRESH_INVARIANT_RENDER_MUST_BE_BYTE_IDENTICAL_TO_SEALED_FINAL_MD_PDF_AND_QA","status":reproduction},
        "rendererRuntime":{"python":sys.version.split()[0],"reportlab":reportlab.Version,"pypdf":pypdf.__version__,"pypdfium2":getattr(pypdfium2,"__version__","5.13.0")},
        "engineeringExecution":{"officialExecutionCount":0,"solverExecutionCount":0,"benchmarkExecutionCount":0,"engineeringResultCount":0,"fakeScreenshotCount":0},
        "releaseAllowed":False,
    }
    qa={**qa_core,"qaHash":canonical_hash(qa_core)}; qa_bytes=serialize_json(qa)
    QA_PATH.parent.mkdir(parents=True, exist_ok=True); QA_PATH.write_bytes(qa_bytes)
    if args.mode=="final": write_immutable(FINAL_QA,qa_bytes)
    elif args.mode=="verify":
        if not FINAL_QA.exists() or FINAL_QA.read_bytes()!=qa_bytes: raise RuntimeError("Fresh QA is not byte-identical to sealed final QA")
    qa_path=FINAL_QA if final_scope else QA_PATH
    print(json.dumps({"mode":args.mode,"status":data["package"]["status"],"gateStatus":data["gates"]["status"],"markdown":relative(report_md),"pdf":relative(report_pdf),"pdfSha256":sha256_file(report_pdf),"pageCount":pdf_qa["pageCount"],"renderedPageCount":pdf_qa["renderedPageCount"],"blankPageCount":0,"qa":relative(qa_path),"qaHash":qa["qaHash"],"byteReproduction":reproduction,"solverExecutionCount":0,"benchmarkExecutionCount":0,"releaseAllowed":False},ensure_ascii=False,indent=2))


if __name__ == "__main__":
    main()
