from __future__ import annotations

import csv
import hashlib
import html
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image as PdfImage,
    KeepTogether,
    LongTable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
VAULT_ROOT = REPO_ROOT.parent
CASE_ROOT = VAULT_ROOT / "testreport" / "STRIX-21-검증"
P18_ROOT = REPO_ROOT / "verification" / "benchmarks" / "strix21" / "milestones" / "P18"
P18A_ROOT = REPO_ROOT / "verification" / "benchmarks" / "strix21" / "milestones" / "P18A"
REPORT_ROOT = REPO_ROOT / "output" / "reports" / "strix-reference-sstructures-comparison"
PDF_PATH = REPO_ROOT / "output" / "pdf" / "STRIX_Reference_S-Structures_비교보고서.pdf"
FIGURE_ROOT = REPORT_ROOT / "figures"

PUBLIC_PAGE = "https://dcr-st.com/ko/verification.html"
SNAPSHOT_DATE = "2026-08-29"

NAVY = "#123E5A"
NAVY_2 = "#0D2F45"
TEAL = "#168C8C"
GREEN = "#178B57"
AMBER = "#D99A18"
RED = "#C64D4D"
INK = "#17232D"
MUTED = "#5B6B78"
PALE = "#EAF2F6"
PALE_GREEN = "#E8F5EE"
PALE_AMBER = "#FFF4D8"
PALE_BLUE = "#E8F2F8"


CASES = [
    dict(id="SB1", category="Element", benchmark="Euler-Bernoulli 1D cantilever", quantity="Tip deflection u_z", unit="mm", strix=-0.107865, reference=-0.107865, website_delta=0.00020, lane="numeric", extractor="sb1"),
    dict(id="SB2", category="Element", benchmark="NAFEMS LE1 elliptic membrane", quantity="Tangential edge stress at D", unit="MPa", strix=90.8514, reference=92.7, website_delta=-1.994, lane="numeric", extractor="sb2"),
    dict(id="SB3", category="Element", benchmark="Cook's membrane", quantity="Normalized tip displacement", unit="norm.", strix=23.9578, reference=23.91, website_delta=0.2, lane="numeric", extractor="SB3|Normalized loaded-edge midpoint displacement"),
    dict(id="SB5", category="Element", benchmark="Thin rectangular plate", quantity="Deflection coefficient alpha", unit="-", strix=0.00406, reference=0.00406, website_delta=0.064, lane="numeric", extractor="SB5|SS-1x1-UDL"),
    dict(id="SB6", category="Element", benchmark="Thick rectangular plate", quantity="Deflection coefficient alpha, 1x1-R10", unit="-", strix=0.004271, reference=0.004273, website_delta=-0.057, lane="numeric", extractor="SB6|1x1-R10"),
    dict(id="SB7", category="Element", benchmark="Beam on Winkler foundation", quantity="Center deflection U_z", unit="in", strix=-0.089333, reference=-0.089333, website_delta=0.000057, lane="numeric", extractor="SB7|Center deflection Uz"),
    dict(id="SB8", category="Element", benchmark="Deep Timoshenko beam", quantity="Natural frequency f1", unit="Hz", strix=102.149374, reference=102.149414, website_delta=-0.000039, lane="numeric", extractor="SB8|Natural frequency f1"),
    dict(id="SB9", category="Element", benchmark="Rigid portal frame under UDL", quantity="Midspan deflection, combined", unit="mm", strix=-69.3655, reference=-69.372833, website_delta=0.0106, lane="numeric", extractor="SB9|Midspan deflection combined"),
    dict(id="SB10", category="Element", benchmark="Asymmetric two-bar truss", quantity="Brace E1 axial magnitude", unit="N", strix=10000.0, reference=10000.0, website_delta=0.0, lane="numeric", extractor="SB10|Brace E1 axial", magnitude=True),
    dict(id="SB12", category="Element", benchmark="Elastic link beta-angle transform", quantity="Oblique U_x", unit="mm", strix=0.152961, reference=0.152961, website_delta=0.000081, lane="engine_only", engine_note="6-DOF 링크와 beta-angle 좌표변환은 PASS했다. P18 fixture는 공개 0.152961 mm 모델과 동일하지 않다."),
    dict(id="PD1", category="Element", benchmark="P-Delta tension stiffening", quantity="U_z with tension", unit="in", strix=-0.543496, reference=-0.543305, website_delta=-0.0352, lane="numeric_blocked", extractor="PD1|Uz with tension"),
    dict(id="SM5", category="Analysis", benchmark="Bathe-Wilson eigenvalue frame", quantity="Eigenvalue mode 1 omega^2", unit="rad^2/s^2", strix=0.589538, reference=0.589541, website_delta=-0.00050, lane="numeric_blocked", extractor="SM5|Eigenvalue omega^2 mode 1"),
    dict(id="SM5b", category="Analysis", benchmark="Rigid-diaphragm condensation", quantity="Eigenvalue mode 1 omega^2", unit="rad^2/s^2", strix=2070.118745, reference=2070.117026, website_delta=0.00010, lane="engine_only", engine_note="축약 해석엔진은 PASS했다. 공개 질량 / 회전관성 배율 mapping이 미완료이고 P18 값은 독립 합격 기준값이 아니다."),
    dict(id="SM6", category="Analysis", benchmark="ASME 3D pipe-frame eigenproblem", quantity="Eigenvalue mode 1 omega^2", unit="rad^2/s^2", strix=506338.834586, reference=506331.91595, website_delta=0.0014, lane="engine_only", engine_note="3D Timoshenko pipe-frame 엔진은 LARSA E08 주파수와 비교해 PASS했다. STRIX 모델의 정확한 중간 절점 좌표가 없다."),
    dict(id="SR1", category="Analysis", benchmark="2D response-spectrum frame", quantity="Period mode 1", unit="s", strix=1.56213, reference=1.562, website_delta=0.0080, lane="engine_only", engine_note="RSA / SRSS / CQC 엔진은 PASS했다. 절대 질량, 전체 스펙트럼, 단면과 8요소 위상정보가 없다."),
    dict(id="SR2", category="Analysis", benchmark="3D eccentric rigid diaphragm RSA", quantity="Period mode 1", unit="s", strix=0.22705, reference=0.2271, website_delta=-0.021, lane="engine_only", engine_note="3D 강체격막, 6-DOF 질량과 4개 모드조합은 PASS했다. 단면, 질량 / Jz, 위상과 스펙트럼 입력이 미완료다."),
    dict(id="SR2b", category="Analysis", benchmark="3D L-shaped braced-frame RSA", quantity="Frequency mode 1", unit="Hz", strix=3.05908, reference=3.0592, website_delta=-0.0040, lane="engine_only", engine_note="L형 RSA와 가새 축력복원 엔진은 PASS했다. 정확한 평면 / 부재 mapping과 El Centro 스펙트럼이 없다."),
    dict(id="SP1", category="Nonlinear", benchmark="Pushover cantilever moment hinge", quantity="Pre-peak self-consistency worst error", unit="%", strix=0.00076916, reference=1.0, website_delta=None, lane="criterion", extractor="p18a:SP1"),
    dict(id="SH1", category="Nonlinear", benchmark="Custom P-M-M column hinge", quantity="Uniaxial cap boundary", unit="N-mm", strix=125000000.0, reference=125000000.0, website_delta=0.0, lane="checkpoint", extractor="SH1|SH1-A2-MZ"),
    dict(id="TH1", category="Nonlinear", benchmark="SDOF Newmark time integration", quantity="Peak relative displacement, zeta=5%", unit="mm", strix=200.783, reference=200.786209, website_delta=-0.0016, lane="checkpoint", extractor="TH1|TH1-ZETA-5-PEAK"),
    dict(id="P3S2", category="Stabilization", benchmark="Stabilization sensitivity", quantity="Maximum dominant membrane-mode period shift", unit="%", strix=0.19, reference=0.5, website_delta=None, lane="criterion", extractor="p18a:P3S2"),
]


STANDARD_FOLDERS = {
    "SB3": "03_SB3_Cooks_Membrane",
    "SB5": "04_SB5_Thin_Rectangular_Plate",
    "SB6": "05_SB6_Thick_Rectangular_Plate",
    "SB7": "06_SB7_Winkler_Beam",
    "SB8": "07_SB8_Timoshenko_Beam_Frequencies",
    "SB9": "08_SB9_Portal_Frame_UDL",
    "SB10": "09_SB10_Two_Bar_Truss",
    "PD1": "11_PD1_PDelta_Tension_Stiffening",
    "SM5": "12_SM5_Bathe_Wilson_Frame",
}


NUMERIC_NOTES = {
    "SB1": "제품 API로 3회 결정론적 실행을 확인했다. 외부 독립 custody는 수행하지 않았다.",
    "SB2": "QM6-EAS mesh 수렴 결과다. S probe는 D점 최근접 Gauss점의 원시 최대주응력으로, 접선응력 probe와의 등가성 검토가 남았다.",
    "SB3": "QM6-EAS 평면응력 membrane을 사용한 mesh 수렴 로컬 실행이다.",
    "SB5": "얇은 판 workflow의 공개 대표행 SS-1x1-UDL을 표시했다.",
    "SB6": "두꺼운 판 workflow의 공개 대표행 1x1-R10을 표시했다.",
    "SB7": "Winkler 탄성지반 kernel과 중앙 응답복원을 확인했다.",
    "SB8": "Timoshenko modal 경로의 6개 주파수 probe 중 1차 주파수를 표시했다.",
    "SB9": "축변형과 휨을 합한 변위이며 성분합 closure를 확인했다.",
    "SB10": "공개 페이지는 절댓값을 표시한다. S-Structures 압축력 -10,000 N의 절댓값을 비교했다.",
    "PD1": "대표 수치는 통과했지만 단계별 work-balance 증거가 없어 적격성 판정은 보류했다.",
    "SM5": "첫 3개 고유값은 통과했지만 독립 mode vector가 없어 적격성 판정은 보류했다.",
    "SH1": "신규 PMM 재료 / zero-length 요소 경로로 공개 cap-boundary checkpoint를 재현했다.",
    "TH1": "Newmark 평균가속도 결과를 독립 RK4와 시간간격 수렴으로 교차확인했다.",
    "SP1": "공개 SP1과 같은 pre-peak self-consistency 판정법을 생산 pushover 엔진에 적용했다. Point 2 목표변위를 결과값으로 재사용하지 않았다.",
    "P3S2": "공개 3×6 membrane 형상으로 안정화 민감도를 재실행했다. STRIX plate-mode와 literal parameter 단위의 완전 동일성은 주장하지 않는다.",
}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def extract_standard(case_id: str, quantity: str):
    path = CASE_ROOT / STANDARD_FOLDERS[case_id] / "04_실행결과" / "execution-evidence.json"
    evidence = read_json(path)
    metrics = evidence.get("metrics") or []
    if isinstance(metrics, dict):
        metrics = [metrics]
    metric = next((row for row in metrics if row.get("quantity") == quantity), None)
    if metric is None:
        raise KeyError(f"Metric not found for {case_id}: {quantity}")
    return metric["sStructures"], metric["reference"], metric["strix"], path


def extract_sb1():
    path = CASE_ROOT / "01_SB1_Euler-Bernoulli_Cantilever" / "04_실행결과" / "execution-evidence.json"
    evidence = read_json(path)
    actual = evidence["runs"][0]["values"]["tipUzM"] * 1000.0
    metric = next(row for row in evidence["qualification"]["runAudits"][0]["metricRows"] if row["metricId"] == "tipUzM")
    reference = metric["reference"] * 1000.0
    return actual, reference, CASE_BY_ID["SB1"]["strix"], path


def extract_sb2():
    path = CASE_ROOT / "02_SB2_NAFEMS_LE1_Elliptic_Membrane" / "04_실행결과" / "execution-evidence.json"
    row = read_json(path)["finalComparison"]
    return row["sStructuresMpa"], row["nafemsMpa"], row["strixMpa"], path


def extract_p18(case_id: str, probe_id: str):
    path = P18_ROOT / case_id / "runs" / "p18-engine-result.json"
    evidence = read_json(path)
    probe = next(row for row in evidence["result"]["probes"] if row["id"] == probe_id)
    return probe["actual"], probe["reference"], CASE_BY_ID[case_id]["strix"], path


def extract_p18a(case_id: str):
    path = P18A_ROOT / "p18a-additional-comparison-evidence.json"
    evidence = read_json(path)[case_id]
    return evidence["sStructures"], evidence["referenceLimit"], evidence["strix"], path, evidence


def signed_error(actual: float, reference: float):
    if reference == 0:
        return None
    return (actual - reference) / abs(reference) * 100.0


def fmt_number(value: float | None, unit: str = ""):
    if value is None:
        return "-"
    magnitude = abs(value)
    if magnitude >= 1e7:
        text = f"{value:.6g}"
    elif magnitude >= 1000:
        text = f"{value:,.6f}".rstrip("0").rstrip(".")
    elif magnitude >= 1:
        text = f"{value:.6f}".rstrip("0").rstrip(".")
    elif magnitude == 0:
        text = "0"
    else:
        text = f"{value:.9f}".rstrip("0").rstrip(".")
    return f"{text} {unit}".strip()


def fmt_pct(value: float | None):
    if value is None:
        return "-"
    if abs(value) < 0.000001:
        return "~0.000000%"
    if abs(value) < 0.01:
        return f"{value:+.6f}%"
    return f"{value:+.3f}%"


def fmt_reference(row):
    if row.get("lane") == "criterion":
        return f"≤ {fmt_number(row['reference'], row['unit'])}"
    return fmt_number(row.get("reference"), row.get("unit", ""))


def fmt_delta(row):
    if row.get("lane") == "criterion":
        return f"한계의 {row['gateUtilizationPct']:.3f}%"
    return fmt_pct(row.get("errorVsReferencePct"))


CASE_BY_ID = {row["id"]: row for row in CASES}


def build_rows():
    rows = []
    for source in CASES:
        row = dict(source)
        actual = exact_reference = exact_strix = evidence_path = None
        extractor = row.get("extractor")
        if extractor == "sb1":
            actual, exact_reference, exact_strix, evidence_path = extract_sb1()
        elif extractor == "sb2":
            actual, exact_reference, exact_strix, evidence_path = extract_sb2()
        elif extractor and extractor.startswith("p18a:"):
            actual, exact_reference, exact_strix, evidence_path, criterion = extract_p18a(extractor.split(":", 1)[1])
            row["gateUtilizationPct"] = criterion["limitUtilizationPct"]
            row["comparisonKind"] = criterion["comparisonKind"]
        elif extractor:
            case_id, selector = extractor.split("|", 1)
            if case_id in {"SH1", "TH1"}:
                actual, exact_reference, exact_strix, evidence_path = extract_p18(case_id, selector)
            else:
                actual, exact_reference, exact_strix, evidence_path = extract_standard(case_id, selector)

        if row.get("magnitude") and actual is not None:
            actual, exact_reference, exact_strix = abs(actual), abs(exact_reference), abs(exact_strix)

        row.update(
            sStructures=actual,
            compareReference=exact_reference,
            compareStrix=exact_strix,
            errorVsReferencePct=signed_error(actual, exact_reference) if actual is not None and row["lane"] != "criterion" else None,
            errorVsStrixPct=signed_error(actual, exact_strix) if actual is not None else None,
            evidencePath=str(evidence_path.relative_to(VAULT_ROOT)).replace("\\", "/") if evidence_path else None,
            note=NUMERIC_NOTES.get(row["id"], row.get("engine_note", "")),
        )
        row["status"], row["statusLabel"] = status_for(row["lane"])
        rows.append(row)
    return rows


def status_for(lane: str):
    return {
        "numeric": ("LOCAL_ENGINEERING_PASS", "수치비교 PASS"),
        "numeric_blocked": ("LOCAL_NUMERIC_PASS_QUALIFICATION_BLOCKED", "수치 PASS / 적격성 보류"),
        "checkpoint": ("ENGINE_CHECKPOINT_PASS", "체크포인트 PASS"),
        "criterion": ("EQUIVALENT_GATE_PASS", "동등 기준 PASS"),
        "engine_only": ("ENGINE_FUNCTION_PASS_SAME_CASE_PENDING", "기능 PASS / 동일모델 미완료"),
    }[lane]


def build_document(rows):
    counts = {
        "total": len(rows),
        "engineFunctionAvailable": len(rows),
        "numericComparable": sum(row["sStructures"] is not None for row in rows),
        "directNumericComparable": sum(row["lane"] in {"numeric", "numeric_blocked", "checkpoint"} for row in rows),
        "localEngineeringPass": sum(row["lane"] == "numeric" for row in rows),
        "numericQualificationBlocked": sum(row["lane"] == "numeric_blocked" for row in rows),
        "engineCheckpointPass": sum(row["lane"] == "checkpoint" for row in rows),
        "equivalentCriterionPass": sum(row["lane"] == "criterion" for row in rows),
        "sameCasePending": sum(row["lane"] == "engine_only" for row in rows),
        "externalOfficialPassClaimed": 0,
    }
    return {
        "schemaVersion": "strix-reference-sstructures-comparison-v2",
        "generatedAt": SNAPSHOT_DATE,
        "title": "STRIX - Reference - S-Structures 비교 보고서",
        "publicPage": PUBLIC_PAGE,
        "claimBoundary": "LOCAL_ENGINE_AND_PUBLIC_CHECKPOINT_COMPARISON_ONLY_NO_EXTERNAL_OFFICIAL_PASS_CLAIM",
        "counts": counts,
        "definitions": {
            "numericComparable": "The public primary quantity has a S-Structures value from a same-problem local run or public checkpoint fixture.",
            "directNumericComparable": "The public representative quantity or checkpoint is compared directly; equivalent acceptance-criterion rows are counted separately.",
            "engineFunctionAvailable": "The required numerical engine path exists and passed internal probes; this does not mean the public model was reproduced.",
            "externalOfficialPassClaimed": "Requires independent external execution/custody and like-for-like source equivalence; not performed here.",
        },
        "cases": rows,
        "supplemental": build_supplemental(),
    }


def build_supplemental():
    path = P18A_ROOT / "p18a-additional-comparison-evidence.json"
    evidence = read_json(path)
    xv1 = evidence["XV1"]
    rows = []
    for label, source in [("XV1 M1", xv1["practice"]), ("XV1 M16", xv1["finest"])]:
        rows.append({
            "id": label,
            "benchmark": "Cantilever shear wall tip displacement",
            "unit": "mm",
            "strix": source.get("strixMm"),
            "programA": source.get("programAMm"),
            "reference": source["referenceMm"],
            "sStructures": source["displacementMm"],
            "errorVsReferencePct": source["errorVsReferencePct"],
            "errorVsStrixPct": source.get("errorVsStrixPct"),
            "errorVsProgramAPct": source.get("errorVsProgramAPct"),
            "status": "PASS" if label == "XV1 M16" or abs(source.get("errorVsProgramAPct") or 999) < 3 else "REVIEW",
            "evidencePath": str(path.relative_to(VAULT_ROOT)).replace("\\", "/"),
        })
    rows.append({
        "id": "XV2",
        "benchmark": "Wall on a transfer beam",
        "unit": "kN",
        "strix": None,
        "programA": None,
        "reference": 162.5,
        "sStructures": None,
        "errorVsReferencePct": None,
        "errorVsStrixPct": None,
        "errorVsProgramAPct": None,
        "status": "INPUT_BLOCKED",
        "evidencePath": str(path.relative_to(VAULT_ROOT)).replace("\\", "/"),
    })
    return {
        "denominator": "SEPARATE_FROM_OFFICIAL_21",
        "completed": 1,
        "total": 2,
        "rows": rows,
        "xv2Missing": evidence["XV2"]["missing"],
    }


def validate_document(document):
    rows = document["cases"]
    counts = document["counts"]
    expected_ids = [row["id"] for row in CASES]
    actual_ids = [row["id"] for row in rows]
    if actual_ids != expected_ids or len(set(actual_ids)) != 21:
        raise AssertionError(f"Unexpected benchmark roster: {actual_ids}")
    expected_counts = {
        "total": 21,
        "engineFunctionAvailable": 21,
        "numericComparable": 15,
        "directNumericComparable": 13,
        "localEngineeringPass": 9,
        "numericQualificationBlocked": 2,
        "engineCheckpointPass": 2,
        "equivalentCriterionPass": 2,
        "sameCasePending": 6,
        "externalOfficialPassClaimed": 0,
    }
    if counts != expected_counts:
        raise AssertionError(f"Unexpected status counts: {counts}")
    for row in rows:
        if not math.isfinite(row["strix"]) or not math.isfinite(row["reference"]):
            raise AssertionError(f"Non-finite public value: {row['id']}")
        if row["lane"] == "engine_only":
            if row["sStructures"] is not None or row["evidencePath"] is not None:
                raise AssertionError(f"Pending row must not publish a S-Structures value: {row['id']}")
            continue
        if row["sStructures"] is None or not math.isfinite(row["sStructures"]):
            raise AssertionError(f"Missing S-Structures value: {row['id']}")
        if not row["evidencePath"] or not (VAULT_ROOT / row["evidencePath"]).is_file():
            raise AssertionError(f"Missing evidence file: {row['id']} -> {row['evidencePath']}")
        for key in (("errorVsStrixPct",) if row["lane"] == "criterion" else ("errorVsReferencePct", "errorVsStrixPct")):
            if row[key] is None or not math.isfinite(row[key]):
                raise AssertionError(f"Missing error metric: {row['id']} {key}")
        if row["lane"] == "criterion" and not math.isfinite(row.get("gateUtilizationPct", math.nan)):
            raise AssertionError(f"Missing criterion utilization: {row['id']}")
def write_json(document):
    path = REPORT_ROOT / "comparison-data.json"
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def write_csv(rows):
    path = REPORT_ROOT / "comparison-data.csv"
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "id", "category", "benchmark", "quantity", "unit", "strix", "reference", "sStructures",
            "errorVsReferencePct", "errorVsStrixPct", "status", "statusLabel", "note", "evidencePath",
        ])
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key) for key in writer.fieldnames})
    return path


def md_escape(value):
    return str(value).replace("|", "\\|").replace("\n", " ")


def write_markdown(document):
    counts = document["counts"]
    lines = [
        "# STRIX - Reference - S-Structures 비교 보고서",
        "",
        f"기준일: {SNAPSHOT_DATE}",
        "",
        f"> 직접 수치비교 {counts['directNumericComparable']}/21, 동등 판정기준 {counts['equivalentCriterionPass']}/21, 동일모델 미완료 {counts['sameCasePending']}/21, 외부 공식 PASS 주장 {counts['externalOfficialPassClaimed']}/21.",
        "",
        "DCR 한국어 검증 페이지처럼 대표값과 판정을 먼저 보이도록 정리했다. `동등 기준 PASS`는 같은 허용기준을 통과했다는 뜻이며 절대 응답값의 동일성을 뜻하지 않는다.",
        "",
    ]
    category_names = {"Element": "요소", "Analysis": "해석", "Nonlinear": "비선형", "Stabilization": "안정화"}
    for category in ["Element", "Analysis", "Nonlinear", "Stabilization"]:
        category_rows = [row for row in document["cases"] if row["category"] == category]
        lines.extend([
            f"## {category_names[category]}", "",
            "| ID | 검증 문제 / 물리량 | STRIX | 기준값 | S-Structures | 오차·한계 | 판정 |",
            "|---|---|---:|---:|---:|---:|---|",
        ])
        for row in category_rows:
            lines.append("| " + " | ".join(md_escape(value) for value in [
                row["id"], f"{row['benchmark']} / {row['quantity']}", fmt_number(row["strix"], row["unit"]),
                fmt_reference(row), fmt_number(row["sStructures"], row["unit"]), fmt_delta(row), row["statusLabel"],
            ]) + " |")
        lines.append("")
    lines.extend(["## 추가 교차검증", "", "공식 21개와 별도 분모다.", "", "| 검증 | STRIX | Program A | 기준값 | S-Structures | Δ 기준 | 판정 |", "|---|---:|---:|---:|---:|---:|---|"])
    for row in document["supplemental"]["rows"]:
        lines.append("| " + " | ".join(md_escape(value) for value in [
            row["id"], fmt_number(row["strix"], row["unit"]), fmt_number(row["programA"], row["unit"]),
            fmt_number(row["reference"], row["unit"]), fmt_number(row["sStructures"], row["unit"]),
            fmt_pct(row["errorVsReferencePct"]), "PASS" if row["status"] == "PASS" else "입력 필요",
        ]) + " |")
    lines.extend([
        "", "## 판정 경계", "",
        "- 직접 수치비교: 공개 대표 물리량 또는 공개 checkpoint를 S-Structures 출력과 직접 비교했다.",
        "- 동등 기준 PASS: SP1·P3S2의 공개 판정법/허용한계를 생산 엔진에 적용했다.",
        "- 동일모델 미완료: SB12·SM5b·SM6·SR1·SR2·SR2b 6건은 공개 입력이 부족하다.",
        "- 외부 공식 PASS: 0건. 독립 외부 실행과 custody가 없으므로 주장하지 않는다.",
        "",
        f"공개 페이지: {PUBLIC_PAGE}",
    ])
    path = REPORT_ROOT / "STRIX_Reference_S-Structures_비교보고서.md"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def write_html(document):
    counts = document["counts"]
    status_cards = [
        ("직접 수치비교", f"{counts['directNumericComparable']}/21", "공개 대표값·checkpoint 직접 비교"),
        ("동등 판정기준", f"{counts['equivalentCriterionPass']}/21", "SP1·P3S2 허용기준 통과"),
        ("입력 미완료", f"{counts['sameCasePending']}/21", "공개 모델 입력이 더 필요"),
        ("외부 공식 PASS", f"{counts['externalOfficialPassClaimed']}/21", "독립 외부 실행·custody 미수행"),
    ]
    cards_html = "".join(
        f'<div class="card"><div class="card-label">{html.escape(label)}</div><div class="card-value">{value}</div><div class="card-note">{html.escape(note)}</div></div>'
        for label, value, note in status_cards
    )
    sections = []
    for category, title in [("Element", "요소 검증"), ("Analysis", "해석 검증"), ("Nonlinear", "비선형 검증"), ("Stabilization", "안정화 검증")]:
        body = []
        for row in (item for item in document["cases"] if item["category"] == category):
            lane_class = {"numeric": "pass", "numeric_blocked": "review", "checkpoint": "checkpoint", "criterion": "criterion", "engine_only": "pending"}[row["lane"]]
            body.append(f"""
              <tr>
                <td><span class="case-id">{row['id']}</span></td>
                <td><strong>{html.escape(row['benchmark'])}</strong><br><span class="muted">{html.escape(row['quantity'])}</span></td>
                <td class="num">{html.escape(fmt_number(row['strix'], row['unit']))}</td>
                <td class="num">{html.escape(fmt_reference(row))}</td>
                <td class="num svalue">{html.escape(fmt_number(row['sStructures'], row['unit']))}</td>
                <td class="num">{html.escape(fmt_delta(row))}</td>
                <td><span class="badge {lane_class}">{html.escape(row['statusLabel'])}</span></td>
              </tr>""")
        sections.append(f"""
          <section>
            <div class="section-head"><div><span class="eyebrow">{category}</span><h2>{title}</h2></div><span>{len(body)} benchmarks</span></div>
            <div class="table-wrap"><table><thead><tr><th>ID</th><th>검증 문제 / 대표 물리량</th><th>STRIX</th><th>기준값</th><th>S-Structures</th><th>오차·한계</th><th>판정</th></tr></thead><tbody>{''.join(body)}</tbody></table></div>
          </section>""")

    supplemental_rows = []
    for row in document["supplemental"]["rows"]:
        badge = "pass" if row["status"] == "PASS" else "pending"
        label = "PASS" if row["status"] == "PASS" else "입력 필요"
        supplemental_rows.append(f"""<tr><td><span class="case-id">{row['id']}</span></td><td>{html.escape(row['benchmark'])}</td>
        <td class="num">{html.escape(fmt_number(row['strix'], row['unit']))}</td><td class="num">{html.escape(fmt_number(row['programA'], row['unit']))}</td>
        <td class="num">{html.escape(fmt_number(row['reference'], row['unit']))}</td><td class="num svalue">{html.escape(fmt_number(row['sStructures'], row['unit']))}</td>
        <td class="num">{html.escape(fmt_pct(row['errorVsReferencePct']))}</td><td><span class="badge {badge}">{label}</span></td></tr>""")

    page = f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{html.escape(document['title'])}</title>
<style>
:root{{--navy:{NAVY};--navy2:{NAVY_2};--teal:{TEAL};--green:{GREEN};--amber:{AMBER};--ink:{INK};--muted:{MUTED};--line:#D5E0E6;--pale:{PALE};}}
*{{box-sizing:border-box}} body{{margin:0;font-family:"Malgun Gothic","Apple SD Gothic Neo",Arial,sans-serif;color:var(--ink);background:#F4F7F9;line-height:1.55}}
.hero{{background:linear-gradient(125deg,var(--navy2),var(--navy));color:white;padding:72px 24px 88px}} .inner{{max-width:1500px;margin:auto}}
.hero .eyebrow{{color:#8FDBD4}} h1{{font-size:42px;line-height:1.15;margin:10px 0 18px}} .hero p{{max-width:930px;color:#D5E4EC;font-size:18px}}
.scope{{display:inline-flex;padding:8px 12px;border:1px solid #6F91A3;border-radius:999px;font-size:13px;margin-top:14px}}
.cards{{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:-45px;margin-bottom:34px}} .card{{background:white;border-radius:14px;padding:22px;box-shadow:0 8px 24px rgba(18,62,90,.12);border-top:4px solid var(--teal)}}
.card-label{{font-size:14px;color:var(--muted)}} .card-value{{font-size:34px;font-weight:800;color:var(--navy);margin:4px 0}} .card-note{{font-size:13px;color:var(--muted)}}
main{{padding:0 24px 72px}} .notice{{background:#FFF7DE;border-left:5px solid var(--amber);padding:18px 22px;border-radius:8px;margin-bottom:28px}} section{{background:white;border:1px solid #DDE6EB;border-radius:14px;margin:22px 0;padding:22px;box-shadow:0 3px 12px rgba(25,55,75,.05)}}
.section-head{{display:flex;align-items:end;justify-content:space-between;margin-bottom:14px}} .section-head h2{{margin:2px 0;font-size:25px;color:var(--navy)}} .section-head>span{{font-size:13px;color:var(--muted)}} .eyebrow{{text-transform:uppercase;letter-spacing:.12em;color:var(--teal);font-weight:700;font-size:12px}}
.table-wrap{{overflow-x:auto}} table{{border-collapse:collapse;width:100%;min-width:980px;font-size:13px}} th{{background:var(--navy);color:white;text-align:left;padding:11px 9px;white-space:nowrap}} td{{border-bottom:1px solid #E1E8EC;padding:11px 9px;vertical-align:top}} tr:hover td{{background:#F7FAFB}} .num{{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}} .svalue{{font-weight:700;color:var(--navy)}} .case-id{{font-weight:800;color:var(--teal)}} .muted{{color:var(--muted);font-size:12px}}
.badge{{display:inline-block;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:700;white-space:nowrap}} .badge.pass{{background:#E4F5EC;color:#0B7546}} .badge.review{{background:#FFF0CE;color:#8D5B00}} .badge.checkpoint{{background:#E3F2F7;color:#075D75}} .badge.criterion{{background:#EAE7FA;color:#5640A7}} .badge.pending{{background:#EEF1F3;color:#4D5B64}}
.figures{{display:grid;grid-template-columns:1fr 1fr;gap:18px}} .figure{{background:white;padding:16px;border:1px solid #DDE6EB;border-radius:12px}} .figure img{{width:100%;height:auto}} .figure p{{margin:8px 4px 0;color:var(--muted);font-size:12px}}
.legend{{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}} .legend div{{padding:15px;border-radius:10px;background:var(--pale)}} footer{{background:var(--navy2);color:#CBDAE3;padding:26px 24px;font-size:13px}} a{{color:#68CAC4}}
@media(max-width:900px){{.cards,.figures,.legend{{grid-template-columns:1fr 1fr}} h1{{font-size:32px}}}} @media(max-width:560px){{.cards,.figures,.legend{{grid-template-columns:1fr}}}}
</style></head>
<body><header class="hero"><div class="inner"><span class="eyebrow">S-Structures verification status</span><h1>STRIX · 기준값 · S-Structures<br>수치 비교</h1><p>대표값, 오차, 판정만 먼저 보이게 정리했습니다. 핵심 엔진 경로는 21/21 동작하며, 직접 비교와 동등 기준 비교를 구분했습니다.</p><div class="scope">기준일 {SNAPSHOT_DATE} | 외부 공식 PASS 주장 없음</div></div></header>
<main><div class="inner"><div class="cards">{cards_html}</div><div class="notice"><strong>한눈에 읽기:</strong> `직접 수치비교`는 같은 물리량을 비교한 결과입니다. `동등 기준 PASS`는 SP1·P3S2의 공개 허용기준을 생산 엔진에 적용한 결과이며 절대 응답값 동일성 주장은 아닙니다.</div>
{''.join(sections)}
<section><div class="section-head"><div><span class="eyebrow">Supplemental</span><h2>추가 교차검증 — 공식 21개와 별도</h2></div><span>1/2 완료</span></div><div class="table-wrap"><table><thead><tr><th>검증</th><th>문제</th><th>STRIX</th><th>Program A</th><th>기준값</th><th>S-Structures</th><th>Δ 기준</th><th>판정</th></tr></thead><tbody>{''.join(supplemental_rows)}</tbody></table></div><p class="muted">XV1 M1: S-Structures 1.756790 mm, Program A 대비 −0.000090%. XV1 M16: 기준값 대비 −0.234%. XV2는 공유 MGT와 정확한 복원 mapping이 없어 보류했습니다.</p></section>
<section><div class="section-head"><div><span class="eyebrow">Claim boundary</span><h2>남은 6개와 판정 경계</h2></div></div><div class="legend"><div><strong>SB12</strong><br>N2 좌표·링크 강성·하중</div><div><strong>SM5b·SM6</strong><br>질량 mapping·중간 절점</div><div><strong>SR1·SR2·SR2b</strong><br>질량·단면·스펙트럼·위상</div><div><strong>외부 공식 PASS 0</strong><br>독립 외부 실행 증거 없음</div></div><p>따라서 “기능이 없다”가 아니라 “공개 PDF만으로 동일 입력을 잠글 수 없다”가 정확한 상태입니다.</p></section></div></main>
<footer><div class="inner">Source: <a href="{PUBLIC_PAGE}">{PUBLIC_PAGE}</a> | Local evidence: testreport/STRIX-21-검증 and verification/benchmarks/strix21/milestones/P18 + P18A</div></footer></body></html>"""
    path = REPORT_ROOT / "index.html"
    path.write_text(page, encoding="utf-8")
    return path


def load_font(size, bold=False):
    path = Path("C:/Windows/Fonts/malgunbd.ttf" if bold else "C:/Windows/Fonts/malgun.ttf")
    return ImageFont.truetype(str(path), size)


def create_status_figure(document):
    counts = document["counts"]
    width, height = 1500, 760
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    title = load_font(40, True)
    label = load_font(25, True)
    small = load_font(20)
    draw.text((70, 54), "21개 검증군 진행 상태", font=title, fill=NAVY_2)
    cards = [
        ("직접 수치비교", counts["directNumericComparable"], GREEN),
        ("동등 판정기준", counts["equivalentCriterionPass"], TEAL),
        ("입력 미완료", counts["sameCasePending"], AMBER),
        ("외부 공식 PASS", counts["externalOfficialPassClaimed"], RED),
    ]
    x0, y0, card_w, gap = 70, 155, 315, 30
    for index, (name, value, color) in enumerate(cards):
        x = x0 + index * (card_w + gap)
        draw.rounded_rectangle((x, y0, x + card_w, y0 + 430), radius=24, fill="#F4F8FA", outline="#D8E4EA", width=2)
        draw.text((x + 26, y0 + 32), name, font=label, fill=INK)
        draw.text((x + 26, y0 + 100), f"{value}/21", font=load_font(58, True), fill=color)
        bar_y = y0 + 225
        draw.rounded_rectangle((x + 26, bar_y, x + card_w - 26, bar_y + 30), radius=15, fill="#DCE5EA")
        if value:
            fill_w = (card_w - 52) * value / 21
            draw.rounded_rectangle((x + 26, bar_y, x + 26 + fill_w, bar_y + 30), radius=15, fill=color)
        detail = {
            "직접 수치비교": "대표값·checkpoint 비교",
            "동등 판정기준": "SP1·P3S2 기준 통과",
            "입력 미완료": "공개 입력 source lock 필요",
            "외부 공식 PASS": "독립 외부 증거 없음",
        }[name]
        draw.text((x + 26, y0 + 300), detail, font=small, fill=MUTED)
    draw.text((70, 665), "기능 구현과 동일모델 비교, 외부 적격성은 서로 다른 단계입니다.", font=small, fill=MUTED)
    path = FIGURE_ROOT / "status-overview.png"
    image.save(path)
    return path


def create_error_figure(rows):
    numeric = [row for row in rows if row["sStructures"] is not None and row["errorVsReferencePct"] is not None]
    width, height = 1500, 920
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    title = load_font(38, True)
    label = load_font(21, True)
    small = load_font(17)
    draw.text((70, 42), "대표값 절대 오차율 비교", font=title, fill=NAVY_2)
    draw.text((70, 96), "로그 축 / 왼쪽일수록 작은 오차", font=small, fill=MUTED)
    left, right, top, bottom = 270, 1390, 160, 810
    min_log, max_log = -6.0, math.log10(3.0)

    def xpos(error):
        value = max(1e-6, abs(error or 0))
        return left + (math.log10(value) - min_log) / (max_log - min_log) * (right - left)

    for tick in [1e-6, 1e-4, 1e-2, 1.0, 3.0]:
        x = xpos(tick)
        draw.line((x, top, x, bottom), fill="#D9E3E8", width=2)
        draw.text((x - 28, bottom + 16), f"{tick:g}%", font=small, fill=MUTED)
    row_h = (bottom - top) / len(numeric)
    for index, row in enumerate(numeric):
        y = top + row_h * (index + 0.5)
        draw.text((74, y - 13), row["id"], font=label, fill=INK)
        x_ref = xpos(row["errorVsReferencePct"])
        x_strix = xpos(row["errorVsStrixPct"])
        draw.line((left, y, right, y), fill="#EDF1F3", width=1)
        draw.ellipse((x_ref - 7, y - 7, x_ref + 7, y + 7), fill=TEAL)
        draw.rectangle((x_strix - 6, y - 6, x_strix + 6, y + 6), fill=AMBER)
        text = f"Ref {abs(row['errorVsReferencePct']):.6g}%  STRIX {abs(row['errorVsStrixPct']):.6g}%"
        draw.text((right - 310, y - 13), text, font=small, fill=MUTED)
    draw.ellipse((70, 855, 84, 869), fill=TEAL)
    draw.text((94, 850), "vs Reference", font=small, fill=INK)
    draw.rectangle((260, 855, 274, 869), fill=AMBER)
    draw.text((284, 850), "vs STRIX", font=small, fill=INK)
    path = FIGURE_ROOT / "error-comparison.png"
    image.save(path)
    return path


def register_pdf_fonts():
    regular = Path("C:/Windows/Fonts/malgun.ttf")
    bold = Path("C:/Windows/Fonts/malgunbd.ttf")
    pdfmetrics.registerFont(TTFont("Malgun", str(regular)))
    pdfmetrics.registerFont(TTFont("MalgunBold", str(bold)))


def p(text, style):
    return Paragraph(html.escape(str(text)).replace("\n", "<br/>"), style)


def pdf_status_color(lane):
    return {"numeric": PALE_GREEN, "numeric_blocked": PALE_AMBER, "checkpoint": PALE_BLUE, "criterion": "#EAE7FA", "engine_only": "#EEF1F3"}[lane]


def comparison_table(rows, styles, compact=False):
    header = ["ID", "검증 문제 / 대표 물리량", "STRIX", "기준값", "S-Structures", "오차·한계", "판정"]
    data = [[p(value, styles["table_header"]) for value in header]]
    for row in rows:
        data.append([
            p(row["id"], styles["table_bold"]),
            p(f"{row['benchmark']}\n{row['quantity']}", styles["table"]),
            p(fmt_number(row["strix"], row["unit"]), styles["table_right"]),
            p(fmt_reference(row), styles["table_right"]),
            p(fmt_number(row["sStructures"], row["unit"]), styles["table_right"]),
            p(fmt_delta(row), styles["table_right"]),
            p(row["statusLabel"], styles["table"]),
        ])
    # A4 landscape with 14 mm left/right margins leaves 269 mm of usable width.
    widths = [13, 87, 34, 34, 38, 34, 29]
    table = LongTable(data, repeatRows=1, colWidths=[value * mm for value in widths], hAlign="LEFT")
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(NAVY)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#CAD7DE")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 5 if compact else 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5 if compact else 6),
    ]
    for index, row in enumerate(rows, start=1):
        commands.append(("BACKGROUND", (6, index), (6, index), colors.HexColor(pdf_status_color(row["lane"]))))
        if index % 2 == 0:
            commands.append(("BACKGROUND", (0, index), (5, index), colors.HexColor("#F7FAFB")))
    table.setStyle(TableStyle(commands))
    return table


def supplemental_table(rows, styles):
    header = ["검증", "STRIX", "Program A", "기준값", "S-Structures", "Delta 기준", "판정"]
    data = [[p(value, styles["table_header"]) for value in header]]
    for row in rows:
        data.append([
            p(row["id"], styles["table_bold"]),
            p(fmt_number(row["strix"], row["unit"]), styles["table_right"]),
            p(fmt_number(row["programA"], row["unit"]), styles["table_right"]),
            p(fmt_number(row["reference"], row["unit"]), styles["table_right"]),
            p(fmt_number(row["sStructures"], row["unit"]), styles["table_right"]),
            p(fmt_pct(row["errorVsReferencePct"]), styles["table_right"]),
            p("PASS" if row["status"] == "PASS" else "입력 필요", styles["table"]),
        ])
    table = LongTable(data, repeatRows=1, colWidths=[31 * mm, 38 * mm, 38 * mm, 38 * mm, 45 * mm, 38 * mm, 41 * mm], hAlign="LEFT")
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(NAVY)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#CAD7DE")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    for index, row in enumerate(rows, start=1):
        commands.append(("BACKGROUND", (6, index), (6, index), colors.HexColor(PALE_GREEN if row["status"] == "PASS" else "#EEF1F3")))
    table.setStyle(TableStyle(commands))
    return table


def notes_table(rows, styles):
    data = [[p("ID", styles["table_header"]), p("해석 상태와 비고", styles["table_header"])]]
    for row in rows:
        data.append([p(row["id"], styles["table_bold"]), p(row["note"], styles["table"])])
    table = LongTable(data, repeatRows=1, colWidths=[20 * mm, 245 * mm], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(NAVY)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#CAD7DE")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def build_pdf(document, status_figure: Path, error_figure: Path):
    register_pdf_fonts()
    page_size = landscape(A4)
    doc = SimpleDocTemplate(
        str(PDF_PATH), pagesize=page_size,
        leftMargin=14 * mm, rightMargin=14 * mm, topMargin=17 * mm, bottomMargin=15 * mm,
        title=document["title"], author="S-Structures",
    )
    sample = getSampleStyleSheet()
    styles = {
        "title": ParagraphStyle("title", parent=sample["Title"], fontName="MalgunBold", fontSize=27, leading=34, textColor=colors.HexColor(NAVY_2), alignment=TA_LEFT, spaceAfter=9),
        "subtitle": ParagraphStyle("subtitle", parent=sample["BodyText"], fontName="Malgun", fontSize=11, leading=17, textColor=colors.HexColor(MUTED), spaceAfter=10),
        "h1": ParagraphStyle("h1", parent=sample["Heading1"], fontName="MalgunBold", fontSize=20, leading=25, textColor=colors.HexColor(NAVY), spaceAfter=9),
        "h2": ParagraphStyle("h2", parent=sample["Heading2"], fontName="MalgunBold", fontSize=13, leading=18, textColor=colors.HexColor(TEAL), spaceBefore=6, spaceAfter=6),
        "body": ParagraphStyle("body", parent=sample["BodyText"], fontName="Malgun", fontSize=9, leading=14, textColor=colors.HexColor(INK), spaceAfter=7),
        "small": ParagraphStyle("small", parent=sample["BodyText"], fontName="Malgun", fontSize=7.5, leading=11, textColor=colors.HexColor(MUTED)),
        "callout": ParagraphStyle("callout", parent=sample["BodyText"], fontName="MalgunBold", fontSize=10, leading=15, textColor=colors.HexColor(NAVY), backColor=colors.HexColor(PALE), borderPadding=8, spaceBefore=5, spaceAfter=9),
        "table": ParagraphStyle("table", parent=sample["BodyText"], fontName="Malgun", fontSize=7.1, leading=9.5, textColor=colors.HexColor(INK)),
        "table_bold": ParagraphStyle("table_bold", parent=sample["BodyText"], fontName="MalgunBold", fontSize=7.3, leading=9.5, textColor=colors.HexColor(TEAL)),
        "table_right": ParagraphStyle("table_right", parent=sample["BodyText"], fontName="Malgun", fontSize=7.0, leading=9.5, textColor=colors.HexColor(INK), alignment=2),
        "table_header": ParagraphStyle("table_header", parent=sample["BodyText"], fontName="MalgunBold", fontSize=7.2, leading=9, textColor=colors.white, alignment=TA_CENTER),
    }
    counts = document["counts"]
    cover_figure = PdfImage(str(status_figure), width=187.5 * mm, height=95 * mm)
    cover_figure.hAlign = "CENTER"
    story = [
        Spacer(1, 3 * mm),
        p("S-Structures verification status", styles["h2"]),
        p("STRIX - Reference - S-Structures\n비교 보고서", styles["title"]),
        p("DCR 한국어 검증 페이지처럼 대표값·오차·판정을 먼저 보이게 정리했다. 직접 수치비교와 동등 판정기준을 구분하고, 추가 XV1 교차검증은 공식 21개와 별도 집계했다.", styles["subtitle"]),
        cover_figure,
        Spacer(1, 3 * mm),
        p(f"핵심 판정: 직접 수치비교 {counts['directNumericComparable']}/21 | 동등 판정기준 {counts['equivalentCriterionPass']}/21 | 입력 미완료 {counts['sameCasePending']}/21 | 외부 공식 PASS 주장 0/21", styles["callout"]),
        PageBreak(),
        p("1. 보고서 읽는 법", styles["h1"]),
        p("DCR 페이지는 STRIX와 공개 Reference의 대표값을 21개 표로 제시한다. 본 보고서는 같은 물리량의 직접 비교 13건과, 동일 허용기준을 적용한 SP1·P3S2 2건을 명확히 분리한다.", styles["body"]),
        p("상태 구분", styles["h2"]),
        notes_table([
            dict(id="A", note="수치비교 PASS: 로컬 동일문제 대표 물리량을 비교했다."),
            dict(id="B", note="수치 PASS / 적격성 보류: 숫자는 허용오차에 들지만 독립 mode vector, work-balance 등 적격성 증거가 남았다."),
            dict(id="C", note="체크포인트 PASS: 공개 TH1/SH1 checkpoint를 새 엔진 모듈로 재현했다. 외부 공식 qualification은 아니다."),
            dict(id="D", note="동등 기준 PASS: SP1 pre-peak self-consistency와 P3S2 안정화 민감도 허용한계를 생산 엔진에 적용했다."),
            dict(id="E", note="기능 PASS / 동일모델 미완료: 핵심 엔진 probe는 통과했지만 공개 입력·probe와 동일한 모델 실행은 남았다."),
        ], styles),
        Spacer(1, 5 * mm),
        p("오차 계산", styles["h2"]),
        p("직접 비교의 Delta는 (S-Structures - 기준값) / |기준값| x 100이다. 동등 기준 행의 '오차·한계'는 허용한계 중 실제 변화율이 차지한 비율이다. SB10은 공개 페이지와 같이 축력 절댓값을 비교했다.", styles["body"]),
        p("중요한 판정 경계", styles["h2"]),
        p("STRIX raw R4, MIDAS 동일모델 실행, 독립 외부 custody가 없으므로 S-Structures 외부 공식 PASS는 0건이다. DCR 페이지의 STRIX 21/21 PASS 문구는 공개 출처의 주장으로 인용하며 본 보고서가 독립 재검증한 사실로 사용하지 않는다.", styles["callout"]),
        PageBreak(),
    ]

    category_titles = {"Element": "2. Element Benchmarks", "Analysis": "3. Analysis Benchmarks", "Nonlinear": "4. Nonlinear Benchmarks", "Stabilization": "5. Stabilization Studies"}
    for category in ["Element", "Analysis", "Nonlinear", "Stabilization"]:
        category_rows = [row for row in document["cases"] if row["category"] == category]
        story.extend([
            p(category_titles[category], styles["h1"]),
            comparison_table(category_rows, styles, compact=category == "Element"),
        ])
        if category == "Element":
            story.extend([PageBreak(), p("2.1 Element Benchmarks - 비고", styles["h1"])])
        else:
            story.append(Spacer(1, 4 * mm))
        story.extend([
            p("비고", styles["h2"]),
            notes_table(category_rows, styles),
            PageBreak(),
        ])

    numeric = [row for row in document["cases"] if row["sStructures"] is not None]
    pending = [row for row in document["cases"] if row["lane"] == "engine_only"]
    story.extend([
        p("6. 추가 교차검증 - 공식 21개와 별도", styles["h1"]),
        p("XV1은 Cross-Code Note의 공개 형상·재료·하중으로 S-Structures membrane 요소를 M1~M16까지 실제 실행했다. XV2는 공유 MGT와 정확한 복원 mapping이 없어서 수치를 추정하지 않았다.", styles["body"]),
        supplemental_table(document["supplemental"]["rows"], styles),
        Spacer(1, 4 * mm),
        p("XV1 M1은 S-Structures 1.756790 mm로 Program A 1.756792 mm 대비 -0.000090%다. XV1 M16은 1.823420 mm로 Timoshenko 기준 1.8277 mm 대비 -0.234%이며 3% 허용범위 안이다.", styles["callout"]),
        PageBreak(),
        p("7. 동일모델 미완료 6개", styles["h1"]),
        p("아래 항목은 핵심 엔진 경로와 내부 probe를 통과했다. 그러나 공개 PDF에 동일모델 입력이 모두 없어 S-Structures 숫자 칸을 비워 두었다.", styles["body"]),
        notes_table(pending, styles),
        Spacer(1, 5 * mm),
        p("권장 처리 순서", styles["h2"]),
        p("1) SB12 N2·강성·하중 source lock → 2) SM5b 질량/Jz mapping → 3) SM6 중간 절점 좌표 → 4) SR1 질량·스펙트럼 → 5) SR2 전체 단면·질량·위상 → 6) SR2b El Centro 스펙트럼·부재 mapping", styles["callout"]),
        PageBreak(),
        p("8. 출처와 재현", styles["h1"]),
        p(f"공개 비교표: {PUBLIC_PAGE}", styles["body"]),
        p("로컬 문제별 evidence: testreport/STRIX-21-검증/<CASE>/", styles["body"]),
        p("Phase 18 engine evidence: S-Structures-main/verification/benchmarks/strix21/milestones/P18/<CASE>/", styles["body"]),
        p("추가 실행 evidence: S-Structures-main/verification/benchmarks/strix21/milestones/P18A/p18a-additional-comparison-evidence.json", styles["body"]),
        p("생성 산출물", styles["h2"]),
        notes_table([
            dict(id="HTML", note="output/reports/strix-reference-sstructures-comparison/index.html"),
            dict(id="PDF", note="output/pdf/STRIX_Reference_S-Structures_비교보고서.pdf"),
            dict(id="MD", note="output/reports/strix-reference-sstructures-comparison/STRIX_Reference_S-Structures_비교보고서.md"),
            dict(id="DATA", note="comparison-data.json and comparison-data.csv"),
        ], styles),
        Spacer(1, 6 * mm),
        p(f"기준일 {SNAPSHOT_DATE}. 공식 21개 중 숫자가 표시된 행 {len(numeric)}개(직접 13 + 동등 기준 2), 입력 미완료 {len(pending)}개다. 추가 XV1은 공식 분모와 별도다.", styles["callout"]),
    ])

    def decorate(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#CCD9E0"))
        canvas.line(14 * mm, 11 * mm, page_size[0] - 14 * mm, 11 * mm)
        canvas.setFont("Malgun", 7)
        canvas.setFillColor(colors.HexColor(MUTED))
        canvas.drawString(14 * mm, 7 * mm, "S-Structures - STRIX/Reference comparison - no external official PASS claim")
        canvas.drawRightString(page_size[0] - 14 * mm, 7 * mm, str(document.page))
        canvas.restoreState()

    doc.build(story, onFirstPage=decorate, onLaterPages=decorate)


def sha256(path: Path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main():
    REPORT_ROOT.mkdir(parents=True, exist_ok=True)
    PDF_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIGURE_ROOT.mkdir(parents=True, exist_ok=True)
    rows = build_rows()
    document = build_document(rows)
    validate_document(document)
    status_figure = create_status_figure(document)
    error_figure = create_error_figure(rows)
    outputs = [write_json(document), write_csv(rows), write_markdown(document), write_html(document)]
    build_pdf(document, status_figure, error_figure)
    outputs.append(PDF_PATH)
    manifest = REPORT_ROOT / "report-manifest.json"
    manifest.write_text(json.dumps({
        "schemaVersion": "report-manifest-v1",
        "generatedAt": SNAPSHOT_DATE,
        "counts": document["counts"],
        "artifacts": [
            {"path": str(path.relative_to(REPO_ROOT)).replace("\\", "/"), "bytes": path.stat().st_size, "sha256": sha256(path)}
            for path in outputs + [status_figure, error_figure]
        ],
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    outputs.append(manifest)
    result = {
        "ok": True,
        "counts": document["counts"],
        "outputs": [{"path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)} for path in outputs],
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
