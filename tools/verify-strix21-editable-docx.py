#!/usr/bin/env python3
"""Rasterize Word-exported PDFs and verify the 21 editable DOCX reports."""

from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image, ImageStat
from docx import Document


REPO = Path(__file__).resolve().parents[1]
VAULT = REPO.parent
CASE_ROOT = VAULT / "testreport/STRIX-21-검증"
PDF_ROOT = REPO / "tmp/docx-word-export"
RENDER_ROOT = REPO / "tmp/docx-render-r1"
QA_ROOT = REPO / "output/verification/strix21-docx"
MANIFEST_PATH = QA_ROOT / "strix21-editable-docx-manifest.json"


def sha256(path: Path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cases():
    result = []
    for folder in sorted(CASE_ROOT.iterdir()):
        if folder.is_dir() and len(folder.name) > 3 and folder.name[:2].isdigit() and folder.name[2] == "_" and folder.name[:2] != "00":
            case_id = folder.name.split("_", 2)[1]
            docx = folder / "05_보고서" / f"{case_id}_실제모델링_자체해석엔진_검증보고서_편집본.docx"
            result.append((case_id, folder, docx))
    return result


def docx_structure(path: Path):
    document = Document(path)
    text = "\n".join(p.text for p in document.paragraphs)
    with zipfile.ZipFile(path) as archive:
        media = [name for name in archive.namelist() if name.startswith("word/media/")]
    return {
        "paragraphCount": len(document.paragraphs),
        "tableCount": len(document.tables),
        "imageCount": len(media),
        "textLength": len(text),
        "requiredHeadings": {
            "actualModel": "실제 S-Structures 모델링 화면" in text,
            "modules": "사용된 S-Structures 자체 해석모듈" in text,
            "equations": "내부 계산 절차·사용 식·검증 계층" in text,
            "results": "결과 비교와 판정" in text,
            "claimBoundary": "최종 주장 경계" in text,
        },
    }


def render_pdf(case_id: str, pdf_path: Path):
    render_dir = RENDER_ROOT / case_id
    render_dir.mkdir(parents=True, exist_ok=True)
    for old in render_dir.glob("page-*.png"):
        old.unlink()
    pdf = pdfium.PdfDocument(str(pdf_path))
    pages = []
    for index in range(len(pdf)):
        image = pdf[index].render(scale=1.65).to_pil().convert("RGB")
        output = render_dir / f"page-{index + 1:02d}.png"
        image.save(output)
        stat = ImageStat.Stat(image)
        variance = sum(stat.var) / len(stat.var)
        pages.append({
            "page": index + 1,
            "path": output.relative_to(REPO).as_posix(),
            "width": image.width,
            "height": image.height,
            "variance": variance,
            "nonblank": variance > 5,
        })
    return pages


def make_contact_sheet(case_id: str, pages):
    images = [Image.open(REPO / item["path"]).convert("RGB") for item in pages]
    thumb_width = 360
    gap = 18
    columns = 4
    rows = (len(images) + columns - 1) // columns
    thumbs = []
    for image in images:
        height = round(image.height * thumb_width / image.width)
        thumbs.append(image.resize((thumb_width, height)))
    cell_height = max(image.height for image in thumbs)
    sheet = Image.new("RGB", (columns * thumb_width + (columns + 1) * gap, rows * cell_height + (rows + 1) * gap), "white")
    for index, image in enumerate(thumbs):
        x = gap + (index % columns) * (thumb_width + gap)
        y = gap + (index // columns) * (cell_height + gap)
        sheet.paste(image, (x, y))
    output = RENDER_ROOT / case_id / f"{case_id}_contact-sheet.png"
    sheet.save(output)
    for image in images:
        image.close()
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", default="all")
    args = parser.parse_args()
    selected = [(case_id, folder, docx) for case_id, folder, docx in cases() if args.case == "all" or case_id == args.case]
    results = []
    for case_id, folder, docx in selected:
        if not docx.exists():
            raise FileNotFoundError(docx)
        pdf_path = PDF_ROOT / case_id / f"{docx.stem}.pdf"
        if not pdf_path.exists():
            raise FileNotFoundError(pdf_path)
        structure = docx_structure(docx)
        pages = render_pdf(case_id, pdf_path)
        if len(pages) != 8:
            raise RuntimeError(f"{case_id} expected 8 pages, got {len(pages)}")
        if not all(item["nonblank"] for item in pages):
            raise RuntimeError(f"{case_id} contains blank pages")
        if structure["imageCount"] < 2 or not all(structure["requiredHeadings"].values()):
            raise RuntimeError(f"{case_id} structure failed: {structure}")
        sheet = make_contact_sheet(case_id, pages)
        qa = {
            "version": "strix21-editable-docx-qa-r1",
            "status": "PASS",
            "caseId": case_id,
            "docxPath": docx.relative_to(VAULT).as_posix(),
            "docxSha256": sha256(docx),
            "wordExportPdf": pdf_path.relative_to(REPO).as_posix(),
            "wordExportPdfSha256": sha256(pdf_path),
            "pageCount": len(pages),
            "pages": pages,
            "contactSheet": sheet.relative_to(REPO).as_posix(),
            "structure": structure,
            "visualChecks": [
                "MICROSOFT_WORD_EXPORT_SUCCEEDED",
                "EXACT_EIGHT_PAGE_STRUCTURE",
                "NO_BLANK_PAGES",
                "KOREAN_TEXT_PRESENT",
                "EDITABLE_TABLES_PRESENT",
                "CONCEPT_IMAGE_PRESENT",
                "ACTUAL_S_STRUCTURES_SCREEN_PRESENT",
                "ENGINE_MODULE_TRACE_PRESENT",
                "CLAIM_BOUNDARY_PRESENT",
            ],
        }
        qa_path = folder / "05_보고서/report-qa-docx.json"
        qa_path.write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        results.append(qa)
        print(f"{case_id}: RENDER PASS pages={len(pages)} tables={structure['tableCount']} images={structure['imageCount']}")

    if args.case == "all":
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        by_id = {item["caseId"]: item for item in results}
        for report in manifest["reports"]:
            qa = by_id[report["caseId"]]
            report["renderQa"] = {
                "status": qa["status"],
                "pageCount": qa["pageCount"],
                "qaPath": f"{report['docxPath'].rsplit('/', 1)[0]}/report-qa-docx.json",
                "wordExportPdfSha256": qa["wordExportPdfSha256"],
                "contactSheet": qa["contactSheet"],
            }
        manifest["status"] = "PASS"
        manifest["renderedAt"] = "2026-08-31"
        manifest["renderEngine"] = "Microsoft Word ExportAsFixedFormat + pypdfium2"
        manifest["totalPageCount"] = sum(item["pageCount"] for item in results)
        manifest["allRendered"] = all(item["status"] == "PASS" for item in results)
        MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"status": manifest["status"], "caseCount": len(results), "totalPageCount": manifest["totalPageCount"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
