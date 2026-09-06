# Verification Runners

검증 evidence·baseline·suite 실행기의 canonical 위치다. Phase 16 P16-M2에서 49개 실행기를 이곳으로 이동했다.

- `package.json`과 신규 자동화는 이 경로를 직접 사용한다.
- 기존 `tools/` 명령 49개는 외부 스크립트 호환을 위해 얇은 launcher로 유지한다.
- launcher는 검증 로직을 포함하지 않고 canonical 실행기를 별도 Node 프로세스로 전달한다.
- 제품 build·backup·사용자 CLI는 이 폴더의 책임이 아니다.
