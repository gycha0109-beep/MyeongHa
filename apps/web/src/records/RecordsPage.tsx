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
        <p className="records-lead">내가 남긴 삶의 사실, 사주에서 읽어낸 결과, 태어난 순간의 기록, 대리가 기억하고 있는 내용을 서로 섞지 않고 확인합니다.</p>
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
          <button className="records-tab" type="button" role="tab" aria-selected="true" aria-controls="life-records" id="life-records-tab">현세록</button>
          <button className="records-tab" type="button" role="tab" aria-selected="false" aria-controls="saju-records" id="saju-records-tab">사주 기록</button>
          <button className="records-tab" type="button" role="tab" aria-selected="false" aria-controls="birth-records" id="birth-records-tab">명식록</button>
          <button className="records-tab" type="button" role="tab" aria-selected="false" aria-controls="memory-records" id="memory-records-tab">대리가 기억</button>
        </div>

        <section id="life-records" className="records-tab-panel" role="tabpanel" aria-labelledby="life-records-tab">
          <div className="records-panel ledger">
            <div className="records-panel-head">
              <div><span className="records-kicker">LIFE</span><h2>현세록</h2></div>
              <p>현재 계정에 확인되어 남아 있는 삶의 사실을 시간 순서대로 봅니다.</p>
            </div>
            <div className="ledger-row ledger-head"><div>확인일</div><div>기록</div><div>상태</div></div>
            <div id="life-records-list" />
          </div>
        </section>

        <section id="saju-records" className="records-tab-panel" role="tabpanel" aria-labelledby="saju-records-tab" hidden>
          <div className="records-panel-head records-panel records-saju-head">
            <div><span className="records-kicker">SAJU</span><h2>사주 기록</h2></div>
            <p>완료되어 저장된 사주 풀이 이력을 삶의 사실과 분리해 확인합니다. 실제 Reading이 없을 때만 개발 샘플이 fallback으로 표시됩니다.</p>
          </div>
          <div id="saju-records-list" className="records-reading-grid" />
        </section>

        <section id="birth-records" className="records-tab-panel" role="tabpanel" aria-labelledby="birth-records-tab" hidden>
          <div className="records-panel-head records-panel records-birth-head">
            <div><span className="records-kicker">BIRTH</span><h2>명식록</h2></div>
            <p>태어난 순간의 원본 입력과 연결된 기록을 확인합니다.</p>
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
