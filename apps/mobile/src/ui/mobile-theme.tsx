import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

const STORAGE_KEY = 'myeongha.mobile.appearance.v1';
export type MobileTheme = 'light' | 'dark';

export const mobileThemePalettes = Object.freeze({
  light: Object.freeze({
    canvas: '#F7F1E8', surface: '#FBF7EF', ink: '#1B2838',
    muted: '#746D64', navy: '#102A46', gold: '#B08A52',
    border: '#DCC9A8', seal: '#A44E42',
  }),
  dark: Object.freeze({
    canvas: '#0B1419', surface: '#111C22', ink: '#F0E7D9',
    muted: '#B3A89A', navy: '#E4C18B', gold: '#C49A5C',
    border: '#48505A', seal: '#E18B80',
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
