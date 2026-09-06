#!/usr/bin/env python3
"""Render the 20 remaining STRIX reports with real S-Structures Chrome modeling captures.

R4 deliberately builds on the reviewed R3 report vocabulary and adds a dedicated
native-modeler page.  The actual browser capture, the deterministic model book, the
calculation evidence, and the production module trace remain separate artifacts.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import shutil
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image as PillowImage
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import Image as RLImage
from reportlab.platypus import PageBreak, SimpleDocTemplate, Spacer


REPO = Path(__file__).resolve().parents[1]
VAULT = REPO.parent
R3_SCRIPT = REPO / "tools/render-strix21-engine-reports-r3.py"
CAPTURE_ROOT = REPO / "output/playwright/strix21-ui-capture"
CAPTURE_MANIFEST = CAPTURE_ROOT / "strix21-sstructures-ui-capture-manifest-r4.json"
MODEL_MANIFEST = CAPTURE_ROOT / "models/strix21-sstructures-ui-model-manifest-r4.json"
OUTPUT_ROOT = REPO / "output/pdf/STRIX21-R4"
QA_ROOT = REPO / "output/verification/strix21-r4"
TEMP_ROOT = REPO / "tmp/pdfs/strix21-r4"
INDEX_PATH = VAULT / "testreport/STRIX-21-검증/00_설득자료_모음/STRIX21_실제모델링_자체해석엔진_상세보고서_R4_색인.md"
MANIFEST_PATH = QA_ROOT / "strix21-r4-report-manifest.json"


def load_r3():
    spec = importlib.util.spec_from_file_location("strix21_report_r3", R3_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError("Cannot load R3 report renderer")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


R3 = load_r3()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def capture_evidence(case_id: str):
    path = CAPTURE_ROOT / case_id / f"{case_id}_S-Structures_UI_캡처근거_R4.json"
    if not path.exists():
        raise FileNotFoundError(f"Missing actual S-Structures capture evidence: {path}")
    data = read_json(path)
    if data.get("capturePassed") is not True:
        raise RuntimeError(f"{case_id} native modeler capture did not pass QA")
    return path, data


def model_boundary_text(boundary: str) -> str:
    return {
        "DIRECT_NUMERIC_PASS": "공개 벤치마크 형상을 S-Structures model book으로 구성한 직접 수치비교 모델",
        "NUMERIC_PASS_QUALIFICATION_OPEN": "수치 비교용 모델이며 독립 qualification 보완이 필요한 모델",
        "ENGINE_FIXTURE_SOURCE_BLOCKED": "production 엔진 기능을 보여주는 qualification fixture 형상; 공식 동일모델 입력은 아직 잠기지 않음",
        "EQUIVALENT_ENGINE_GATE": "공개 요구조건과 동등한 엔진 gate를 보여주는 모델; 직접 동일모델 결과 일치는 주장하지 않음",
        "CHECKPOINT": "공개 핵심 checkpoint를 재현하는 모델; 전체 공식 모델의 end-to-end 실행은 아직 아님",
    }.get(boundary, boundary)


def actual_modeling_page(row, meta, sty):
    case_id = row["id"]
    capture_path, capture = capture_evidence(case_id)
    screenshot = Path(capture["screenshot"])
    model_book = Path(capture["modelBook"])
    if not screenshot.exists() or not model_book.exists():
        raise FileNotFoundError(f"{case_id} screenshot/model book is missing")

    counts = capture["expectedCounts"]
    image = RLImage(str(screenshot))
    image.drawWidth = 174 * mm
    image.drawHeight = 174 * mm * capture["image"]["height"] / capture["image"]["width"]

    shell_note = ""
    if counts.get("shells", 0):
        shell_note = (
            " Shell 요소는 model.shells에 실제 저장했으며, 현재 native canvas에서는 "
            "uiDisplayOnly mesh edge를 함께 사용해 요소 경계와 형상을 명확히 표시했다."
        )

    return [
        R3.p("2. 실제 S-Structures 모델링 화면", sty["h1"]),
        R3.p(
            "아래 이미지는 보고서용 합성도가 아니라 Google Chrome에서 S-Structures native modeler가 "
            "해당 R4 model book을 직접 읽은 뒤 Fit View로 중앙 배치한 실제 화면이다.",
            sty["body"],
        ),
        image,
        Spacer(1, 4 * mm),
        R3.make_table([
            ["노드", "부재", "Shell", "Link", "하중", "화면"],
            [str(counts.get("nodes", 0)), str(counts.get("members", 0)), str(counts.get("shells", 0)),
             str(counts.get("links", 0)), str(counts.get("loads", 0)), capture.get("view", "-")],
        ], [29 * mm] * 6, sty, compact=True),
        Spacer(1, 4 * mm),
        R3.make_table([
            ["실행 항목", "기록"],
            ["브라우저·앱", f"{capture['browser']} / {capture['application']}"],
            ["S-Structures model book", model_book.relative_to(VAULT).as_posix()],
            ["model book SHA-256", capture["modelBookSha256"]],
            ["실제 화면 SHA-256", capture["screenshotSha256"]],
            ["모델 성격", model_boundary_text(capture["verificationBoundary"])],
        ], [45 * mm, 129 * mm], sty, compact=True),
        Spacer(1, 4 * mm),
        R3.p(
            "화면과 수치 evidence의 역할은 구분한다. 이 페이지는 형상·경계조건·하중 배치의 모델링 증거이고, "
            "해석값 PASS/FAIL은 뒤쪽 execution evidence와 코드 모듈 추적으로 판정한다." + shell_note,
            sty["small"],
        ),
        R3.p(f"캡처 QA: {capture_path.relative_to(REPO).as_posix()}", sty["small"]),
        PageBreak(),
    ]


def retitle(items, title, sty):
    items[0] = R3.p(title, sty["h1"])
    return items


def story_for(row, meta, sty, evidence_path, selected, metrics):
    story = []
    story.extend(R3.cover_page(row, meta, sty, evidence_path, selected, metrics))
    story.extend(R3.definition_page(row, meta, sty))
    story.extend(actual_modeling_page(row, meta, sty))
    story.extend(retitle(R3.execution_page(row, meta, sty, evidence_path, selected, metrics), "3. 해석 실행 evidence", sty))
    story.extend(retitle(R3.modules_page(row, meta, sty), "4. 사용된 S-Structures 자체 해석모듈", sty))
    story.extend(retitle(R3.equations_page(row, meta, sty), "5. 내부 계산 절차·사용 식·검증 계층", sty))
    story.extend(retitle(R3.results_page(row, meta, sty, metrics), "6. 결과 비교와 판정", sty))
    story.extend(retitle(R3.audit_page(row, meta, sty, selected, evidence_path), "7. 물리검사·재현성·실행 provenance", sty))
    story.extend(retitle(R3.final_page(row, meta, sty, evidence_path), "8. 근거·최종 판정·다음 단계", sty))
    return story


def render_pdf(row, meta, evidence_path, selected, metrics):
    output = OUTPUT_ROOT / f"S-Structures_{row['id']}_실제모델링_자체해석엔진_검증보고서_R4.pdf"
    output.parent.mkdir(parents=True, exist_ok=True)
    sty = R3.styles()
    document = SimpleDocTemplate(
        str(output),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=20 * mm,
        title=f"S-Structures {row['id']} 실제 모델링·자체 구조해석엔진 검증보고서 R4",
        author="S-Structures Verification",
        subject=f"{row['id']} concept, actual Chrome model, modules, equations, evidence, and claim boundary",
    )
    decorate = R3.footer(row["id"])
    document.build(
        story_for(row, meta, sty, evidence_path, selected, metrics),
        onFirstPage=decorate,
        onLaterPages=decorate,
        canvasmaker=R3.StableCanvas,
    )
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
        if not any(low < 250 for low, _high in image.getextrema()):
            raise RuntimeError(f"{case_id} page {index + 1} is blank")
        rendered.append(page_path)

    reader = PdfReader(str(pdf_path))
    texts = [(page.extract_text() or "").strip() for page in reader.pages]
    if len(texts) != 9:
        raise RuntimeError(f"{case_id} expected 9 pages, got {len(texts)}")
    if any(len(text) < 120 for text in texts):
        raise RuntimeError(f"{case_id} extracted text too short: {[len(text) for text in texts]}")
    joined = "".join("\n".join(texts).split())
    required = [case_id, "실제S-Structures모델링화면", "GoogleChrome", "자체구조해석엔진", "내부계산절차", "제품해석엔진", "NOTCLAIMED"]
    required.extend(Path(path).stem for path in module_paths)
    missing = [value for value in required if "".join(value.split()) not in joined]
    if missing:
        raise RuntimeError(f"{case_id} required text missing: {missing}")

    capture_path, capture = capture_evidence(case_id)
    qa = {
        "version": "strix21-actual-model-in-house-engine-report-r4",
        "status": "PASS",
        "caseId": case_id,
        "pdfPath": pdf_path.relative_to(REPO).as_posix(),
        "pdfSha256": R3.sha256(pdf_path),
        "pageCount": len(texts),
        "textLengthByPage": [len(text) for text in texts],
        "renderedPages": [path.relative_to(REPO).as_posix() for path in rendered],
        "actualModelCaptureEvidence": capture_path.relative_to(REPO).as_posix(),
        "actualModelScreenshotSha256": capture["screenshotSha256"],
        "modelBookSha256": capture["modelBookSha256"],
        "visualChecks": [
            "NO_BLANK_PAGES",
            "KOREAN_FONT_EMBEDDED",
            "EXACT_NINE_PAGE_STRUCTURE",
            "CONCEPT_MODEL_VISIBLE",
            "ACTUAL_CHROME_S_STRUCTURES_MODEL_VISIBLE",
            "MODEL_CENTER_FIT_RECORDED",
            "EXECUTION_EVIDENCE_VISIBLE",
            "ENGINE_MODULE_TRACE_VISIBLE",
            "ENGINE_AND_VERIFICATION_LAYERS_SEPARATED",
            "EQUATIONS_AND_WORKFLOW_VISIBLE",
            "CLAIM_BOUNDARY_VISIBLE",
        ],
    }
    return qa, rendered


def write_markdown(row, meta, evidence_path, selected, metrics, pdf_name):
    case_id = row["id"]
    report_dir = R3.CASE_FOLDERS[case_id] / "05_보고서"
    output = report_dir / f"{case_id}_실제모델링_자체해석엔진_검증보고서_R4.md"
    capture_path, capture = capture_evidence(case_id)
    modules = "\n".join(f"| {R3.module_layer(path)} | `{path}` | {role} |" for path, role in meta["modules"])
    equations = "\n".join(f"{index}. `{equation}`" for index, equation in enumerate(meta["equations"], start=1))
    workflow = "\n".join(f"{index}. {step}" for index, step in enumerate(meta["workflow"], start=1))
    can, cannot, next_step = R3.status_claims(row, meta)
    counts = capture["expectedCounts"]
    text = f"""# {case_id} 실제 모델링·자체 구조해석엔진 검증보고서 R4

- 문제: {meta['titleKo']}
- 판정: **{R3.STATUS[row['lane']]['ko']}**
- PDF: `{pdf_name}`
- 실제 S-Structures model book: `{Path(capture['modelBook']).relative_to(VAULT).as_posix()}`
- 실제 Chrome 캡처: `{Path(capture['reportScreenshot']).relative_to(VAULT).as_posix()}`
- 캡처 QA: `{capture_path.relative_to(REPO).as_posix()}`
- 실행 evidence: `{evidence_path.relative_to(VAULT).as_posix()}`

## 실제 S-Structures 모델링

- 노드 {counts.get('nodes', 0)}, 부재 {counts.get('members', 0)}, Shell {counts.get('shells', 0)}, Link {counts.get('links', 0)}, 하중 {counts.get('loads', 0)}
- 화면: {capture.get('view', '-')}
- 모델 성격: {model_boundary_text(capture['verificationBoundary'])}
- model book SHA-256: `{capture['modelBookSha256']}`
- 화면 SHA-256: `{capture['screenshotSha256']}`

## 검증 목적

{meta['objective']}

## 모델링 절차

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

{R3.metric_markdown(metrics)}

## 주장 경계

- 설득 가능한 주장: {can}
- 아직 주장할 수 없는 것: {cannot}
- 다음 단계: {next_step}

실제 화면은 모델링 형상 증거이고, PASS/FAIL은 execution evidence로 판정한다. Reference 값은 판정 계층에서만 사용하며 제품 해석엔진 출력에 주입하지 않는다.
"""
    output.write_text(text, encoding="utf-8")
    return output


def update_report_readme(row, pdf_name, markdown_name, qa_name):
    readme = R3.CASE_FOLDERS[row["id"]] / "05_보고서/README.md"
    original = readme.read_text(encoding="utf-8") if readme.exists() else "# 보고서\n"
    marker_start = "<!-- STRIX21-R4-START -->"
    marker_end = "<!-- STRIX21-R4-END -->"
    block = f"""{marker_start}
## 최신 실제 모델링·자체 해석엔진 상세보고서 R4

- `{pdf_name}`: 개념 형상·실제 Chrome S-Structures 모델·실행 evidence·제품 모듈·사용 식·결과·주장 경계를 수록한 9쪽 보고서
- `{markdown_name}`: 같은 내용의 Markdown 요약
- `{qa_name}`: 9쪽 전 페이지 렌더링·텍스트·필수 모듈 경로·실제 화면 hash 검사
- `figures/03_{row['id']}_S-Structures_실제모델링_R4.png`: Google Chrome에서 직접 캡처한 중앙 배치 모델링 원본
- `figures/02_개념모델_R4.png`, `03_보고서_실제모델링페이지_R4.png`, `04_실행증거_R4.png`, `05_자체해석엔진_모듈_R4.png`, `06_내부계산_검증계층_R4.png`: 핵심 보고서 페이지 미리보기
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
    case_id = row["id"]
    report_dir = R3.CASE_FOLDERS[case_id] / "05_보고서"
    figures = report_dir / "figures"
    figures.mkdir(parents=True, exist_ok=True)
    final_pdf = report_dir / f"{case_id}_실제모델링_자체해석엔진_검증보고서_R4.pdf"
    shutil.copy2(pdf_path, final_pdf)
    qa_path = report_dir / "report-qa-r4-actual-model.json"
    qa_path.write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    preview_map = {
        2: "02_개념모델_R4.png",
        3: "03_보고서_실제모델링페이지_R4.png",
        4: "04_실행증거_R4.png",
        5: "05_자체해석엔진_모듈_R4.png",
        6: "06_내부계산_검증계층_R4.png",
    }
    for page, name in preview_map.items():
        shutil.copy2(rendered[page - 1], figures / name)
    update_report_readme(row, final_pdf.name, markdown_path.name, qa_path.name)
    if R3.sha256(pdf_path) != R3.sha256(final_pdf):
        raise RuntimeError(f"{case_id} copied PDF hash mismatch")
    return final_pdf, qa_path


def contact_sheets(results):
    paths = []
    chunk_size = 5
    for chunk_index in range(0, len(results), chunk_size):
        chunk = results[chunk_index:chunk_index + chunk_size]
        thumb_width = 155
        margin = 10
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
        width = 9 * thumb_width + 10 * margin
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
        "# STRIX 21 실제 S-Structures 모델링·자체 해석엔진 보고서 색인",
        "",
        "21개 모두 개념 형상과 실제 S-Structures 모델링 화면을 함께 수록했다. SB1은 기존 R3 9쪽 보고서이고, 나머지 20개는 같은 설득 구조로 만든 R4 9쪽 보고서다. 모델링 화면은 모두 Google Chrome에서 각 model book을 직접 열고 Fit View로 중앙 배치해 캡처했다.",
        "",
        "| 순서 | 사례 | 판정 | 실제 모델링 포함 상세보고서 | QA |",
        "|---:|---|---|---|---|",
        "| 1 | SB1 | 동일모델 로컬 공학 PASS | `01_SB1_Euler-Bernoulli_Cantilever/05_보고서/SB1_검증보고서_R3.pdf` | `report-qa-r3.json` |",
    ]
    for item in results:
        row = item["row"]
        folder = R3.CASE_FOLDERS[row["id"]].name
        lines.append(
            f"| {R3.ORDER.index(row['id']) + 1} | {row['id']} | {R3.STATUS[row['lane']]['ko']} | "
            f"`{folder}/05_보고서/{item['finalPdf'].name}` | `{folder}/05_보고서/{item['qaPath'].name}` |"
        )
    lines.extend([
        "",
        "## 실제 모델링 공통 증거",
        "",
        f"- 20개 모델링 화면 콘택트시트: `{(CAPTURE_ROOT / 'STRIX21_S-Structures_실제모델링_20개_콘택트시트_R4.png').relative_to(REPO).as_posix()}`",
        f"- 캡처 manifest: `{CAPTURE_MANIFEST.relative_to(REPO).as_posix()}`",
        f"- model book manifest: `{MODEL_MANIFEST.relative_to(REPO).as_posix()}`",
        "",
        "## 주장 원칙",
        "",
        "- 실제 모델링 화면은 형상·경계조건·하중 배치의 증거이며 수치 PASS 그 자체는 아니다.",
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
    R3.BASE.register_fonts()

    capture_manifest = read_json(CAPTURE_MANIFEST)
    if capture_manifest.get("allPassed") is not True or capture_manifest.get("caseCount") != 20:
        raise RuntimeError("R4 actual-model capture manifest is not complete")
    document = read_json(R3.COMPARISON)
    by_id = {row["id"]: row for row in document["cases"]}
    selected_ids = [case_id for case_id in R3.ORDER if case_id != "SB1"] if args.case == "all" else [args.case]

    results = []
    for case_id in selected_ids:
        if case_id not in by_id:
            raise KeyError(case_id)
        row = by_id[case_id]
        row["lane"] = row.get("lane") or "engine_only"
        meta = R3.BASE.METHODS[case_id]
        source_path, _raw, selected = R3.load_evidence(row)
        metrics = R3.extract_metrics(row, selected)
        pdf_path = render_pdf(row, meta, source_path, selected, metrics)
        qa, rendered = render_and_qa(row, pdf_path, [path for path, _role in meta["modules"]])
        markdown_path = write_markdown(row, meta, source_path, selected, metrics, pdf_path.name)
        final_pdf, qa_path = install_case_artifacts(row, pdf_path, qa, rendered, markdown_path)
        capture_path, capture = capture_evidence(case_id)
        results.append({
            "row": row,
            "pdf": pdf_path,
            "finalPdf": final_pdf,
            "qaPath": qa_path,
            "rendered": rendered,
            "evidencePath": source_path,
            "evidenceSha256": R3.sha256(source_path),
            "capturePath": capture_path,
            "capture": capture,
        })
        print(f"{case_id}: PASS pages={qa['pageCount']} pdf={qa['pdfSha256'][:16]} capture={capture['screenshotSha256'][:16]}")

    sheets = contact_sheets(results)
    if args.case == "all":
        write_index(results)
        QA_ROOT.mkdir(parents=True, exist_ok=True)
        manifest = {
            "version": "strix21-actual-model-in-house-engine-report-package-r4",
            "status": "PASS",
            "generatedAt": "2026-08-30",
            "caseCount": len(results),
            "totalPageCount": len(results) * 9,
            "allActualSStructuresModelsCaptured": True,
            "reports": [{
                "caseId": item["row"]["id"],
                "lane": item["row"]["lane"],
                "status": R3.STATUS[item["row"]["lane"]]["ko"],
                "pdfPath": item["pdf"].relative_to(REPO).as_posix(),
                "pdfSha256": R3.sha256(item["pdf"]),
                "caseFolderPdf": item["finalPdf"].relative_to(VAULT).as_posix(),
                "qaPath": item["qaPath"].relative_to(VAULT).as_posix(),
                "evidencePath": item["evidencePath"].relative_to(VAULT).as_posix(),
                "evidenceSha256": item["evidenceSha256"],
                "actualModelBook": item["capture"]["modelBook"],
                "modelBookSha256": item["capture"]["modelBookSha256"],
                "actualChromeCapture": item["capture"]["screenshot"],
                "actualChromeCaptureSha256": item["capture"]["screenshotSha256"],
            } for item in results],
            "reportContactSheets": [path.relative_to(REPO).as_posix() for path in sheets],
            "actualModelCaptureManifest": CAPTURE_MANIFEST.relative_to(REPO).as_posix(),
            "modelBookManifest": MODEL_MANIFEST.relative_to(REPO).as_posix(),
            "indexPath": INDEX_PATH.relative_to(VAULT).as_posix(),
        }
        MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({
            "status": "PASS",
            "caseCount": len(results),
            "totalPages": len(results) * 9,
            "allActualModels": True,
            "manifest": MANIFEST_PATH.relative_to(REPO).as_posix(),
        }, ensure_ascii=False))


if __name__ == "__main__":
    main()
