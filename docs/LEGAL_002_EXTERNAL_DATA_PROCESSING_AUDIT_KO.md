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

## 2026-10-23 L3-A 실제 코드·연결 계정 추가 검증

> 다음은 **전송 코드의 허용 경로와 전송 후보 데이터 계약**의 증거이며, 운영에서 개별 이용자 요청이 실제 발생했다는 패킷 증명이 아니다. 운영 비밀값·프롬프트 원문을 수집하지 않았다.

| 상대방 | 이번에 확인된 사실 | 추가로 필요한 실증 |
| --- | --- | --- |
| **Supabase** | 명하 연결 프로젝트 `MyengHa`는 `ap-southeast-1`(싱가포르), `ACTIVE_HEALTHY`, PostgreSQL 17. 다른 `Refund_management` 프로젝트는 별도 서울 리전이며 **명하의 국내 저장 근거가 아님** | 데이터별 실제 수집·저장 항목, 계약 적용·이전 목적 및 기간, 처리방침의 이전 국가·위탁자 정보. Supabase 공식 리전 FAQ에 따르면 DB/Auth/Storage/백업의 지정 리전과 로깅·지원·CDN의 처리 지역이 다를 수 있음 |
| **OpenAI / Vercel AI Gateway** | `production-seyeon-turn-send-runtime-v1.ts`: 서버의 `OPENAI_API_KEY`가 존재하면 OpenAI 직접 경로, 없으면 Vercel OIDC + `ai-gateway.vercel.sh` 경로. `openai-seyeon-structured-provider-v1.ts`: Responses API 요청에 `store: false`와 `JSON.stringify(request.input)` 전송 | 어떤 경로가 실제 배포에서 선택되는지, 약관·DPA·국가별 실제 전송·보관/재사용 정책, 요청/응답/모니터링 로그·삭제 지원. `store: false`는 **모든 서비스 로그 보존 0**을 보증하지 않음 |
| **AI 요청 데이터 항목** | `seyeon-character-runtime-v2.ts`의 `buildSeyeonTurnInterpreterRequestV2`는 `context`를 전송. `seyeon-runtime-context-v2.ts`의 `recentConversation[].text`(최근 사용자/AI 대화), `retrievedMemories[].summary`(승인된 삶의 기록/기억/관계 이벤트 요약), 관계·결속·사전검증 정보 및 캐릭터 운영 정책 등이 포함될 수 있음. 동일 코드의 Renderer/Review도 관련 packet/초안을 입력으로 사용 | 실서비스 시점의 **어떤 정보가 승인·필터되어 요청에 포함되는지**와 각 단계의 캡처/중복 전송/로그를 값 제외한 스키마·통계로 검증. 생년월일이 고정 필드로 매번 포함된다고 단정 불가하며 자유대화·기억에 민감정보가 섞일 위험은 존재 |
| **Vercel** | 2026-10-23 Vercel 연결 Git 프로젝트·팀 플랜 조회에서 `johnny-self`의 현재 **`hobby`** 요금제와 `myeongha` GitHub 연결을 직접 재확인. 다만 DPA 적용·모든 처리 리전은 확정 불가 | **Hobby 현재 재확인 완료**. Vercel 공식 약관 제4조상 비상업적 이용 한도이므로 영리 출시 전에 플랜 전환 또는 상업사용 가능한 호스팅 선택 필요. 유료 플랜 변경·배포는 별도 승인 없이는 수행하지 않음 |
| **PortOne / PG** | 현재 Payment V2 연동 코드·내부 환불 검증 존재, 공개 판매 HOLD | 실제 PG 계약/수탁·제공 구조, 결제 주체·고지·보관 항목. 운영 결제 사용 중이라고 확정하지 않음 |

### 현행 국내법 연결 및 확인 조건

- 개인정보 보호법 **제28조의8제1항·제2항**: 국외 **보관·위탁도 국외 이전 범위**, 적법 근거와 필요한 정보(항목, 국가·시기·방법, 수령자/연락처, 목적·기간, 거부방법·효과) 검증. 계약 이행에 필요한 위탁·보관과 처리방침 게시 등의 조건을 충족하는 예외가 있으므로 **국외 이전=일률 위법/무조건 별도 동의**는 금지.
- 개인정보 보호법 **제26조·제30조**: 실제 위탁자·수탁자 및 목적, 처리방침 최신 내용 확인. DPA 자체가 국내 처리방침 고지·적법 근거를 대체하지 않음.
- 공식 근거: https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029334953 · https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1034292881 · https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq · https://vercel.com/legal/terms

**L3 판정:** 국외 저장 리전과 AI 송신 후보 필드는 확인. 하지만 운영 송신 구성·실제 위탁 계약/법적 근거/고지의 교차 증명이 없으므로 **출시 적법성 미확정**, 미승인 신규 유료 원문 외부 전송 계속 금지. `P0-PR-02` 제품 정책은 변경하지 않는다.

## 2026-10-24 L3 추가: PortOne V2 **연령 본인확인**의 국외처리·개인정보 최소화 증빙

> 본 절은 `L2 A1` 비적용 코드의 **정적 데이터 흐름**만 기록한다. PortOne 실제 인증업체 계약, PG/기관 하위 처리자, 처리가 일어나는 국가 및 보존·재위탁 사항은 확인되지 않았다. **운영 `OFF`**, 실명의 실제 송수신 미검증.

| 단계 | 저장소 근거 | 서버/외부/브라우저 필드 | 승인 및 위험 |
| --- | --- | --- | --- |
| 브라우저 발급 | `portone-v2-preenrollment-http-runtime-v1.ts`, `portone-v2-preenrollment-age-authority-v1.ts` | 브라우저에는 `identityVerificationId`, 공개 `storeId`, `channelKey`, 만료시각만. 보안 쿠키 `__Host-myeongha-preage-v1`은 HttpOnly/Secure/Strict·600초. 원문 쿠키는 DB에 저장하지 않고 서버 비밀키 HMAC만 저장 | 클라이언트 확인·신고 나이 및 자가 생일은 법적 연령 권위가 아님 |
| PortOne 본인확인 | `apps/web/portone-v2-identity-flow.js`, `portone-v2-identity-verification-lookup-v1.ts` | **미승인 비활성 단계**에서 SDK를 미로딩. 승인 발급 후 공식 브라우저 SDK 및 서버 GET `https://api.portone.io/identity-verifications/{id}` 계약. 공급자 인증 화면에서 수집·위탁되는 항목은 계약 기준으로 별도 확정 필요 | 실제 처리 주체/국가·연락처·보유기간·취급 정보 확정 전 개인정보 처리방침 완성 불가 |
| 나이 판정 | `portone-v2-identity-verification-contract-v1.ts`, `portone-v2-preenrollment-finalization-v1.ts` | 공급자 서버 결과의 `status=VERIFIED`, 일치하는 인증 ID, `verifiedCustomer.birthDate`를 **서버 메모리에서만** 최소 밴드(`free_minor` 또는 `adult`)로 정규화. CI/DI·전화번호·실명·생일 원문을 신설 테이블에 저장하지 않음 | 이것은 저장소 계약이며 실제 PortOne 응답/로그의 데이터 최소화를 운영에서 증명한 것이 아님 |
| 인증 전 임시 저장 | 비적용 `1741_portone_preenrollment_age_authority_v1.proposed.sql` 및 `PORTONE_PREENROLLMENT_PRIVACY_DISPOSITION_CANDIDATE_V1.json` | `identity_verification_id`, cookie HMAC digest, 2단계 상태, 연령 밴드, DB 시각. 10분 TTL·1회 소비; 미사용/소비된 행도 만료 후 system 작업자가 물리 제거해야 함 | 만료 물리 정리 포트는 소스만 구현, 운영 스케줄·실 DB 적용 없음 |
| 계정 권위 귀속 | `cmd_bind_verified_member_preenrollment_v1`, `cmd_create_verified_guest_session_v1` SQL 제안 | 미사용 증거를 새로운 서버 확인 회원/게스트의 `subject_id`와 `legal_portone_verified_age_v1`에 원자 결속. 계정 및 기존 본인확인 기록의 최종 파기정책 후보는 별도 검토 | 가입 전 증거와 실제 인증 주체의 법적 동일인 검증 범위/절차는 공급자 계약·운영 실증 필요 |

- **현재 활성화 금지:** `MYEONGHA_PORTONE_PREENROLLMENT_HTTP_MODE`, `MYEONGHA_PORTONE_IDENTITY_HTTP_MODE`, 관련 `APPROVED`/마이그레이션 표시는 실제 사용자 계약·DB 적용 승인 없이 변경하지 않는다. 기존 59개 테이블 삭제정책(46 DELETE, 4 ANONYMIZE, 9 RETAIN), P5Y/P30D은 이 제안에 의해 자동 개정되지 않는다.
- **출시 전 필요 증명:** PortOne 공급자/하위 인증업체의 위탁·제3자 제공·국외이전 분류, 정확한 수집 항목·보관/파기·거부 효과, 계약 및 개인정보 처리방침 합치, 본인과 가입 계정의 결속 수준, 공급자 응답 원문이 관측 로그에 남지 않는지, 서버·브라우저 쿠키 및 10분 물리 삭제의 운영 검증.
