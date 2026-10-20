import * as SecureStore from 'expo-secure-store';
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type PropsWithChildren,
} from 'react';
import {
  MOBILE_UI_LOCALE_STORAGE_KEY,
  normalizeMobileUiLocale,
  translateMobileUiCopy,
  type MobileUiLocale,
} from './mobile-ui-copy.js';

type MobileUiLocaleContextValue = Readonly<{
  locale: MobileUiLocale;
  setLocale: (value: MobileUiLocale) => void;
  t: (source: string) => string;
}>;
const MobileUiLocaleContext = createContext<MobileUiLocaleContextValue | null>(null);

/**
 * Mobile counterpart of web's locale picker:
 * one explicit UI-only preference, defaults to Korean, saved locally.
 * Never changes server-side reading/chat language or client payloads.
 */
export function MobileUiLocaleProvider({ children }: PropsWithChildren) {
  const [locale, selectLocale] = useState<MobileUiLocale>('ko-KR');
  const explicitlySelected = useRef(false);

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(MOBILE_UI_LOCALE_STORAGE_KEY)
      .then((value) => {
        if (active && !explicitlySelected.current) selectLocale(normalizeMobileUiLocale(value));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const setLocale = useCallback((value: MobileUiLocale) => {
    const normalized = normalizeMobileUiLocale(value);
    explicitlySelected.current = true;
    selectLocale(normalized);
    void SecureStore.setItemAsync(MOBILE_UI_LOCALE_STORAGE_KEY, normalized)
      .catch(() => undefined);
  }, []);

  const t = useCallback((source: string) => translateMobileUiCopy(source, locale), [locale]);
  const context = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <MobileUiLocaleContext.Provider value={context}>{children}</MobileUiLocaleContext.Provider>;
}

export function useMobileUiLocale() {
  const context = useContext(MobileUiLocaleContext);
  if (context === null) throw new Error('MobileUiLocaleProvider is missing');
  return context;
}
