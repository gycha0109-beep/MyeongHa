import type {
  OfficialReadingReaderThreadLocatorAuthorityPortV1,
} from './official-reading-reader-thread-resolution-v1.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

type ThreadLocatorRowV1 = Readonly<{ threadId: unknown }>;

const LOCATE_EXISTING_MEMBER_READER_THREAD_SQL = `
select thread_id::text as "threadId"
from public.qry_member_single_character_thread_locator_v1(
  $1::uuid,
  $2::text
)
`.trim();

/**
 * DB-owned D-05 locator for an EXISTING, canonical Member x Character thread.
 * This adapter must run inside the authenticated Subject transaction with
 * myeongha_api_executor and the transaction-local Subject context.
 *
 * No new Thread, Grant, artifact or Reader result is created or revealed.
 */
export function createPostgresOfficialReaderThreadLocatorAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): OfficialReadingReaderThreadLocatorAuthorityPortV1 {
  return Object.freeze({
    async readActiveMemberSingleCharacterThreads(
      input: Parameters<OfficialReadingReaderThreadLocatorAuthorityPortV1['readActiveMemberSingleCharacterThreads']>[0],
    ) {
      const result = await client.query<ThreadLocatorRowV1>(
        LOCATE_EXISTING_MEMBER_READER_THREAD_SQL,
        [input.subjectId, input.readerCharacterId],
      );
      if (!Array.isArray(result.rows) || result.rows.length > 2) {
        throw new Error('D-05 Member Reader thread locator returned an invalid bounded set.');
      }
      return Object.freeze(result.rows.map((row) => {
        if (typeof row.threadId !== 'string' ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(row.threadId)) {
          throw new Error('D-05 Member Reader thread locator returned an invalid identity.');
        }
        return Object.freeze({ threadId: row.threadId });
      }));
    },
  });
}
