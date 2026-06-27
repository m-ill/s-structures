# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import warnings
from pathlib import Path

import fitz
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from fpdf import FPDF


REPORT_ROOT = Path("reports/representative-buildings")
PDF_ROOT = Path("output/pdf/representative-buildings")
TMP_ROOT = Path("tmp/pdfs/representative-building-plots")
FONT_REGULAR = Path("C:/Windows/Fonts/malgun.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/malgunbd.ttf")
VERSION_LABEL = "M33 representative building elastic analysis set"

warnings.filterwarnings("ignore", category=DeprecationWarning)


def main() -> None:
    PDF_ROOT.mkdir(parents=True, exist_ok=True)
    TMP_ROOT.mkdir(parents=True, exist_ok=True)
    index = read_json(REPORT_ROOT / "index.json")
    generated = []

    for item in index["buildings"]:
        building_dir = REPORT_ROOT / item["id"]
        summary = read_json(building_dir / "analysis-summary.json")
        model = read_json(building_dir / "model.json")
        plot_path = TMP_ROOT / f"{item['id']}-geometry.png"
        render_geometry_plot(model, summary, plot_path)
        pdf_path = PDF_ROOT / f"{item['id']}.pdf"
        build_building_pdf(summary, model, plot_path, pdf_path)
        generated.append(
            {
                "id": item["id"],
                "name": item["name"],
                "pdf": str(pdf_path),
                "sizeKB": round(pdf_path.stat().st_size / 1024, 1),
                "pages": count_pdf_pages(pdf_path),
            }
        )
        print(f"[{len(generated)}/10] {item['id']} -> {pdf_path}")

    index_pdf = PDF_ROOT / "00-representative-building-index.pdf"
    build_index_pdf(index, generated, index_pdf)
    generated.insert(
        0,
        {
            "id": "00-index",
            "name": "Representative building PDF index",
            "pdf": str(index_pdf),
            "sizeKB": round(index_pdf.stat().st_size / 1024, 1),
            "pages": count_pdf_pages(index_pdf),
        },
    )
    write_pdf_manifest(index, generated)
    print(json.dumps({"ok": True, "outputRoot": str(PDF_ROOT), "count": len(generated)}, ensure_ascii=False, indent=2))


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_pdf_manifest(index: dict, generated: list[dict]) -> None:
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
        "# Representative Building PDF Review Set\n\n"
        "S-Structures M33 representative building PDFs for manual review.\n\n"
        "| ID | Name | Pages | Size | File |\n"
        "| --- | --- | ---: | ---: | --- |\n"
        f"{rows}\n",
        encoding="utf-8",
    )


def render_geometry_plot(model: dict, summary: dict, output: Path) -> None:
    nodes = {node["id"]: node for node in model["nodes"]}
    members = model["members"]
    fig, axes = plt.subplots(1, 2, figsize=(10.8, 5.2), dpi=170)
    fig.patch.set_facecolor("white")

    draw_member_projection(axes[0], nodes, members, "xy")
    axes[0].set_title("Plan projection", fontsize=11, fontweight="bold")
    axes[0].set_xlabel("X (m)")
    axes[0].set_ylabel("Y (m)")

    draw_member_projection(axes[1], nodes, members, "xz")
    axes[1].set_title("Elevation projection", fontsize=11, fontweight="bold")
    axes[1].set_xlabel("X (m)")
    axes[1].set_ylabel("Z (m)")

    fig.suptitle(f"{summary['id']} - {summary['name']}", fontsize=12, fontweight="bold")
    fig.tight_layout(rect=(0, 0, 1, 0.94))
    fig.savefig(output, bbox_inches="tight")
    plt.close(fig)


def draw_member_projection(axis, nodes: dict, members: list[dict], projection: str) -> None:
    for member in members:
        n1 = nodes[member["n1"]]
        n2 = nodes[member["n2"]]
        role = member.get("design", {}).get("role")
        color = "#2f6f9f" if role == "beam" else "#6f7580"
        width = 0.85 if role == "beam" else 1.2
        if projection == "xy":
            xs = [n1["x"], n2["x"]]
            ys = [n1["y"], n2["y"]]
        else:
            xs = [n1["x"], n2["x"]]
            ys = [n1["z"], n2["z"]]
        axis.plot(xs, ys, color=color, linewidth=width, alpha=0.72)

    if projection == "xy":
        axis.scatter([n["x"] for n in nodes.values()], [n["y"] for n in nodes.values()], s=7, color="#1d2733", alpha=0.75)
    else:
        axis.scatter([n["x"] for n in nodes.values()], [n["z"] for n in nodes.values()], s=7, color="#1d2733", alpha=0.75)
    axis.grid(True, color="#dfe4ea", linewidth=0.6)
    axis.set_aspect("equal", adjustable="box")


class ReviewPdf(FPDF):
    def __init__(self, title: str):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.title_text = title
        self.set_auto_page_break(auto=True, margin=14)
        self.set_margins(14, 14, 14)
        self.alias_nb_pages()
        self.add_font("Malgun", "", str(FONT_REGULAR))
        self.add_font("Malgun", "B", str(FONT_BOLD))

    def footer(self):
        self.set_y(-11)
        self.set_font("Malgun", "", 8)
        self.set_text_color(110, 118, 128)
        self.cell(0, 6, f"S-Structures - {self.page_no()}/{{nb}}", align="C")


def build_building_pdf(summary: dict, model: dict, plot_path: Path, pdf_path: Path) -> None:
    pdf = ReviewPdf(summary["name"])
    pdf.add_page()
    draw_cover_header(pdf, summary)
    draw_status_cards(pdf, summary)
    draw_overview_table(pdf, summary)
    draw_combo_table(pdf, summary)
    draw_governing_block(pdf, summary)
    draw_notes(pdf)

    pdf.add_page()
    section_title(pdf, "모델 형상 검토")
    pdf.image(str(plot_path), x=14, y=34, w=182)
    pdf.set_y(165)
    draw_model_contract(pdf, summary, model)
    pdf.output(str(pdf_path))


def build_index_pdf(index: dict, generated: list[dict], pdf_path: Path) -> None:
    pdf = ReviewPdf("Representative building PDF index")
    pdf.add_page()
    pdf.set_fill_color(23, 58, 90)
    pdf.rect(0, 0, 210, 36, style="F")
    pdf.set_xy(14, 10)
    pdf.set_font("Malgun", "B", 18)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(0, 8, "대표 건축물 10종 PDF 검토 목록", ln=1)
    pdf.set_font("Malgun", "", 9)
    pdf.cell(0, 6, f"{VERSION_LABEL} / source: {index['generatedAt']}", ln=1)
    pdf.set_text_color(30, 38, 48)
    pdf.set_y(45)
    table_header(pdf, ["ID", "건물명", "Nodes", "Members", "Loads", "Max disp.", "Max util."], [43, 47, 18, 22, 18, 24, 22])
    for item in index["buildings"]:
        values = [
            item["id"],
            item["name"],
            str(item["nodes"]),
            str(item["members"]),
            str(item["loads"]),
            fmt(item["maxDisplacement"]),
            fmt(item["maxUtilization"]),
        ]
        table_row(pdf, values, [43, 47, 18, 22, 18, 24, 22])
    pdf.ln(7)
    section_title(pdf, "검토 방법")
    bullet(pdf, "각 건물 PDF는 요약, 조합별 결과, 지배 검토, 평면/입면 형상 그림을 포함한다.")
    bullet(pdf, "상세 원본 데이터는 reports/representative-buildings 아래의 model.json 및 analysis-summary.json에서 확인한다.")
    bullet(pdf, "원본 HTML 계산서는 각 건물 폴더의 report.html에 남겨두었다.")
    pdf.output(str(pdf_path))


def draw_cover_header(pdf: ReviewPdf, summary: dict) -> None:
    pdf.set_fill_color(23, 58, 90)
    pdf.rect(0, 0, 210, 43, style="F")
    pdf.set_xy(14, 10)
    pdf.set_font("Malgun", "B", 18)
    pdf.set_text_color(255, 255, 255)
    pdf.multi_cell(0, 8, "대표 건축물 탄성해석 검토서")
    pdf.set_x(14)
    pdf.set_font("Malgun", "", 10)
    pdf.cell(0, 6, f"{summary['id']} / {summary['name']}", ln=1)
    pdf.set_x(14)
    pdf.cell(0, 6, VERSION_LABEL, ln=1)
    pdf.set_y(52)


def draw_status_cards(pdf: ReviewPdf, summary: dict) -> None:
    cards = [
        ("해석 상태", "OK" if summary["analysis"]["ok"] else "NG"),
        ("예비 설계", summary["analysis"].get("designStatus") or "-"),
        ("최대 변위", fmt(summary["analysis"]["maxEnvelopeDisplacement"])),
        ("최대 검토비", fmt(summary["analysis"]["maxEnvelopeUtilization"])),
    ]
    x = 14
    for label, value in cards:
        pdf.set_xy(x, 52)
        pdf.set_fill_color(246, 248, 250)
        pdf.set_draw_color(208, 215, 222)
        pdf.rect(x, 52, 43, 22, style="DF")
        pdf.set_xy(x + 3, 56)
        pdf.set_font("Malgun", "", 8)
        pdf.set_text_color(90, 99, 110)
        pdf.cell(37, 4, label, ln=1)
        pdf.set_x(x + 3)
        pdf.set_font("Malgun", "B", 12)
        pdf.set_text_color(20, 28, 38)
        pdf.cell(37, 7, value)
        x += 46
    pdf.set_y(82)


def draw_overview_table(pdf: ReviewPdf, summary: dict) -> None:
    section_title(pdf, "모델 개요")
    size = summary["model"]["size"]
    rows = [
        ("대표 유형", summary["type"]),
        ("형상 설명", summary["description"]),
        ("층수", f"{summary['model']['stories']}"),
        ("규모", f"X {fmt(size['x'])} m / Y {fmt(size['y'])} m / Z {fmt(size['z'])} m"),
        ("노드/부재/하중", f"{summary['model']['nodeCount']} / {summary['model']['memberCount']} / {summary['model']['loadCount']}"),
        ("하중 케이스/조합", f"{summary['model']['loadCaseCount']} / {summary['model']['combinationCount']}"),
    ]
    key_value_table(pdf, rows)


def draw_combo_table(pdf: ReviewPdf, summary: dict) -> None:
    section_title(pdf, "조합별 해석 결과")
    table_header(pdf, ["조합", "상태", "최대 변위", "최대 검토비", "평형 오차"], [32, 24, 42, 42, 50])
    for combo_id, combo in summary["analysis"]["combos"].items():
        table_row(
            pdf,
            [combo_id, "OK" if combo["ok"] else "NG", fmt(combo["maxDisplacement"]), fmt(combo["maxUtilization"]), fmt(combo["equilibriumResidual"])],
            [32, 24, 42, 42, 50],
        )
    pdf.ln(4)


def draw_governing_block(pdf: ReviewPdf, summary: dict) -> None:
    governing = summary["analysis"].get("governing") or {}
    section_title(pdf, "지배 검토")
    rows = [
        ("부재", governing.get("memberId", "-")),
        ("검토 항목", governing.get("checkId", "-")),
        ("상태", governing.get("status", "-")),
        ("조합", governing.get("comboId", "-")),
        ("검토비", fmt(governing.get("ratio"))),
    ]
    key_value_table(pdf, rows)


def draw_notes(pdf: ReviewPdf) -> None:
    section_title(pdf, "검토 메모")
    bullet(pdf, "이 PDF는 대표 형상 자동 생성, 선형 탄성해석, 예비 검토 결과를 빠르게 확인하기 위한 검토용 산출물이다.")
    bullet(pdf, "상세 설계 확정 전에는 부재 단면, 하중 산정, 접합, 기초, 횡력저항시스템을 별도로 검토해야 한다.")
    bullet(pdf, "도면 이미지 또는 MGT 입력 자동화는 이 산출물의 model.json 형식을 기준으로 비교하면 된다.")


def draw_model_contract(pdf: ReviewPdf, summary: dict, model: dict) -> None:
    section_title(pdf, "데이터 확인 항목")
    load_cases = ", ".join(case["id"] for case in model.get("loadCases", []))
    combos = ", ".join(combo["id"] for combo in model.get("loadCombinations", []))
    rows = [
        ("모델 파일", f"reports/representative-buildings/{summary['id']}/model.json"),
        ("요약 파일", f"reports/representative-buildings/{summary['id']}/analysis-summary.json"),
        ("원본 HTML", f"reports/representative-buildings/{summary['id']}/report.html"),
        ("하중 케이스", load_cases),
        ("하중 조합", combos),
    ]
    key_value_table(pdf, rows)


def section_title(pdf: ReviewPdf, title: str) -> None:
    pdf.set_font("Malgun", "B", 12)
    pdf.set_text_color(23, 58, 90)
    pdf.cell(0, 7, title, ln=1)
    pdf.set_draw_color(214, 222, 230)
    pdf.line(14, pdf.get_y(), 196, pdf.get_y())
    pdf.ln(3)


def key_value_table(pdf: ReviewPdf, rows: list[tuple[str, str]]) -> None:
    for key, value in rows:
        y = pdf.get_y()
        pdf.set_fill_color(246, 248, 250)
        pdf.set_draw_color(214, 222, 230)
        pdf.set_font("Malgun", "B", 8)
        pdf.set_text_color(58, 66, 75)
        pdf.multi_cell(36, 7, key, border=1, fill=True)
        row_height = max(7, pdf.get_y() - y)
        pdf.set_xy(50, y)
        pdf.set_font("Malgun", "", 8)
        pdf.set_text_color(30, 38, 48)
        pdf.multi_cell(146, 7, str(value), border=1)
        row_height = max(row_height, pdf.get_y() - y)
        pdf.set_y(y + row_height)
    pdf.ln(4)


def table_header(pdf: ReviewPdf, labels: list[str], widths: list[float]) -> None:
    pdf.set_fill_color(23, 58, 90)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Malgun", "B", 7)
    for label, width in zip(labels, widths):
        pdf.cell(width, 7, label, border=1, align="C", fill=True)
    pdf.ln()


def table_row(pdf: ReviewPdf, values: list[str], widths: list[float]) -> None:
    pdf.set_fill_color(255, 255, 255)
    pdf.set_text_color(30, 38, 48)
    pdf.set_draw_color(214, 222, 230)
    pdf.set_font("Malgun", "", 7)
    for value, width in zip(values, widths):
        pdf.cell(width, 7, str(value), border=1, align="C")
    pdf.ln()


def bullet(pdf: ReviewPdf, text: str) -> None:
    pdf.set_font("Malgun", "", 8)
    pdf.set_text_color(30, 38, 48)
    pdf.set_x(14)
    pdf.cell(5, 5, "-", ln=0)
    pdf.multi_cell(0, 5, text)


def fmt(value) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "-"
    if not number == number:
        return "-"
    if number != 0 and (abs(number) < 0.001 or abs(number) > 100000):
        return f"{number:.3e}"
    text = f"{number:.6f}".rstrip("0").rstrip(".")
    return text or "0"


def count_pdf_pages(path: Path) -> int:
    doc = fitz.open(path)
    try:
        return doc.page_count
    finally:
        doc.close()


if __name__ == "__main__":
    main()
