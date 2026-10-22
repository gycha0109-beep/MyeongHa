import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  CF_PREVIEW_DRILL_V1,
  parseCloudflarePreviewRehearsalV1,
} from '../scripts/local/rehearse-cloudflare-preview-rollback.mjs';

const OLD = 'd4f7cebb3d9be6b4ad9e526c53e3f5b8585cc9c0';
const CURRENT = '52aa940f566b5282335d775100c139b5259f154a';

describe('Cloudflare Preview rollback rehearsal safe-by-default', () => {
  it('accepts exact committed rollback and restore IDs as dry run only', () => {
    expect(parseCloudflarePreviewRehearsalV1([
      '--rollback', OLD, '--restore', CURRENT,
    ])).toEqual({ rollback: OLD, restore: CURRENT, apply: false, previewOnly: false });
    expect(CF_PREVIEW_DRILL_V1).toMatchObject({
      worker: 'myeongha', preview: 'feat/ops/cloudflare-authdb-clean-snapshot-20261021',
    });
  });
  it('requires explicit Preview-only flag for any mutation and refuses malformed input', () => {
    for (const args of [
      ['--rollback', OLD, '--restore', CURRENT, '--apply'],
      ['--rollback', OLD, '--restore', OLD, '--apply', '--confirm-preview-only'],
      ['--rollback', 'bad', '--restore', CURRENT],
      ['--rollback', OLD, '--restore', CURRENT, '--deploy'],
      ['--rollback', OLD, '--restore', CURRENT, '--apply', '--apply', '--confirm-preview-only'],
    ]) expect(() => parseCloudflarePreviewRehearsalV1(args)).toThrow();
    expect(parseCloudflarePreviewRehearsalV1([
      '--rollback', OLD, '--restore', CURRENT, '--apply', '--confirm-preview-only',
    ]).apply).toBe(true);
  });
  it('never contains a Production deploy or DB/secret update command', async () => {
    const contents = await readFile(
      new URL('../scripts/local/rehearse-cloudflare-preview-rollback.mjs', import.meta.url),
      'utf8',
    );
    expect(contents).toContain(" 'preview',");
    expect(contents).not.toContain("'deploy',");
    expect(contents).not.toContain("'secret',");
    expect(contents).not.toContain("versions upload");
  });
});
