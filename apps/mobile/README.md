# @myeongha/mobile

MyeongHa Mobile is a first-class React Native client of the existing MyeongHa server world.

## Current state

- Track: `applizing`
- Phase: **M2 shared API/auth boundary**
- Runtime: **Expo SDK 57 / React Native 0.86.x**
- Navigation: **Expo Router**
- Secure Guest credential persistence: **Expo SecureStore**
- WebView wrapper: **not adopted**
- Web DOM/UI component reuse: **not adopted**
- Primary navigation: **Home / Saju / Chat / Records / My**
- Reading sub-navigation: **Saju(default) / Face**

## M2 authority boundary

Mobile now has:

- a portable shared API client for `POST /api/session/bootstrap` and `GET /api/me`;
- fail-closed Guest bootstrap response parsing;
- one-time bearer reuse protection when the server intentionally returns `bearerToken: null`;
- a Mobile SecureStore adapter for Guest bearer persistence.

Member sign-in/refresh storage, Birth/Saju feature binding, Chat mutation, Push, Face upload, and native commerce are not activated by M2.

## Commands

```bash
npm run start -w @myeongha/mobile
npm run android -w @myeongha/mobile
npm run ios -w @myeongha/mobile
npm run typecheck -w @myeongha/mobile
npm run typecheck -w @myeongha/api-client
```
