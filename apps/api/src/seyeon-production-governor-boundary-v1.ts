import type { OpenAiSeyeonStructuredProviderConfigV1 } from './openai-seyeon-structured-provider-v1.js';

export type SeyeonProductionGovernorModeV1 = 'OFF' | 'ENFORCE';
export const SEYEON_GOVERNOR_CHAT_ROLES_V1 =
  ['preflight', 'interpreter', 'renderer', 'reviewer'] as const;
export type SeyeonGovernorChatRoleV1 =
  typeof SEYEON_GOVERNOR_CHAT_ROLES_V1[number];

/**
 * PR-04D3A: explicit pre-activation safety gate. OFF preserves the live
 * behavior. ENFORCE rejects every unmetered provider seam before opening DB
 * pools or dispatching a model request; D3B must close legacy SQL privileges.
 */
export function assertSeyeonProductionGovernorBoundaryV1(input: {
  readonly mode?: SeyeonProductionGovernorModeV1 | undefined;
  readonly target: 'chat' | 'post_turn';
  readonly provider?: unknown;
  readonly providerConfig?: OpenAiSeyeonStructuredProviderConfigV1 | undefined;
  readonly roleProviderConfigs?: Readonly<Partial<Record<
    SeyeonGovernorChatRoleV1, OpenAiSeyeonStructuredProviderConfigV1
  >>> | undefined;
  readonly governorConfigured: boolean;
}): void {
  if (input.mode === undefined || input.mode === 'OFF') return;
  if (input.mode !== 'ENFORCE') {
    throw new Error('Unknown Se-yeon AI Governor mode.');
  }
  if (input.provider !== undefined ||
      input.providerConfig === undefined ||
      !input.governorConfigured) {
    throw new Error('ENFORCE requires server-owned native Provider and Governor.');
  }

  const assertNative = (config: OpenAiSeyeonStructuredProviderConfigV1) => {
    if (config.origin !== undefined ||
        config.fetchImpl !== undefined ||
        config.beforeDispatch !== undefined ||
        config.meteredBeforeDispatch !== undefined) {
      throw new Error('ENFORCE forbids alternate endpoint or injected Provider hooks.');
    }
  };
  assertNative(input.providerConfig);

  if (input.target === 'chat') {
    const roles = input.roleProviderConfigs;
    if (roles === undefined ||
        Object.keys(roles).length !== SEYEON_GOVERNOR_CHAT_ROLES_V1.length) {
      throw new Error('ENFORCE requires all four explicit Chat role configs.');
    }
    for (const role of SEYEON_GOVERNOR_CHAT_ROLES_V1) {
      const roleConfig = roles[role];
      if (roleConfig === undefined) {
        throw new Error('ENFORCE requires all four explicit Chat role configs.');
      }
      assertNative(roleConfig);
    }
  }
}
