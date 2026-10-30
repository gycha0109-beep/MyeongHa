import { useEffect } from 'react';

export function ReadingDetailPage() {
  useEffect(() => {
    void import('../../reading-character.js');
  }, []);

  return (
    <>
      <a className="reading-back-to-hub" data-reading-back-link href="reading.html">← 내 사주로 돌아가기</a>

      <section className="reading-route-state" data-reading-route-state aria-live="polite">
        <span className="reading-route-kicker" data-reading-product-title>사주 읽기</span>
        <h1 data-reading-state-title>읽기를 확인하는 중입니다.</h1>
        <p data-reading-state-copy>요청한 주제와 범위를 확인하고 있습니다.</p>
        <a className="reading-route-action" data-reading-route-action href="reading.html">다른 사주 읽기 보기 <span aria-hidden="true">→</span></a>
      </section>

      <article className="official-report-view" data-official-report hidden aria-label="저장된 공식 사주 보고서">
        <header className="official-report-head">
          <span className="reading-route-kicker">OFFICIAL READING</span>
          <h1 data-official-report-heading tabIndex={-1}>저장된 공식 사주 보고서</h1>
          <p>기록에 저장된 해석을 원래 내용 그대로 한 번에 읽습니다.</p>
          <dl className="official-report-meta">
            <div><dt>발행일</dt><dd data-official-report-date>—</dd></div>
            <div><dt>해석 버전</dt><dd data-official-report-version>—</dd></div>
            <div><dt>해석 영역</dt><dd data-official-report-domain>—</dd></div>
            <div><dt>기록된 대리자</dt><dd data-official-report-reader>—</dd></div>
            <div><dt>발행 당시 출생정보 차수</dt><dd data-official-report-birth-issued>이 기록에 제공되지 않음</dd></div>
            <div><dt>현재 명식록 차수</dt><dd data-official-report-birth-current>확인할 수 없음</dd></div>
          </dl>
        </header>
        <section className="official-report-provenance-note" aria-label="원문과 출생정보 기준">
          <p data-official-report-birth-status role="status">이 기록에 제공된 출생정보 차수가 없어 변경 여부는 확인할 수 없습니다.</p>
          <p>이 보고서의 본문·발행일은 현재 명식록 변경으로 다시 작성되지 않습니다.</p>
          <p>기록된 대리자 정보는 과거 참여 이력입니다. 현재 해설 및 대화 접근권을 의미하지 않습니다.</p>
          <a href="records.html?tab=birth">현재 명식록 확인하기 →</a>
          <button type="button" data-official-report-regenerate disabled aria-disabled="true">새 명식 기준 재생성 준비 중</button>
        </section>
        <div className="official-report-keypoints" data-official-report-first hidden>
          <span className="records-kicker">HIGHLIGHT</span>
          <h2>보고서 첫 해석</h2>
          <p data-official-report-first-text data-official-reading />
        </div>
        <section className="official-report-facts" data-official-report-facts hidden aria-label="저장된 명식 근거">
          <h2>저장된 명식 근거</h2>
          <div className="official-report-pillars" data-official-report-pillars />
          <div data-official-report-elements-group hidden>
            <h3>오행 근거</h3>
            <div className="official-report-evidence" data-official-report-elements data-official-reading />
          </div>
          <div data-official-report-gods-group hidden>
            <h3>십성 근거</h3>
            <div className="official-report-evidence" data-official-report-gods data-official-reading />
          </div>
        </section>
        <nav className="official-report-toc" aria-label="보고서 목차" data-official-report-toc />
        <div className="official-report-sections" data-official-report-sections />
        <aside className="official-report-notice" data-official-report-notice hidden>
          <h2>해석의 적용 범위</h2>
          <p data-official-report-notice-text />
        </aside>
        <footer className="official-report-actions">
          <button type="button" data-official-report-step-mode>단계별 읽기</button>
          <a href="records.html?tab=saju">사주 보고서 보관함으로 돌아가기</a>
          <a href="chat-hub.html">대화 상대 선택 (별도 이용)</a>
        </footer>
      </article>

      <section className="reading-stage" data-reading-stage hidden aria-label="캐릭터와 함께 읽는 사주">
        <div className="reader-scene" data-reader-portrait role="img" aria-label="세연 사주 읽기 장면">
          <div className="reader-scene-art" aria-hidden="true">
            <span className="reader-orbit" />
            <span className="reader-lamp" />
            <span className="reader-silhouette" />
          </div>

          <div className="reader-reading-intro" data-reading-scene-intro aria-hidden="true">
            <span className="reader-reading-intro-kicker">READING SESSION</span>
            <strong><span data-reader-name>세연</span>이 명식을 살펴보고 있습니다.</strong>
            <span className="reader-reading-intro-line" />
          </div>

          <div className="reader-identity">
            <span className="reader-title-badge" data-reader-title>무녀</span>
            <div className="reader-name-line">
              <h1 data-reader-name>세연</h1>
              <span className="reader-name-hanja" data-reader-hanja aria-hidden="true"></span>
            </div>
            <p data-reader-intro>복잡하게 시작하지 않을게요. 지금 가장 크게 읽히는 흐름부터 같이 봐요.</p>
          </div>

          <div className="reader-dialogue" aria-label="함께 읽는 사람의 말">
            <span className="reader-dialogue-mark" aria-hidden="true">明</span>
            <p data-reader-step-line>사주 읽기의 핵심부터 차례대로 짚겠습니다.</p>
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
                <h2 data-reading-step-title tabIndex={-1} data-reading-content>지금 읽히는 흐름</h2>
                <p data-reading-step-body>검증된 Product Reading 응답이 연결된 뒤 이 영역에 표시됩니다.</p>
              </div>
            </section>

            <section className="reading-block" data-reading-supporting hidden>
              <span className="reading-block-icon" aria-hidden="true">✦</span>
              <div>
                <h2 data-reading-supporting-title>추가 해석</h2>
                <p data-reading-supporting-body data-reading-content />
              </div>
            </section>

            <section className="reading-block">
              <span className="reading-block-icon" aria-hidden="true">✿</span>
              <div>
                <h2 data-reading-structure-title>이 흐름을 만드는 구조</h2>
                <p data-reading-structure-body>확정된 구조적 근거와 적용 범위만 표시합니다.</p>
              </div>
            </section>

            <aside className="reading-block" data-reading-step-notice hidden aria-labelledby="reading-step-scope-heading">
              <span className="reading-block-icon" aria-hidden="true">※</span>
              <div>
                <h2 id="reading-step-scope-heading" data-reading-step-notice-heading>해석의 적용 범위</h2>
                <p data-reading-step-notice-text data-reading-content />
              </div>
            </aside>

            <section className="reading-block reading-character-block">
              <span className="reading-block-icon" aria-hidden="true">✿</span>
              <div>
                <h2><span data-reader-name>세연</span>의 한 마디</h2>
                <p data-reader-comment>이 해석에서 실제로 확인해 볼 지점을 함께 짚겠습니다.</p>
                <span className="reading-authority-note" data-reading-authority-note>Preview · 현재 검증 중인 원국 해석입니다.</span>
              </div>
            </section>
          </div>

          <footer className="reading-sheet-actions">
            <button className="reading-secondary-action official-report-return" type="button" data-official-report-return hidden>보고서 전체 보기</button>
            <button className="reading-icon-action" type="button" data-reading-prev aria-label="이전 읽기" disabled>←</button>
            <button className="reading-secondary-action" type="button" data-chart-open>내 명식 보기</button>
            <button className="reading-primary-action" type="button" data-reading-next disabled>
              <span>다음 읽기</span><span aria-hidden="true">→</span>
            </button>
          </footer>

          <section className="reading-completion" data-reading-completion hidden aria-live="polite">
            <span className="reading-completion-kicker">READING COMPLETE</span>
            <h2 data-reading-completion-title><span data-reader-name>세연</span>이 이번 사주 읽기를 마쳤습니다.</h2>
            <p data-reading-completion-copy>이 프리뷰는 공식 풀이 기록에 저장되지 않습니다. 다른 사주 읽기는 사주 페이지에서 선택할 수 있습니다.</p>
            <div className="reading-completion-actions">
              <a className="reading-completion-primary" data-reading-chat-link href="chat-hub.html">
                대화 상대 선택
                <span aria-hidden="true">→</span>
              </a>
              <a className="reading-completion-secondary" data-reading-records-link href="reading.html">
                <span data-reading-completion-secondary-label>다른 사주 읽기</span>
                <span aria-hidden="true">↗</span>
              </a>
            </div>
            <button className="reading-completion-replay" type="button" data-reading-replay>처음부터 다시 읽기</button>
          </section>
        </article>
      </section>
    </>
  );
}
