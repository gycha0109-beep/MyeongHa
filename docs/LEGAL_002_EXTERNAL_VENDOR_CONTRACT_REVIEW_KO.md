# LEGAL-002-A 명하 외부 개인정보 처리업체 계약·DPA 검토 v1.0

> 기준일: **2026-10-13 KST**
> 상태: **공식 약관 확인 + 연결 계정 메타데이터 확인 + 정적 소스코드 대조 완료 / 실제 배포·국외이전 적법성 최종 승인 보류**
> 범위: OpenAI, Supabase, Vercel, PortOne. 업무 수탁·국외 이전·민감정보·플랜 이용약관은 각각 별도로 판단한다.
> 이 문서는 법률 의견서가 아니다. 법률 요건의 충족을 자동으로 보증하지 않는다.

## 핵심 판정

| 항목 | 실제 명하 증거 | 공식 문서 대조 | 결론·조치 |
|---|---|---|---|
| **OpenAI API** | `apps/api/src/openai-seyeon-structured-provider-v1.ts`: Responses API 요청 구성, `store: false`, 입력은 `JSON.stringify(request.input)`; 기본 origin `api.openai.com`, 선택적 gateway origin 가능 | 2026-01-01 시행 OpenAI DPA는 서비스 계약에 통합. API 기본값 학습 미사용. Abuse monitoring은 일반적으로 30일, `store: false`는 애플리케이션 응답 저장 거부이지 abuse log 전체 0일 보장을 뜻하지 않음 | **별도 종이계약을 무조건 요구할 근거 없음**. 계정의 API 약관·DPA 적용, API 데이터보관 옵션, 실제 request.input 속성 및 활성 provider 확인. ZDR 계약/설정이 이미 있다는 주장 금지 |
| **Supabase** | 연결된 명하 프로젝트: **Singapore `ap-southeast-1`**, `ACTIVE_HEALTHY`; 소속 조직 **Free 플랜**. auth proxy 소스 연결 | 2026-08-01 Supabase DPA는 서비스 약관의 일부. 프로젝트 선택 리전에 주 DB/Auth/Storage/백업 저장, 운영·지원 및 재수탁 처리가 다른 지역에서 발생할 수 있음 | 명하 DB 주 저장 지역은 **싱가포르로 확인**. 국내 이용자 개인정보 국외 보관/위탁 검토 필수. 별도 DPA 서명이 반드시 필요하다는 근거 없음; 각 계정 실제 약관 수락 확인 권장 |
| **Vercel** | 연결 명하 프로젝트 `myeongha` / 팀 `johnny-self`의 현재 요금제는 **Hobby**. `vercel.json` Functions `sin1` | 공식 Vercel 약관 4조: Hobby는 **개인·비상업적 사용만**. 2026-03-31 시행 DPA는 **Pro·Enterprise** 이용자의 처리계약에 편입됨 | **정식 상업 운영 전 플랜 변경 또는 다른 호스팅 선택 필요**. Hobby로 영리 웹서비스 운영을 승인하지 않음. 무료 베타라도 상업적 서비스의 홍보·고객획득을 목적으로 하면 약관 위험 검토. `sin1`만으로 전체 개인정보의 싱가포르 보관은 보장되지 않음 |
| **PortOne** | PortOne V2 결제 기술선정. 사전문의 접수, 실PG 계약/라이브 비활성 | PortOne 보안 FAQ에 고객사=개인정보 위탁자, 코리아포트원=수탁자. 공개 개인정보 처리방침 내 '코리아포트원 / 결제 연동 서비스 제공' 안내. **별도 위탁계약이 필요한 경우 `security@portone.io` 문의** | 현재는 실제 거래 미개시. 결제 개시 전에 수탁자 명칭 및 실PG 계약 구조 확인 후 대외 방침 반영. PortOne 자동 안내 ≠ 실제 PG/카드사 승인 |

## 1. OpenAI API 상세

- 명하 코드는 `store: false`를 명시적으로 보낸다. 이는 Responses API의 **Application State 저장에 관한 제어**다.
- OpenAI 공식 안내의 기본 표는 Responses API **학습 미사용 / Abuse Monitoring 30일**(예외 가능). '학습 미사용' ≠ '요청 텍스트 즉시 파기' ≠ '국외 이전 미발생'.
- 2026년 DPA가 OpenAI 서비스계약에 포함된다는 약관을 확인했다. 별도 수기 서명 필요성은 고객별 계약 형태에 따라 다르지만, 전 고객에게 별도 서명을 요구한다는 근거는 없다.
- **추가 잠재 경로:** 명하 OpenAI provider 코드에는 origin이 `https://ai-gateway.vercel.sh`인 경우 Gateway 전용 `providerOptions`가 구성된다. 이 경로가 운영에 사용 중인지는 **미확정**.
- Gateway 사용 시 OpenAI 단독 외에 Vercel AI Gateway가 요청 경유자가 된다. Vercel의 별도 AI Gateway ZDR/no-training 정책 및 선택 provider/credential 방식 검증이 필요하다.
- Gateway 팀 전체 ZDR은 Vercel 공식 안내상 **Pro/Enterprise**에서 제공. 현재 Hobby가 이를 활성화했다고 단정하지 않는다.
- 실제 개인정보 이전 내용은 요청 생성 코드의 `request.input` 생성 호출부를 추적하여 별도 확정한다. 현재 분석만으로 모든 채팅·사주 출생정보가 무조건 전송된다고 고지하지 않는다.

공식 근거:
- https://openai.com/ko-KR/policies/data-processing-addendum/
- https://openai.com/business-data/
- https://developers.openai.com/api/docs/guides/your-data
- https://vercel.com/changelog/zero-data-retention-no-prompt-training-on-ai-gateway
- https://vercel.com/blog/zdr-on-ai-gateway

## 2. Supabase 상세

- 실제 연결된 **명하** 프로젝트의 region: **`ap-southeast-1` Singapore** (Supabase 연결 계정 조회).
- 다른 이름의 별도 프로젝트가 한국 리전에 존재할 수 있다는 사실만으로 명하 개인정보가 한국에 보관된다고 추정하지 않는다.
- Supabase의 DPA(2026-08-01, version 1)는 서비스 계약의 일부이며 데이터 처리자 역할·재수탁업체·지역 설정을 규정한다.
- Supabase의 2026-10-06 지역 FAQ는 핵심 DB/Auth/Storage/백업 리전 보관을 설명하면서 **모든 처리의 단일국가 보장을 부인**한다.
- 명하 개인정보 처리방침의 국외보관 항목에서 싱가포르 DB 저장 가능성은 실증된 운영 증거로 반영할 후보. 데이터 종류·법적 근거·업체 연락처·보유기간·재수탁은 최종 실사 필요.

공식 근거:
- https://supabase.com/legal/customer-resources/data-processing-addendum
- https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq
- https://supabase.com/docs/guides/platform/regions

## 3. Vercel 상세 — **상업화 선행 조건**

- Vercel 연결된 팀/프로젝트 메타데이터에서 명하 프로젝트의 **Hobby** 이용을 확인했다.
- Vercel Hobby 약관은 'personal or non-commercial use'에 한정한다. **무료 베타가 자동 허용되는 것은 아님**. 실제 운영 목적이 영업·상업적 고객 유치인지도 고려한다.
- DPA 공식 2026 버전은 Pro/Enterprise에 대한 적용을 기술하며, 해당 요금제에서 계약 일부로 효력이 생기는 구조. Hobby가 동일한 DPA 적용을 보장한다고 주장 금지.
- `vercel.json`의 `regions:["sin1"]`은 Functions 실행 지역 설정이다. CDN, 로그, 빌드, 운영지원 등 데이터 처리지역 전부를 규정하는 계약은 아니다.
- **조치 후보(미승인)**: a) Pro로 전환하고 약관/DPA 재확인, b) 상업적 이용이 허용되는 다른 호스팅으로 이전. 유료 변경·배포 이전은 사용자 별도 승인 필요.
- 개인정보 관점에서 서비스 로그 및 입력 데이터에 민감정보가 유입되는 경우, Vercel DPA 내 금지/제한 데이터 조항과 실제 콘텐츠 처리 범위를 별도 검토.

공식 근거:
- https://vercel.com/legal/terms
- https://vercel.com/legal/dpa
- https://vercel.com/docs/plans/hobby

## 4. PortOne 상세

- PortOne 공식 FAQ는 개인정보의 위탁자와 수탁자 관계를 명시하며 공개 방침에 `코리아포트원 — 결제 연동 서비스 제공`을 기재하도록 안내한다.
- 별도 위탁 계약이 필요한 경우는 `security@portone.io`에 문의하라고 안내한다. **따라서 계약서 작성을 무조건 필수로 강제하거나, 개인정보 처리방침 열람만으로 상거래 계약 체결로 간주하지 않는다.**
- 최종 PG사는 사전문의 결과 및 정식 PG 심사 전 미확정. 계약·카드사 심사 전 해당 PG를 확정 수탁/제공사라고 공표하지 않는다.

공식 근거:
- https://help.portone.io/content/portone-security
- https://privacy.portone.io/

## 5. 국내 개인정보 보호법 국외 이전 기준

- 개인정보 보호 포털 공식 해설: 국외 이전에는 국외 제공뿐 아니라 국외 처리위탁·보관이 포함됨.
- 개인정보보호법 제28조의8의 국외 이전 적법 근거로 별도 동의, 법률 근거, **정보주체와 계약 이행에 필요한 위탁·보관 + 처리방침에 필수 정보 공개** 등 별도 수단이 존재.
- '모든 국외 API 이용은 사용자 별도 동의가 의무'라는 단정도, 'DPA만 있으면 별도 조치 불필요'라는 단정도 금지.
- 개인정보 처리방침에는 실제 처리업체별 이전 국가, 항목, 방법, 목적, 보관기간 및 적법 근거를 확인하고 관련 고지 의무를 충족해야 한다.
- 제공업체 표준 DPA는 한국법상 국외 이전의 별도 요건·고지 의무를 자동으로 대신하지 않는다.

공식 근거:
- https://www.privacy.go.kr/front/contents/cntntsView.do?contsNo=367

## 6. 증거 수준 및 보류

| ID | 남은 검증 | 상태 | 확인 주체 |
|---|---|---|---|
| EXT-ACC-01 | **Vercel Hobby 상업이용 해소** | **상업 출시 선행 조건 / 사용자 유료결정 필요** | 사용자 승인 후 실행 |
| EXT-ACC-02 | Supabase 명하 프로젝트 Singapore 저장 및 DPA 기재 | 리전 실증 완료, 방침 반영/법적 경로 검토 | Legal/Privacy |
| EXT-ACC-03 | 실제 운영 AI endpoint: OpenAI 직접 vs Vercel Gateway | 코드상 두 가능성 확인 / 배포값 미확인 | 배포 접근 권한 필요 |
| EXT-ACC-04 | OpenAI `request.input` 실제 구조·필드 최소화 | 요청 코드 일부 확인 / 호출원 확인 필요 | Engineering/Privacy |
| EXT-ACC-05 | Vercel 환경변수 명칭 메타데이터 접근 | 연결 API 403으로 실증 실패; **비밀값 요청·복사 없음** | 필요한 권한에서 재확인 |
| EXT-ACC-06 | 개인정보 처리방침 업체별 항목·국외 이전 고지 | 실제 업체·목적·국가 확인 후 채움 | Legal/Privacy |
| EXT-ACC-07 | PortOne 실PG 선정·위탁 계약 적용 | 사전문의 회신 대기 | 사업자/Commerce |
| EXT-ACC-08 | 실제 AI 사용 계정의 DPA·ZDR 설정 | 공식 문서 확인 / 계정 상태 미확인 | 계정 관리자 |
| EXT-ACC-09 | Vercel AI Gateway 사용 시 개인정보 경유·ZDR | 사용 경로 미확정 | Engineering/Privacy |

## 원본 정책과 관계
- `docs/LEGAL_002_PRIVACY_POLICY_DRAFT_KO.md`의 외부 업체·국외 이전 빈칸을 확정하는 검토 자료다.
- `docs/LEGAL_002_EXTERNAL_DATA_PROCESSING_AUDIT_KO.md`의 **정적 코드 실사**를 최신 공급자 약관·사용자 계정 메타데이터로 보강한다.
- `docs/OPS_LAUNCH_READINESS_GATES_KO.md`의 무료 공개·유료 공개 게이트 중 **Vercel Hobby 계약 위험을 추가 공개 차단 선행조건**으로 기록한다.
- 이 문서는 실제 결제, 계정 삭제 최종 실행, 법률 고지 자동게시, 요금제 변경을 승인하지 않는다.
