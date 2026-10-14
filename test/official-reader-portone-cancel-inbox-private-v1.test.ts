import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  stageSignedPortOneV2CancellationInboxV1,
  type OfficialReaderCancelInboxRecorderV1,
  type OfficialReaderCancelInboxSignedEnvelopeV1,
} from '../apps/api/src/official-reader-portone-cancel-inbox-private-v1.js';
import { createPrivateOfficialReaderCancelInboxRecorderTestV1 } from './support/private-official-reader-cancel-inbox-recorder-v1.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';

const SECRET_BYTES = Buffer.alloc(32, 9);
const WEBHOOK_SECRET = 'whsec_' + SECRET_BYTES.toString('base64');
const HMAC_SECRET = 'isolated-test-evidence-key-must-be-at-least-32-bytes';
const AT = '2026-10-14T00:00:00.000Z';

function webhook(type = 'Transaction.Cancelled', fields: Record<string, unknown> = {}) {
  const rawBody = Buffer.from(JSON.stringify({
    type, timestamp: AT,
    data: {
      paymentId: 'payment-1', transactionId: 'tx-1',
      storeId: 'store-1', cancellationId: 'cancel-1', ...fields,
    },
  }));
  const webhookId = 'webhook-1';
  const signature = createHmac('sha256', SECRET_BYTES)
    .update(webhookId + '.' + String(Date.parse(AT) / 1000) + '.')
    .update(rawBody).digest('base64');
  return {
    rawBody,
    headers: {
      'content-type': 'application/json',
      'webhook-id': webhookId,
      'webhook-timestamp': String(Date.parse(AT) / 1000),
      'webhook-signature': 'v1,' + signature,
    },
  };
}

function run(input: {
  request?: ReturnType<typeof webhook>;
  evidenceHmacSecret?: string;
  recorder?: OfficialReaderCancelInboxRecorderV1;
} = {}) {
  const enqueueSigned = vi.fn(async (_input: OfficialReaderCancelInboxSignedEnvelopeV1) => ({
    intakeResult: 'queued' as const, effectAuthorized: false as const,
  }));
  const recorder = input.recorder ?? { enqueueSigned };
  return {
    enqueueSigned,
    promise: stageSignedPortOneV2CancellationInboxV1({
      request: input.request ?? webhook(),
      webhookConfig: {
        environment: 'production',
        webhookSecrets: [WEBHOOK_SECRET],
        now: () => new Date(AT),
      },
      evidenceHmacSecret: input.evidenceHmacSecret ?? HMAC_SECRET,
      recorder,
    }),
  };
}

describe('D3e3 signed cancellation inbox (private candidate only)', () => {
  it('queues minimal signed facts BEFORE provider lookup; neither refunds nor revokes', async () => {
    const instance = run();
    expect(await instance.promise).toEqual({
      kind: 'queued',
      providerRefundAuthorized: false,
      entitlementMutationAuthorized: false,
    });
    expect(instance.enqueueSigned).toHaveBeenCalledOnce();
    const envelope = instance.enqueueSigned.mock.calls[0]?.[0];
    expect(envelope).toMatchObject({
      webhookId: 'webhook-1', environment: 'production',
      paymentId: 'payment-1', transactionId: 'tx-1',
      storeId: 'store-1', cancellationId: 'cancel-1',
      eventType: 'Transaction.Cancelled', eventOccurredAt: AT,
    });
    expect(envelope?.ingressFingerprint).toMatch(/^hmac-sha256:k1:[a-f0-9]{64}$/u);
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain('webhook-signature');
    expect(serialized).not.toContain('server-secret');
    expect(serialized).not.toContain(WEBHOOK_SECRET);
    expect(serialized).not.toContain(HMAC_SECRET);
  });

  it('ignores paid/unrelated signed events without recording', async () => {
    for (const type of ['Transaction.Paid', 'Event.Unknown']) {
      const instance = run({ request: webhook(type) });
      expect(await instance.promise).toMatchObject({ kind: 'ignored' });
      expect(instance.enqueueSigned).not.toHaveBeenCalled();
    }
  });

  it('blocks signature tampering, absent/ambiguous IDs and malformed timestamps before persistence', async () => {
    const forged = webhook();
    forged.headers['webhook-signature'] = 'v1,' + Buffer.alloc(32).toString('base64');
    for (const request of [
      forged,
      webhook('Transaction.Cancelled', { cancellationId: null }),
      webhook('Transaction.Cancelled', { transactionId: ' leading-space' }),
      webhook('Transaction.Cancelled', { storeId: '' }),
    ]) {
      const instance = run({ request });
      await expect(instance.promise).rejects.toThrow();
      expect(instance.enqueueSigned).not.toHaveBeenCalled();
    }
  });

  it('uses fixed-domain keyed fingerprint; stable replay, changed signed fact changes fingerprint', async () => {
    const a = run(); const b = run();
    await Promise.all([a.promise,b.promise]);
    expect(a.enqueueSigned.mock.calls[0]?.[0].ingressFingerprint)
      .toBe(b.enqueueSigned.mock.calls[0]?.[0].ingressFingerprint);
    const changed = run({ request: webhook('Transaction.Cancelled', { cancellationId: 'cancel-2' }) });
    await changed.promise;
    expect(changed.enqueueSigned.mock.calls[0]?.[0].ingressFingerprint)
      .not.toBe(a.enqueueSigned.mock.calls[0]?.[0].ingressFingerprint);
    const weak = run({ evidenceHmacSecret: 'weak' });
    await expect(weak.promise).rejects.toThrow('too short');
    expect(weak.enqueueSigned).not.toHaveBeenCalled();
  });

  it('never acknowledges a failed DB write or authorized-effect response', async () => {
    await expect(run({ recorder: {
      enqueueSigned: async () => { throw new Error('no DB commit'); },
    } }).promise).rejects.toThrow('no DB commit');
    await expect(run({ recorder: {
      enqueueSigned: async () => ({ intakeResult: 'queued', effectAuthorized: true }) as never,
    } }).promise).rejects.toThrow('invalid no-effect');
  });

  it('maps only exact private enqueue function and rejects malformed rows', async () => {
    const query = vi.fn(async (_sql: string, _params?: readonly unknown[]) => ({ rows: [{
      intakeResult: 'replayed', effectAuthorized: false,
    }] }));
    const recorder = createPrivateOfficialReaderCancelInboxRecorderTestV1({
      query,
    } as unknown as PostgresTransactionQueryV1);
    expect(await run({ recorder }).promise).toMatchObject({ kind: 'replayed' });
    expect(query).toHaveBeenCalledOnce();
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toContain('internal_enqueue_official_reader_portone_cancel_inbox_v1');
    expect(sql).not.toMatch(/\b(insert|update|delete|grant|revoke)\b/iu);
    expect(params).toHaveLength(9);
    expect(params?.[0]).toBe('production');
    expect(params?.[4]).toBe('store-1');
    expect(params?.[8]).toMatch(/^hmac-sha256:k1:/u);

    const badRecorder = createPrivateOfficialReaderCancelInboxRecorderTestV1({
      query: async () => ({ rows: [{ intakeResult: 'queued', effectAuthorized: true }] }),
    } as unknown as PostgresTransactionQueryV1);
    await expect(run({ recorder: badRecorder }).promise).rejects.toThrow('invalid no-effect');
  });

  it('keeps database surface queued-only / no runtime EXECUTE / no raw payload / no purge', () => {
    const sql = readFileSync(
      new URL('../supabase/migrations/1910_official_reader_portone_cancel_ingress_inbox_private_v1.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('enable row level security');
    expect(sql).toContain("check (inbox_state = 'queued')");
    expect(sql).toContain('unique (provider,environment,webhook_id)');
    expect(sql).toContain('revoke all on function public.internal_enqueue_official_reader_portone_cancel_inbox_v1');
    expect(sql).not.toMatch(/\bgrant\s+(?:all|insert|execute|update|delete)\s+on\b/iu);
    expect(sql).not.toMatch(/\b(?:raw_body|full_payload|secret_key|access_token|subject_id)\s+\w+\s+(?:not null|null|default)/iu);
  });
});
