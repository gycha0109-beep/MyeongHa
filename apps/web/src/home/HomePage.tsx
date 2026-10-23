import { findReaderPresentation } from '../../reader-presentation-catalog.js';
import { resolveReadingAvailabilityV1 } from '../reading/reading-availability.js';
import { FortuneCookie } from './FortuneCookie.js';

const readingTopics = [
  {
    title: '전체 사주',
    description: '나라는 사람을 더 깊이 이해하고 싶을 때',
    glyph: '✦',
    href: 'reading-detail.html?topic=temperament&scope=original',
    motif: 'all',
  },
  {
    title: '직업 · 커리어',
    description: '일과 선택의 길이 궁금할 때',
    glyph: '⌁',
    href: 'reading-detail.html?topic=career',
    motif: 'career',
  },
  {
    title: '재물',
    description: '재물과 자원의 흐름을 알고 싶을 때',
    glyph: '財',
    href: 'reading-detail.html?topic=money',
    motif: 'wealth',
  },
  {
    title: '연애 · 관계',
    description: '관계의 흐름과 인연이 궁금할 때',
    glyph: '緣',
    href: 'reading-detail.html?topic=love',
    motif: 'love',
  },
] as const;

// The existing browser presentation catalog supplies names and art only.
// It does not grant Character publication or conversation access.
const featuredReaders = ['seyeon', 'baekheon', 'yeoul']
  .map((key) => findReaderPresentation(key))
  .filter((reader): reader is NonNullable<typeof reader> => reader !== null);

export function HomePage() {
  return (
    <div className="mhx-home">
      <section className="mhx-hero" aria-labelledby="mhx-hero-title">
        <div className="mhx-hero-art" aria-hidden="true"><span className="mhx-moon" /></div>
        <div className="mhx-hero-inner">
          <p className="mhx-eyebrow">흐르는 시간을, 더 나은 이야기로</p>
          <h1 id="mhx-hero-title" className="mhx-hero-heading">
            요즘, 무엇이 가장 <em>궁금하세요?</em>
          </h1>
          <p className="mhx-hero-subtitle">궁금한 주제를 선택하면, 명하가 당신의 이야기를 시작합니다.</p>
          <div className="mhx-topics" aria-label="사주 관심 주제">
            {readingTopics.map((topic) => (
              <a key={topic.motif} className="mhx-topic" data-motif={topic.motif} href={topic.href}
                aria-label={`${topic.title} — ${resolveReadingAvailabilityV1(topic.href).label}`}>
                <span className="mhx-topic-icon" aria-hidden="true">{topic.glyph}</span>
                <span className="mhx-topic-copy">
                  <strong>{topic.title}</strong>
                  <small>{topic.description}</small>
                  <small className="mhx-topic-status">{resolveReadingAvailabilityV1(topic.href).label}</small>
                </span>
                <span className="mhx-topic-arrow" aria-hidden="true">›</span>
              </a>
            ))}
          </div>
          <div className="mhx-hero-actions">
            <a className="mhx-primary-link" href="reading-detail.html?topic=temperament&scope=original">
              사주 프리뷰 보기 <span aria-hidden="true">→</span>
            </a>
            <p>간단한 정보로 지금, 당신의 사주를 미리 만나보세요.<small>정식 읽기 제공 여부는 상세 화면에서 확인할 수 있습니다.</small></p>
          </div>
        </div>
        <p className="mhx-hero-quote">“당신의 하루에도,<br />좋은 이야기가 함께하길.”</p>
      </section>

      <section className="mhx-characters" aria-labelledby="mhx-characters-title">
        <div className="mhx-characters-intro">
          <span className="mhx-small-label">✧ 명하의 이야기 동행자</span>
          <h2 id="mhx-characters-title">당신의 이야기를<br />들어줄 사람이 있어요</h2>
          <p>각기 다른 시선으로, 당신의 고민에 귀 기울이는 명하의 캐릭터를 만나보세요.</p>
          <a className="mhx-primary-link mhx-compact-link" href="chat-hub.html">인물 둘러보기 <span aria-hidden="true">→</span></a>
        </div>
        <div className="mhx-character-list">
          {featuredReaders.map((reader) => (
            <article className="mhx-character" key={reader.key}>
              <div className="mhx-character-art">
                <img src={reader.portrait} alt={`${reader.name} 캐릭터 소개 이미지`} loading="lazy" decoding="async" />
                <div className="mhx-character-caption">
                  <h3>{reader.name}</h3>
                  <span>{reader.title}</span>
                </div>
              </div>
              <div className="mhx-character-footer">
                <p>{reader.tone}</p>
                <a href="chat-hub.html" aria-label={`${reader.name} — 대화 화면에서 제공 상태 확인`}>대화 살펴보기 <span aria-hidden="true">→</span></a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mhx-section" aria-labelledby="mhx-today-title">
        <h2 id="mhx-today-title" className="mhx-section-title">지금, 확인해 보세요</h2>
        <div className="mhx-content-grid">
          <button type="button" className="mhx-content-card" onClick={() => document.dispatchEvent(new Event('myeongha:open-fortune-cookie'))}>
            <span className="mhx-content-icon" data-tone="sun" aria-hidden="true">☼</span>
            <span className="mhx-content-copy"><strong>오늘의 포춘쿠키</strong><small>가벼운 한마디를 뽑아보세요. 공식 사주 운세와는 별개입니다.</small></span>
            <span className="mhx-content-arrow" aria-hidden="true">›</span>
          </button>
          <a className="mhx-content-card" href="reading-detail.html?topic=temperament&scope=original">
            <span className="mhx-content-icon" data-tone="month" aria-hidden="true">▦</span>
            <span className="mhx-content-copy"><strong>이번 달 사주 읽기</strong><small>월간 해석은 준비 중입니다. 전체 사주 프리뷰를 먼저 확인해 보세요.</small></span>
            <span className="mhx-content-arrow" aria-hidden="true">›</span>
          </a>
          <a className="mhx-content-card" href="birth.html">
            <span className="mhx-content-icon" data-tone="profile" aria-hidden="true">♙</span>
            <span className="mhx-content-copy"><strong>나의 사주</strong><small>내 출생 정보를 확인하고 사주를 시작해 보세요.</small></span>
            <span className="mhx-content-arrow" aria-hidden="true">›</span>
          </a>
        </div>
      </section>

      <section className="mhx-section mhx-recent" aria-labelledby="mhx-recent-title">
        <div className="mhx-section-head">
          <h2 id="mhx-recent-title" className="mhx-section-title">최근 이야기</h2>
          <a href="chat-hub.html">전체보기 <span aria-hidden="true">›</span></a>
        </div>
        <div className="mhx-recent-card">
          <span className="mhx-recent-seal" aria-hidden="true">明</span>
          <div>
            <strong>당신의 이야기를 기다리고 있어요</strong>
            <p>최근 대화 기록은 아직 홈에 연결되지 않았습니다. 실제 대화와 기록은 대화 화면에서 확인해 주세요.</p>
          </div>
          <a className="mhx-primary-link mhx-recent-link" href="chat-hub.html">대화 보러 가기 <span aria-hidden="true">→</span></a>
        </div>
      </section>
      <FortuneCookie />
    </div>
  );
}
