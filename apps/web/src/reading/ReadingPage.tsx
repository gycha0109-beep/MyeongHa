import { resumePreviewHrefV1 } from '../../reading-preview-continuation.js';
import { useEffect, useState } from 'react';
import { resolveReadingAvailabilityV1 } from './reading-availability.js';

export function ReadingPage() {
  const resumedPreview = typeof window === 'undefined' ? null : resumePreviewHrefV1(window.location.search);
  const [chartTab, setChartTab] = useState<'pillars' | 'elements' | 'structure'>('pillars');
  useEffect(() => {
    void import('../../saju-hub.js');
  }, []);

  return (
    <div className="gm-shell">
      <h1 className="gm-page-title saju-design-sr-title">사주</h1>
      <div className="saju-status" id="saju-status" role="status">내 사주를 확인하는 중입니다…</div>
      <button id="saju-calculation-retry" className="saju-calculation-retry" type="button" hidden>
        저장된 출생정보로 계산 다시 시도
      </button>

      <section className="saju-empty" id="saju-empty" hidden aria-labelledby="saju-empty-title">
        <div className="saju-empty-art" aria-hidden="true">
          <span className="saju-empty-orbit" />
          <span className="saju-empty-mark">命</span>
        </div>
        <div className="saju-empty-card">
          <span className="saju-section-kicker">처음 시작하기</span>
          <h2 id="saju-empty-title">아직 등록된 사주가 없습니다.</h2>
          <p>태어난 정보를 입력하면 명하가 현재 세션의 자기 명식을 계산합니다. 로그인하지 않아도 먼저 확인할 수 있습니다.</p>

          <form className="saju-birth-form" id="saju-birth-form" noValidate>
            <div className="saju-form-grid">
              <label className="saju-field">
                <span>생년월일</span>
                <div className="saju-date-fields" role="group" aria-label="생년월일">
                  <input id="saju-birth-year" className="saju-date-part saju-date-year" type="text" inputMode="numeric" autoComplete="bday-year" maxLength={4} pattern="[0-9]{4}" placeholder="YYYY" aria-label="출생 연도" required />
                  <span className="saju-date-separator" aria-hidden="true">.</span>
                  <input id="saju-birth-month" className="saju-date-part" type="text" inputMode="numeric" autoComplete="bday-month" maxLength={2} pattern="[0-9]{1,2}" placeholder="MM" aria-label="출생 월" required />
                  <span className="saju-date-separator" aria-hidden="true">.</span>
                  <input id="saju-birth-day" className="saju-date-part" type="text" inputMode="numeric" autoComplete="bday-day" maxLength={2} pattern="[0-9]{1,2}" placeholder="DD" aria-label="출생 일" required />
                </div>
              </label>
              <label className="saju-field">
                <span>출생시간</span>
                <input id="saju-birth-time" type="text" inputMode="numeric" autoComplete="off" placeholder="HH:mm" maxLength={5} pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]" aria-label="출생시간 (24시간제 HH:mm)" required />
              </label>
            </div>

            <div className="saju-form-options">
              <label><input id="saju-time-unknown" type="checkbox" /> 출생시간을 모릅니다</label>
              <div className="saju-calendar-options" role="group" aria-label="달력 기준">
                <label><input type="radio" name="saju-calendar" value="solar" defaultChecked /> 양력</label>
                <label><input type="radio" name="saju-calendar" value="lunar" /> 음력</label>
                <label id="saju-leap-wrap" hidden><input id="saju-leap-month" type="checkbox" /> 윤달</label>
              </div>
            </div>

            <label className="saju-field saju-field-select">
              <span>성별 입력 <small>선택 사항</small></span>
              <select id="saju-birth-sex" defaultValue="">
                <option value="">선택하지 않음</option>
                <option value="male">남성</option>
                <option value="female">여성</option>
                <option value="unspecified">미지정</option>
              </select>
            </label>

            <div className="saju-form-error" id="saju-form-error" hidden role="alert" />
            <button className="saju-primary-button" id="saju-create-button" type="submit">
              <span>내 사주 만들기</span><span aria-hidden="true">→</span>
            </button>
            <p className="saju-guest-note"><span aria-hidden="true">◇</span> 게스트로 먼저 볼 수 있으며, 저장·동기화가 필요할 때 계정 연결을 사용합니다.</p>
          </form>
        </div>
      </section>


      <section id="saju-hub" className="saju-design-preview" hidden aria-label="내 사주 무료 프리뷰">
        <div className="saju-design-hero">
          <div className="saju-design-hero-text">
            <span className="saju-design-eyebrow">SAJU PREVIEW</span>
            <h2>나의 사주 기본 정보</h2>
            <p>입력하신 생년월일시를 기준으로 계산한 기본 명식입니다.<br />현재 확인 가능한 계산 결과만 표시하며, 공식 해석 상품은 준비 상태에 따라 별도 제공됩니다.</p>
          </div>
        </div>

        <div className="saju-design-core">
          <section className="saju-design-card saju-design-birth-card" aria-labelledby="saju-design-birth-title">
            <header className="saju-design-card-heading">
              <h3 id="saju-design-birth-title">입력 정보</h3>
              <a className="saju-design-edit" href="my.html#my-birth-title" title="저장된 출생정보 확인. 기존 정보 수정 기능은 준비 중입니다.">✎ 입력 정보 확인</a>
            </header>
            <dl className="saju-design-birth-fields">
              <div><dt>생년월일</dt><dd id="saju-birth-date-display">확인 중</dd></div>
              <div><dt>출생 시간</dt><dd id="saju-birth-time-display">확인 중</dd></div>
              <div><dt>성별</dt><dd id="saju-birth-sex-display">확인 중</dd></div>
              <div><dt>출생지</dt><dd id="saju-birth-place-display">제공되지 않음</dd></div>
              <div><dt>계산 기준</dt><dd id="saju-birth-calendar-display">확인 중</dd></div>
            </dl>
            <p className="saju-design-source-note" id="saju-birth-summary">현재 자기 Birth Profile과 연결된 계산 결과입니다.</p>
          </section>

          <section className="saju-design-card saju-design-chart-card" aria-labelledby="saju-design-chart-title">
            <header className="saju-design-card-heading">
              <h3 id="saju-design-chart-title">나의 사주 명식</h3>
            </header>
            <div className="saju-design-chart-tabs" role="tablist" aria-label="사주 계산 결과">
              <button type="button" role="tab" aria-selected={chartTab === 'pillars'} className={chartTab === 'pillars' ? 'is-selected' : ''} onClick={() => setChartTab('pillars')}>사주팔자</button>
              <button type="button" role="tab" aria-selected={chartTab === 'elements'} className={chartTab === 'elements' ? 'is-selected' : ''} onClick={() => setChartTab('elements')}>오행 분포</button>
              <button type="button" role="tab" aria-selected={chartTab === 'structure'} className={chartTab === 'structure' ? 'is-selected' : ''} onClick={() => setChartTab('structure')}>계산 상태</button>
            </div>
            <div className="saju-design-chart-content" role="tabpanel">
              <div id="saju-pillar-grid" className="saju-pillar-grid saju-design-pillars" hidden={chartTab !== 'pillars'} aria-label="사주 네 기둥" />
              <div className="saju-design-elements-panel" hidden={chartTab !== 'elements'}>
                <p>서버가 계산한 천간·지지의 오행을 집계한 값입니다.</p>
                <div id="saju-element-bars" className="saju-element-bars" />
              </div>
              <div className="saju-design-structure-panel" hidden={chartTab !== 'structure'}>
                <strong id="saju-completeness-title">—</strong>
                <p id="saju-completeness-copy">확정된 계산 사실만 표시합니다.</p>
              </div>
            </div>
            <div className="saju-design-chart-foot">
              <div className="saju-day-master"><span>일간</span><strong id="saju-day-master">—</strong><small id="saju-day-master-meta">계산 결과 확인 중</small></div>
              <small>실제 명식 계산 결과이며, 유료 해석 본문은 포함되지 않습니다.</small>
            </div>
          </section>
        </div>

        <section className="saju-design-products saju-current-service" aria-labelledby="saju-current-service-title">
          <h2 id="saju-current-service-title">지금 이용할 수 있는 사주 기능</h2>
          <p>입력한 출생정보를 바탕으로 계산된 명식을 확인하고, 제공 가능한 범위의 무료 풀이를 읽을 수 있습니다. 정식 유료 해석은 상품별 준비 상태를 확인한 뒤 별도로 안내합니다.</p>
          <div className="saju-design-product-grid">
            <article className="saju-design-product-card">
              <header><span className="saju-design-topic-symbol" aria-hidden="true">命</span><h3>내 사주 명식</h3></header>
              <p>출생정보와 서버 계산 결과를 확인합니다. 출생시간이 없거나 계산이 제한된 항목은 그대로 표시합니다.</p>
              <a href="records.html?tab=birth">저장된 명식 확인하기</a>
            </article>
            <article className="saju-design-product-card">
              <header><span className="saju-design-topic-symbol" aria-hidden="true">▤</span><h3>나의 사주 기록</h3></header>
              <p>발행되어 저장된 공식 풀이가 있다면 원문과 근거를 다시 읽을 수 있습니다. 저장된 결과가 없다면 빈 기록으로 표시합니다.</p>
              <a href="records.html?tab=saju">사주 기록 열기</a>
            </article>
          </div>
          <p className="saju-service-hold">유료 상품의 가격·제공 범위·결제 가능 여부는 상품별 확정 전까지 안내하거나 구매받지 않습니다.</p>
        </section>

        <div className="saju-design-preview-link"><span>지금 확인할 수 있는 무료 개인별 사주 프리뷰</span><a href={resumedPreview ?? 'reading-detail.html?topic=temperament&scope=original'}>무료 사주 프리뷰 열기 →</a></div>
        <span id="saju-flow-year" hidden aria-hidden="true" />
      </section>
    </div>
  );
}
