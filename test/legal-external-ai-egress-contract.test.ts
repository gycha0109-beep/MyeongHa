import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(file: string) {
  return readFileSync(new URL('../' + file, import.meta.url), 'utf8');
}

const routing = source('apps/api/src/production-seyeon-turn-send-runtime-v1.ts');
const provider = source('apps/api/src/openai-seyeon-structured-provider-v1.ts');
const requests = source('apps/api/src/seyeon-character-runtime-v2.ts');
const context = source('packages/domain/src/seyeon-runtime-context-v2.ts');

describe('LEGAL L3: externally processed AI content inventory regression', () => {
  it('flags a change to the documented direct OpenAI vs Vercel Gateway server selection', () => {
    expect(provider).toContain("'https://api.openai.com'");
    expect(routing).toContain("optionalEnv(env, 'OPENAI_API_KEY')");
    expect(routing).toContain('if (directApiKey !== null)');
    expect(routing).toContain("gatewayOrigin: 'https://ai-gateway.vercel.sh'");
    expect(routing).toContain('getVercelOidcToken');
  });

  it('keeps provider-side response-store opt-out while identifying personal-content transfer', () => {
    expect(provider).toMatch(/\bstore:\s*false\b/u);
    expect(provider).toContain('text: JSON.stringify(request.input)');
    expect(requests).toContain('buildSeyeonTurnInterpreterRequestV2');
    expect(requests).toContain('recentConversation.map((message)');
    expect(requests).toContain('retrievedMemories.map((memory)');
    expect(context).toContain('readonly recentConversation: readonly SeyeonRecentMessageV2[]');
    expect(context).toContain('readonly retrievedMemories: readonly SeyeonRetrievedMemoryV2[]');
  });
});
