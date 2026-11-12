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

## 2026-11-12 — 합성 GEPA Python 기반 이미지 고정

- Docker Official Image `python:3.14-slim`의 멀티플랫폼 이미지 인덱스를 `sha256:9aaa474097d094040649f2162a627c0049b408f52138d980916788d80f04802f`로 조회·확인하였다. GitHub Actions의 `linux/amd64` 자식 이미지는 `sha256:ac25e5afbfdb4a94ff99cc24b0345719210133144481480bcba6085efa36a341`, Python 버전 표기는 `3.14.10-slim-trixie`이다.
- 기존 격리 컨테이너 및 GEPA 검증 Dockerfile에 같은 고정 이미지 참조를 적용한다. 태그가 변경돼도 합성 검증의 Python 기반 이미지가 조용히 교체되지 않도록 한다.
- **이 변경은 Python 기반 이미지 하나만 고정**한다. 빌드 중 apt 패키지 및 pip 의존성 전체의 재현 가능한 잠금, 실제 공급자 요금·승인·유료 송신, 대화 품질 개선까지 증명하지 않는다.
- Docker 공식 빌드 기준: https://docs.docker.com/build/building/best-practices/ · 이미지 출처: https://hub.docker.com/_/python
