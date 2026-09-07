import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = join(process.cwd(), 'apps', 'web');
const source = readFileSync(join(webRoot, 'chat-runtime-client.js'), 'utf8');
const chatHtml = readFileSync(join(webRoot, 'chat.html'), 'utf8');

describe('Chat authoritative bearer rejection boundary', () => {
  it('loads the Chat auth runtime as an executable ES module', () => {
    expect(chatHtml).toContain('<script type="module" src="chat-runtime-client.js"></script>');
    expect(chatHtml).not.toContain('<script src="chat-runtime-client.js" defer></script>');
  });

  it('binds the current Member or Guest bearer to the room read request', () => {
    expect(source).toContain("import { getActiveBearer, invalidateGuestSession, invalidateMemberSession } from './product-auth.js'");
    expect(source).toContain('const activeBearer = await getActiveBearer()');
    expect(source).toContain('Authorization: `Bearer ${activeBearer.token}`');
  });

  it('invalidates exactly the bearer rejected by an authoritative 401', () => {
    expect(source).toContain("if (activeBearer?.kind === 'member')");
    expect(source).toContain('invalidateMemberSession()');
    expect(source).toContain("if (activeBearer?.kind === 'guest') invalidateGuestSession()");
    expect(source).toContain('if (response.status === 401)');
    expect(source).toContain('invalidateRejectedBearer(activeBearer)');
  });

  it('does not reinterpret 403 or other non-401 failures as credential invalidation', () => {
    const rejectionIndex = source.indexOf('if (response.status === 401)');
    const genericFailureIndex = source.indexOf('if (!response.ok)', rejectionIndex);
    expect(rejectionIndex).toBeGreaterThan(-1);
    expect(genericFailureIndex).toBeGreaterThan(rejectionIndex);
    const authoritativeBlock = source.slice(rejectionIndex, genericFailureIndex);
    expect(authoritativeBlock).toContain('invalidateRejectedBearer(activeBearer)');
    expect(source).not.toContain('response.status === 403) {\n      invalidateRejectedBearer');
  });
});
