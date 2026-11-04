// Watchtower-Track: security
// Textless UI-only invalidation; not proof of a database revocation or Grant.
export const SEYEON_MEMORY_VISIBILITY_INVALIDATION_V1:
  'myeongha:seyeon-memory-visibility-invalidation-v1';

export function publishSeyeonMemoryVisibilityInvalidationV1(): void;

export function subscribeSeyeonMemoryVisibilityInvalidationV1(
  callback: () => void,
): () => void;
