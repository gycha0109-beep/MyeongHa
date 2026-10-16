import { useState } from 'react';
import { FORTUNE_COOKIE_MESSAGES_V1, pickFortuneCookieIndexV1 } from './fortune-cookie.js';

/** Opt-in entertainment only: no DOB, session, LLM or Saju API dependency. */
export function FortuneCookie() {
  const [expanded, setExpanded] = useState(false);
  const [index, setIndex] = useState(-1);

  return (
    <aside className="fortune-cookie" aria-label="오늘의 포춘쿠키">
      {expanded ? (
        <section className="fortune-cookie-panel" aria-labelledby="fortune-cookie-title">
          <div className="fortune-cookie-panel-head">
            <div>
              <span className="fortune-cookie-eyebrow">A LITTLE FORTUNE</span>
              <h2 id="fortune-cookie-title">오늘의 포춘쿠키</h2>
            </div>
            <button className="fortune-cookie-close" type="button" aria-label="포춘쿠키 닫기" onClick={() => setExpanded(false)}>×</button>
          </div>
          <p className="fortune-cookie-message" aria-live="polite" aria-atomic="true">
            {index < 0 ? '오늘은 어떤 작은 메시지가 기다리고 있을까요?' : FORTUNE_COOKIE_MESSAGES_V1[index]}
          </p>
          <button className="fortune-cookie-draw" type="button" onClick={() => setIndex(previous => pickFortuneCookieIndexV1(previous))}>
            {index < 0 ? '행운의 쪽지 열기 ✦' : '다른 쪽지 뽑기 ↻'}
          </button>
          <p className="fortune-cookie-disclaimer">재미로 보는 무작위 메시지입니다. 실제 사주 분석이나 개인별 운세가 아닙니다.</p>
        </section>
      ) : null}
      <button
        type="button"
        className="fortune-cookie-trigger"
        aria-expanded={expanded}
        aria-controls="fortune-cookie-title"
        onClick={() => setExpanded(value => !value)}
      >
        <span aria-hidden="true">✦</span> 오늘의 운세
      </button>
    </aside>
  );
}
