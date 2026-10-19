import { useMemo } from 'react';

import { mobileThemePalettes, useMobileTheme } from './mobile-theme';

/**
 * Adapt legacy static React Native StyleSheet tokens without changing every
 * view contract. Only exact, approved light palette values are remapped;
 * other values (including functional status and artwork) are left untouched.
 */
const darkByLightColor = Object.freeze(
  Object.fromEntries(
    (Object.keys(mobileThemePalettes.light) as Array<keyof typeof mobileThemePalettes.light>)
      .map((key) => [mobileThemePalettes.light[key].toLowerCase(), mobileThemePalettes.dark[key]]),
  ) as Readonly<Record<string, string>>,
);

export function useMobileThemedStyles<T extends Record<string, object>>(base: T): T {
  const { theme } = useMobileTheme();
  return useMemo(() => {
    if (theme === 'light') return base;
    return Object.fromEntries(
      Object.entries(base).map(([name, style]) => [
        name,
        Object.fromEntries(
          Object.entries(style).map(([property, value]) => [
            property,
            typeof value === 'string'
              ? (darkByLightColor[value.toLowerCase()] ?? value)
              : value,
          ]),
        ),
      ]),
    ) as T;
  }, [base, theme]);
}
