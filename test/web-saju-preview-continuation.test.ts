import { describe, expect, it } from 'vitest';
import { previewSetupHrefV1, resumePreviewHrefV1 } from '../apps/web/reading-preview-continuation.js';

describe('Saju first result continuation', () => {
  it('returns to the exact authorized preview after birth-profile setup', () => {
    for (const source of [
      '?topic=temperament&scope=original', '?topic=career', '?topic=money',
      '?topic=love', '?topic=business',
    ]) {
      const setup = previewSetupHrefV1(source);
      expect(setup.startsWith('reading.html?next=')).toBe(true);
      const continued = resumePreviewHrefV1(setup.slice(setup.indexOf('?')));
      expect(continued).toBe(`reading-detail.html${source}`);
    }
  });
  it('never redirects into a different, blocked or external reading', () => {
    for (const input of [
      'https://other.example/reading-detail.html?topic=love',
      '//other.example/reading-detail.html?topic=love',
      'reading-detail.html?scope=year',
      'reading-detail.html?topic=compatibility',
      'reading-detail.html?topic=life-stage',
      'reading-detail.html?topic=love&reader=seyeon',
      'reading-detail.html?topic=love&readingId=secret',
      'reading-detail.html?topic=love#secret',
      '/reading-detail.html?topic=love',
    ]) {
      expect(resumePreviewHrefV1('next=' + encodeURIComponent(input)), input).toBeNull();
    }
    expect(previewSetupHrefV1('?topic=money&scope=year')).toBe('reading.html');
    expect(resumePreviewHrefV1('next=https%3A%2F%2Fexample.com')).toBeNull();
  });
});
