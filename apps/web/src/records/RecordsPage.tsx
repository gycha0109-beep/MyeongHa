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
        <p className="records-lead">완료되어 저장된 사주 풀이를 다시 읽고, 나의 다른 기록도 함께 확인합니다.</p>
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
            <a className="records-profile-action records-profile-action--primary" href="birth.html">
              <span>명식록 추가</span>
              <span className="records-profile-action-arrow" aria-hidden="true">→</span>
            </a>
            <a className="records-profile-action records-profile-action--secondary" href="my.html">
              <span className="records-profile-action-icon" aria-hidden="true">♙</span>
              <span>내 정보</span>
            </a>
          </div>
        </section>

        <div className="records-tabs" role="tablist" aria-label="기록 종류">
          <button className="records-tab records-tab--primary" type="button" role="tab" tabIndex={0} aria-selected="true" aria-controls="saju-records" id="saju-records-tab">사주 보고서</button>
          <span className="records-tab-divider" aria-hidden="true">다른 기록</span>
          <button className="records-tab" type="button" role="tab" tabIndex={-1} aria-selected="false" aria-controls="life-records" id="life-records-tab">현세록</button>
          <button className="records-tab" type="button" role="tab" tabIndex={-1} aria-selected="false" aria-controls="birth-records" id="birth-records-tab">명식록</button>
          <button className="records-tab" type="button" role="tab" tabIndex={-1} aria-selected="false" aria-controls="memory-records" id="memory-records-tab">대리가 기억</button>
        </div>

        <section id="life-records" className="records-tab-panel" role="tabpanel" aria-labelledby="life-records-tab" hidden>
          <div className="records-panel ledger">
            <div className="records-panel-head">
              <div><span className="records-kicker">LIFE</span><h2>현세록</h2></div>
              <p>현재 계정에 확인되어 남아 있는 삶의 사실을 시간 순서대로 봅니다.</p>
            </div>
            <div className="ledger-row ledger-head"><div>확인일</div><div>기록</div><div>상태</div></div>
            <div id="life-records-list" />
          </div>
        </section>

        <section id="saju-records" className="records-tab-panel records-report-home" role="tabpanel" aria-labelledby="saju-records-tab">
          <div className="records-report-intro">
            <div className="records-report-intro-copy">
              <span className="records-kicker">OFFICIAL READINGS</span>
              <h2>나의 사주 보고서</h2>
              <p>완료되어 저장된 사주 풀이 이력을 삶의 사실과 분리해 확인합니다.</p>
              <p className="records-report-guidance">저장된 결과만 표시하며, 공식 해석과 대리자의 설명은 구분합니다.</p>
            </div>
            <div className="records-report-intro-mark" aria-hidden="true">命</div>
          </div>
          <div className="records-report-toolbar">
            <h3>보관된 사주 기록</h3>
            <span id="saju-records-count" className="records-report-count" role="status" aria-live="polite">기록 확인 중…</span>
          </div>
          <div id="saju-records-list" className="records-reading-grid" />
        </section>

        <section id="birth-records" className="records-tab-panel" role="tabpanel" aria-labelledby="birth-records-tab" hidden>
          <div className="records-panel-head records-panel records-birth-head">
            <div><span className="records-kicker">BIRTH</span><h2>명식록</h2></div>
            <p>서버에 저장된 현재 출생 정보와 입력 차수를 확인합니다. 과거 수정 이력은 표시하지 않습니다.</p>
          </div>
          <div id="birth-records-list" className="records-grid" />
        </section>

        <section id="memory-records" className="records-tab-panel" role="tabpanel" aria-labelledby="memory-records-tab" hidden>
          <div className="records-panel records-memory-panel">
            <div className="records-panel-head records-memory-head">
              <div><span className="records-kicker">MEMORY</span><h2>대리가 기억</h2></div>
              <p>현재 저장된 기억을 확인합니다.</p>
            </div>
            <div id="memory-records-list" className="timeline records-memory-list" />
            <p className="records-memory-note">
              <span className="records-memory-note-icon" aria-hidden="true">!</span>
              <span>캐릭터가 삭제된 후 남는 기억 범위는 서로 다를 수 있습니다.</span>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
