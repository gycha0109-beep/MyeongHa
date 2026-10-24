import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createEphemeralFacePreviewUrlV1 } from '../apps/web/face-preview-object-url.js';

const image = Object.freeze({ type: 'image/jpeg', size: 123 });

describe('Cloudflare Stage 6 local Face photo preview lifetime', () => {
  it('releases the previous image on replacement and the final one on exit', () => {
    const revokeObjectURL = vi.fn();
    let serial = 0;
    const createObjectURL = vi.fn(() => 'blob:preview-' + ++serial);
    const url = createEphemeralFacePreviewUrlV1({ createObjectURL, revokeObjectURL });
    expect(url.open(image)).toBe('blob:preview-1');
    expect(url.open(image)).toBe('blob:preview-2');
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:preview-1');
    url.clear();
    url.clear();
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenLastCalledWith('blob:preview-2');
  });

  it('fails closed rather than accepting data, HTTPS or missing URL sources', () => {
    for (const candidate of ['data:image/png;base64,AAAA', 'https://example.test/photo', '']) {
      const revokeObjectURL = vi.fn();
      const url = createEphemeralFacePreviewUrlV1({
        createObjectURL: () => candidate, revokeObjectURL,
      });
      expect(() => url.open(image)).toThrow();
      expect(revokeObjectURL).toHaveBeenCalledTimes(candidate ? 1 : 0);
    }
    const url = createEphemeralFacePreviewUrlV1({ createObjectURL: vi.fn() });
    expect(() => url.open(null)).toThrow();
  });

  it('keeps disabled analysis and no outbound photo transport in the browser UI', async () => {
    const browser = await readFile(new URL('../apps/web/face-reading-shell.js', import.meta.url),'utf8');
    expect(browser).toContain('previewObjectUrl.open(file)');
    expect(browser).toContain('previewObjectUrl.clear()');
    expect(browser).toContain("window.addEventListener('pagehide', resetPreview)");
    expect(browser).toContain('analyze.disabled = true');
    expect(browser).not.toContain('new FileReader');
    expect(browser).not.toContain('readAsDataURL');
    expect(browser).not.toContain('FormData');
    expect(browser).not.toContain('fetch(');
  });
});
