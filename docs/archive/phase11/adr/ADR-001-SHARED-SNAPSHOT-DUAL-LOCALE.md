# ADR-001 — 공통 ReportSnapshot에서 언어별 PDF를 분리 생성

```yaml
adr: P11-ADR-001
status: accepted
date: 2026-07-23
decision_gate: P11-M0
accepted_at: 2026-07-23
```

## 배경

사용자는 한국어와 영어 보고서가 동시에 생성되기를 요구한다. 템플릿과 데이터 builder를 언어별로
복제하면 수치·조합·figure 선택이 달라질 수 있고 한쪽 수정이 다른 쪽에 반영되지 않는다.

## 결정

1. 한 번의 해석 run에서 language-neutral, immutable `ReportSnapshot` 하나를 만든다.
2. 한국어와 영어 renderer는 같은 snapshot과 `EvidenceManifest`를 읽는다.
3. 최종 산출물은 읽기 쉬운 **분리된 두 PDF**다.
4. 두 PDF는 같은 `reportSnapshotHash`와 `evidenceManifestHash`를 기록한다.
5. 한쪽 실패 시 pair manifest를 `complete`로 발행하지 않는다.
6. 합본 PDF는 P11-S2 optional output이며 S1 release 필수물이 아니다.

## 대안

### A. 한 PDF에 한·영 병기

- 장점: 파일 하나
- 단점: 페이지 수·표 폭·시각 밀도 증가, 언어별 사용자 배포가 불편

### B. 언어별 데이터·템플릿 완전 분리

- 장점: 구현이 단순해 보임
- 단점: 수치 drift와 유지보수 이중화 때문에 기각

### C. 실행할 때 사용자가 한 언어만 선택

- 장점: 출력 시간 감소
- 단점: “두 개 동시 생성” 요구와 parity 증명이 약해져 기본안으로 기각

## 결과

- report data schema는 자연어를 포함하지 않는다.
- locale catalog completeness가 release gate가 된다.
- PDF pair는 원자적 artifact로 취급한다.
- 성능 예산은 PDF 두 개 전체를 기준으로 측정한다.

## 승인 조건

P11-M0에서 scope, file naming, atomic pair, hash parity와 browser fallback 정책을 검토한 뒤
`accepted`로 변경한다.

## 승인 기록

P11-M0에서 다음을 확인하고 승인했다.

- 필수 locale은 `ko-KR`, `en-US`이며 산출물은 분리된 두 PDF다.
- 하나의 language-neutral snapshot과 evidence manifest를 공유한다.
- 한쪽 실패 시 complete pair manifest를 발행하지 않는다.
- browser fallback은 print-ready HTML까지만 보장하며 무음 PDF 저장을 가장하지 않는다.
- M0에서는 신규 runtime dependency를 추가하지 않는다.
