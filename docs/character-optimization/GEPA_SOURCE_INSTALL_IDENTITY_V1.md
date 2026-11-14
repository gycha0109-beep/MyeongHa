# GEPA 설치 소스·Python 실행 이미지 신원 검증 v1

> 2026-11-13 · character-runtime-lab · 연구용 / 실제 모델 호출·운영 변경 금지

## 해소하는 계약 결함

기존 GEPA 오프라인 CI와 Dockerfile은 공식 GEPA 소스 커밋을 문자열로 각각 별도 지정했다. Dockerfile의 빌드 매개변수로 다른 커밋을 덮어쓸 수도 있었다. 이미 Docker 이미지의 Python 베이스 태그는 다중 플랫폼 인덱스 SHA-256으로 고정돼 있지만, **실제로 설치한 Python 패키지의 VCS 커밋과 Python 실행 버전을 런타임에서 교차 검사하지 않았다.**

## 변경

- `research/character-optimization-gepa/requirements.lock`에 공식 GEPA 소스 고정 커밋 `ce5b0d6e3d6af6c6dbec6de2c54536bbb961d309`을 한 줄로 기록한다. Dockerfile과 CI 가상환경 설치가 동일한 파일을 참조한다.
- Dockerfile에서는 외부에서 GEPA 커밋을 변경할 수 있는 빌드 매개변수를 제거한다.
- `verify_gepa_environment.py`는 Python `3.14.10`, 설치한 GEPA 패키지의 `direct_url.json` 출처 URL·Git 커밋·요청 리비전 및 설치 목록 한 줄이 각각 고정값과 일치하는지 확인한다. 불일치 시 연구 실행을 거부한다.
- 고정 GEPA 이미지는 **네트워크가 차단된 실제 컨테이너 안에서** 이 신원 검사를 통과한 뒤 기존 실제 GEPA 합성 시험을 실행한다. 변조·누락·타 소스 반례도 오프라인 단위 시험에 포함한다.
- 별도 오프라인 프로세스와 GEPA 후보/평가 권한 및 원화 500원 게이트에는 영향 없음.

## 입증되지 않은 것

**이 파일명은 Python 패키지/apt의 모든 전이 의존성에 SHA-256 해시가 붙은 완전한 잠금이라는 뜻이 아니다.** Python 기반 이미지와 GEPA Git 커밋은 고정했지만 빌드 시점의 apt 패키지 버전·pip 빌드 격리 도구 및 모든 외부 배포 아티팩트를 완전히 해시로 잠그지 않았다.

또한 `pip freeze --all`은 설치 상태를 기록할 뿐 그 자체가 완전한 해시 기반 잠금 파일이 아니다. 후속 환경 재현성은 이 한계를 유지한 채 판정한다. 공식 pip 참조: https://pip.pypa.io/en/stable/cli/pip_freeze/ 및 https://pip.pypa.io/en/stable/topics/repeatable-installs/ .

이 신원 확인은 실제 대화 품질, 사람 검토, 독립 최종평가, 네트워크 송신 승인, 실결제 게이트의 충족을 증명하지 않는다. **유료 모델 호출·크레딧 충전 0회, 누적 예산 상한 500원, Canon/사주/기억/관계/운영 변경 없음.**

## 2026-11-14 — 공식 GEPA 빌드 도구의 해시 잠금 및 분리된 설치

- 기존 GEPA Git 소스 SHA `ce5b0d6e3d6af6c6dbec6de2c54536bbb961d309`과 Python 3.14.10 기반 이미지 고정은 그대로 둔다.
- 해당 소스의 실제 `pyproject.toml` 빌드 요구사항(setuptools>=77.0.1, wheel, build)을 확인했다. Python 3.14에서 필요한 5개 순수 Python wheel(빌드 도구 3종+의존성 packaging, pyproject_hooks)을 PyPI에서 다운로드하여 각 파일 SHA-256을 확인하고 `build-requirements-hashed.lock`에 버전과 파일 해시로 고정했다.
- Dockerfile/오프라인 GitHub 워크플로는 `pip --require-hashes --only-binary=:all: --no-deps`로 이 5종을 설치한 후, GEPA VCS 커밋을 `--no-deps --no-build-isolation --check-build-dependencies`로 설치한다. 즉, pip의 자동 격리 빌드 환경에서 가변 패키지를 다시 내려받는 경로를 제거했다.
- 런타임 검증은 잠금 파일의 정확한 5개 해시·버전 목록, 설치된 배포 패키지의 버전과 기존 GEPA Git 출처/소스 커밋을 대조한다. **이 검증만으로 실제 빌드 당시 설치 옵션을 증명할 수 없으므로** 결과에는 `buildIsolationRuntimeAttested=false`를 유지한다.
- Windows 집 PC Docker 실빌드 성공, `--network none`/읽기전용 소스/제한된 tmpfs에서 신원 검증과 실제 공식 GEPA 합성 실행 포함 Python 8건 성공. 유료 모델 요청·기존 사용자 원본·대화 데이터 사용은 0건.
- **미충족:** apt 패키지 버전·다운로드 아티팩트의 전체 해시 잠금, 공식 Git 소스에서 생성되는 wheel 결과 바이트의 독립 고정, OS 전이 패키지 증빙 및 실제 사람 평가/품질·운영 승인. 따라서 `transitiveDependenciesFullyLocked=false`는 계속 유지한다.

## 2026-11-14 — Debian APT 시점 고정 및 GEPA 빌드/실행 환경 분리

- 고정 Python 3.14.10 이미지의 원본 Debian APT 주석에 명시된 **2026-11-04T21:23:39Z** 시점을 `apt-snapshot.sources`에 고정하고, 공식 Debian 스냅샷의 서명된 trixie/trixie-updates/trixie-security 패키지 목록을 사용한다.
- 빌드 단계에서 `git=1:2.47.3-0+deb13u1`, `ca-certificates=20250419+deb13u1`을 명시한다. 기존 해시 고정 Python 빌드 wheel 5종, 공식 GEPA Git SHA 및 `--no-build-isolation` 설치를 유지한다.
- Docker를 두 단계로 분리한다. 첫 단계에서만 APT와 Git 및 GEPA wheel 빌드를 수행하며, 최종 실행 이미지는 **동일한 고정 Python 기반 이미지에서 새로 시작**해 설치된 Python 패키지 디렉터리만 복사한다. 빌드용 Git 실행 파일과 빌드 단계의 APT 스냅샷 설정 및 캐시는 최종 이미지에 포함하지 않는다.
- 집 PC Docker 실빌드와 `--network none --read-only` 실행에 성공했고, 공식 GEPA 커밋/빌드 wheel 신원 확인 및 가상 두 캐릭터 최적화가 포함된 Python 8건을 통과했다. 기존 CI에는 Git 실행 파일이 없는 최종 이미지 검증과 실 GEPA 합성 실행이 연결돼 있다.
- **아직 완전한 OS 의존성 바이트 잠금이라고 주장하지 않는다.** 저장소에 각 Debian 전이 패키지 .deb의 해시를 개별 기록하거나 다중 플랫폼의 설치 파일 집합을 독립 증명한 것은 아니다. 고정 시점 스냅샷은 의도적 갱신 전까지 오래된 보안 패키지를 사용하게 되며, 만료일 검사를 비활성화하는 대신 Debian 서명 검사를 유지한다. 실제 운영 이미지나 사용자 실측 GEPA 모델 송신에 사용하지 않는다.
- 합성 오프라인 재현성 향상은 사실이지만 사용자 원본 288건 사람 검토·새 독립 최종평가·신뢰 가능한 유료 승인 및 실제 응답 품질 개선을 입증하지 않는다. 총 500원 상한과 실제 유료 호출·운영 반영 0건 유지.
