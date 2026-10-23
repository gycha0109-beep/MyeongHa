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

/** An opt-in, randomly drawn fortune cookie; never calls Saju or an AI provider. */
export function FortuneCookie() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [index, setIndex] = useState(-1);
  const [locale, setLocale] = useState<WebUiLocale>(savedLocale);
  const t = (source: string) => translateStaticUi(source, locale);

  useEffect(() => {
    const openFromHomeCard = () => {
      setRevealed(false);
      setPreviewOpen(true);
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  function closeReveal() {
    setRevealed(false);
    triggerRef.current?.focus();
  }

  function openReveal() {
    setIndex(previous => previous < 0 ? pickFortuneCookieIndexV1(previous) : previous);
    setPreviewOpen(false);
    setRevealed(true);
  }

  useEffect(() => {
    if (!revealed) return;
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setRevealed(false);
        triggerRef.current?.focus();
      }
      // The dialog has only one focusable control: keep Tab on close.
      if (event.key === 'Tab') {
        event.preventDefault();
        closeRef.current?.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [revealed]);

  return (
    <>
      <aside className="fortune-cookie" aria-label={t("오늘의 포춘쿠키")}>
        {previewOpen ? (
          <section className="fortune-cookie-panel" id="fortune-cookie-preview" aria-labelledby="fortune-cookie-title">
            <div className="fortune-cookie-panel-head">
              <div>
                <span className="fortune-cookie-eyebrow">A LITTLE FORTUNE</span>
                <h2 id="fortune-cookie-title">{t("오늘의 포춘쿠키")}</h2>
              </div>
              <button className="fortune-cookie-close" type="button" aria-label={t("포춘쿠키 접기")} onClick={() => setPreviewOpen(false)}>×</button>
            </div>
            <p className="fortune-cookie-invitation">{t("오늘의 작은 행운을 쪽지로 열어 보세요.")}</p>
            <button className="fortune-cookie-draw" type="button" onClick={openReveal}>{t("행운의 쪽지 열기 ✦")}</button>
          </section>
        ) : null}
        <button
          ref={triggerRef}
          type="button"
          className="fortune-cookie-trigger"
          aria-expanded={previewOpen}
          aria-controls="fortune-cookie-preview"
          onClick={() => setPreviewOpen(open => !open)}
        >
          <span aria-hidden="true">✦</span> {t("오늘의 운세")}
        </button>
      </aside>
      {revealed && typeof document !== 'undefined' ? createPortal(
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
            {/* Swap this reveal stage with a small unrolling-scroll animation later. */}
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
      ) : null}
    </>
  );
}
