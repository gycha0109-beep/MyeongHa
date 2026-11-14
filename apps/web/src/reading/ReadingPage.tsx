import { resumePreviewHrefV1 } from '../../reading-preview-continuation.js';
import { useEffect, useState } from 'react';
import { APPROVED_SAJU_CATALOG_GROUPS_V1, APPROVED_SAJU_CATALOG_V1, getApprovedSajuOfferV1 } from './approved-saju-catalog.js';
import { resolveReadingAvailabilityV1 } from './reading-availability.js';

const hrefByOfferId: Readonly<Record<string, string>> = Object.freeze({
  career: 'reading-detail.html?topic=career',
  business: 'reading-detail.html?topic=business',
  wealth: 'reading-detail.html?topic=money',
  relationship: 'reading-detail.html?topic=love',
  year: 'reading-detail.html?scope=year',
  month: 'reading-detail.html?scope=month',
});
const symbolByOfferId: Readonly<Record<string, string>> = Object.freeze({
  career: '✎', business: '商', wealth: '◇', relationship: '✿', year: '歲', month: '月',
});

export function ReadingPage() {
  const resumedPreview = typeof window === 'undefined' ? null : resumePreviewHrefV1(window.location.search);
  // Preserve historic detail URLs in the route layer, but do not surface the
  // retired general-natal product through the present Home/Saju catalogs.
  const resumedVisibleTopic = resumedPreview && Object.values(hrefByOfferId).includes(resumedPreview)
    ? resumedPreview : null;
  const [chartTab, setChartTab] = useState<'pillars' | 'elements'>('pillars');
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  useEffect(() => {
    const onElementSelected = (event: Event) => {
      setSelectedElement((event as CustomEvent<{ element: string | null }>).detail.element);
    };
    document.addEventListener('myeongha:saju-element-selected', onElementSelected);
    return () => document.removeEventListener('myeongha:saju-element-selected', onElementSelected);
  }, []);
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
            <p>입력하신 생년월일시를 기준으로 계산한 기본 명식입니다.<br />아래에서 주제별 공식 사주 해석 상품을 선택하고 보고서 구성도 살펴볼 수 있습니다.</p>
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
              <span id="saju-completeness-title" className="saju-calculation-badge" aria-live="polite">계산 확인 중</span>
              <span id="saju-completeness-copy" className="saju-design-sr-title">계산된 사실 정보를 확인합니다.</span>
            </header>
            <div className="saju-design-chart-tabs" role="tablist" aria-label="사주 계산 결과" onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
              event.preventDefault();
              const nextTab = event.key === 'Home' ? 'pillars'
                : event.key === 'End' ? 'elements'
                  : chartTab === 'pillars' ? 'elements' : 'pillars';
              setChartTab(nextTab);
              const selector = nextTab === 'pillars' ? '#saju-pillars-tab' : '#saju-elements-tab';
              event.currentTarget.querySelector<HTMLButtonElement>(selector)?.focus();
            }}>
              <button id="saju-pillars-tab" type="button" role="tab" aria-controls="saju-pillars-panel" aria-selected={chartTab === 'pillars'} tabIndex={chartTab === 'pillars' ? 0 : -1} className={chartTab === 'pillars' ? 'is-selected' : ''} onClick={() => setChartTab('pillars')}>사주팔자</button>
              <button id="saju-elements-tab" type="button" role="tab" aria-controls="saju-elements-panel" aria-selected={chartTab === 'elements'} tabIndex={chartTab === 'elements' ? 0 : -1} className={chartTab === 'elements' ? 'is-selected' : ''} onClick={() => setChartTab('elements')}>오행 분포</button>
            </div>
            <div className="saju-design-chart-content">
              <div id="saju-pillars-panel" role="tabpanel" aria-labelledby="saju-pillars-tab" tabIndex={0} hidden={chartTab !== 'pillars'}>
                <div id="saju-pillar-grid" className="saju-pillar-grid saju-design-pillars" aria-label="사주 네 기둥" />
                <p id="saju-pillar-selection-note" className="saju-pillar-selection-note" hidden aria-live="polite" />
              </div>
              <div id="saju-elements-panel" className="saju-design-elements-panel" role="tabpanel" aria-labelledby="saju-elements-tab" tabIndex={0} hidden={chartTab !== 'elements'}>
                <p className="saju-elements-description">서버가 계산한 천간·지지 8글자의 오행 개수입니다. 강약 점수가 아닙니다.</p>
                <div id="saju-element-radar" className="saju-element-radar" />
                <div id="saju-element-bars" className="saju-element-choices" role="group" aria-label="오행 선택" />
                <div className="saju-element-actions">
                  <p id="saju-element-feedback" className="saju-element-feedback" aria-live="polite">오행을 선택하면 관련 천간·지지를 명식에서 강조합니다.</p>
                  <button id="saju-view-selected-pillars" className="saju-element-show-button" type="button" disabled={!selectedElement} onClick={() => setChartTab('pillars')}>명식에서 보기</button>
                </div>
              </div>
            </div>
            <div className="saju-design-chart-foot">
              <div className="saju-day-master"><span>일간</span><strong id="saju-day-master">—</strong><small id="saju-day-master-meta">계산 결과 확인 중</small></div>
              <small>실제 명식 계산 결과이며, 유료 해석 본문은 포함되지 않습니다.</small>
            </div>
          </section>
        </div>

        <section className="saju-design-products" aria-labelledby="saju-design-products-title">
          <h2 id="saju-design-products-title">사주 해석 상품</h2>
          <p>2026년 11월 6일 확정된 단품·관계 비교·패키지 구성과 가격입니다. 아래 상태는 현재 화면에서 확인 가능한 풀이 경로를 뜻하며, 준비 중 항목은 개인 풀이가 완성된 것처럼 표시하지 않습니다.</p>
          {APPROVED_SAJU_CATALOG_GROUPS_V1.map((group) => (
            <section className="saju-design-product-group" key={group.id} aria-labelledby={`approved-saju-group-${group.id}`}>
              <h3 id={`approved-saju-group-${group.id}`}>{group.title}</h3>
              <div className="saju-design-product-grid">
                {APPROVED_SAJU_CATALOG_V1.filter((offer) => offer.type === group.id).map((offer) => {
                  const href = hrefByOfferId[offer.id];
                  const availability = href ? resolveReadingAvailabilityV1(href) : null;
                  return (
                    <article className="saju-design-product-card" key={offer.id}>
                      <header><span className="saju-design-topic-symbol" aria-hidden="true">{symbolByOfferId[offer.id] ?? (offer.type === 'comparison' ? '合' : '命')}</span><h3>{offer.title}</h3></header>
                      <p className="saju-design-product-price">{offer.priceKrw.toLocaleString('ko-KR')}원</p>
                      {offer.includes && <p className="saju-design-product-scope">구성: {offer.includes.map((id) => getApprovedSajuOfferV1(id)?.title).join(' + ')}</p>}
                      {availability?.kind === 'preview'
                        ? <><span className={`reading-topic-availability is-${availability.kind}`}>개인 명식 프리뷰</span><a href={href}>명식 확인하기</a></>
                        : <><span className="reading-topic-availability is-unavailable">정식 풀이 연결 준비 중</span><p className="saju-design-product-scope">공식 풀이와 구매한 상품의 전달 경로를 연결 중입니다.</p></>}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </section>

        <section className="saju-design-example" aria-labelledby="saju-design-example-title">
          <div className="saju-design-example-copy">
            <h2 id="saju-design-example-title">보고서 구성 미리보기 <span>구성 예시</span></h2>
            <p>공식 보고서는 구매한 상품의 해석 범위에 따라 목차와 근거가 구성됩니다. 이 영역은 실제 개인별 결과가 아닌 문서 구성 안내입니다.</p>
          </div>
          <div className="saju-design-example-sheet" aria-label="공식 보고서 구성 예시. 개인별 해석이 아닙니다.">
            <h3>1. 핵심 해석 및 명식 근거</h3>
            <p>개인별 공식 해석 · 주제별 상세 내용 · 근거와 한계 · 발행 버전 · 기록 재열람</p>
          </div>
        </section>

        <div className="saju-design-preview-link"><span>지금 확인할 수 있는 무료 개인별 사주 프리뷰</span><a href={resumedVisibleTopic ?? '#saju-design-products-title'}>{resumedVisibleTopic ? '선택한 해석 이어보기 →' : '주제별 해석 살펴보기 →'}</a></div>
        <span id="saju-flow-year" hidden aria-hidden="true" />
      </section>
    </div>
  );
}
