import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Seyeon provider diagnostic logging', () => {
  it('logs only bounded provider metadata and never credential or message fields', async () => {
    const runtime = await readFile(
      new URL('../apps/api/src/production-seyeon-turn-send-runtime-v1.ts', import.meta.url),
      'utf8',
    );
    const http = await readFile(
      new URL('../apps/api/src/chat-turn-send-http.ts', import.meta.url),
      'utf8',
    );
    const source = runtime + '\n' + http;
    expect(source).toContain('MYEONGHA_SEYEON_PROVIDER_DIAGNOSTIC');
    expect(source).toContain("stage: 'oidc_resolution'");
    expect(source).toContain("stage: 'provider'");
    expect(source).toContain('httpStatus: error.httpStatus');
    expect(source).not.toContain('token: vercelOidcToken');
    expect(source).not.toContain('apiKey: error');
    expect(source).not.toContain('text: error');
    expect(source).not.toContain('responseBody');
    const chatRuntime = await readFile(
      new URL('../apps/api/src/production-seyeon-chat-runtime-v1.ts', import.meta.url),
      'utf8',
    );
    expect(chatRuntime).toContain('MYEONGHA_SEYEON_TURN_RUNTIME_DIAGNOSTIC');
    for (const stage of ['subject_resolution', 'thread_binding', 'content_manifest', 'chat_execution']) {
      expect(chatRuntime).toContain(stage);
    }
    expect(chatRuntime).toContain('sqlState');
    expect(chatRuntime).not.toContain('JSON.stringify(error)');
    expect(chatRuntime).not.toContain('error.message');
  });
});
