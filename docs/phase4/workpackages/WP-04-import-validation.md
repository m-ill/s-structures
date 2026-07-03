# WP-04 도면/점군 import 실증

stage: V / milestone: P4-M4 / tickets: P4-T17~T21 / 크기: L
status: not-started

## Objective

P3-M7~M9(DWG/평면 인식, 점군)를 proven으로 승격한다. 핵심은 **실데이터(E3)**: 실제 DWG 1건, 실측 점군 1건, 대용량 성능 실측, 손상 파일 내성.

## Scope

**In**: 실파일 e2e, 실측 검출 리포트, 성능 실측, fuzz, 승격.
**Out**: 인식 알고리즘 고도화(정확도 미달 시 포지셔닝 조정 — R5), 신규 포맷.

## Preconditions

1. ODA File Converter 설치 (개발 머신) — 다운로드·설치 절차를 문서화하며 진행.
2. 실무 DWG 오너 제공 요청 발송 / 공개 점군 데이터셋 후보 조사 (실내 스캔 공개셋 중 건물 구조가 보이는 것).

## Work Breakdown

### Step 1. DWG 실파일 e2e (T17)
1. ODA 설치 → `tools/convert-dwg.mjs` 경로 설정 → 변환 실행 로그 확보.
2. 실무 도면(또는 공개 CAD 샘플) 변환 → DXF 파이프라인 → 후보 생성 → 검토 UI 확정 → validation 통과 모델 → 탄성해석 ok까지 전 과정 기록: `docs/verification/IMPORT_FIELD_VALIDATION.md` DWG 장 (단계별 스크린샷/카운트).
3. 변환기 부재 환경: 경로 미설정 상태에서 안내 UX(오류 코드·가이드 링크) 동작 스크린샷 증빙.
4. 발견된 미지원 entity/인식 실패는 표로 기록 — 수정 대상과 한계 명기 대상 구분.

### Step 2. 실측 점군 검증 (T18)
1. 공개 데이터셋 1건 확보 (출처·라이선스 기록). 가능 시 오너 스캔 추가.
2. ground truth 수작업 라벨: 층 elevation, 기둥 위치 (검토 UI로 수동 확정한 결과를 GT로 사용).
3. 자동 검출 실행 → recall/precision/오차 리포트 생성 → `reports/validation-evidence/pointcloud-field/`.
4. 결과가 합성 벤치마크 대비 크게 낮으면 R5 프로토콜: 목표 재설정(보조 도구 포지셔닝) + `STATUS_AND_LIMITS` 문구 초안.

### Step 3. 성능 실측 (T19)
1. 합성 생성기로 1e7점 파일 생성 (커밋 금지 — 생성 스크립트만).
2. 로드+전처리 시간, 피크 메모리, 뷰어 프레임타임 실측 → `reports/validation-evidence/pointcloud-perf.json`.
3. 예산(30초/2e6점 60fps) 대비 판정 — 미달 시 TD 등재 (최적화는 WP-06).

### Step 4. Fuzz (T20)
1. 손상 파일 생성기: 절단/헤더 오염/카운트 불일치/비정상 float(NaN·Inf)/거대 선언 카운트 등 20케이스 (PLY·PCD·LAS·DXF).
2. `tests/p4-pointcloud-fuzz.mjs`: 전 케이스 crash 없이 오류 계약(코드·메시지)으로 수렴.

### Step 5. 승격 (T21)
M7~M9 proven 전환 (M8·M9는 실측·성능 증빙 링크 필수), evidence register 등록.

## Deliverables

`docs/verification/IMPORT_FIELD_VALIDATION.md` / 실측·성능 리포트 / fuzz 테스트 / 승격 커밋 3건.

## Acceptance Criteria

1. DWG 실파일 전 과정 기록 존재 (변환기 부재 UX 포함).
2. 실측 점군 리포트 존재 — 목표 달성 또는 R5 조정 결정 기록.
3. 성능 실측값이 예산 게이트에 등록됨.
4. fuzz 20케이스 crash 0. 완성도 감사 M7~M9 = proven.

## Verification Procedure

`npm test` + fuzz 테스트 + 문서의 재현 절차대로 제3자(오너)가 DWG e2e 1회 재연 가능해야 한다.

## Risks & Rollback

R1(실파일 미확보) — 공개 샘플 대체 + 한계 명기. R5(실측 정확도) — 포지셔닝 조정 프로토콜. 대용량 실측 중 OOM 등은 TD 등재하고 예산 게이트에 현재값 기록(미달 상태로 두지 않고 WP-06 입력으로).

## Result

(완료 시 기입)
