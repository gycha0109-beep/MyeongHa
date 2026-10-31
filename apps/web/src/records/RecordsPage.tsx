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
      </header>

      <div id="records-status" className="records-status" role="status">기록을 불러오는 중입니다…</div>

      <div id="records-content" hidden>
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
