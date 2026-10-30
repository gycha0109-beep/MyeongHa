import { describe, expect, it, vi } from 'vitest';
import {
  handleSeyeonC09PrivateOptinHttpShadowV1,
  SEYEON_C09_PRIVATE_OPTIN_HTTP_SHADOW_V1,
} from './seyeon-c09-private-learning-optin-http-shadow-v1.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import type { createSeyeonC09PrivateLearningOptinCommandShadowV1 } from './seyeon-c09-private-learning-optin-command-shadow-v1.js';

const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';
const AUTH_ID = '11111111-1111-4111-8111-111111111111';
const ROUTE = 'https://myeongha.internal/api/chat/learning/private-optin';
type Command = ReturnType<typeof createSeyeonC09PrivateLearningOptinCommandShadowV1>;

function invoke(input: {
  path?: string;
  method?: string;
  body?: unknown;
  evidence?: VerifiedSubjectIdentityEvidenceV1 | null;
  commandError?: Error;
} = {}) {
  const submit = vi.fn(async () => {
    if (input.commandError) throw input.commandError;
    return {
      scope: 'user_private' as const,
      evidencePublished: false as const,
      productionActivated: false as const,
      sourceRef: 'private-source',
      actionRef: 'private-receipt',
      version: 'seyeon-c09-private-optin-command-shadow-v1' as const,
    };
  });
  const verifyRequestIdentity = vi.fn(async () => input.evidence === undefined
    ? ({ kind: 'member', verifiedAuthUserId: AUTH_ID } as const)
    : input.evidence);
  const request = new Request(input.path ?? ROUTE, {
    method: input.method ?? 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer member-token' },
    ...(input.method !== 'GET' ? { body: JSON.stringify(input.body ?? {
      action: 'approve_private_learning', originalMessageId: MESSAGE_ID,
    }) } : {}),
  });
  const execute = handleSeyeonC09PrivateOptinHttpShadowV1({
    request,
    requestId: 'req-c09-http',
    serverTime: '2026-10-30T04:00:00.000Z',
    identityEvidenceVerifier: { verifyRequestIdentity },
    command: { submit } as unknown as Command,
  });
  return { execute, request, submit, verifyRequestIdentity };
}

describe('C09 authenticated private learning opt-in HTTP shadow', () => {
  it('is explicitly unmounted; success only reports private approval, not learning publication', async () => {
    expect(SEYEON_C09_PRIVATE_OPTIN_HTTP_SHADOW_V1.publicActivation).toBe(false);
    const { execute, submit } = invoke();
    const response = await execute;
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.data).toEqual({
      accepted: true, scope: 'user_private',
      evidencePublished: false, productionActivated: false,
    });
    expect(submit).toHaveBeenCalledWith({
      verifiedEvidence: { kind: 'member', verifiedAuthUserId: AUTH_ID },
      userAction: { action: 'approve_private_learning', originalMessageId: MESSAGE_ID },
    });
    expect(JSON.stringify(body)).not.toContain('private-receipt');
  });

  it('rejects unauthenticated callers before reading their body or using the command', async () => {
    const { execute, request, submit } = invoke({ evidence: null });
    const response = await execute;
    expect(response.status).toBe(401);
    expect(request.bodyUsed).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });

  it('rejects Guest members without consuming their bodies', async () => {
    const { execute, request, submit } = invoke({
      evidence: { kind: 'guest', verifiedGuestTokenHash: 'sha256:v1:test' },
    });
    expect((await execute).status).toBe(403);
    expect(request.bodyUsed).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });

  it.each([
    { action: 'approve_private_learning', originalMessageId: MESSAGE_ID, subjectId: AUTH_ID },
    { action: 'approve_private_learning', originalMessageId: MESSAGE_ID, verifiedEvidence: { kind: 'member' } },
    { action: 'approve_private_learning', originalMessageId: MESSAGE_ID, visibility: 'character_shared' },
    { action: 'approve_private_learning', originalMessageId: 'not-a-uuid' },
    { action: 'approve_shared_learning', originalMessageId: MESSAGE_ID },
    {},
  ])('rejects additional authority or invalid action fields', async (body) => {
    const { execute, submit } = invoke({ body });
    expect((await execute).status).toBe(400);
    expect(submit).not.toHaveBeenCalled();
  });

  it('rejects query-bearing paths and the wrong method without verification', async () => {
    const query = invoke({ path: ROUTE + '?subjectId=forged' });
    expect((await query.execute).status).toBe(404);
    expect(query.verifyRequestIdentity).not.toHaveBeenCalled();
    const method = invoke({ method: 'GET' });
    const response = await method.execute;
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
    expect(method.verifyRequestIdentity).not.toHaveBeenCalled();
  });

  it('honors the shared bounded JSON reader', async () => {
    const { execute, submit } = invoke({ body: {
      action: 'approve_private_learning',
      originalMessageId: 'A'.repeat(20_000),
    } });
    expect((await execute).status).toBe(413);
    expect(submit).not.toHaveBeenCalled();
  });

  it('fails closed without raw SQL errors or false approval when proposal schema is absent', async () => {
    const { execute } = invoke({ commandError: Object.assign(
      new Error('sensitive SQL: character_learning_private_optin_receipts_v1 missing'),
      { code: '42P01' },
    ) });
    const response = await execute;
    const body = await response.text();
    expect(response.status).toBe(503);
    expect(body).not.toContain('sensitive SQL');
    expect(body).not.toContain('private_optin_receipts');
    expect(JSON.parse(body).error.code).toBe('CAPABILITY_UNAVAILABLE');
  });

  it('does not disclose canonical Subject resolution details', async () => {
    const { execute } = invoke({ commandError: new Error('member_subject_context_unresolved') });
    const response = await execute;
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('member_subject_context');
  });
});
