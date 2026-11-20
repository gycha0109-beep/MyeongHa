# 여울 실제 문체 평가 → GEPA 피드백 연결 v0.1

> 트랙: character-runtime-lab · 연구용 · 운영/사주 권위 미변경

## 이번 구현

- 기존 GPT-6 Luna v5/v6 실측 9쌍(18개)을 그대로 읽어 **로컬 전용 사람 평가 HTML**을 생성한다.
- 사람은 각 버전의 **한국어 자연성(0~4)**, **여울 고유성(0~4)**, **종합 선호(v5/v6/동률)** 를 분리해 평가한다. 장면별 안전·관계·기억·사주 근거 실패는 별도 체크한다.
- HTML은 서버 전송 없이 JSON을 다운로드한다. 리뷰 JSON과 실측 대사 원문은 저장소에 커밋하지 않는다.
- 원문 SHA-256, 9개 상황 ID, 점수 범위, 하드 실패 코드, 9개 응답 평가의 완전성을 검사한다.
- 실제 사람 점수만 0~1 범위 **개발용 GEPA 피드백**으로 변환한다. 점수는 0.45×자연성/4 + 0.45×고유성/4 + 선호 가산(0/0.05/0.1). **하드 실패가 있으면 0점**.
- 피드백에 원문/평가자 자유 서술은 넣지 않고 **응답 SHA-256**과 정규화된 점수·실패 코드만 전달한다.
- 공개된 기존 9쌍은 개발 자료이며 독립 홀드아웃이 아니다. **새 프롬프트 후보에 대한 GEPA 실제 최적화 완료가 아니다.**

## 실행

```powershell
# 파일 경로는 각자 실제 실측 응답 경로로 지정
python research/character-optimization-gepa/yeoul_human_gepa_feedback.py --input <results.json> --html <local-review.html>
# 브라우저에서 평가 후 내려받은 JSON:
python research/character-optimization-gepa/yeoul_human_gepa_feedback.py --input <results.json> --review <yeoul-human-review.json> --feedback <local-feedback.json>
python -m unittest discover -s research/character-optimization-gepa -p 'test_yeoul*.py'
```

평가가 9/9 완료되지 않은 경우 `can_use_as_gepa_development_feedback=false`를 유지한다. 어떤 점수도 임의로 작성하지 않는다.

## 실행 증거와 남은 일

Academy PC에서 실측 9쌍(18개) 기반 HTML 생성 성공, 사람 평가 0/9 처리 및 정규화된 피드백 생성 금지 확인. 관련 12개 오프라인 테스트 통과. 사람 평가 완료 후에만 피드백을 다음 최적화 실행에 연결할 수 있다.

- **미완료:** 사람이 직접 평가한 점수 확보, 실제 LM 응답을 후보 프롬프트와 결합한 GEPA 평가 반복, 별도 사주 보고서 근거 fixture를 이용한 문체 비교.
- **범위:** Python 연구 도구 및 로컬 리뷰 HTML 생성, 기존 Canon/사주 엔진/캐릭터 운영 변경 없음.
