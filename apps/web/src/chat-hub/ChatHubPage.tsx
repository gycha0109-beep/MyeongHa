import { useEffect } from 'react';

export function ChatHubPage() {
  useEffect(() => {
    void import('../../chat-hub.js');
  }, []);

  return (
    <div className="product-shell chat-hub-shell" data-chat-hub-state="unavailable">
      <section className="chat-hub-intro conversation-hub-intro" aria-labelledby="chat-hub-title">
        <div>
          <span className="chat-hub-eyebrow">CONVERSATION</span>
          <h1 id="chat-hub-title">대화</h1>
          <p>이곳에서 마음이 가는 대리자를 만나보세요.</p>
        </div>
        <a className="conversation-meet-button" href="#people" data-meet-shortcut hidden><span>다른 대리자 만나기</span><span aria-hidden="true">›</span></a>
      </section>

      <section className="chat-hub-primary conversation-primary" data-relationship-section hidden aria-label="이어갈 대화와 내 대화">
        <article className="chat-continuation-card conversation-featured" data-continuation-card>
          {/* A recent conversation is displayed only after an owner-scoped server projection. */}
          <div className="chat-continuation-active conversation-featured-active" data-continuation-active hidden>
            <div className="chat-continuation-scene" data-continuation-scene aria-hidden="true"><span data-continuation-initial>明</span></div>
            <div className="chat-continuation-copy conversation-featured-copy">
              <span className="chat-continuation-kicker">지금 이어갈 사람</span>
              <div className="chat-continuation-name-row"><h2 data-continuation-name /><span data-continuation-title /></div>
              <p data-continuation-context />
              <div className="conversation-thread-note" data-continuation-thread-note hidden>
                <span>이어진 이야기</span><strong data-continuation-thread-title />
              </div>
              <a className="chat-continuation-action" href="chat.html" data-continuation-link><span>이야기 이어가기</span><span aria-hidden="true">→</span></a>
            </div>
          </div>
        </article>

        <aside className="chat-recent-card conversation-thread-panel" aria-labelledby="recent-title">
          <div className="chat-hub-section-head">
            <div><span className="chat-hub-section-kicker">MY CONVERSATIONS</span><h2 id="recent-title">내 대화</h2></div>
            <button className="chat-text-button" type="button" data-recent-all hidden>전체 보기 →</button>
          </div>
          <div className="chat-recent-list" data-recent-list hidden />

        </aside>
      </section>

      <section className="chat-incoming conversation-incoming" data-incoming-section hidden aria-labelledby="incoming-title">
        <div className="chat-hub-section-head"><div><span className="chat-hub-section-kicker">FOR YOU</span><h2 id="incoming-title">나에게 온 이야기</h2></div></div>
        <div className="chat-incoming-grid" data-incoming-list />
      </section>

      <section className="chat-people-section conversation-people" id="people" aria-labelledby="people-title">
        <div className="chat-people-heading">
          <div>
            <span className="chat-hub-section-kicker">MEET</span>
            <h2 id="people-title"><span data-discovery-heading>누구와 이야기를 시작해볼까요?</span><span data-returning-heading hidden>다른 대리자 만나기</span><span className="chat-people-star" aria-hidden="true">✦</span></h2>
            <p>말하는 방식도, 분위기도 조금씩 다른 명하의 대리자들. 마음이 가는 사람을 선택해보세요.</p>
          </div>
          <label className="chat-search">
            <span className="sr-only">사람 찾기</span><span className="chat-search-icon" aria-hidden="true" />
            <input type="search" placeholder="이름이나 분위기로 찾아보세요" autoComplete="off" data-people-search />
          </label>
        </div>

        <div className="chat-people-grid" data-people-grid aria-live="polite" />
        <p className="chat-search-empty" data-search-empty hidden>조건에 맞는 사람을 찾지 못했습니다.</p>
        <div className="chat-people-more-row">
          <button className="chat-people-more" type="button" data-people-more><span>다른 사람 더 보기</span><span aria-hidden="true">⌄</span></button>
        </div>
      </section>

      <aside className="conversation-memory-note conversation-hub-status" data-hub-availability role="status" aria-label="대화 목록 연결 상태">
        <span className="conversation-memory-mark" aria-hidden="true">◇</span>
        <p>이전 대화 목록은 아직 이 화면에 연결되지 않았습니다. 대리자 탐색은 이용할 수 있으며, 실제 대화 시작과 접근 가능 여부는 서버에서 확인합니다.</p>
      </aside>
      <p className="conversation-hub-verified-empty" data-hub-verified-empty hidden role="status">아직 이어지는 대화가 없습니다. 마음에 드는 대리자와 이야기를 시작해보세요.</p>
    </div>
  );
}
