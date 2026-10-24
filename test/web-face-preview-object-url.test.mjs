import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createEphemeralFacePreviewUrlV1, hasLocalFaceImageSignatureV1 } from '../apps/web/face-preview-object-url.js';

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

  it('checks only a bounded local file header and refuses MIME impersonation', async () => {
    const blob = (header,type)=>new Blob([new Uint8Array(header),new Uint8Array(12)], {type});
    const jpeg=blob([0xff,0xd8,0xff], 'image/jpeg');
    const png=blob([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a], 'image/png');
    const webp=blob([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50], 'image/webp');
    expect(await hasLocalFaceImageSignatureV1(jpeg)).toBe(true);
    expect(await hasLocalFaceImageSignatureV1(png)).toBe(true);
    expect(await hasLocalFaceImageSignatureV1(webp)).toBe(true);
    for(const f of [blob([60,104,116,109,108], 'image/jpeg'),
      blob([0xff,0xd8,0xff], 'image/png'),new Blob([new Uint8Array([0xff,0xd8,0xff])],{type:'image/jpeg'}),
      blob([0xff,0xd8,0xff], 'application/octet-stream')]) {
      expect(await hasLocalFaceImageSignatureV1(f)).toBe(false);
    }
    let bounds=[];
    const bounded={type:'image/jpeg',size:4096,slice:(from,to)=>{
      bounds.push([from,to]);return {arrayBuffer:async()=>new Uint8Array(
        [0xff,0xd8,0xff,0,0,0,0,0,0,0,0,0]).buffer};
    }};
    expect(await hasLocalFaceImageSignatureV1(bounded)).toBe(true);
    expect(bounds).toEqual([[0,12]]);
  });

  it('keeps disabled analysis and no outbound photo transport in the browser UI', async () => {
    const browser = await readFile(new URL('../apps/web/face-reading-shell.js', import.meta.url),'utf8');
    expect(browser).toContain('previewObjectUrl.open(file)');
    expect(browser).toContain('await hasLocalFaceImageSignatureV1(file)');
    expect(browser).toContain('revision !== selectionRevision');
    expect(browser).toContain('previewObjectUrl.clear()');
    expect(browser).toContain("window.addEventListener('pagehide', resetPreview)");
    expect(browser).toContain('analyze.disabled = true');
    expect(browser).not.toContain('new FileReader');
    expect(browser).not.toContain('readAsDataURL');
    expect(browser).not.toContain('FormData');
    expect(browser).not.toContain('fetch(');
  });
});
