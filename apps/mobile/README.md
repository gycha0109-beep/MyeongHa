# @myeongha/mobile

MyeongHa Mobile is a first-class React Native client of the existing MyeongHa server world.

## Current state

- Track: `applizing`
- Phase: **M1 mobile runtime shell**
- Runtime: **Expo SDK 57 / React Native 0.86.x**
- Navigation: **Expo Router**
- WebView wrapper: **not adopted**
- Web DOM/UI component reuse: **not adopted**
- Primary navigation: **Home / Saju / Chat / Records / My**
- Reading sub-navigation: **Saju(default) / Face**

## Commands

```bash
npm run start -w @myeongha/mobile
npm run android -w @myeongha/mobile
npm run ios -w @myeongha/mobile
npm run typecheck -w @myeongha/mobile
```

M1 establishes only the native runtime shell and navigation. Product authority remains server-owned. Saju API binding begins in M2/M3, while Chat send, Push, Face upload, and native commerce remain gated by their source/runtime authority.
