import { useEffect } from 'react';

const readingTopics = [
  ['✦', '전체 사주', '나라는 사람을 더 깊이', 'reading-detail.html?topic=temperament&scope=original', ''],
  ['⌁', '직업 · 커리어', '지금의 길, 더 나은 길로', 'reading-detail.html?topic=career', ''],
  ['財', '재물', '흐르는 기회를 잡는 법', 'reading-detail.html?topic=money', ''],
  ['緣', '연애 · 관계', '더 좋은 인연이 있는 곳', 'reading-detail.html?topic=love', 'is-rose'],
  ['業', '사업', '시작과 확장의 흐름', 'reading-detail.html?topic=business', ''],
  ['家', '가족', '함께하는 마음의 길', 'reading-detail.html?topic=family', ''],
  ['葉', '삶의 단계', '지금의 시기를 지나, 다음으로', 'reading-detail.html?topic=life-stage', 'is-wide'],
] as const;

const relationshipTopics = [
  ['♡', '배우자 · 관계', '소중한 인연의 흐름을 알아보세요.', 'reading-detail.html?topic=spouse', 'is-rose'],
  ['∞', '궁합', '함께할 때 더욱 빛나는 이야기', 'reading-detail.html?topic=compatibility', ''],
] as const;

export function ReadingPage() {
  useEffect(() => {
    void import('../../saju-hub.js');
  }, []);

  return (
    <div className="gm-shell">
      <header className="gm-saju-head">
        <h1 className="gm-page-title">사주</h1>
        <p className="gm-lede">내 명식과 사주 읽기 주제를 한곳에 모아봤어요.</p>
      </header>

      <div className="saju-status" id="saju-status" role="status">내 사주를 확인하는 중입니다…</div>

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
                <input id="saju-birth-time" type="time" step="60" required />
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

      <section id="saju-hub" hidden aria-label="계산된 내 사주">
        <article className="gm-saju-hero" aria-labelledby="gm-saju-profile-title">
          <div className="gm-saju-hero-copy">
            <h2 className="gm-saju-title" id="gm-saju-profile-title">나의 명식</h2>
            <p className="gm-saju-summary" id="saju-birth-summary">현재 자기 Birth Profile과 연결된 계산 결과입니다.</p>
            <details className="gm-chart-details">
              <summary>기본 정보 보기 →</summary>
              <div className="gm-chart-panel">
                <div className="saju-pillar-grid" id="saju-pillar-grid" aria-label="사주 네 기둥" />
                <div className="saju-chart-summary">
                  <div className="saju-day-master">
                    <span>일간</span>
                    <strong id="saju-day-master">—</strong>
                    <small id="saju-day-master-meta">계산 결과 확인 중</small>
                  </div>
                  <div className="saju-elements">
                    <span className="saju-summary-label">오행 분포</span>
                    <div className="saju-element-bars" id="saju-element-bars" />
                  </div>
                  <div className="saju-structure-note">
                    <span className="saju-summary-label">계산 상태</span>
                    <strong id="saju-completeness-title">—</strong>
                    <p id="saju-completeness-copy">확정된 계산 사실만 표시합니다.</p>
                  </div>
                </div>
                <p className="saju-authority-note">이 영역은 계산된 명식 사실만 보여줍니다. 의미 해석은 별도 Reading에서 제공합니다.</p>
              </div>
            </details>
          </div>
          <blockquote className="gm-saju-quote">“지금의 내가,<br />더 좋은 내일을 만듭니다.”</blockquote>
        </article>

        <section className="gm-section" aria-labelledby="gm-reading-title">
          <div className="gm-section-head">
            <div><h2 className="gm-section-title" id="gm-reading-title">나를 읽기 <span className="gm-section-support">나를 더 깊이 이해하는 시간</span></h2></div>
            <a className="gm-inline-link" href="reading-detail.html?topic=temperament&scope=original">전체 보기 <span aria-hidden="true">›</span></a>
          </div>
          <div className="gm-saju-reading-grid">
            {readingTopics.map(([icon, title, description, href, modifier]) => (
              <a className={`gm-card gm-saju-reading-card${modifier === 'is-wide' ? ' is-wide' : ''}`} href={href} key={href}>
                <span className={`gm-icon${modifier === 'is-rose' ? ' is-rose' : ''}`} aria-hidden="true">{icon}</span>
                <span><strong>{title}</strong><small>{description}</small></span>
                <span className="gm-chevron" aria-hidden="true">›</span>
              </a>
            ))}
          </div>
        </section>

        <section className="gm-section" aria-labelledby="gm-flow-title">
          <div className="gm-section-head">
            <h2 className="gm-section-title" id="gm-flow-title">지금의 흐름</h2>
            <span className="gm-section-support">지금, 놓치지 말아야 할 시간</span>
          </div>
          <div className="gm-saju-flow-grid">
            <a className="gm-card gm-flow-card" href="reading-detail.html?scope=year">
              <span className="gm-flow-thumb" aria-hidden="true" />
              <span className="gm-flow-copy"><strong>올해</strong><p id="saju-flow-year">올해의 흐름</p><p>지금의 흐름을 한눈에, 주요 키워드와 변화의 시기를 읽어보세요.</p></span>
              <span className="gm-chevron" aria-hidden="true">›</span>
            </a>
            <a className="gm-card gm-flow-card" href="reading-detail.html?scope=month">
              <span className="gm-flow-thumb" aria-hidden="true" />
              <span className="gm-flow-copy"><strong>이번 달</strong><p>이번 달의 기운과 흐름, 놓치지 말아야 할 순간을 짚어봅니다.</p></span>
              <span className="gm-chevron" aria-hidden="true">›</span>
            </a>
          </div>
        </section>

        <section className="gm-section" aria-labelledby="gm-relation-title">
          <div className="gm-section-head"><h2 className="gm-section-title" id="gm-relation-title">사람과의 관계</h2></div>
          <div className="gm-relationship-grid">
            {relationshipTopics.map(([icon, title, description, href, modifier]) => (
              <a className="gm-card gm-relation-card" href={href} key={href}>
                <span className={`gm-icon${modifier ? ` ${modifier}` : ''}`} aria-hidden="true">{icon}</span>
                <span><strong>{title}</strong><small>{description}</small></span>
                <span className="gm-chevron" aria-hidden="true">›</span>
              </a>
            ))}
          </div>
        </section>

        <section className="gm-section" aria-labelledby="gm-question-title">
          <div className="gm-section-head"><h2 className="gm-section-title" id="gm-question-title">고민이 있다면</h2></div>
          <a className="gm-card gm-question-card" href="reading-detail.html?topic=question-specific">
            <span className="gm-icon" aria-hidden="true">…</span>
            <span className="gm-question-copy"><strong>지금 고민으로 보기</strong><small>지금 마음에 있는 질문을 바탕으로, 사주가 전하는 범위 안에서 읽어보세요.</small></span>
            <span className="gm-chevron" aria-hidden="true">›</span>
          </a>
        </section>
      </section>
    </div>
  );
}
