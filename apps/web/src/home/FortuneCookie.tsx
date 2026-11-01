import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { pickFortuneCookieIndexV1 } from './fortune-cookie.js';
import { fortuneCookieMessageV1 } from './fortune-cookie-locales.js';
import { normalizeUiLocale, translateStaticUi, UI_LOCALE_STORAGE_KEY } from '../../ui-i18n.js';
import type { WebUiLocale } from '../../ui-i18n.js';

function savedLocale(): WebUiLocale {
  try { return normalizeUiLocale(window.localStorage.getItem(UI_LOCALE_STORAGE_KEY)); }
  catch { return 'ko-KR'; }
}

/** Home-card-only entertainment reveal; never calls Saju or an AI provider. */
export function FortuneCookie() {
  const [revealed, setRevealed] = useState(false);
  const [index, setIndex] = useState(-1);
  const [locale, setLocale] = useState<WebUiLocale>(savedLocale);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const t = (source: string) => translateStaticUi(source, locale);

  useEffect(() => {
    const openFromHomeCard = () => {
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement ? active : null;
      setIndex(previous => previous < 0 ? pickFortuneCookieIndexV1(previous) : previous);
      setRevealed(true);
    };
    document.addEventListener('myeongha:open-fortune-cookie', openFromHomeCard);
    return () => document.removeEventListener('myeongha:open-fortune-cookie', openFromHomeCard);
  }, []);

  useEffect(() => {
    const onLocaleChange = (event: Event) => {
      const selected = (event as CustomEvent<{ locale: string }>).detail?.locale;
      setLocale(normalizeUiLocale(selected));
    };
    document.addEventListener('myeongha:localechange', onLocaleChange);
    return () => document.removeEventListener('myeongha:localechange', onLocaleChange);
  }, []);

  function closeReveal() {
    setRevealed(false);
    openerRef.current?.focus();
  }

  useEffect(() => {
    if (!revealed) return;
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setRevealed(false);
        openerRef.current?.focus();
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        closeRef.current?.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [revealed]);

  return revealed && typeof document !== 'undefined' ? createPortal(
    <div className="fortune-cookie-overlay">
      <button type="button" className="fortune-cookie-backdrop" tabIndex={-1} aria-label={t("쪽지 닫기")} onClick={closeReveal} />
      <section className="fortune-cookie-reveal" role="dialog" aria-modal="true" aria-labelledby="fortune-cookie-reveal-title" aria-describedby="fortune-cookie-reveal-message">
        <header className="fortune-cookie-reveal-head">
          <div>
            <span className="fortune-cookie-eyebrow">A LITTLE FORTUNE</span>
            <h2 id="fortune-cookie-reveal-title">{t("오늘의 쪽지")}</h2>
          </div>
          <button ref={closeRef} className="fortune-cookie-reveal-close" type="button" aria-label={t("쪽지 닫기")} onClick={closeReveal}>×</button>
        </header>
        <div className="fortune-cookie-reveal-stage" data-scroll-animation-slot>
          <div className="fortune-cookie-reveal-paper" key={index}>
            <span className="fortune-cookie-reveal-ornament" aria-hidden="true">✦</span>
            <p id="fortune-cookie-reveal-message" className="fortune-cookie-reveal-message">{fortuneCookieMessageV1(index, locale)}</p>
            <span className="fortune-cookie-reveal-ornament" aria-hidden="true">◇</span>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  ) : null;
}
