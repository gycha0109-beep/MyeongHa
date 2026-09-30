import type {
  CharacterFactRegistryPublicationRowV1,
} from '../../../packages/character-content/src/index.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

type PublishCharacterFactRegistryQueryRowV1 = Readonly<{
  contentBundleId: unknown;
}>;

export type CharacterFactRegistryPublicationErrorCodeV1 =
  | 'INVALID_INPUT'
  | 'BUNDLE_UNAVAILABLE'
  | 'BUNDLE_ALREADY_RELEASED'
  | 'INVALID_REGISTRY'
  | 'IDEMPOTENCY_CONFLICT';

export class CharacterFactRegistryPublicationErrorV1 extends Error {
  override readonly name = 'CharacterFactRegistryPublicationErrorV1';

  constructor(
    readonly code: CharacterFactRegistryPublicationErrorCodeV1,
    message: string,
  ) {
    super(message);
  }
}

const PUBLISH_CHARACTER_FACT_REGISTRY_SQL = `
select public.cmd_publish_character_fact_registry_v1(
  $1::uuid,
  $2::jsonb
)::text as "contentBundleId"
`.trim();

function requiredText(value: string, path: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new CharacterFactRegistryPublicationErrorV1(
      'INVALID_INPUT',
      `${path} is required.`,
    );
  }
  return normalized;
}

function publicationPayload(
  rows: readonly CharacterFactRegistryPublicationRowV1[],
): readonly Record<string, unknown>[] {
  if (rows.length === 0) {
    throw new CharacterFactRegistryPublicationErrorV1(
      'INVALID_INPUT',
      'Character fact registry publication requires at least one row.',
    );
  }

  return rows.map((row) => ({
    characterId: requiredText(row.characterId, 'characterId'),
    factKey: requiredText(row.factKey, 'factKey'),
    sourceAuthority: row.sourceAuthority,
    characterKnowledge: row.characterKnowledge,
    disclosureDefault: row.disclosureDefault,
    sourceSection: requiredText(row.sourceSection, 'sourceSection'),
    sourceBibleDocument: requiredText(
      row.sourceBibleDocument,
      'sourceBibleDocument',
    ),
    sourceBibleRevision: requiredText(
      row.sourceBibleRevision,
      'sourceBibleRevision',
    ),
    ...('value' in row ? { value: row.value } : {}),
    ...(row.policy === undefined
      ? {}
      : { policy: requiredText(row.policy, 'policy') }),
    ...(row.closureNote === undefined
      ? {}
      : { closureNote: requiredText(row.closureNote, 'closureNote') }),
  }));
}

function postgresConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : null;
}

function mapPostgresError(error: unknown): never {
  switch (postgresConstraint(error)) {
    case 'cmd_publish_character_fact_registry_input_required':
      throw new CharacterFactRegistryPublicationErrorV1(
        'INVALID_INPUT',
        'Character fact registry publication input was rejected.',
      );
    case 'cmd_publish_character_fact_registry_bundle_unavailable':
      throw new CharacterFactRegistryPublicationErrorV1(
        'BUNDLE_UNAVAILABLE',
        'Character fact registry content bundle is unavailable.',
      );
    case 'cmd_publish_character_fact_registry_bundle_already_released':
      throw new CharacterFactRegistryPublicationErrorV1(
        'BUNDLE_ALREADY_RELEASED',
        'Character fact registry cannot mutate an activated content bundle.',
      );
    case 'cmd_publish_character_fact_registry_row_shape':
    case 'cmd_publish_character_fact_registry_enum_invalid':
    case 'cmd_publish_character_fact_registry_value_authority':
    case 'cmd_publish_character_fact_registry_character_unavailable':
    case 'cmd_publish_character_fact_registry_duplicate_fact':
      throw new CharacterFactRegistryPublicationErrorV1(
        'INVALID_REGISTRY',
        'Character fact registry payload failed publication validation.',
      );
    case 'cmd_publish_character_fact_registry_idempotency_conflict':
      throw new CharacterFactRegistryPublicationErrorV1(
        'IDEMPOTENCY_CONFLICT',
        'Character fact registry already exists with a different immutable payload.',
      );
    default:
      throw error;
  }
}

export async function publishCharacterFactRegistryV1(input: {
  readonly client: PostgresTransactionQueryV1;
  readonly contentBundleId: string;
  readonly rows: readonly CharacterFactRegistryPublicationRowV1[];
}): Promise<string> {
  const contentBundleId = requiredText(input.contentBundleId, 'contentBundleId');
  const payload = publicationPayload(input.rows);

  try {
    const result = await input.client.query<PublishCharacterFactRegistryQueryRowV1>(
      PUBLISH_CHARACTER_FACT_REGISTRY_SQL,
      [contentBundleId, JSON.stringify(payload)],
    );

    if (result.rows.length !== 1 || result.rows[0] === undefined) {
      throw new Error(
        'Character fact registry publication returned an invalid row set.',
      );
    }

    const publishedBundleId = requiredText(
      String(result.rows[0].contentBundleId ?? ''),
      'published contentBundleId',
    );
    if (publishedBundleId !== contentBundleId) {
      throw new Error(
        'Character fact registry publication returned a different content bundle.',
      );
    }

    return publishedBundleId;
  } catch (error) {
    return mapPostgresError(error);
  }
}
