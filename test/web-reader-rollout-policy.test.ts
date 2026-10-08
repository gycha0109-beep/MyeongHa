import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  READER_PREVIEW_CANDIDATE_IDS_V1,
  READER_PUBLIC_INTERPRETATION_ENABLED_V1,
  readerRolloutPresentationV1,
  resolveReaderPresentationCandidateV1,
} from '../apps/web/reader-rollout-policy.js';
import { READER_PRESENTATIONS } from '../apps/web/reader-presentation-catalog.js';

const read = async (relativePath: string) =>
  readFile(new URL('../' + relativePath, import.meta.url), 'utf8');
const canonicalIds = ['seyeon','baekheon','yeoul','seorin','rahyeon','mira','taegyeom','yunho','doyun'];

describe('Reader staged rollout: one Preview presentation candidate, shared nine-reader architecture', () => {
  it('preserves all nine canonical identities for later rollout', () => {
    expect(READER_PRESENTATIONS.map(r => r.key)).toEqual(canonicalIds);
    expect(READER_PREVIEW_CANDIDATE_IDS_V1).toEqual(['seyeon']);
    expect(new Set(READER_PREVIEW_CANDIDATE_IDS_V1).size).toBe(1);
  });

  it('selects only Seyeon for Preview presentation and marks the other eight withheld', () => {
    for (const id of canonicalIds) {
      const result = readerRolloutPresentationV1(id);
      expect(result.characterId).toBe(id);
      expect(result.previewSelectable).toBe(id === 'seyeon');
      expect(result.stage).toBe(id === 'seyeon' ? 'preview_presentation' : 'concept_pending');
      expect(result.publicInterpretationEnabled).toBe(false);
      expect(resolveReaderPresentationCandidateV1(id)).toBe('seyeon');
    }
    expect(readerRolloutPresentationV1('unknown')).toMatchObject({
      stage:'unknown', previewSelectable:false, publicInterpretationEnabled:false,
    });
  });

  it('never claims commercial Reader Interpretation is live because Seyeon Preview is selectable', () => {
    expect(READER_PUBLIC_INTERPRETATION_ENABLED_V1).toBe(false);
  });

  it('keeps the web UI and deep links aligned on release candidates', async () => {
    const [picker, shared, scene, html, css] = await Promise.all([
      read('apps/web/reading-reader-picker.js'),
      read('apps/web/reader-picker-dialog.js'),
      read('apps/web/reading-character.js'),
      read('apps/web/reading-detail.html'),
      read('apps/web/reading-reader-picker.css'),
    ]);
    expect(picker).toContain('readerRolloutPresentationV1(reader.key)');
    expect(picker).toContain('selectable: rollout.previewSelectable');
    expect(shared).toContain('button.disabled = optionState.selectable === false;');
    expect(shared).toContain('if (!(button instanceof HTMLButtonElement) || button.disabled) return;');
    expect(picker).toContain('readerRolloutPresentationV1(reader.key).previewSelectable');
    expect(picker).toContain('현재 세연만 프리뷰 장면을 선택할 수 있습니다.');
    expect(scene).toContain('resolveReaderPresentationCandidateV1(normalizedReader)');
    expect(scene).toContain("const requestedReader = params.get('character') || params.get('reader') || 'seyeon'");
    expect(scene).toContain("root.dataset.readerAuthority = 'presentation_hint_only'");
    expect(html).toContain('data-reader="seyeon"');
    expect(css).toContain('.reading-reader-option:disabled');
  });

  it('does not convert client Reader options into server entitlement or payment', async () => {
    const [picker, policy, runtime, server, config] = await Promise.all([
      read('apps/web/reading-reader-picker.js'),
      read('apps/web/reader-rollout-policy.js'),
      read('apps/web/reader-runtime-client.js'),
      read('apps/api/src/production-reader-interpretation-activation.ts'),
      read('vercel.json'),
    ]);
    expect(picker).not.toContain("publicInterpretationEnabled: true");
    expect(policy).toContain('READER_PUBLIC_INTERPRETATION_ENABLED_V1 = false');
    expect(runtime).toContain('const enabled = options.enabled === true');
    expect(server).toContain("publicRouteEnabled: false as const");
    const rewrites = JSON.parse(config) as { rewrites?: { source: string }[] };
    expect(rewrites.rewrites?.some(x=>x.source==='/api/me/readings/reader-interpretation/preview')).toBe(false);
  });
});
