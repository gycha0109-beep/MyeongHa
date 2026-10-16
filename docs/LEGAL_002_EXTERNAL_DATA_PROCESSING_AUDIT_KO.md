# LEGAL-002 외부 개인정보 처리 경로 — 저장소 증빙 실사 v0.1

> 기준일 2026-10-13 / **정적 소스코드 확인 결과**. 운영 배포 런타임, API 실제 송수신, 공급자 DPA/계약서, 저장지역 확인과 별개.
> 외부 전송 가능성을 '실제 운영 중' 또는 '국외 이전 법정 요건 충족'으로 단정하지 않는다.

| ID | 시스템/상대방 | 저장소 증거 | 확인된 사항 | 미확인 사항 |
|---|---|---|---|---|
| EXT-01 | OpenAI API | `apps/api/src/openai-seyeon-structured-provider-v1.ts` | `api.openai.com` HTTPS Responses API 연동 코드 존재. 대화 이력·기억·사용자 메시지 등이 입력 데이터로 취급될 수 있음을 서버측 안전 경계 텍스트에 명시. | 현 배포 라우팅·모델 결정(P0-AI-01 OPEN), 실제 요청 JSON 필드, 국외 이전·보관·학습·DPA·계약 주체 |
| EXT-02 | Supabase Auth | `apps/api/src/supabase-auth-http.ts` | 사용자 인증 프록시, 이메일/세션 취급 및 서버측 Supabase Origin 검증 구현. | 실제 테넌트 프로젝트·데이터 지역·보관·위탁 계약 |
| EXT-03 | Vercel | `vercel.json` | `myeongha.vercel.app` 웹 호스팅, 함수 리전 `sin1` 설정과 CSP `connect-src 'self'`. | 단일 리전 설정이 모든 로그/DB/처리의 지역을 보증하지 않음. 실제 로깅·운영 계약 검토 |
| EXT-04 | PortOne V2/실PG | `docs/P0_DECISION_REGISTER.md` P0-CM-02; Commerce 환불 문서 | 웹 단건 PSP 결정. | 본계약·PG·개인정보 위탁/제공·실결제 승인 미완료. 실제 결제 정보 처리는 별도 판매 승인 뒤 |
| EXT-05 | 기타 분석·이메일·외부 모델·오류 수집 | 추가 런타임 실사 필요 | 정적 조사만으로 활성 업체 전수 목록 확정 불가. | SDK/서버 환경 변수명(값 제외), 실제 호출 URL, 쿠키·로그·보관 조건 |

## 주요 교정 사항
- OpenAI 코드가 있다는 이유만으로 이용자의 모든 대화와 출생정보가 반드시 OpenAI로 전송된다고 고지하지 않는다.
- Vercel Functions의 `sin1`은 특정 실행 리전 설정일 뿐 개인정보 모든 저장·처리의 거점 확정이 아니다.
- Supabase Auth 코드가 있다는 이유만으로 이메일 등 모든 수집 항목/지역을 확정하지 않는다.
- 보안상 비밀키, DB 접속문자열, 실 사용자의 대화 및 식별정보는 조사 문서에 쓰지 않는다.
- P0-PR-01의 35 DELETE/4 ANONYMIZE/9 RETAIN P5Y/P30D 분류는 **승인된 정책**이며 운영 삭제 동작 증명은 별도.
- 개인정보처리자 및 개인정보 보호책임자 정보는 사업자정보 확정 전 기재 금지.

## 배포용 개인정보 처리방침으로 승격하기 위한 증거
1. 배포 환경의 실제 AI provider/model·서버→외부 API 요청 데이터의 키 수준 도식(내용값 비수집).
2. Supabase/Vercel/PG 등 서비스별 계약·DPA/처리위탁 조건, 국외 이전 국가·보관·접근·재위탁 근거.
3. 실제 데이터 수집 폼, 제3자 궁합·관상 기능 공개 여부, 게스트·회원 구분.
4. 삭제·철회·계정 탈퇴·백업 복구 이후 개인정보 처리 실행 검증.
5. 쿠키/로그/모니터링/CS 수집 항목 및 법적 보존기간.
6. 사업자/연락처/권리행사 절차와 개인정보 처리방침 UI 실제 게시 확인.

## 참조
- `docs/LEGAL_002_PRIVACY_POLICY_DRAFT_KO.md`
- `docs/P0_DECISION_REGISTER.md`
- `docs/operations/ACCOUNT_DELETION_FINALIZATION_PREFLIGHT_V1.md`

**판정:** 정적 코드 기반 외부 처리 경로 1차 확인, 위탁/제3자 제공/국외 이전 **법적 항목은 아직 승인 불가**.
