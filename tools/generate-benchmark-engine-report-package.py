from __future__ import annotations

import csv
import hashlib
import html
import json
import math
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.shapes import Circle, Drawing, Line, Path as GraphicPath, Polygon, PolyLine, Rect, String
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


REPO_ROOT = Path(__file__).resolve().parents[1]
VAULT_ROOT = REPO_ROOT.parent
CASE_ROOT = VAULT_ROOT / "testreport" / "STRIX-21-검증"
COLLECTION_ROOT = CASE_ROOT / "00_설득자료_모음"
COMPARISON_PATH = REPO_ROOT / "output" / "reports" / "strix-reference-sstructures-comparison" / "comparison-data.json"
P18A_PATH = REPO_ROOT / "verification" / "benchmarks" / "strix21" / "milestones" / "P18A" / "p18a-additional-comparison-evidence.json"
PDF_ROOT = REPO_ROOT / "output" / "pdf"
MASTER_PDF = PDF_ROOT / "S-Structures_벤치마크_해석엔진_통합보고서.pdf"
SUMMARY_PDF = PDF_ROOT / "S-Structures_검증_1장_요약보고서.pdf"
GENERATED_AT = "2026-08-29"

OFFICIAL_ORDER = [
    "SB1", "SB2", "SB3", "SB5", "SB6", "SB7", "SB8", "SB9", "SB10", "SB12",
    "PD1", "SM5", "SM5b", "SM6", "SR1", "SR2", "SR2b", "P3S2", "SP1", "SH1", "TH1",
]

NAVY = "#123E5A"
NAVY2 = "#0D2F45"
TEAL = "#168C8C"
GREEN = "#178B57"
AMBER = "#D99A18"
RED = "#C64D4D"
INK = "#17232D"
MUTED = "#5B6B78"
LINE = "#CCD9E0"
PALE = "#EAF2F6"
PALE_GREEN = "#E8F5EE"
PALE_AMBER = "#FFF4D8"
PALE_PURPLE = "#EAE7FA"


def method(title, objective, equations, modeling, workflow, modules, strength, limitation):
    return {
        "titleKo": title,
        "objective": objective,
        "equations": equations,
        "modeling": modeling,
        "workflow": workflow,
        "modules": modules,
        "strength": strength,
        "limitation": limitation,
    }


METHODS = {
    "SB1": method(
        "Euler-Bernoulli 외팔보 처짐",
        "1차원 보 요소가 순수 휨의 폐형해를 재현하고, 동일 입력에서 반복 실행 결과가 변하지 않는지 확인한다.",
        ["외팔보 끝단 처짐: delta = P L^3 / (3 E I)", "요소 평형식: K u = f"],
        ["고정단 1개와 자유단 1개를 잇는 3D frame 요소로 모델링", "전단변형을 제외해 Euler-Bernoulli 가정과 동일하게 설정", "끝단 집중하중과 끝단 수직변위를 probe로 고정"],
        ["절점·재료·단면·하중을 canonical model로 생성", "3D frame 강성행렬을 전역 좌표로 조립", "고정 자유도를 제거해 선형방정식 해석", "끝단 변위를 폐형해·STRIX 값과 비교하고 3회 hash 일치 확인"],
        [("src/solver/linear3d.js", "analyzeModel 선형해석 진입점"), ("src/solver/linear3dAssembly.js", "3D frame 전역 강성 조립"), ("src/solver/linear3dElement.js", "보-기둥 요소 강성 및 좌표변환"), ("verification/framework/benchmarks/strix21FirstBatch.js", "SB1 모델·probe·허용오차 runner")],
        "가장 단순한 휨 문제에서 이론식, 제품 해석 API, 반복실행 evidence가 한 경로로 연결된다.",
        "외부 독립 custody는 수행하지 않았으며 본 판정은 로컬 공학 검증이다.",
    ),
    "SB2": method(
        "NAFEMS LE1 타원형 막 응력",
        "왜곡된 곡선 경계의 평면응력 문제에서 막요소의 응력복원과 메시 수렴성을 확인한다.",
        ["요소 강성: K_e = integral(B^T D B t dA)", "평면응력: sigma = D B u", "비교 오차: (S - Reference) / |Reference| x 100"],
        ["NAFEMS LE1 타원형 막 형상과 경계조건을 구조화 사각망으로 생성", "QM6-EAS 평면응력 막요소를 사용", "7단계 메시를 수렴시키고 D점 인접 응력을 probe"],
        ["곡선 경계 좌표를 메시로 변환", "각 요소의 compatible·enhanced·drilling 강성을 조립", "희소 선형계 해석 후 Gauss점 응력 복원", "메시 수렴·평형·에너지·결정론적 hash를 동시에 판정"],
        [("src/solver/shell/membraneWorkflow.js", "구조화 막 메시·응력복원 workflow"), ("src/solver/shell/wallMembraneQm6.js", "QM6-EAS 막요소 강성·응력"), ("src/compute/elastic/factorSession.js", "결정론적 선형계 factor/solve"), ("verification/framework/benchmarks/strix21FirstBatch.js", "SB2 runner와 probe")],
        "단일 숫자만 맞춘 것이 아니라 메시 수렴과 에너지·평형까지 같은 evidence에 남긴다.",
        "현재 S probe는 D점 최근접 Gauss점 최대주응력이다. 공개 접선응력 probe와의 완전한 위치·성분 등가성 검토는 남아 있다.",
    ),
    "SB3": method(
        "Cook 막 왜곡망 휨",
        "심하게 찌그러진 사각망에서 막요소가 locking 없이 in-plane 휨을 재현하는지 확인한다.",
        ["요소 강성: K_e = K_compatible + K_EAS + K_drilling", "정규화 변위: u_bar = u E t / P"],
        ["Cook 사다리꼴 막을 왜곡된 Q4 메시로 생성", "고정 왼쪽 경계와 오른쪽 분포 전단하중 적용", "loaded-edge 중점 정규화 변위를 수렴 probe로 사용"],
        ["왜곡 기준과 Jacobian 품질 확인", "QM6-EAS 막요소 조립", "여러 메시 단계 실제 해석", "정규화 변위의 수렴값을 Reference·STRIX와 비교"],
        [("src/solver/shell/membraneRobustness.js", "Cook 형상·왜곡 메시 생성"), ("src/solver/shell/membraneWorkflow.js", "막요소 workflow·probe"), ("src/solver/shell/wallMembraneQm6.js", "QM6-EAS 막요소"), ("verification/framework/benchmarks/strix21FirstBatch.js", "SB3 수렴 runner")],
        "왜곡망이라는 불리한 조건에서도 요소식과 수렴 근거를 함께 제시한다.",
        "로컬 실행 결과이며 상용프로그램 raw 결과의 독립 custody는 아니다.",
    ),
    "SB5": method(
        "얇은 직사각형 판 휨",
        "얇은 판 한계에서 MITC4 판요소가 지지조건·등분포하중·집중하중 조합의 처짐계수를 재현하는지 확인한다.",
        ["판 휨강성: D = E t^3 / (12 (1 - nu^2))", "정규화 처짐계수: alpha = w D / (q a^4)"],
        ["정사각형·장방형 판과 단순지지·고정 경계를 표준 템플릿으로 생성", "MITC4 Reissner-Mindlin 판요소를 얇은 판 한계로 사용", "중앙 처짐과 메시 수렴을 probe"],
        ["판 메시와 경계 자유도 생성", "압력 또는 정확한 중앙 절점하중 조립", "MITC4 전단 보간으로 locking 억제", "8개 공개 대표행과 메시 수렴 판정"],
        [("src/solver/shell/plateWorkflow.js", "판 메시·하중·수렴 workflow"), ("src/solver/shell/slabPlateMitc4.js", "MITC4 판요소 강성"), ("src/solver/shell/plateBoundary.js", "단순지지·고정 경계 템플릿"), ("verification/framework/benchmarks/strix21FirstBatch.js", "SB5 8개 조합 runner")],
        "하나의 판 모델에 맞춘 코드가 아니라 형상·경계·하중을 바꿔 재사용 가능한 판 workflow임을 보여준다.",
        "표에는 대표행만 표시하지만 evidence에는 8개 하중·경계 조합이 포함된다.",
    ),
    "SB6": method(
        "두꺼운 직사각형 판 휨",
        "전단변형이 무시될 수 없는 두꺼운 판에서 Reissner-Mindlin/MITC4 응답을 검증한다.",
        ["굽힘강성: D = E t^3 / (12 (1 - nu^2))", "전단강성: K_s = kappa G t", "총 변형에너지 = 굽힘에너지 + 전단에너지"],
        ["두께비와 종횡비가 다른 6개 판 모델 생성", "전단보정계수 kappa = 5/6 적용", "중앙 처짐계수와 에너지 양성을 판정"],
        ["두께비별 판 메시 생성", "MITC4 굽힘·전단 채널 조립", "선형해석과 중앙 응답복원", "6개 Reference와 오차 판정"],
        [("src/solver/shell/plateWorkflow.js", "두꺼운 판 해석 workflow"), ("src/solver/shell/slabPlateMitc4.js", "MITC4 굽힘·전단 요소식"), ("src/solver/shell/thickPlateQualification.js", "두께비·전단 적격성 규칙"), ("verification/framework/benchmarks/strix21FirstBatch.js", "SB6 runner")],
        "얇은 판과 두꺼운 판을 같은 API에서 처리하면서 전단항을 명시적으로 분리한다.",
        "대표표에는 1x1-R10 행만 표시하며 전체 6행은 evidence를 참조한다.",
    ),
    "SB7": method(
        "Winkler 탄성지반 위 보",
        "보 강성과 연속 지반스프링이 결합된 문제의 중앙 처짐을 검증한다.",
        ["지배방정식: E I w'''' + k w = p(x)", "요소 지반강성: K_foundation = integral(N^T k N dx)"],
        ["단순지지 보를 여러 frame 요소로 분할", "각 요소에 local-y/local-z Winkler 선강성 연결", "중앙 집중하중과 중앙 처짐을 probe"],
        ["지반 property를 canonical schema로 생성", "보 강성과 consistent foundation 강성을 같은 전역행렬에 조립", "선형해석 후 지반반력과 중앙변위 복원", "폐형/CSI 기준값과 비교"],
        [("src/core/foundationSchema.js", "Winkler 지반속성 계약"), ("src/solver/foundation/winklerLine.js", "consistent 선형 지반강성"), ("src/solver/foundation/foundationRecovery.js", "지반반력 복원"), ("src/solver/linear3dAssembly.js", "보·지반 통합 조립")],
        "별도 외부 해석기가 아니라 S-Structures 전역 강성계에 탄성지반 요소가 직접 통합돼 있다.",
        "이 사례는 선형 Winkler 모델 범위이며 비선형 지반·접촉은 별도 기능이다.",
    ),
    "SB8": method(
        "Timoshenko 깊은 보 고유진동",
        "전단변형과 회전관성이 큰 깊은 보의 고유진동수를 검증한다.",
        ["Timoshenko 전단계수: phi = 12 E I / (kappa G A L^2)", "고유치문제: K phi_n = omega_n^2 M phi_n", "주파수: f_n = omega_n / (2 pi)"],
        ["깊은 단순지지 보를 Timoshenko frame 요소로 분할", "일관/집중 질량과 전단보정계수 적용", "저차 6개 고유진동수와 잔차를 probe"],
        ["Timoshenko 요소 강성·질량 생성", "전역 K·M 조립", "일반화 고유치 해석", "모드별 주파수·잔차·질량직교성 판정"],
        [("src/solver/timoshenko.js", "전단유연 보 요소식"), ("src/solver/linear3dAssembly.js", "전역 강성 조립"), ("src/dynamics/modal.js", "일반화 고유치·모드 정규화"), ("verification/framework/benchmarks/strix21FirstBatch.js", "SB8 modal runner")],
        "정적 휨뿐 아니라 동일 요소의 질량·전단효과가 동적 고유치에서도 닫히는지 확인한다.",
        "표에는 1차 주파수만 표시하며 6개 모드 적격성은 evidence에 보존한다.",
    ),
    "SB9": method(
        "등분포하중 강재 포털 프레임",
        "축변형과 휨이 함께 발생하는 2D 포털 프레임의 중앙 처짐을 검증한다.",
        ["전역 평형: K u = f", "총 변위 = 휨 성분 + 축변형 성분", "분포하중은 consistent fixed-end force로 변환"],
        ["기둥 2개와 보 1개의 강접 frame 모델", "보에 등분포하중 적용", "중앙 station의 합성 처짐과 성분합 closure를 probe"],
        ["부재 local axis·강성 생성", "분포하중 fixed-end force 조립", "전역 선형해석", "station 변위·부재력 복원과 성분합 검증"],
        [("src/solver/linear3d.js", "3D 선형 frame 해석"), ("src/solver/linear3dAssembly.js", "frame·하중 전역 조립"), ("src/solver/linear3dRecovery.js", "station 응답·부재력 복원"), ("verification/framework/benchmarks/strix21FirstBatch.js", "SB9 runner")],
        "축변형과 휨을 별도 성분으로 계산한 뒤 합성값 closure를 검증해 결과 설명력이 높다.",
        "평면 프레임 benchmark이며 좌굴·재료비선형은 포함하지 않는다.",
    ),
    "SB10": method(
        "비대칭 2부재 트러스",
        "비대칭 형상에서 좌표변환과 축력 부호·크기가 정확한지 검증한다.",
        ["트러스 축강성: k = E A / L", "축변형: delta_L = n^T (u_j - u_i)", "축력: N = E A delta_L / L"],
        ["서로 다른 각도의 2개 truss 부재로 절점 평형 구성", "외력과 지지조건을 정정 구조로 설정", "가새 E1 축력 절댓값을 공개 probe와 비교"],
        ["부재 방향벡터와 local axial DOF 계산", "global stiffness로 변환·조립", "절점변위 해석", "signed compression을 복원하고 공개표와 같이 magnitude 비교"],
        [("src/solver/linear3dElement.js", "truss 요소 축강성·좌표변환"), ("src/solver/linear3dAssembly.js", "전역 조립"), ("src/solver/linear3dRecovery.js", "축력 복원"), ("verification/framework/benchmarks/strix21FirstBatch.js", "SB10 runner")],
        "간단한 정정문제로 좌표변환·부호·결과복원의 기본 신뢰성을 명확하게 보여준다.",
        "공개 표가 magnitude를 사용하므로 부호는 별도 evidence에서 확인한다.",
    ),
    "SB12": method(
        "Beta-angle 6자유도 탄성링크",
        "임의 경사의 two-node elastic link가 beta angle로 정의한 국부축을 전역 6자유도에 정확히 변환하는지 확인한다.",
        ["좌표변환: K_global = T^T K_local T", "링크력: q_local = K_local delta_local", "전역력: f_global = T^T q_local"],
        ["두 절점을 잇는 경사 6-DOF link와 beta angle frame 구성", "병진 3축·회전 3축 강성을 local diagonal로 정의", "전역 변위·링크력·에너지 closure를 내부 fixture에서 검증"],
        ["경사축과 beta angle로 직교 local frame 생성", "12x12 two-node link 강성 조립", "전역해석 후 local deformation·force 복원", "좌표변환·대칭성·에너지 probe 판정"],
        [("src/solver/link/elasticLink6dof.js", "6-DOF link 강성·응답복원"), ("src/solver/linear3dAssembly.js", "전역 링크 조립"), ("verification/framework/benchmarks/strix21Completion.js", "SB12 production fixture"), ("tests/p18-link-pmm.mjs", "링크·PMM 회귀검사")],
        "6자유도 링크를 별도 모듈로 분리해 방향·beta angle·강성축을 독립 검증할 수 있다.",
        "공개 SB12의 N2 좌표, 두 병진강성, 전체 6성분 하중이 PDF에 없어 0.152961 mm 동일모델 수치는 아직 잠기지 않았다.",
    ),
    "PD1": method(
        "P-Delta 인장강성 효과",
        "축력에 따른 기하강성이 횡방향 변위에 미치는 2차효과를 검증한다.",
        ["접선강성: K_t = K_e + K_g(N)", "반복평형: R(u) = f_ext - f_int(u) = 0", "인장축력은 횡강성을 증가시키고 처짐을 감소"],
        ["초기 횡하중과 축 인장력이 작용하는 frame 모델", "1차해석을 seed로 사용하고 축력 기반 geometric stiffness 갱신", "인장 유무의 끝단 변위 차이를 probe"],
        ["1차 선형상태 계산", "현재 축력으로 geometric tangent 생성", "증분-반복 P-Delta 평형", "변위·평형잔차·단계수렴 판정"],
        [("src/solver/pdelta/secondOrder.js", "2차 P-Delta 반복해석"), ("src/solver/pdelta/tangentStiffness.js", "축력 기반 geometric stiffness"), ("src/solver/pdelta/firstOrderSeed.js", "초기 1차해석 상태"), ("verification/framework/benchmarks/strix21FirstBatch.js", "PD1 runner")],
        "선형강성과 기하강성을 분리해 축력 효과가 어디서 발생하는지 코드와 식으로 추적할 수 있다.",
        "대표 수치는 허용오차에 들지만 단계별 work-balance evidence가 부족해 qualification은 보류다.",
    ),
    "SM5": method(
        "Bathe-Wilson 프레임 고유치",
        "다층 다경간 프레임의 저차 고유치를 일반화 고유치 해석으로 재현한다.",
        ["일반화 고유치: K phi_n = lambda_n M phi_n", "lambda_n = omega_n^2", "질량정규화: phi_n^T M phi_n = 1"],
        ["10경간 9층 평면 frame과 집중질량 구성", "frame 강성과 질량행렬을 조립", "저차 고유값 3개를 Reference와 비교"],
        ["frame topology·단면·질량 생성", "K·M 조립", "대칭 일반화 고유치 solver 실행", "고유값·잔차·정렬을 판정"],
        [("src/solver/linear3dAssembly.js", "프레임 강성 조립"), ("src/dynamics/modal.js", "일반화 고유치·정규화"), ("src/compute/eigen/requestedModes.js", "요청 모드 eigensolve"), ("verification/framework/benchmarks/strix21FirstBatch.js", "SM5 runner")],
        "대규모 프레임 topology와 modal solver가 분리돼 다른 동적 문제에도 같은 경로를 재사용한다.",
        "고유값은 통과했지만 독립 reference mode vector가 없어 mode-shape qualification은 보류다.",
    ),
    "SM5b": method(
        "편심 강체격막 고유치 축약",
        "층 강체격막의 병진·회전 자유도를 축약해 편심 구조의 고유치를 계산하는 기능을 검증한다.",
        ["운동학 축약: u_full = T q_floor", "축약행렬: K_r = T^T K T, M_r = T^T M T", "축약 고유치: K_r phi = lambda M_r phi"],
        ["각 층을 Ux, Uy, Rz 3자유도 강체격막으로 표현", "편심 기둥 위치가 회전관성·비틀림강성에 반영되도록 mapping", "내부 완전 fixture에서 축약·full-system parity를 검증"],
        ["절점 자유도에서 격막 master 좌표로 T 생성", "K·M 동시 축약", "고유치 해석", "축약 전후 고유치·질량·직교성 probe"],
        [("src/dynamics/modalDiaphragm.js", "강체격막 modal 축약"), ("src/solver/diaphragmReduce.js", "T^T K T 축약"), ("src/solver/diaphragmDofMap.js", "격막 자유도 mapping"), ("src/dynamics/modal.js", "축약 고유치 해석")],
        "강체격막 축약을 별도 모듈로 둬 질량·강성·편심 mapping을 독립 감사할 수 있다.",
        "공개 문제의 층질량과 corner-to-inertia multiplier mapping이 없어 STRIX 2070.117026 동일모델은 미실행이다.",
    ),
    "SM6": method(
        "ASME 3D pipe-frame 고유치",
        "3차원 배관 프레임의 축·휨·비틀림·전단과 집중질량을 포함한 고유치 경로를 검증한다.",
        ["3D frame: K_global = sum(T_e^T K_e T_e)", "고유치: K phi = omega^2 M phi", "Timoshenko 전단유연성은 kappa G A 항으로 반영"],
        ["3D 고정단 pipe frame과 joint lumped mass 구성", "local axis·비틀림·양축 휨·전단변형 포함", "내부 LARSA E08 fixture의 주파수와 비교"],
        ["3D topology와 local axis 생성", "Timoshenko frame K·M 조립", "modal solve와 모드 정렬", "주파수·잔차·질량직교성 판정"],
        [("src/solver/linear3dAssembly.js", "3D frame 전역 조립"), ("src/solver/timoshenko.js", "전단유연 frame 식"), ("src/dynamics/modal.js", "고유치·모드복원"), ("verification/framework/benchmarks/strix21Completion.js", "SM6 production fixture")],
        "평면 보가 아니라 3D local axis·비틀림·집중질량까지 같은 결정론적 modal pipeline에서 처리한다.",
        "STRIX 공개 모델의 정확한 18절점 좌표·연결정보가 없어 공식 동일모델 수치는 미실행이다.",
    ),
    "SR1": method(
        "2D 프레임 응답스펙트럼",
        "모드해석, 참여계수, 스펙트럼 응답, SRSS/CQC 조합이 연결된 RSA 경로를 검증한다.",
        ["참여계수: Gamma_n = (phi_n^T M r) / (phi_n^T M phi_n)", "모드응답: u_n = Gamma_n phi_n S_d(T_n)", "SRSS: R = sqrt(sum(R_n^2)); CQC: R = sqrt(sum_i sum_j rho_ij R_i R_j)"],
        ["2층 1경간 평면 rigid frame과 질량 구성", "X방향 스펙트럼과 SRSS/CQC 두 방법 실행", "주기·참여질량·절점응답·부재력을 내부 fixture에서 검증"],
        ["선형 modal solve", "모드별 참여계수·유효질량 계산", "스펙트럼 보간과 모드응답 생성", "SRSS/CQC 조합 후 부재력 복원·평형 closure"],
        [("src/dynamics/modal.js", "모드·참여계수"), ("src/dynamics/modalCombination.js", "SRSS/CQC 조합"), ("src/results/rsa/memberForces.js", "RSA 부재력 복원"), ("verification/framework/benchmarks/strix21Completion.js", "SR1 engine fixture")],
        "모드해석부터 부재력복원까지 각 단계가 모듈과 evidence로 분리돼 AI가 계산 근거를 설명할 수 있다.",
        "공개 문제의 절대질량, 전체 스펙트럼 ordinate, 단면과 8요소 topology가 없어 공식 동일모델은 미실행이다.",
    ),
    "SR2": method(
        "3D 편심 강체격막 응답스펙트럼",
        "편심 강체격막의 병진-비틀림 모드와 3D 응답스펙트럼 조합을 검증한다.",
        ["격막 운동학: u_i = u_c + theta_z x r_i", "축약: K_r = T^T K T, M_r = T^T M T", "CQC 조합: R^2 = sum_i sum_j rho_ij R_i R_j"],
        ["3D 편심 평면과 층별 Ux, Uy, Rz 격막 자유도", "6-DOF 질량과 다방향 응답스펙트럼", "4개 모드와 조합 부재력을 내부 fixture에서 검증"],
        ["격막 constraint와 mass mapping", "축약 modal solve", "방향별 스펙트럼 응답·CQC 조합", "격막 force·frame member force 복원"],
        [("src/dynamics/modalDiaphragm.js", "편심 강체격막 modal"), ("src/solver/diaphragmDofMap.js", "격막 DOF mapping"), ("src/dynamics/modalCombination.js", "다모드 조합"), ("src/results/rsa/memberForces.js", "3D 부재력 복원")],
        "3D 편심과 비틀림을 단순 보정계수가 아니라 실제 격막 자유도·질량·모드로 계산한다.",
        "공개 문제의 전체 단면, 층질량/Jz, 연결 topology와 스펙트럼 입력이 없어 공식 동일모델은 미실행이다.",
    ),
    "SR2b": method(
        "3D L형 가새골조 응답스펙트럼",
        "비정형 L형 평면과 가새 축력복원을 포함한 3D RSA 경로를 검증한다.",
        ["고유치: K phi = omega^2 M phi", "모드별 가새축력: N_n = E A delta_L,n / L", "최종응답은 SRSS/CQC로 모드조합"],
        ["L형 3D frame-brace topology와 다방향 질량 구성", "brace axial response를 결과 probe로 포함", "내부 스펙트럼 fixture에서 모드·조합·축력복원 검증"],
        ["3D frame/truss 혼합 조립", "modal·참여질량 계산", "스펙트럼 응답과 모드조합", "가새 local axial force 복원"],
        [("src/solver/linear3dAssembly.js", "frame·truss 혼합 조립"), ("src/dynamics/modal.js", "3D modal solve"), ("src/dynamics/modalCombination.js", "응답스펙트럼 조합"), ("src/results/rsa/memberForces.js", "가새 축력복원")],
        "비정형 형상과 서로 다른 요소형식의 결과를 하나의 RSA pipeline에서 복원한다.",
        "정확한 L형 평면·부재번호 mapping과 El Centro 스펙트럼이 없어 공식 동일모델은 미실행이다.",
    ),
    "SP1": method(
        "모멘트힌지 외팔보 푸시오버",
        "집중소성 모멘트힌지와 corotational frame의 pre-peak 푸시오버 self-consistency를 검증한다.",
        ["정역학: M_base = P L", "이론 끝단변위: u = P L^3 / (3 E I_mod) + L theta_hinge(M)", "판정: max |u_engine - u_theory| / |u_theory| < 1%"],
        ["길이 24 in 외팔보와 고정단 모멘트힌지", "My-Mc-Mr-theta backbone을 공개 값으로 등록", "생산 load-control pushover의 모든 pre-peak accepted step을 비교"],
        ["hinge property와 양·음 backbone 생성", "corotational 3D frame·zero-length hinge 조립", "중력 초기상태 후 증분 Newton 평형", "각 accepted step의 M=P L, hinge rotation, tip displacement self-consistency 판정"],
        [("src/nonlinear/pushover/productionPushover.js", "생산 MDOF pushover driver"), ("src/nonlinear/properties/hingeRegistry.js", "힌지 backbone 등록·검증"), ("src/nonlinear/elements/hingedFrame3d.js", "corotational frame-힌지 결합"), ("verification/framework/benchmarks/strix21Completion.js", "SP1 production model runner")],
        "GUI 결과 하나가 아니라 매 증분의 평형·힌지상태·변위 일관성을 자동 검사한다.",
        "동등한 공개 판정기준 PASS다. Point 2 목표변위를 displacement-control 입력으로 넣은 뒤 같은 변위를 결과로 재사용하는 순환검증은 하지 않았다.",
    ),
    "SH1": method(
        "3D P-My-Mz 기둥힌지",
        "축력-양축휨 상호작용, FEMA backbone, PCHIP 용량보간과 zero-length 요소역학을 검증한다.",
        ["Bresler형 상호작용: Phi = (|My/Myc|^a + |Mz/Mzc|^a)^(1/a)", "용량 투영: beta = min(1, 1/Phi)", "축력별 용량은 monotone PCHIP로 보간"],
        ["두 coincident node 사이 6-DOF zero-length P-M-M hinge", "단축 backbone·unload·대칭/비대칭 biaxial loading·축력별 용량 query", "공개 checkpoint와 내부 불변량을 probe"],
        ["P-M-M property와 축력별 capacity table 생성", "monotone PCHIP 보간", "양축 trial moment를 Bresler surface로 투영", "zero-length 전역 12-DOF force/tangent·energy closure 검증"],
        [("src/nonlinear/materials/pmmHinge3d.js", "P-My-Mz constitutive law"), ("src/nonlinear/math/monotonePchip.js", "축력별 용량 monotone 보간"), ("src/nonlinear/elements/zeroLengthPmmHinge3d.js", "6-DOF zero-length 요소"), ("verification/framework/benchmarks/strix21Completion.js", "SH1 checkpoint runner")],
        "단국대 자체개발 비선형 요소를 재료식, 보간, 상호작용, 전역요소 단계로 분해해 검증한다.",
        "SH1은 DCR 자체 요소라 동일한 제3자 프로그램 benchmark가 없고, 공개 물리식·내부 명세 checkpoint 수준의 판정이다.",
    ),
    "TH1": method(
        "Newmark 평균가속도 시간이력",
        "선형 직접적분의 정확도, 안정성, 시간간격 수렴차수를 SDOF 폐형/독립 RK4 기준으로 검증한다.",
        ["Newmark 평균가속도: beta = 1/4, gamma = 1/2", "M u_ddot + C u_dot + K u = -M r a_g(t)", "시간간격 오차는 O(dt^2)로 감소"],
        ["주기 1 s SDOF와 공진 sine 지반가속도", "감쇠비와 dt를 바꾸는 수렴 sweep", "peak 상대변위·energy·2차 수렴차수를 probe"],
        ["ground motion을 piecewise-linear series로 고정", "Newmark effective stiffness와 step recurrence 계산", "독립 fixed-substep RK4 기준 생성", "dt halving에 따른 peak error와 대표 수렴차수 판정"],
        [("src/dynamics/linearDirectIntegration.js", "Newmark 직접적분"), ("src/dynamics/groundMotionSeries.js", "지반운동 보간·입력계약"), ("verification/framework/benchmarks/strix21Completion.js", "TH1 SDOF·RK4 비교 runner"), ("tests/p18-th1-sp1.mjs", "결정론적 회귀검사")],
        "해석결과뿐 아니라 이론적으로 기대되는 O(dt^2) 수렴차수까지 자동 측정한다.",
        "공개 SDOF checkpoint 검증이며 전체 비선형 MDOF 시간이력의 외부 상용프로그램 교차검증은 별도 단계다.",
    ),
    "P3S2": method(
        "Shell 안정화 파라미터 민감도",
        "인공 회전안정화가 zero-energy mode만 제거하고 물리 지배모드의 주기를 바꾸지 않는지 검증한다.",
        ["주기 민감도: eta_T = max |T(theta) - T_base| / T_base", "모드 추적: MAC_M = |phi_a^T M phi_b|^2 / ((phi_a^T M phi_a)(phi_b^T M phi_b))", "허용기준: eta_T < 0.5%"],
        ["공개 3 m x 9 m x 0.2 m 벽체와 3 columns x 6 rows membrane mesh", "drilling alpha와 unsupported-rotation floor ratio를 각각 100배 범위 sweep", "1x-2x-4x 메시와 지배모드 MAC를 함께 확인"],
        ["물리·drilling·rotation-floor 강성 채널 분리", "각 파라미터 조합에서 실제 static/modal solve", "질량가중 MAC로 모드 matching", "최대 주기변화·안정화에너지·null-mode·메시수렴 판정"],
        [("src/solver/shell/realStabilizationQualification.js", "실제 solve 기반 sensitivity harness"), ("src/solver/shell/shellStabilization.js", "회전 floor 정책·null-mode 분류"), ("src/solver/shell/wallMembraneQm6.js", "membrane·drilling 강성"), ("verification/framework/benchmarks/additionalComparison.js", "공개 3x6 형상 P18A runner")],
        "사용자가 임의로 정한 안정화 상수가 물리결과를 오염시키지 않는다는 것을 모드·에너지·null-space 관점에서 동시에 증명한다.",
        "동등 허용기준 PASS다. STRIX plate-mode와 literal rotFloor/drillingStab 단위의 완전 동일성은 주장하지 않는다.",
    ),
}


STATUS_EXPLANATION = {
    "numeric": "공개 대표 물리량을 S-Structures 실제 출력과 직접 비교한 로컬 공학 PASS",
    "numeric_blocked": "대표 수치는 허용오차에 들지만 추가 qualification evidence가 남은 상태",
    "checkpoint": "공개 checkpoint를 새 엔진 모듈로 재현한 엔진 checkpoint PASS",
    "criterion": "공개 문제와 같은 종류의 판정식·허용한계를 적용한 동등 판정기준 PASS",
    "engine_only": "필요한 핵심 엔진 모듈은 내부 probe를 통과했으나 공개 입력 source lock이 부족한 상태",
}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def fmt_number(value, unit=""):
    if value is None:
        return "-"
    value = float(value)
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


def fmt_pct(value):
    if value is None:
        return "-"
    if abs(float(value)) < 1e-6:
        return "~0.000000%"
    if abs(float(value)) < 0.01:
        return f"{float(value):+.6f}%"
    return f"{float(value):+.3f}%"


def case_folder_map():
    result = {}
    for folder in sorted(CASE_ROOT.iterdir()):
        if not folder.is_dir() or not folder.name[:2].isdigit():
            continue
        parts = folder.name.split("_")
        if len(parts) >= 2:
            result[parts[1]] = folder
    return result


def render_result_table(row):
    reference = f"≤ {fmt_number(row['reference'], row['unit'])}" if row["lane"] == "criterion" else fmt_number(row["reference"], row["unit"])
    delta = f"허용한계의 {row['gateUtilizationPct']:.3f}% 사용" if row["lane"] == "criterion" else fmt_pct(row.get("errorVsReferencePct"))
    return [
        ["STRIX", fmt_number(row["strix"], row["unit"])],
        ["기준값", reference],
        ["S-Structures", fmt_number(row.get("sStructures"), row["unit"])],
        ["S vs 기준", delta],
        ["판정", row["statusLabel"]],
    ]


def claim_text(row):
    if row["lane"] == "numeric":
        return "공개 대표 물리량의 로컬 직접비교 결과를 제시할 수 있다. 외부 공식 qualification 주장은 아니다."
    if row["lane"] == "numeric_blocked":
        return "대표 수치의 일치는 제시할 수 있으나, 추가 적격성 evidence가 잠길 때까지 공식 PASS로 승격하지 않는다."
    if row["lane"] == "checkpoint":
        return "엔진 수식과 공개 checkpoint 재현은 제시할 수 있으나, 제3자 상용프로그램의 독립 실행 결과로 확대하지 않는다."
    if row["lane"] == "criterion":
        return "동일한 종류의 판정식과 허용한계를 통과했음을 제시한다. 절대응답 전체가 STRIX와 동일하다는 주장은 아니다."
    return "핵심 엔진 기능의 구현·내부 검증은 제시할 수 있다. 공개 입력이 완전하지 않아 STRIX 대표값과 동일모델 비교는 제시하지 않는다."


def markdown_case(row, meta, report_path):
    result_rows = render_result_table(row)
    modules = "\n".join(f"| `{path}` | {role} |" for path, role in meta["modules"])
    equations = "\n".join(f"- `{value}`" for value in meta["equations"])
    modeling = "\n".join(f"- {value}" for value in meta["modeling"])
    workflow = "\n".join(f"{index}. {value}" for index, value in enumerate(meta["workflow"], start=1))
    results = "\n".join(f"| {key} | {value} |" for key, value in result_rows)
    evidence = row.get("evidencePath") or f"S-Structures-main/verification/benchmarks/strix21/milestones/P18/{row['id']}/runs/p18-engine-result.json"
    return f"""# {row['id']} - {meta['titleKo']} 해석엔진 설명보고서

기준일: {GENERATED_AT}  
분류: {row['category']}  
현재 판정: **{row['statusLabel']}**

## 1. 한눈에 보는 결론

{STATUS_EXPLANATION[row['lane']]}.

| 비교항목 | 값 |
|---|---:|
{results}

**설득 가능한 주장:** {claim_text(row)}

## 2. 무엇을 검증하는 문제인가

{meta['objective']}

대표 결과 물리량은 **{row['quantity']}**이며 단위는 `{row['unit']}`이다.

## 3. 해석엔진에서 사용한 식

{equations}

이 식은 결과를 사후 보정하는 용도가 아니라 요소 강성, 전역 평형, 응답복원 또는 판정 probe에 직접 연결된다.

## 4. S-Structures 모델링 방법

{modeling}

## 5. 문제를 해결한 실행 절차

{workflow}

## 6. 사용한 코드 모듈

| 코드 모듈 | 역할 |
|---|---|
{modules}

모듈을 나눈 이유는 AI 에이전트가 모델 생성, 요소식, solver, 결과복원, 검증 판정을 각각 독립적으로 읽고 수정·재실행할 수 있게 하기 위해서다.

## 7. 이 사례가 보여주는 S-Structures의 강점

{meta['strength']}

- 입력과 판정 기준이 파일로 남아 재실행 가능하다.
- 계산에 사용한 코드 모듈을 결과 보고서에서 역추적할 수 있다.
- 결과가 맞지 않으면 모델, 요소식, solver, probe 중 어느 층을 수정해야 하는지 분리할 수 있다.

## 8. 근거와 한계

- 실행 근거: `{evidence}`
- 문제별 원자료·모델·기준값·실행결과: `{report_path.parent.parent.relative_to(VAULT_ROOT).as_posix()}/`
- 한계: {meta['limitation']}
- 외부 공식 PASS 주장: **없음**

## 9. 재현 방법

통합 evidence 생성기는 `tools/run-p18-strix21-completion.mjs`, `tools/run-p18a-additional-comparisons.mjs` 및 문제별 runner를 사용한다. 이 설명보고서는 `tools/generate-benchmark-engine-report-package.py`가 비교 데이터와 코드 모듈 존재 여부를 확인한 뒤 생성한다.
"""


def supplemental_reports(document):
    rows = document["supplemental"]["rows"]
    xv1 = next(row for row in rows if row["id"] == "XV1 M16")
    xv2 = next(row for row in rows if row["id"] == "XV2")
    xv1_meta = method(
        "XV1 외팔보 전단벽 추가 교차검증",
        "막요소 벽체가 flexure-dominated cantilever에서 Timoshenko 이론과 Program A에 수렴하는지 확인한다.",
        ["delta = P H^3 / (3 E I) + 1.2 P H / (G A)", "메시 오차 = (delta_h - delta_ref) / |delta_ref| x 100"],
        ["3.0 m x 8.55 m x 0.2 m 벽체", "E=27515 MPa, nu=0.167, 상단 100 kN", "M1, M2, M4, M8, M16 membrane 메시를 실제 실행"],
        ["각 메시의 절점·Q4 membrane 생성", "상단하중을 top-edge 절점에 균등분배", "전역 선형해석과 상단 평균변위 복원", "Program A, STRIX, Timoshenko 기준과 비교"],
        [("verification/framework/benchmarks/additionalComparison.js", "XV1 메시 sweep runner"), ("src/solver/shell/wallMembraneQm6.js", "QM6-EAS membrane 요소"), ("src/solver/linear3d.js", "전역 선형해석"), ("src/solver/shell/shellAssembly.js", "shell 전역 조립")],
        "동일한 공개 형상에서 practice mesh는 Program A와 사실상 일치하고, 세분망은 폐형해에 0.234% 이내로 접근한다.",
        "Program A의 제품명과 공유 MGT raw 파일은 공개되지 않았다. 공식 21개와 별도 교차검증이다.",
    )
    xv2_meta = method(
        "XV2 전이보 위 벽체 추가 교차검증",
        "벽-전이보 composite action과 메시 민감도가 전이보 전단력에 미치는 영향을 검증하려는 사례다.",
        ["전역 평형: K u = f", "전이보 전단력은 station end-force gradient와 element recovery에서 산정", "메시 수렴한 목표값: 162.5 kN"],
        ["5층 벽체, 600 x 1600 mm 전이보, 600 mm 지지폭", "총 1000 kN 수직하중", "x=1000 mm station 전단력 probe"],
        ["공개 PDF 입력을 source inventory로 분해", "공유 MGT·연결 topology·load mapping·station sign을 확인", "입력이 잠기면 M1-M16 실제 해석", "전단력 series와 Richardson limit 비교"],
        [("src/solver/shell/wallMembraneQm6.js", "벽 membrane 요소"), ("src/solver/linear3dAssembly.js", "벽·보 전역 조립"), ("src/solver/linear3dRecovery.js", "보 station force 복원"), ("verification/framework/benchmarks/additionalComparison.js", "입력차단 계약")],
        "숫자를 역산해 억지 모델을 만들지 않고, source lock 전에는 입력차단으로 남기는 fail-closed 검증 문화를 보여준다.",
        "DCR_wall_benchmark.mgt, 정확한 벽-보 연결, 하중 위치, shear recovery station·부호규약이 없어 현재 미실행이다.",
    )
    return [
        {
            "id": "XV1",
            "title": xv1_meta["titleKo"],
            "meta": xv1_meta,
            "status": "PASS",
            "result": [
                ["STRIX M16", fmt_number(xv1["strix"], xv1["unit"])],
                ["Program A M16", fmt_number(xv1["programA"], xv1["unit"])],
                ["Timoshenko", fmt_number(xv1["reference"], xv1["unit"])],
                ["S-Structures M16", fmt_number(xv1["sStructures"], xv1["unit"])],
                ["S vs 이론", fmt_pct(xv1["errorVsReferencePct"])],
            ],
        },
        {
            "id": "XV2",
            "title": xv2_meta["titleKo"],
            "meta": xv2_meta,
            "status": "입력 미완료",
            "result": [["기준 목표", fmt_number(xv2["reference"], xv2["unit"])], ["S-Structures", "-"]],
        },
    ]


def markdown_supplemental(item):
    meta = item["meta"]
    equations = "\n".join(f"- `{value}`" for value in meta["equations"])
    modeling = "\n".join(f"- {value}" for value in meta["modeling"])
    workflow = "\n".join(f"{index}. {value}" for index, value in enumerate(meta["workflow"], start=1))
    modules = "\n".join(f"| `{path}` | {role} |" for path, role in meta["modules"])
    results = "\n".join(f"| {key} | {value} |" for key, value in item["result"])
    return f"""# {item['id']} - {item['title']}

기준일: {GENERATED_AT}  
분류: 공식 21개와 별도 Cross-Code 사례  
판정: **{item['status']}**

## 검증 목적

{meta['objective']}

## 사용한 식

{equations}

## 모델링

{modeling}

## 실행 절차

{workflow}

## 코드 모듈

| 모듈 | 역할 |
|---|---|
{modules}

## 결과

| 항목 | 값 |
|---|---:|
{results}

## 설득 포인트

{meta['strength']}

## 한계

{meta['limitation']}

근거: `S-Structures-main/verification/benchmarks/strix21/milestones/P18A/p18a-additional-comparison-evidence.json`
"""


def validate_methods(rows):
    ids = [row["id"] for row in rows]
    missing = sorted(set(ids) - set(METHODS))
    extra = sorted(set(METHODS) - set(ids))
    if missing or extra:
        raise AssertionError(f"Method metadata mismatch: missing={missing}, extra={extra}")
    missing_modules = []
    for case_id, meta in METHODS.items():
        for path, _role in meta["modules"]:
            if not (REPO_ROOT / path).is_file():
                missing_modules.append(f"{case_id}:{path}")
    if missing_modules:
        raise AssertionError(f"Module paths do not exist: {missing_modules}")
    expected_schematics = set(ids) | {"XV1", "XV2"}
    if set(SCHEMATIC_LABELS) != expected_schematics:
        raise AssertionError(f"Schematic metadata mismatch: expected={sorted(expected_schematics)}, actual={sorted(SCHEMATIC_LABELS)}")


def write_package(document):
    rows = document["cases"]
    folders = case_folder_map()
    validate_methods(rows)
    COLLECTION_ROOT.mkdir(parents=True, exist_ok=True)
    generated_files = []
    index_rows = []

    for position, row in enumerate(rows, start=1):
        folder = folders.get(row["id"])
        if folder is None:
            raise AssertionError(f"Case folder not found: {row['id']}")
        report_dir = folder / "07_해석엔진_설명"
        report_dir.mkdir(parents=True, exist_ok=True)
        report_path = report_dir / f"{row['id']}_해석엔진_설명보고서.md"
        report_path.write_text(markdown_case(row, METHODS[row["id"]], report_path), encoding="utf-8")
        generated_files.append(report_path)
        index_rows.append({
            "order": position,
            "id": row["id"],
            "titleKo": METHODS[row["id"]]["titleKo"],
            "status": row["statusLabel"],
            "lane": row["lane"],
            "sStructures": row.get("sStructures"),
            "reference": row.get("reference"),
            "unit": row.get("unit"),
            "errorVsReferencePct": row.get("errorVsReferencePct"),
            "reportPath": report_path.relative_to(VAULT_ROOT).as_posix(),
            "evidencePath": row.get("evidencePath"),
            "modules": [path for path, _role in METHODS[row["id"]]["modules"]],
        })

    supplemental_dir = COLLECTION_ROOT / "02_추가_교차검증"
    supplemental_dir.mkdir(parents=True, exist_ok=True)
    supplemental = supplemental_reports(document)
    for item in supplemental:
        path = supplemental_dir / f"{item['id']}_해석엔진_설명보고서.md"
        path.write_text(markdown_supplemental(item), encoding="utf-8")
        generated_files.append(path)

    index_json = COLLECTION_ROOT / "벤치마크_해석엔진_색인.json"
    index_json.write_text(json.dumps({
        "schemaVersion": "benchmark-engine-explanation-index-v1",
        "reportRevision": "R2_MODEL_GEOMETRY",
        "generatedAt": GENERATED_AT,
        "counts": document["counts"],
        "official21": index_rows,
        "supplemental": [{"id": item["id"], "status": item["status"], "reportPath": (supplemental_dir / f"{item['id']}_해석엔진_설명보고서.md").relative_to(VAULT_ROOT).as_posix()} for item in supplemental],
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    generated_files.append(index_json)

    index_csv = COLLECTION_ROOT / "벤치마크_해석엔진_색인.csv"
    with index_csv.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["order", "id", "titleKo", "status", "lane", "sStructures", "reference", "unit", "errorVsReferencePct", "reportPath", "evidencePath"])
        writer.writeheader()
        for row in index_rows:
            writer.writerow({key: row.get(key) for key in writer.fieldnames})
    generated_files.append(index_csv)

    readme = COLLECTION_ROOT / "README.md"
    readme.write_text(render_readme(document, index_rows, supplemental), encoding="utf-8")
    generated_files.append(readme)

    master_md = COLLECTION_ROOT / "S-Structures_벤치마크_해석엔진_통합보고서.md"
    master_md.write_text(render_master_markdown(document, index_rows, supplemental), encoding="utf-8")
    generated_files.append(master_md)

    summary_md = COLLECTION_ROOT / "S-Structures_검증_1장_요약보고서.md"
    summary_md.write_text(render_summary_markdown(document), encoding="utf-8")
    generated_files.append(summary_md)

    build_master_pdf(document, supplemental)
    build_summary_pdf(document)
    generated_files.extend([MASTER_PDF, SUMMARY_PDF])

    manifest = COLLECTION_ROOT / "package-manifest.json"
    manifest.write_text(json.dumps({
        "schemaVersion": "benchmark-engine-explanation-package-v2",
        "reportRevision": "R2_MODEL_GEOMETRY",
        "generatedAt": GENERATED_AT,
        "policy": "NON_DESTRUCTIVE_ADDITIVE_PACKAGE",
        "counts": {"officialReports": len(rows), "supplementalReports": len(supplemental), "finalPdfs": 2},
        "files": [
            {"path": path.relative_to(VAULT_ROOT).as_posix(), "bytes": path.stat().st_size, "sha256": sha256(path)}
            for path in generated_files
        ],
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    generated_files.append(manifest)
    return generated_files


def render_readme(document, index_rows, supplemental):
    lines = [
        "# S-Structures 벤치마크 설득자료 모음",
        "",
        f"기준일: {GENERATED_AT}",
        "",
        "기존 원자료와 실행 evidence는 이동·삭제하지 않았다. 각 기존 문제 폴더에 `07_해석엔진_설명/`을 추가하고 이 폴더에는 전체 색인과 요약본을 모았다.",
        "",
        "## 현재 검증 집계",
        "",
        "- 로컬 공학 수치비교 PASS: 9",
        "- 수치 PASS / 적격성 보류: 2",
        "- 엔진 checkpoint PASS: 2",
        "- 동등 판정기준 PASS: 2",
        "- 공개 입력 미완료: 6",
        "- 외부 공식 PASS 주장: 0/21",
        "- 모델링 형상도: 공식 21개 + 추가 교차검증 2개",
        "",
        "## 폴더 구조",
        "",
        "```text",
        "STRIX-21-검증/",
        "├─ 00_설득자료_모음/        # 이 안내, 색인, 통합·1장 요약",
        "├─ 01_SB1_.../07_해석엔진_설명/",
        "├─ ...",
        "├─ 21_TH1_.../07_해석엔진_설명/",
        "└─ 기존 01_원자료~06_검토  # 보존",
        "```",
        "",
        "## 공식 21개 보고서",
        "",
        "| 순번 | ID | 보고서 | 현재 판정 |",
        "|---:|---|---|---|",
    ]
    for row in index_rows:
        rel = Path(row["reportPath"])
        lines.append(f"| {row['order']} | {row['id']} | [[{rel.as_posix()}|{row['titleKo']}]] | {row['status']} |")
    lines.extend([
        "",
        "## 추가 교차검증",
        "",
    ])
    for item in supplemental:
        rel = (COLLECTION_ROOT / "02_추가_교차검증" / f"{item['id']}_해석엔진_설명보고서.md").relative_to(VAULT_ROOT).as_posix()
        lines.append(f"- [[{rel}|{item['id']} 설명보고서]] - {item['status']}")
    lines.extend([
        "",
        "## 최종 전달물",
        "",
        f"- 통합 PDF: `{MASTER_PDF.relative_to(REPO_ROOT).as_posix()}`",
        f"- 1장 요약 PDF: `{SUMMARY_PDF.relative_to(REPO_ROOT).as_posix()}`",
        "- 기계판독 색인: `벤치마크_해석엔진_색인.json`, `벤치마크_해석엔진_색인.csv`",
        "- 무결성: `package-manifest.json`",
        "",
        "## 사용 시 주의",
        "",
        "이 자료는 S-Structures의 수식-코드-결과 추적성과 로컬 검증 결과를 설명한다. STRIX·MIDAS를 독립 재실행한 외부 공식 qualification은 아니며, 6개 입력 미완료 사례는 결과값을 비워 두었다.",
    ])
    return "\n".join(lines) + "\n"


def render_master_markdown(document, index_rows, supplemental):
    lines = [
        "# S-Structures 벤치마크 해석엔진 통합보고서",
        "",
        f"기준일: {GENERATED_AT}",
        "",
        "> S-Structures가 각 문제를 어떤 식, 모델, 코드 모듈과 판정 절차로 해결했는지 설명하는 통합본이다.",
        "",
        "## 경영진 요약",
        "",
        "공식 21개 모두에 필요한 핵심 엔진 경로가 존재한다. 그중 13개는 대표값·checkpoint를 직접 비교했고, SP1·P3S2 2개는 공개 허용기준을 동등 적용했다. 6개는 엔진 미지원이 아니라 공개 입력 source lock 부족으로 결과 비교가 남아 있다.",
        "",
        "## 문제별 보고서",
        "",
    ]
    rows = {row["id"]: row for row in document["cases"]}
    for index_row in index_rows:
        row = rows[index_row["id"]]
        meta = METHODS[row["id"]]
        lines.extend([
            f"## {index_row['order']}. {row['id']} - {meta['titleKo']}",
            "",
            f"- 판정: **{row['statusLabel']}**",
            f"- 핵심식: `{meta['equations'][0]}`",
            f"- 대표 모듈: `{meta['modules'][0][0]}`",
            f"- S-Structures: {fmt_number(row.get('sStructures'), row['unit'])}",
            f"- 기준값: {fmt_number(row.get('reference'), row['unit'])}",
            f"- 설명: {meta['strength']}",
            f"- 한계: {meta['limitation']}",
            "",
        ])
    lines.extend(["## 추가 교차검증", ""])
    for item in supplemental:
        lines.extend([f"### {item['id']} - {item['title']}", "", f"- 판정: {item['status']}", f"- 설명: {item['meta']['strength']}", f"- 한계: {item['meta']['limitation']}", ""])
    return "\n".join(lines) + "\n"


def render_summary_markdown(document):
    return f"""# S-Structures 검증 1장 요약

## AI-native 구조해석 실행환경

S-Structures는 프로젝트 폴더 안의 결정론적 해석엔진을 AI와 사람이 대화로 조작하고, 모델-해석-검증-보고서를 같은 evidence chain으로 남기는 구조해석 환경이다.

## 검증 현황

| 상태 | 수 |
|---|---:|
| 로컬 공학 수치비교 PASS | 9 |
| 수치 PASS / 적격성 보류 | 2 |
| 엔진 checkpoint PASS | 2 |
| 동등 판정기준 PASS | 2 |
| 공개 입력 미완료 | 6 |
| 외부 공식 PASS 주장 | 0/21 |

## 대표 성과

- SB1 외팔보 처짐: 이론값 대비 사실상 0%
- SB2 NAFEMS LE1 응력: Reference 대비 -1.988%, STRIX 대비 +0.00663%
- SB7 Winkler 탄성지반 보: Reference 대비 +0.000356%
- SP1 pre-peak self-consistency: 0.017766% <= 1%
- P3S2 주기 민감도: 0.0002405% <= 0.5%
- 추가 XV1 M16: Timoshenko 이론 대비 -0.234%

## 입증된 강점

1. 수식 -> 코드 모듈 -> 실행 evidence -> 보고서를 역추적할 수 있다.
2. 해석엔진이 frame, shell, foundation, modal/RSA, nonlinear, THA로 모듈화돼 있다.
3. AI 에이전트가 모델 변경과 반복검증을 파일 단위로 자동화할 수 있다.
4. 입력이 부족하면 숫자를 추정하지 않고 `INPUT_BLOCKED`로 멈추는 fail-closed 검증을 사용한다.

## 주장 경계

현재 자료는 로컬 공학 검증과 공개 checkpoint/criterion 재현 근거다. STRIX·MIDAS 독립 외부 실행과 custody가 없으므로 외부 공식 PASS는 0/21이다.
"""


def register_fonts():
    pdfmetrics.registerFont(TTFont("Malgun", "C:/Windows/Fonts/malgun.ttf"))
    pdfmetrics.registerFont(TTFont("MalgunBold", "C:/Windows/Fonts/malgunbd.ttf"))


def pdf_styles():
    sample = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("title", parent=sample["Title"], fontName="MalgunBold", fontSize=26, leading=32, textColor=colors.HexColor(NAVY2), alignment=TA_LEFT, spaceAfter=8),
        "subtitle": ParagraphStyle("subtitle", parent=sample["BodyText"], fontName="Malgun", fontSize=10.5, leading=16, textColor=colors.HexColor(MUTED), spaceAfter=9),
        "h1": ParagraphStyle("h1", parent=sample["Heading1"], fontName="MalgunBold", fontSize=19, leading=24, textColor=colors.HexColor(NAVY), spaceAfter=7),
        "h2": ParagraphStyle("h2", parent=sample["Heading2"], fontName="MalgunBold", fontSize=11.5, leading=15, textColor=colors.HexColor(TEAL), spaceBefore=5, spaceAfter=4),
        "body": ParagraphStyle("body", parent=sample["BodyText"], fontName="Malgun", fontSize=8.4, leading=12.8, textColor=colors.HexColor(INK), spaceAfter=5),
        "small": ParagraphStyle("small", parent=sample["BodyText"], fontName="Malgun", fontSize=7, leading=10, textColor=colors.HexColor(MUTED)),
        "callout": ParagraphStyle("callout", parent=sample["BodyText"], fontName="MalgunBold", fontSize=9.2, leading=14, textColor=colors.HexColor(NAVY), backColor=colors.HexColor(PALE), borderPadding=7, spaceAfter=7),
        "table": ParagraphStyle("table", parent=sample["BodyText"], fontName="Malgun", fontSize=7.1, leading=9.5, textColor=colors.HexColor(INK)),
        "table_bold": ParagraphStyle("table_bold", parent=sample["BodyText"], fontName="MalgunBold", fontSize=7.2, leading=9.5, textColor=colors.HexColor(TEAL)),
        "table_right": ParagraphStyle("table_right", parent=sample["BodyText"], fontName="Malgun", fontSize=7.1, leading=9.5, textColor=colors.HexColor(INK), alignment=TA_RIGHT),
        "table_header": ParagraphStyle("table_header", parent=sample["BodyText"], fontName="MalgunBold", fontSize=7.2, leading=9, textColor=colors.white, alignment=TA_CENTER),
        "card_label": ParagraphStyle("card_label", parent=sample["BodyText"], fontName="Malgun", fontSize=8, leading=10, textColor=colors.HexColor(MUTED), alignment=TA_CENTER),
        "card_value": ParagraphStyle("card_value", parent=sample["BodyText"], fontName="MalgunBold", fontSize=20, leading=23, textColor=colors.HexColor(NAVY), alignment=TA_CENTER),
    }


def pp(text, style):
    return Paragraph(html.escape(str(text)).replace("\n", "<br/>"), style)


def styled_table(data, widths, styles, status_column=None):
    table = Table(data, colWidths=[value * mm for value in widths], hAlign="LEFT")
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(NAVY)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor(LINE)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for row in range(1, len(data)):
        if row % 2 == 0:
            commands.append(("BACKGROUND", (0, row), (-1, row), colors.HexColor("#F7FAFB")))
    if status_column is not None:
        commands.append(("BACKGROUND", (status_column, 1), (status_column, -1), colors.HexColor(PALE_GREEN)))
    table.setStyle(TableStyle(commands))
    return table


def status_fill(lane):
    return {"numeric": PALE_GREEN, "numeric_blocked": PALE_AMBER, "checkpoint": "#E8F2F8", "criterion": PALE_PURPLE, "engine_only": "#EEF1F3"}[lane]


def build_master_pdf(document, supplemental):
    register_fonts()
    styles = pdf_styles()
    page_size = landscape(A4)
    doc = SimpleDocTemplate(str(MASTER_PDF), pagesize=page_size, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=15 * mm, bottomMargin=14 * mm, title="S-Structures 벤치마크 해석엔진 통합보고서", author="S-Structures")
    story = [
        Spacer(1, 8 * mm),
        pp("AI-native structural analysis verification", styles["h2"]),
        pp("S-Structures 벤치마크\n해석엔진 통합보고서", styles["title"]),
        pp("공식 21개와 추가 Cross-Code 2개에 대해 모델링 형상, 사용식, 코드 모듈, 실행 절차, 결과와 주장 경계를 한 문서로 정리했다.", styles["subtitle"]),
        Spacer(1, 6 * mm),
        summary_cards(document, styles),
        Spacer(1, 8 * mm),
        pp("핵심 메시지", styles["h2"]),
        pp("S-Structures의 차별점은 숫자 하나가 아니라 수식 -> 코드 모듈 -> 결정론적 실행 -> evidence -> 보고서를 같은 프로젝트 폴더에서 추적할 수 있다는 점이다. 입력이 부족한 6개는 값을 추정하지 않고 비워 두었다.", styles["callout"]),
        Spacer(1, 6 * mm),
        pp(f"기준일 {GENERATED_AT} | 외부 공식 PASS 주장 0/21", styles["small"]),
        PageBreak(),
        pp("보고서 읽는 법", styles["h1"]),
        pp("각 사례는 동일한 6개 항목으로 정리한다: 검증 목적, 핵심식, 모델링, 실행 절차, 코드 모듈, 결과·한계. PASS의 종류를 직접 수치비교, checkpoint, 동등 기준으로 구분하며 입력 미완료 사례는 공식 결과 일치를 주장하지 않는다.", styles["body"]),
        explanation_table(styles),
        Spacer(1, 5 * mm),
        pp("AI-native 실행 흐름", styles["h2"]),
        flow_table(styles),
        PageBreak(),
    ]
    for index, row in enumerate(document["cases"], start=1):
        story.extend(case_pdf_page(index, row, METHODS[row["id"]], styles))
    for index, item in enumerate(supplemental, start=1):
        story.extend(supplemental_pdf_page(index, item, styles))
    story.extend([
        pp("결론과 다음 단계", styles["h1"]),
        pp("현재 자료로 입증되는 것은 해석엔진의 수식-코드 추적성, 15개 직접/동등 비교 결과, XV1 메시수렴, 반복 가능한 evidence chain이다. 6개 입력 미완료 사례는 원본 모델 input을 확보한 뒤 같은 runner 구조로 승격한다.", styles["callout"]),
        pp("외부 공식 qualification으로 가기 위한 최소 추가자료", styles["h2"]),
        bullet_table([
            "SB12: N2 좌표, 두 병진강성, 전체 6성분 하중",
            "SM5b: 층질량과 회전관성 multiplier mapping",
            "SM6: 전체 절점 좌표와 연결정보",
            "SR1/SR2/SR2b: 질량·단면·topology·전체 스펙트럼",
            "Cross-Code XV2: DCR_wall_benchmark.mgt와 shear recovery mapping",
            "STRIX/MIDAS raw 결과와 독립 실행 custody",
        ], styles),
        Spacer(1, 6 * mm),
        pp("이 자료는 우수성을 과장하는 문서가 아니라, 입증된 강점과 아직 필요한 증거를 한눈에 구분하는 기술 설득자료다.", styles["body"]),
    ])

    def decorate(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor(LINE))
        canvas.line(14 * mm, 10 * mm, page_size[0] - 14 * mm, 10 * mm)
        canvas.setFont("Malgun", 7)
        canvas.setFillColor(colors.HexColor(MUTED))
        canvas.drawString(14 * mm, 6 * mm, "S-Structures benchmark engine report - local evidence / no external official PASS claim")
        canvas.drawRightString(page_size[0] - 14 * mm, 6 * mm, str(document.page))
        canvas.restoreState()

    doc.build(story, onFirstPage=decorate, onLaterPages=decorate)


def summary_cards(document, styles):
    cards = [
        ("로컬 공학 PASS", "9", PALE_GREEN),
        ("수치 PASS / 보류", "2", PALE_AMBER),
        ("checkpoint PASS", "2", "#E8F2F8"),
        ("동등 기준 PASS", "2", PALE_PURPLE),
        ("입력 미완료", "6", "#EEF1F3"),
    ]
    data = []
    for label, value, _fill in cards:
        data.append([pp(label, styles["card_label"]), pp(value, styles["card_value"])])
    table = Table([data], colWidths=[50 * mm] * len(cards), rowHeights=[37 * mm])
    commands = [("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor(LINE)), ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.white)]
    for index, (_label, _value, fill) in enumerate(cards):
        commands.append(("BACKGROUND", (index, 0), (index, 0), colors.HexColor(fill)))
    table.setStyle(TableStyle(commands))
    return table


def summary_cards_compact(styles):
    cards = [
        ("로컬 공학 PASS", "9", PALE_GREEN),
        ("수치 PASS / 보류", "2", PALE_AMBER),
        ("checkpoint PASS", "2", "#E8F2F8"),
        ("동등 기준 PASS", "2", PALE_PURPLE),
        ("입력 미완료", "6", "#EEF1F3"),
    ]
    cells = [[pp(label, styles["card_label"]), pp(value, styles["card_value"])] for label, value, _fill in cards]
    table = Table([cells], colWidths=[34.4 * mm] * len(cards), rowHeights=[37 * mm])
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor(LINE)),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.white),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]
    for index, (_label, _value, fill) in enumerate(cards):
        commands.append(("BACKGROUND", (index, 0), (index, 0), colors.HexColor(fill)))
    table.setStyle(TableStyle(commands))
    return table


def explanation_table(styles):
    rows = [
        ["구분", "뜻", "사례"],
        ["로컬 공학 PASS", "공개 대표 물리량 직접비교", "SB1~SB10 중 9개"],
        ["수치 PASS / 보류", "대표값은 통과, 추가 적격성 evidence 필요", "PD1, SM5"],
        ["checkpoint PASS", "공개 checkpoint와 엔진 모듈 일치", "SH1, TH1"],
        ["동등 기준 PASS", "공개 판정식·허용한계 적용", "SP1, P3S2"],
        ["입력 미완료", "핵심 엔진은 있으나 공개 모델 input 부족", "SB12, SM5b, SM6, SR1, SR2, SR2b"],
    ]
    data = [[pp(cell, styles["table_header"]) for cell in rows[0]]] + [[pp(row[0], styles["table_bold"]), pp(row[1], styles["table"]), pp(row[2], styles["table"])] for row in rows[1:]]
    return styled_table(data, [44, 130, 95], styles)


def flow_table(styles):
    labels = ["① 대화/요구", "② canonical 모델", "③ 모듈 해석엔진", "④ evidence·hash", "⑤ 한국어 보고서"]
    data = [[pp(label, styles["table_bold"]) for label in labels], [pp(text, styles["table"]) for text in ["형상·하중·검증질문", "절점·요소·재료·경계", "frame/shell/modal/nonlinear", "입력·결과·판정 잠금", "수식·코드·결과 설명"]]]
    table = Table(data, colWidths=[53.8 * mm] * 5)
    table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(PALE)), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor(LINE)), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
    return table


SCHEMATIC_LABELS = {
    "SB1": "3.0 m 3D frame 외팔보 · 끝단 집중하중",
    "SB2": "1/4 타원형 고리 막 · 대칭경계 · 외곽 인장",
    "SB3": "Cook 사다리꼴 막 · 왜곡 Q4 메시 · 끝단 전단",
    "SB5": "얇은 직사각형 판 · 지지경계 · 면/중앙하중",
    "SB6": "두꺼운 Reissner-Mindlin 판 · 횡전단 포함",
    "SB7": "단순지지 보 · 연속 Winkler 지반스프링",
    "SB8": "깊은 단순지지 Timoshenko 보 · 모달질량",
    "SB9": "강접 포털 프레임 · 보 등분포하중",
    "SB10": "비대칭 2부재 트러스 · 절점 집중하중",
    "SB12": "경사 two-node 6-DOF link · beta 국부축",
    "PD1": "인장축력과 횡하중을 받는 캔틸레버",
    "SM5": "10경간 × 9층 Bathe-Wilson 평면골조",
    "SM5b": "편심 질량의 층별 강체격막 · Ux/Uy/Rz",
    "SM6": "고정단 3D pipe frame · 절점 집중질량",
    "SR1": "2D 다층 강체골조 · 수평 응답스펙트럼",
    "SR2": "3D 편심 강체격막 골조 · 비틀림 응답",
    "SR2b": "L형 평면 3D 가새골조 · 두 방향 RSA",
    "P3S2": "3 m × 9 m 벽체 · 3 × 6 membrane mesh",
    "SP1": "고정단 모멘트힌지 외팔보 · 증분 푸시오버",
    "SH1": "3D 기둥 · zero-length P-My-Mz 힌지",
    "TH1": "질량-스프링-감쇠기 SDOF · 지반가속도",
    "XV1": "8.55 m 전단벽 · M1~M16 메시수렴",
    "XV2": "5층 벽체-전이보 · 전단력 station probe",
}


def _diagram_text(drawing, x, y, text, size=6.6, bold=False, color=MUTED, anchor="start"):
    drawing.add(String(x, y, text, fontName="MalgunBold" if bold else "Malgun", fontSize=size, fillColor=colors.HexColor(color), textAnchor=anchor))


def _diagram_line(drawing, x1, y1, x2, y2, color=NAVY, width=1.7, dash=None):
    drawing.add(Line(x1, y1, x2, y2, strokeColor=colors.HexColor(color), strokeWidth=width, strokeDashArray=dash))


def _diagram_node(drawing, x, y, radius=3.2, fill=TEAL):
    drawing.add(Circle(x, y, radius, strokeColor=colors.white, strokeWidth=0.8, fillColor=colors.HexColor(fill)))


def _diagram_arrow(drawing, x1, y1, x2, y2, color=RED, width=1.5, size=5):
    _diagram_line(drawing, x1, y1, x2, y2, color=color, width=width)
    angle = math.atan2(y2 - y1, x2 - x1)
    left = (x2 - size * math.cos(angle - 0.55), y2 - size * math.sin(angle - 0.55))
    right = (x2 - size * math.cos(angle + 0.55), y2 - size * math.sin(angle + 0.55))
    drawing.add(Polygon([x2, y2, left[0], left[1], right[0], right[1]], fillColor=colors.HexColor(color), strokeColor=colors.HexColor(color)))


def _diagram_fixed(drawing, x, y, orientation="vertical"):
    if orientation == "vertical":
        _diagram_line(drawing, x, y - 17, x, y + 17, color=INK, width=2.4)
        for offset in range(-14, 18, 7):
            _diagram_line(drawing, x - 8, y + offset - 5, x, y + offset, color=MUTED, width=0.7)
    else:
        _diagram_line(drawing, x - 17, y, x + 17, y, color=INK, width=2.4)
        for offset in range(-14, 18, 7):
            _diagram_line(drawing, x + offset - 5, y - 8, x + offset, y, color=MUTED, width=0.7)


def _diagram_pin(drawing, x, y):
    drawing.add(Polygon([x, y, x - 8, y - 12, x + 8, y - 12], fillColor=colors.HexColor(PALE), strokeColor=colors.HexColor(INK), strokeWidth=1.0))
    _diagram_line(drawing, x - 11, y - 13, x + 11, y - 13, color=INK, width=1.1)


def _diagram_spring(drawing, x1, y1, x2, y2, coils=5, color=TEAL):
    dx, dy = x2 - x1, y2 - y1
    length = max(math.hypot(dx, dy), 1)
    nx, ny = -dy / length, dx / length
    points = [(x1, y1)]
    segments = coils * 2
    for index in range(1, segments):
        ratio = index / segments
        amplitude = 4 if index % 2 else -4
        points.append((x1 + dx * ratio + nx * amplitude, y1 + dy * ratio + ny * amplitude))
    points.append((x2, y2))
    drawing.add(PolyLine([coordinate for point in points for coordinate in point], strokeColor=colors.HexColor(color), strokeWidth=1.1, fillColor=None))


def _diagram_grid(drawing, x, y, width, height, nx, ny, perspective=0, fill=PALE):
    polygon = [x, y, x + width, y + perspective, x + width, y + height + perspective, x, y + height]
    drawing.add(Polygon(polygon, fillColor=colors.HexColor(fill), strokeColor=colors.HexColor(NAVY), strokeWidth=1.5))
    for ix in range(1, nx):
        ratio = ix / nx
        _diagram_line(drawing, x + width * ratio, y + perspective * ratio, x + width * ratio, y + height + perspective * ratio, color=LINE, width=0.65)
    for iy in range(1, ny):
        ratio = iy / ny
        _diagram_line(drawing, x, y + height * ratio, x + width, y + perspective + height * ratio, color=LINE, width=0.65)


def model_schematic(case_id):
    drawing = Drawing(360, 118)
    drawing.add(Rect(0, 0, 360, 118, rx=5, ry=5, fillColor=colors.HexColor("#F7FAFB"), strokeColor=colors.HexColor(LINE), strokeWidth=0.7))
    conceptual_ids = {"SB12", "SM5b", "SM6", "SR1", "SR2", "SR2b", "XV2"}
    figure_kind = "개념 형상(입력 미완료)" if case_id in conceptual_ids else "모델링 형상"
    _diagram_text(drawing, 10, 101, f"{figure_kind} | {SCHEMATIC_LABELS[case_id]}", size=7.2, bold=True, color=NAVY)
    _diagram_text(drawing, 350, 8, "● 절점   ■ 구속   → 하중/가진", size=5.8, color=MUTED, anchor="end")

    if case_id == "SB1":
        _diagram_fixed(drawing, 52, 58)
        _diagram_line(drawing, 52, 58, 300, 58, width=3.0)
        _diagram_node(drawing, 52, 58); _diagram_node(drawing, 300, 58)
        _diagram_arrow(drawing, 300, 88, 300, 63)
        _diagram_text(drawing, 176, 66, "L = 3.0 m", bold=True); _diagram_text(drawing, 307, 80, "Pz")
    elif case_id == "SB2":
        outer = GraphicPath(); outer.moveTo(52, 25); outer.curveTo(54, 72, 151, 95, 304, 95); outer.lineTo(304, 71); outer.curveTo(172, 71, 86, 56, 84, 25); outer.closePath()
        outer.fillColor = colors.HexColor(PALE); outer.strokeColor = colors.HexColor(NAVY); outer.strokeWidth = 1.5; drawing.add(outer)
        _diagram_line(drawing, 52, 18, 52, 96, color=MUTED, width=0.8, dash=[3, 2]); _diagram_line(drawing, 45, 25, 312, 25, color=MUTED, width=0.8, dash=[3, 2])
        for x, y in [(115, 91), (185, 95), (255, 95)]: _diagram_arrow(drawing, x, y + 15, x, y + 3, size=4)
        _diagram_text(drawing, 60, 30, "대칭"); _diagram_text(drawing, 258, 62, "D점 probe", bold=True)
    elif case_id == "SB3":
        points = [(52, 24), (52, 91), (300, 72), (300, 42)]
        drawing.add(Polygon([v for point in points for v in point], fillColor=colors.HexColor(PALE), strokeColor=colors.HexColor(NAVY), strokeWidth=1.6))
        for ratio in [0.2, 0.4, 0.6, 0.8]:
            _diagram_line(drawing, 52 + 248 * ratio, 24 + 18 * ratio, 52 + 248 * ratio, 91 - 19 * ratio, color=LINE, width=0.7)
        for ratio in [0.25, 0.5, 0.75]:
            _diagram_line(drawing, 52, 24 + 67 * ratio, 300, 42 + 30 * ratio, color=LINE, width=0.7)
        _diagram_fixed(drawing, 52, 58)
        for y in [45, 55, 65]: _diagram_arrow(drawing, 312, y - 10, 312, y, size=4)
        _diagram_text(drawing, 264, 28, "왜곡망")
    elif case_id in {"SB5", "SB6"}:
        _diagram_grid(drawing, 67, 30, 220, 52, 6, 4, perspective=12, fill=PALE_AMBER if case_id == "SB6" else PALE)
        for x in [112, 177, 242]: _diagram_arrow(drawing, x, 99, x, 83 + (x - 67) / 220 * 12, size=4)
        _diagram_text(drawing, 292, 50, "t/a 큼" if case_id == "SB6" else "t/a 작음", bold=True)
        _diagram_text(drawing, 70, 19, "단순지지/고정 경계")
    elif case_id == "SB7":
        _diagram_line(drawing, 49, 73, 310, 73, width=3)
        _diagram_pin(drawing, 58, 70); _diagram_pin(drawing, 301, 70)
        for x in range(75, 300, 28):
            _diagram_spring(drawing, x, 69, x, 29, coils=4); _diagram_line(drawing, x - 9, 27, x + 9, 27, color=MUTED, width=0.8)
        _diagram_arrow(drawing, 180, 101, 180, 78)
        _diagram_text(drawing, 186, 91, "P"); _diagram_text(drawing, 151, 18, "k = Winkler 선강성", bold=True)
    elif case_id == "SB8":
        drawing.add(Rect(55, 45, 250, 34, fillColor=colors.HexColor(PALE), strokeColor=colors.HexColor(NAVY), strokeWidth=1.8))
        _diagram_pin(drawing, 65, 44); _diagram_pin(drawing, 295, 44)
        wave = []
        for index in range(41):
            x = 65 + 230 * index / 40; y = 62 + 13 * math.sin(math.pi * index / 40)
            wave.extend([x, y])
        drawing.add(PolyLine(wave, strokeColor=colors.HexColor(RED), strokeWidth=1.3, fillColor=None))
        _diagram_text(drawing, 128, 84, "전단변형 + 회전관성", bold=True)
    elif case_id == "SB9":
        for x in [83, 277]:
            _diagram_line(drawing, x, 28, x, 86, width=3); _diagram_fixed(drawing, x, 28, "horizontal")
        _diagram_line(drawing, 83, 86, 277, 86, width=3)
        for x in range(100, 270, 28): _diagram_arrow(drawing, x, 103, x, 90, size=3.8)
        _diagram_text(drawing, 146, 73, "강접 보-기둥"); _diagram_text(drawing, 282, 95, "UDL")
    elif case_id == "SB10":
        _diagram_pin(drawing, 64, 30); _diagram_pin(drawing, 300, 30)
        _diagram_line(drawing, 64, 32, 205, 84, width=3); _diagram_line(drawing, 205, 84, 300, 32, width=3)
        for x, y in [(64, 32), (205, 84), (300, 32)]: _diagram_node(drawing, x, y)
        _diagram_arrow(drawing, 205, 105, 205, 89)
        _diagram_text(drawing, 110, 66, "A1,L1"); _diagram_text(drawing, 246, 66, "A2,L2")
    elif case_id == "SB12":
        _diagram_fixed(drawing, 64, 35)
        _diagram_spring(drawing, 72, 39, 279, 83, coils=8, color=TEAL)
        _diagram_node(drawing, 72, 39); _diagram_node(drawing, 279, 83)
        _diagram_arrow(drawing, 279, 83, 313, 90, color=TEAL, size=4); _diagram_arrow(drawing, 279, 83, 268, 108, color=AMBER, size=4)
        _diagram_arrow(drawing, 319, 66, 287, 79)
        _diagram_text(drawing, 315, 92, "local x", anchor="end"); _diagram_text(drawing, 270, 109, "local y"); _diagram_text(drawing, 308, 58, "F")
        _diagram_text(drawing, 143, 28, "beta-angle 좌표변환", bold=True)
    elif case_id == "PD1":
        _diagram_fixed(drawing, 92, 24, "horizontal"); _diagram_line(drawing, 92, 25, 92, 91, width=3)
        _diagram_node(drawing, 92, 91); _diagram_arrow(drawing, 92, 74, 92, 108, color=TEAL); _diagram_arrow(drawing, 55, 74, 87, 74)
        curved = GraphicPath(); curved.moveTo(130, 29); curved.curveTo(175, 42, 189, 70, 214, 93)
        curved.fillColor = None; curved.strokeColor = colors.HexColor(RED); curved.strokeWidth = 1.6; drawing.add(curved)
        _diagram_text(drawing, 99, 103, "T 인장"); _diagram_text(drawing, 49, 80, "H"); _diagram_text(drawing, 219, 88, "P-Δ")
    elif case_id == "SM5":
        x0, y0, w, h = 46, 20, 270, 74
        for ix in range(11): _diagram_line(drawing, x0 + w * ix / 10, y0, x0 + w * ix / 10, y0 + h, color=NAVY, width=0.8)
        for iy in range(10): _diagram_line(drawing, x0, y0 + h * iy / 9, x0 + w, y0 + h * iy / 9, color=NAVY, width=0.8)
        _diagram_line(drawing, x0 - 3, y0, x0 + w + 3, y0, color=INK, width=2.0)
        _diagram_text(drawing, 144, 98, "10 bays × 9 stories", bold=True)
    elif case_id == "SM5b":
        _diagram_grid(drawing, 78, 29, 200, 55, 4, 3, perspective=8)
        _diagram_node(drawing, 160, 58, radius=5, fill=RED); _diagram_node(drawing, 198, 68, radius=5, fill=TEAL)
        _diagram_line(drawing, 160, 58, 198, 68, color=AMBER, width=1.2, dash=[3, 2])
        _diagram_text(drawing, 145, 47, "CR"); _diagram_text(drawing, 204, 70, "CM")
        _diagram_arrow(drawing, 243, 88, 270, 88, color=TEAL); _diagram_text(drawing, 279, 86, "Ux/Uy/Rz")
    elif case_id == "SM6":
        points = [(76, 26), (76, 84), (150, 96), (150, 47), (234, 66), (292, 45), (292, 88)]
        for start, end in zip(points, points[1:]): _diagram_line(drawing, *start, *end, width=3)
        for x, y in points: _diagram_node(drawing, x, y)
        _diagram_fixed(drawing, 76, 26, "horizontal"); _diagram_fixed(drawing, 292, 45, "horizontal")
        for x, y in [(150, 96), (234, 66), (292, 88)]: drawing.add(Circle(x, y, 7, fillColor=colors.HexColor(PALE_AMBER), strokeColor=colors.HexColor(AMBER), strokeWidth=1.1))
        _diagram_text(drawing, 174, 22, "3D pipe frame + lumped masses", bold=True)
    elif case_id == "SR1":
        x_values = [82, 180, 278]; y_values = [24, 46, 68, 90]
        for x in x_values: _diagram_line(drawing, x, y_values[0], x, y_values[-1], width=1.8)
        for y in y_values: _diagram_line(drawing, x_values[0], y, x_values[-1], y, width=1.8)
        for y in y_values[1:]:
            drawing.add(Circle(180, y, 4.5, fillColor=colors.HexColor(PALE_AMBER), strokeColor=colors.HexColor(AMBER), strokeWidth=0.8)); _diagram_arrow(drawing, 42, y, 72, y, size=4)
        _diagram_text(drawing, 44, 98, "Sa(T)"); _diagram_text(drawing, 245, 96, "2D frame")
    elif case_id == "SR2":
        _diagram_grid(drawing, 76, 32, 180, 48, 3, 2, perspective=12)
        for x in [76, 136, 196, 256]: _diagram_line(drawing, x, 32 + (x - 76) / 180 * 12, x, 88 + (x - 76) / 180 * 12, width=1.2)
        _diagram_node(drawing, 164, 66, radius=5, fill=RED); _diagram_node(drawing, 201, 76, radius=5, fill=TEAL)
        _diagram_line(drawing, 164, 66, 201, 76, color=AMBER, width=1.0, dash=[3, 2]); _diagram_arrow(drawing, 287, 60, 320, 60, color=TEAL)
        _diagram_text(drawing, 130, 20, "CM-CR 편심 → 비틀림", bold=True)
    elif case_id == "SR2b":
        lshape = [60, 30, 270, 30, 270, 58, 160, 58, 160, 92, 60, 92]
        drawing.add(Polygon(lshape, fillColor=colors.HexColor(PALE), strokeColor=colors.HexColor(NAVY), strokeWidth=1.6))
        for x1, y1, x2, y2 in [(65, 33, 155, 89), (155, 33, 65, 89), (166, 33, 265, 55), (265, 33, 166, 55)]: _diagram_line(drawing, x1, y1, x2, y2, color=TEAL, width=1.1)
        _diagram_arrow(drawing, 292, 78, 326, 78); _diagram_arrow(drawing, 309, 95, 309, 65)
        _diagram_text(drawing, 195, 18, "L-plan + X braces", bold=True)
    elif case_id == "P3S2":
        _diagram_grid(drawing, 130, 18, 94, 78, 3, 6, perspective=0)
        _diagram_fixed(drawing, 177, 18, "horizontal")
        wave = []
        for index in range(31):
            y = 21 + 72 * index / 30; x = 244 + 13 * math.sin(math.pi * index / 30)
            wave.extend([x, y])
        drawing.add(PolyLine(wave, strokeColor=colors.HexColor(RED), strokeWidth=1.4, fillColor=None))
        _diagram_text(drawing, 88, 58, "H = 9 m"); _diagram_text(drawing, 177, 24, "B = 3 m", anchor="middle"); _diagram_text(drawing, 267, 54, "mode")
    elif case_id == "SP1":
        _diagram_fixed(drawing, 92, 22, "horizontal"); drawing.add(Circle(92, 29, 7, fillColor=colors.white, strokeColor=colors.HexColor(RED), strokeWidth=2.0)); _diagram_line(drawing, 92, 36, 92, 97, width=3)
        for y, length in [(54, 24), (72, 34), (90, 44)]: _diagram_arrow(drawing, 92, y, 92 + length, y)
        backbone = GraphicPath(); backbone.moveTo(205, 32); backbone.lineTo(230, 68); backbone.lineTo(270, 84); backbone.lineTo(309, 72)
        backbone.fillColor = None; backbone.strokeColor = colors.HexColor(TEAL); backbone.strokeWidth = 2.0; drawing.add(backbone)
        _diagram_text(drawing, 69, 12, "힌지"); _diagram_text(drawing, 216, 20, "M-θ backbone", bold=True)
    elif case_id == "SH1":
        _diagram_fixed(drawing, 105, 22, "horizontal"); drawing.add(Circle(105, 30, 7, fillColor=colors.white, strokeColor=colors.HexColor(RED), strokeWidth=2.0)); _diagram_line(drawing, 105, 37, 105, 92, width=3)
        _diagram_arrow(drawing, 105, 109, 105, 96); _diagram_arrow(drawing, 65, 70, 98, 70, color=TEAL)
        _diagram_arrow(drawing, 145, 53, 145, 82, color=AMBER)
        _diagram_text(drawing, 112, 101, "P"); _diagram_text(drawing, 49, 75, "My"); _diagram_text(drawing, 151, 68, "Mz")
        _diagram_text(drawing, 183, 53, "P-My-Mz interaction surface", bold=True)
    elif case_id == "TH1":
        drawing.add(Rect(150, 73, 64, 29, fillColor=colors.HexColor(PALE_AMBER), strokeColor=colors.HexColor(AMBER), strokeWidth=1.3)); _diagram_text(drawing, 182, 84, "m", size=12, bold=True, anchor="middle")
        _diagram_spring(drawing, 163, 72, 163, 28, coils=5); _diagram_line(drawing, 201, 72, 201, 28, color=TEAL, width=2.0)
        drawing.add(Rect(194, 42, 14, 15, fillColor=colors.HexColor(PALE), strokeColor=colors.HexColor(TEAL), strokeWidth=1.0))
        _diagram_line(drawing, 135, 26, 229, 26, color=INK, width=2.0); _diagram_arrow(drawing, 135, 17, 172, 17)
        _diagram_text(drawing, 144, 37, "k"); _diagram_text(drawing, 211, 49, "c"); _diagram_text(drawing, 177, 8, "üg(t)", bold=True)
    elif case_id == "XV1":
        _diagram_grid(drawing, 139, 18, 84, 79, 4, 12, perspective=0)
        _diagram_fixed(drawing, 181, 18, "horizontal"); _diagram_arrow(drawing, 181, 101, 218, 101)
        _diagram_text(drawing, 113, 57, "8.55 m"); _diagram_text(drawing, 234, 98, "100 kN"); _diagram_text(drawing, 242, 55, "M1→M16")
    elif case_id == "XV2":
        x0, y0 = 126, 29
        drawing.add(Rect(x0, y0 + 13, 104, 58, fillColor=colors.HexColor(PALE), strokeColor=colors.HexColor(NAVY), strokeWidth=1.3))
        for index in range(1, 5): _diagram_line(drawing, x0, y0 + 13 + 58 * index / 5, x0 + 104, y0 + 13 + 58 * index / 5, color=LINE, width=0.7)
        drawing.add(Rect(92, y0, 172, 13, fillColor=colors.HexColor(PALE_AMBER), strokeColor=colors.HexColor(AMBER), strokeWidth=1.5))
        _diagram_line(drawing, 105, y0, 105, 17, width=3); _diagram_line(drawing, 251, y0, 251, 17, width=3)
        for x in [144, 178, 212]: _diagram_arrow(drawing, x, 108, x, 102, size=3.5)
        _diagram_text(drawing, 100, 18, "지지"); _diagram_text(drawing, 167, 32, "전이보", bold=True); _diagram_text(drawing, 238, 47, "V probe")
    else:
        raise KeyError(f"No schematic defined for {case_id}")

    return drawing


def case_pdf_page(index, row, meta, styles):
    result = render_result_table(row)
    result_data = [[pp("비교항목", styles["table_header"]), pp("값", styles["table_header"])]] + [[pp(k, styles["table_bold"]), pp(v, styles["table_right"])] for k, v in result]
    modules_data = [[pp("코드 모듈", styles["table_header"]), pp("역할", styles["table_header"])]] + [[pp(path, styles["table_bold"]), pp(role, styles["table"])] for path, role in meta["modules"]]
    equations = "\n".join(f"• {value}" for value in meta["equations"])
    workflow = "\n".join(f"{i}. {value}" for i, value in enumerate(meta["workflow"], start=1))
    modeling = "\n".join(f"• {value}" for value in meta["modeling"])
    result_table = styled_table(result_data, [46, 78], styles)
    modules_table = styled_table(modules_data, [78, 46], styles)
    status_table = Table([[pp(row["statusLabel"], styles["table_bold"])]], colWidths=[50 * mm])
    status_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(status_fill(row["lane"]))), ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor(LINE)), ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    left = [pp("검증 목적", styles["h2"]), pp(meta["objective"], styles["body"]), model_schematic(row["id"]), pp("핵심 해석식", styles["h2"]), pp(equations, styles["body"]), pp("모델링", styles["h2"]), pp(modeling, styles["body"]), pp("문제 해결 절차", styles["h2"]), pp(workflow, styles["body"])]
    right = [status_table, Spacer(1, 3 * mm), result_table, Spacer(1, 3 * mm), pp("사용 코드 모듈", styles["h2"]), modules_table, Spacer(1, 3 * mm), pp("이 사례가 보여주는 강점", styles["h2"]), pp(meta["strength"], styles["body"]), pp("주장 경계", styles["h2"]), pp(meta["limitation"], styles["small"])]
    columns = Table([[left, right]], colWidths=[133 * mm, 132 * mm], hAlign="LEFT")
    columns.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, 0), 7), ("LEFTPADDING", (1, 0), (1, 0), 7), ("RIGHTPADDING", (1, 0), (1, 0), 0)]))
    return [pp(f"{index:02d}. {row['id']} - {meta['titleKo']}", styles["h1"]), columns, PageBreak()]


def supplemental_pdf_page(index, item, styles):
    meta = item["meta"]
    result_data = [[pp("비교항목", styles["table_header"]), pp("값", styles["table_header"])]] + [[pp(k, styles["table_bold"]), pp(v, styles["table_right"])] for k, v in item["result"]]
    modules_data = [[pp("코드 모듈", styles["table_header"]), pp("역할", styles["table_header"])]] + [[pp(path, styles["table_bold"]), pp(role, styles["table"])] for path, role in meta["modules"]]
    left = [pp("검증 목적", styles["h2"]), pp(meta["objective"], styles["body"]), model_schematic(item["id"]), pp("핵심 해석식", styles["h2"]), pp("\n".join(f"• {v}" for v in meta["equations"]), styles["body"]), pp("모델링", styles["h2"]), pp("\n".join(f"• {v}" for v in meta["modeling"]), styles["body"]), pp("문제 해결 절차", styles["h2"]), pp("\n".join(f"{i}. {v}" for i, v in enumerate(meta["workflow"], 1)), styles["body"])]
    right = [pp(item["status"], styles["callout"]), styled_table(result_data, [50, 74], styles), Spacer(1, 4 * mm), pp("사용 코드 모듈", styles["h2"]), styled_table(modules_data, [78, 46], styles), Spacer(1, 4 * mm), pp("설득 포인트", styles["h2"]), pp(meta["strength"], styles["body"]), pp("한계", styles["h2"]), pp(meta["limitation"], styles["small"])]
    columns = Table([[left, right]], colWidths=[133 * mm, 132 * mm])
    columns.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, 0), 7), ("LEFTPADDING", (1, 0), (1, 0), 7), ("RIGHTPADDING", (1, 0), (1, 0), 0)]))
    return [pp(f"추가 {index}. {item['id']} - {item['title']}", styles["h1"]), columns, PageBreak()]


def bullet_table(items, styles):
    data = [[pp(str(index), styles["table_bold"]), pp(item, styles["table"])] for index, item in enumerate(items, start=1)]
    table = Table(data, colWidths=[12 * mm, 245 * mm])
    table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor(LINE)), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("BACKGROUND", (0, 0), (0, -1), colors.HexColor(PALE)), ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    return table


def build_summary_pdf(document):
    register_fonts()
    styles = pdf_styles()
    page_size = landscape(A4)
    doc = SimpleDocTemplate(str(SUMMARY_PDF), pagesize=page_size, leftMargin=13 * mm, rightMargin=13 * mm, topMargin=11 * mm, bottomMargin=10 * mm, title="S-Structures 검증 1장 요약보고서", author="S-Structures")
    rows = {row["id"]: row for row in document["cases"]}
    representative = [
        ["SB1", "외팔보 처짐", fmt_pct(rows["SB1"]["errorVsReferencePct"]), "이론식 일치"],
        ["SB2", "NAFEMS LE1 응력", fmt_pct(rows["SB2"]["errorVsReferencePct"]), "STRIX 대비 +0.00663%"],
        ["SB7", "Winkler 지반보", fmt_pct(rows["SB7"]["errorVsReferencePct"]), "탄성지반 모듈"],
        ["SP1", "푸시오버 self-consistency", "0.017766% ≤ 1%", "동등 기준 PASS"],
        ["P3S2", "Shell 안정화 민감도", "0.0002405% ≤ 0.5%", "동등 기준 PASS"],
        ["XV1", "벽체 M16", "-0.234%", "Timoshenko 이론 대비"],
    ]
    table_data = [[pp(v, styles["table_header"]) for v in ["사례", "검증 물리량", "결과", "의미"]]] + [[pp(row[0], styles["table_bold"]), pp(row[1], styles["table"]), pp(row[2], styles["table_right"]), pp(row[3], styles["table"])] for row in representative]
    strengths = [
        ["1", "수식-코드 추적성", "보고서에서 사용식과 실제 모듈 경로를 바로 확인"],
        ["2", "모듈형 자체 엔진", "frame, shell, foundation, modal/RSA, nonlinear, THA 분리"],
        ["3", "AI-native 반복작업", "대화로 모델 변경-재해석-검증-보고서 갱신"],
        ["4", "결정론적 evidence", "입력·결과·판정·hash를 프로젝트 폴더에 보존"],
        ["5", "Fail-closed", "입력 부족 6개와 XV2는 숫자를 추정하지 않고 차단"],
    ]
    strengths_data = [[pp(v, styles["table_header"]) for v in ["", "입증된 강점", "설명"]]] + [[pp(row[0], styles["table_bold"]), pp(row[1], styles["table_bold"]), pp(row[2], styles["table"])] for row in strengths]
    left = [
        pp("AI-native 구조해석 실행환경", styles["h2"]),
        pp("S-Structures 검증 1장 요약", styles["title"]),
        pp("사람이 GUI를 반복 조작하는 프로그램을 넘어, AI와 사람이 프로젝트 파일·결정론적 자체 해석엔진·검증 evidence를 대화로 함께 조작하는 구조해석 환경", styles["subtitle"]),
        summary_cards_compact(styles),
        Spacer(1, 4 * mm),
        pp("대표 검증 결과", styles["h2"]),
        styled_table(table_data, [18, 54, 42, 58], styles),
    ]
    right = [
        pp("어떻게 신뢰를 만든다", styles["h2"]),
        flow_table_summary(styles),
        Spacer(1, 4 * mm),
        styled_table(strengths_data, [8, 28, 49], styles),
        Spacer(1, 4 * mm),
        pp("현재 주장하지 않는 범위", styles["h2"]),
        pp("STRIX·MIDAS 독립 외부 실행과 custody가 없으므로 외부 공식 PASS는 0/21이다. 현재 입증된 것은 로컬 공학 검증, 공개 checkpoint/criterion 재현, 코드-결과 추적성과 반복 가능성이다.", styles["callout"]),
        pp(f"기준일 {GENERATED_AT} | 공식 21개: 9 local PASS + 2 numeric hold + 2 checkpoint + 2 equivalent criterion + 6 input pending", styles["small"]),
    ]
    columns = Table([[left, right]], colWidths=[178 * mm, 91 * mm])
    columns.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, 0), 7), ("LEFTPADDING", (1, 0), (1, 0), 7)]))
    doc.build([columns])


def flow_table_summary(styles):
    rows = [
        ["대화", "AI가 요구·가정 구조화"],
        ["모델", "canonical JSON과 단위 잠금"],
        ["엔진", "모듈별 결정론적 해석"],
        ["검증", "Reference·STRIX·불변량 비교"],
        ["보고", "한국어 설명·근거·한계 출력"],
    ]
    data = [[pp(row[0], styles["table_bold"]), pp(row[1], styles["table"])] for row in rows]
    table = Table(data, colWidths=[24 * mm, 61 * mm])
    table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor(LINE)), ("BACKGROUND", (0, 0), (0, -1), colors.HexColor(PALE)), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    return table


def main():
    PDF_ROOT.mkdir(parents=True, exist_ok=True)
    document = read_json(COMPARISON_PATH)
    if len(document["cases"]) != 21:
        raise AssertionError("Exactly 21 official benchmark rows are required")
    order = {case_id: position for position, case_id in enumerate(OFFICIAL_ORDER)}
    document["cases"] = sorted(document["cases"], key=lambda row: order[row["id"]])
    if not P18A_PATH.is_file():
        raise AssertionError(f"P18A evidence is required: {P18A_PATH}")
    outputs = write_package(document)
    result = {
        "ok": True,
        "packageRoot": str(COLLECTION_ROOT),
        "officialReports": 21,
        "supplementalReports": 2,
        "pdfs": [
            {"path": str(MASTER_PDF), "bytes": MASTER_PDF.stat().st_size, "sha256": sha256(MASTER_PDF)},
            {"path": str(SUMMARY_PDF), "bytes": SUMMARY_PDF.stat().st_size, "sha256": sha256(SUMMARY_PDF)},
        ],
        "generatedFileCount": len(outputs),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
