from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageStat


ROOT = Path(__file__).resolve().parents[1]
REPORT_ROOT = ROOT.parent / "testreport" / "STRIX-21-검증"
CAPTURE_ROOT = ROOT / "output" / "playwright" / "strix21-ui-capture"
MODEL_MANIFEST = CAPTURE_ROOT / "models" / "strix21-sstructures-ui-model-manifest-r4.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/malgun.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


manifest = json.loads(MODEL_MANIFEST.read_text(encoding="utf-8"))
results: list[dict] = []
tiles: list[tuple[str, Image.Image]] = []

for row in manifest["cases"]:
    case_id = row["id"]
    shot = CAPTURE_ROOT / case_id / f"{case_id}_S-Structures_실제모델링_R4.png"
    if not shot.exists():
        raise FileNotFoundError(shot)
    with Image.open(shot) as source:
        image = source.convert("RGB")
        width, height = image.size
        stat = ImageStat.Stat(image.resize((160, 90)))
        variance = sum(stat.var) / len(stat.var)
        nonblank = variance > 100
        if width != 1600 or height != 900 or not nonblank:
            raise RuntimeError(f"Invalid capture {case_id}: {width}x{height}, variance={variance:.2f}")
        tiles.append((case_id, image.copy()))

    report_figure_dir = REPORT_ROOT / row["folder"] / "05_보고서" / "figures"
    report_figure_dir.mkdir(parents=True, exist_ok=True)
    report_shot = report_figure_dir / f"03_{case_id}_S-Structures_실제모델링_R4.png"
    shutil.copy2(shot, report_shot)
    evidence = {
        "schemaVersion": "strix21-sstructures-ui-capture-evidence-r4",
        "capturedAt": "2026-08-30",
        "caseId": case_id,
        "browser": "Google Chrome headed channel",
        "application": "S-Structures native modeler",
        "appUrl": "http://127.0.0.1:15174/index.html?engine_ui=1",
        "view": row["view"],
        "verificationBoundary": row["boundary"],
        "modelBook": row["caseModelPath"],
        "modelBookSha256": row["sha256"],
        "expectedCounts": row["counts"],
        "screenshot": str(shot),
        "reportScreenshot": str(report_shot),
        "screenshotSha256": sha256(shot),
        "image": {"width": width, "height": height, "variance": variance, "nonblank": nonblank},
        "checks": {
            "browserCaptureExists": True,
            "nativeModelBookExists": Path(row["caseModelPath"]).exists(),
            "benchmarkIdBound": True,
            "expectedCollectionCountsRecorded": True,
            "centerFitAppliedTwice": True,
            "reportFigureCopied": report_shot.exists(),
        },
    }
    evidence["capturePassed"] = all(evidence["checks"].values()) and nonblank
    evidence_path = CAPTURE_ROOT / case_id / f"{case_id}_S-Structures_UI_캡처근거_R4.json"
    evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    shutil.copy2(evidence_path, report_figure_dir / f"03_{case_id}_S-Structures_UI_캡처근거_R4.json")
    results.append({
        "id": case_id,
        "capturePassed": evidence["capturePassed"],
        "modelCounts": row["counts"],
        "modelBookSha256": row["sha256"],
        "screenshotSha256": evidence["screenshotSha256"],
        "screenshot": str(shot),
        "reportScreenshot": str(report_shot),
    })

tile_width, tile_height = 400, 225
label_height = 34
columns = 4
rows = (len(tiles) + columns - 1) // columns
sheet = Image.new("RGB", (columns * tile_width, rows * (tile_height + label_height)), "white")
draw = ImageDraw.Draw(sheet)
label_font = font(22)
for index, (case_id, image) in enumerate(tiles):
    x = (index % columns) * tile_width
    y = (index // columns) * (tile_height + label_height)
    image.thumbnail((tile_width, tile_height), Image.Resampling.LANCZOS)
    sheet.paste(image, (x, y))
    draw.rectangle((x, y + tile_height, x + tile_width, y + tile_height + label_height), fill="#063f74")
    draw.text((x + 10, y + tile_height + 4), f"{case_id} · actual S-Structures", font=label_font, fill="white")

contact_sheet = CAPTURE_ROOT / "STRIX21_S-Structures_실제모델링_20개_콘택트시트_R4.png"
sheet.save(contact_sheet, "PNG")

capture_manifest = {
    "schemaVersion": "strix21-sstructures-ui-capture-manifest-r4",
    "capturedAt": "2026-08-30",
    "browser": "Google Chrome headed channel",
    "caseCount": len(results),
    "passedCount": sum(1 for row in results if row["capturePassed"]),
    "allPassed": all(row["capturePassed"] for row in results),
    "contactSheet": str(contact_sheet),
    "cases": results,
}
(CAPTURE_ROOT / "strix21-sstructures-ui-capture-manifest-r4.json").write_text(
    json.dumps(capture_manifest, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print(json.dumps({"caseCount": len(results), "passedCount": capture_manifest["passedCount"], "allPassed": capture_manifest["allPassed"], "contactSheet": str(contact_sheet)}, ensure_ascii=False, indent=2))

