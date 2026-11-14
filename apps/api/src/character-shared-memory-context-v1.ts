// Watchtower-Track: character-memory
// Optional Member-owned read-only projection; no AI extraction or hidden grants.
import type { CharacterContextSourceAdmissionPortV1, CharacterContextTrustedSourceV1, CharacterContextScopeV1 } from '../../../packages/domain/src/character-dynamic-context-composer-v1.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export type CharacterSharedMemoryOwnerRowV1 = Readonly<{
  id: string; text: string; createdAt: string; updatedAt: string;
}>;
export interface CharacterSharedMemoryReadPortV1 {
  readOwnerSharedMemory(input: Readonly<{
    subjectId: string; currentTurnAt: string;
  }>): Promise<readonly CharacterSharedMemoryOwnerRowV1[]>;
}

export function createPostgresCharacterSharedMemoryReadPortV1(
  client: PostgresTransactionQueryV1,
): CharacterSharedMemoryReadPortV1 {
  return Object.freeze({
    async readOwnerSharedMemory(input: Readonly<{ subjectId: string; currentTurnAt: string }>) {
      // Must use the existing canonical Subject-bound transaction; RLS also
      // restricts access to the current owner (active Member only).
      const result = await client.query<CharacterSharedMemoryOwnerRowV1>(
        'select id::text as "id", body_text as "text", created_at::text as "createdAt", updated_at::text as "updatedAt" ' +
        'from public.subject_shared_memory_items_v1 ' +
        'where subject_id = $1::uuid and updated_at <= $2::timestamptz ' +
        'order by updated_at desc, id desc limit 51',
        [input.subjectId, input.currentTurnAt],
      );
      return result.rows;
    },
  });
}
export class CharacterSharedMemoryContextHoldV1 extends Error {
  override readonly name = 'CharacterSharedMemoryContextHoldV1';
  constructor() { super('Shared user memory is not admitted for this exact turn.'); }
}
function held(): never { throw new CharacterSharedMemoryContextHoldV1(); }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const STOP = new Set(['나는', '내가', '저는', '제가', '너는', '당신', '지금', '오늘', '그냥', '혹시', '정말', '기억', '이전', '지난번', '무엇', '뭔가', '뭐야', '말해', '알아', '알려', '주세요', '해줘']);
function terms(text: string): readonly string[] {
  return [...new Set((text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])
    .filter(word => !STOP.has(word)))];
}
function timestamp(value: unknown): number {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128 ||
      !Number.isFinite(Date.parse(value))) held();
  return Date.parse(value as string);
}
export async function selectCharacterSharedMemoryForTurnV1(input: Readonly<{
  scope: CharacterContextScopeV1;
  currentUserTurn: Readonly<{ text: string; createdAt: string }>;
  port: CharacterSharedMemoryReadPortV1;
}>): Promise<readonly CharacterContextTrustedSourceV1[]> {
  if (!input.scope.subjectId?.trim() || !input.scope.characterId?.trim() ||
      !input.scope.threadId?.trim() || typeof input.currentUserTurn.text !== 'string' ||
      input.currentUserTurn.text.trim().length === 0) held();
  const at = timestamp(input.currentUserTurn.createdAt);
  const rows = await input.port.readOwnerSharedMemory({
    subjectId: input.scope.subjectId,
    currentTurnAt: input.currentUserTurn.createdAt,
  });
  if (!Array.isArray(rows) || rows.length > 50) held();
  const seen = new Set<string>();
  const queryWords = terms(input.currentUserTurn.text);
  const matched: Array<{ score: number; source: CharacterContextTrustedSourceV1; updatedAt: number }> = [];
  for (const row of rows) {
    if (!UUID.test(row.id) || seen.has(row.id) ||
        typeof row.text !== 'string' || row.text.trim().length === 0 ||
        [...row.text].length > 500) held();
    seen.add(row.id);
    const createdAt = timestamp(row.createdAt);
    const updatedAt = timestamp(row.updatedAt);
    if (createdAt > updatedAt) held();
    if (updatedAt > at) continue;
    const words = terms(row.text);
    const score = queryWords.filter(query => words.some(word =>
      word === query || word.startsWith(query) ||
      (query.length >= 3 && query.startsWith(word))
    )).length;
    if (score === 0) continue;
    matched.push({
      score, updatedAt,
      source: Object.freeze({
        sourceRef: 'shared-user-memory:' + row.id + ':updated:' + new Date(updatedAt).toISOString(),
        text: JSON.stringify({
          sourceKind: 'owner_manual_shared_memory',
          claimKind: 'user_self_reported',
          updatedAt: row.updatedAt,
          summary: row.text,
        }),
      }),
    });
  }
  matched.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt ||
    a.source.sourceRef.localeCompare(b.source.sourceRef));
  return Object.freeze(matched.slice(0, 5).map(x => x.source));
}
export function bindCharacterSharedMemoryAdmissionV1(input: Readonly<{
  scope: CharacterContextScopeV1;
  sources: readonly CharacterContextTrustedSourceV1[];
  baseAdmission: CharacterContextSourceAdmissionPortV1;
}>): CharacterContextSourceAdmissionPortV1 {
  const pinned = new Map(input.sources.map(x => [x.sourceRef, x.text] as const));
  return Object.freeze({
    admit({ scope, segment }: Parameters<CharacterContextSourceAdmissionPortV1['admit']>[0]) {
      if (segment.layer !== 'shared_user_memory') {
        return input.baseAdmission.admit({ scope, segment });
      }
      return scope.subjectId === input.scope.subjectId &&
        scope.characterId === input.scope.characterId &&
        scope.threadId === input.scope.threadId &&
        pinned.has(segment.sourceRef) &&
        pinned.get(segment.sourceRef) === segment.text;
    },
  });
}
