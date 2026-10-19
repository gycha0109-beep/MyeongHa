/**
 * Presentation-only native UI tokens. Existing mobileColors remains supported.
 * These values introduce no backend state or authorization semantics.
 */
export const mobileDesign = Object.freeze({
  color: Object.freeze({
    hero: '#102235',
    heroBorder: '#B7925F',
    heroText: '#FAF4E9',
    heroSecondary: '#E3D7C5',
    goldBright: '#E4C18B',
    paper: '#F7F1E8',
  }),
  radius: Object.freeze({
    hero: 20,
    action: 12,
  }),
  touch: Object.freeze({
    minimum: 48,
  }),
});
