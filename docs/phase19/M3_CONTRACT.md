# M3 탄성해석·설계 검토 계약

구현 버전 `p19-m3-elastic-review-v1`. 고정 검증 소스 `7683047ac3552672bd0c2dad8ae0919c6ae989e5`, 관련 시험 34/34 PASS. [증거](../../verification/evidence/phase19/m3/README.md).

## 사용 순서

탄성해석 탭의 **설계 입력 변경**에서 조합 ID를 지정한 정적 케이스를 만든다. **탄성 설계 검토**에서 케이스를 실행하고 완료 기록을 조합당 하나 선택한다. **설계 검토 실행 → 보고서 생성**으로 같은 기록의 HTML·JSON·CSV를 저장한다. 입력을 바꾸면 이전 결과는 stale로 표시되며 새 보고서 생성·내보내기를 차단한다. 기록은 페이지 세션 범위이며 영구 보존은 JSON 내보내기를 사용한다.

M3 패널과 in-page `SStructuresAgent`는 아래 같은 제품 서비스를 호출한다. 기존 전체 탄성해석 UI를 모두 교체한 것은 아니다. 신규 WebMCP 도구 등록은 M4 범위다.

| 메서드 | 입력 / 결과 |
|---|---|
| `planElasticWorkflow` | `{caseIds, computeTarget?}` → 입력 identity에 결속된 plan |
| `runElasticWorkflow` | `{plan, requestId}` → 비동기 순차 실행, 단계별 job/run ID |
| `planDesignReview` | `{sources:[{analysisRunId,comboId}]}` → 검증된 설계 plan |
| `startDesignReview` | `{plan, requestId}` → 명시적 계산 후 불변 designRun 기록 |
| `getDesignReview` | `designRunId` → 저장 결과와 stale; 누락 시 RESULT_REQUIRED |
| `createDesignReviewReport` | `designRunId` → 같은 snapshot의 한·영 HTML / JSON / CSV |
| `getDesignReviewReport` | `designRunId` → 이미 생성된 보고서 조회 |
| `getDesignReviewExportCapability` | `designRunId` → 수동 형식 / 자동 PDF 준비 상태 |
| `exportDesignReviewPdf` | `designRunId` → 기존 P11 export 작업; 미준비는 PDF_EXPORT_BLOCKED |

```js
const api = window.SStructuresAgent;
const plan = api.planElasticWorkflow({caseIds: ['MY-STATIC'], computeTarget: 'cpu'});
if (!plan.ok) throw new Error(plan.code);
const run = await api.runElasticWorkflow({plan, requestId: 'elastic-1'});
if (!run.ok) throw new Error(run.code || 'ANALYSIS_FAILED');
const reviewPlan = api.planDesignReview({sources: [{analysisRunId: run.steps[0].analysisRunId, comboId: 'MY-COMBO'}]});
if (!reviewPlan.ok) throw new Error(reviewPlan.code);
const review = api.startDesignReview({plan: reviewPlan, requestId: 'review-1'});
if (!review.ok) throw new Error(review.code);
const report = api.createDesignReviewReport(review.designRunId);
```

케이스·조합 ID는 실제 모델에 존재해야 한다. 동일 requestId 재요청은 중복 작업을 만들지 않는다. 변조·stale plan, 지원하지 않는 케이스, 중복 조합, 미완료 기록은 차단한다. 세션 상한은 plan별 64개, request 128개다.

## 해석 순서와 수요 연결

1차 정적 → static/Direct P–Delta → 모달 → RSA → 좌굴 → 선형 THA 순으로 기존 제품 실행기를 호출한다. 입력에 지정된 중력·preload 조합의 선행 정적 케이스가 같은 계획에 있으면 실패 시 종속 단계를 건너뛴다. 모달/preload 내부 준비는 각 solver가 담당한다. 이전 modal 결과를 재사용했다고 주장하지 않는다. 실패·취소·새 기록 미발행은 과거 성공 기록으로 대체하지 않는다.

설계 수요는 명시적으로 결속된 **1차 정적 또는 Direct P–Delta의 정확한 조합 결과**에서만 가져온다. envelope나 다른 조합으로 fallback하지 않는다. Legacy P–Delta는 기존 엔진의 비교 전용 정책에 따라 `PDELTA_COMPARISON_ONLY`로 차단한다. 모달·RSA·좌굴·THA·비선형의 부재 설계수요 mapping은 미지원이다.

강재·RC 기존 순수 설계 함수와 부재 수요 패키지를 사용한다. 사용성은 service 조합이며 변위가 완전할 때 계산한다. 각 검토는 해석 run ID, 조합, 부재, 식, 단위, 검정비, 상태와 규칙 모듈을 보존한다. 입력 identity가 기준·규칙판·build 버전을 결속한다. 상호작용 검토는 무차원 비/1로 보고해 서로 다른 차원의 수요를 더한 값으로 표시하지 않는다.

RC 입력 경고와 미지원 부재는 유지한다. 접합은 가정 내력에 대한 예비 검토다. 기초 필요 면적 계산은 실제 면적에 대한 안전 검토가 아니므로 NOT_CHECKED이며, 접합 상세·지반·침하·펀칭·배근 최종 검토는 완료하지 않았다. 전체 상태는 NG → NOT_CHECKED → WARN → OK 순으로 집계한다. 모든 결과는 preliminary / review-required / designTransferAllowed=false다.

## 보고서와 검증 경계

화면·JSON·HTML·CSV는 동일 불변 검토를 사용한다. P11 생산 보고서 렌더러에도 같은 검토 행을 부록으로 넣으므로 PDF transport가 서버에서 HTML을 다시 만들 때 누락되지 않는다. 조회·보고서 생성은 solver를 실행하지 않는다.

브라우저에서 HTML·JSON·CSV 다운로드 파일을 확인했다. HTML 수동 인쇄를 제공하지만 이번에 실제 인쇄/PDF를 생성·시각 검증하지 않았다. 자동 PDF는 호스트의 실제 P11 transport, 입력에 맞는 7개 figure manifest, qualification을 모두 요구한다. 기본 브라우저는 세 조건이 없어 명확히 차단된다. figure capture와 실제 PDF layout qualification은 별도 환경 검증 대상이다.

34개 시험은 M1/M2/WebMCP·설계·P11 회귀를 포함한다. 기존 STRIX 21 비교나 비선형 자격의 범위를 확대하지 않는다.
