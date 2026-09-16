import { useEffect } from 'react';

export function ChatPage() {
  useEffect(() => {
    async function connectRoom() {
      await import('../../chat-character.js');
      await import('../../chat-runtime-client.js');
    }

    void connectRoom();
  }, []);

  return (
    <>
      <header className="character-room-header conversation-room-header">
        <a className="character-room-back" href="chat-hub.html" aria-label="대화 허브로 돌아가기">
          <span aria-hidden="true">‹</span>
          <span>대화로 돌아가기</span>
        </a>

        <div className="character-room-identity" aria-live="polite">
          <strong data-character-name>백헌</strong>
          <span className="character-room-dot" aria-hidden="true">·</span>
          <span data-character-title>충추원의 장</span>
          <span className="character-room-seal" aria-hidden="true">明河</span>
        </div>

        <div className="character-room-actions">
          <button className="character-room-history-button" type="button" data-history-open>
            <span className="character-room-clock" aria-hidden="true" />
            <span>지난 대화</span>
          </button>
          <a className="conversation-record-link" href="records.html">기록 보기</a>
          <button className="character-room-menu-button" type="button" aria-label="대화 메뉴" data-menu-toggle>•••</button>
        </div>
      </header>

      <main className="character-room-stage conversation-room-stage" aria-label="캐릭터 대화 공간">
        <section className="conversation-scene-column" aria-label="캐릭터 공간">
          <div className="character-room-scene conversation-room-scene" data-character-scene role="img" aria-label="백헌의 대화 공간">
            <div className="character-room-scene-decoration" aria-hidden="true">
              <span className="scene-window" />
              <span className="scene-lamp" />
              <span className="scene-branch" />
              <span className="scene-character-placeholder" />
            </div>
          </div>

          <div className="character-room-context conversation-context" data-context-pill hidden>
            <span className="character-room-context-mark" aria-hidden="true">◇</span>
            <span>이어진 이야기 · </span>
            <strong data-context-title />
          </div>

          <div className="conversation-character-card">
            <div>
              <strong data-character-name>백헌</strong>
              <span data-character-title>충추원의 장</span>
            </div>
            <p>이 사람과 나눈 말과 흐름은 다음 대화에서도 이어집니다.</p>
          </div>
        </section>

        <section className="character-dialogue-panel conversation-chat-panel" aria-label="현재 대화">
          <header className="conversation-chat-head">
            <div>
              <span className="conversation-chat-kicker">CONVERSATION</span>
              <div className="character-dialogue-name-row">
                <h1 data-dialogue-name>백헌</h1>
                <span data-character-title>충추원의 장</span>
              </div>
            </div>
            <div className="conversation-chat-head-actions">
              <button type="button" data-history-open>지난 대화</button>
              <a href="records.html">기록 보기</a>
            </div>
          </header>

          <div className="conversation-thread-bar" data-thread-bar hidden>
            <span aria-hidden="true">◇</span>
            <span>이어진 이야기</span>
            <strong data-thread-bar-title />
          </div>

          <div className="conversation-message-stream" data-chat-stream aria-live="polite">
            <article className="conversation-message" data-sender="character" data-chat-intro>
              <span className="conversation-message-avatar" data-character-avatar aria-hidden="true">明</span>
              <div className="conversation-message-body">
                <strong data-character-name>백헌</strong>
                <p className="character-dialogue-line" data-dialogue-line>이야기를 시작하죠.<br />지금 가장 먼저 꺼내고 싶은 것은 무엇입니까?</p>
              </div>
            </article>
          </div>

          <form className="character-composer conversation-composer" data-composer data-runtime-busy="false">
            <label className="sr-only" htmlFor="character-message">메시지</label>
            <textarea id="character-message" rows={1} placeholder="메시지를 입력하세요…" data-message-input />
            <button className="character-send-button" type="submit" aria-label="메시지 보내기">
              <span aria-hidden="true">➤</span>
            </button>
          </form>

          <p className="character-compose-status" data-compose-status aria-live="polite" />
        </section>
      </main>

      <aside className="character-history-drawer" data-history-drawer aria-hidden="true" aria-label="지난 대화">
        <div className="character-history-head">
          <div>
            <span className="character-history-kicker">지난 대화</span>
            <h2 data-history-character-name>백헌과 나눈 이야기</h2>
          </div>
          <button type="button" data-history-close aria-label="지난 대화 닫기">×</button>
        </div>

        <div className="character-history-list" data-history-list />
        <p className="history-runtime-empty" data-history-empty>이어갈 대화를 선택하면 지난 대화가 여기에 표시됩니다.</p>
      </aside>

      <div className="character-room-scrim" data-room-scrim hidden />

      <div className="character-room-menu" data-room-menu hidden>
        <a href="#" aria-disabled="true">캐릭터 정보</a>
        <a href="records.html">이어진 기록 보기</a>
        <a href="#" aria-disabled="true">기억 관리</a>
        <a href="#" aria-disabled="true">대화에서 찾기</a>
      </div>
    </>
  );
}
