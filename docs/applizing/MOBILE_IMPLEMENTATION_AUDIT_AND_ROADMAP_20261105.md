# 명하 앱화 구현 현황 감사 및 로드맵 갱신 — 2026-11-05

> Watchtower-Track: applizing
> 상태: **코드·PR·CI 증거 기반 현황 정리 / 기능 변경 없음 / 앱 출시 완료 아님**
> 점검 기준: 2026-11-05 KST, GitHub main 2026-11-05 감사 시점(작성 당시 fc6a6044b991b9000f6da3332cbff53bb735e10f).
> 현재 작업 범위: 현행 모바일 구현 확인, 오래된 문서 정정, 기존 M0~M11 및 2026-10-16 Reader 경험 로드맵의 재기준화. 신규 상품/기능 승인 아님.

## 1. 증거 등급과 결론

- **코드 있음**: main의 실행 경로와 인터페이스가 확인됨. 실제 휴대전화 동작·운영 활성화 또는 스토어 배포 성공을 뜻하지 않는다.
- **CI 증거 있음**: 해당 PR의 Mobile PR Bundle/Full Integration 성공이 확인됨. Android 실기기 E2E의 대체가 아니다.
- **HOLD/OFF**: 앱에 비활성 코드는 존재하나 공개·구매·권한·서버·법적 전제 중 필요한 조건이 충족됐다는 증거가 없다. 임의 활성화 금지.
- **미확인**: 정확한 최신 main SHA로 만든 APK의 아티팩트, 전화기 설치·오프라인 실행 및 실사용 권한 왕복 등 증거를 이번 감사에서 확보하지 못함. 실패나 미구현으로 단정하지 않는다.

**핵심:** 앱은 Expo Router 기반 독립 네이티브 클라이언트이며 단순 WebView가 아니다. 화면·인증·무료 사주·기록·부분 채팅·로컬 관상 사진 준비·Push 기기 등록이 있다. 다만 웹 최신 UI/상품/문구의 자동 동기화는 없고, 유료 Reader·관상 분석·일반화된 채팅·Push 발송·실기기/스토어 출시는 완료 증명이 없다.

## 2. 현행 기술과 출시 경계

| 항목 | 확인된 사실 | 증거 |
| --- | --- | --- |
| 런타임 | Expo SDK 57.0.25 범위, React Native 0.86.3, React 19.2.3, Expo Router, TypeScript 6.0.2 | apps/mobile/package.json |
| 앱 식별 | Android/iOS com.myeongha.app, 앱 버전 0.1.0, android versionCode 1 / ios buildNumber 1 | apps/mobile/app.json |
| EAS | 프로젝트 5c20243c-60a8-44f3-9d8c-ca06ccc8bebe, physical-smoke Gradle assembleRelease, withoutCredentials | apps/mobile/app.json, apps/mobile/eas.json |
| 앱 API 원본 | https://myeongha.gycha0109.workers.dev, 릴리스는 이 정규 Cloudflare 주소만 허용 | apps/mobile/src/core/config/mobile-runtime-config.ts, scripts/verify-mobile-release-readiness.mjs |
| 기밀/계정 | 게스트·회원용 SecureStore, 현재 주체/세션 경계, 새 회원 승격. 기존 회원으로 게스트 이력 자동 병합하지 않음 | apps/mobile/src/core/auth, apps/mobile/src/core/session, 앱 README |
| CI | Mobile PR Bundle: 출시 설정·Push·Android 빌드 계약 확인, Android/iOS Expo export, Hermes 번들 확인 | .github/workflows/mobile-pr.yml |
| APK | 승인된 main 전용 워크플로는 로컬 EAS release APK, Android Debug 서명, ZIP·내장 JS·non-debuggable·SHA256 검사, 7일 아티팩트 업로드로 설계됨 | .github/workflows/mobile-android-physical-smoke-build.yml |
| 출시 검증 | 최신 SHA APK 다운로드/설치/PC 없이 실행/로그인/소셜 왕복/Push 등록·해제 실기기 PASS는 미확인 | docs/MOBILE_RELEASE_READINESS_V1.md; 이번 감사에서 확인한 범위 |
| 외부 버전 | 2026-11-05 기준 Expo 공식 latest 문서는 SDK 58을 표시. 현행 프로젝트 버전은 SDK 57이며, 이 문서화 PR은 패키지 업그레이드를 수행하거나 로드맵에 독립 업그레이드를 임의 추가하지 않음 | https://docs.expo.dev/versions/latest/ |

## 3. 화면·기능별 실제 상태

| 화면/영역 | 코드로 확인한 현재 기능 | 범위·미확인 |
| --- | --- | --- |
| 네비게이션 | 홈·사주·대화·기록·마이 5개 탭, 사주 하위 관상 | Android/iOS 빌드 가능과 최신 실기기 UX 완료는 별개 |
| 홈 | 현재 프로필/출생/Reading 기록/명식 사실 기반 카드, 캐릭터, 포춘쿠키 | 최근 웹 Home 재설계·상품 진입과 일대일 화면 동기화 안 됨; 최신 웹 비교 검수가 필요 |
| 출생/사주 | 본인 출생정보 등록·재조회, 양음력/윤달, 12시간 입력, 서버 원국, 허용된 5개 무료 Preview | 웹의 2026-11-04 사주 입력 요약·상품·보고서 구성 고정 문구 보완이 앱에 자동 이식되지 않음; 유료 상품/개별 정식 해설은 별도 |
| 사주 장면 | 세연 선택 → 로컬 에셋 기반 2D 애니메이션·종료 프레임 → 서버 출처의 순차 프리뷰 → 일반 Chat/Records 진입 | 실제 캐릭터 동영상 파일 없음; 무료 프리뷰는 공식 Reading 기록으로 저장되지 않음 |
| Reader 선택 | 모바일 사주 Reader 선택 표면에 세연·백헌·여울·라현·태겸·윤호 6명. 프리뷰 선택 허용은 세연만 | 목록/캐릭터 명칭은 승인된 프레젠테이션이며 구매권/Reader Grant가 아님 |
| 대화 탐색 | 공개 6명 카드; 기존 9명 캐릭터 식별자는 보존. 회원은 서버 소유 Thread 열기/재사용 | W1 첫 변경: 모바일 하단 COMING SOON의 도윤·서린·미라 공개 노출 제거(본 로드맵 후속 PR). 기존 Thread/캐릭터 식별 정보는 유지 |
| 대화방 | 소유자별 기존 Thread 기록 조회, forward pagination, 안전한 캐시 무효화, 기본 빈 대화 인사, 세연 회원 메시지 전송과 동일 요청 재시도 | 전송 함수는 characterId=seyeon으로 명시 제한. 다른 캐릭터 전송은 미지원; 서버 잠금/권한 차단 여부는 독립 진실 |
| 기록 | Life Record·Reading History·Memory 목록, 소유자 승인된 완료 Official Reading 재열람 | 정식 Reader 연동·권한 철회 후 상품별 원본 및 전문적 해설 연속성 공개 증거 미확인 |
| 마이 | 게스트/회원 세션, 기존 회원 인증, 소셜 로그인 버튼과 계약, 설정·테마, 프로필/출생 요약 | 실운영 구글·카카오·네이버 OAuth 왕복 검증 미확인, 게스트→기존 회원 이력 병합 SRC-24 HOLD |
| 대상 인물 | Target Person 조회/생성 계약·UI 컴포넌트 코드 | 기존 제품 지침상 마이에서 UI를 숨긴 상태이며 궁합 실행·편집·삭제·출생 정정은 개방되지 않음 |
| 관상 | CameraView 전면 카메라, 사진첩 선택, 이미지 크기·타입 검사 및 로컬 프리뷰 | 서버 사진 전송·EXIF 바이트 정제 보장·분석 호출 없음. 공식 관상 엔진 연결 승인과 구분 |
| Push | Expo 기기 토큰 등록·갱신·주체 변경 시 회수의 내부 경로 | 마이 수동 등록 카드가 제품 요청으로 제거됐고 알림 전송/스케줄러는 SRC-31/32 HOLD. 실기기 생명주기 미검증 |
| 결제 연계 | 2026-11-02~04: Reader 전달/ACK, 회원 청약철회 접수 및 상태 조회의 비활성 게이트를 포함한 코드 | 환경변수/서버/운영 권한 기본 OFF. 정상 결제·환불·실제 콘텐츠 제공·스토어 구매 활성화 아님 |
| 다국어 | 한국어·일본어·번체·영어·간체 앱 고정 UI 사전/저장된 언어 설정 | 웹 PR #2961의 404~504 HTML 오류 페이지는 네이티브 오류 UI가 아님. 두 클라이언트 고정 문구·접근성·서버 원문 비번역 경계를 별도 비교해야 함 |

### 바로잡아야 할 기존 문서의 오표기

1. docs/MOBILE_CLIENT_ARCHITECTURE_V1.md의 2026-10-01 단계표에는 Chat Send 전체 BLOCKED, Push 전체 BLOCKED로 표시됨. 현재는 **세연 Member Chat Send 구현**, **Push Device Installation plumbing 구현**이다. 범용 Chat/Push 발송·운영은 여전히 HOLD이다.
2. docs/MOBILE_RELEASE_READINESS_V1.md의 Production 원본 https://myeongha.vercel.app 표기는 구식이다. 실제 코드와 README는 Cloudflare Worker 정규 원본을 사용한다.
3. apps/mobile/README.md의 구형 Still gated Chat send 문구는 세연 전송 구현과 모순된다. 설명은 보안 HOLD/다른 캐릭터 제한을 구분해야 한다.
4. 앱 자체는 2026-10-24 이후에도 보안/Commerce 연동 수정이 진행됐다. 따라서 '앱 전체가 10월에서 정지'가 아니라 **화면-제품 경험의 웹 동기화가 지연**된 것이다.
5. 과거 2026-10-03 assembleDebug APK 성공은 standalone acceptance가 아니며, 릴리스-변형 APK를 검증하는 **현재 워크플로의 존재**와 그 워크플로가 **최신 main에서 실기기 PASS했다는 증거**를 혼동하지 않는다.

## 4. 기존 M0~M11 로드맵 재기준화

범위는 docs/MOBILE_CLIENT_ARCHITECTURE_V1.md의 기존 단계와 docs/applizing/MOBILE_READER_SAJU_EXPERIENCE_20261016.md의 승인된 Preview/Official Reader 경계를 유지한다.

| 기존 단계 | 재평가 | 완료 증거 / 남은 조건 |
| --- | --- | --- |
| M0~M2, M2-B | 구현 완료 | 설계, Expo 5탭, API/Auth, 게스트→신규 회원 승격 |
| M3, M3-B | 승인된 무료 경로 구현 | 출생/원국·5개 프리뷰. 유료 해설로 확대 금지 |
| M4, M4-D, M4-E | 계약·UI 구현, 일부 사용자 진입 HOLD | 기록/마이·공식 Reading 재열람·대상인물 읽기/생성. 궁합·수정 등 미개방 |
| M5 | 서버 사실 기반 구현 | 웹과 최신 디자인/설명 동기화 검수 남음 |
| M6, M8-A | 구현 | 서버 소유 Thread 조회/재사용, 공개 6명/기존 9명 식별자 유지 |
| M7 | 사진 준비 단계 구현 | 서버 관상 분석/보존 전제 미충족 |
| M8-B | **세연 회원 전송 부분 구현** | 나머지 캐릭터 Chat Send 일반화 HOLD. 과거 기록/권한 및 앱-웹 동등성 실기기 검증 남음 |
| M9 / M9-A | **기기 등록 부분 구현** | Push 발송·스케줄러 HOLD, 실기기 등록/재실행/로그아웃/재연결 검증 남음 |
| M10 | 스토어 결제 미개방 | 개발 전용 Reader 전달/철회 경계 코드 ≠ 앱스토어 판매 |
| M11-A~A4 | 출시 설정·양 플랫폼 export 검사 구현 | 성공한 번들 export는 서명·설치·실기기 검증이 아님 |
| M11-B | **앱 식별자 설정 완료 / 출시 미완료** | Apple/Google 서명·스토어 계정·배포/실기기 수락 미확인 |

## 5. 기존 범위 내 후속 작업 순서 (미구현을 완료로 올리지 않음)

### W1 — 웹·모바일 현행 UI/문구 재동기화 [후속 구현, 승인된 앱화 범위]

- 우선: 모바일 Chat Hub의 준비 중 도윤/미라/서린 노출과 웹에서 제외된 3명 목록 정책의 불일치 정리. **이번 W1 첫 구현 PR에서 공개 하단 목록을 제거하되 기존 9명 canonical ID와 과거 Thread 식별 정보는 보존**. CI·병합 후에만 실제 완료로 인정.
- 사주: 최근 웹의 입력정보/원국 표시/상품 목록 11개와 보고서 구성 미리보기 중 앱에 실제 없는 UI만 반영. 아직 공개되지 않은 상품·풀이를 활성화하거나 상품 구매 가능으로 표시하지 않음.
  - W1 후속 코드: 서버 Birth Profile의 일자·시간·성별·달력·출생지 미제공·계산 기준을 앱에서 5개 언어로 **표시 전용** 투영한다. 음력 날짜의 역법 변환이나 원국 재계산 없음. 이 후속 PR의 CI·병합 전에는 완료로 올리지 않음.
- 홈·대화·마이·기록: 웹의 변경된 핵심 UX, 오류/재시도, 안내 문구, 링크·주체 상태를 네이티브 앱 계약으로 검토. Web DOM/HTML/404 템플릿을 그대로 복제하지 않음.
- 5개 언어 고정 UI·접근성·오류 문구를 경로별로 대조하고 누락을 보완하되, 사용자 대화·개인정보·공식 해석 본문을 자동 번역하지 않음.
- 수락: 현재 main 기준 실제 네이티브 화면/동작 검증, 화면별 고정 문구 검증, 승인된 상태 외 노출/결제/권한 0, 기존 기능 및 세션 회귀 없음.

### W2 — 정확한 main Android APK 및 실기기 확인 [기존 M11 증거 게이트]

- W1 변경·Mobile PR/일반·Full Integration CI 성공 후에만 기존 승인된 main 전용 Android physical-smoke 빌드 경로 사용. 옛 워크플로 재실행이나 오래된 APK로 최신 반영을 주장하지 않음.
- 정확한 main SHA, 비디버그 릴리스 변형, embedded JS, 인증서 경계, SHA256, 빌드 결과 링크 및 보존 기한 확인.
- 실제 Android 단말에서 PC/Metro 없이 실행, 시작/로그인/소셜 리다이렉트(공급자별 승인 가능 조건), 사주/대화/기록/언어·테마/관상 카메라·권한을 수동 확인. Push 제품상 숨긴 UI를 임의 재활성화하지 않음.
- 수락: APK 구조검사 성공 **그리고** 사용자가 수행한 실기기 절차·실제 결과 별도 증거. 조건을 만족하기 전에는 M11 standalone PASS로 올리지 않음.

### W3 — 기존 Reader/상용/출시 HOLD 확인 [새 기능 구현 승인 아님]

- 2026-10-16 Reader 장면 Candidate A(2D+무료 Preview)와 Candidate B(Reader별 영상/Official Reading/T2/권한·환불·연속 Chat)의 경계를 보존.
- 공식 Reader 유료 해설/동영상, 관상 전송·분석, 일반 캐릭터 전송 확대, Push 발송, 소셜 OAuth 운영 활성화, 스토어 결제·서명은 각각 원 소유 계약·운영/법적 조건 충족 전까지 OFF/HOLD.
- 한 트랙의 단위 테스트 통과를 다른 트랙의 운영 공개 승인으로 대체하지 않음.

## 6. 조사 및 회귀 근거

- 모바일 UX/다국어: [#2396](https://github.com/gycha0109-beep/MyeongHa/pull/2396), [#2555](https://github.com/gycha0109-beep/MyeongHa/pull/2555) 병합과 각 Mobile PR Bundle/Full Integration PASS.
- 세연 Reading 장면·채팅 연결: [#2180](https://github.com/gycha0109-beep/MyeongHa/pull/2180), [#2187](https://github.com/gycha0109-beep/MyeongHa/pull/2187).
- 최신 모바일 Commerce 비활성 연계: [#2933](https://github.com/gycha0109-beep/MyeongHa/pull/2933), [#2944](https://github.com/gycha0109-beep/MyeongHa/pull/2944) 병합과 통합 PASS.
- 웹의 마지막 대량 번역 및 6명 목록 조정: [#2961](https://github.com/gycha0109-beep/MyeongHa/pull/2961). 별도 모바일 코드 변경 증거는 아님.
- 기존 모바일 실제 기기 수정 이력: [#2396](https://github.com/gycha0109-beep/MyeongHa/pull/2396); 이후 모든 경로의 현재 단말 재검증 증거로 확장하지 않음.
- 문서/코드: apps/mobile/src/app, apps/mobile/src/features, apps/mobile/src/ui, apps/mobile/src/core, scripts/verify-mobile-release-readiness.mjs, .github/workflows/mobile-pr.yml, .github/workflows/mobile-android-physical-smoke-build.yml.
- 오래된 설계 전용 PR [#1823](https://github.com/gycha0109-beep/MyeongHa/pull/1823), [#2026](https://github.com/gycha0109-beep/MyeongHa/pull/2026)은 **closed/unmerged draft**. 로드맵 항목의 증빙으로 참고할 수 있지만 현재 main 구현 완료 근거로 삼지 않음.
- 구형 릴리스 문서의 Vercel 경로와 초기 debug APK 기록은 이력으로 남기되, 현재 배포·기능 승인에 적용하지 않음.

## 7. 문서화 작업 완료 조건

1. 이번 PR에서 현행 코드와 충돌하는 로드맵/README/릴리스 주소 표기가 실제로 정정된다.
2. 새 근거 문서가 main에 병합되고 해당 변경의 필수 CI가 성공한다.
3. 위 W1~W3는 **후속 구현/검증/승인 게이트**로 남는다. 문서 PR만으로 앱화 전체 ROADMAP_COMPLETE를 선언하지 않는다.
