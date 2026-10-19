# 모바일 홈 아트 에셋 v1 (2026-10-19)

- 파일: `apps/mobile/assets/design/home-moon-gold-v1.webp`
- 제작: 2026-10-19 ImageGen 결과물의 **순수 장식 타일**을 이미지 영역에서만 추출; WebP로 리사이징·압축.
- 규격: 198 × 262 px, WebP, 3,528 bytes.
- SHA256: `1fa7368da52c723a6ba342864e3d29880550727c7592eccedf3368f8a57b75c7`
- 사용: `apps/mobile/src/features/home/HomeComponents.tsx`의 HomeTodayCard **ready** 상태 우측 일러스트. 정적 `require`로 앱 패키지에 번들.
- 이유: 기존 캐릭터 초상화는 canonical `assets/characters`를 재사용하고, 생성 이미지에서 나온 가상 캐릭터/문구/상태는 코드에 반영하지 않는다.
- 주의: 아트는 정적 장식이며 사주 결과/캐릭터 능력/권한/화면 사실에 대한 source authority가 없다.
- 한계: 비교 시안의 일부를 추출한 초기 장식 자산이므로 향후 단독 고해상도 마스터 이미지 생성 시 교체 후보이다. 현재 것은 작은 카드 장식 용도로만 사용한다.
- 디자인: 따뜻한 아이보리 배경과 네이비/황동색의 대비. 실제 색상 대비와 디바이스 렌더링은 CI 뒤 물리 기기 확인 필요.

기능/권한/DB 변경 없음. `SEYEON_HISTORY_REVEAL_HOLD` 변경 없음.
