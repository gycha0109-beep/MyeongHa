# 세연 첫 인사 실제 모델 5회·3회 비교: 오너 키 1회 실측 (2026-10-20)

Watchtower-Track: character-memory

## 승인·범위
사용자는 타인의 만료 가능성이 있는 `OPENAI_API_KEY2` 대신 **자신의 기존 GitHub Actions Secret `OPENAI_API_KEY` 사용을 명시적으로 승인**했다. 이번 승인 대상은 Synthetic 공개 첫 인사 N01 한 건을 기존 5회(Terra x5)와 후보 3회(Luna x1, Terra x2) 각각 실행하는 **단 한 번의** 섀도 평가다. 비밀키를 파일에 기록하거나 로그에 노출하지 않는다. 실사용자 데이터, Production 대화·DB·권한·Canon, G0~G6 단계, 모델 운영 라우팅, 이전 Gold는 수정하지 않는다.

## 이전 실패 증거와 예산
- 기존 오너 아닌 KEY2 평가: #39220957680은 실제 Gold 2회 HTTP 200 후 분류 과잉으로 중지, 6,554 microUSD 예약.
- 이전 E2E 시도 #39225780485는 JS 구문 오류로 호출 0건.
- 수정 E2E KEY2 시도 #39350184578에서 Legacy preflight `integrity_classification`과 `disclosure_classification` 2건 모두 HTTP 401, 응답 토큰 불명. 160,000 microUSD(400원) 선예약; 사용량 0이라고 청구액 0을 입증하는 것은 아님. 후보는 미실행.
- 이번 오너 키 최대 8회, 건별 80,000 microUSD(200원), 합계 640,000 microUSD(1,600원) 선예약. 이전 두 배치 합계 166,554 microUSD와 이번 최대 640,000 microUSD를 보수적 환율 2,500원/USD로 계산하면 누적 약 **2,016.385원**으로 기존 추가 예산 5,000원 아래. 실제 공급자 인보이스/프로젝트 하드캡을 검증했다는 주장은 하지 않는다.

## 실행 가드와 판정
- 독립 단발 `main` marker 트리거, 변하지 않는 GitHub `GITHUB_SHA` checkout, 첫 push run attempt 1, workflow 실행 횟수 딱 1, 과거 실패 #39350184578의 불변 확인.
- 요청당 JSON 본문 최대 24,576 bytes 및 모델 출력 최대 1,536 tokens, 요청 전 파일 동기화 선예약, 최대 총 8 요청, 자동 재시도 없음. Usage 누락, 비정상 HTTP, 단계·예산·의미 검증 실패 시 HOLD. 기존 두 preflight 단계는 서버 런타임 정책상 병렬 수행될 수 있다.
- 평가 로그·artifact에는 원문, 프롬프트, 응답 문장, 실제 개인 정보를 담지 않고 numeric 단계·경로·토큰·시간·오류만 기록한다.
- 성공해도 공개 첫 인사 1건의 자동 Guard 비교뿐이며 캐릭터의 자연스러움·다중 턴·비밀 기억·관계 진행이나 Production 승격을 입증하지 않는다. 실제 사용 승인/청구 정산도 별도다.
