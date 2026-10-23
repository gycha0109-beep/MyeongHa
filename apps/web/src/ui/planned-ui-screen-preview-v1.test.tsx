import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomePage } from '../home/HomePage.js';
import { ChatHubPage } from '../chat-hub/ChatHubPage.js';
import { RecordsPage } from '../records/RecordsPage.js';
import {
  resolveDevPlannedUiPreviewLocaleV1,
  previewReviewedUiTextV1,
} from './planned-ui-screen-preview-v1.js';

describe('I18N-07 developer-only rendered EN/ZH UI preview', () => {
  it('requires exact development-only locale selection, never persisted or header input', () => {
    expect(resolveDevPlannedUiPreviewLocaleV1('?ui-preview=en-US', true)).toBe('en-US');
    expect(resolveDevPlannedUiPreviewLocaleV1('?ui-preview=zh-CN', true)).toBe('zh-CN');
    expect(resolveDevPlannedUiPreviewLocaleV1('?ui-preview=en-US', false)).toBeNull();
    for (const invalid of [
      '?ui-preview=ja-JP', '?ui-preview=zh', '?ui-preview=zh-TW',
      '?ui-preview=en-GB', '?ui-preview=ko-KR', '?ui-preview=en-US&ui-preview=zh-CN', '',
    ]) expect(resolveDevPlannedUiPreviewLocaleV1(invalid, true)).toBeNull();
    expect(previewReviewedUiTextV1('당사자의 개인 메시지')).toBe('당사자의 개인 메시지');
    expect(previewReviewedUiTextV1('당사자의 개인 메시지', 'en-US')).toBe('당사자의 개인 메시지');
    expect(previewReviewedUiTextV1('누구와 이야기를 시작해 볼까요?', 'en-US'))
      .toBe('Who would you like to talk to?');
  });

  it('renders actual Home JSX UI labels in English while leaving preview/source data unchanged', () => {
    const english = renderToStaticMarkup(<HomePage previewLocale="en-US" />);
    const korean = renderToStaticMarkup(<HomePage />);
    expect(english).toContain('data-planned-ui-preview="en-US"');
    expect(english).toContain('Who would you like to talk to?');
    expect(english).toContain('Monthly readings are not yet available.');
    expect(english).toContain('Saved facts are not currently joined into a story through guesswork.');
    expect(english).toContain('href="reading-detail.html?topic=temperament&amp;scope=original"');
    expect(english).toContain('id="home-character-title"');
    expect(korean).toContain('누구와 이야기를 시작해 볼까요?');
    expect(korean).toContain('href="chat-hub.html">대화로 가기 →</a>');
    expect(korean).not.toContain('data-planned-ui-preview=');
    // Entertainment fortune draws and dynamic Source/Reader output remain outside the preview.
    expect(english).toContain('aria-label="오늘의 포춘쿠키"');
  });

  it('renders Chat Hub UI and accessibility source labels in Simplified Chinese without touching data sockets', () => {
    const chinese = renderToStaticMarkup(<ChatHubPage previewLocale="zh-CN" />);
    const korean = renderToStaticMarkup(<ChatHubPage />);
    expect(chinese).toContain('data-planned-ui-preview="zh-CN"');
    expect(chinese).toContain('对话');
    expect(chinese).toContain('请选择一位您感兴趣的人');
    expect(chinese).toContain('aria-label="对话列表连接状态"');
    expect(chinese).toContain('data-continuation-context="true"');
    expect(chinese).toContain('data-recent-list="true"');
    expect(chinese).toContain('data-people-grid="true"');
    expect(korean).toContain('대화 목록 연결 상태');
    expect(korean).not.toContain('data-planned-ui-preview=');
    expect(chinese).toContain('href="#people"');
  });

  it('renders Records UI and privacy notices in EN/CN while preserving record sockets', () => {
    const english = renderToStaticMarkup(<RecordsPage previewLocale="en-US" />);
    const chinese = renderToStaticMarkup(<RecordsPage previewLocale="zh-CN" />);
    const korean = renderToStaticMarkup(<RecordsPage />);
    expect(english).toContain('data-planned-ui-preview="en-US"');
    expect(english).toContain('aria-label="Current record owner"');
    expect(english).toContain('Loading records…');
    expect(english).toContain('Review completed, saved Saju readings separately from life facts.');
    expect(chinese).toContain('aria-label="当前记录主体"');
    expect(chinese).toContain('删除角色后保留的记忆范围可能有所不同。');
    for (const markup of [english, chinese, korean]) {
      for (const id of ['records-content','life-records-list','saju-records-list','birth-records-list','memory-records-list']) {
        expect(markup).toContain('id="' + id + '"');
      }
      expect(markup).toContain('href="my.html"');
    }
    expect(korean).toContain('캐릭터가 삭제된 후 남는 기억 범위는 서로 다를 수 있습니다.');
    expect(korean).toContain('>사주 기록</button>');
    expect(korean).not.toContain('data-planned-ui-preview=');
  });
});
