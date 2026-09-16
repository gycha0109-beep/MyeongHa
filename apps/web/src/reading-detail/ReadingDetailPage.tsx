import { useEffect } from 'react';

export function ReadingDetailPage() {
  useEffect(() => {
    void import('../../reading-character.js');
  }, []);

  return (
    <>
      <a className="reading-back-to-hub" href="reading.html">← 내 사주로 돌아가기</a>

      <section className="reading-route-state" data-reading-route-state aria-live="polite">
        <span className="reading-route-kicker" data-reading-product-title>사주 읽기</span>
        <h1 data-reading-state-title>읽기를 확인하는 중입니다.</h1>
        <p data-reading-state-copy>요청한 주제와 범위를 확인하고 있습니다.</p>
        <a className="reading-route-action" href="reading.html">다른 사주 읽기 보기 <span aria-hidden="true">→</span></a>
      </section>

      <section className="reading-stage" data-reading-stage hidden aria-label="캐릭터와 함께 읽는 사주">
        <div className="reader-scene" data-reader-portrait role="img" aria-label="백헌 사주 읽기 장면">
          <div className="reader-scene-art" aria-hidden="true">
            <span className="reader-orbit" />
            <span className="reader-lamp" />
            <span className="reader-silhouette" />
          </div>

          <div className="reader-identity">
            <span className="reader-title-badge" data-reader-title>충추원의 장</span>
            <div className="reader-name-line">
              <h1 data-reader-name>백헌</h1>
              <span className="reader-name-hanja" data-reader-hanja aria-hidden="true">白憲</span>
            </div>
            <p data-reader-intro>당신의 사주를 바탕으로 지금의 흐름부터 하나씩 살펴보겠습니다.</p>
          </div>

          <div className="reader-dialogue" aria-label="함께 읽는 사람의 말">
            <span className="reader-dialogue-mark" aria-hidden="true">明</span>
            <p data-reader-step-line>검증된 Reading이 준비되면 이 자리에서 함께 읽겠습니다.</p>
          </div>
        </div>

        <article className="reading-sheet" aria-live="polite">
          <header className="reading-sheet-head">
            <span className="reading-scope" data-reading-scope>원국</span>
            <div className="reading-progress" aria-label="읽기 진행 상태">
              <span data-reading-progress-label>읽기 1 / 4</span>
              <div className="reading-progress-track" aria-hidden="true">
                <span className="reading-progress-dot is-active" data-reading-progress-dot />
                <span className="reading-progress-dot" data-reading-progress-dot />
                <span className="reading-progress-dot" data-reading-progress-dot />
                <span className="reading-progress-dot" data-reading-progress-dot />
              </div>
            </div>
          </header>

          <div className="reading-sheet-body">
            <section className="reading-block reading-block-primary">
              <span className="reading-block-icon" aria-hidden="true">✿</span>
              <div>
                <h2 data-reading-step-title>지금 읽히는 흐름</h2>
                <p data-reading-step-body>검증된 Product Reading 응답이 연결된 뒤 이 영역에 표시됩니다.</p>
              </div>
            </section>

            <section className="reading-block">
              <span className="reading-block-icon" aria-hidden="true">✿</span>
              <div>
                <h2 data-reading-structure-title>이 흐름을 만드는 구조</h2>
                <p data-reading-structure-body>확정된 구조적 근거와 적용 범위만 표시합니다.</p>
              </div>
            </section>

            <section className="reading-block reading-character-block">
              <span className="reading-block-icon" aria-hidden="true">✿</span>
              <div>
                <h2><span data-reader-name>백헌</span>의 한 마디</h2>
                <p>캐릭터는 검증된 Reading의 표현과 후속 질문만 담당합니다.</p>
                <span className="reading-authority-note">사주 의미는 검증된 Reading을 따르며, 캐릭터가 새로운 해석을 만들지 않습니다.</span>
              </div>
            </section>
          </div>

          <footer className="reading-sheet-actions">
            <button className="reading-icon-action" type="button" data-reading-prev aria-label="이전 읽기" disabled>←</button>
            <button className="reading-secondary-action" type="button" data-chart-open>내 명식 보기</button>
            <button className="reading-primary-action" type="button" data-reading-next disabled>
              <span>다음 읽기</span><span aria-hidden="true">→</span>
            </button>
          </footer>
        </article>
      </section>
    </>
  );
}
