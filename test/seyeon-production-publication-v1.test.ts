import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

describe('Seyeon Production publication v1', () => {
  it('pins the approved artifact bytes and presentation compatibility identifiers', async () => {
    const bytes = await readFile(new URL('../docs/character/seyeon-production-publication-artifact-v1.json', import.meta.url));
    const artifact = JSON.parse(bytes.toString('utf8'));
    expect('sha256:v1:' + createHash('sha256').update(bytes).digest('hex')).toBe(
      'sha256:v1:ff08ad287054db544ae354b1135e355a5223a8b0259148c0d3b76106cf6d2cdb',
    );
    expect(artifact.characterId).toBe('seyeon');
    expect(artifact.bundleMetadata).toEqual({
      minClientCapability: 'character-chat-theme-v1',
      assetManifestHash: 'sha256:v1:ca769bd9b211e5d04f64128fea1fb2e3d1eca3f91d2d34c6fe14f39b62591a4d',
      cueSchemaVersion: 'character-static-presentation-v1',
    });
    expect(artifact.characterCatalog).toHaveLength(1);
    expect(artifact.characterCatalog[0].character_id).toBe('seyeon');
    expect(artifact.characterCapabilities).toHaveLength(9);
    expect(artifact.characterRelations).toEqual([]);
  });

  it('publishes only through the governed lifecycle commands and fails closed unless Production is empty', async () => {
    const source = await readFile(
      new URL('../scripts/operations/publish-seyeon-production-v1.sh', import.meta.url),
      'utf8',
    );
    expect(source).toContain('cmd_publish_character_content_bundle_v1');
    expect(source).toContain('cmd_create_content_release_v1');
    expect(source).toContain('cmd_activate_content_release_v1');
    expect(source).toContain('is distinct from row(0::bigint, 0::bigint, 0::bigint, 0::bigint)');
    expect(source).toContain('grant myeongha_content_operator to postgres');
    expect(source).toContain('revoke myeongha_content_operator from postgres');
    expect(source).toContain("'seyeon' and enabled = true and availability = 'available'");
  });

  it('keeps the workflow production-scoped and one-shot', async () => {
    const workflow = await readFile(
      new URL('../.github/workflows/seyeon-production-publication-v1.yml', import.meta.url),
      'utf8',
    );
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('PUBLISH_SEYEON_PRODUCTION_V1');
    expect(workflow).toContain('.github/seyeon-production-publication-v1.trigger');
    expect(workflow).toContain('publish-seyeon-production-v1.sh');
  });
});
