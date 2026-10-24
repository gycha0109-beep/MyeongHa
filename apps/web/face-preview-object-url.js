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
