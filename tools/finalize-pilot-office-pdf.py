from __future__ import annotations

import argparse
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas


def main() -> None:
    parser = argparse.ArgumentParser(description="Add stable footer and metadata to the pilot office PDF.")
    parser.add_argument("input_pdf", type=Path)
    parser.add_argument("output_pdf", type=Path)
    args = parser.parse_args()

    reader = PdfReader(str(args.input_pdf))
    writer = PdfWriter()
    page_count = len(reader.pages)

    for page_number, page in enumerate(reader.pages, start=1):
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        overlay_stream = BytesIO()
        footer = canvas.Canvas(overlay_stream, pagesize=(width, height))
        footer.setStrokeColor(HexColor("#D7E3EE"))
        footer.setLineWidth(0.5)
        footer.line(40, 25, width - 40, 25)
        footer.setFillColor(HexColor("#627586"))
        footer.setFont("Helvetica", 7.5)
        footer.drawCentredString(
            width / 2,
            13,
            f"S-Structures / PILOT-OFFICE-01 / {page_number}/{page_count}",
        )
        footer.save()
        overlay_stream.seek(0)
        overlay_page = PdfReader(overlay_stream).pages[0]
        page.merge_page(overlay_page)
        writer.add_page(page)

    writer.add_metadata({
        "/Title": "PILOT-OFFICE-01 Office Building Elastic Analysis Report",
        "/Author": "S-Structures",
        "/Subject": "Program smoke verification - draft, not for construction",
        "/Creator": "S-Structures calculation package and PDF finalizer",
    })
    args.output_pdf.parent.mkdir(parents=True, exist_ok=True)
    with args.output_pdf.open("wb") as output_file:
        writer.write(output_file)

    print({
        "ok": True,
        "input": str(args.input_pdf),
        "output": str(args.output_pdf),
        "pages": page_count,
        "bytes": args.output_pdf.stat().st_size,
    })


if __name__ == "__main__":
    main()
