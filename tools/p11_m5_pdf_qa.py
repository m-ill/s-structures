import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageStat
from pypdf import PdfReader


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--pages", required=True)
    parser.add_argument("--contact-sheet", required=True)
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    pages_dir = Path(args.pages)
    page_paths = sorted(pages_dir.glob("page-*.png"), key=lambda item: int(item.stem.split("-")[-1]))
    reader = PdfReader(str(pdf_path))
    records = []
    thumbnails = []
    for index, page_path in enumerate(page_paths, start=1):
        with Image.open(page_path) as source:
            image = source.convert("RGB")
            gray = image.convert("L")
            stats = ImageStat.Stat(gray)
            width, height = image.size
            pixels = gray.load()
            edge_points = []
            for x in range(width):
                edge_points.extend((pixels[x, 0], pixels[x, height - 1]))
            for y in range(height):
                edge_points.extend((pixels[0, y], pixels[width - 1, y]))
            edge_ink_ratio = sum(value < 245 for value in edge_points) / max(1, len(edge_points))
            histogram = gray.histogram()
            nonwhite = sum(histogram[:245])
            black = sum(histogram[:20])
            pixel_count = width * height
            text = reader.pages[index - 1].extract_text() or ""
            records.append({
                "page": index,
                "width": width,
                "height": height,
                "standardDeviation": round(stats.stddev[0], 6),
                "nonwhiteRatio": nonwhite / pixel_count,
                "blackPixelRatio": black / pixel_count,
                "edgeInkRatio": edge_ink_ratio,
                "blank": stats.stddev[0] < 1 or nonwhite / pixel_count < 0.001,
                "replacementCharacters": text.count("\ufffd"),
                "textCharacters": len(text),
            })
            thumb = image.copy()
            thumb.thumbnail((300, 424))
            thumbnails.append((index, thumb))

    columns = 4
    cell_width, cell_height = 320, 464
    rows = max(1, math.ceil(len(thumbnails) / columns))
    sheet = Image.new("RGB", (columns * cell_width, rows * cell_height), "white")
    draw = ImageDraw.Draw(sheet)
    for position, (number, thumb) in enumerate(thumbnails):
        x = (position % columns) * cell_width + (cell_width - thumb.width) // 2
        y = (position // columns) * cell_height + 28
        sheet.paste(thumb, (x, y))
        draw.text((position % columns * cell_width + 12, position // columns * cell_height + 8), f"Page {number}", fill="#172b3d")
    contact_path = Path(args.contact_sheet)
    contact_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(contact_path)

    result = {
        "ok": len(page_paths) == len(reader.pages) and bool(page_paths),
        "pdfPages": len(reader.pages),
        "rasterPages": len(page_paths),
        "blankPages": sum(record["blank"] for record in records),
        "edgeInkPages": sum(record["edgeInkRatio"] > 0.001 for record in records),
        "replacementCharacters": sum(record["replacementCharacters"] for record in records),
        "textCharacters": sum(record["textCharacters"] for record in records),
        "pages": records,
        "contactSheet": str(contact_path),
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
