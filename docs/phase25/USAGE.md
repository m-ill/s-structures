# Phase25 RC 검토·WebMCP 실행 안내

2026-09-13 · 현재 작업 소스 안내 · 전체 개발 완료/배포 확인서 아님.

## 실행할 소스 확인

현재 소스가 있는 저장소 루트에서 Node.js 24로 실행한다.

```sh
node server/main.mjs 5173
```

브라우저에서 `http://127.0.0.1:5173/index.html`을 연다. 정적 GitHub Pages와 로컬 Node 서버의 저장 기능은 구분한다. 공개 저장소 clone이나 이전 Release ZIP이 이 작업 트리와 같다고 가정하지 않는다. Pages의 `SOURCE-IDENTITY.json`은 배포 커밋을 확인하는 자료이고, 로컬 미커밋 변경의 식별자가 아니다.

## 공통 업무 흐름

1. 현재 프로젝트와 해석 케이스를 조회하고 재료·단면·배근·접합·기초 및 필요한 하중조합을 입력한다. typed 변경은 `preview_design_changes`의 검토 결과를 확인한 뒤 `apply_design_changes`로 적용한다. 현재 런타임 schema의 필드와 단위를 사용한다.
2. CPU 탄성/지원 Direct 경로로 필요한 해석을 완료한다. `get_practical_design_context`에서 현재 입력 식별자·평가·source/job 상태를 확인한다. 이전 모델의 해석 결과를 현재 결과로 재결속하지 않는다.
3. `evaluate_practical_design`에 현재 inputHash와 완료된 source/조합 식별자를 전달한다. `get_practical_design_result`로 필터·페이지 조회하고 `get_practical_design_check`로 전체 계산행을 조회한다. 전체 요약과 현재 페이지 개수는 구분한다.
4. NG 대상의 실제 입력·사유와 보완 제약을 확인한다. `plan_design_candidates` → `start_design_candidates` → `get_design_candidates`로 후보를 검토한다. `apply_design_candidate_and_review`는 명시 적용 후 새 해석/재검토 결과를 반환한다. 요청 재시도에는 같은 requestId를 사용한다.
5. 최신 evaluationId로 `export_design_drawings`를 호출한다. JSON/CSV/SVG/PDF 또는 PDF 묶음을 선택한다. 개별 PDF는 다음 volume을 끝까지 조회하며, PDF 묶음은 전체 권과 manifest를 포함한다. 출력은 검토용이며 제작 승인을 의미하지 않는다.

도구의 구체적 인수와 제한은 [현재 등록 구현](../../src/ui/webmcp/practicalTools.js) 및 [공통 입력 계약](../../src/modeling/practicalInputContract.js)이 기준이다. 일반 브라우저 UI 사용과 WebMCP 등록 환경 지원은 구분하며 [WebMCP 안내](../WEBMCP.md)를 함께 읽는다.

## 결과를 읽는 방법

- NG는 해당 검사 기준을 충족하지 못했다는 뜻이다. 단면/배근 부족과 프로그램 결함은 원인을 확인해 구분한다.
- NOT_CHECKED는 필요한 입력·수요·적용 조건 또는 계산 경로가 갖춰지지 않았다는 뜻이다. N_A로 대체하지 않는다.
- 개별 OK와 프로젝트 complete, KDS 방법 검토, designTransferAllowed, fabricationApproved는 별도 상태다. KDS 문서 출처·해시 존재만으로 계산법이나 전체 설계 적합성이 승인되지 않는다.
- 부분 보완으로 다른 NG가 남을 수 있다. 혼합 접합의 후크를 수정해도 관통 철근 깊이 부족은 그대로 보고한다. 하중·재료 강도·지반값을 합격을 위해 변경하지 않는다.
- 결과에 stale가 표시되면 현재 입력과의 결속을 다시 확인한다. 조합·source·상세 버전·근거를 보존한 최신 평가로 보고서를 만든다.

## 적용 실패와 되돌리기

적용 후 해석이 실패하면 같은 후보 적용 requestId로 후속 해석을 재시도할 수 있다. 되돌리기를 선택하면 `undo_design_input`에 현재 inputHash와 `expectedRequestId`를 함께 전달한다. 후보 적용은 후보 receipt의 requestId, 일반 typed 입력은 적용 응답의 inputRequestId(미리보기 요청 ID)가 대상이다. 이후 사용자 입력이 최신 이력이면 `UNDO_TARGET_MISMATCH`로 거부하고 그대로 보존한다. `redo_design_input`에도 동일한 대상 보호 옵션이 있다. 대상 없는 기존 최신 이력 undo/redo는 계속 사용할 수 있다.

## 작은 재현 사례와 확인 범위

```sh
node tools/run-phase25-tests.mjs --list
node tools/run-phase25-tests.mjs p25-m6-mixed-hook-webmcp
```

위 선택 시험은 합성 3면 RC 접합을 공통 WebMCP 입력으로 만들고 후보 적용·재해석까지 진행한다. 후크 수정, 관통 깊이 NG 유지, 9개 접합 검사와 KDS 근거 보존, 중복 요청의 버전 중복 방지를 확인한다. 실제 건물이나 전체 상세 적합성 시험이 아니다.

실행 증거는 새 `verification/evidence/phase25/focused-*` 디렉터리에 기록된다. 사례의 비교 출력은 `output/phase25/joint-mixed-repair-webmcp-audit.json`에 생성되며 재실행하면 이 사례 출력 파일은 갱신된다. 테스트 정의는 [재현 코드](../../tests/p25-m6-mixed-hook-webmcp.mjs)를 참조한다.

원래 범위와 미충족 조건은 [M0~M10 작업명세](WORKPACKAGES.md), [마감 점검표](CLOSURE_AUDIT.md), [후속 검증 계약](VERIFICATION_HANDOFF.md)을 따른다. 현재 작업에는 새 배포·전체 종합회귀·독립 검토 완료 주장이 없다.

## 단계 응답 수치 합성

`compose_rc_service_stages`에 inputHash, memberId와 최대 3개의 iterationId/comboId/factor를 전달하면 현재 저장된 서비스 변위장을 합성한다. source hash와 기준 출처를 반환한다. 크리프/순간 적분 변위장에는 positions로 최대 64개의 오름차순 위치(m)를 지정한다. 이 응답은 위치별 값이며 부재 전체 최대변형은 아니다. 저장 결과 2건을 사용한 뒤 새 해석이 필요하면 사용을 마친 결과를 release_rc_service_iteration으로 해제한다. 합성 결과는 재하 이력·장기 적합성 판정이 아니다.

`extrema: true`와 `boundary`(chord/cantilever-start/cantilever-end)를 지정하면 지원되는 일정 강성 구간·하중에서 내부 최대 축변형/횡변위를 계산한다. positions를 함께 주면 위치 값도 반환한다. 최대 128구간이며 미지원 하중은 거부한다. 이는 수치 극값이며 재하/부착 시점의 장기 설계 적합성 판정은 별도다.


단계 합성 v4의 `sources[].timeState`에서 원본 재하/평가 재령과 크리프·수축 근거를 확인한다. 순간해석의 재령과 부착 재령은 `null`이며 자동 추정하지 않는다. `chronologyQualified: false`는 부착 이후의 장기변형 판정을 완료하지 않았음을 뜻한다.


체크포인트 복원은 작업 기록이 없는 세션에서 실행한다. 입력 미리보기·실행 취소 이력·검토·후보·RC 결과 또는 진행 중 계산이 남아 있으면 `CHECKPOINT_RESTORE_REQUIRES_EMPTY_RUNTIME`으로 거부한다. 현재 작업을 저장한 뒤 새 세션에서 복원하거나, 체크포인트와 일치하는 저장 결과의 명시적 해제 경로를 사용한다. 복원 실패 때문에 현재 작업 이력을 지우지 않는다.


장기 곡률 처짐 검토의 `postAttachmentCalculation`은 공통 검토 결과에 준비된 계산 기록이다. 보고서에서 조합·기간·구간별 계수·부착 전 공제와 최종 수요/허용값을 확인할 수 있다. 이는 전역 크리프 재분배나 축력/양축 프레임의 장기 판정까지 승인하는 기록은 아니다.


## 접합 보완 탐색 및 조회 계약

`get_design_modules`의 `moduleId: "optimization"`에서 `designCapabilities.sectionRepair.jointRepair`를 조회한다. reinforcement/member-review의 `sectionRepairRef`는 이 공통 설명을 가리킨다. 전체 목록 응답에는 동일 설명을 반복하지 않는다.

현재 평가를 입력으로 후보를 생성하고 적용한 뒤에는 반환된 새 evaluationId를 사용한다. 혼합 접합에서는 후크→기둥 깊이→후프 배치→관통 보/후크 위치 보완이 각각 다른 후보일 수 있다. 적용할 때 연결 부재를 재해석한다. `ok:false`, `code: "JOINT_CAGE_NO_QUALIFIED_LAYOUT"`이면 같은 조건으로 반복 적용하지 않는다. `generation.trials`의 공간 간섭/구속 실패를 검토해 다른 상세나 건축 조건을 입력해야 한다. 이는 제한된 탐색 결과이며 가능한 모든 배치가 존재하지 않는다는 증명은 아니다.

기둥 확대의 모서리 접촉 보존, 후프/크로스타이 분리, 종방향 철근 간섭, 전체 접합 적합성은 각각 독립 검사다. 하나가 OK가 되어도 다른 검사에 자동으로 구속 기여나 합격을 부여하지 않는다.


## 2026-09-13 부착 시점 축력·양축 장기변형 연결

- 콘크리트 재료에 부착 재령, 부착 시점 크리프 계수와 근거, 건조수축 값과 근거를 추가했다. 최종 재령 입력은 유지한다. 부착 상태를 최종 상태에서 암묵적으로 복사하지 않는다.
- 동일 입력·지속하중 조합으로 `attachment-effective-modulus`와 `sustained-effective-modulus`를 실행하고, 공용 `compose_rc_service_stages.postAttachment`에서 최종 변형장 − 부착 변형장의 극값을 구한다. 축변형 u와 양방향 처짐 v/w를 각각 지정 허용변위와 비교한다. 개별 결과의 최대값끼리 빼지 않는다.
- 화면의 결과 선택/판정과 WebMCP가 같은 준비 결과 및 Markdown 계산서를 사용한다. 재료/재령/하중 조합 불일치, 비현재 결과, 빈 허용값을 거부한다. 화면 이탈 후 이전 요청의 늦은 완료가 새 요청 상태를 바꾸지 못하게 했다.
- 두 결과 저장·복원 후 판정 해시와 계산서 일치를 확인했다. 결과 보관 상한 2개와 임시 작업 메모리 반환 정책을 유지했다.
- 범위는 동일 타설 재령·일정 지속하중·지정 계수 유효탄성계수의 두 재령 근사다. 응력이력 적분, 부착 후 추가 활하중, KDS 허용값 자동 산정, 전체 설계 승인은 포함하지 않는다. KDS 14 20 10 / 14 20 30 출처·조항을 기록하되 수치 OK와 KDS 적합성 미확정을 구분한다.
- 선택 검사 6개 PASS: `verification/evidence/phase25/focused-2026-09-13T05-56-46-966Z/SUMMARY.json`. 실제 Worker·WebMCP의 축력/양축 합성 시험을 별도 변환단면 탄성 공식과 대조했으며 오차 < 1e-9 m. 시험의 허용값 1 mm는 임의 검증값이다. 실제 건물·전체 회귀·브라우저 화면·배포 검증을 뜻하지 않는다.
- 상세 사용법: `docs/phase25/ATTACHMENT_TIME_REVIEW.md`. 생성 계산서: `output/phase25/rc-attachment-review.md`, 동일 원시 기록: `output/phase25/rc-attachment-review.json`.
