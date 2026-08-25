import {
  ContractViolationError,
  parseChatStructuredActionV1,
  type ChatStructuredActionV1,
} from './index.js';

export interface ChatRequestV1 {
  readonly threadId?: string;
  readonly characterId?: string;
  readonly clientTurnId: string;
  readonly text?: string;
  readonly structuredAction?: ChatStructuredActionV1;
  readonly clientCapability: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRequiredString(name: string, value: unknown): string {
  if (typeof value !== 'string') {
    throw new ContractViolationError(`${name} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new ContractViolationError(`${name} must not be empty.`);
  }
  return normalized;
}

function parseOptionalString(name: string, value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return parseRequiredString(name, value);
}

export function parseChatRequestV1(value: unknown): ChatRequestV1 {
  if (!isRecord(value)) {
    throw new ContractViolationError('ChatRequestV1 must be an object.');
  }

  const allowed = new Set([
    'threadId',
    'characterId',
    'clientTurnId',
    'text',
    'structuredAction',
    'clientCapability',
  ]);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    throw new ContractViolationError(
      `Unexpected field: ${unexpected.sort()[0] ?? 'unknown'}`,
    );
  }

  const threadId = parseOptionalString('threadId', value.threadId);
  const characterId = parseOptionalString('characterId', value.characterId);
  const clientTurnId = parseRequiredString('clientTurnId', value.clientTurnId);
  const clientCapability = parseRequiredString(
    'clientCapability',
    value.clientCapability,
  );

  const hasText = value.text !== undefined;
  const hasAction = value.structuredAction !== undefined;
  if (hasText === hasAction) {
    throw new ContractViolationError(
      'ChatRequestV1 requires exactly one of text or structuredAction.',
    );
  }

  if (hasText) {
    const text = parseRequiredString('text', value.text);
    return Object.freeze({
      ...(threadId === undefined ? {} : { threadId }),
      ...(characterId === undefined ? {} : { characterId }),
      clientTurnId,
      text,
      clientCapability,
    });
  }

  const structuredAction = parseChatStructuredActionV1(value.structuredAction);
  return Object.freeze({
    ...(threadId === undefined ? {} : { threadId }),
    ...(characterId === undefined ? {} : { characterId }),
    clientTurnId,
    structuredAction,
    clientCapability,
  });
}
