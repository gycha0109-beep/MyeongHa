import { useEffect } from 'react';

export function ChatHubPage() {
  useEffect(() => {
    void import('../../chat-hub.js');
  }, []);

  return (
    <div className="product-shell">
      <section className="chat-hub-intro conversation-hub-intro" aria-labelledby="chat-hub-title">
        <div>
          <span className="chat-hub-eyebrow">CONVERSATION</span>
          <h1 id="chat-hub-title">대화</h1>
          <p>누구와 이야기를 이어갈까요?</p>
        </div>
        <a className="conversation-meet-button" href="#people"><span>다른 사람 만나기</span><span aria-hidden="true">›</span></a>
      </section>

      <section className="chat-hub-primary conversation-primary" aria-label="이어갈 대화와 내 대화">
        <article className="chat-continuation-card conversation-featured" data-continuation-card>
          <div className="chat-continuation-empty conversation-featured-empty" data-continuation-empty>
            <span className="chat-continuation-kicker">지금 이어갈 사람</span>
            <div className="chat-continuation-mark" aria-hidden="true">明</div>
            <h2>아직 이어지고 있는 대화가 없습니다.</h2>
            <p>누군가와 이야기를 시작하면, 다시 이어가기 좋은 관계가 이곳에 먼저 나타납니다.</p>
            <a className="chat-continuation-action" href="#people"><span>다른 사람 만나기</span><span aria-hidden="true">→</span></a>
          </div>

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
          <div className="chat-recent-empty conversation-thread-empty" data-recent-empty>
            <span className="chat-recent-empty-mark" aria-hidden="true">◇</span>
            <strong>아직 이어지고 있는 관계가 없습니다.</strong>
            <p>대화를 시작하면 그 사람과의 이야기가 여기에 남습니다.</p>
          </div>
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
            <h2 id="people-title">다른 사람 만나기<span aria-hidden="true">✦</span></h2>
            <p>새로운 이야기를 시작하고 싶을 때만 열어보세요. 사람마다 말하는 방식과 거리감이 다릅니다.</p>
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

      <aside className="conversation-memory-note" aria-label="대화 안내">
        <span className="conversation-memory-mark" aria-hidden="true">◇</span>
        <p><strong>이야기는 언제든 이어집니다.</strong><br />당신이 남긴 말은, 그 사람과의 다음 대화로 이어집니다.</p>
      </aside>
    </div>
  );
}
