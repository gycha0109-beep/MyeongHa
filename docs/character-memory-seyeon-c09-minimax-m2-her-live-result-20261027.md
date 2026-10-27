# C09 MiniMax M2-her — 승인된 OpenRouter 5문항 실험 결과 (2026-10-27)

Watchtower-Track: character-memory

## 실행 출처
- [실행 PR #2652](https://github.com/gycha0109-beep/MyeongHa/pull/2652) — 병합됨, merge commit `f95844cac074fca5973ab928b424636a826e2c58`.
- [필수 통합 검증 #40458100151](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40458100151) — success.
- [일회성 실험 #40458975392](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40458975392) — failure, **의도된 출력 중단 조건**.
- Job `122038824453`; artifact ID `12713865898` ([다운로드](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40458975392/artifacts/12713865898)).
- 고정 실행 소스 `0ccde655de4fec2fbf2be347b08aec93adab4f61`, `scripts/seyeon-c09-openrouter-minimax-m2-her-5x1-20261027.mjs`.
- 연구 PR #2575는 Draft·미병합 유지. Production 세연 모델·기억·관계·사주·DB 변경 없음.

## 실행 및 과금 관측 (GitHub Actions job 로그)
| 지표 | 관측 |
|---|---|
| 모델 | `minimax/minimax-m2-her` |
| 질문 | Q1 `나 오늘 너무 심심한데… 뭐 재밌는 일 없을까?` |
| 실행 전 공개카탈로그 최댓값 견적 | 5회 합계 $0.0174, hard cap $0.03 |
| 실제 POST 요청 | 1회 |
| 상태 | `TRUNCATED` (finish_reason=length / maximum output 900 tokens) |
| Q1 지연 | 676 ms (runner가 수집한 HTTP 응답시간) |
| 사용량 | prompt 527 tokens / completion 900 tokens / total 1427 tokens |
| 기록 비용 | $0.0012381 (실제 청구서 아님) |
| 정상 완료 | 0/5 |
| 미실행 | Q2 / Q5 / Q7 / Q10 |
| 재시도·대체 | 0 |
| 비공개 메모리·운영 라우팅 수정 | 0 |

## 원문·정성 관찰
Q1의 원문은 **마지막 문장까지 완결되지 않은 900토큰의 장문**이며, GitHub Actions job 로그의 `id:1` / `text` 필드와 아티팩트 JSON `records[0].output`에 **편집 없이 전부 보존**된다. 이 문서는 원문을 재생성·의역하거나 정상 응답처럼 짧게 고치지 않는다.

처음에는 "저도 심심한데요~"로 시작하지만 곧 스무디·산책·주전부리·버킷리스트 등으로 무관한 소재가 끊임없이 이동하고, 자신이 외출 중이라는 등 검증되지 않은 현재 상태를 언급한다. 이전 두 모델과 달리 이 단일 출력은 한국어 연속성, 1~3문장 제한, 관계·행동 일관성 평가에 적합하지 않다. **이 관찰은 Q1 한 회의 정성적 판단이며 MiniMax의 일반적 성능 결론이나 통계적 실패율이 아니다.**

## 결정
- 승인받은 일회성 유료 실험은 정상 중단 규칙에 따라 **1회 시도 후 종료**. 나머지 4문항 자동 호출 또는 동일 질문 재시도 **금지**.
- 기본형 3종 비교는 **Luna / GLM 완료, MiniMax Q1 출력 제한 실패 및 Q2·Q5·Q7·Q10 미실행**으로 기록한다.
- 기존 GLM·Luna 실측은 재사용하며, MiniMax 추가 과금 테스트에는 별도의 신규 승인과 비용·실험 조건 결정이 필요하다.
- 본 결과는 실제 production semantic review나 장기적 관계 테스트를 대체하지 않는다.
