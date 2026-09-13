# 부착 시점 축력·양축 장기변형 검토

2026-09-13 개발 기록. 전체 Phase25 또는 KDS 적합성 완료 선언이 아니다.

## 입력과 실행 순서

1. 콘크리트 재료의 기존 최종 시점 크리프 입력과 함께 `creepAttachmentCoefficient`, `creepAttachmentAgeDays`, `creepAttachmentReference`를 입력한다. 최종 건조수축이 있으면 `attachmentShrinkageMicrostrain`과 `attachmentShrinkageReference`도 명시한다. 최종 재령은 부착 재령 이상, 두 재령은 재하 재령 이상이어야 한다.
2. 같은 모델 입력 해시에서 `run_rc_service_iteration`을 `stiffnessMode: fully-cracked-elastic`로 두 번 실행한다. 각각 `timeEffect: attachment-effective-modulus`, `timeEffect: sustained-effective-modulus`를 지정한다. 같은 지속하중 service 조합을 사용한다. 중간에 재료나 모델을 수정하면 현재성 검사를 통과하지 못한다.
3. `compose_rc_service_stages`에 부재, 같은 하중 조합, 최종 결과 factor +1과 부착 결과 factor -1, `extrema: true`, 상대변형 기준 `boundary`를 보낸다.
4. `postAttachment`에 `attachmentAgeDays`, `evaluationAgeDays`, `history: constant-sustained-coeval`, `limits: {u, v, w}`, `limitReference`를 보낸다. limits는 검토할 축만 입력하고 하나 이상 필요하다. 단위는 m이며 부재 로컬 축이다. 양 끝 연결선 또는 시작/끝 고정 캔틸레버 기준은 실제 검토 경계조건에 맞춰 선택한다.
5. 화면에서는 RC 사용성 해석의 부착/최종 재령 모드로 각각 실행한 뒤 ‘부착 후 축변형·양방향 처짐’ 패널에서 두 결과와 허용값을 선택한다. ‘부착 후 변형 판정’이 동일 공용 서비스를 호출한다.

## 결과와 근거

`postAttachmentReview`는 각 축의 극값, 부호, 위치, 허용값, 비율, OK/NG를 보관한다. `report.content`는 이 준비 결과를 그대로 표시하며 보고서에서 재계산하지 않는다. 원본 단계 ID·해시·재료 시간 상태는 합성 결과의 sources에 남는다. 계산법은 Eeffective = Eloading / (1 + 지정 크리프 계수)의 두 끝 시점 근사다.

KDS 출처의 존재는 이 근사법의 승인이나 허용값의 적합성을 증명하지 않는다. 결과는 `kdsCompliance: NOT_ESTABLISHED`, `designTransferAllowed: false`를 유지한다. 추가 활하중 변형과 재령별 응력이력은 포함하지 않으므로 전체 최종 장기 사용성 판정과 구분한다.

## 구현 경계

- 재료 입력: concreteCreep / practicalInputContract / practicalDesignInputs.
- 상태 해석: rcCoupledIteration / rcServiceIteration / rcStageTimeState.
- 공용 판정: rcServiceWorkflow / rcPostAttachmentReview.
- 표시: rcPostAttachmentReport / rcAttachmentReviewControls / WebMCP practicalTools.
- 기존 두 결과 보관 상한을 유지하며, 추가 Worker 상주 결과를 만들지 않는다. UI 비동기 요청의 이탈/복귀 경합을 차단한다.

## 최소 TDD 증거

- 초기 attachment 선택 무시 RED → 명시 시점 선택 GREEN.
- 초기 판정 모듈 부재 RED → 공용 준비 판정 GREEN.
- 실제 Worker 시험 과정의 누락된 재료 필드와 전역/로컬 축 oracle 매핑을 수정했다. 이를 해석기 수치 오류로 분류하지 않는다.
- 최종 선택 6개 검사: `verification/evidence/phase25/focused-2026-09-13T05-56-46-966Z/SUMMARY.json`.
- 독립 탄성 변환단면 공식과 축력·양축 값 대조, 허용값 OK/NG, 시점 불일치 거부, 저장·복원 해시/계산서 동일성, UI 늦은 응답 경합 확인.
- 합성 시험 결과 u=0.223061 mm, v=0.125009 mm, w=0.702058 mm. 각 축 임의 허용 1 mm 기준 OK이며 KDS 허용값 시험이 아니다.
- 전체 회귀·실제 건물·브라우저 실화면·공개 배포는 이번 범위에서 실행하지 않았다.

- 계산서 조항 표기 보완 후 추가 선택 검사 `verification/evidence/phase25/focused-2026-09-13T05-57-33-509Z/SUMMARY.json`: 실제 attachment Worker/WebMCP 4043 ms, 기존 크리프 반복 10967 ms, 재료 크리프 입력 1317 ms PASS.
