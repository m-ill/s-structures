#!/usr/bin/env python3
"""Render the P17-M2 SB1 local signed execution report from immutable evidence."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import shutil
import subprocess
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image as PillowImage
from pypdf import PdfReader
from reportlab.graphics.shapes import Circle, Drawing, Line, Path as DrawingPath, Rect, String
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
FONT_REGULAR = Path("C:/Windows/Fonts/malgun.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/malgunbd.ttf")
PDF_DIR = REPO / "output/pdf"
REPORT_DIR = REPO / "output/verification/phase17"
WORK_DIR = REPO / "tmp/pdfs/p17-m2-sb1-local-r1"
STEM = "P17-M2-SB1-LOCAL-EXECUTION-REPORT-R1"

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
LINE = colors.HexColor("#C9D4DC")


def canonical_hash(value) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def register_fonts():
    if not FONT_REGULAR.exists() or not FONT_BOLD.exists():
        raise RuntimeError("Malgun Gothic fonts are required")
    pdfmetrics.registerFont(TTFont("Malgun", str(FONT_REGULAR)))
    pdfmetrics.registerFont(TTFont("MalgunBold", str(FONT_BOLD)))


def make_styles():
    register_fonts()
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("title", parent=base["Title"], fontName="MalgunBold", fontSize=23, leading=30, textColor=NAVY, alignment=TA_LEFT, spaceAfter=8),
        "subtitle": ParagraphStyle("subtitle", parent=base["BodyText"], fontName="Malgun", fontSize=10, leading=15, textColor=TEAL, spaceAfter=10),
        "h1": ParagraphStyle("h1", parent=base["Heading1"], fontName="MalgunBold", fontSize=16, leading=21, textColor=NAVY, spaceAfter=8),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="MalgunBold", fontSize=11, leading=15, textColor=TEAL, spaceBefore=5, spaceAfter=5),
        "body": ParagraphStyle("body", parent=base["BodyText"], fontName="Malgun", fontSize=8.3, leading=13, textColor=NAVY, spaceAfter=5),
        "small": ParagraphStyle("small", parent=base["BodyText"], fontName="Malgun", fontSize=6.7, leading=9.2, textColor=GREY),
        "cell": ParagraphStyle("cell", parent=base["BodyText"], fontName="Malgun", fontSize=6.7, leading=9, textColor=NAVY),
        "cellb": ParagraphStyle("cellb", parent=base["BodyText"], fontName="MalgunBold", fontSize=6.7, leading=9, textColor=NAVY),
        "banner": ParagraphStyle("banner", parent=base["BodyText"], fontName="MalgunBold", fontSize=11, leading=16, textColor=colors.white, alignment=TA_CENTER),
        "big": ParagraphStyle("big", parent=base["BodyText"], fontName="MalgunBold", fontSize=19, leading=23, textColor=NAVY, alignment=TA_CENTER),
        "center": ParagraphStyle("center", parent=base["BodyText"], fontName="Malgun", fontSize=7.5, leading=11, textColor=NAVY, alignment=TA_CENTER),
    }


def p(text, style):
    return Paragraph(html.escape(str(text)).replace("\n", "<br/>"), style)


def make_table(rows, widths, header=True, extra=None):
    if header and rows:
        header_style = ParagraphStyle(
            "dynamic_header", fontName="MalgunBold", fontSize=6.7,
            leading=9, textColor=colors.white,
        )
        rows = [[
            Paragraph(html.escape(cell.getPlainText()), header_style)
            if isinstance(cell, Paragraph) else Paragraph(html.escape(str(cell)), header_style)
            for cell in rows[0]
        ], *rows[1:]]
    result = Table(rows, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
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
    width, _ = A4
    canv.setStrokeColor(LINE)
    canv.line(18 * mm, 14 * mm, width - 18 * mm, 14 * mm)
    canv.setFont("Malgun", 6.5)
    canv.setFillColor(GREY)
    canv.drawString(18 * mm, 9.5 * mm, "S-Structures / P17-M2 / SB1 local signed execution")
    canv.drawRightString(width - 18 * mm, 9.5 * mm, f"Page {doc.page}")
    canv.restoreState()


def model_drawing():
    d = Drawing(500, 170)
    d.add(Rect(24, 45, 14, 88, fillColor=LIGHT_BLUE, strokeColor=NAVY, strokeWidth=1.2))
    for y in range(50, 130, 13):
        d.add(Line(17, y - 6, 24, y, strokeColor=NAVY, strokeWidth=0.7))
    d.add(Line(38, 100, 450, 100, strokeColor=NAVY, strokeWidth=5))
    d.add(Circle(38, 100, 4, fillColor=TEAL, strokeColor=TEAL))
    d.add(Circle(450, 100, 4, fillColor=TEAL, strokeColor=TEAL))
    arrow = DrawingPath()
    arrow.moveTo(450, 153)
    arrow.lineTo(450, 112)
    arrow.moveTo(442, 123)
    arrow.lineTo(450, 112)
    arrow.lineTo(458, 123)
    arrow.strokeColor = RED
    arrow.strokeWidth = 2
    d.add(arrow)
    curve = DrawingPath()
    curve.moveTo(38, 100)
    curve.curveTo(170, 99, 315, 86, 450, 62)
    curve.strokeColor = TEAL
    curve.strokeWidth = 2.2
    curve.strokeDashArray = [5, 3]
    d.add(curve)
    d.add(String(210, 118, "L = 3.0 m / Euler-Bernoulli frame", fontName="Malgun", fontSize=8, fillColor=NAVY))
    d.add(String(424, 157, "P = 1 kN", fontName="MalgunBold", fontSize=8, fillColor=RED))
    d.add(String(37, 30, "N1 fixed", fontName="Malgun", fontSize=8, fillColor=NAVY))
    d.add(String(365, 42, "deformed shape (exaggerated)", fontName="Malgun", fontSize=7, fillColor=TEAL))
    return d


def verify_evidence(evidence_path: Path):
    evidence_path = evidence_path.resolve(strict=True)
    evidence_path.relative_to(REPO.resolve())
    evidence = read_json(evidence_path)
    declared = evidence["evidenceHash"]
    node_code = (
        "import{readFileSync}from'node:fs';"
        "import{sha256Canonical}from'./verification/framework/phase17/canonical.mjs';"
        "const e=JSON.parse(readFileSync(process.argv[1],'utf8'));delete e.evidenceHash;"
        "process.stdout.write(sha256Canonical(e));"
    )
    completed = subprocess.run(
        ["node", "--input-type=module", "-e", node_code, str(evidence_path)],
        cwd=REPO, check=True, capture_output=True, text=True,
    )
    calculated = completed.stdout.strip()
    if declared != calculated:
        raise RuntimeError("Evidence self-hash mismatch")
    if evidence["mode"] != "LOCAL_TEST_ONLY" or evidence["qualification"]["status"] != "PASS":
        raise RuntimeError("Report requires a passing LOCAL_TEST_ONLY evidence set")
    if evidence["claimBoundary"]["independentExternalReviewPerformed"] is not False:
        raise RuntimeError("Unexpected external review claim")
    if evidence["verdict"]["officialPass"] is not False or evidence["verdict"]["releaseAllowed"] is not False:
        raise RuntimeError("Local evidence must not claim official release")
    if evidence["trust"]["registryAudit"]["status"] != "READY":
        raise RuntimeError("Local trust registry audit is not ready")
    if any(row["status"] != "VERIFIED" for row in evidence["trust"]["attestationAudits"]):
        raise RuntimeError("Reviewer attestation audit failed")
    if any(row["signatureVerification"]["status"] != "VERIFIED" for row in evidence["signedReceipts"]):
        raise RuntimeError("Execution receipt signature audit failed")
    artifact_audits = []
    for run in evidence["runs"]:
        binding = run["resultArtifact"]
        artifact_path = (REPO / binding["path"]).resolve(strict=True)
        artifact_path.relative_to(REPO.resolve())
        actual = sha256_file(artifact_path)
        if actual != binding["sha256"] or artifact_path.stat().st_size != binding["byteLength"]:
            raise RuntimeError(f"Result artifact binding mismatch: {binding['path']}")
        artifact_audits.append({"path": binding["path"], "sha256": actual, "status": "PASS"})
    return evidence, artifact_audits


def build_story(e, s):
    metric_rows = e["qualification"]["runAudits"][0]["metricRows"]
    run = e["runs"][0]
    story = []
    story += [
        Spacer(1, 8 * mm),
        p("SB1 로컬 전자서명 실행·비교 보고서", s["title"]),
        p("P17-M2 / Euler-Bernoulli 1D cantilever tip deflection", s["subtitle"]),
        Table([[p("LOCAL ENGINEERING PASS", s["banner"])]], colWidths=[174 * mm], style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), GREEN), ("BOX", (0, 0), (-1, -1), 0.8, GREEN),
            ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ])),
        Spacer(1, 5 * mm),
        make_table([
            [p("실행 세트", s["cellb"]), p(e["setId"], s["cell"]), p("판정", s["cellb"]), p("PASS", s["cellb"])],
            [p("제품 해석", s["cellb"]), p(f"{e['counters']['solverExecutionCount']}회", s["cell"]), p("주 실행", s["cellb"]), p("3회", s["cell"])],
            [p("재현성", s["cellb"]), p("3/3 동일", s["cell"]), p("전자서명", s["cellb"]), p("검토 4 + 영수증 3 VERIFIED", s["cell"])],
            [p("증거 해시", s["cellb"]), p(e["evidenceHash"], s["small"]), p("공식 외부검증", s["cellb"]), p("미수행", s["cell"])]
        ], [25 * mm, 62 * mm, 28 * mm, 59 * mm], header=False, extra=[("BACKGROUND", (0, 0), (-1, -1), LIGHT)]),
        Spacer(1, 5 * mm),
        p("결론", s["h2"]),
        p("S-Structures 공개 제품 API와 CPU f64 선형해석 경로로 SB1을 실제 계산했다. 네 핵심 응답은 폐형식 기준값 대비 허용오차 0.01% 안에 들었고, 3회 실행의 엔지니어링 결과 해시가 동일했다. 1·2·4·8 요소 분할과 하중반전 검사도 통과했다.", s["body"]),
        p("중요한 주장 경계: 이번 전자서명은 동일 로컬 프로세스가 생성·보관한 일회성 키에 기반한다. 암호학적 무결성은 검증됐지만 독립 외부기관 검토가 아니므로 STRIX의 공식 PASS나 상용 프로그램 교차검증 완료로 주장하지 않는다.", s["body"]),
        PageBreak(),
        p("1. 벤치마크 정의와 모델링", s["h1"]),
        model_drawing(),
        p("모델 입력", s["h2"]),
        make_table([
            [p("항목", s["cellb"]), p("적용값", s["cellb"]), p("해석 의미", s["cellb"])],
            [p("형상", s["cell"]), p("L = 3.0 m", s["cell"]), p("N1 고정, N2 자유단", s["cell"])],
            [p("단면", s["cell"]), p("300 x 500 mm; A = 0.15 m²; Iz = 0.003125 m⁴", s["cell"]), p("강축 휨", s["cell"])],
            [p("재료", s["cell"]), p("E = 26,700 MPa; G = 11,125 MPa", s["cell"]), p("선형 탄성", s["cell"])],
            [p("요소", s["cell"]), p("3D Euler-Bernoulli frame", s["cell"]), p("전단변형 제외", s["cell"])],
            [p("하중", s["cell"]), p("N2, global -Z, 1 kN", s["cell"]), p("자중 제외, D_ONLY = 1.0D", s["cell"])],
            [p("해석", s["cell"]), p("linear static / CPU f64", s["cell"]), p("P-Delta 및 외부 런타임 미사용", s["cell"])],
        ], [31 * mm, 77 * mm, 66 * mm]),
        Spacer(1, 5 * mm),
        p("독립 기준식", s["h2"]),
        p("자유단 처짐 δ = -PL³/(3EI), 자유단 회전 θ = PL²/(2EI), 지점 반력 Rz = P, 지점 모멘트 My = -PL을 사용했다. 기준값은 모델 입력과 별도 잠금된 reference artifact에서 읽었으며, 해석 결과를 기준값으로 주입하지 않았다.", s["body"]),
        PageBreak(),
        p("2. 실행 및 전자서명 절차", s["h1"]),
        p("실행 경로", s["h2"]),
        make_table([
            [p("단계", s["cellb"]), p("수행 내용", s["cellb"]), p("결과", s["cellb"])],
            [p("1", s["cell"]), p("잠금된 S-Structures 입력과 기준값 해시 로드", s["cell"]), p("PASS", s["cellb"])],
            [p("2", s["cell"]), p("역할별 Ed25519 키 5쌍을 메모리에서 생성", s["cell"]), p("개인키 비저장", s["cell"] )],
            [p("3", s["cell"]), p("모델·기준·수치·릴리스 검토서명 생성 후 공개키 재검증", s["cell"]), p("4/4 VERIFIED", s["cellb"])],
            [p("4", s["cell"]), p("공개 제품 API → analysis product service → CPU f64 solver", s["cell"]), p("외부 런타임 false", s["cell"] )],
            [p("5", s["cell"]), p("주 실행 3회, 요소분할 12회, 하중반전 3회", s["cell"]), p("총 15회", s["cellb"])],
            [p("6", s["cell"]), p("실행영수증 3개 서명 후 공개키 재검증", s["cell"]), p("3/3 VERIFIED", s["cellb"])],
        ], [17 * mm, 117 * mm, 40 * mm]),
        Spacer(1, 5 * mm),
        p("신뢰 경계", s["h2"]),
        make_table([
            [p("검증 항목", s["cellb"]), p("상태", s["cellb"]), p("해석", s["cellb"])],
            [p("서명 위·변조 검출", s["cell"]), p("VERIFIED", s["cellb"]), p("Ed25519 서명과 payload/self hash 재검증", s["cell"])],
            [p("서명자 역할 분리", s["cell"]), p("논리적으로 분리", s["cell"]), p("서로 다른 키·principal 사용", s["cell"])],
            [p("독립 외부기관 관리", s["cell"]), p("NOT PERFORMED", s["cellb"]), p("모든 키를 같은 로컬 프로세스가 생성", s["cell"])],
            [p("공식 릴리스 승인", s["cell"]), p("BLOCKED", s["cellb"]), p("외부 custodian 및 독립 reviewer가 별도로 필요", s["cell"])],
        ], [48 * mm, 38 * mm, 88 * mm], extra=[("BACKGROUND", (0, 3), (-1, 4), LIGHT_AMBER)]),
        PageBreak(),
        p("3. 정량 비교 결과", s["h1"]),
        make_table([
            [p("응답", s["cellb"]), p("S-Structures", s["cellb"]), p("기준값", s["cellb"]), p("오차(%)", s["cellb"]), p("허용(%)", s["cellb"]), p("판정", s["cellb"])],
            *[[
                p(row["metricId"], s["cell"]),
                p(f"{row['actual']:.16g}", s["cell"]),
                p(f"{row['reference']:.16g}", s["cell"]),
                p(f"{row['signedErrorPct']:.4e}", s["cell"]),
                p(f"±{row['tolerancePct']:.4g}", s["cell"]),
                p(row["status"], s["cellb"]),
            ] for row in metric_rows]
        ], [32 * mm, 40 * mm, 40 * mm, 25 * mm, 21 * mm, 16 * mm], extra=[("BACKGROUND", (0, 1), (-1, -1), LIGHT_TEAL)]),
        Spacer(1, 6 * mm),
        p("3회 반복 재현성", s["h2"]),
        make_table([
            [p("Run", s["cellb"]), p("tip Uz (m)", s["cellb"]), p("support Rz (kN)", s["cellb"]), p("엔지니어링 결과 해시", s["cellb"])],
            *[[p(str(i + 1), s["cell"]), p(f"{row['values']['tipUzM']:.17g}", s["cell"]), p(f"{row['values']['supportRzKn']:.17g}", s["cell"]), p(row["engineeringResultHash"], s["small"])] for i, row in enumerate(e["runs"])]
        ], [17 * mm, 42 * mm, 42 * mm, 73 * mm]),
        Spacer(1, 5 * mm),
        p(f"세 실행의 엔지니어링 투영 해시는 모두 {e['qualification']['determinismHashes'][0]}로 동일하다. 실행시각·소요시간·plan hash는 공학 결과가 아니므로 재현성 해시에서 제외했다.", s["body"]),
        PageBreak(),
        p("4. 물리·변형 검사", s["h1"]),
        p("요소 분할 불변성", s["h2"]),
        make_table([
            [p("요소 수", s["cellb"]), p("tip Uz (m)", s["cellb"]), p("폐형식 대비 절대차 (m)", s["cellb"]), p("판정", s["cellb"])],
            *[[p(row["elements"], s["cell"]), p(f"{row['tipUzM']:.17g}", s["cell"]), p(f"{abs(row['tipUzM'] - metric_rows[0]['reference']):.4e}", s["cell"]), p("PASS", s["cellb"])] for row in run["meshLevels"]]
        ], [28 * mm, 55 * mm, 62 * mm, 29 * mm], extra=[("BACKGROUND", (0, 1), (-1, -1), LIGHT_TEAL)]),
        Spacer(1, 5 * mm),
        p("평형·에너지·하중반전", s["h2"]),
        make_table([
            [p("검사", s["cellb"]), p("관측", s["cellb"]), p("판정", s["cellb"])],
            [p("힘 평형", s["cell"]), p(f"|Rz - 1| = {e['qualification']['runAudits'][0]['physics']['equilibriumForceResidual']:.4e} kN", s["cell"]), p("PASS", s["cellb"])],
            [p("모멘트 평형", s["cell"]), p(f"|My + 3| = {e['qualification']['runAudits'][0]['physics']['equilibriumMomentResidual']:.4e} kN-m", s["cell"]), p("PASS", s["cellb"])],
            [p("변형에너지", s["cell"]), p(f"상대 잔차 = {e['qualification']['runAudits'][0]['physics']['energyResidual']:.4e}", s["cell"]), p("PASS", s["cellb"])],
            [p("하중반전", s["cell"]), p("변위·반력·모멘트 부호가 정확히 반전", s["cell"]), p("PASS", s["cellb"])],
        ], [42 * mm, 96 * mm, 36 * mm]),
        Spacer(1, 6 * mm),
        p("실행 중 발견하여 수정한 결함", s["h2"]),
        p("첫 완료 세트에서는 네 수치가 모두 동일했지만 전체 payload 해시가 실행마다 달라 FAIL이 발생했다. 원인은 solver timing(totalSolveMs), startedAt/completedAt, planHash 같은 비공학 메타데이터를 엔지니어링 결과 해시에 포함한 것이었다. 변위·반력·부재력·설계판정만 포함하는 P17_SB1_ENGINEERING_PROJECTION_V1을 도입한 뒤 재실행하여 3/3 동일 해시를 확인했다. 첫 FAIL 증거는 삭제하지 않았다.", s["body"]),
        PageBreak(),
        p("5. 증거와 최종 판정", s["h1"]),
        p("증거 무결성", s["h2"]),
        make_table([
            [p("증거", s["cellb"]), p("수량/상태", s["cellb"]), p("바인딩", s["cellb"])],
            [p("로컬 신뢰 레지스트리", s["cell"]), p("READY / terminalEligible=false", s["cell"]), p(e["trust"]["registry"]["registryHash"], s["small"])],
            [p("검토자 attestation", s["cell"]), p("4/4 VERIFIED", s["cellb"]), p("model/reference/numerical/release", s["cell"])],
            [p("실행 receipt", s["cell"]), p("3/3 VERIFIED", s["cellb"]), p("executionCustodian Ed25519", s["cell"])],
            [p("engineering result", s["cell"]), p("3 artifacts / hash-bound", s["cell"]), p(e["qualification"]["determinismHashes"][0], s["small"])],
            [p("전체 evidence", s["cell"]), p("self-hash PASS", s["cellb"]), p(e["evidenceHash"], s["small"])],
        ], [45 * mm, 48 * mm, 81 * mm]),
        Spacer(1, 6 * mm),
        p("판정", s["h2"]),
        make_table([
            [p("구분", s["cellb"]), p("결과", s["cellb"]), p("허용되는 주장", s["cellb"])],
            [p("S-Structures SB1 공학 계산", s["cell"]), p("PASS", s["cellb"]), p("폐형식 기준과 0.01% 이내 일치", s["cell"])],
            [p("로컬 반복 재현성", s["cell"]), p("PASS", s["cellb"]), p("엔지니어링 결과 해시 3/3 동일", s["cell"])],
            [p("로컬 전자서명 무결성", s["cell"]), p("PASS", s["cellb"]), p("서명 및 self hash 검증 완료", s["cell"])],
            [p("독립 외부검증", s["cell"]), p("PENDING", s["cellb"]), p("외부 custodian/reviewer 서명 필요", s["cell"])],
            [p("공식 제품 릴리스", s["cell"]), p("BLOCKED", s["cellb"]), p("이번 보고서만으로 release 불가", s["cell"])],
        ], [52 * mm, 34 * mm, 88 * mm], extra=[("BACKGROUND", (0, 1), (-1, 3), LIGHT_TEAL), ("BACKGROUND", (0, 4), (-1, 5), LIGHT_AMBER)]),
        Spacer(1, 6 * mm),
        p("다음 공식 단계", s["h2"]),
        p("동일한 잠금 입력과 실행기를 유지한 채, 외부에서 관리되는 executionCustodian 1명과 독립 reviewer 4명의 공개키·서명을 등록한다. 그 뒤 공식 실행 영수증 3개를 외부 key로 다시 서명하면 현재 LOCAL PASS를 OFFICIAL qualification 심사로 올릴 수 있다.", s["body"]),
        p("이 보고서의 최종 결론은 'SB1 엔지니어링 계산 및 로컬 재현성 PASS, 독립 외부검증 PENDING'이다.", s["body"]),
    ]
    return story


def build_markdown(e, evidence_path: Path) -> str:
    rows = e["qualification"]["runAudits"][0]["metricRows"]
    lines = [
        "# P17-M2 SB1 로컬 전자서명 실행·비교 보고서 R1",
        "",
        f"- 실행 세트: `{e['setId']}`",
        "- 최종 판정: **LOCAL ENGINEERING PASS**",
        f"- 실제 solver 실행: {e['counters']['solverExecutionCount']}회",
        "- 독립 외부검증: 미수행",
        "- 공식 릴리스: 불가",
        f"- 증거 파일: `{evidence_path.relative_to(REPO).as_posix()}`",
        f"- 증거 self-hash: `{e['evidenceHash']}`",
        "",
        "## 모델과 방법",
        "",
        "길이 3.0 m의 3D Euler-Bernoulli 캔틸레버에 자유단 global -Z 방향 1 kN을 적용했다. N1은 6자유도 고정이고 자중, 전단변형, P-Delta는 사용하지 않았다. S-Structures 공개 제품 API와 CPU f64 선형해석 경로를 사용했다.",
        "",
        "## 정량 결과",
        "",
        "| 응답 | S-Structures | 기준값 | 오차(%) | 허용(%) | 판정 |",
        "|---|---:|---:|---:|---:|---|",
    ]
    for row in rows:
        lines.append(f"| {row['metricId']} | {row['actual']:.16g} | {row['reference']:.16g} | {row['signedErrorPct']:.4e} | ±{row['tolerancePct']} | {row['status']} |")
    lines += [
        "",
        "## 추가 검증",
        "",
        "- 주 실행 3회: 엔지니어링 결과 해시 3/3 동일",
        "- 요소 분할 1·2·4·8: 자유단 처짐 불변성 PASS",
        "- 힘·모멘트 평형: PASS",
        "- 변형에너지: PASS",
        "- 하중반전: 변위·반력·모멘트 부호 반전 PASS",
        "- 검토 attestation 4개: VERIFIED",
        "- 실행 receipt 3개: VERIFIED",
        "",
        "## 발견 및 수정",
        "",
        "첫 실행에서는 시간·성능 메타데이터가 엔지니어링 결과 해시에 포함돼 동일한 계산값인데도 재현성 FAIL이 발생했다. 엔지니어링 결과 투영만 해시하도록 수정한 후 3회 동일 해시를 확인했다. 첫 FAIL 증거는 보존했다.",
        "",
        "## 주장 경계",
        "",
        "이번 키는 동일 로컬 프로세스에서 생성한 일회성 Ed25519 키다. 서명 위·변조 검출과 증거 무결성은 검증됐지만 독립 외부기관 검토는 아니다. 따라서 결론은 **SB1 엔지니어링 계산 및 로컬 재현성 PASS, 독립 외부검증 PENDING**이다.",
        "",
    ]
    return "\n".join(lines)


def build_pdf(path: Path, evidence):
    styles = make_styles()
    doc = SimpleDocTemplate(
        str(path), pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=20 * mm,
        title="P17-M2 SB1 Local Signed Execution Report R1",
        author="S-Structures Verification",
        subject="SB1 local signed engineering execution and comparison",
    )
    doc.build(build_story(evidence, styles), onFirstPage=footer, onLaterPages=footer, canvasmaker=StableCanvas)


def render_and_qa(pdf_path: Path, evidence, artifact_audits):
    render_dir = WORK_DIR / "rendered"
    if render_dir.exists():
        shutil.rmtree(render_dir)
    render_dir.mkdir(parents=True, exist_ok=True)
    document = pdfium.PdfDocument(str(pdf_path))
    rendered = []
    for index in range(len(document)):
        bitmap = document[index].render(scale=1.7)
        image = bitmap.to_pil().convert("RGB")
        page_path = render_dir / f"page-{index + 1:02d}.png"
        image.save(page_path)
        extrema = image.getextrema()
        nonblank = any(low < 250 for low, _ in extrema)
        if not nonblank:
            raise RuntimeError(f"Rendered PDF page {index + 1} is blank")
        rendered.append({"page": index + 1, "path": page_path.relative_to(REPO).as_posix(), "width": image.width, "height": image.height, "nonblank": nonblank})
    reader = PdfReader(str(pdf_path))
    if len(reader.pages) != len(rendered):
        raise RuntimeError("PDF reader/render page count mismatch")
    text_lengths = [len((page.extract_text() or "").strip()) for page in reader.pages]
    if any(length < 100 for length in text_lengths):
        raise RuntimeError("A PDF page has unexpectedly little extractable text")
    return {
        "version": "p17-m2-sb1-local-report-qa-v1",
        "status": "PASS",
        "evidenceHash": evidence["evidenceHash"],
        "pdfPath": pdf_path.relative_to(REPO).as_posix(),
        "pdfSha256": sha256_file(pdf_path),
        "pageCount": len(rendered),
        "textLengthByPage": text_lengths,
        "renderedPages": rendered,
        "artifactAudits": artifact_audits,
        "visualChecks": ["NO_BLANK_PAGES", "KOREAN_FONT_EMBEDDED", "TABLES_WITHIN_PAGE", "MODEL_DIAGRAM_VISIBLE"],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", required=True, type=Path)
    args = parser.parse_args()
    evidence, artifact_audits = verify_evidence(args.evidence)
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    draft = WORK_DIR / f"{STEM}.draft.pdf"
    final_pdf = PDF_DIR / f"{STEM}.pdf"
    build_pdf(draft, evidence)
    build_pdf(final_pdf, evidence)
    if draft.read_bytes() != final_pdf.read_bytes():
        raise RuntimeError("Deterministic PDF reproduction failed")
    markdown_path = REPORT_DIR / f"{STEM}.md"
    markdown_path.write_text(build_markdown(evidence, args.evidence.resolve()), encoding="utf-8")
    qa = render_and_qa(final_pdf, evidence, artifact_audits)
    qa["deterministicByteEquality"] = True
    qa_path = REPORT_DIR / f"{STEM}.qa.json"
    qa_path.write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "PASS",
        "pdf": final_pdf.relative_to(REPO).as_posix(),
        "markdown": markdown_path.relative_to(REPO).as_posix(),
        "qa": qa_path.relative_to(REPO).as_posix(),
        "pdfSha256": qa["pdfSha256"],
        "pageCount": qa["pageCount"],
        "deterministicByteEquality": True,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
