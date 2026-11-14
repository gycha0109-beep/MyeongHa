import { generateKeyPairSync, randomUUID, type KeyObject } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashSajuHeldSourceProofRequestV1 as hashJson } from '../apps/api/src/saju-held-source-proof-verifier-v1.js';
import {
  createSajuT10ProductionPairIssueSourceV1,
  verifySajuT10ProductionPairIssueV1,
} from '../apps/api/src/saju-t10-production-pair-issue-source-v1.js';
import { projectSignedSajuT10PairProductReadingV1 } from '../apps/api/src/saju-t10-pair-official-product-reading-v1.js';
import { projectProductReadingResponseV2 } from '../packages/api-client/src/product-reading-display.js';

const enabled = process.env.MYEONGHA_RUN_SAJU_T10_PAIR_CROSS_SERVICE_E2E === '1';
const suite = enabled ? describe : describe.skip;
const offerIds = ['first-counterpart', 'additional-counterpart', 'relationship-plus-first'] as const;
const own = { calendarType: 'solar', date: '1990-05-15', time: '14:30', sex: 'unspecified' };
const partner = { calendarType: 'solar', date: '1996-06-05', time: '09:30', sex: 'unspecified' };
const releaseRef = 't10-verified-release-candidate-v1';
const bearer = 'saju-pair-cross-service-test-only-bearer';
const { privateKey, publicKey } = generateKeyPairSync('ed25519');

type Scope = Parameters<typeof verifySajuT10ProductionPairIssueV1>[0]['scope'];
type ServerFactory = (host: { requestReading: () => Promise<never> }, options: {
  serviceBearer: string;
  compatibilityProductionIssue: {
    issuer: string; audience: string; keyId: string;
    signingKey: KeyObject; engineVersion: string;
    releaseByOffer: Record<(typeof offerIds)[number], string>;
  };
}) => Server;

let server: Server;
let actualOrigin: string;
function startHost() {
  return async () => {
  const moduleUrl = new URL('../.cross-service/saju/dist/host/http-server.js', import.meta.url);
  const module = await import(moduleUrl.href) as {createMyeonghwaProductionProductHostServer: ServerFactory};
  server = module.createMyeonghwaProductionProductHostServer(
    {requestReading: async () => {throw new Error('Preview must not execute.');}},
    {
      serviceBearer: bearer,
      compatibilityProductionIssue: {
        issuer: 'saju', audience: 'myeongha', keyId: 'pair-cross-service-key',
        signingKey: privateKey, engineVersion: 'test-engine',
        releaseByOffer: Object.fromEntries(offerIds.map(id => [id, releaseRef])) as
          Record<(typeof offerIds)[number], string>,
      },
    },
  );
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  actualOrigin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  };
}
function stopHost() {
  return async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve()));
  };
}

function scopeFor(offerId: (typeof offerIds)[number], targetPersonId = randomUUID()): Scope {
  const request = {birth: own, partnerBirth: partner};
  return {
    request, birthRevisionId: randomUUID(), targetBirthRevisionId: randomUUID(),
    sourceBirthInputHash: 'sha256:v1:' + 'a'.repeat(64),
    targetBirthInputHash: 'sha256:v1:' + 'b'.repeat(64),
    sourceRequestHash: hashJson(request),
    releaseRef, admissionHash: 'verified-cross-service-admission',
    paidComparison: {
      offerId,
      counterpartOrder: offerId === 'additional-counterpart' ? 'additional' : 'first',
      targetPersonId, useApprovalRef: 'pair-consent-cross-service',
      requiredComponents: offerId === 'relationship-plus-first'
        ? ['relationship', 'compatibility'] : ['compatibility'],
      releaseRef, authorizedForIssue: false,
    },
  } as unknown as Scope;
}

function source() {
  // The production adapter requires HTTPS. Redirect only in this local CI test;
  // the pinned signing key and exact HTTP body are still verified end-to-end.
  return createSajuT10ProductionPairIssueSourceV1({
    origin: 'https://saju-pair-test.example',
    bearerToken: bearer,
    trust: {
      issuer: 'saju', audience: 'myeongha', keyId: 'pair-cross-service-key',
      engineVersion: 'test-engine', verificationKey: publicKey,
    },
    fetchImpl: ((url: string | URL | Request, init?: RequestInit) =>
      fetch(actualOrigin + new URL(String(url)).pathname, init)) as typeof fetch,
  });
}

suite('real pinned Saju T10 Production issuer to MyeongHa Reading contract', () => {
  beforeAll(startHost());
  afterAll(stopHost());
  it.each(offerIds)('preserves signed two-chart Korean source for %s', async offerId => {
    const scope = scopeFor(offerId);
    const purchaseIntentId = randomUUID();
    const executionAttemptId = randomUUID();
    const readingId = randomUUID();
    const signed = await source().issuePreparedPair({
      scope, purchaseIntentId, executionAttemptId, readingId,
    });
    expect(signed?.state).toBe('production_pair_source_verified');
    if (!signed) throw new Error('Actual Saju Production pair proof was rejected by MyeongHa.');
    const bound = {
      scope, purchaseIntentId, executionAttemptId, readingId,
      body: signed.body, proof: signed.proof,
      trust: sourceTrust(), acceptedAtMs: Date.now(),
    };
    const projected = projectSignedSajuT10PairProductReadingV1(bound);
    expect(projected?.state).toBe('verified_pair_display_candidate');
    const body = signed.body as {
      charts: {role: string;birthRevisionId: string;birthInputHash: string}[];
      units: {paragraph: string;ruleId: string}[];
      chartDisplays: {role: string;pillars: Record<string, {status: string;value?: string}>}[];
    };
    expect(body.charts.map(chart => chart.role)).toEqual(['self', 'partner']);
    expect(body.charts.map(chart => chart.birthRevisionId)).toEqual([
      scope.birthRevisionId, scope.targetBirthRevisionId,
    ]);
    expect(body.charts.map(chart => chart.birthInputHash)).toEqual([
      scope.sourceBirthInputHash, scope.targetBirthInputHash,
    ]);
    expect(body.chartDisplays.map(chart => chart.role)).toEqual(['self', 'partner']);
    expect(body.chartDisplays.every(chart => chart.pillars.day.status === 'resolved')).toBe(true);
    expect(body.units.length).toBeGreaterThanOrEqual(3);
    expect(body.units.some(unit => unit.ruleId === 'T10-SERVICE-BOUNDED-SCOPE')).toBe(true);
    const display = projectProductReadingResponseV2(projected?.response);
    expect(display.kind).toBe('delivered');
    if (display.kind === 'delivered') {
      expect(display.steps[1]?.primary).toBe(body.units[0]?.paragraph);
      expect(display.steps[1]?.supporting).toEqual(body.units.slice(1).map(unit => unit.paragraph));
    }
    expect(verifySajuT10ProductionPairIssueV1({
      ...bound, scope: {
        ...scope, paidComparison: {...scope.paidComparison, targetPersonId: randomUUID()},
      },
    })).toBeNull();
    expect(verifySajuT10ProductionPairIssueV1({
      ...bound, scope: {...scope, admissionHash: 'revoked-consent-or-payment'},
    })).toBeNull();
    expect(verifySajuT10ProductionPairIssueV1({
      ...bound, executionAttemptId: randomUUID(),
    })).toBeNull();
  });

  it('rejects an untrusted bearer, a changed request and an unpinned release', async () => {
    const scope = scopeFor('first-counterpart');
    const binding = {
      executionAttemptId: randomUUID(), readingId: randomUUID(),
      purchaseIntentId: randomUUID(),
    };
    const validBinding = {
      ...binding, offerId: scope.paidComparison.offerId,
      counterpartOrder: scope.paidComparison.counterpartOrder,
      targetPersonId: scope.paidComparison.targetPersonId,
      useApprovalRef: scope.paidComparison.useApprovalRef,
      admissionHash: scope.admissionHash,
      birthRevisionId: scope.birthRevisionId,
      targetBirthRevisionId: scope.targetBirthRevisionId,
      sourceBirthInputHash: scope.sourceBirthInputHash,
      targetBirthInputHash: scope.targetBirthInputHash,
      sourceRequestHash: scope.sourceRequestHash,
      releaseRef: scope.releaseRef,
    };
    const url = actualOrigin + '/api/production/compatibility-issue';
    const unauth = await fetch(url, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({...scope.request, binding: validBinding}),
    });
    expect(unauth.status).toBe(401);
    const changed = await fetch(url, {
      method: 'POST', headers: {'Content-Type': 'application/json',Authorization: 'Bearer ' + bearer},
      body: JSON.stringify({
        birth: own, partnerBirth: {...partner, date: '1996-08-05'}, binding: validBinding,
      }),
    });
    expect(changed.status).toBe(400);
    const unpinned = await fetch(url, {
      method: 'POST', headers: {'Content-Type': 'application/json',Authorization: 'Bearer ' + bearer},
      body: JSON.stringify({
        ...scope.request, binding: {...validBinding, releaseRef: 'unapproved-release'},
      }),
    });
    expect(unpinned.status).toBe(400);
  });
});

function sourceTrust() {
  return {
    issuer: 'saju', audience: 'myeongha', keyId: 'pair-cross-service-key',
    engineVersion: 'test-engine', verificationKey: publicKey,
  };
}
