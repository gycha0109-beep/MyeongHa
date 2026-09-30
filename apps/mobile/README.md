# @myeongha/mobile

MyeongHa Mobile is a first-class React Native client of the existing MyeongHa server world.

## Current state

- Track: `applizing`
- Phase: **M8 prerequisite — existing-Member auth foundation**
- Runtime: **Expo SDK 57 / React Native 0.86.x**
- Navigation: **Expo Router**
- Secure Guest credential persistence: **Expo SecureStore**
- WebView wrapper: **not adopted**
- Web DOM/UI component reuse: **not adopted**
- Primary navigation: **Home / Saju / Chat / Records / My**
- Reading sub-navigation: **Saju(default) / Face**

## Current authority boundary

Mobile now has:

- Expo Router five-tab shell with Saju / Face secondary navigation;
- portable shared API/auth clients and Expo SecureStore Guest credential persistence;
- existing-Member sign-in / refresh / sign-out client contracts with a distinct SecureStore Member session generation;
- single-flight Guest bootstrap and concurrent 401 replacement recovery;
- current Birth Profile create/read and current-subject Saju calculation rendering;
- Records reads for Life Record, Reading History, and Memory with cursor pagination;
- My projection from current Profile + Birth;
- Home projection composed from current Profile, Birth, latest Reading History, and calculation-only Saju evidence;
- known-thread Chat read through `GET /api/chat/:threadId` with forward cursor pagination and redaction-safe rendering;
- Face Reading camera/library photo staging through Expo ImagePicker with image-only selection, 16MB client bound, local preview, and no server analysis.

Home does not invent a separate server authority. It does not call unimplemented `/api/home` or `/api/characters`, does not infer a recent Chat thread, does not auto-run Preview Reading, and does not synthesize daily-fortune claims from calculation-only Saju evidence.

Still gated after the current Member-auth foundation:

- native Member sign-in UI and active-subject migration across existing feature services;
- mobile Member sign-up / email-confirmation handoff;
- Chat thread discovery / recent-thread listing;
- Mobile Chat-open activation while native Member auth and Character discovery are unavailable;
- Chat send;
- production Character catalog/recommendation projection;
- Face Reading engine intake / analysis upload. M7 does not treat `exif: false` as proof that selected file bytes are metadata-stripped;
- Push;
- native store commerce.

## Commands

```bash
npm run start -w @myeongha/mobile
npm run android -w @myeongha/mobile
npm run ios -w @myeongha/mobile
npm run typecheck -w @myeongha/mobile
npm run typecheck -w @myeongha/api-client
```
