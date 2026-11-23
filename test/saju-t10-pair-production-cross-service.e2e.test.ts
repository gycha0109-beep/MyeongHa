import { generateKeyPairSync, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApprovedSajuT10PairIssuanceWorkerV1 } from '../apps/api/src/approved-saju-t10-pair-issuance-worker-v1.js';
import { createApprovedSajuT10PairReaderHttpV1 } from '../apps/api/src/approved-saju-t10-pair-reader-http-v1.js';
import { handleOfficialReadingRecordRequestV1 } from '../apps/api/src/official-reading-record-http.js';
import { handleReadingHistoryRequestV1 } from '../apps/api/src/reading-history-http.js';
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
const releaseRef = 'isolated-compatibility';
const bearer = 'saju-pair-cross-service-test-only-bearer';
const { privateKey, publicKey } = generateKeyPairSync('ed25519');

type Scope = Parameters<typeof verifySajuT10ProductionPairIssueV1>[0]['scope'];
type ProcessFactory = (env: Record<string, string>) => { server: Server; host: string };

let server: Server;
let actualOrigin: string;
let sourceCalls = 0;
async function startHost() {
  const sajuDir = resolve(process.env.MYEONGHA_T10_SAJU_CHECKOUT ?? '.cross-service/saju');
  const moduleUrl = pathToFileURL(resolve(sajuDir, 'dist/production-calculation-process.js'));
  const { createMyeonghwaProductionCalculationProcessV1 } = await import(moduleUrl.href) as {
    createMyeonghwaProductionCalculationProcessV1: ProcessFactory;
  };
  const runtime = createMyeonghwaProductionCalculationProcessV1({
    SAJU_PRODUCTION_HOST: '127.0.0.1',
    SAJU_PRODUCTION_SERVICE_BEARER: bearer,
    SAJU_T10_PRODUCTION_PAIR_ISSUER_CONFIG: JSON.stringify({
      issuer: 'saju', audience: 'myeongha', keyId: 'pair-cross-service-key',
      engineVersion: 'test-engine',
      privateKeyPkcs8Base64: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
      releaseByOffer: Object.fromEntries(offerIds.map(id => [id, releaseRef])),
    }),
  });
  server = runtime.server;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, runtime.host, resolve);
  });
  actualOrigin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
}

async function stopHost() {
  if (server?.listening) await new Promise<void>((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve()));
}

const sourceOrigin = 'https://saju-pair-test.example';
const loopbackSourceFetch: typeof fetch = (url, init) => {
  const target = new URL(String(url));
  if (target.origin !== sourceOrigin) throw Error('Unexpected T10 Source origin.');
  sourceCalls++;
  return fetch(actualOrigin + target.pathname, init);
};

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
    origin: sourceOrigin, bearerToken: bearer, trust: sourceTrust(),
    fetchImpl: loopbackSourceFetch,
  });
}

suite('real pinned Saju T10 Production issuer to MyeongHa Reading contract', () => {
  beforeAll(startHost);
  afterAll(stopHost);
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
    expect(body.chartDisplays.every(chart => chart.pillars.day?.status === 'resolved')).toBe(true);
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

type OfferId = (typeof offerIds)[number];
const readerCharacterId = 'seyeon';
const buyer = { subjectId: randomUUID(), authUserId: randomUUID() };
const stranger = { subjectId: randomUUID(), authUserId: randomUUID() };
const readerOrigin = 'http://127.0.0.1';

function testPool(kind: 'FIXTURE' | 'MEMBER' | 'ISSUER' | 'PAIR_READER') {
  const url = new URL(process.env['MYEONGHA_T10_' + kind + '_DB_URL'] ?? '');
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' ||
      !url.port || url.pathname !== '/myeongha_saju_sandbox_v1' || url.search) {
    throw Error('T10 verification requires the disposable loopback PostgreSQL stack.');
  }
  return new Pool({ connectionString: url.href, ssl: false, connectionTimeoutMillis: 5000 });
}

async function seedBirth(client: PoolClient, kind: 'self' | 'target', date: string, time: string | null) {
  const profile = randomUUID(), revision = randomUUID();
  await client.query(
    'insert into public.birth_profiles(id,subject_id,profile_kind,created_at,updated_at) values ($1,$2,$3,now(),now())',
    [profile, buyer.subjectId, kind],
  );
  await client.query(`
    insert into public.birth_profile_revisions
      (id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,input_hash,created_at)
    values ($1,$2,$3,1,'solar',$4,$5,$5::time is not null,$6,now())
  `, [revision, profile, buyer.subjectId, date, time, 'sha256:v1:' + hashJson({ date, time })]);
  await client.query('update public.birth_profiles set current_revision_id=$1 where id=$2', [revision, profile]);
  return { profile, revision };
}

async function seedCounterpart(client: PoolClient, ownRevision: string, date: string) {
  const { profile, revision } = await seedBirth(client, 'target', date, null);
  const person = randomUUID(), approval = randomUUID();
  await client.query(
    'insert into public.target_person_profiles(id,subject_id,birth_profile_id,created_at) values ($1,$2,$3,now())',
    [person, buyer.subjectId, profile],
  );
  await client.query(`
    insert into commerce_saju_private.comparison_use_approval_v1
      (approval_ref,subject_id,target_person_id,birth_revision_id,target_birth_revision_id,valid_until)
    values ($1,$2,$3,$4,$5,clock_timestamp()+interval '1 hour')
  `, [approval, buyer.subjectId, person, ownRevision, revision]);
  return { person, revision, approval };
}

async function buyComparison(client: PoolClient, offer: OfferId, record: string, ownRevision: string, target: string) {
  const purchase = randomUUID(), receipt = randomUUID();
  const { rows: [selected] } = await client.query(`
    select offer.id, offer.product_id, offer.capability_set_id, offer.external_product_id,
      capability.definition_hash
    from public.product_offers offer
    join public.product_capability_sets capability on capability.id=offer.capability_set_id
    join commerce_saju_private.approved_fulfillment_release_v1 release on release.product_offer_id=offer.id
    where release.approved_offer_id=$1 and offer.external_product_id='isolated-saju14-' || $1
  `, [offer]);
  const key = 't10-e2e-' + purchase;
  const { rows: [{ payload }] } = await client.query(`
    select commerce_saju_private.resolve_approved_purchase_admission_v1(
      $1,$2,$3,$4,$5,$6,$7,$8
    ) as payload
  `, [buyer.subjectId, record, ownRevision, selected.id, selected.capability_set_id, offer, key, target]);
  expect(payload?.counterpart?.targetPersonId).toBe(target);
  const offerSnapshot = {
    productOfferId: selected.id, productId: selected.product_id, platform: 'web',
    provider: 'portone_v2', externalProductId: selected.external_product_id,
  };
  const capabilitySnapshot = {
    capabilitySetId: selected.capability_set_id, definitionVersion: offer,
    definitionHash: selected.definition_hash,
  };
  const createPurchase = (id: string) => client.query(`
    select * from pg_temp.approved_fixture_purchase($1,$2,$3,$4,$5,$6,$7,$8,$9)
      as purchase(purchase_intent_id uuid,replayed boolean,admission_hash text)
  `, [buyer.subjectId, id, record, ownRevision, selected.id, key, offerSnapshot, capabilitySnapshot, payload]);
  expect((await createPurchase(purchase)).rows[0]).toMatchObject({ purchase_intent_id: purchase, replayed: false });
  expect((await createPurchase(randomUUID())).rows[0]).toMatchObject({ purchase_intent_id: purchase, replayed: true });
  await client.query('select pg_temp.approved_fixture_receipt($1,$2,$3)', [buyer.subjectId, purchase, receipt]);
  const components = offer === 'relationship-plus-first' ? ['compatibility', 'relationship'] : ['compatibility'];
  await client.query('select pg_temp.approved_fixture_grants($1,$2,$3)', [purchase, receipt, components]);
  return { purchase, receipt, components };
}

suite('signed T10 issuance, purchased archive and Reader on PostgreSQL 17', () => {
  beforeAll(startHost);
  afterAll(stopHost);

  it('issues all three paid scopes once and reopens only the current buyer’s signed result', async () => {
    const fixturePool = testPool('FIXTURE');
    const memberPool = testPool('MEMBER');
    const issuerPool = testPool('ISSUER');
    const pairReaderPool = testPool('PAIR_READER');
    let fixture: PoolClient | undefined;
    const identity = (request: Request) => {
      const token = request.headers.get('Authorization');
      const member = [buyer, stranger].find(actor => token === 'Bearer ' + actor.authUserId);
      return member ? { kind: 'member' as const, verifiedAuthUserId: member.authUserId } : null;
    };
    const signedReader = createApprovedSajuT10PairReaderHttpV1({
      origin: readerOrigin, pool: pairReaderPool, trusts: [sourceTrust()], verifyRequestIdentity: identity,
    });
    const workerOptions = {
      pool: issuerPool, pairReaderPool, sourceOrigin, sourceBearerToken: bearer, trust: sourceTrust(),
      releaseRef, readerCharacterId, engineKey: 'saju', engineVersion: 'test-engine',
      fetchImpl: loopbackSourceFetch,
    };
    const worker = createApprovedSajuT10PairIssuanceWorkerV1(workerOptions);
    const recordRequest = (query: string, member = buyer) => ({
      request: new Request(readerOrigin + '/api/readings' + query, {
        headers: { Authorization: 'Bearer ' + member.authUserId },
      }),
      requestId: randomUUID(), serverTime: new Date().toISOString(), pool: memberPool,
      identityEvidenceVerifier: { verifyRequestIdentity: identity }, approvedSajuArchiveEnabled: true as const,
    });
    const detail = (reading: string, member = buyer) =>
      handleOfficialReadingRecordRequestV1(recordRequest('?readingId=' + reading, member));
    const list = async (purchase: string, status = 200, member = buyer) => {
      const response = await handleOfficialReadingRecordRequestV1(recordRequest('?purchaseIntentId=' + purchase, member));
      expect(response.status).toBe(status);
      return status === 404 ? [] :
        (await response.json()).data.readings as { component: string; state: string; readingId?: string }[];
    };
    const open = async (purchaseIntentId: string, readingId: string, member = buyer) => {
      const response = await signedReader.handleRequest(new Request(readerOrigin + '/api/approved-saju/pair/reader', {
        method: 'POST', body: JSON.stringify({ purchaseIntentId, readingId, readerCharacterId }),
        headers: {
          Origin: readerOrigin, 'Content-Type': 'application/json', Authorization: 'Bearer ' + member.authUserId,
        },
      }));
      if (!response) throw Error('Signed Reader route was not mounted.');
      return response;
    };
    try {
      fixture = await fixturePool.connect();
      await fixture.query(await readFile(new URL('./db/approved_saju_purchase_fixtures.sql', import.meta.url), 'utf8'));
      const bundle = randomUUID();
      await fixture.query(`
        insert into public.content_bundles
          (id,content_version,content_hash,artifact_ref,artifact_schema_version,min_client_capability,
           asset_manifest_hash,cue_schema_version,manifest_jsonb,published_at)
        values ($1,'t10-e2e','t10-e2e-content','fixture:t10-e2e','v1','v1','t10-e2e-assets','v1','{}',now())
      `, [bundle]);
      await fixture.query("insert into public.characters(character_id,created_at) values ('seyeon',now()) on conflict do nothing");
      await fixture.query(`
        insert into public.character_runtime_catalog(character_id,content_bundle_id,availability,enabled,published_at)
        values ('seyeon',$1,'available',true,now())
      `, [bundle]);
      await fixture.query(`
        insert into public.saju_domain_runtime(saju_domain,availability,capability_version,updated_at)
        values ('compatibility','available','isolated-compatibility',now())
        on conflict (saju_domain) do nothing;
        insert into public.character_capabilities
          (id,content_bundle_id,character_id,saju_domain,role,can_initiate,capability_version)
        select gen_random_uuid(),catalog.content_bundle_id,catalog.character_id,
          runtime.saju_domain,'primary',true,runtime.capability_version
        from public.character_runtime_catalog catalog cross join public.saju_domain_runtime runtime
        where catalog.character_id='seyeon' and runtime.saju_domain='compatibility'
        on conflict (content_bundle_id,character_id,saju_domain) do nothing;
      `);
      for (const member of [buyer, stranger]) {
        await fixture.query('insert into auth.users(id) values ($1)', [member.authUserId]);
        await fixture.query("insert into public.subjects(id,kind,auth_user_id,status,created_at,updated_at) values ($1,'member',$2,'active',now(),now())",
          [member.subjectId, member.authUserId]);
      }
      await fixture.query("select set_config('myeongha.subject_id',$1,false)", [buyer.subjectId]);
      const { revision: ownRevision } = await seedBirth(fixture, 'self', '1990-05-15', '14:30');
      const firstRecord = randomUUID(), bundleRecord = randomUUID();
      await fixture.query(`
        insert into public.commerce_saju_records_v1(id,subject_id,birth_revision_id)
        values ($1,$3,$4),($2,$3,$4)
      `, [firstRecord, bundleRecord, buyer.subjectId, ownRevision]);
      const first = await seedCounterpart(fixture, ownRevision, '1996-06-05');
      const additional = await seedCounterpart(fixture, ownRevision, '1993-11-09');
      const results = [];
      for (const offer of offerIds) {
        const counterpart = offer === 'additional-counterpart' ? additional : first;
        const order = await buyComparison(fixture, offer, offer === 'relationship-plus-first' ? bundleRecord : firstRecord,
          ownRevision, counterpart.person);
        expect(await list(order.purchase)).toEqual(order.components.map(component => ({ component, state: 'pending' })));
        const calls = sourceCalls;
        expect(await worker.runNext()).toEqual({ state: 'issued' });
        expect(await worker.runNext()).toEqual({ state: 'idle' });
        expect(sourceCalls - calls).toBe(1);
        const items = await list(order.purchase);
        if (offer === 'relationship-plus-first') {
          expect(items).toContainEqual({ component: 'relationship', state: 'pending' });
        }
        const pair = items.find(item => item.component === 'compatibility');
        expect(pair?.state).toBe('ready');
        if (!pair?.readingId) throw Error('Purchase archive omitted the issued pair Reading.');
        const response = await open(order.purchase, pair.readingId);
        expect(response.status).toBe(200);
        const reopened = (await response.json()).data;
        const { rows: [stored] } = await fixture.query(`
          select proof_envelope->'sourceBody' as body, proof_envelope->'payload' as proof
          from commerce_saju_private.approved_source_issue_proofs_v1 where reading_id=$1
        `, [pair.readingId]);
        expect(stored.proof).toMatchObject({
          offerId: offer, purchaseIntentId: order.purchase, targetPersonId: counterpart.person,
          birthRevisionId: ownRevision, targetBirthRevisionId: counterpart.revision,
        });
        expect(stored.body.chartDisplays[1].pillars.hour).toEqual({ status: 'unavailable' });
        expect(reopened).toMatchObject({
          state: 'signed_pair_archive_reopened', readingId: pair.readingId,
          display: { kind: 'delivered', steps: expect.arrayContaining([
            expect.objectContaining({ primary: stored.body.units[0].paragraph }),
          ]) },
        });
        const storedDetail = await detail(pair.readingId);
        expect(storedDetail.status).toBe(200);
        expect((await storedDetail.json()).data).toMatchObject({
          approvedComponent: 'compatibility', readingId: pair.readingId,
        });
        await list(order.purchase, 404, stranger);
        expect((await detail(pair.readingId, stranger)).status).toBe(404);
        expect((await open(order.purchase, pair.readingId, stranger)).status).toBe(404);
        results.push({ ...order, readingId: pair.readingId });
      }
      const [firstOrder, otherOrder, bundleOrder] = results;
      if (!firstOrder || !otherOrder || !bundleOrder) throw Error('T10 offer verification did not run.');
      expect((await open(firstOrder.purchase, otherOrder.readingId)).status).toBe(404);
      const history = await handleReadingHistoryRequestV1(recordRequest(''));
      expect(history.status).toBe(200);
      const historyData = (await history.json()).data;
      expect(historyData.readings).toEqual(expect.arrayContaining(results.map(order =>
        expect.objectContaining({ readingId: order.readingId, approvedComponent: 'compatibility' }))));
      await fixture.query(`
        update commerce_saju_private.comparison_use_approval_v1 set revoked_at=clock_timestamp()
        where approval_ref=$1
      `, [first.approval]);
      for (const order of [firstOrder, bundleOrder]) {
        expect((await list(order.purchase, order === firstOrder ? 404 : 200))
          .some(item => item.component === 'compatibility')).toBe(false);
        expect((await detail(order.readingId)).status).toBe(404);
        expect((await open(order.purchase, order.readingId)).status).toBe(404);
      }
      expect((await open(otherOrder.purchase, otherOrder.readingId)).status).toBe(200);
      for (const order of results) {
        const cancelled = await fixture.query(
          'select pg_temp.approved_fixture_full_cancellation($1,clock_timestamp()) as refund', [order.receipt],
        );
        expect(cancelled.rows[0]?.refund).toMatchObject({ disposition: 'revoked' });
        await list(order.purchase, 404);
        expect((await detail(order.readingId)).status).toBe(404);
        expect((await open(order.purchase, order.readingId)).status).toBe(404);
      }
      const withdrawalRecord = randomUUID();
      await fixture.query(`
        insert into public.commerce_saju_records_v1(id,subject_id,birth_revision_id) values ($1,$2,$3)
      `, [withdrawalRecord, buyer.subjectId, ownRevision]);
      const withdrawalTarget = await seedCounterpart(fixture, ownRevision, '1995-07-15');
      const withdrawalOrder = await buyComparison(
        fixture, 'first-counterpart', withdrawalRecord, ownRevision, withdrawalTarget.person,
      );
      const beforeWithdrawal = sourceCalls;
      const withdrawAfterSource: typeof fetch = async (url, init) => {
        const signed = await loopbackSourceFetch(url, init);
        expect(signed.status).toBe(200);
        await fixturePool.query(`
          update commerce_saju_private.comparison_use_approval_v1 set revoked_at=clock_timestamp()
          where approval_ref=$1
        `, [withdrawalTarget.approval]);
        return signed;
      };
      const withdrawalWorker = createApprovedSajuT10PairIssuanceWorkerV1({
        ...workerOptions, fetchImpl: withdrawAfterSource,
      });
      expect(await withdrawalWorker.runNext()).toMatchObject({ state: 'held', reason: 'source_unverified' });
      expect(await withdrawalWorker.runNext()).toEqual({ state: 'idle' });
      expect(sourceCalls - beforeWithdrawal).toBe(1);
      await list(withdrawalOrder.purchase, 404);
      const { rows: proofRows } = await fixture.query(`
        select proof_envelope->'payload'->>'purchaseIntentId' as purchase
        from commerce_saju_private.approved_source_issue_proofs_v1
      `);
      expect(proofRows.map(row => row.purchase).sort()).toEqual(results.map(order => order.purchase).sort());
    } finally {
      fixture?.release();
      await Promise.all([fixturePool.end(), memberPool.end(), issuerPool.end(), pairReaderPool.end()]);
    }
  }, 30_000);
});
