/** Presentation-only shared mobile tokens. Existing mobileColors remains source-compatible. */
export const mobileDesign = Object.freeze({
  space: Object.freeze({ xs: 6, sm: 10, md: 16, lg: 20, xl: 24, xxl: 32 }),
  radius: Object.freeze({ button: 13, card: 18, hero: 22 }),
  minTouchTarget: 48,
  type: Object.freeze({
    eyebrow: Object.freeze({ fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.2 }),
    section: Object.freeze({ fontSize: 21, fontWeight: '800' as const }),
    title: Object.freeze({ fontSize: 28, fontWeight: '800' as const, lineHeight: 36 }),
    body: Object.freeze({ fontSize: 14, lineHeight: 21 }),
  }),
});
