import { useEffect } from 'react';

export function RecordsPage() {
  useEffect(() => {
    void import('../../records-page.js');
  }, []);

  return (
    <div className="product-shell records-shell">
      <header className="records-head">
        <div className="records-head-title">
          <div className="records-kicker">MY RECORDS</div>
          <h1 className="records-title">기록</h1>
        </div>
        <p className="records-lead">완료되어 저장된 사주 풀이를 다시 확인합니다.</p>
      </header>

      <div id="records-status" className="records-status" role="status">기록을 불러오는 중입니다…</div>

      <div id="records-content" hidden>
        <section className="records-profile-strip" aria-label="현재 기록 주체">
          <div className="records-profile-mark" aria-hidden="true">之</div>
          <div className="records-profile-copy">
            <div id="records-display-name" className="records-profile-name">호칭 미설정</div>
            <div id="records-subject-kind" className="records-profile-kind">현재 기록</div>
          </div>
          <div className="records-profile-actions">
            <a className="records-profile-action records-profile-action--secondary" href="my.html">
              <span className="records-profile-action-icon" aria-hidden="true">♙</span>
              <span>내 정보</span>
            </a>
          </div>
        </section>

        <section id="saju-records" className="records-report-home">
          <div className="records-report-toolbar">
            <h3>보관된 사주 기록</h3>
            <span id="saju-records-count" className="records-report-count" role="status" aria-live="polite">기록 확인 중…</span>
          </div>
          <div id="saju-records-list" className="records-reading-grid" />
        </section>
      </div>
    </div>
  );
}
