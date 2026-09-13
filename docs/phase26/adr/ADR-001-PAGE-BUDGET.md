# ADR-001 — 도면 페이지 예산의 기본값

2026-09-13 · 상태: **채택** · 대상 P26-A01~A05

## 배경

`buildDetailDrawings`의 기본 `maxPages`는 60이다. 그런데 제품 경로는 **아무도 그 기본값을 쓰지 않는다.**

| 호출부 | 사용 예산 |
| --- | --- |
| `drawingWorker.js` | `maxPages:600` |
| `pdfVolumeBundle.js` | `maxPages:600`, `pageOffset: volume*60`, `pageLimit:60` |

즉 60은 **PDF 한 권의 크기**이지 문서 전체의 상한이 아니다. Phase25 M8/M9에서 권 단위 분권(`volume`, `nextVolume`, 전체 쪽수·권수, 권별 해시)을 구현했고, 60쪽을 넘는 결과는 **분권으로 처리**하기로 이미 결정했다.

기본값 60은 그 결정이 내려지기 전의 잔재이며, 예산을 명시하지 않는 직접 호출자만 걸려 넘어진다. 실패 5건 중 4건이 정확히 이 경우다(`buildDetailDrawings(snapshot)`).

## 측정

합성 페이지네이션 스냅샷(52개 철근·이음 검토 52행) 기준. [원자료](../../../verification/evidence/phase26/baseline-20260913/page-budget-cost.json) · [재현](../../../verification/evidence/phase26/baseline-20260913/page-budget-cost.mjs)

| 구성 | 쪽 | 시간 | 힙 증가 |
| --- | --- | --- | --- |
| 기본값 60 | 실패 `DRAWING_PAGE_LIMIT` | 38.2 ms | 7.22 MB |
| `maxPages:600` | 64 | 34.6 ms | 8.48 MB |
| `maxPages:600` + 60쪽 보관창 | 60 | 25.4 ms | 5.11 MB |
| `maxPages:600` + `checkRetention:'reference'` | 64 | 24.9 ms | 11.42 MB |

**메모리를 좌우하는 것은 상한이 아니라 보관 창이다.** 상한을 60에서 600으로 올린 비용은 이 픽스처에서 +1.3 MB이고 시간은 오히려 줄었다. `pageWindow.js`가 전체 쪽수는 세되 요청 구간만 보관하도록 이미 설계돼 있기 때문이다.

## 결정

1. **`buildDetailDrawings`의 기본 `maxPages`를 60에서 600으로 올린다.** 제품 호출부가 실제로 쓰는 값과 일치시킨다. 기존 상한 검사(`maxPages>600` 거부)는 그대로 두어 하드 실링은 유지한다.
2. **`vectorPdf`의 PDF 한 권 60쪽 제한은 바꾸지 않는다.** 이것은 분권 계약의 단위다. 60쪽을 넘는 문서는 `pdfVolumeBundle`로 나눈다.
3. **`pdfVolumeBundle`의 권당 60쪽 창도 바꾸지 않는다.**

## 근거

- 기본값을 올리는 것은 **운영 한도의 확대가 아니다.** 제품 경로는 이미 600을 쓰고 있었고, 상한 검사와 분권 계약은 그대로다. Phase25가 남긴 "제품 한도 증액 아님" 원칙과 충돌하지 않는다.
- 대안(호출부 4곳에 `{maxPages:600}`을 일일이 추가)은 같은 함정을 다음 호출자에게 그대로 남긴다. 기본값이 실제 사용값과 다른 것이 결함이다.
- 상한을 없애지 않는다. 600은 `pageWindow`가 세는 전체 쪽수의 실링으로 계속 작동한다.

## 영향

- `drawingWorker`·`pdfVolumeBundle`은 예산을 명시하므로 동작이 바뀌지 않는다.
- 예산을 명시하지 않던 직접 호출자는 60쪽에서 끊기지 않고 전체 문서를 얻는다.
- P26-A05는 이 변경으로 해결되지 않는다. 전체 문서를 `buildVectorDetailPdf`에 그대로 넘기기 때문이며, 분권 경로를 쓰도록 고친다. **PDF 권 크기를 늘려 회피하지 않는다.**
