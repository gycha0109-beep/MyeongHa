export const SAJU_DOMAINS = [
  'general',
  'family',
  'relationship',
  'compatibility',
  'career',
  'business',
  'wealth',
  'life_stage',
  'question_specific',
] as const;

export type SajuDomain = (typeof SAJU_DOMAINS)[number];

export const NOTIFICATION_CATEGORIES = [
  'character_return',
  'new_monthly_reading',
  'episode_unlock',
  'new_character',
  'service_notice',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const CHAT_TURN_STATES = [
  'received',
  'planned',
  'context_ready',
  'generated',
  'validated',
  'committed',
  'delivered',
  'failed_retryable',
  'failed_final',
  'abandoned',
] as const;

export type ChatTurnState = (typeof CHAT_TURN_STATES)[number];

export const MEMORY_RESOLUTION_MODES = [
  'accept_long_term',
  'session_only',
  'reject',
] as const;

export type MemoryResolutionMode = (typeof MEMORY_RESOLUTION_MODES)[number];

export const RELATIONSHIP_EVENT_CANDIDATES = [
  'FIRST_MEETING',
  'RETURN_VISIT',
  'CHOSE_CHARACTER',
  'SHARED_PERSONAL_FACT',
  'COMPLETED_READING',
  'FINISHED_EPISODE',
  'CONFLICT_EVENT',
  'RECONCILIATION_EVENT',
  'IGNORED_CHARACTER',
  'RETURNED_AFTER_ABSENCE',
] as const;

export type RelationshipEventCandidate =
  (typeof RELATIONSHIP_EVENT_CANDIDATES)[number];

export type GrantChoice =
  | { mode: 'character_only'; characterId: string }
  | { mode: 'current_characters' }
  | { mode: 'private' };

export type ChatStructuredActionV1 =
  | { type: 'SELECT_SAJU_DOMAIN'; version: 'v1'; domain: SajuDomain }
  | {
      type: 'REQUEST_MULTI_CHARACTER_OPINION';
      version: 'v1';
      topicKey: string;
    }
  | { type: 'SELECT_CHAT_PROMPT'; version: 'v1'; promptKey: string };

export const API_ERROR_CODES = [
  'INVALID_REQUEST',
  'AUTH_REQUIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'IDEMPOTENCY_CONFLICT',
  'REVISION_CONFLICT',
  'TURN_IN_FLIGHT',
  'STALE_READING',
  'MERGE_CONFLICT',
  'RESOURCE_GONE',
  'CAPABILITY_UNAVAILABLE',
  'NEEDS_CLARIFICATION',
  'GROUNDING_INSUFFICIENT',
  'CONTENT_INCOMPATIBLE',
  'RATE_LIMITED',
  'SAJU_TEMPORARILY_UNAVAILABLE',
  'AI_TEMPORARILY_UNAVAILABLE',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export class ContractViolationError extends Error {
  readonly code = 'CONTRACT_VIOLATION' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ContractViolationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    throw new ContractViolationError(
      `Unexpected field: ${unexpected.sort()[0] ?? 'unknown'}`,
    );
  }
}

export function parseBoundedValue<const T extends readonly string[]>(
  contractName: string,
  values: T,
  value: unknown,
): T[number] {
  if (typeof value !== 'string' || !values.includes(value as T[number])) {
    throw new ContractViolationError(`${contractName} contains an unknown value.`);
  }
  return value as T[number];
}

function parseRegistryKey(name: string, value: unknown): string {
  if (typeof value !== 'string') {
    throw new ContractViolationError(`${name} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 128) {
    throw new ContractViolationError(`${name} is outside the supported bounds.`);
  }
  return normalized;
}

export function parseSajuDomain(value: unknown): SajuDomain {
  return parseBoundedValue('SajuDomain', SAJU_DOMAINS, value);
}

export function parseChatStructuredActionV1(
  value: unknown,
): ChatStructuredActionV1 {
  if (!isRecord(value)) {
    throw new ContractViolationError('ChatStructuredActionV1 must be an object.');
  }
  if (value.version !== 'v1' || typeof value.type !== 'string') {
    throw new ContractViolationError('ChatStructuredActionV1 type/version is invalid.');
  }

  switch (value.type) {
    case 'SELECT_SAJU_DOMAIN':
      assertOnlyKeys(value, ['type', 'version', 'domain']);
      return {
        type: 'SELECT_SAJU_DOMAIN',
        version: 'v1',
        domain: parseSajuDomain(value.domain),
      };
    case 'REQUEST_MULTI_CHARACTER_OPINION':
      assertOnlyKeys(value, ['type', 'version', 'topicKey']);
      return {
        type: 'REQUEST_MULTI_CHARACTER_OPINION',
        version: 'v1',
        topicKey: parseRegistryKey('topicKey', value.topicKey),
      };
    case 'SELECT_CHAT_PROMPT':
      assertOnlyKeys(value, ['type', 'version', 'promptKey']);
      return {
        type: 'SELECT_CHAT_PROMPT',
        version: 'v1',
        promptKey: parseRegistryKey('promptKey', value.promptKey),
      };
    default:
      throw new ContractViolationError('Unknown chat structured action type.');
  }
}
