import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

const STORAGE_KEY = 'myeongha.mobile.appearance.v1';
export type MobileTheme = 'light' | 'dark';

export const mobileThemePalettes = Object.freeze({
  light: Object.freeze({
    canvas: '#F7F0E7', surface: '#FFFBF6', ink: '#20252B',
    muted: '#4A3B45', navy: '#172838', gold: '#946A35',
    border: '#CFB9A5', seal: '#823332',
  }),
  dark: Object.freeze({
    canvas: '#0B151A', surface: '#152129', ink: '#F7EFE5',
    muted: '#D8CAC3', navy: '#E4C18B', gold: '#D7B478',
    border: '#53616A', seal: '#E8A9BE',
  }),
});

type MobileThemeContextValue = Readonly<{
  theme: MobileTheme;
  colors: Readonly<Record<keyof typeof mobileThemePalettes.light, string>>;
  setTheme: (theme: MobileTheme) => void;
}>;
const MobileThemeContext = createContext<MobileThemeContextValue | null>(null);

export function MobileThemeProvider({ children }: PropsWithChildren) {
  const [theme, setSelectedTheme] = useState<MobileTheme>('light');

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(STORAGE_KEY)
      .then((value) => {
        if (active && (value === 'light' || value === 'dark')) setSelectedTheme(value);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const setTheme = (value: MobileTheme) => {
    setSelectedTheme(value);
    void SecureStore.setItemAsync(STORAGE_KEY, value).catch(() => undefined);
  };
  const context = useMemo(() => ({ theme, colors: mobileThemePalettes[theme], setTheme }), [theme]);
  return <MobileThemeContext.Provider value={context}>{children}</MobileThemeContext.Provider>;
}

export function useMobileTheme() {
  const value = useContext(MobileThemeContext);
  if (!value) throw new Error('MobileThemeProvider is missing');
  return value;
}
