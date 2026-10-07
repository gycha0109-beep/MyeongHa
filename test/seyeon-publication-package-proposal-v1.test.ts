import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const repoFile = (path: string) => new URL(`../${path}`, import.meta.url);

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

describe('Seyeon publication package v1 proposal', () => {
  it('stays proposal-only and preserves the residence-canon boundary', async () => {
    const proposal = JSON.parse(
      await readFile(repoFile('docs/character/seyeon-publication-package-v1.proposal.json'), 'utf8'),
    );

    expect(proposal.authorityState).toBe('proposal_not_approved');
    expect(proposal.characterId).toBe('seyeon');
    expect(proposal.explicitNonAuthority).toEqual(
      expect.arrayContaining([
        'production_publication',
        'default_release_replacement',
        'public_member_exposure',
        'residence_canon',
      ]),
    );
  });

  it('references only the approved portrait and chat-theme assets', async () => {
    const proposal = JSON.parse(
      await readFile(repoFile('docs/character/seyeon-publication-package-v1.proposal.json'), 'utf8'),
    );

    expect(proposal.publicationMaterialProposal.assetRefs).toEqual([
      'apps/web/assets/characters/seyeon-portrait-v2.webp',
      'apps/web/assets/characters/chat-themes/seyeon-chat-theme-web-v1.webp',
      'apps/mobile/assets/characters/chat-themes/seyeon-chat-theme-mobile-v1.webp',
    ]);
    expect(proposal.publicationMaterialProposal.assetRefs.join('\n')).not.toContain(
      'rooms/seyeon-room.webp',
    );
  });

  it('proposes exactly one static expression and no-motion cue', async () => {
    const proposal = JSON.parse(
      await readFile(repoFile('docs/character/seyeon-publication-package-v1.proposal.json'), 'utf8'),
    );

    expect(proposal.publicationMaterialProposal.emotionIds).toEqual(['neutral']);
    expect(proposal.publicationMaterialProposal.animationCueIds).toEqual(['static']);
    expect(proposal.bundleMetadataProposal.cueSchemaVersion).toBe(
      'character-static-presentation-v1',
    );
    expect(proposal.bundleMetadataProposal.minClientCapability).toBe(
      'character-chat-theme-v1',
    );
  });

  it('reproduces the proposed asset manifest hash', async () => {
    const proposal = JSON.parse(
      await readFile(repoFile('docs/character/seyeon-publication-package-v1.proposal.json'), 'utf8'),
    );
    const actual = createHash('sha256')
      .update(stableJson(proposal.assetManifest))
      .digest('hex');

    expect(`sha256:v1:${actual}`).toBe(
      'sha256:v1:ca769bd9b211e5d04f64128fea1fb2e3d1eca3f91d2d34c6fe14f39b62591a4d',
    );
    expect(proposal.bundleMetadataProposal.assetManifestHash).toBe(
      `sha256:v1:${actual}`,
    );
  });
});
