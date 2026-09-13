# P11-M3 결정론적 Visual Capture Core 코드리뷰

```yaml
milestone: P11-M3
reviewed_at: 2026-07-23
status: PASS
critical_findings: 0
high_findings: 0
release_qualified: false
```

## 결론

`CaptureSpec`, 동일-frame canvas compositor, PNG 무결성 검사, `EvidenceManifest` 및 실패
reason code가 구현되었다. 동일 입력 10회에서 PNG SHA-256이 일치했고, 1600×900 최소 해상도,
blank·zero-byte·stale·timeout·cancel 차단, view state deep-equivalent 복원과 임시 canvas
buffer 정리를 확인했다.

## 검토 범위

- `src/report/phase11/visualCapture.js`
- `src/core/stableHash.js`
- `tests/p11-m3-visual-capture-core.mjs`
- `tools/run-p11-m3-evidence.mjs`

## 판정

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| CaptureSpec 결정성 | PASS | 정렬된 layer와 snapshot/model/result/capture hash |
| base+overlay 합성 | PASS | 단일 output frame에 고정 순서 합성 |
| PNG 품질 gate | PASS | signature, IHDR, 최소 크기, blank, zero-byte 검사 |
| stale/failure gate | PASS | 열거형 reason code로 fail-closed |
| 상태 복원·정리 | PASS | 성공·timeout 후 원래 view 복원, orphan buffer 0 |
| 브라우저 호환성 | PASS | production 모듈에서 Node 전용 crypto 의존성 제거 |
| 보안·개인정보 | PASS | 로컬 경로와 사용자 식별자를 capture contract에서 제외 |

## 잔여 범위

M3는 캡처 코어 계약을 검증한 단계다. 실제 모델·하중·변형·반력·이용률 등 필수 7개 scene
producer와 한·영 보고서 삽입은 P11-M4에서 수행한다. 따라서 Phase 11 전체
`release_qualified`는 아직 `false`다.
