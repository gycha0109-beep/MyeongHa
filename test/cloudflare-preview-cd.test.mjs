import { describe, expect, it } from 'vitest';
import {
  CLOUDFLARE_PREVIEW_CD_V1,
  assertCloudflarePreviewConfiguration,
  resolveCloudflarePreviewCdAdmission,
} from '../scripts/cloudflare-preview-cd.mjs';

const commitSha = 'a'.repeat(40);
const correctContext = Object.freeze({
  workersCi: '1',
  branch: CLOUDFLARE_PREVIEW_CD_V1.branch,
  commitSha,
  checkoutSha: commitSha,
});

const previewConfig = Object.freeze({
  name: 'myeongha',
  main: './cloudflare/preview-worker.mjs',
  workers_dev: false,
  preview_urls: true,
  assets: {
    directory: './public',
    binding: 'ASSETS',
    run_worker_first: true,
    html_handling: 'none',
    not_found_handling: 'none',
  },
  previews: {},
});

describe('Cloudflare preview Git-based CD', () => {
  it('admits only the pinned GitHub branch and commit within Workers Builds', () => {
    expect(resolveCloudflarePreviewCdAdmission(correctContext)).toEqual({
      branch: CLOUDFLARE_PREVIEW_CD_V1.branch,
      commitSha,
      previewName: 'approved-character-labels',
    });
  });

  it('rejects a local/manual deployment', () => {
    expect(() => resolveCloudflarePreviewCdAdmission({ ...correctContext, workersCi: undefined })).toThrow(/local\/manual uploads are prohibited/u);
  });

  it('does not deploy main or unrelated branches', () => {
    expect(() => resolveCloudflarePreviewCdAdmission({ ...correctContext, branch: 'main' })).toThrow(/rejected branch/u);
    expect(() => resolveCloudflarePreviewCdAdmission({ ...correctContext, branch: 'feat/other' })).toThrow(/rejected branch/u);
  });

  it('rejects a forged or stale commit', () => {
    expect(() => resolveCloudflarePreviewCdAdmission({ ...correctContext, checkoutSha: 'b'.repeat(40) })).toThrow(/exact checked-out/u);
    expect(() => resolveCloudflarePreviewCdAdmission({ ...correctContext, commitSha: 'HEAD' })).toThrow(/exact checked-out/u);
  });

  it('requires preview-only static routing with API interception', () => {
    expect(assertCloudflarePreviewConfiguration(previewConfig)).toBe(true);
    expect(() => assertCloudflarePreviewConfiguration({ ...previewConfig, workers_dev: true })).toThrow(/production workers.dev route disabled/u);
    expect(() => assertCloudflarePreviewConfiguration({ ...previewConfig, assets: { ...previewConfig.assets, run_worker_first: false } })).toThrow(/static assets isolated/u);
    expect(() => assertCloudflarePreviewConfiguration({ ...previewConfig, route: 'example.com/*' })).toThrow(/static assets isolated/u);
  });
});
