# @myeongha/mobile

MyeongHa Mobile is a first-class React Native client of the existing MyeongHa server world.

## Current state

- Track: `applizing`
- Phase: **M6 server-authorized Chat read**
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
- single-flight Guest bootstrap and concurrent 401 replacement recovery;
- current Birth Profile create/read and current-subject Saju calculation rendering;
- Records reads for Life Record, Reading History, and Memory with cursor pagination;
- My projection from current Profile + Birth;
- Home projection composed from current Profile, Birth, latest Reading History, and calculation-only Saju evidence;\n- known-thread Chat read through `GET /api/chat/:threadId` with forward cursor pagination and redaction-safe rendering.

Home does not invent a separate server authority. It does not call unimplemented `/api/home` or `/api/characters`, does not infer a recent Chat thread, does not auto-run Preview Reading, and does not synthesize daily-fortune claims from calculation-only Saju evidence.

Still gated after M6:

- native Member auth/account management;
- Chat thread discovery / recent-thread listing;\n- Mobile Chat-open activation while native Member auth and Character discovery are unavailable;\n- Chat send;
- production Character catalog/recommendation projection;
- Face Reading native media path;
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
