# GEPA 소스와 API 버전 적합성

- 2026-11-11 공개 릴리스 `gepa==0.1.4`는 구 `GEPAConfig` 경로다.
- 공식 소스 `ce5b0d6e3d6af6c6dbec6de2c54536bbb961d309`에는 `OptimizeAnythingConfig`, `engine='gepa'`, `test_set` 등이 포함된다. **실제 설치·실행 검증 전까지 검증된 잠금 버전은 아니다.**
- `.github/workflows/character-gepa-offline-pinned.yml`에서 위 소스 SHA를 가상 환경에 고정 설치하고, 합성 평가·가짜 반사 전략·차단된 네트워크로 신규 API 호출을 실제 검증한다. 평가 데이터는 합성 메타데이터만 사용한다.
- 구 API로의 자동 대체를 금지하고, 실측 결과가 없어도 같은 기능이라고 가정하지 않는다.
- 실제 운영 호출의 통합 비용 게이트와 보호된 파일 접근 경계가 입증되기 전에는 유료 모델 호출을 활성화하지 않는다.

공식 출처:
- https://github.com/gepa-ai/gepa/blob/v0.1.4/src/gepa/optimize_anything.py
- https://github.com/gepa-ai/gepa/blob/ce5b0d6e3d6af6c6dbec6de2c54536bbb961d309/src/gepa/optimize_anything.py
- https://gepa-ai.github.io/gepa/api/optimize_anything/OptimizeAnythingConfig/