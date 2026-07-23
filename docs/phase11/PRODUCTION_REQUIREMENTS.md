# Phase 11 Production Requirements

```yaml
version: p11-requirements-v1
status: planned
reviewed_at: 2026-07-23
scope: P11-S1
```

## 1. 데이터·판정 요구사항

| ID | 요구사항 |
| --- | --- |
| P11-FR-DATA-01 | 모든 보고서는 versioned, language-neutral `ReportSnapshot`에서 생성한다. |
| P11-FR-DATA-02 | snapshot은 project/model/analysis/result/build schema와 content hash를 가진다. |
| P11-FR-DATA-03 | snapshot 생성 이후 report render와 capture 동안 model/result mutation을 허용하지 않는다. |
| P11-FR-DATA-04 | 양 언어 산출물은 같은 `reportSnapshotHash`를 기록한다. |
| P11-FR-DATA-05 | raw analysis token과 사용자 표시 문자열을 분리한다. |
| P11-FR-VER-01 | verdict는 `operational`, `numericalIntegrity`, `engineeringValidation`, `issueSuitability` 축을 각각 판정한다. |
| P11-FR-VER-02 | 전체 verdict는 `PASS`, `CONDITIONAL_PASS`, `REVIEW`, `FAIL` 중 하나이며 reason code 목록을 가진다. |
| P11-FR-VER-03 | 독립 기준해가 확인되지 않으면 전체 verdict는 `PASS`가 될 수 없다. |
| P11-FR-VER-04 | analysis 실패, 필수 감사 실패, stale snapshot 또는 필수 이미지 누락은 `FAIL`이나 export 차단으로 처리한다. |
| P11-FR-VER-05 | P-Delta 등 비활성·미지원 기능은 일반 프로그램 오류와 구분해 `not-in-scope` 또는 `not-verified`로 표시한다. |

## 2. 현지화 요구사항

| ID | 요구사항 |
| --- | --- |
| P11-FR-I18N-01 | 필수 locale은 `ko-KR`과 `en-US`다. |
| P11-FR-I18N-02 | 보고서 정적 문자열은 translation key로 관리하고 renderer에 자연어를 직접 하드코딩하지 않는다. |
| P11-FR-I18N-03 | 누락 key, 미사용 key, 잘못된 placeholder를 build/test에서 검출한다. |
| P11-FR-I18N-04 | 기술 식별자, 조합 ID, 부재 ID, 식과 단위기호는 번역하지 않는다. |
| P11-FR-I18N-05 | 날짜·숫자·단위·상태·caption은 locale formatter를 사용하되 원 수치는 바꾸지 않는다. |
| P11-FR-I18N-06 | 한국어판에 미번역 일반 영문 문구가, 영문판에 미번역 한국어 문구가 남으면 qualification을 차단한다. |
| P11-FR-I18N-07 | 한글 font는 최종 PDF에서 깨지지 않고 검색·복사가 가능해야 한다. |

## 3. 화면 증거 요구사항

| ID | 요구사항 |
| --- | --- |
| P11-FR-CAP-01 | 모든 화면 증거는 versioned `CaptureSpec`으로 계획한다. |
| P11-FR-CAP-02 | 필수 장면은 `model-isometric`, `model-plan-elevation`, `load-gravity`, `load-lateral`, `deformed-governing`, `reactions-governing`, `utilization-governing`이다. |
| P11-FR-CAP-03 | 장면은 model/result hash, case/combo, camera, viewport, pixel ratio, scale, visible layer와 결속한다. |
| P11-FR-CAP-04 | capture는 base canvas와 결과 overlay를 같은 frame에서 합성한다. |
| P11-FR-CAP-05 | animation, cursor, selection blink, timestamp-dependent UI와 transition을 안정화한 뒤 capture한다. |
| P11-FR-CAP-06 | 필수 이미지는 최소 1600×900 또는 동일 수준의 유효 해상도를 가진다. |
| P11-FR-CAP-07 | blank·단색·0-byte·잘못된 viewport·stale hash 이미지를 자동 검출한다. |
| P11-FR-CAP-08 | 이미지마다 번호, locale별 caption, active combo, 변형배율, 단위와 hash를 기록한다. |
| P11-FR-CAP-09 | 이미지가 없는 지원 불가 장면은 조용히 생략하지 않고 blocker 또는 명시적 limitation으로 남긴다. |

## 4. 보고서 요구사항

| ID | 요구사항 |
| --- | --- |
| P11-FR-RPT-01 | 첫 페이지 상단에 종합 결론과 판정 근거를 표시한다. |
| P11-FR-RPT-02 | 첫 페이지에 절점·부재·조합, 최대변위, 최대이용률, 평형잔차, governing combo와 감사 상태를 요약한다. |
| P11-FR-RPT-03 | 구조공학 검증 상태와 프로그램 동작 상태를 시각적으로 구분한다. |
| P11-FR-RPT-04 | 화면 증거를 대응 장에 배치하고 figure 번호와 본문 참조를 제공한다. |
| P11-FR-RPT-05 | 표가 페이지를 넘을 때 header가 반복되고 행·제목이 부자연스럽게 분리되지 않는다. |
| P11-FR-RPT-06 | limitations, not-verified, not-applicable과 unsupported 범위를 표지·본문·부록에서 일관되게 표시한다. |
| P11-FR-RPT-07 | 보고서 본문은 searchable text이며 표 전체를 이미지로 평탄화하지 않는다. |
| P11-FR-RPT-08 | 표지, 목차, 장 번호, figure/table 번호, 현재쪽/전체쪽, metadata가 일관된다. |
| P11-FR-RPT-09 | 동일 snapshot의 재생성에서 순서, figure 선택과 핵심 수치가 결정적이다. |

## 5. PDF·제품 workflow 요구사항

| ID | 요구사항 |
| --- | --- |
| P11-FR-EXP-01 | 하나의 export job이 한국어·영어 HTML과 PDF를 함께 계획·생성한다. |
| P11-FR-EXP-02 | 한쪽 PDF 실패 시 최종 pair manifest를 성공으로 발행하지 않는다. |
| P11-FR-EXP-03 | 산출물은 임시 경로에서 생성·검증한 뒤 최종 경로로 원자적으로 승격한다. |
| P11-FR-EXP-04 | PDF는 A4, embedded font, 검색 가능한 text, metadata, page footer를 가진다. |
| P11-FR-EXP-05 | PDF와 manifest에 source revision, snapshot hash, evidence hash, locale, report schema를 기록한다. |
| P11-FR-EXP-06 | 최종 HTML/PDF에 `file:///`, 홈 디렉터리, 사용자명, 토큰, 내부 tool marker가 없어야 한다. |
| P11-FR-EXP-07 | Electron은 좁은 preload/IPC 계약을 통해 `printToPDF`를 실행하고 renderer에 Node 권한을 노출하지 않는다. |
| P11-FR-EXP-08 | 일반 브라우저는 무음 PDF 저장을 가장하지 않고 두 HTML의 print-ready fallback을 제공한다. |
| P11-FR-EXP-09 | CLI adapter는 제품과 같은 snapshot/render/capture 계약을 사용한다. |
| P11-FR-UI-01 | UI는 `한·영 보고서 내보내기`, 진행률, 취소, 실패 reason, 결과 열기 동작을 제공한다. |
| P11-FR-UI-02 | preview는 실제 export snapshot hash와 일치해야 한다. |
| P11-FR-API-01 | Agent/API는 plan, run, status, cancel, artifacts를 UI와 같은 service로 제공한다. |
| P11-FR-API-02 | API 응답은 locale별 경로·hash·page count·byte size와 overall qualification을 포함한다. |

## 6. 비기능 요구사항

| ID | 요구사항 |
| --- | --- |
| P11-NFR-01 | 같은 source revision, snapshot, capture profile에서 핵심 데이터와 figure 선택은 재현 가능해야 한다. |
| P11-NFR-02 | S-tier office fixture의 분석 완료 후 dual-PDF export p95는 기준 Windows 장치에서 30초 이하다. |
| P11-NFR-03 | S-tier dual export peak working set은 1 GiB 이하이며 종료·취소 후 임시 창과 image buffer를 해제한다. |
| P11-NFR-04 | export 시작 acknowledgement는 100 ms 이하, 첫 progress event는 500 ms 이하, cancel acknowledgement는 2초 이하다. |
| P11-NFR-05 | 각 S-tier PDF는 기본 image profile에서 25 MiB 이하를 목표로 하며 초과 시 reason을 기록한다. |
| P11-NFR-06 | 최종 100% page render에서 clipping, overlap, tofu, black square, blank required figure가 0건이다. |
| P11-NFR-07 | 색상만으로 PASS/WARN/FAIL을 전달하지 않고 text·shape label을 함께 사용한다. |
| P11-NFR-08 | final HTML은 사용자 입력을 escape하고 executable script 없이 self-contained static document로 저장한다. |
| P11-NFR-09 | capture/export는 기본 로컬이며 사용자 승인 없이 네트워크 전송하지 않는다. |
| P11-NFR-10 | 생성 실패와 취소에서 partial final artifact, open handle, orphan process를 남기지 않는다. |
| P11-NFR-11 | report refactor 전후 동일 입력의 해석·설계 원 수치는 byte- 또는 tolerance-equivalent다. |
| P11-NFR-12 | production runtime 의존성 추가는 license, package size, offline install과 ADR 승인을 필요로 한다. |

## 7. 최종 release gate

- P11-S1 requirement가 traceability에서 `qualified`
- `ko-KR`/`en-US` 수치 parity 100%
- 필수 7개 장면의 hash·provenance·본문 참조 완비
- 모든 PDF page render visual gate PASS
- Korean font/search/copy gate PASS
- privacy/sanitization/failure-injection gate PASS
- UI·Agent/API가 같은 artifact manifest를 반환
- S-tier 성능·메모리 예산 PASS
- open Critical/High finding 0
- `PILOT-OFFICE-01` 3회 반복 export의 snapshot·evidence·수치 parity PASS
- 실제 release manifest가 PDF/HTML/PNG/evidence hash를 재검증

