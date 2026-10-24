// Face v1 is preview-only: never serialize the photo into a Base64 data URL,
// persist it, or send it to a server. Blob URLs remain local to this document.
// This manages *preview URL lifetime*, not EXIF sanitization or Face analysis.
// Watchtower-Track: ops
export function createEphemeralFacePreviewUrlV1({
  createObjectURL = file => URL.createObjectURL(file),
  revokeObjectURL = url => URL.revokeObjectURL(url),
} = {}) {
  let current = null;
  return Object.freeze({
    open(file) {
      if (!file) throw Error('Face preview requires a local image');
      this.clear();
      const next = createObjectURL(file);
      if (typeof next !== 'string' || !next.startsWith('blob:')) {
        if (typeof next === 'string') revokeObjectURL(next);
        throw Error('Face preview must use a local blob URL');
      }
      current = next;
      return next;
    },
    clear() {
      if (current === null) return;
      const previous = current;
      current = null;
      revokeObjectURL(previous);
    },
  });
}

// Reject spoofed MIME headers before making a browser-visible blob URL.
// This is a 12-byte local format sniff, not a photo quality assessment,
// EXIF scrubber or authorization to upload/process the image.
export async function hasLocalFaceImageSignatureV1(file) {
  if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type) ||
      !Number.isSafeInteger(file.size) || file.size < 12 ||
      file.size > 16 * 1024 * 1024 || typeof file.slice !== 'function') return false;
  const bytes = new Uint8Array(await file.slice(0,12).arrayBuffer());
  if (bytes.length !== 12) return false;
  switch (file.type) {
    case 'image/jpeg': return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/png': return [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]
      .every((n,i)=>bytes[i]===n);
    case 'image/webp': return [0x52,0x49,0x46,0x46].every((n,i)=>bytes[i]===n) &&
      [0x57,0x45,0x42,0x50].every((n,i)=>bytes[i+8]===n);
    default: return false;
  }
}
