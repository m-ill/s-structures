# Phase 8 Reference Basis and Source Governance

```yaml
document_status: governing
source_policy: official and primary sources first
qualification_policy: no source, no global verified status
```

## 1. 목적

Phase 8은 알고리즘 이름이나 상용 프로그램 화면을 근거로 완료 처리하지 않는다. 각 기능은 이 문서에 등록된 공식 문서, 연구보고서, 독립 benchmark 중 하나 이상과 연결되어야 한다.

## 2. 기준 출처

| ID | 출처 | Phase 8 적용 |
| --- | --- | --- |
| SRC-NIST-01 | [NIST GCR 17-917-46v1](https://nvlpubs.nist.gov/nistpubs/gcr/2017/NIST.GCR.17-917-46v1.pdf) | 건축 비선형 모델링, 해석절차, 성능평가, 불확실성·검증 원칙 |
| SRC-NIST-02 | [NIST GCR 10-917-5](https://www.nist.gov/publications/nehrp-seismic-design-technical-brief-no-4-nonlinear-structural-analysis-seismic-design) | 실무 비선형해석 workflow와 모델 검토 |
| SRC-OPS-01 | [OpenSees Newton](https://opensees.github.io/OpenSeesDocumentation/user/manual/analysis/algorithm/Newton.html) | full/modified Newton 동작과 tangent reforming |
| SRC-OPS-02 | [OpenSees DisplacementControl](https://opensees.github.io/OpenSeesDocumentation/user/manual/analysis/integrator/DisplacementControl.html) | augmented displacement-control equation |
| SRC-OPS-03 | [OpenSees ArcLength](https://opensees.github.io/OpenSeesDocumentation/user/manual/analysis/integrator/ArcLength.html) | arc-length constraint와 control contract |
| SRC-OPS-04 | [OpenSees Corotational](https://opensees.github.io/OpenSeesDocumentation/user/manual/model/geomTransf/Corotational.html) | 3D local/global transformation 및 joint offset 기대동작 |
| SRC-OPS-05 | [OpenSees Force-Based Beam-Column](https://opensees.github.io/OpenSeesDocumentation/user/manual/model/elements/forceBeamColumn.html) | basic force, section integration, element compatibility |
| SRC-CSI-01 | [ETABS Load Case Data](https://docs.csiamerica.com/help-files/etabs/Menus/Define/Load_Cases/Load_Case_Data_Form.htm) | load case 종류, mass source, nonlinear direct integration workflow |
| SRC-CSI-02 | [ETABS Nonlinear Static](https://docs.csiamerica.com/help-files/etabs/Menus/Define/Load_Cases/Static_Nonlinear_Pushover_Cases/Nonlinear_Static.htm) | initial state, P-Delta/large displacement, nonlinear static 용도 |
| SRC-CSI-03 | [ETABS Solution Control](https://docs.csiamerica.com/help-files/etabs/Menus/Define/Load_Cases/Solution_Control.htm) | max/min substep, convergence, line search, event stepping |
| SRC-CSI-04 | [ETABS Mass Source](https://docs.csiamerica.com/help-files/etabs/Menus/Define/Mass_Source.htm) | self/additional/load-derived mass와 diaphragm mass |
| SRC-CSI-05 | [ETABS Pushover Analysis](https://docs.csiamerica.com/help-files/etabs/Getting_Started/Nonlinear_Static_Pushover_Analysis.htm) | hinge, load pattern, control displacement, step results |
| SRC-MIDAS-01 | [MIDAS Gen Inelastic Hinge](https://manual.midasuser.com/EN_Common/Gen/845/Start/04_Model/05_Properties/Inelastic_Hinge_Properties.htm) | hinge 성분, 위치, lumped/distributed/fiber, hysteresis, PMM |
| SRC-MIDAS-02 | [MIDAS Gen Pushover Global Control](https://manual.midasuser.com/EN_Common/Gen/905/Start/08_Design/07_Pushover_Analysis/01_Pushover_Global_Control.htm) | initial load, large displacement, nonconvergence step subdivision |

상용 제품 출처는 feature behavior와 UX 계약을 정하는 비교자료다. 수치 정답은 closed-form, published benchmark 또는 버전 고정 독립 solver fixture에서 얻는다.

## 3. Source snapshot 계약

각 외부 기준은 다음 metadata를 evidence에 저장한다.

```json
{
  "sourceId": "SRC-NIST-01",
  "authority": "NIST",
  "title": "...",
  "edition": "2017",
  "url": "https://...",
  "retrievedAt": "ISO-8601",
  "contentHash": "sha256 or null",
  "status": "verified-source | link-only | superseded",
  "appliesTo": ["..."],
  "notes": "..."
}
```

- 공식 파일을 repository evidence로 사용하면 hash를 저장한다.
- URL만 확인한 출처는 `link-only`이며 수치 fixture의 단독 근거가 될 수 없다.
- 기준판이 바뀌면 기존 project snapshot을 자동 변경하지 않는다.
- source가 철회되거나 superseded되어도 기존 run record의 snapshot은 보존한다.

## 4. Benchmark 계층

| 계층 | 기준 | 용도 |
| --- | --- | --- |
| B0 | algebra/invariant | 행렬, 좌표변환, 상태, 보존법칙 |
| B1 | closed-form | 선형극한, spring, beam-column 기본문제 |
| B2 | published component | corotational, hinge, fiber, material |
| B3 | independent solver | MDOF static, Pushover, NLTH history |
| B4 | representative pilot | 실제 steel/RC 건축골조 workflow |

`verified`에는 B0/B1만으로 충분하지 않다. solver 기능은 B3, 최종 제품은 B4가 필요하다.

## 5. 금지되는 검증 방식

- actual 함수가 만든 값을 expected로 재사용
- 현재 결과를 frozen baseline으로 만든 뒤 정확도라고 주장
- 미리 정한 path에 constraint만 대입
- 같은 matrix/section helper를 actual과 reference 양쪽에서 호출
- 특정 상용 프로그램 결과 한 건만 tolerance와 입력 audit 없이 비교
- nonconvergence를 collapse 또는 failure capacity로 자동 해석
- source/edition가 없는 hinge parameter를 globally verified로 표시
