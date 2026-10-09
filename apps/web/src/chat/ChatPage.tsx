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
      <main className="character-room-stage conversation-room-stage" aria-label="캐릭터 대화 공간">
        <section className="conversation-scene-column" aria-label="캐릭터 공간">
          <div className="character-room-scene conversation-room-scene" data-character-scene role="img" aria-label="대화 상대의 공간">
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
              <strong data-character-name>대화 상대</strong>
              <span data-character-title>서버 확인 중</span>
            </div>
            <p>이 사람과 나눈 말과 흐름은 다음 대화에서도 이어집니다.</p>
          </div>
        </section>

        <section className="character-dialogue-panel conversation-chat-panel" aria-label="현재 대화">
          <header className="conversation-chat-head">
            <div>
              <span className="conversation-chat-kicker">CONVERSATION</span>
              <div className="character-dialogue-name-row">
                <h1 data-dialogue-name>대화 상대</h1>
                <span data-character-title>서버 확인 중</span>
              </div>
            </div>
          </header>

          <div className="conversation-thread-bar" data-thread-bar hidden>
            <span aria-hidden="true">◇</span>
            <span>이어진 이야기</span>
            <strong data-thread-bar-title />
          </div>

          <div className="conversation-message-stream" data-chat-stream aria-live="polite">
            <article className="conversation-message" data-sender="character" data-chat-intro hidden>
              <span className="conversation-message-avatar" data-character-avatar aria-hidden="true">明</span>
              <div className="conversation-message-body">
                <strong data-character-name>대화 상대</strong>
                <p className="character-dialogue-line" data-dialogue-line>대화 상대를 확인하고 있습니다.</p>
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
          <button className="character-room-retry" data-room-retry type="button" hidden>대화 다시 연결하기 →</button>
        </section>
      </main>

    </>
  );
}
