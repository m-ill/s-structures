import argparse
import json
import re

from pypdf import PdfReader


def dereference(value):
    return value.get_object() if hasattr(value, "get_object") else value


def embedded_fonts(page):
    resources = dereference(page.get("/Resources") or {})
    fonts = dereference(resources.get("/Font") or {})
    rows = []
    for name, reference in fonts.items():
        font = dereference(reference)
        descendants = dereference(font.get("/DescendantFonts") or [])
        candidates = [dereference(row) for row in descendants] if descendants else [font]
        descriptors = [dereference(row.get("/FontDescriptor") or {}) for row in candidates]
        embedded = bool(descriptors) and all(
            any(descriptor.get(key) is not None for key in ("/FontFile", "/FontFile2", "/FontFile3"))
            for descriptor in descriptors
        )
        base_fonts = [str(row.get("/BaseFont") or font.get("/BaseFont") or "") for row in candidates]
        rows.append({"name": str(name), "baseFont": ",".join(base_fonts), "embedded": embedded})
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--locale", required=True)
    parser.add_argument("--expected-pages", type=int, required=True)
    args = parser.parse_args()

    reader = PdfReader(args.pdf)
    texts = [(page.extract_text() or "") for page in reader.pages]
    sizes = []
    fonts = []
    footer_errors = []
    for index, page in enumerate(reader.pages, start=1):
        width_mm = float(page.mediabox.width) * 25.4 / 72
        height_mm = float(page.mediabox.height) * 25.4 / 72
        sizes.append({"widthMm": width_mm, "heightMm": height_mm})
        fonts.extend(embedded_fonts(page))
        label = f"페이지 {index} 중 {len(reader.pages)}" if args.locale == "ko-KR" else f"Page {index} of {len(reader.pages)}"
        if label not in texts[index - 1]:
            footer_errors.append(index)

    text = "\n".join(texts)
    forbidden = [
        r"file:/{2,3}",
        r"[A-Za-z]:\\Users\\",
        r"/Users/[^/\s]+",
        r"\bBearer\s+[A-Za-z0-9._~-]+",
        r"\bsk-[A-Za-z0-9_-]{8,}",
        r"\bCODEX_HOME\b",
    ]
    privacy_findings = sum(1 for pattern in forbidden if re.search(pattern, text, re.IGNORECASE))
    a4 = all(abs(row["widthMm"] - 210) < 1 and abs(row["heightMm"] - 297) < 1 for row in sizes)
    font_rows = {(row["name"], row["baseFont"], row["embedded"]) for row in fonts}
    result = {
        "pageCount": len(reader.pages),
        "a4": a4,
        "searchableText": len(text.strip()) > 500,
        "textCharacters": len(text),
        "fontsEmbedded": bool(font_rows) and all(row[2] for row in font_rows),
        "fonts": [
            {"name": name, "baseFont": base_font, "embedded": embedded}
            for name, base_font, embedded in sorted(font_rows)
        ],
        "footer": not footer_errors,
        "footerErrors": footer_errors,
        "privacyFindings": privacy_findings,
        "text": text,
        "metadata": {
            "title": str(reader.metadata.title or ""),
            "author": str(reader.metadata.author or ""),
            "creator": str(reader.metadata.creator or ""),
            "producer": str(reader.metadata.producer or ""),
        },
        "expectedPageCount": args.expected_pages,
    }
    result["ok"] = (
        result["pageCount"] == args.expected_pages
        and result["a4"]
        and result["searchableText"]
        and result["fontsEmbedded"]
        and result["footer"]
        and result["privacyFindings"] == 0
    )
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
