# @myeongha/mobile

MyeongHa Mobile is a first-class client of the existing MyeongHa server world.

## Current state

- Track: `applizing`
- Phase: **M0 architecture foundation**
- WebView wrapper: **not adopted**
- Web DOM/UI component reuse: **not adopted**
- Runtime target: **React Native + Expo**
- Navigation target: **Expo Router**
- Primary navigation: **Home / Saju / Chat / Records / My**
- Reading sub-navigation: **Saju(default) / Face**

The executable navigation invariant is defined in:

```text
apps/mobile/src/navigation/mobile-navigation-contract.ts
```

The architecture baseline is defined in:

```text
docs/MOBILE_CLIENT_ARCHITECTURE_V1.md
```

Expo runtime dependencies are intentionally not partially added in M0. M1 must update the mobile package manifest and root lockfile atomically before runtime code is introduced.
