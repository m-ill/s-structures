from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image as PdfImage,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
P18 = ROOT / "verification" / "benchmarks" / "strix21" / "milestones" / "P18"
OUTPUT = ROOT / "output" / "pdf"
FIGURES = P18 / "figures"
PDF_PATH = OUTPUT / "S-Structures_Phase18_STRIX21_엔진완성_검증보고서.pdf"
FONT = Path(r"C:\Windows\Fonts\malgun.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\malgunbd.ttf")

NAVY = "#123B5D"
BLUE = "#176B87"
TEAL = "#159A9C"
GREEN = "#1F8A5B"
AMBER = "#D89B24"
RED = "#C84A4A"
INK = "#1D2A33"
MUTED = "#60727F"
LIGHT = "#EAF1F5"


def load_record(case_id: str) -> dict:
    return json.loads((P18 / case_id / "runs" / "p18-engine-result.json").read_text(encoding="utf-8"))


def pil_font(size: int, bold: bool = False):
    return ImageFont.truetype(str(FONT_BOLD if bold else FONT), size)


def canvas(title: str, subtitle: str = ""):
    image = Image.new("RGB", (1600, 900), "white")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((55, 45, 1545, 855), radius=28, fill="#F8FBFC", outline="#D7E4EA", width=3)
    draw.text((100, 82), title, font=pil_font(48, True), fill=NAVY)
    if subtitle:
        draw.text((102, 148), subtitle, font=pil_font(25), fill=MUTED)
    return image, draw


def draw_status_chart(manifest: dict, path: Path):
    image, draw = canvas("P18 검증 상태", "엔진 기능과 공식 동일문제 판정을 분리")
    values = [manifest["counts"]["enginePass"], manifest["counts"]["officialInputBlocked"], manifest["counts"]["failedProbe"]]
    labels = ["엔진 기능 PASS", "공식 입력 보류", "실패 프로브"]
    colors_ = [GREEN, AMBER, RED]
    max_value = 10
    base_y = 730
    for index, (value, label, color) in enumerate(zip(values, labels, colors_)):
        x = 220 + index * 430
        height = 470 * value / max_value
        draw.rounded_rectangle((x, base_y - height, x + 230, base_y), radius=18, fill=color)
        draw.text((x + 115, base_y - height - 56), str(value), anchor="mm", font=pil_font(45, True), fill=color)
        draw.text((x + 115, base_y + 43), label, anchor="mm", font=pil_font(27, True), fill=INK)
    draw.text((800, 815), "외부 프로그램 PASS 주장 0건", anchor="mm", font=pil_font(25), fill=MUTED)
    image.save(path)


def draw_th1_chart(record: dict, path: Path):
    image, draw = canvas("TH1 — 시간간격 수렴", "Newmark 평균가속도와 독립 RK4의 최대변위 오차")
    rows = record["result"]["rows"]
    left, top, right, bottom = 180, 235, 1470, 730
    draw.line((left, bottom, right, bottom), fill=INK, width=3)
    draw.line((left, top, left, bottom), fill=INK, width=3)
    all_errors = [max(abs(row["errorPct"]), 1e-8) for row in rows]
    min_log, max_log = math.log10(min(all_errors)) - 0.2, math.log10(max(all_errors)) + 0.2
    min_x, max_x = math.log10(0.003125), math.log10(0.1)
    for damping, color, label in [(0, BLUE, "감쇠 0%"), (0.05, TEAL, "감쇠 5%")]:
        selected = sorted([row for row in rows if row["dampingRatio"] == damping], key=lambda row: row["dt"])
        points = []
        for row in selected:
            x = left + (math.log10(row["dt"]) - min_x) / (max_x - min_x) * (right - left)
            y = bottom - (math.log10(max(abs(row["errorPct"]), 1e-8)) - min_log) / (max_log - min_log) * (bottom - top)
            points.append((x, y))
        draw.line(points, fill=color, width=6)
        for point in points:
            draw.ellipse((point[0] - 8, point[1] - 8, point[0] + 8, point[1] + 8), fill=color)
        legend_x = 1040 if damping == 0 else 1250
        draw.line((legend_x, 190, legend_x + 55, 190), fill=color, width=6)
        draw.text((legend_x + 65, 190), label, anchor="lm", font=pil_font(23), fill=INK)
    for dt in [0.003125, 0.00625, 0.0125, 0.025, 0.05, 0.1]:
        x = left + (math.log10(dt) - min_x) / (max_x - min_x) * (right - left)
        draw.text((x, bottom + 30), f"{dt:g}", anchor="ma", font=pil_font(20), fill=MUTED)
    draw.text(((left + right) / 2, 805), "시간간격 dt (s, 로그축)", anchor="mm", font=pil_font(24, True), fill=INK)
    draw.text((55, (top + bottom) / 2), "오차 |%| (로그축)", anchor="mm", font=pil_font(22, True), fill=INK)
    image.save(path)


def draw_sm6_chart(record: dict, path: Path):
    image, draw = canvas("SM6 — 3D 파이프 프레임 고유진동수", "S-Structures와 LARSA E08 공개 검증값")
    probes = record["result"]["probes"]
    actual = [probe["actual"] for probe in probes]
    reference = [probe["reference"] for probe in probes]
    left, top, right, bottom = 150, 230, 1490, 735
    maximum = max(actual + reference) * 1.12
    draw.line((left, bottom, right, bottom), fill=INK, width=3)
    for index, (a, r) in enumerate(zip(actual, reference)):
        group_x = left + 70 + index * 158
        for offset, value, color in [(-31, r, "#A9BBC6"), (31, a, BLUE)]:
            height = (bottom - top) * value / maximum
            draw.rectangle((group_x + offset - 24, bottom - height, group_x + offset + 24, bottom), fill=color)
        error = (a - r) / r * 100
        draw.text((group_x, bottom + 32), f"M{index + 1}", anchor="ma", font=pil_font(21, True), fill=INK)
        draw.text((group_x, bottom - max(a, r) / maximum * (bottom - top) - 30), f"{error:+.2f}%", anchor="mm", font=pil_font(17), fill=MUTED)
    draw.rectangle((1050, 175, 1080, 200), fill="#A9BBC6")
    draw.text((1095, 188), "LARSA", anchor="lm", font=pil_font(22), fill=INK)
    draw.rectangle((1250, 175, 1280, 200), fill=BLUE)
    draw.text((1295, 188), "S-Structures", anchor="lm", font=pil_font(22), fill=INK)
    draw.text((75, 480), "Hz", anchor="mm", font=pil_font(24, True), fill=INK)
    image.save(path)


def draw_sr2_chart(record: dict, path: Path):
    image, draw = canvas("SR2 — 편심 강체격막 RSA 엔진 결과", "동일 엔진 fixture의 모달 조합법별 X방향 최대변위")
    rows = record["result"]["engineResults"]
    labels = [row["method"] for row in rows]
    values = [row["directions"]["x"]["displacement"] * 1000 for row in rows]
    left, top, right, bottom = 220, 260, 1430, 720
    maximum = max(values) * 1.25
    draw.line((left, bottom, right, bottom), fill=INK, width=3)
    for index, (label, value) in enumerate(zip(labels, values)):
        x = left + 150 + index * 280
        height = (bottom - top) * value / maximum
        color = [BLUE, TEAL, AMBER, NAVY][index]
        draw.rounded_rectangle((x - 70, bottom - height, x + 70, bottom), radius=16, fill=color)
        draw.text((x, bottom - height - 34), f"{value:.4f} mm", anchor="mm", font=pil_font(22, True), fill=color)
        draw.text((x, bottom + 38), label, anchor="ma", font=pil_font(24, True), fill=INK)
    draw.text((85, 480), "변위 (mm)", anchor="mm", font=pil_font(23, True), fill=INK)
    draw.text((800, 820), "공개 입력 누락으로 STRIX 공식 roof CM 값과의 동일모델 비교는 보류", anchor="mm", font=pil_font(23), fill=AMBER)
    image.save(path)


def draw_sh1_chart(record: dict, path: Path):
    image, draw = canvas("SH1 — P–M–M 힌지 백본 체크포인트", "공개 A1–A4 모멘트와 S-Structures 계산값")
    probe_map = {probe["id"]: probe for probe in record["result"]["probes"]}
    rotations = [0, 0.01, 0.02, 0.04, 0.08]
    actual = [0] + [probe_map[key]["actual"] / 1e6 for key in ["SH1-A1-MZ", "SH1-A2-MZ", "SH1-A3-MZ", "SH1-A4-MZ"]]
    reference = [0] + [probe_map[key]["reference"] / 1e6 for key in ["SH1-A1-MZ", "SH1-A2-MZ", "SH1-A3-MZ", "SH1-A4-MZ"]]
    left, top, right, bottom = 180, 235, 1470, 730
    draw.line((left, bottom, right, bottom), fill=INK, width=3)
    draw.line((left, top, left, bottom), fill=INK, width=3)
    def points(values):
        return [(left + rotation / 0.08 * (right - left), bottom - value / 140 * (bottom - top)) for rotation, value in zip(rotations, values)]
    draw.line(points(reference), fill="#A9BBC6", width=11)
    draw.line(points(actual), fill=BLUE, width=5)
    for x, y in points(actual):
        draw.ellipse((x - 8, y - 8, x + 8, y + 8), fill=BLUE)
    for rotation in rotations:
        x = left + rotation / 0.08 * (right - left)
        draw.text((x, bottom + 31), f"{rotation:g}", anchor="ma", font=pil_font(20), fill=MUTED)
    draw.text(((left + right) / 2, 805), "소성회전 (rad)", anchor="mm", font=pil_font(24, True), fill=INK)
    draw.text((70, 480), "M (MN·mm)", anchor="mm", font=pil_font(22, True), fill=INK)
    draw.line((1080, 190, 1135, 190), fill="#A9BBC6", width=10)
    draw.text((1145, 190), "공개 기준", anchor="lm", font=pil_font(22), fill=INK)
    draw.line((1300, 190, 1355, 190), fill=BLUE, width=5)
    draw.text((1365, 190), "계산", anchor="lm", font=pil_font(22), fill=INK)
    image.save(path)


def paragraph(text: str, style):
    return Paragraph(text.replace("\n", "<br/>"), style)


def make_pdf(manifest: dict, records: dict[str, dict], figures: dict[str, Path]):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    pdfmetrics.registerFont(TTFont("Malgun", str(FONT)))
    pdfmetrics.registerFont(TTFont("MalgunBold", str(FONT_BOLD)))
    styles = getSampleStyleSheet()
    title = ParagraphStyle("TitleKo", parent=styles["Title"], fontName="MalgunBold", fontSize=25, leading=34, textColor=colors.HexColor(NAVY), alignment=TA_LEFT)
    h1 = ParagraphStyle("H1Ko", parent=styles["Heading1"], fontName="MalgunBold", fontSize=18, leading=25, textColor=colors.HexColor(NAVY), spaceAfter=10)
    h2 = ParagraphStyle("H2Ko", parent=styles["Heading2"], fontName="MalgunBold", fontSize=13, leading=19, textColor=colors.HexColor(BLUE), spaceBefore=7, spaceAfter=6)
    body = ParagraphStyle("BodyKo", parent=styles["BodyText"], fontName="Malgun", fontSize=9.4, leading=15, textColor=colors.HexColor(INK), wordWrap="CJK", spaceAfter=6)
    small = ParagraphStyle("SmallKo", parent=body, fontSize=8, leading=12, textColor=colors.HexColor(MUTED))
    center = ParagraphStyle("CenterKo", parent=body, alignment=TA_CENTER)
    callout = ParagraphStyle("CalloutKo", parent=body, fontName="MalgunBold", fontSize=11, leading=18, textColor=colors.HexColor(NAVY), backColor=colors.HexColor(LIGHT), borderPadding=12, spaceBefore=8, spaceAfter=10)

    doc = SimpleDocTemplate(str(PDF_PATH), pagesize=A4, rightMargin=17 * mm, leftMargin=17 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
                            title="S-Structures Phase 18 STRIX 21 엔진 완성 검증 보고서", author="S-Structures")
    story = []
    story += [Spacer(1, 20 * mm), paragraph("S-Structures Phase 18", title), Spacer(1, 3 * mm),
              paragraph("STRIX 21 잔여 10건<br/>엔진 완성·검증 보고서", ParagraphStyle("Cover", parent=title, fontSize=31, leading=42)),
              Spacer(1, 18 * mm), paragraph("AI-native 구조해석 에이전트 키트", h2),
              paragraph("생산 엔진 기능, 독립 수치 검증, 공식 동일문제 입력 보류를 분리해 기록한 개발·검증 보고서", body),
              Spacer(1, 18 * mm), PdfImage(str(figures["status"]), width=176 * mm, height=99 * mm),
              Spacer(1, 8 * mm), paragraph("기준일 2026-08-29  |  외부 프로그램 PASS 주장 없음", center), PageBreak()]

    story += [paragraph("1. 결론", h1), paragraph(
        "잔여 10개 문제에 필요한 S-Structures 수치 경로는 모두 실행됐고 총 86개 검증 프로브에서 실패가 없었다. "
        "SR1·SR2·SR2b의 응답스펙트럼 엔진은 통과했지만, 공개 자료에 정확한 질량·단면·배치·스펙트럼 표가 빠져 있어 STRIX 공식 동일문제 수치 PASS는 보류했다.", body),
        paragraph("핵심 판정: 엔진 기능 10/10 PASS · 실패 프로브 0 · 공식 입력 보류 3 · 외부 프로그램 PASS 주장 0", callout),
        paragraph("판정 용어", h2),
        bullet_table([
            ("PASS", "S-Structures 생산 모듈이 독립 계산 또는 물리 불변량 기준을 통과"),
            ("INPUT_BLOCKED", "공개 입력이 불완전해 STRIX와 같은 모델이라는 것을 증명할 수 없음"),
            ("NOT_CLAIMED", "이번 단계에서 외부 프로그램 동일문제 PASS를 판정하지 않음"),
        ], body),
        paragraph("이 구분은 엔진 개발 완료와 상용 프로그램 교차검증 완료를 혼동하지 않기 위한 fail-closed 정책이다.", body),
        PageBreak()]

    story += [paragraph("2. 문제별 상태", h1), status_table(manifest, body, small), Spacer(1, 5 * mm),
              paragraph("각 문제는 <b>model / runs / report</b> 하위 폴더를 가진 P18 독립 패키지로 저장했다. P17 서명 case 폴더의 exact inventory는 변경하지 않았다.", body),
              paragraph("결과 경로", h2), paragraph("verification/benchmarks/strix21/milestones/P18/&lt;CASE&gt;/", callout), PageBreak()]

    story += [paragraph("3. 모듈 아키텍처", h1),
              paragraph("검증값과 독립 기준해는 verification에 남기고, 재사용 가능한 수치 기능만 src에 배치했다. 생산 코드가 검증 코드를 import하지 않는 경계를 유지한다.", body),
              module_table(body, small),
              paragraph("SB12", h2), paragraph("MIDAS식 beta 각도 좌표계, shear-distance 결합, K=Bᵀdiag(k)B, 기본변형·기본력·전역 단부력을 제공한다. 모델 links[]가 canonical domain과 전역 선형·모달 강성행렬에 실제 조립된다.", body),
              paragraph("SH1", h2), paragraph("탄성 시작, FEMA/ASCE형 백본, 탄성 unload/reload, 축력별 monotone PCHIP 용량, 이축 radial projection, 12-DOF zero-length 요소 및 다요소 전역 접선·내력 조립 API를 제공한다.", body),
              PageBreak()]

    story += [paragraph("4. TH1 시간적분 검증", h1), PdfImage(str(figures["th1"]), width=176 * mm, height=99 * mm),
              paragraph("Newmark 평균가속도법의 최대변위를 동일 piecewise-linear 입력의 고정 세분 RK4와 비교했다. 최종 dt=0.003125 s에서 무감쇠 오차 −0.00484%, 5% 감쇠 오차 −0.00170%이며 대표 수렴차수는 각각 2.058, 2.181이다.", body), PageBreak()]

    story += [paragraph("5. SM6 고유치 검증", h1), PdfImage(str(figures["sm6"]), width=176 * mm, height=99 * mm),
              paragraph("18개 파이프 프레임 요소와 14개 집중질량을 생산 3D Timoshenko 프레임으로 해석했다. LARSA E08 공개 vendor 비교값 대비 8개 모드 최대 오차는 2.55%로 4% 공학적 bracket을 통과했다.", body),
              paragraph("STRIX 공개 패키지는 내부 42-DOF 재구성에 사용한 중간절점 좌표표를 완전히 공개하지 않아 STRIX ω² 값은 비판정 참고 lane으로만 유지했다.", body), PageBreak()]

    story += [paragraph("6. 응답스펙트럼 엔진", h1), PdfImage(str(figures["sr2"]), width=176 * mm, height=99 * mm),
              paragraph("SR1은 2D frame SRSS/CQC, SR2는 편심 3D 강체격막·6-DOF 질량·SRSS/CQC/ABS/NRC10, SR2b는 L형 가새골조·축력복원을 각각 완전한 엔진 fixture로 실행했다. 모드별 signed response의 독립 조합 closure, 회전응답, 관성모멘트, 부재력 복원이 모두 통과했다.", body),
              source_gap_table(body, small), PageBreak()]

    story += [paragraph("7. SH1 P–M–M 힌지", h1), PdfImage(str(figures["sh1"]), width=176 * mm, height=99 * mm),
              paragraph("A1–A4 백본, B 탄성 unload, C 이축 상호작용, D 축력별 PCHIP, zero-length 작용·반작용, 전역 도메인 요소 조립을 확인했다. 코드 리뷰에서 회전 0의 비물리 초기력 가능성을 제거하고 일반 해석과 공개 체크포인트 입력 모드를 분리했다.", body),
              paragraph("현재 접선은 one-sided 수치 algorithmic tangent다. 해석적 일관 접선과 기존 증분 Newton 상태 commit/revert 자동 연결은 다음 제품 통합 gate로 남는다.", callout), PageBreak()]

    story += [paragraph("8. 코드 리뷰와 남은 부채", h1), debt_table(body, small),
              paragraph("회귀검사", h2), paragraph("P18과 P10~P15 단계 회귀, 425개 시험 taxonomy, 공개 import, verification layout, P17 source·exact scaffold·boundary를 통과했다. 회귀 중 빈 links[]가 P10 동결 모델을 바꾸는 문제를 발견해 선택 필드 계약으로 수정했다. P15 아키텍처 감사가 기록한 기존 report 재실행 위험 1건과 UI numeric core 40건은 P18 신규 모듈에서 발생한 결함이 아니며 기존 기술부채로 유지된다.", body),
              paragraph("완료의 범위", h2), paragraph("핵심 수치 커널과 감사 가능한 엔진 실행은 완료됐다. SH1 비선형 제품 워크플로 자동 연결, SB12 일반 결과 UI, SR 3건 공식 입력 lock은 다음 단계다.", callout), PageBreak()]

    story += [paragraph("9. 다음 실행 순서", h1), ordered_steps(body),
              paragraph("공식 비교 승격 조건", h2), bullet_table([
                  ("입력", "원문·모델·스펙트럼·단위·부호의 source lock"),
                  ("동등성", "원문과 S-Structures 입력의 필드별 equivalence"),
                  ("실행", "결정론적 actual solve 3회와 result projection hash"),
                  ("비교", "MIDAS·STRIX 원시결과와 오차·부호·물리 불변량"),
                  ("보고", "모델·로그·원시결과·그림·Markdown/PDF 패키지"),
              ], body), PageBreak()]

    story += [paragraph("10. 출처와 재현 명령", h1),
              paragraph("공개 검증 페이지: https://dcr-st.com/verification.html", body),
              paragraph("LARSA 4D Verification Problems E08 ASME Frame: https://www.larsa4d.com/download/manuals/larsa4d/2025R2/LARSA4D_VerificationProblems.pdf", body),
              paragraph("재현", h2), code_table([
                  "npm run test:p18",
                  "npm run evidence:p18",
                  "npm run test:p10",
                  "npm run test:p12",
                  "npm run test:p13",
                  "npm run test:p14",
                  "npm run test:p15",
                  "npm run check:test-taxonomy",
                  "npm run check:public-imports",
                  "npm run check:verification-layout",
              ], small),
              paragraph("통합 매니페스트 해시와 문제별 engineering hash는 P18 milestone 폴더에 보관한다. 이 PDF는 해당 JSON 증거를 읽어 생성했다.", body)]

    doc.build(story, onFirstPage=page_decor, onLaterPages=page_decor)


def page_decor(canvas_, doc):
    canvas_.saveState()
    canvas_.setStrokeColor(colors.HexColor("#D8E3E9"))
    canvas_.line(17 * mm, 13 * mm, A4[0] - 17 * mm, 13 * mm)
    canvas_.setFont("Malgun", 7.5)
    canvas_.setFillColor(colors.HexColor(MUTED))
    canvas_.drawString(17 * mm, 8 * mm, "S-Structures Phase 18 · STRIX 21 엔진 검증")
    canvas_.drawRightString(A4[0] - 17 * mm, 8 * mm, str(doc.page))
    canvas_.restoreState()


def p(text, style):
    return Paragraph(text, style)


def bullet_table(rows, body):
    data = [[p(f"<b>{left}</b>", body), p(right, body)] for left, right in rows]
    table = Table(data, colWidths=[34 * mm, 137 * mm])
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -2), 0.3, colors.HexColor("#DDE7EC")), ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5)]))
    return table


def status_table(manifest, body, small):
    data = [[p("문제", body), p("엔진", body), p("공식 동일문제", body), p("프로브", body), p("결과 해시", body)]]
    for row in manifest["cases"]:
        data.append([p(row["caseId"], body), p(row["engineStatus"], small), p(row["officialBenchmarkStatus"], small), str(row["probeCount"]), p(row["engineeringHash"][:12] + "…", small)])
    table = Table(data, colWidths=[22 * mm, 27 * mm, 43 * mm, 20 * mm, 59 * mm], repeatRows=1)
    table.setStyle(common_table_style())
    return table


def module_table(body, small):
    rows = [
        ("SB12", "solver/link/elasticLink6dof", "전역 선형·모달 조립"),
        ("SH1", "nonlinear/materials/pmmHinge3d", "재료응답·접선"),
        ("SH1", "nonlinear/math/monotonePchip", "축력별 용량 보간"),
        ("SH1", "nonlinear/elements/zeroLengthPmmHinge3d", "12-DOF·전역 도메인"),
        ("SR", "dynamics/modal + results/rsa", "모달·조합·복원"),
        ("P3S2", "solver/shell", "실제 안정화 sweep"),
    ]
    data = [[p("범위", body), p("생산 소유자", body), p("통합", body)]] + [[p(a, body), p(b, small), p(c, body)] for a, b, c in rows]
    table = Table(data, colWidths=[24 * mm, 89 * mm, 58 * mm], repeatRows=1)
    table.setStyle(common_table_style())
    return table


def source_gap_table(body, small):
    rows = [
        ("SR1", "질량 m, 전체 스펙트럼, 단면·8요소 연결"),
        ("SR2", "보·기둥 단면, 층 질량·Jz, 전체 연결·설정"),
        ("SR2b", "L형 좌표·4프레임 배치, El Centro 표, 부재번호"),
    ]
    data = [[p("문제", body), p("공식 비교에 필요한 누락 입력", body)]] + [[p(a, body), p(b, small)] for a, b in rows]
    table = Table(data, colWidths=[28 * mm, 143 * mm], repeatRows=1)
    table.setStyle(common_table_style())
    return table


def debt_table(body, small):
    rows = [
        ("P1", "SH1 증분해석 자동 연결", "전역 요소 조립 완료; Newton/commit 루프 미연결"),
        ("P1", "SH1 접선", "수치 algorithmic tangent; 일관 접선 추가"),
        ("P1", "SB12 결과 노출", "강성·모달 완료; 일반 결과표·UI 연결"),
        ("P1", "SR 공식 입력", "엔진 fixture PASS; 동일모델 source lock 필요"),
        ("P2", "완전 canonical 입력", "핵심 스냅숏 보관; 전체 직렬화 강화"),
    ]
    data = [[p("우선", body), p("항목", body), p("상태", body)]] + [[p(a, body), p(b, body), p(c, small)] for a, b, c in rows]
    table = Table(data, colWidths=[20 * mm, 58 * mm, 93 * mm], repeatRows=1)
    table.setStyle(common_table_style())
    return table


def ordered_steps(body):
    steps = [
        "SR1 원문 입력 lock → 동일모델 실행 → 층변위·부재모멘트 비교",
        "SR2 편심질량·단면·연결 lock → 네 조합법 roof CM 비교",
        "SR2b L형 84부재·El Centro 표 lock → 가새 축력 부호 비교",
        "SB12 정적 링크 변형·력 결과와 보고서/UI 연결",
        "SH1 증분 Newton·상태 commit/revert·cyclic·restart 통합",
        "MIDAS·STRIX 동일 입력 해시와 원시결과 확보 후 외부 PASS 판정",
    ]
    return bullet_table([(str(index + 1), value) for index, value in enumerate(steps)], body)


def code_table(commands, small):
    table = Table([[p(command, small)] for command in commands], colWidths=[171 * mm])
    table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F2F6F8")), ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#D8E3E9")), ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D8E3E9")), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    return table


def common_table_style():
    return TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(NAVY)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "MalgunBold"),
        ("FONTNAME", (0, 1), (-1, -1), "Malgun"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D3E0E6")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F6F9FA")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ])


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    FIGURES.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((P18 / "p18-completion-manifest.json").read_text(encoding="utf-8"))
    records = {case_id: load_record(case_id) for case_id in ["TH1", "SP1", "SM6", "SM5b", "SR1", "SR2", "SR2b", "P3S2", "SB12", "SH1"]}
    figures = {
        "status": FIGURES / "p18-status.png",
        "th1": FIGURES / "th1-convergence.png",
        "sm6": FIGURES / "sm6-frequency-comparison.png",
        "sr2": FIGURES / "sr2-modal-combination.png",
        "sh1": FIGURES / "sh1-backbone.png",
    }
    draw_status_chart(manifest, figures["status"])
    draw_th1_chart(records["TH1"], figures["th1"])
    draw_sm6_chart(records["SM6"], figures["sm6"])
    draw_sr2_chart(records["SR2"], figures["sr2"])
    draw_sh1_chart(records["SH1"], figures["sh1"])
    make_pdf(manifest, records, figures)
    print(json.dumps({"ok": True, "pdf": str(PDF_PATH), "figures": [str(path) for path in figures.values()]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
