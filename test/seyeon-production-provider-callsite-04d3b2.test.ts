import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../apps/api/src/', import.meta.url));
const permitted: Readonly<Record<string, readonly string[]>> = Object.freeze({
  createOpenAiSeyeonStructuredProviderV1: [
    'postgres-seyeon-ai-cost-ledger-v1.ts',
    'production-seyeon-chat-runtime-v1.ts',
    'production-seyeon-post-turn-worker-runtime-v1.ts',
  ],
  createPersistingSeyeonAiProviderV1: [
    'production-seyeon-chat-runtime-v1.ts',
    'production-seyeon-post-turn-worker-runtime-v1.ts',
  ],
});
const legacyFunctions = [
  'cmd_start_seyeon_ai_call_v1',
  'cmd_settle_seyeon_ai_call_v1',
  'cmd_record_seyeon_ai_call_cost_v1',
];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sources(path) : entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('PR-04D3B2 audited paid Provider callsites (static, no API I/O)', () => {
  it('restricts direct native and persisted Provider imports to audited runtime adapters', () => {
    const unauthorized: string[] = [];
    for (const file of sources(root)) {
      const name = relative(root, file).replaceAll('\\', '/');
      const content = readFileSync(file, 'utf8');
      const ast = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
      ast.forEachChild(node => {
        if (!ts.isImportDeclaration(node)) return;
        const named = node.importClause?.namedBindings;
        if (named === undefined || !ts.isNamedImports(named)) return;
        for (const entry of named.elements) {
          const imported = entry.propertyName?.text ?? entry.name.text;
          const allow = permitted[imported];
          if (allow !== undefined && !allow.includes(name)) {
            unauthorized.push(name + ': unauthorized import of ' + imported);
          }
        }
      });
    }
    expect(unauthorized).toEqual([]);
  });

  it('keeps legacy start/settle/record RPC names inside the documented cost adapter only', () => {
    const unauthorized: string[] = [];
    for (const file of sources(root)) {
      const name = relative(root, file).replaceAll('\\', '/');
      if (name === 'postgres-seyeon-ai-cost-ledger-v1.ts') continue;
      const content = readFileSync(file, 'utf8');
      if (legacyFunctions.some(fn => content.includes(fn))) {
        unauthorized.push(name);
      }
    }
    expect(unauthorized).toEqual([]);
  });

  it('keeps public turn-send and post-turn ENFORCE attached to server approved policies', () => {
    const read = (filename: string) => readFileSync(join(root, filename), 'utf8');
    expect(read('production-seyeon-turn-send-runtime-v1.ts'))
      .toContain('createSeyeonProductionChatGovernorsV1(');
    expect(read('production-seyeon-post-turn-worker-runtime-v1.ts'))
      .toContain('createSeyeonProductionPostTurnGovernorV1(');
    expect(read('seyeon-production-governor-factory-v1.ts'))
      .toContain('createSeyeonOpenAiInputTokenCountAdmissionV1(');
  });
});
