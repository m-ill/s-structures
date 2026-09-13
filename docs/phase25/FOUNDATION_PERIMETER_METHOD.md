# Phase25 기초 위치와 열린 펀칭 위험둘레 구현 메모

상태: 구현 및 집중 검증. 독립 방법 검토 미완료. Phase25/M5 전체 완료 아님.

## 입력과 기준점

- `columnOffsetX`, `columnOffsetY`: 기초 중심에 대한 기둥 중심의 전역 X/B, Y/L 좌표(m). 생략은 기존 중심 기둥이다. 기둥 직사각형은 기초 안에 들어가야 한다.
- 편심이 있으면 `reactionMomentReference`를 명시한다. `column-center`는 기둥 중심, `footing-center`는 기초 중심에 대한 모멘트다. `reactionVerticalReference`로 footing-base/footing-top/specified-height를 선택하고, specified-height일 때 reactionHeightAboveBase(m)를 입력한다. 수평력이 있으면 높이 기준은 필수다. 기초 상면 기준은 두께 후보 변경을 따른다.
- 기둥 중심 반력의 기초 저면 중심 이동: Mx += rz * offsetY - height * ry, My += height * rx - rz * offsetX. totalMx/My는 저면 중심, columnBaseMx/My는 기둥 평면 중심의 저면, columnMx/My는 기초 상면의 기둥 접합면 기준이다. 비틀림 totalMz/columnMz도 평면 이동으로 분리한다. 기초 중심의 균등 분포 자중/상재토/부력은 중심 모멘트를 추가하지 않는다. 반력에 이미 분포 무게가 포함된 경우 입력 반력 자체를 옮긴 뒤 기둥력/모멘트를 분리한다.
- 절단면, 양쪽 정착 길이, 펀칭 토압 적분 구간, 철근 분배 유효폭, 기둥 주근과 도면이 같은 좌표를 사용한다. 위치는 공통 typed schema로 UI/WebMCP/저장/undo에 연결된다.

## 펀칭 방법

`punchingMomentMethod=conservative-perimeter-shear`와 `punchingPerimeterScope=rectangular-solid-no-openings`로 선택한다. 기존 `interior-solid-no-openings`는 기존의 내부 폐합 직사각형 계산 경로를 유지한다.

1. 기둥면에서 d/2 떨어진 축 평행 선과 기초 외곽까지 이어지는 열린 경계를 조합한다. 폐합 4면, 열린 3면, 인접 2면의 최대 9개 경로 중 최소 둘레를 선택한다. 기초 자유단은 둘러싼 면적의 경계이지만 전단 저항선으로 더하지 않는다. 같은 최소 길이의 경로는 모두 검토한다.
2. 선분 길이·도심·Ix/Iy/Ixy를 적분한다. KDS 공칭 전단강도 함수는 공유하고, 내부/가장자리/모서리 계수는 선택 경로의 위상으로 분기한다. **이 위상 분류에 따른 alphaS 적용과 열린 경로 최소화의 실무 적합성은 독립 방법 검토 대상**이며 규정 적합 승인을 대체하지 않는다.
3. 실제 압축 접촉 다각형과 위험 구간을 교차해 토압을 적분하고, 같은 구간의 하향 분포 하중을 포함한다. 수직력과 양축 모멘트를 위험둘레 선 도심으로 이동한다.
4. `stress = V/A + a*(x-xc) + b*(y-yc)`의 계수를 부호 있는 양축 평형으로 구한다. 모든 선분 끝의 최대 절대 응력으로 판정하고 복원 V/Mx/My를 기록한다. 휨에 의한 모멘트 전달 기여는 인정하지 않는다.
5. 실제 남은 위험단면별 직선 철근 연장 길이를 검사한다. 기둥면 정착은 별도 `foundation-anchorage` 검사이며, 자유단에서 정착 길이가 부족하면 NG다.
6. 대표 demand/capacity/nominalCapacity는 kPa이며 이용률과 같은 응력 기준이다. `verticalDemand`, `verticalShearCapacity`, `nominalVerticalShearCapacity`는 kN을 보존한다. 연장 부족으로 NG이면서 응력 이용률이 1 이하일 수 있고 사유/개별 연장 검사를 함께 읽어야 한다.

결과는 `methodReviewRequired=true`, `designTransferAllowed=false`, `codeBasis.status=NOT_ESTABLISHED`를 유지한다. 준비된 위험둘레 객체를 검토와 도면에서 공유한다. 도면은 최소 경로 후보 1/N을 표시하고 계산서는 모든 동률 경로와 지배 경로를 기록한다.

## 근거와 작은 검증

- 저장 공식 원문: `verification/evidence/phase24/kcsc/KDS-142022-official.json`, `142022-text.txt` (4.11.1, 4.11.2, 4.11.7), `KDS-142070-official.json`, `142070-text.txt` (4.2.2.1~3). 강도 저감은 KDS 14 20 10 4.2.3(2). 원문 파일은 수정하지 않았다.
- 2m 정사각형, 0.4m 기둥, d=0.2m: 중심 2.4m, x=0.8m 가장자리 1.6m/도심 x=0.65625m, x=y=0.8m 모서리 1.0m/도심 x=y=0.625m.
- 모서리 선단면: Ix=Iy=1/192 m4, Ixy=-0.003125 m4. V=60kN, Mx=3kN.m, My=-2kN.m에서 최대 응력 630kPa. 좌표 반전과 모멘트 반전 시 동일 이용률.
- 균등 순토압 사례의 좌우 절단면 모멘트를 독립 직사각형 적분식으로 확인. 기준점 변경/자중 포함 여부를 바꿔 같은 합력·모멘트가 나오는지 확인.
- 실제 WebMCP 편심/모서리 입력 → 저장 → 합성 해석 → Worker 검토 → check 조회 → 준비 형상/도면 JSON → undo 확인. 실제 건물 테스트 아님.
- 현재 최종 집중 증거: `verification/evidence/phase25/focused-2026-09-11T15-04-57-323Z/SUMMARY.json` (3파일). 앞선 직접 영향 5파일 증거: `focused-2026-09-11T15-03-53-032Z/SUMMARY.json`. 서로 다른 시점의 증거를 전체 회귀 통과로 합산하지 않는다.

## 남은 범위

개구부, 대향 자유단을 잇는 별도 파괴기구, 회전/비직사각형 기둥, 휨 전달 기여, 상부 인장 펀칭/전단 보강, 기둥 주근·후크·다월과의 완전한 힘 전달, 기초 저면의 전단·비틀림 마찰 분포, 지반 자격 및 독립 방법 검토는 잔여다. 단순 직선 정착 NG를 계산 오류나 자동 성공으로 바꾸지 않는다. 기존 Phase25의 다른 미완료 범위도 그대로 유지한다.


2026-09-12 00:24 추가: 반력 높이 및 압축+전단 접촉면 구현은 `COLUMN_TRANSFER_METHOD.md` 참조. 기초 저면 비틀림이 남을 때 단순 수평력/마찰력 계산만으로 활동 OK를 반환하지 않는다.
