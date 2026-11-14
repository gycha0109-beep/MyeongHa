import { verify, type KeyObject } from 'node:crypto';
import type { readApprovedSajuPairIssueScopeV1 } from './postgres-approved-saju-issue-scope-v1.js';
import { hashSajuHeldSourceProofRequestV1 as hashJson } from './saju-held-source-proof-verifier-v1.js';
import { readBoundedUpstreamJsonTextV1 } from './upstream-json-response-resource.js';

const VERSION = 'myeongha-t10-production-pair-issue-v1';
const SIGNATURE_DOMAIN = 'myeongha/saju/production-pair-issue/v1\0';
const PATH = '/api/production/compatibility-issue';
const PROOF_HEADER = 'x-myeonghwa-production-pair-issue-proof';
const LIFECYCLE_HEADER = 'x-myeonghwa-reading-lifecycle';
const HASH = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const TOKEN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/u;
type Scope = NonNullable<Awaited<ReturnType<typeof readApprovedSajuPairIssueScopeV1>>>;

export interface SajuT10ProductionPairTrustV1 {
  readonly issuer: string;
  readonly audience: string;
  readonly keyId: string;
  readonly engineVersion: string;
  readonly verificationKey: KeyObject;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function fieldList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(x => typeof x === 'string');
}
function validateOfficialBody(body: unknown, scope: Scope, readingId: string): boolean {
  if (!record(body) || Object.keys(body).length !== 11 ||
      body.version !== 'saju-t10-official-pair-reading-v1' ||
      body.state !== 'issued' || body.readingId !== readingId ||
      body.readingDomain !== 'compatibility' ||
      body.policyId !== 'myeongha-t10-internal-relational-explanation-v1' ||
      body.policyVersion !== '2026-11-13' ||
      body.sourceScope !== 'two_canonical_natal_charts' ||
      !Array.isArray(body.charts) || body.charts.length !== 2 ||
      !Array.isArray(body.chartDisplays) || body.chartDisplays.length !== 2 ||
      !Array.isArray(body.units) || body.units.length < 3 || body.units.length > 7 ||
      typeof body.materialHash !== 'string' || !HASH.test(body.materialHash)) return false;
  const charts = body.charts;
  for (let i = 0; i < 2; i++) {
    const chart = charts[i];
    if (!record(chart) || Object.keys(chart).length !== 5 ||
        chart.role !== (i === 0 ? 'self' : 'partner') ||
        chart.birthRevisionId !== (i === 0 ? scope.birthRevisionId : scope.targetBirthRevisionId) ||
        chart.birthInputHash !== (i === 0 ? scope.sourceBirthInputHash : scope.targetBirthInputHash) ||
        typeof chart.snapshotId !== 'string' || chart.snapshotId.trim() === '' ||
        typeof chart.calculationHash !== 'string' || !HASH.test(chart.calculationHash)) return false;
  }
  for (let i = 0; i < 2; i++) {
    const chart = body.chartDisplays[i];
    if (!record(chart) || Object.keys(chart).length !== 2 ||
        chart.role !== (i === 0 ? 'self' : 'partner') ||
        !record(chart.pillars) ||
        Object.keys(chart.pillars).length !== 4) return false;
    for (const slot of ['year', 'month', 'day', 'hour']) {
      const pillar = chart.pillars[slot];
      if (!record(pillar) ||
          (pillar.status === 'resolved' && (Object.keys(pillar).length !== 2 ||
            typeof pillar.value !== 'string' || !/^[^\\s]{2,4}$/u.test(pillar.value))) ||
          (pillar.status === 'unavailable' && Object.keys(pillar).length !== 1) ||
          (pillar.status !== 'resolved' && pillar.status !== 'unavailable')) return false;
    }
  }
  const ruleIds = new Set<string>();
  let hasDay = false;
  let hasStem = false;
  let hasBoundary = false;
  for (const unit of body.units) {
    if (!record(unit) || Object.keys(unit).length !== 6 ||
        typeof unit.ruleId !== 'string' || !unit.ruleId.startsWith('T10-SERVICE-') ||
        ruleIds.has(unit.ruleId) || typeof unit.paragraph !== 'string' ||
        !unit.paragraph.trim() || unit.paragraph.length > 1500 ||
        !fieldList(unit.observedFactPaths) || !fieldList(unit.calculationSourceIds) ||
        !fieldList(unit.sourceDefinitionHashes) ||
        unit.sourceDefinitionHashes.some(hash => !HASH.test(hash)) ||
        unit.observedFactPaths.some(path =>
          !/^(subject|target)\.pillars\.(year|month|day|hour)\.value\.(stem|branch)$/u.test(path)) ||
        (unit.observedFactPaths.length > 0 &&
          (unit.calculationSourceIds.length === 0 || unit.sourceDefinitionHashes.length === 0))) return false;
    const { unitId, ...source } = unit;
    if (unitId !== 't10_unit_' + hashJson(source).slice(0, 24)) return false;
    ruleIds.add(unit.ruleId);
    if (unit.ruleId.startsWith('T10-SERVICE-DAY-') && !unit.ruleId.startsWith('T10-SERVICE-DAY-STEM-')) hasDay = true;
    if (unit.ruleId.startsWith('T10-SERVICE-DAY-STEM-')) hasStem = true;
    if (unit.ruleId === 'T10-SERVICE-BOUNDED-SCOPE') hasBoundary = true;
  }
  if (!hasDay || !hasStem || !hasBoundary) return false;
  const unissuedMaterial = {
    version: 'saju-t10-pair-reading-material-v1',
    policyId: body.policyId, policyVersion: body.policyVersion,
    readingDomain: 'compatibility', interpretationOwner: 'myeongha_internal_service',
    sourceScope: body.sourceScope,
    charts: charts.map((chart: Record<string, unknown>) => ({
      role: chart.role, snapshotId: chart.snapshotId, calculationHash: chart.calculationHash,
    })),
    units: body.units,
  };
  return hashJson(unissuedMaterial) === body.materialHash;
}

/**
 * Source verification only. A valid signature does NOT write an entitlement,
 * commit a Reading or override the pair's current consent/purchase state.
 */
export function verifySajuT10ProductionPairIssueV1(input: Readonly<{
  scope: Scope;
  purchaseIntentId: string;
  executionAttemptId: string;
  readingId: string;
  body: unknown;
  proof: unknown;
  trust: SajuT10ProductionPairTrustV1;
  acceptedAtMs: number;
}>): Readonly<{ state: 'production_pair_source_verified'; responseHash: string;
  proofFingerprint: string; materialHash: string; body: unknown; proof: unknown }> | null {
  const { scope, proof, trust } = input;
  if (!UUID.test(input.purchaseIntentId) || !UUID.test(input.executionAttemptId) ||
      !UUID.test(input.readingId) || !Number.isSafeInteger(input.acceptedAtMs) ||
      !record(proof) || Object.keys(proof).length !== 2 || !record(proof.payload) ||
      typeof proof.signature !== 'string' || !/^[a-zA-Z0-9_-]{86}$/u.test(proof.signature) ||
      !validateOfficialBody(input.body, scope, input.readingId) ||
      trust.verificationKey.type !== 'public' || trust.verificationKey.asymmetricKeyType !== 'ed25519') return null;
  const payload = proof.payload;
  if (Object.keys(payload).length !== 22 ||
      payload.version !== VERSION ||
      payload.issuer !== trust.issuer || payload.audience !== trust.audience ||
      payload.keyId !== trust.keyId || payload.engineVersion !== trust.engineVersion ||
      ![trust.issuer, trust.audience, trust.keyId, trust.engineVersion].every(x => TOKEN.test(x)) ||
      payload.executionAttemptId !== input.executionAttemptId ||
      payload.purchaseIntentId !== input.purchaseIntentId ||
      payload.readingId !== input.readingId ||
      payload.offerId !== scope.paidComparison.offerId ||
      payload.counterpartOrder !== scope.paidComparison.counterpartOrder ||
      payload.targetPersonId !== scope.paidComparison.targetPersonId ||
      payload.useApprovalRef !== scope.paidComparison.useApprovalRef ||
      payload.admissionHash !== scope.admissionHash ||
      payload.birthRevisionId !== scope.birthRevisionId ||
      payload.targetBirthRevisionId !== scope.targetBirthRevisionId ||
      payload.sourceBirthInputHash !== scope.sourceBirthInputHash ||
      payload.targetBirthInputHash !== scope.targetBirthInputHash ||
      payload.sourceRequestHash !== scope.sourceRequestHash ||
      payload.releaseRef !== scope.releaseRef ||
      payload.materialHash !== (input.body as Record<string, unknown>).materialHash ||
      payload.responseBodyHash !== hashJson(input.body) ||
      typeof payload.issuedAtMs !== 'number' || !Number.isSafeInteger(payload.issuedAtMs) ||
      payload.issuedAtMs < input.acceptedAtMs - 120_000 ||
      payload.issuedAtMs > input.acceptedAtMs + 5_000 ||
      !verify(null, Buffer.from(SIGNATURE_DOMAIN + hashJson(payload)),
        trust.verificationKey, Buffer.from(proof.signature, 'base64url'))) return null;
  return Object.freeze({
    state: 'production_pair_source_verified',
    responseHash: 'sha256:v1:' + hashJson(input.body),
    proofFingerprint: 'sha256:v1:' + hashJson(proof),
    materialHash: (input.body as {materialHash:string}).materialHash,
    body: input.body, proof,
  });
}

export function createSajuT10ProductionPairIssueSourceV1(config: Readonly<{
  origin: string;
  bearerToken: string;
  trust: SajuT10ProductionPairTrustV1;
  fetchImpl?: typeof fetch;
}>) {
  const origin = new URL(config.origin);
  if (origin.origin !== config.origin || origin.protocol !== 'https:' ||
      !/^\S{24,1024}$/u.test(config.bearerToken) ||
      config.trust.verificationKey.type !== 'public' ||
      config.trust.verificationKey.asymmetricKeyType !== 'ed25519')
    throw new TypeError('T10 Production Pair transport requires a trusted private HTTPS host.');
  const url = new URL(PATH, origin).toString();
  const fetchImpl = config.fetchImpl ?? fetch;
  return Object.freeze({
    async issuePreparedPair(input: Readonly<{scope: Scope; purchaseIntentId: string;
      executionAttemptId: string; readingId: string}>) {
      const { scope } = input;
      const binding = {
        executionAttemptId: input.executionAttemptId, readingId: input.readingId,
        purchaseIntentId: input.purchaseIntentId, offerId: scope.paidComparison.offerId,
        counterpartOrder: scope.paidComparison.counterpartOrder,
        targetPersonId: scope.paidComparison.targetPersonId,
        useApprovalRef: scope.paidComparison.useApprovalRef,
        admissionHash: scope.admissionHash, birthRevisionId: scope.birthRevisionId,
        targetBirthRevisionId: scope.targetBirthRevisionId,
        sourceBirthInputHash: scope.sourceBirthInputHash,
        targetBirthInputHash: scope.targetBirthInputHash,
        sourceRequestHash: scope.sourceRequestHash, releaseRef: scope.releaseRef,
      };
      const signal = AbortSignal.timeout(10_000);
      const response = await fetchImpl(url, {
        method: 'POST', redirect: 'error', cache: 'no-store', signal,
        headers: { Authorization: 'Bearer ' + config.bearerToken,
          'Content-Type': 'application/json' },
        body: JSON.stringify({ ...scope.request, binding }),
      });
      const header = response.headers.get(PROOF_HEADER);
      if (!response.ok || response.headers.get(LIFECYCLE_HEADER) !== 'production-pair-issued' ||
          header === null || header.length > 4096 ||
          !/^[a-zA-Z0-9_-]+$/u.test(header)) {
        void response.body?.cancel().catch(() => undefined);
        return null;
      }
      let proof: unknown;
      try { proof = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')); }
      catch { void response.body?.cancel().catch(() => undefined); return null; }
      const body: unknown = JSON.parse(await readBoundedUpstreamJsonTextV1(response, {
        maximumBodyBytes: 128 * 1024, signal,
      }));
      return verifySajuT10ProductionPairIssueV1({
        ...input, body, proof, trust: config.trust, acceptedAtMs: Date.now(),
      });
    },
  });
}
