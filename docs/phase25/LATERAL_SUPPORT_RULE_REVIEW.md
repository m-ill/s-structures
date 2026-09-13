# 횡지지 150 mm 조건 해석 검토

상태: OPEN — KDS 규칙 변경 근거 불충분. 2026-09-12 검토.

## 확인한 원문과 코드

- 공식 KCSC에서 확보한 `verification/evidence/phase24/kcsc/142050-text.txt`의 4.4.2(3)③은 모서리/하나 건너 철근의 횡지지와, 띠철근을 따라 횡지지된 인접 철근의 150 mm 순간격 조건을 함께 서술한다. 출처: https://kcsc.re.kr/OpenApi/CodeViewer/KDS/142050
- `src/design/rc/kdsConfinement.js`는 네 모서리 지지철근의 인접 간격을 제한하고, `src/design/rc/crossTieSupports.js`는 지지된 철근의 둘레 순서에 따라 간격을 판정한다.
- ACI가 게시한 *Longitudinal Bar Spacing and Intermediate Ties*의 설명은 직접 지지되지 않은 철근에서 지지된 철근까지의 거리를 조건으로 설명한다. 출처: https://www.concrete.org/publications/internationalconcreteabstractsportal.aspx?m=results&pubs=SPCI&tic=cross+ties+column

## 판단

네 모서리만으로 직접 지지되는 큰 단면이 현재 간격 조건으로 NG가 될 수 있다. 이것이 KDS 원문의 의도와 다른지는 이번 자료만으로 확정할 수 없다. ACI의 설명은 문제를 발견하는 비교 근거이며 KDS 적용 판정을 변경하는 권한이나 근거가 아니다. 현재 NG를 프로그램 오류로 확정하거나 자동으로 OK로 바꾸지 않는다.

## 해소에 필요한 작업

1. 해당 KDS 판본의 해설/공식 질의회신/국내 적용 상세를 확보하여, 직접 지지된 모서리 사이의 조건과 중간 비지지 철근의 조건을 구분한다.
2. 독립 검토자가 적용 판본과 해석을 기록한다. 도면 네 사례(4개 모서리만, 중간철근 1개, 연속 비지지 2개, 모든 철근 직접지지)를 비교한다.
3. 150 mm 경계의 등호, 순간격과 띠철근을 따르는 길이의 정의를 확정한다.
4. 확정 후 공통 횡지지 판정 owner로 단순 사각형과 cross tie 경로를 통합하고, 모든 사례의 TDD 후 WebMCP 후보/보고서까지 검증한다.

이 이슈는 자동 배근 수정의 불필요한 추가철근 추천 가능성과 관계된다. 해소 전까지 자동 설계 완료나 독립 KDS 적합성 증거로 계상하지 않는다. 다른 구현 작업은 계속 진행할 수 있다.
