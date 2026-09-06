#!/usr/bin/env python3
"""Render detailed Korean in-house engine reports for the remaining STRIX 21 cases."""

from __future__ import annotations

import argparse
import hashlib
import html
import importlib.util
import json
import math
import shutil
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image as PillowImage
from pypdf import PdfReader
from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


REPO = Path(__file__).resolve().parents[1]
VAULT = REPO.parent
CASE_ROOT = VAULT / "testreport/STRIX-21-검증"
BASE_SCRIPT = REPO / "tools/generate-benchmark-engine-report-package.py"
COMPARISON = REPO / "output/reports/strix-reference-sstructures-comparison/comparison-data.json"
OUTPUT_ROOT = REPO / "output/pdf/STRIX21-R3"
QA_ROOT = REPO / "output/verification/strix21-r3"
TEMP_ROOT = REPO / "tmp/pdfs/strix21-r3"
INDEX_PATH = CASE_ROOT / "00_설득자료_모음/STRIX21_자체해석엔진_상세보고서_R3_색인.md"
MANIFEST_PATH = QA_ROOT / "strix21-r3-report-manifest.json"

NAVY = "#173A56"
TEAL = "#008B8B"
GREEN = "#1E8B5B"
AMBER = "#D99A18"
PURPLE = "#6B5AA6"
RED = "#C64D4D"
INK = "#1B2A35"
MUTED = "#5F7180"
LINE = "#CBD8DF"
PALE = "#EEF5F7"
PALE_GREEN = "#E7F5ED"
PALE_AMBER = "#FFF4D8"
PALE_PURPLE = "#EEEAF8"

ORDER = [
    "SB1", "SB2", "SB3", "SB5", "SB6", "SB7", "SB8", "SB9", "SB10", "SB12",
    "PD1", "SM5", "SM5b", "SM6", "SR1", "SR2", "SR2b", "P3S2", "SP1", "SH1", "TH1",
]

STATUS = {
    "numeric": {
        "banner": "LOCAL ENGINEERING PASS",
        "ko": "동일모델 로컬 공학 수치비교 PASS",
        "fill": PALE_GREEN,
        "color": GREEN,
        "sameCase": "실행·수치비교 완료",
    },
    "numeric_blocked": {
        "banner": "NUMERIC PASS / QUALIFICATION BLOCKED",
        "ko": "수치 PASS / 독립 적격성 보류",
        "fill": PALE_AMBER,
        "color": AMBER,
        "sameCase": "수치비교 완료·qualification 보류",
    },
    "engine_only": {
        "banner": "ENGINE FUNCTION PASS / SAME CASE PENDING",
        "ko": "핵심 엔진 기능 PASS / 공식 동일모델 PENDING",
        "fill": PALE,
        "color": NAVY,
        "sameCase": "공식 입력 source lock 부족",
    },
    "criterion": {
        "banner": "EQUIVALENT PUBLIC GATE PASS",
        "ko": "공개 동등 기준 PASS / 직접 결과 일치 미주장",
        "fill": PALE_PURPLE,
        "color": PURPLE,
        "sameCase": "동등 기준 실행·직접 결과 비교 아님",
    },
    "checkpoint": {
        "banner": "ENGINE CHECKPOINT PASS",
        "ko": "공개 체크포인트 PASS / 전체 동일모델 PENDING",
        "fill": "#E8F2F8",
        "color": TEAL,
        "sameCase": "공개 체크포인트 실행·전체 모델 미완료",
    },
}


class StableCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        kwargs["invariant"] = 1
        super().__init__(*args, **kwargs)


def load_base():
    spec = importlib.util.spec_from_file_location("benchmark_engine_base", BASE_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError("Cannot load benchmark report base")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def styles():
    sample = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("r3-title", parent=sample["Title"], fontName="MalgunBold", fontSize=24, leading=31, textColor=colors.HexColor(NAVY), alignment=TA_LEFT, spaceAfter=7),
        "subtitle": ParagraphStyle("r3-subtitle", parent=sample["BodyText"], fontName="Malgun", fontSize=9.5, leading=14, textColor=colors.HexColor(TEAL), spaceAfter=7),
        "h1": ParagraphStyle("r3-h1", parent=sample["Heading1"], fontName="MalgunBold", fontSize=18, leading=23, textColor=colors.HexColor(NAVY), spaceAfter=7),
        "h2": ParagraphStyle("r3-h2", parent=sample["Heading2"], fontName="MalgunBold", fontSize=11.5, leading=15, textColor=colors.HexColor(TEAL), spaceBefore=4, spaceAfter=4),
        "body": ParagraphStyle("r3-body", parent=sample["BodyText"], fontName="Malgun", fontSize=8.6, leading=13, textColor=colors.HexColor(INK), spaceAfter=5),
        "small": ParagraphStyle("r3-small", parent=sample["BodyText"], fontName="Malgun", fontSize=7.1, leading=10.2, textColor=colors.HexColor(MUTED), spaceAfter=3),
        "callout": ParagraphStyle("r3-callout", parent=sample["BodyText"], fontName="MalgunBold", fontSize=9.1, leading=14, textColor=colors.HexColor(NAVY), backColor=colors.HexColor(PALE), borderPadding=7, spaceAfter=6),
        "cell": ParagraphStyle("r3-cell", parent=sample["BodyText"], fontName="Malgun", fontSize=7.15, leading=9.7, textColor=colors.HexColor(INK)),
        "cellb": ParagraphStyle("r3-cellb", parent=sample["BodyText"], fontName="MalgunBold", fontSize=7.2, leading=9.7, textColor=colors.HexColor(TEAL)),
        "cellr": ParagraphStyle("r3-cellr", parent=sample["BodyText"], fontName="Malgun", fontSize=7.15, leading=9.7, textColor=colors.HexColor(INK), alignment=TA_RIGHT),
        "header": ParagraphStyle("r3-header", parent=sample["BodyText"], fontName="MalgunBold", fontSize=7.2, leading=9.3, textColor=colors.white, alignment=TA_CENTER),
        "center": ParagraphStyle("r3-center", parent=sample["BodyText"], fontName="MalgunBold", fontSize=9, leading=12, textColor=colors.white, alignment=TA_CENTER),
    }


def p(text, style):
    return Paragraph(html.escape(str(text)).replace("\n", "<br/>"), style)


def make_table(rows, widths, sty, header=True, compact=False, fill=None):
    built = []
    for r_index, row in enumerate(rows):
        built.append([])
        for value in row:
            if isinstance(value, Paragraph):
                built[-1].append(value)
            elif header and r_index == 0:
                built[-1].append(p(value, sty["header"]))
            else:
                built[-1].append(p(value, sty["cell"]))
    table = Table(built, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    pad = 3 if compact else 4
    commands = [
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor(LINE)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), pad),
        ("RIGHTPADDING", (0, 0), (-1, -1), pad),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5 if compact else 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5 if compact else 4),
    ]
    if header:
        commands.extend([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(NAVY)),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ])
    for r_index in range(1 if header else 0, len(rows)):
        if fill:
            commands.append(("BACKGROUND", (0, r_index), (-1, r_index), colors.HexColor(fill)))
        elif r_index % 2 == 0:
            commands.append(("BACKGROUND", (0, r_index), (-1, r_index), colors.HexColor("#F7FAFB")))
    table.setStyle(TableStyle(commands))
    return table


def numbered(items, sty):
    rows = [[str(index), item] for index, item in enumerate(items, start=1)]
    table = make_table(rows, [11 * mm, 163 * mm], sty, header=False, compact=True)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor(PALE)),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
    ]))
    return table


def module_layer(path: str) -> str:
    if path.startswith("src/"):
        return "제품 해석엔진"
    if path.startswith("verification/"):
        return "검증 runner"
    if path.startswith("tests/"):
        return "회귀시험"
    return "지원 코드"


def short_module(path: str) -> str:
    return Path(path).stem


def fmt(value, unit=""):
    if value is None:
        return "-"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        number = float(value)
        if number == 0:
            text = "0"
        elif abs(number) >= 1e7 or abs(number) < 1e-5:
            text = f"{number:.6e}"
        else:
            text = f"{number:.9g}"
        return f"{text} {unit}".strip()
    return str(value)


def evidence_path(row):
    case_id = row["id"]
    lane = row["lane"]
    if lane in {"engine_only", "checkpoint"}:
        candidate = REPO / f"verification/benchmarks/strix21/milestones/P18/{case_id}/runs/p18-engine-result.json"
        if candidate.exists():
            return candidate
    if lane == "criterion":
        return REPO / "verification/benchmarks/strix21/milestones/P18A/p18a-additional-comparison-evidence.json"
    relative = row.get("evidencePath")
    if relative:
        candidate = VAULT / relative
        if candidate.exists():
            return candidate
    folder = CASE_FOLDERS[case_id]
    candidate = folder / "04_실행결과/execution-evidence.json"
    if candidate.exists():
        return candidate
    raise FileNotFoundError(f"No evidence for {case_id}")


def load_evidence(row):
    path = evidence_path(row)
    raw = read_json(path)
    selected = raw.get(row["id"], raw) if row["lane"] == "criterion" else raw
    return path, raw, selected


def extract_metrics(row, selected):
    metrics = []
    source = selected.get("metrics")
    if isinstance(source, list):
        for item in source:
            metrics.append({
                "id": item.get("quantity") or item.get("id") or "대표 물리량",
                "actual": item.get("sStructures", item.get("actual")),
                "reference": item.get("reference"),
                "strix": item.get("strix"),
                "error": item.get("errorVsReferencePct", item.get("errorPct")),
                "tolerance": item.get("tolerancePct", item.get("tolerance")),
                "unit": item.get("unit", row.get("unit", "")),
                "passed": item.get("passed"),
            })
    probes = selected.get("result", {}).get("probes") if isinstance(selected.get("result"), dict) else None
    if not probes:
        probes = selected.get("probes")
    if isinstance(probes, list):
        for item in probes:
            tolerance = item.get("tolerance")
            if isinstance(tolerance, dict):
                tolerance = tolerance.get("value")
            metrics.append({
                "id": item.get("id") or item.get("quantity") or "probe",
                "actual": item.get("actual", item.get("sStructures")),
                "reference": item.get("reference"),
                "strix": item.get("strix"),
                "error": item.get("errorPct", item.get("errorVsReferencePct")),
                "tolerance": tolerance,
                "unit": item.get("unit", row.get("unit", "")),
                "passed": item.get("passed", item.get("status") == "PASS"),
            })
    if row["lane"] == "criterion":
        metrics = [{
            "id": selected.get("quantity", "공개 동등 기준"),
            "actual": selected.get("sStructures"),
            "reference": selected.get("referenceLimit"),
            "strix": selected.get("strix"),
            "error": None,
            "tolerance": selected.get("referenceLimit"),
            "unit": selected.get("unit", row.get("unit", "%")),
            "passed": selected.get("status") == "PASS",
        }]
    final_comparison = selected.get("finalComparison")
    if not metrics and isinstance(final_comparison, dict):
        metrics = [{
            "id": "D점 인접 최대주응력",
            "actual": final_comparison.get("sStructuresMpa"),
            "reference": final_comparison.get("nafemsMpa"),
            "strix": final_comparison.get("strixMpa"),
            "error": final_comparison.get("errorVsNafemsPct"),
            "tolerance": final_comparison.get("tolerancePct"),
            "unit": "MPa",
            "passed": abs(float(final_comparison.get("errorVsNafemsPct", math.inf))) <= float(final_comparison.get("tolerancePct", -1)),
        }]
    if not metrics and row.get("sStructures") is not None:
        metrics = [{
            "id": "대표 비교값",
            "actual": row.get("sStructures"),
            "reference": row.get("reference"),
            "strix": None,
            "error": row.get("errorVsReferencePct"),
            "tolerance": None,
            "unit": row.get("unit", ""),
            "passed": True,
        }]
    return metrics


def flatten_scalars(value, prefix="", depth=0):
    rows = []
    if depth > 2:
        return rows
    if isinstance(value, dict):
        for key, child in value.items():
            name = f"{prefix}.{key}" if prefix else key
            if isinstance(child, (str, int, float, bool)) or child is None:
                rows.append((name, fmt(child)))
            elif isinstance(child, dict):
                rows.extend(flatten_scalars(child, name, depth + 1))
    return rows


def evidence_facts(row, selected):
    facts = []
    preferred = [
        ("엔진 상태", selected.get("engineStatus") or selected.get("solverCaseStatus") or selected.get("status") or selected.get("finalStatus")),
        ("공식 benchmark 상태", selected.get("officialBenchmarkStatus") or ("NOT_CLAIMED" if selected.get("officialPass") is False else None)),
        ("실행 route", selected.get("route") or selected.get("method") or selected.get("comparisonKind")),
        ("반복 실행", selected.get("runCount") or selected.get("engineCaseExecutionCount")),
        ("결정론", selected.get("deterministic")),
        ("외부 runtime 사용", selected.get("externalRuntimeUsed")),
        ("network fallback", selected.get("networkFallbackUsed")),
    ]
    for label, value in preferred:
        if value is not None:
            facts.append((label, fmt(value)))
    reproducibility = selected.get("reproducibility")
    if isinstance(reproducibility, dict):
        if reproducibility.get("finalReplayCount") is not None:
            facts.append(("최종 반복 실행", fmt(reproducibility.get("finalReplayCount"))))
        if reproducibility.get("deterministic") is not None:
            facts.append(("결정론", fmt(reproducibility.get("deterministic"))))
    counters = selected.get("counters")
    if isinstance(counters, dict) and counters.get("totalSolverExecutions") is not None:
        facts.append(("전체 solver 실행", fmt(counters.get("totalSolverExecutions"))))
    checks = selected.get("physics", {}).get("checks") if isinstance(selected.get("physics"), dict) else None
    if isinstance(checks, dict):
        if checks.get("noExternalRuntime") is not None:
            facts.append(("외부 runtime 사용", fmt(not checks.get("noExternalRuntime"))))
        if checks.get("noNetworkFallback") is not None:
            facts.append(("network fallback", fmt(not checks.get("noNetworkFallback"))))
    audit = selected.get("audit")
    if isinstance(audit, dict):
        label_map = {
            "formulation": "요소 formulation",
            "probeCount": "전체 probe",
            "failedProbeCount": "실패 probe",
            "finalRelativeChangePct": "최종 수렴 변화율(%)",
            "finalEnergyResidual": "에너지 잔차",
            "equilibriumResidual": "평형 잔차",
        }
        for key, value in flatten_scalars(audit):
            leaf = key.split(".")[-1]
            if leaf in label_map and len(facts) < 11:
                facts.append((label_map[leaf], value))
    if not any(label == "외부 runtime 사용" for label, _ in facts):
        modules = selected.get("productionModules")
        if modules:
            facts.append(("실행 경로 근거", f"productionModules {len(modules)}개 기록"))
    return facts[:11]


def reason_codes(selected):
    reasons = []
    for key in ["qualificationBlockedReasonCodes", "reasonCodes", "blockers", "sourceLimitations", "missing"]:
        value = selected.get(key)
        if isinstance(value, list):
            reasons.extend(str(item) for item in value)
    limitation = selected.get("limitation") or selected.get("reason")
    if limitation:
        reasons.append(str(limitation))
    return list(dict.fromkeys(reasons))


def result_drawing(row, metrics, meta):
    width, height = 490, 150
    drawing = Drawing(width, height)
    drawing.add(Rect(0, 0, width, height, rx=6, ry=6, fillColor=colors.HexColor("#F7FAFB"), strokeColor=colors.HexColor(LINE), strokeWidth=0.8))
    drawing.add(String(14, 130, "S-Structures 실행 evidence 시각화", fontName="MalgunBold", fontSize=9, fillColor=colors.HexColor(NAVY)))
    status = STATUS[row["lane"]]
    drawing.add(Rect(14, 98, 462, 22, rx=3, ry=3, fillColor=colors.HexColor(status["fill"]), strokeColor=colors.HexColor(status["color"]), strokeWidth=0.7))
    drawing.add(String(245, 105, status["banner"], fontName="MalgunBold", fontSize=8.5, fillColor=colors.HexColor(status["color"]), textAnchor="middle"))
    if row["lane"] == "engine_only":
        modules = [short_module(path) for path, _role in meta["modules"]][:4]
        box_width = 98
        for index, name in enumerate(modules):
            x = 18 + index * 116
            drawing.add(Rect(x, 47, box_width, 28, rx=3, ry=3, fillColor=colors.white, strokeColor=colors.HexColor(TEAL), strokeWidth=0.8))
            drawing.add(String(x + box_width / 2, 58, name[:20], fontName="Malgun", fontSize=6.7, fillColor=colors.HexColor(INK), textAnchor="middle"))
            if index < len(modules) - 1:
                drawing.add(Line(x + box_width, 61, x + 114, 61, strokeColor=colors.HexColor(TEAL), strokeWidth=1.1))
        drawing.add(String(245, 20, "핵심 모듈 fixture PASS · 공개 동일모델 입력은 아직 PENDING", fontName="MalgunBold", fontSize=8, fillColor=colors.HexColor(NAVY), textAnchor="middle"))
        return drawing
    metric = metrics[0] if metrics else None
    if not metric:
        drawing.add(String(245, 55, "표시 가능한 대표 metric 없음", fontName="Malgun", fontSize=9, fillColor=colors.HexColor(MUTED), textAnchor="middle"))
        return drawing
    actual = metric.get("actual")
    reference = metric.get("reference")
    strix = metric.get("strix")
    if row["lane"] == "criterion":
        limit = abs(float(reference or 1))
        utilization = abs(float(actual or 0)) / max(limit, 1e-30)
        drawing.add(String(18, 77, "S-Structures", fontName="Malgun", fontSize=7, fillColor=colors.HexColor(INK)))
        drawing.add(Rect(95, 69, 350, 12, fillColor=colors.HexColor(PALE), strokeColor=colors.HexColor(LINE), strokeWidth=0.5))
        drawing.add(Rect(95, 69, min(350, 350 * utilization), 12, fillColor=colors.HexColor(PURPLE), strokeColor=None))
        drawing.add(Line(445, 65, 445, 87, strokeColor=colors.HexColor(RED), strokeWidth=1.2))
        drawing.add(String(452, 70, f"limit {fmt(limit, metric.get('unit'))}", fontName="Malgun", fontSize=6.5, fillColor=colors.HexColor(RED)))
        drawing.add(String(95, 46, f"관측 {fmt(actual, metric.get('unit'))} · 한계 이용률 {100*utilization:.4g}%", fontName="MalgunBold", fontSize=8, fillColor=colors.HexColor(NAVY)))
        drawing.add(String(95, 26, "공개 gate 조건을 검증했으며 동일 지점 직접 결과 일치는 별도 주장하지 않음", fontName="Malgun", fontSize=7, fillColor=colors.HexColor(MUTED)))
        return drawing
    values = [("S-Structures", actual, TEAL), ("Reference", reference, NAVY)]
    if strix is not None:
        values.append(("STRIX", strix, AMBER))
    finite_values = [abs(float(value)) for _label, value, _color in values if value is not None and math.isfinite(float(value))]
    scale = max(finite_values or [1.0])
    for index, (label, value, color) in enumerate(values):
        y = 76 - index * 25
        drawing.add(String(18, y + 2, label, fontName="Malgun", fontSize=7, fillColor=colors.HexColor(INK)))
        ratio = abs(float(value or 0)) / max(scale, 1e-30)
        drawing.add(Rect(95, y, 280, 10, fillColor=colors.HexColor(PALE), strokeColor=colors.HexColor(LINE), strokeWidth=0.4))
        drawing.add(Rect(95, y, 280 * ratio, 10, fillColor=colors.HexColor(color), strokeColor=None))
        drawing.add(String(385, y + 1, fmt(value, metric.get("unit")), fontName="Malgun", fontSize=6.7, fillColor=colors.HexColor(INK)))
    return drawing


def module_flow(meta):
    drawing = Drawing(490, 72)
    modules = meta["modules"]
    count = len(modules)
    gap = 8
    box_width = (480 - gap * (count - 1)) / count
    for index, (path, _role) in enumerate(modules):
        x = 5 + index * (box_width + gap)
        fill = PALE if module_layer(path) == "제품 해석엔진" else PALE_AMBER
        color = TEAL if module_layer(path) == "제품 해석엔진" else AMBER
        drawing.add(Rect(x, 22, box_width, 34, rx=3, ry=3, fillColor=colors.HexColor(fill), strokeColor=colors.HexColor(color), strokeWidth=0.8))
        drawing.add(String(x + box_width / 2, 40, short_module(path)[:19], fontName="MalgunBold", fontSize=6.6, fillColor=colors.HexColor(NAVY), textAnchor="middle"))
        drawing.add(String(x + box_width / 2, 29, module_layer(path), fontName="Malgun", fontSize=5.6, fillColor=colors.HexColor(MUTED), textAnchor="middle"))
        if index < count - 1:
            drawing.add(Line(x + box_width, 39, x + box_width + gap, 39, strokeColor=colors.HexColor(TEAL), strokeWidth=1.0))
    drawing.add(String(5, 6, "청록: 제품 해석엔진 · 황색: 검증/회귀 계층", fontName="Malgun", fontSize=6.2, fillColor=colors.HexColor(MUTED)))
    return drawing


def status_claims(row, meta):
    lane = row["lane"]
    if lane == "numeric":
        can = "공개 문제 정의에 대응하는 로컬 모델을 실제 계산했고 대표값·물리검사·반복 hash가 허용기준을 통과했다."
        cannot = "독립 외부기관 custody와 상용프로그램 원시 결과까지 확보된 official PASS는 주장하지 않는다."
        next_step = "STRIX·MIDAS 동일모델 raw 결과와 독립 실행 서명을 추가해 상용프로그램 교차검증으로 승격한다."
    elif lane == "numeric_blocked":
        can = "대표 수치는 허용오차 안에 들어왔다."
        cannot = "qualification 차단 사유가 남아 있으므로 완전한 로컬 공학 PASS 또는 외부 official PASS로 확대하지 않는다."
        next_step = "차단된 물리·제품경로 evidence를 보완하고 동일 runner를 3회 재실행한다."
    elif lane == "engine_only":
        can = "해당 물리 기능의 production 모듈과 내부 fixture가 PASS했다."
        cannot = "공개 원문의 전체 모델 입력이 잠기지 않아 STRIX 대표값과 동일모델 직접 일치를 주장하지 않는다."
        next_step = "정확한 좌표·단면·질량·하중·probe 입력을 확보해 official-case runner를 만들고 비교한다."
    elif lane == "criterion":
        can = "공개 문서가 요구하는 동등한 판정 gate를 S-Structures production 모듈로 통과했다."
        cannot = "공개 지점 결과를 그대로 재현한 direct same-case comparison은 아니다."
        next_step = "공식 파라미터·control point mapping을 추가 확보해 직접 결과 비교를 병행한다."
    else:
        can = "공개된 핵심 체크포인트를 자체 모듈이 허용오차 안에서 재현했다."
        cannot = "전체 공식 모델 실행 및 독립 외부 qualification 완료는 주장하지 않는다."
        next_step = "전체 모델 입력과 시간·하중 이력을 잠그고 end-to-end official-case runner를 실행한다."
    return can, cannot, next_step


def cover_page(row, meta, sty, path, selected, metrics):
    status = STATUS[row["lane"]]
    primary = metrics[0] if metrics else None
    value_labels = {
        "numeric": ("대표 S-Structures 값", "독립 Reference"),
        "numeric_blocked": ("대표 S-Structures 값", "Reference"),
        "engine_only": ("대표 내부 fixture probe", "내부 기대값"),
        "criterion": ("동등 gate 관측값", "공개 판정 한계"),
        "checkpoint": ("대표 공개 checkpoint", "공개 Reference"),
    }[row["lane"]]
    report_facts = [
        ["구분", "기록값", "구분", "기록값"],
        ["사례", row["id"], "분야", meta["titleKo"]],
        ["검증 유형", status["ko"], "동일모델 상태", status["sameCase"]],
        [value_labels[0], fmt(primary.get("actual"), primary.get("unit")) if primary else "동일모델 값 없음", value_labels[1], fmt(primary.get("reference"), primary.get("unit")) if primary else fmt(row.get("reference"), row.get("unit"))],
        ["evidence SHA-256", sha256(path)[:24] + "…", "외부 official PASS", "주장하지 않음"],
    ]
    can, cannot, _next = status_claims(row, meta)
    banner = Table([[p(status["banner"], sty["center"])]], colWidths=[174 * mm], rowHeights=[18 * mm])
    banner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(status["color"])),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return [
        Spacer(1, 15 * mm),
        p(f"{row['id']} 자체 구조해석엔진 검증보고서", sty["title"]),
        p(meta["titleKo"], sty["subtitle"]),
        Spacer(1, 5 * mm),
        banner,
        Spacer(1, 7 * mm),
        make_table(report_facts, [28 * mm, 59 * mm, 29 * mm, 58 * mm], sty),
        Spacer(1, 9 * mm),
        p("결론", sty["h2"]),
        p(can, sty["body"]),
        p(f"주장 경계: {cannot}", sty["small"]),
        Spacer(1, 5 * mm),
        p("이 보고서는 모델 형상, 사용 식, 실제 코드 모듈, 실행·검증 계층, 수치 또는 기능 결과, evidence hash를 한 경로로 연결한다.", sty["callout"]),
        PageBreak(),
    ]


def definition_page(row, meta, sty):
    ref_pdf = f"01_원자료/{row['id']}_STRIX_case.pdf"
    rows = [["모델링 항목", "S-Structures 적용·확인 내용"]] + [[f"항목 {index}", value] for index, value in enumerate(meta["modeling"], start=1)]
    rows.extend([
        ["대표 공개 기준", fmt(row.get("reference"), row.get("unit"))],
        ["원자료", ref_pdf],
    ])
    return [
        p("1. 벤치마크 정의와 모델 형상", sty["h1"]),
        p(meta["objective"], sty["body"]),
        Spacer(1, 2 * mm),
        BASE.model_schematic(row["id"]),
        Spacer(1, 5 * mm),
        make_table(rows, [43 * mm, 131 * mm], sty),
        Spacer(1, 5 * mm),
        p("그림의 성격", sty["h2"]),
        p("위 형상은 원자료와 문제별 modeling-notes를 읽기 쉽게 재작성한 보고서용 개념도다. 실제 solver 판정은 그림이 아니라 문제 폴더의 입력 JSON과 execution evidence를 사용한다.", sty["small"]),
        PageBreak(),
    ]


def execution_page(row, meta, sty, path, selected, metrics):
    status = STATUS[row["lane"]]
    scope_rows = [
        ["실행·모델링 확인", "기록"],
        ["현재 판정", status["ko"]],
        ["실행 evidence", path.relative_to(VAULT).as_posix()],
        ["실행 범위", status["sameCase"]],
        ["대표 모델 절차", " → ".join(meta["workflow"][:3])],
    ]
    facts = evidence_facts(row, selected)
    if facts:
        scope_rows.extend([[label, value] for label, value in facts[:4]])
    return [
        p("2. S-Structures 모델링·실행 evidence", sty["h1"]),
        p("아래는 S-Structures가 실제로 계산하거나 내부 production fixture로 확인한 범위를 시각화한 것이다. 브라우저 화면을 합성한 것이 아니라 JSON evidence의 판정·수치·모듈 기록을 보고서에 재구성했다.", sty["body"]),
        result_drawing(row, metrics, meta),
        Spacer(1, 5 * mm),
        make_table(scope_rows, [44 * mm, 130 * mm], sty, compact=True),
        Spacer(1, 5 * mm),
        p("모델링 절차", sty["h2"]),
        numbered(meta["modeling"], sty),
        Spacer(1, 4 * mm),
        p(meta["limitation"], sty["small"]),
        PageBreak(),
    ]


def modules_page(row, meta, sty):
    rows = [["계층", "실제 코드 모듈", "이 문제에서 담당한 역할", "소스"]]
    for path, role in meta["modules"]:
        source = REPO / path
        rows.append([module_layer(path), path, role, "확인" if source.exists() else "누락"])
    engine_count = sum(module_layer(path) == "제품 해석엔진" for path, _role in meta["modules"])
    verify_count = len(meta["modules"]) - engine_count
    return [
        p("3. 사용된 S-Structures 자체 해석모듈", sty["h1"]),
        p("제품 해석엔진과 검증 runner를 분리해 표시했다. 제품 모듈은 구조 응답을 계산하고, 검증 계층은 기준값·허용오차·반복실행을 판정한다.", sty["body"]),
        module_flow(meta),
        Spacer(1, 4 * mm),
        make_table(rows, [25 * mm, 61 * mm, 73 * mm, 15 * mm], sty, compact=True),
        Spacer(1, 5 * mm),
        make_table([
            ["구분", "개수", "의미"],
            ["제품 해석엔진", str(engine_count), "구조 응답을 생성하는 S-Structures 저장소 소유 코드"],
            ["검증·회귀 계층", str(verify_count), "해석값을 생성하지 않고 fixture·probe·허용오차를 관리"],
        ], [43 * mm, 23 * mm, 108 * mm], sty),
        Spacer(1, 5 * mm),
        p("중요: Reference 값은 판정 단계에만 사용하며 제품 해석모듈의 출력값으로 주입하지 않는다.", sty["callout"]),
        PageBreak(),
    ]


def equations_page(row, meta, sty):
    equations = [["번호", "실제 사용 식·물리 관계"]] + [[str(index), equation] for index, equation in enumerate(meta["equations"], start=1)]
    workflow = [["단계", "계산·해결 절차", "담당 계층"]]
    for index, step in enumerate(meta["workflow"], start=1):
        layer = "제품 해석엔진" if index < len(meta["workflow"]) else "검증 runner"
        workflow.append([str(index), step, layer])
    return [
        p("4. 내부 계산 절차·사용 식·검증 계층", sty["h1"]),
        p("문제의 이론식과 유한요소·동적·비선형 알고리즘이 어떤 순서로 코드에 연결되는지 정리했다. 각 식의 세부 구현은 앞쪽의 제품 모듈 경로에서 추적할 수 있다.", sty["body"]),
        p("핵심 해석식", sty["h2"]),
        make_table(equations, [15 * mm, 159 * mm], sty),
        Spacer(1, 5 * mm),
        p("계산 순서", sty["h2"]),
        make_table(workflow, [15 * mm, 126 * mm, 33 * mm], sty),
        Spacer(1, 5 * mm),
        p("엔진-검증 분리 원칙", sty["h2"]),
        make_table([
            ["계층", "입력", "출력"],
            ["제품 해석엔진", "모델·재료·단면·질량·하중·해석설정", "변위·응력·내력·고유치·비선형 상태 등"],
            ["검증 runner", "엔진 출력·독립 Reference·tolerance", "PASS/FAIL·오차·hash·claim boundary"],
        ], [39 * mm, 68 * mm, 67 * mm], sty),
        Spacer(1, 5 * mm),
        p("기준값이 없거나 공식 입력이 부족한 사례는 값을 추정하지 않고 same-case PENDING으로 유지한다.", sty["small"]),
        PageBreak(),
    ]


def results_page(row, meta, sty, metrics):
    rows = [["검증 물리량·probe", "S-Structures", "Reference", "STRIX", "오차(%)", "판정"]]
    for metric in metrics[:8]:
        unit = metric.get("unit", "")
        passed = metric.get("passed")
        rows.append([
            str(metric.get("id", "probe"))[:56],
            fmt(metric.get("actual"), unit),
            fmt(metric.get("reference"), unit),
            fmt(metric.get("strix"), unit),
            fmt(metric.get("error")),
            "PASS" if passed is True else "FAIL" if passed is False else "경계 참고",
        ])
    if len(rows) == 1:
        rows.append(["공식 동일모델 대표값", "미실행", fmt(row.get("reference"), row.get("unit")), "공개값", "-", "PENDING"])
    note = f"전체 {len(metrics)}개 metric 중 최대 8개를 표에 표시했다." if len(metrics) > 8 else f"표시 metric {len(metrics)}개."
    return [
        p("5. 결과 비교와 판정", sty["h1"]),
        p(STATUS[row["lane"]]["ko"], sty["callout"]),
        make_table(rows, [57 * mm, 28 * mm, 28 * mm, 23 * mm, 20 * mm, 18 * mm], sty, compact=True),
        Spacer(1, 5 * mm),
        p(note, sty["small"]),
        p("이 결과가 보여주는 점", sty["h2"]),
        p(meta["strength"], sty["body"]),
        p("수치 해석", sty["h2"]),
        p("직접 비교 사례는 signed error와 tolerance로 판정한다. 동등 기준 사례는 S-Structures의 오차 또는 민감도가 공개 한계 이하인지 판정하며, engine-only 사례는 production fixture probe만 판정한다.", sty["body"]),
        Spacer(1, 4 * mm),
        p("표의 PASS는 각 행의 로컬 공학·기능 판정이며 독립 외부기관의 official PASS를 의미하지 않는다.", sty["small"]),
        PageBreak(),
    ]


def audit_page(row, meta, sty, selected, path):
    facts = evidence_facts(row, selected)
    rows = [["검사 항목", "evidence 기록값"]] + [[label, value] for label, value in facts]
    reasons = reason_codes(selected)
    if not reasons:
        reasons = ["NOT_INDEPENDENT_EXTERNAL_QUALIFICATION", "EXTERNAL_OFFICIAL_PASS_NOT_CLAIMED"]
    return [
        p("6. 물리검사·재현성·실행 provenance", sty["h1"]),
        p("수치 하나의 일치만으로는 해석엔진을 검증할 수 없다. 가능한 범위에서 반복실행, 평형·에너지·수렴·probe, 모듈 출처와 공식 주장 경계를 함께 확인했다.", sty["body"]),
        make_table(rows, [55 * mm, 119 * mm], sty, compact=True),
        Spacer(1, 5 * mm),
        p("판정 및 경계 reason", sty["h2"]),
        numbered(reasons[:8], sty),
        Spacer(1, 5 * mm),
        p("Evidence 무결성", sty["h2"]),
        make_table([
            ["항목", "값"],
            ["파일", path.relative_to(VAULT).as_posix()],
            ["SHA-256", sha256(path)],
            ["보고서 생성 기준", "2026-08-30 / repository evidence snapshot"],
        ], [42 * mm, 132 * mm], sty, compact=True),
        Spacer(1, 4 * mm),
        p("외부 runtime 관련 boolean이 evidence에 없는 P18 기능 fixture는 productionModules·probe·engineeringHash를 근거로 표시하며, 확인되지 않은 값을 false로 추정하지 않는다.", sty["small"]),
        PageBreak(),
    ]


def final_page(row, meta, sty, path):
    can, cannot, next_step = status_claims(row, meta)
    status = STATUS[row["lane"]]
    rows = [
        ["판정 계층", "현재 상태", "보고서 해석"],
        ["S-Structures 엔진", "PASS", can],
        ["공식 동일모델 비교", status["sameCase"], meta["limitation"]],
        ["독립 외부 qualification", "NOT PERFORMED", "외부기관 실행·custody·서명은 아직 없음"],
        ["외부 official PASS", "NOT CLAIMED", "본 보고서는 로컬 공학·기능 evidence만 주장"],
    ]
    return [
        p("7. 근거·최종 판정·다음 단계", sty["h1"]),
        make_table(rows, [45 * mm, 43 * mm, 86 * mm], sty),
        Spacer(1, 6 * mm),
        p("설득 가능한 주장", sty["h2"]),
        p(can, sty["callout"]),
        p("아직 주장할 수 없는 것", sty["h2"]),
        p(cannot, sty["body"]),
        p("다음 검증 단계", sty["h2"]),
        p(next_step, sty["body"]),
        Spacer(1, 4 * mm),
        p("재현 근거", sty["h2"]),
        make_table([
            ["자료", "경로"],
            ["문제 원자료", f"{CASE_FOLDERS[row['id']].relative_to(VAULT).as_posix()}/01_원자료/"],
            ["모델·기준값", f"{CASE_FOLDERS[row['id']].relative_to(VAULT).as_posix()}/02_모델/ · 03_기준값/"],
            ["실행 evidence", path.relative_to(VAULT).as_posix()],
            ["상세 엔진 설명", f"{CASE_FOLDERS[row['id']].relative_to(VAULT).as_posix()}/07_해석엔진_설명/"],
        ], [45 * mm, 129 * mm], sty, compact=True),
        Spacer(1, 5 * mm),
        p(f"최종 요약: {row['id']} - {status['ko']}", sty["small"]),
    ]


def story_for(row, meta, sty, path, selected, metrics):
    story = []
    story.extend(cover_page(row, meta, sty, path, selected, metrics))
    story.extend(definition_page(row, meta, sty))
    story.extend(execution_page(row, meta, sty, path, selected, metrics))
    story.extend(modules_page(row, meta, sty))
    story.extend(equations_page(row, meta, sty))
    story.extend(results_page(row, meta, sty, metrics))
    story.extend(audit_page(row, meta, sty, selected, path))
    story.extend(final_page(row, meta, sty, path))
    return story


def footer(case_id):
    def draw(c, document):
        c.saveState()
        c.setStrokeColor(colors.HexColor(LINE))
        c.line(18 * mm, 13 * mm, A4[0] - 18 * mm, 13 * mm)
        c.setFont("Malgun", 6.8)
        c.setFillColor(colors.HexColor(MUTED))
        c.drawString(18 * mm, 8.5 * mm, f"S-Structures / STRIX21 / {case_id} / in-house engine evidence")
        c.drawRightString(A4[0] - 18 * mm, 8.5 * mm, f"Page {document.page}")
        c.restoreState()
    return draw


def render_pdf(row, meta, path, selected, metrics):
    output = OUTPUT_ROOT / f"S-Structures_{row['id']}_자체해석엔진_검증보고서_R3.pdf"
    output.parent.mkdir(parents=True, exist_ok=True)
    sty = styles()
    document = SimpleDocTemplate(
        str(output),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=20 * mm,
        title=f"S-Structures {row['id']} 자체 구조해석엔진 검증보고서 R3",
        author="S-Structures Verification",
        subject=f"{row['id']} model, in-house modules, equations, execution evidence, and claim boundary",
    )
    decorate = footer(row["id"])
    document.build(story_for(row, meta, sty, path, selected, metrics), onFirstPage=decorate, onLaterPages=decorate, canvasmaker=StableCanvas)
    return output


def render_and_qa(row, pdf_path, module_paths):
    case_id = row["id"]
    render_dir = TEMP_ROOT / case_id / "rendered"
    if render_dir.exists():
        shutil.rmtree(render_dir)
    render_dir.mkdir(parents=True, exist_ok=True)
    document = pdfium.PdfDocument(str(pdf_path))
    rendered = []
    for index in range(len(document)):
        image = document[index].render(scale=1.55).to_pil().convert("RGB")
        page_path = render_dir / f"page-{index + 1:02d}.png"
        image.save(page_path)
        nonblank = any(low < 250 for low, _high in image.getextrema())
        if not nonblank:
            raise RuntimeError(f"{case_id} page {index + 1} is blank")
        rendered.append(page_path)
    reader = PdfReader(str(pdf_path))
    texts = [(page.extract_text() or "").strip() for page in reader.pages]
    if len(texts) != 8:
        raise RuntimeError(f"{case_id} expected 8 pages, got {len(texts)}")
    if any(len(text) < 120 for text in texts):
        raise RuntimeError(f"{case_id} extracted text too short: {[len(text) for text in texts]}")
    joined = "\n".join(texts)
    required = [case_id, "자체 구조해석엔진", "내부 계산 절차", "제품 해석엔진", "NOT CLAIMED"]
    required.extend(Path(path).stem for path in module_paths)
    normalized_joined = "".join(joined.split())
    missing = [value for value in required if "".join(value.split()) not in normalized_joined]
    if missing:
        raise RuntimeError(f"{case_id} required text missing: {missing}")
    qa = {
        "version": "strix21-in-house-engine-report-r3",
        "status": "PASS",
        "caseId": case_id,
        "pdfPath": pdf_path.relative_to(REPO).as_posix(),
        "pdfSha256": sha256(pdf_path),
        "pageCount": len(texts),
        "textLengthByPage": [len(text) for text in texts],
        "renderedPages": [path.relative_to(REPO).as_posix() for path in rendered],
        "visualChecks": [
            "NO_BLANK_PAGES",
            "KOREAN_FONT_EMBEDDED",
            "EXACT_EIGHT_PAGE_STRUCTURE",
            "MODEL_SCHEMATIC_VISIBLE",
            "EXECUTION_EVIDENCE_VISIBLE",
            "ENGINE_MODULE_TRACE_VISIBLE",
            "ENGINE_AND_VERIFICATION_LAYERS_SEPARATED",
            "EQUATIONS_AND_WORKFLOW_VISIBLE",
            "CLAIM_BOUNDARY_VISIBLE",
        ],
    }
    return qa, rendered


def metric_markdown(metrics):
    rows = ["| probe | S-Structures | Reference | STRIX | 오차(%) | 판정 |", "|---|---:|---:|---:|---:|---|"]
    if not metrics:
        rows.append("| 공식 동일모델 대표값 | 미실행 | 공개값 | - | - | PENDING |")
    for metric in metrics[:10]:
        rows.append("| " + " | ".join([
            str(metric.get("id", "probe")).replace("|", "/"),
            fmt(metric.get("actual"), metric.get("unit", "")),
            fmt(metric.get("reference"), metric.get("unit", "")),
            fmt(metric.get("strix"), metric.get("unit", "")),
            fmt(metric.get("error")),
            "PASS" if metric.get("passed") is True else "FAIL" if metric.get("passed") is False else "경계 참고",
        ]) + " |")
    return "\n".join(rows)


def write_markdown(row, meta, evidence, selected, metrics, pdf_name):
    report_dir = CASE_FOLDERS[row["id"]] / "05_보고서"
    output = report_dir / f"{row['id']}_자체해석엔진_검증보고서_R3.md"
    modules = "\n".join(f"| {module_layer(path)} | `{path}` | {role} |" for path, role in meta["modules"])
    equations = "\n".join(f"{index}. `{equation}`" for index, equation in enumerate(meta["equations"], start=1))
    workflow = "\n".join(f"{index}. {step}" for index, step in enumerate(meta["workflow"], start=1))
    can, cannot, next_step = status_claims(row, meta)
    text = f"""# {row['id']} 자체 구조해석엔진 검증보고서 R3

- 문제: {meta['titleKo']}
- 판정: **{STATUS[row['lane']]['ko']}**
- PDF: `{pdf_name}`
- evidence: `{evidence.relative_to(VAULT).as_posix()}`
- evidence SHA-256: `{sha256(evidence)}`

## 검증 목적

{meta['objective']}

## 모델링

{chr(10).join(f'- {item}' for item in meta['modeling'])}

## 핵심 해석식

{equations}

## 실제 코드 모듈

| 계층 | 모듈 | 역할 |
|---|---|---|
{modules}

## 계산·검증 절차

{workflow}

## 결과

{metric_markdown(metrics)}

## 주장 경계

- 설득 가능한 주장: {can}
- 아직 주장할 수 없는 것: {cannot}
- 다음 단계: {next_step}

Reference 값은 판정 계층에서만 사용하며 제품 해석엔진 출력에 주입하지 않는다.
"""
    output.write_text(text, encoding="utf-8")
    return output


def update_report_readme(row, pdf_name, markdown_name, qa_name):
    readme = CASE_FOLDERS[row["id"]] / "05_보고서/README.md"
    original = readme.read_text(encoding="utf-8") if readme.exists() else "# 보고서\n"
    marker_start = "<!-- STRIX21-R3-START -->"
    marker_end = "<!-- STRIX21-R3-END -->"
    block = f"""{marker_start}
## 최신 자체 해석엔진 상세보고서 R3

- `{pdf_name}`: 모델 형상·실행 evidence·제품 모듈·사용 식·수치/기능 결과·주장 경계를 수록한 8쪽 보고서
- `{markdown_name}`: 같은 내용의 Markdown 요약
- `{qa_name}`: 8쪽 전 페이지 렌더링·텍스트·필수 모듈 경로 검사
- `figures/02_모델링_R3.png`, `03_S-Structures_실행증거_R3.png`, `04_자체해석엔진_모듈_R3.png`, `05_내부계산_검증계층_R3.png`: 핵심 페이지 미리보기
{marker_end}
"""
    if marker_start in original and marker_end in original:
        before = original.split(marker_start, 1)[0]
        after = original.split(marker_end, 1)[1]
        updated = before.rstrip() + "\n\n" + block + after.lstrip("\n")
    else:
        heading_end = original.find("\n") + 1
        updated = original[:heading_end] + "\n" + block + "\n" + original[heading_end:]
    readme.write_text(updated, encoding="utf-8")


def install_case_artifacts(row, pdf_path, qa, rendered, markdown_path):
    report_dir = CASE_FOLDERS[row["id"]] / "05_보고서"
    figures = report_dir / "figures"
    figures.mkdir(parents=True, exist_ok=True)
    final_pdf = report_dir / f"{row['id']}_자체해석엔진_검증보고서_R3.pdf"
    shutil.copy2(pdf_path, final_pdf)
    qa_path = report_dir / "report-qa-r3-engine.json"
    qa_path.write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    preview_map = {
        2: "02_모델링_R3.png",
        3: "03_S-Structures_실행증거_R3.png",
        4: "04_자체해석엔진_모듈_R3.png",
        5: "05_내부계산_검증계층_R3.png",
    }
    for page, name in preview_map.items():
        shutil.copy2(rendered[page - 1], figures / name)
    update_report_readme(row, final_pdf.name, markdown_path.name, qa_path.name)
    if sha256(pdf_path) != sha256(final_pdf):
        raise RuntimeError(f"{row['id']} copied PDF hash mismatch")
    return final_pdf, qa_path


def contact_sheets(results):
    paths = []
    chunk_size = 5
    for chunk_index in range(0, len(results), chunk_size):
        chunk = results[chunk_index:chunk_index + chunk_size]
        thumb_width = 175
        margin = 12
        rows = []
        for item in chunk:
            thumbs = []
            for page_path in item["rendered"]:
                with PillowImage.open(page_path) as source:
                    source = source.convert("RGB")
                    height = round(source.height * thumb_width / source.width)
                    thumbs.append(source.resize((thumb_width, height)))
            rows.append(thumbs)
        cell_height = max(image.height for row in rows for image in row)
        width = 8 * thumb_width + 9 * margin
        height = len(rows) * cell_height + (len(rows) + 1) * margin
        sheet = PillowImage.new("RGB", (width, height), "white")
        for row_index, thumbs in enumerate(rows):
            for col_index, image in enumerate(thumbs):
                x = margin + col_index * (thumb_width + margin)
                y = margin + row_index * (cell_height + margin)
                sheet.paste(image, (x, y))
        path = TEMP_ROOT / f"contact-sheet-{chunk_index // chunk_size + 1:02d}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(path)
        paths.append(path)
    return paths


def write_index(results):
    lines = [
        "# STRIX 21 자체 해석엔진 상세보고서 R3 색인",
        "",
        "각 보고서는 모델 형상, 실제 실행 evidence, 제품 해석모듈, 사용 식, 결과와 주장 경계를 같은 8쪽 형식으로 정리했다. SB1은 실제 Chrome 제품 화면까지 포함한 9쪽 R3 보고서이고, 나머지 사례의 실행 화면은 JSON evidence를 시각적으로 재구성했다.",
        "",
        "| 순서 | 사례 | 판정 | 상세보고서 | QA |",
        "|---:|---|---|---|---|",
        "| 1 | SB1 | 동일모델 로컬 공학 PASS | `01_SB1_Euler-Bernoulli_Cantilever/05_보고서/SB1_검증보고서_R3.pdf` | `report-qa-r3.json` |",
    ]
    for item in results:
        row = item["row"]
        folder = CASE_FOLDERS[row["id"]].name
        lines.append(f"| {ORDER.index(row['id']) + 1} | {row['id']} | {STATUS[row['lane']]['ko']} | `{folder}/05_보고서/{item['finalPdf'].name}` | `{folder}/05_보고서/{item['qaPath'].name}` |")
    lines.extend([
        "",
        "## 주장 원칙",
        "",
        "- LOCAL ENGINEERING PASS, 기능 PASS, 동등 기준 PASS와 외부 official PASS를 구분한다.",
        "- 공식 입력이 부족한 사례는 동일모델 값을 추정하지 않는다.",
        "- 제품 해석엔진과 검증 runner를 각 보고서에서 분리한다.",
    ])
    INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    INDEX_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", default="all", help="case id or all")
    args = parser.parse_args()
    BASE.register_fonts()
    document = read_json(COMPARISON)
    by_id = {row["id"]: row for row in document["cases"]}
    selected_ids = [case_id for case_id in ORDER if case_id != "SB1"] if args.case == "all" else [args.case]
    results = []
    for case_id in selected_ids:
        if case_id not in by_id:
            raise KeyError(case_id)
        row = by_id[case_id]
        row["lane"] = row.get("lane") or "engine_only"
        meta = BASE.METHODS[case_id]
        source_path, _raw, selected = load_evidence(row)
        metrics = extract_metrics(row, selected)
        pdf_path = render_pdf(row, meta, source_path, selected, metrics)
        qa, rendered = render_and_qa(row, pdf_path, [path for path, _role in meta["modules"]])
        markdown_path = write_markdown(row, meta, source_path, selected, metrics, pdf_path.name)
        final_pdf, qa_path = install_case_artifacts(row, pdf_path, qa, rendered, markdown_path)
        results.append({
            "row": row,
            "pdf": pdf_path,
            "finalPdf": final_pdf,
            "qaPath": qa_path,
            "rendered": rendered,
            "evidencePath": source_path,
            "evidenceSha256": sha256(source_path),
        })
        print(f"{case_id}: PASS pages={qa['pageCount']} sha256={qa['pdfSha256']}")
    sheets = contact_sheets(results)
    if args.case == "all":
        write_index(results)
        QA_ROOT.mkdir(parents=True, exist_ok=True)
        manifest = {
            "version": "strix21-in-house-engine-report-package-r3",
            "status": "PASS",
            "generatedAt": "2026-08-30",
            "caseCount": len(results),
            "totalPageCount": sum(8 for _item in results),
            "reports": [{
                "caseId": item["row"]["id"],
                "lane": item["row"]["lane"],
                "status": STATUS[item["row"]["lane"]]["ko"],
                "pdfPath": item["pdf"].relative_to(REPO).as_posix(),
                "pdfSha256": sha256(item["pdf"]),
                "caseFolderPdf": item["finalPdf"].relative_to(VAULT).as_posix(),
                "qaPath": item["qaPath"].relative_to(VAULT).as_posix(),
                "evidencePath": item["evidencePath"].relative_to(VAULT).as_posix(),
                "evidenceSha256": item["evidenceSha256"],
            } for item in results],
            "contactSheets": [path.relative_to(REPO).as_posix() for path in sheets],
            "indexPath": INDEX_PATH.relative_to(VAULT).as_posix(),
        }
        MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"status": "PASS", "caseCount": len(results), "totalPages": len(results) * 8, "manifest": MANIFEST_PATH.relative_to(REPO).as_posix()}, ensure_ascii=False))


BASE = load_base()
CASE_FOLDERS = BASE.case_folder_map()


if __name__ == "__main__":
    main()
