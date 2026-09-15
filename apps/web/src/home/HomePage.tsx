function currentMonthLabel(now: Date): string {
  const formatted = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
  }).format(now);

  return `${formatted}의 흐름`;
}

export function HomePage() {
  return (
    <div className="gm-shell">
      <header className="gm-home-head">
        <h1 className="gm-greeting">좋은 저녁이에요, <span className="gm-highlight" id="home-greeting-name">당신</span></h1>
        <p className="gm-lede">오늘도 명하에 이야기가 쌓이고 있어요.</p>
      </header>

      <section className="gm-home-hero" aria-labelledby="home-character-title">
        <div className="gm-hero-copy">
          <span className="gm-hero-label">오늘 이야기할 사람 · 캐릭터 선택</span>
          <h2 className="gm-hero-title" id="home-character-title">누구와 이야기를 시작해 볼까요?</h2>
          <p>마음에 맞는 사람을 고른 뒤, 지금 가장 마음에 걸리는 이야기를 편하게 꺼내보세요.</p>
          <a className="gm-primary-button" href="chat-hub.html">대화로 가기 →</a>
        </div>
        <blockquote className="gm-hero-quote">“당신에게 맞는 거리와 말투의 사람을 골라보세요.”</blockquote>
      </section>

      <section className="gm-section" aria-labelledby="home-month-title">
        <div className="gm-section-head">
          <h2 className="gm-section-title" id="home-month-title">이번 달 사주 읽기</h2>
          <a className="gm-inline-link" href="reading-detail.html?scope=month">제공 상태 확인 <span aria-hidden="true">›</span></a>
        </div>

        <a className="gm-card gm-month-card" href="reading-detail.html?scope=month">
          <span className="gm-month-art" aria-hidden="true"></span>
          <span className="gm-month-copy">
            <span className="gm-month-eyebrow" id="home-current-date">{currentMonthLabel(new Date())}</span>
            <strong className="gm-card-title">이번 달 읽기 주제와 제공 상태를 확인해보세요.</strong>
            <span className="gm-month-support">검증된 Reading이 제공 가능한지 상세 화면에서 확인할 수 있습니다.</span>
            <span className="gm-inline-link">읽기 확인 <span aria-hidden="true">›</span></span>
          </span>
        </a>
      </section>

      <section className="gm-section" aria-labelledby="home-products-title">
        <div className="gm-section-head">
          <h2 className="gm-section-title" id="home-products-title">사주 읽기 주제</h2>
          <a className="gm-inline-link" href="reading.html">전체 주제 보기 <span aria-hidden="true">›</span></a>
        </div>

        <div className="gm-home-products">
          <a className="gm-card gm-product-card" href="reading-detail.html?topic=temperament&scope=original">
            <span className="gm-icon" aria-hidden="true">✦</span>
            <span><strong>전체 사주</strong><small>나라는 사람을 더 깊이</small></span>
            <span className="gm-chevron" aria-hidden="true">›</span>
          </a>
          <a className="gm-card gm-product-card" href="reading-detail.html?topic=career">
            <span className="gm-icon" aria-hidden="true">⌁</span>
            <span><strong>직업 · 커리어</strong><small>일과 선택을 더 깊이</small></span>
            <span className="gm-chevron" aria-hidden="true">›</span>
          </a>
          <a className="gm-card gm-product-card" href="reading-detail.html?topic=money">
            <span className="gm-icon" aria-hidden="true">財</span>
            <span><strong>재물</strong><small>재물과 자원의 흐름</small></span>
            <span className="gm-chevron" aria-hidden="true">›</span>
          </a>
          <a className="gm-card gm-product-card" href="reading-detail.html?topic=love">
            <span className="gm-icon is-rose" aria-hidden="true">緣</span>
            <span><strong>연애 · 관계</strong><small>관계에서 반복되는 방식</small></span>
            <span className="gm-chevron" aria-hidden="true">›</span>
          </a>
        </div>
      </section>

      <section className="gm-section" aria-labelledby="home-recent-title">
        <div className="gm-section-head">
          <h2 className="gm-section-title" id="home-recent-title">최근 이야기</h2>
          <a className="gm-inline-link" href="chat-hub.html">전체보기 <span aria-hidden="true">›</span></a>
        </div>

        <article className="gm-card gm-recent-card">
          <span className="gm-recent-avatar" aria-hidden="true">明</span>
          <div className="gm-recent-copy">
            <div className="gm-recent-title-row"><strong>이어갈 대화</strong><span className="gm-chip">대화 기록</span></div>
            <p>지금은 저장된 사실을 이야기로 추측해 이어 붙이지 않습니다.</p>
          </div>
          <span className="gm-recent-time">아직 없음</span>
          <a className="gm-recent-button" href="chat-hub.html"><span>대화 보기</span><span aria-hidden="true">→</span></a>
        </article>
      </section>
    </div>
  );
}
