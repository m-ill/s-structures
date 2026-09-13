# Phase 13 Production Requirements

```yaml
version: p13-requirements-v1
status: review-ready
reviewed_at: 2026-08-05
scope: core-frame-elastic-workspace-and-quarantined-shell-lab
```

## 1. 제품·범위 요구사항

| ID | 요구사항 |
| --- | --- |
| P13-FR-SCOPE-01 | 사용자 해석결과의 runtime solver는 S-Structures 자체 엔진만 사용한다. |
| P13-FR-SCOPE-02 | 외부 해석 프로그램은 runtime dependency, fallback 또는 hidden route로 연결하지 않는다. |
| P13-FR-SCOPE-03 | Phase 13의 생산범위는 frame/truss 중심 탄성해석과 하중·검토 workflow다. |
| P13-FR-SCOPE-04 | 비선형·PBSD·배근도·물량·최종 자동설계는 Phase 13에 포함하지 않는다. |
| P13-FR-SCOPE-05 | Core Frame, Slab Load Panel, Plate/Shell Lab의 지원·자격·전이 상태를 분리한다. |
| P13-FR-SCOPE-06 | workflow 자격이 공학 교차검증이나 최종 설계전이를 자동 승인하지 않는다. |

## 2. Analysis Run·상태 요구사항

| ID | 요구사항 |
| --- | --- |
| P13-FR-RUN-01 | 모든 실행은 versioned `AnalysisRunRecord`와 고유 run ID를 가진다. |
| P13-FR-RUN-02 | run은 model/revision/input/settings/capability/build hash를 snapshot한다. |
| P13-FR-RUN-03 | wizard, ribbon, 결과 버튼, dashboard, 보고서와 Agent API는 같은 run 상태를 소비한다. |
| P13-FR-RUN-04 | 모델·재료·단면·지점·release·하중·질량·조합·해석설정 변경은 영향받는 결과를 즉시 stale로 만든다. |
| P13-FR-RUN-05 | stale 이유와 변경 object ID·field를 추적하고 사용자에게 표시한다. |
| P13-FR-RUN-06 | 서로 다른 run의 결과·표·그림을 한 화면이나 보고서에 섞지 않는다. |
| P13-FR-RUN-07 | 실패·취소·부분완료 run은 마지막 current 성공 run을 훼손하지 않는다. |
| P13-FR-RUN-08 | unsupported 또는 preliminary 결과는 완료 여부와 별도의 지원등급을 가진다. |
| P13-FR-RUN-09 | current가 아닌 run으로 보고서·검토도면을 생성하면 차단하거나 명시적 historical 표식을 강제한다. |
| P13-FR-RUN-10 | 기존 Phase 7 run record는 무손실 adapter 또는 명시적 migration으로 읽는다. |

## 3. Workspace·공통 UX 요구사항

| ID | 요구사항 |
| --- | --- |
| P13-FR-UX-01 | 주 작업공간은 프로젝트·모델·하중·해석·결과·보고의 6개 영역으로 구성한다. |
| P13-FR-UX-02 | 좌측 Model/Case Tree, 중앙 3D/2D viewport, 우측 Context Inspector, 하단 drawer를 기본 구조로 한다. |
| P13-FR-UX-03 | 기존 7단계 wizard는 입문 흐름으로 유지하되 동일 service/state를 사용한다. |
| P13-FR-UX-04 | 상단 고정영역은 모드·조합·실행·Current/Stale 핵심상태만 유지한다. |
| P13-FR-UX-05 | 변경 작업은 Preview·Apply·Cancel·Undo와 미적용 dirty 상태를 공통 표현한다. |
| P13-FR-UX-06 | tree, 표, viewport와 inspector의 선택은 object ID 기반으로 양방향 동기화한다. |
| P13-FR-UX-07 | 빈 상태, 로딩, 차단, 미지원, 실패와 복구 조치를 구분한다. |
| P13-FR-UX-08 | 1280×720에서 핵심 흐름이 잘리거나 가로 스크롤되지 않는다. |
| P13-FR-UX-09 | 키보드 탐색, focus 복귀, 색 외 상태표현과 ko-KR/en-US 문구를 지원한다. |
| P13-FR-UX-10 | workspace layout과 panel size는 project 데이터가 아닌 사용자 설정으로 저장한다. |

## 4. Model Check·Repair 요구사항

| ID | 요구사항 |
| --- | --- |
| P13-FR-MC-01 | core validation, modeling repair inspection, load audit와 solver preflight를 하나의 issue registry로 통합한다. |
| P13-FR-MC-02 | issue는 code, severity, source, objectRefs, story, message, rule, fixability와 위치정보를 가진다. |
| P13-FR-MC-03 | 중복 절점·부재, zero-length, orphan, 교차 미분할, 누락 속성, 분리 구조와 불안정 release를 검사한다. |
| P13-FR-MC-04 | 하중·질량·조합 참조 오류, 자중·생성하중 중복과 단위·방향 이상을 검사한다. |
| P13-FR-MC-05 | issue 선택 시 해당 객체를 선택·격리·줌하고 관련 inspector를 연다. |
| P13-FR-MC-06 | 자동수정은 변경 전후 diff, 영향 객체와 예상 issue 변화를 미리 보여준다. |
| P13-FR-MC-07 | 자동수정은 하나의 transaction이며 실패 시 전부 rollback하고 성공 시 한 번에 undo한다. |
| P13-FR-MC-08 | 공학적 판단이 필요한 support, release, section, local axis 수정은 자동 확정하지 않는다. |
| P13-FR-MC-09 | 오류가 남은 run은 fail-closed하고 경고 waiver는 사용자·사유·revision과 결속한다. |
| P13-FR-MC-10 | 검사 결과와 waiver는 보고서·검토패키지에 같은 issue ID로 포함한다. |

## 5. Load·Mass·수동 조합 요구사항

| ID | 요구사항 |
| --- | --- |
| P13-FR-LM-01 | load case, mass source와 combination을 별도 table과 source ownership으로 관리한다. |
| P13-FR-LM-02 | 층·구역·부재·패널 단위의 다중편집, 붙여넣기, fill-down, filter와 atomic undo를 제공한다. |
| P13-FR-LM-03 | viewport는 active/all case 하중, 방향, 좌표계, 값, 생성 source와 legend를 표시한다. |
| P13-FR-LM-04 | slab panel은 1방향·2방향 분담과 지원 edge를 명시한다. |
| P13-FR-LM-05 | slab panel preview는 면하중 `qA`, 전달하중 합계, 잔차와 보 없는 edge fallback을 시각화한다. |
| P13-FR-LM-06 | 생성하중 재적용은 generated key를 사용해 중복을 만들지 않고 사용자 수정항목을 덮어쓰지 않는다. |
| P13-FR-LM-07 | 자중, 물리 부재질량과 하중→질량 변환의 중복을 검사한다. |
| P13-FR-LM-08 | 질량원 preview는 층별 질량·질량중심과 포함·제외 근거를 보여준다. |
| P13-FR-LM-09 | CSV/Excel 붙여넣기는 mapping·단위·방향·누락·원본합계와 적용합계를 Apply 전에 검증한다. |
| P13-FR-LM-10 | 외부 spreadsheet의 식·macro·실행코드는 평가하지 않고 값만 읽는다. |
| P13-FR-LM-11 | strength, service, accidental와 envelope group을 분리하고 빈·중복·미참조 조합을 차단한다. |
| P13-FR-LM-12 | load/mass/combo change-set은 결정적이며 저장·재열기와 재적용에서 논리적으로 동일하다. |

## 6. KDS 하중 절차 요구사항

| ID | 요구사항 |
| --- | --- |
| P13-FR-KDS-01 | 지원 규칙은 official source URL·문서 hash·판본·시행일과 적용범위를 가진 versioned rule pack이다. |
| P13-FR-KDS-02 | UI 코드에 계수나 기준값을 분산 하드코딩하지 않는다. |
| P13-FR-KDS-03 | 모든 자동값은 입력, 가정, 식, 중간값, 단위, source clause와 생성 결과 trace를 가진다. |
| P13-FR-KDS-04 | 미확인 필수입력은 보이지 않는 default로 채우지 않고 생성·승인을 차단한다. |
| P13-FR-KDS-05 | 풍하중은 지원 범위의 방향·부호·풍상/풍하·내외압과 층별 분배를 구분한다. |
| P13-FR-KDS-06 | 지진하중은 지원 범위의 등가정적·응답스펙트럼·우발편심·방향조합과 밑면전단 보정을 추적한다. |
| P13-FR-KDS-07 | 적설·지붕활·활하중 저감·온도 등 지원 family는 각각 별도 applicability와 limitation을 가진다. |
| P13-FR-KDS-08 | 생성 케이스·조합은 preview, merge/replace generated, custom 보존과 rollback을 지원한다. |
| P13-FR-KDS-09 | rule pack 승인에는 project, reviewer, revision, source hash, factor snapshot과 메모가 포함된다. |
| P13-FR-KDS-10 | source 또는 fixture가 미적격이면 해당 procedure를 `candidate`로 표시하고 final 설계전이를 차단한다. |

## 7. 실무 모델·층 편집 요구사항

| ID | 요구사항 |
| --- | --- |
| P13-FR-EDIT-01 | 선택 부재 속성창에서 재료·단면·role·local axis·release를 다중편집한다. |
| P13-FR-EDIT-02 | Timoshenko, 부분강접, 3D offset·삽입점·패널존, MPC/rigid link와 변단면을 일반 UI에서 편집한다. |
| P13-FR-EDIT-03 | 고급 속성은 viewport glyph와 inspector 수치가 동일한 model field를 사용한다. |
| P13-FR-EDIT-04 | 미지원 solver 조합은 입력 단계에서 reason code와 함께 차단한다. |
| P13-FR-EDIT-05 | story manager는 층 이름·높이·범위·복사·표시·잠금을 관리한다. |
| P13-FR-EDIT-06 | diaphragm manager는 rigid/semi-rigid 배정, master/slave, 누락·중복과 질량원 연결을 검사한다. |
| P13-FR-EDIT-07 | CM/CR, 편심, 주축과 미배정 절점을 층별 overlay로 표시한다. |
| P13-FR-EDIT-08 | Nodes/Members/Loads/Combos spreadsheet와 viewport selection이 양방향으로 동기화된다. |
| P13-FR-EDIT-09 | 일괄편집은 scope, 변경 row 수, validation 결과를 Apply 전에 보여준다. |
| P13-FR-EDIT-10 | 저장·재열기와 legacy migration에서 기존 model 값과 결과가 무손실이다. |

## 8. Elastic Results 요구사항

| ID | 요구사항 |
| --- | --- |
| P13-FR-RES-01 | dashboard는 최대변위, 평형잔차, 지배조합, 경고와 지원상태를 요약한다. |
| P13-FR-RES-02 | story drift, story shear, overturning, base shear, CM/CR·편심과 torsion 결과를 표시한다. |
| P13-FR-RES-03 | modal/RSA는 주기, 모드형상, 방향별·누적 질량참여율과 scale 전후 결과를 표시한다. |
| P13-FR-RES-04 | 1차와 Direct P-Delta의 변위·drift·부재력·증폭비를 같은 응답량끼리 비교한다. |
| P13-FR-RES-05 | 결과값은 case/combo, 단위, local/global, 부호, station, max/min과 governing source를 가진다. |
| P13-FR-RES-06 | table row, chart point와 viewport object 선택은 같은 result selection store를 사용한다. |
| P13-FR-RES-07 | filter, sort, search, story isolate, threshold와 CSV/clipboard export를 제공한다. |
| P13-FR-RES-08 | viewport label collision을 제어하고 선택·극값·경고 중심의 단계적 표시를 제공한다. |
| P13-FR-RES-09 | 표·3D·보고서의 동일 결과 항목은 수치와 governing source가 일치한다. |
| P13-FR-RES-10 | preliminary·unsupported·stale 결과는 정상 current 결과와 같은 색이나 상태로 보이지 않는다. |

## 9. 검토 패키지·revision·MGT 요구사항

| ID | 요구사항 |
| --- | --- |
| P13-FR-REV-01 | model, load, stiffness, run과 result revision diff를 object ID와 field 단위로 제공한다. |
| P13-FR-REV-02 | diff는 추가·삭제·변경과 결과 지배조건 변화의 원인을 구분한다. |
| P13-FR-RPT-01 | 계산서 composer는 포함 section, case/combo, 그림과 표를 preview한 뒤 export한다. |
| P13-FR-RPT-02 | 검토용 평면·입면은 부재마크·하중·반력·이용률·issue를 선택적으로 표시한다. |
| P13-FR-RPT-03 | 계산서·SVG·DXF·PDF는 동일 run/report snapshot hash와 limitation을 기록한다. |
| P13-FR-RPT-04 | stale, failed 또는 mixed-run 상태에서는 current 검토패키지를 발행하지 않는다. |
| P13-FR-IMP-01 | 최초 MGT Import 범위는 frame/truss node·member·support·material·section·basic load로 제한한다. |
| P13-FR-IMP-02 | importer는 source version, unit, axis, local axis와 supported/approximated/unsupported mapping을 preview한다. |
| P13-FR-IMP-03 | release, offset, rigid link와 combination은 지원 선언된 필드만 변환하고 손실을 숨기지 않는다. |
| P13-FR-IMP-04 | import는 임시 model에서 validation·mapping audit를 통과한 뒤 새 revision으로 원자 적용한다. |
| P13-FR-IMP-05 | malformed·대형·unknown record는 경계 안에서 실패하고 기존 project를 변경하지 않는다. |
| P13-FR-IMP-06 | 최초 범위를 벗어난 MGT record는 미지원 목록과 원문 위치를 남긴다. |

## 10. Plate/Shell Lab 요구사항

| ID | 요구사항 |
| --- | --- |
| P13-FR-SHELL-01 | 기존 CPU flat-shell formulation을 유일한 수치 owner로 유지하고 새 solver로 교체하지 않는다. |
| P13-FR-SHELL-02 | slab/wall/mat 생성, mesh preview, local axis, thickness·material과 support를 UI에서 확인한다. |
| P13-FR-SHELL-03 | mesh quality, warped element, aspect ratio, connectivity와 load direction issue를 실행 전에 검사한다. |
| P13-FR-SHELL-04 | 결과는 지원된 Mxx/Myy/Mxy/Qx/Qy·변위·응력과 top/bottom·local axis 정의를 명시한다. |
| P13-FR-SHELL-05 | contour averaging의 raw/averaged 상태와 불연속을 구분한다. |
| P13-FR-SHELL-06 | 사용자 모델은 최소 2개 mesh level의 convergence provenance 없이는 설계전이가 차단된다. |
| P13-FR-SHELL-07 | patch, closed-form, 공개 benchmark, equilibrium·energy와 mesh convergence evidence를 분리한다. |
| P13-FR-SHELL-08 | shell 자격 실패 또는 외부 근거 부족은 core frame workflow release를 막지 않고 shell만 격리한다. |
| P13-FR-SHELL-09 | Phase 13 기본값은 `shellDesignTransferAllowed=false`다. |
| P13-FR-SHELL-10 | slab reinforcement·punching·wall local design은 비범위다. |

## 11. 비기능 요구사항

| ID | 요구사항 |
| --- | --- |
| P13-NFR-DATA-01 | 모든 Apply·Import·Repair는 transaction이며 실패·취소 시 model hash가 불변이다. |
| P13-NFR-DATA-02 | 신규 schema는 additive migration, round-trip fixture와 이전 reader 정책을 가진다. |
| P13-NFR-NUM-01 | 기능을 사용하지 않은 기존 fixture의 solver 결과는 정의된 tolerance 안에서 Phase 12 기준과 동일하다. |
| P13-NFR-PERF-01 | main-thread input acknowledgement p95는 기준 모델에서 100 ms 이하를 목표로 한다. |
| P13-NFR-PERF-02 | 1,000 frame-member 기준 Model Check p95는 기준 Windows 장치에서 2초 이하다. |
| P13-NFR-PERF-03 | 10,000 result row의 filter/sort p95는 200 ms 이하이고 UI를 장시간 block하지 않는다. |
| P13-NFR-PERF-04 | 250 slab panel preview p95는 2초 이하이며 cancel 가능하다. |
| P13-NFR-PERF-05 | 기존 core solve 성능의 설명되지 않는 p95 회귀는 10%를 넘지 않는다. |
| P13-NFR-A11Y-01 | 키보드로 workspace·tree·table·issue·inspector 핵심 동작을 수행할 수 있다. |
| P13-NFR-A11Y-02 | 상태는 색만으로 전달하지 않고 text·shape·icon을 함께 사용한다. |
| P13-NFR-A11Y-03 | 1280×720, 1920×1080과 Windows 125%·150% 배율에서 핵심 정보가 손실되지 않는다. |
| P13-NFR-SEC-01 | CSV/MGT/parser는 size·record·depth limit, canonical text decoding과 timeout을 가진다. |
| P13-NFR-SEC-02 | 사용자 문자열은 DOM·SVG·HTML·report에서 escape하고 외부 식·macro를 실행하지 않는다. |
| P13-NFR-SEC-03 | 새 telemetry·network upload를 기본 활성화하지 않는다. |
| P13-NFR-OBS-01 | run, check, load generation, import와 export는 duration·count·reason code를 로컬 run log에 기록한다. |
| P13-NFR-TEST-01 | 각 마일스톤은 unit, contract, integration, numeric parity, browser E2E, failure injection과 evidence 검사를 가진다. |
| P13-NFR-TEST-02 | Critical/High review finding과 flaky mandatory test가 있으면 마일스톤을 qualification-complete로 승격하지 않는다. |
| P13-NFR-COMPAT-01 | 기존 JSON, 보고서, Agent API와 Phase 12 local-pilot profile을 깨지 않는다. |
| P13-NFR-ROLL-01 | 새 workspace, importer와 shell lab은 독립 feature flag로 비활성화할 수 있다. |

## 12. 최종 release gate

- 모든 Core requirement가 traceability에서 `qualification-complete`다.
- workspace, wizard, report와 Agent API의 run ID·Current/Stale parity가 100%다.
- Core Frame E2E fixture에서 unresolved Critical/High issue가 0이다.
- load/mass/slab 전달합과 평형 audit가 허용오차 안에서 닫힌다.
- 기존 Phase 7~12 전체 mandatory regression과 Phase 13 전용 gate가 통과한다.
- 1280×720·1920×1080, keyboard, ko-KR/en-US, Windows scale matrix를 통과한다.
- limited MGT fixture는 지원 mapping 손실 0, 미지원 record 노출 100%다.
- release manifest가 source revision, build, requirement, test와 evidence hash를 재검증한다.
- `openSeesRuntimeUsed=false`, `externalSolverRuntimeDependency=false`, `nonlinearInScope=false`다.
- `frameElasticOfficePilotAllowed`는 pilot gate로만 판정하며 `finalDesignTransferAllowed`와 분리한다.
- shell gate가 green이 아니면 `shellDesignTransferAllowed=false`를 유지하고 Core release만 별도 판정한다.
