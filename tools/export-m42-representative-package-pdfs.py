# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import math
import warnings
from pathlib import Path

import fitz
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from fpdf import FPDF
from pypdf import PdfReader


REPORT_ROOT = Path("reports/representative-building-calculation-packages")
PDF_ROOT = Path("output/pdf/m42-representative-packages")
TMP_ROOT = Path("tmp/pdfs/m42-representative-package-plots")
FONT_REGULAR = Path("C:/Windows/Fonts/malgun.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/malgunbd.ttf")
VERSION_LABEL = "M42 representative calculation package PDF set"

warnings.filterwarnings("ignore", category=DeprecationWarning)


def main() -> None:
    PDF_ROOT.mkdir(parents=True, exist_ok=True)
    TMP_ROOT.mkdir(parents=True, exist_ok=True)
    index = read_json(REPORT_ROOT / "index.json")
    generated = []

    for item in index["buildings"]:
        building_dir = REPORT_ROOT / item["id"]
        model = read_json(building_dir / "model.json")
        summary = read_json(building_dir / "analysis-summary.json")
        package = read_json(building_dir / "calculation-package.json")
        plot_path = TMP_ROOT / f"{item['id']}-geometry.png"
        render_geometry_plot(model, plot_path)
        pdf_path = PDF_ROOT / f"{item['id']}.pdf"
        build_building_pdf(item, summary, package, model, plot_path, pdf_path)
        generated.append(file_entry(item, pdf_path))
        print(f"[{len(generated)}/10] {item['id']} -> {pdf_path}")

    index_pdf = PDF_ROOT / "00-index.pdf"
    build_index_pdf(index, generated, index_pdf)
    generated.insert(0, file_entry({"id": "00-index", "name": "PDF Review Index"}, index_pdf))
    write_manifest(index, generated)
    print(json.dumps({"ok": True, "outputRoot": str(PDF_ROOT), "count": len(generated)}, ensure_ascii=False, indent=2))


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def file_entry(item: dict, pdf_path: Path) -> dict:
    return {
        "id": item["id"],
        "name": item["name"],
        "pdf": str(pdf_path),
        "pages": count_pages(pdf_path),
        "sizeKB": round(pdf_path.stat().st_size / 1024, 1),
    }


def write_manifest(index: dict, generated: list[dict]) -> None:
    manifest = {
        "version": index["version"],
        "sourceGeneratedAt": index["generatedAt"],
        "pdfGeneratedBy": VERSION_LABEL,
        "count": len(generated),
        "files": generated,
    }
    (PDF_ROOT / "index.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    rows = "\n".join(
        f"| {item['id']} | {item['name']} | {item['pages']} | {item['sizeKB']} KB | `{Path(item['pdf']).name}` |"
        for item in generated
    )
    (PDF_ROOT / "README.md").write_text(
        "# M42 Representative Calculation Package PDFs\n\n"
        "Ten representative structural models were analyzed and exported as PDF review packages.\n\n"
        "| ID | Name | Pages | Size | File |\n"
        "| --- | --- | ---: | ---: | --- |\n"
        f"{rows}\n",
        encoding="utf-8",
    )


def render_geometry_plot(model: dict, output: Path) -> None:
    nodes = {node["id"]: node for node in model["nodes"]}
    members = model["members"]
    fig, axes = plt.subplots(1, 2, figsize=(10.8, 5.2), dpi=170)
    fig.patch.set_facecolor("white")

    draw_projection(axes[0], nodes, members, "xy")
    axes[0].set_title("Plan Projection", fontsize=11, fontweight="bold")
    axes[0].set_xlabel("X (m)")
    axes[0].set_ylabel("Y (m)")

    draw_projection(axes[1], nodes, members, "xz")
    axes[1].set_title("Elevation Projection", fontsize=11, fontweight="bold")
    axes[1].set_xlabel("X (m)")
    axes[1].set_ylabel("Z (m)")

    fig.suptitle(model.get("meta", {}).get("name", "Structural model"), fontsize=12, fontweight="bold")
    fig.tight_layout(rect=(0, 0, 1, 0.94))
    fig.savefig(output, bbox_inches="tight")
    plt.close(fig)


def draw_projection(axis, nodes: dict, members: list[dict], projection: str) -> None:
    for member in members:
        n1 = nodes[member["n1"]]
        n2 = nodes[member["n2"]]
        role = member.get("design", {}).get("role")
        color = "#1f6f8b" if role == "beam" else "#5e6670"
        width = 0.85 if role == "beam" else 1.15
        if projection == "xy":
            xs = [n1["x"], n2["x"]]
            ys = [n1["y"], n2["y"]]
        else:
            xs = [n1["x"], n2["x"]]
            ys = [n1["z"], n2["z"]]
        axis.plot(xs, ys, color=color, linewidth=width, alpha=0.76)
    if projection == "xy":
        axis.scatter([n["x"] for n in nodes.values()], [n["y"] for n in nodes.values()], s=6, color="#172635", alpha=0.74)
    else:
        axis.scatter([n["x"] for n in nodes.values()], [n["z"] for n in nodes.values()], s=6, color="#172635", alpha=0.74)
    axis.grid(True, color="#dfe6ed", linewidth=0.6)
    axis.set_aspect("equal", adjustable="box")


class PackagePdf(FPDF):
    def __init__(self, title: str):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.title_text = title
        self.set_auto_page_break(auto=True, margin=14)
        self.set_margins(14, 14, 14)
        self.alias_nb_pages()
        self.font_family = "Arial"
        if FONT_REGULAR.exists() and FONT_BOLD.exists():
            self.add_font("Malgun", "", str(FONT_REGULAR), uni=True)
            self.add_font("Malgun", "B", str(FONT_BOLD), uni=True)
            self.font_family = "Malgun"

    def footer(self):
        self.set_y(-11)
        self.set_font(self.font_family, "", 8)
        self.set_text_color(110, 118, 128)
        self.cell(0, 6, f"S-Structures / {self.page_no()}/{{nb}}", align="C")


def build_building_pdf(item: dict, summary: dict, package: dict, model: dict, plot_path: Path, pdf_path: Path) -> None:
    detailed = package["detailed"]
    pdf = PackagePdf(item["name"])
    pdf.add_page()
    cover(pdf, item, summary, package)
    metrics(pdf, [
        ("Nodes", item["nodes"]),
        ("Members", item["members"]),
        ("Loads", item["loads"]),
        ("Combos", item["combinations"]),
        ("Max disp.", fmt_len(item["maxDisplacement"])),
        ("Max util.", fmt_ratio(item["maxUtilization"])),
    ])
    section(pdf, "Model And Design Basis")
    table(pdf, ["Item", "Value"], [
        ["Building type", item.get("type", "-")],
        ["Description", summary.get("description", "-")],
        ["Occupancy", package["detailed"].get("loadDerivation", {}).get("occupancyLabel", "-")],
        ["Bounds X/Y/Z", detailed["model"]["boundsText"]],
        ["Analysis status", detailed["analysis"]["status"]],
        ["Design status", summary.get("designStatus", item.get("designStatus", "-"))],
        ["Package audit", "OK" if package["qualityAudit"]["ok"] else "Check"],
    ], [48, 132])
    section(pdf, "Load Case Trace")
    load_rows = [
        [row["id"], row["type"], row["loadCount"], fmt_force(row["total"][0]), fmt_force(row["total"][1]), fmt_force(row["total"][2])]
        for row in detailed["loadCases"]
    ]
    table(pdf, ["Case", "Type", "Loads", "Fx", "Fy", "Fz"], load_rows, [20, 31, 23, 35, 35, 35])
    section(pdf, "Load Derivation")
    derivation = detailed.get("loadDerivation") or {}
    gravity_rows = []
    for idx, row in enumerate(derivation.get("gravity", [])[:8]):
        lateral = derivation.get("lateral", [{}])[idx] if idx < len(derivation.get("lateral", [])) else {}
        gravity_rows.append([
            row["story"],
            fmt_num(row["area"]),
            fmt_force(row["deadTotal"]),
            fmt_force(row["liveTotal"]),
            fmt_force(lateral.get("windX")),
            fmt_force(lateral.get("windY")),
        ])
    table(pdf, ["Story", "Area", "D total", "L total", "Wind X", "Wind Y"], gravity_rows, [18, 28, 34, 34, 34, 34])

    pdf.add_page()
    section(pdf, "Geometry")
    pdf.image(str(plot_path), x=14, y=pdf.get_y() + 3, w=182)
    pdf.set_y(154)
    section(pdf, "Combination Analysis Results")
    combo_rows = [
        [row["id"], "OK" if row["ok"] else "Check", fmt_len(row["maxDisplacement"]), fmt_ratio(row["maxUtilization"]), fmt_ratio(row["equilibriumResidual"])]
        for row in detailed["combinationResults"][:18]
    ]
    table(pdf, ["Combo", "Status", "Max disp.", "Max util.", "Residual"], combo_rows, [50, 25, 37, 34, 34])

    pdf.add_page()
    section(pdf, "Governing Members")
    member_rows = [
        [idx + 1, row["memberId"], row["status"], fmt_ratio(row["utilization"]), row.get("governingCheck") or "-", row.get("comboId") or "-"]
        for idx, row in enumerate(detailed["governingMembers"][:20])
    ]
    table(pdf, ["Rank", "Member", "Status", "Util.", "Check", "Combo"], member_rows, [18, 30, 25, 27, 46, 34])
    section(pdf, "Steel, Connection, Foundation Summary")
    steel = detailed["steelDetailing"]["summary"]
    cf = detailed["connectionFoundation"]["summary"]
    table(pdf, ["Scope", "Rows", "Warnings/NG", "Max ratio"], [
        ["Steel review", steel["memberCount"], steel["warnCount"] + steel["ngCount"], fmt_ratio(steel["maxUtilization"])],
        ["Connections", cf["connectionCount"], cf["warningCount"], fmt_ratio(cf["maxConnectionUtilization"])],
        ["Foundations", cf["foundationCount"], cf["warningCount"], fmt_ratio(max_num(cf["maxBearingRatio"], cf["maxSlidingRatio"]))],
    ], [58, 32, 42, 48])
    section(pdf, "Quality Audit")
    table(pdf, ["Audit item", "Status"], [[row["name"], row["status"]] for row in package["qualityAudit"]["items"]], [110, 70])
    section(pdf, "Remaining Scope")
    bullets(pdf, detailed["scope"]["missingScopes"][:8])
    pdf.output(str(pdf_path))


def build_index_pdf(index: dict, generated: list[dict], pdf_path: Path) -> None:
    pdf = PackagePdf("M42 PDF Review Index")
    pdf.add_page()
    banner(pdf, "M42 Representative Structural Analysis PDF Set", "10 analyzed models / calculation package review PDFs")
    section(pdf, "PDF Files")
    rows = []
    for item in index["buildings"]:
        match = next((file for file in generated if file["id"] == item["id"]), {})
        rows.append([
            item["id"],
            item["name"],
            item["loads"],
            item["combinations"],
            fmt_len(item["maxDisplacement"]),
            fmt_ratio(item["maxUtilization"]),
            item.get("designStatus", "-"),
            match.get("pages", "-"),
        ])
    table(pdf, ["ID", "Name", "Loads", "Combos", "Max disp.", "Max util.", "Design", "Pages"], rows, [38, 42, 16, 18, 25, 22, 19, 14])
    section(pdf, "Review Notes")
    bullets(pdf, [
        "Each PDF was generated from a fresh elastic analysis run.",
        "The current package is a preliminary engineering trace, not a sealed final design document.",
        "Drawing/image/MGT import and agentic vision modeling audit trails are planned future inputs.",
    ])
    pdf.output(str(pdf_path))


def cover(pdf: PackagePdf, item: dict, summary: dict, package: dict) -> None:
    banner(pdf, "Representative Structural Calculation Package", item["name"])
    pdf.set_y(47)
    table(pdf, ["Item", "Value"], [
        ["Project", package["project"]["name"]],
        ["Purpose", package["project"]["purpose"]],
        ["Generated", package["generatedAt"]],
        ["Package version", package["version"]],
        ["Source model", summary["id"]],
    ], [48, 132])


def banner(pdf: PackagePdf, title: str, subtitle: str) -> None:
    pdf.set_fill_color(15, 73, 111)
    pdf.rect(0, 0, 210, 38, style="F")
    pdf.set_xy(14, 10)
    pdf.set_font(pdf.font_family, "B", 16)
    pdf.set_text_color(255, 255, 255)
    pdf.multi_cell(182, 7, safe(title))
    pdf.set_x(14)
    pdf.set_font(pdf.font_family, "", 9)
    pdf.cell(0, 6, safe(subtitle), ln=1)
    pdf.set_text_color(28, 39, 51)
    pdf.set_y(45)


def metrics(pdf: PackagePdf, items: list[tuple[str, object]]) -> None:
    pdf.set_font(pdf.font_family, "", 8)
    w = 30
    y = pdf.get_y()
    for idx, (label, value) in enumerate(items):
        x = 14 + idx * w
        pdf.set_xy(x, y)
        pdf.set_fill_color(246, 249, 252)
        pdf.set_draw_color(213, 225, 235)
        pdf.rect(x, y, w - 2, 17, style="DF")
        pdf.set_xy(x + 2, y + 2)
        pdf.set_text_color(93, 110, 126)
        pdf.cell(w - 6, 4, safe(label))
        pdf.set_xy(x + 2, y + 8)
        pdf.set_font(pdf.font_family, "B", 8)
        pdf.set_text_color(28, 39, 51)
        pdf.cell(w - 6, 5, safe(value))
        pdf.set_font(pdf.font_family, "", 8)
    pdf.set_xy(14, y + 22)


def section(pdf: PackagePdf, title: str) -> None:
    pdf.set_x(14)
    pdf.ln(2)
    pdf.set_font(pdf.font_family, "B", 11)
    pdf.set_text_color(0, 63, 115)
    pdf.cell(0, 7, safe(title), ln=1)
    pdf.set_draw_color(215, 227, 238)
    y = pdf.get_y()
    pdf.line(14, y, 196, y)
    pdf.ln(3)
    pdf.set_x(14)
    pdf.set_text_color(28, 39, 51)


def table(pdf: PackagePdf, headers: list[str], rows: list[list[object]], widths: list[float]) -> None:
    if not rows:
        pdf.set_font(pdf.font_family, "", 8)
        pdf.multi_cell(0, 5, "No data available.")
        return
    ensure_space(pdf, 12)
    pdf.set_font(pdf.font_family, "B", 7.5)
    pdf.set_fill_color(244, 248, 251)
    pdf.set_draw_color(226, 234, 241)
    for header, width in zip(headers, widths):
        pdf.cell(width, 6, safe(header), border=1, fill=True)
    pdf.ln()
    pdf.set_font(pdf.font_family, "", 7.2)
    for row in rows:
        heights = [cell_height(pdf, safe(value), width) for value, width in zip(row, widths)]
        row_h = max(5.4, max(heights))
        ensure_space(pdf, row_h + 1)
        x = pdf.get_x()
        y = pdf.get_y()
        for value, width in zip(row, widths):
            pdf.rect(x, y, width, row_h)
            pdf.set_xy(x + 1, y + 1)
            pdf.multi_cell(width - 2, 4, safe(value))
            x += width
            pdf.set_xy(x, y)
        pdf.set_xy(14, y + row_h)
    pdf.ln(2)
    pdf.set_x(14)


def bullets(pdf: PackagePdf, items: list[str]) -> None:
    pdf.set_font(pdf.font_family, "", 8)
    for item in items:
        ensure_space(pdf, 8)
        pdf.set_x(14)
        pdf.multi_cell(0, 5, safe(f"- {item}"))


def ensure_space(pdf: PackagePdf, needed: float) -> None:
    if pdf.get_y() + needed > 284:
        pdf.add_page()


def cell_height(pdf: PackagePdf, text: str, width: float) -> float:
    chars_per_line = max(8, int(width / 1.8))
    lines = max(1, math.ceil(len(text) / chars_per_line))
    return lines * 4.2 + 2


def count_pages(path: Path) -> int:
    return len(PdfReader(str(path)).pages)


def fmt_num(value) -> str:
    number = as_number(value)
    if number is None:
        return "-"
    if abs(number) >= 1000:
        return f"{number:.0f}"
    if abs(number) >= 10:
        return f"{number:.2f}"
    return f"{number:.3f}"


def fmt_force(value) -> str:
    number = fmt_num(value)
    return "-" if number == "-" else f"{number} kN"


def fmt_len(value) -> str:
    number = as_number(value)
    if number is None:
        return "-"
    return f"{fmt_num(number * 1000)} mm"


def fmt_ratio(value) -> str:
    return fmt_num(value)


def max_num(*values) -> float | None:
    numbers = [as_number(value) for value in values]
    numbers = [value for value in numbers if value is not None]
    return max(numbers) if numbers else None


def as_number(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


def safe(value) -> str:
    return str(value if value is not None else "-").replace("\u2013", "-").replace("\u2014", "-")


if __name__ == "__main__":
    main()
