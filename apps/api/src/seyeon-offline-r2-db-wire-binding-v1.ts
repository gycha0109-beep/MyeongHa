import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import type { SeyeonRuntimeContextV2 } from '../../../packages/domain/src/index.js';
import type { CharacterGovernedPreflightResultV1 } from './character-governed-preflight-v1.js';
import {
  SEYEON_PROVIDER_UNTRUSTED_DATA_BOUNDARY_V1,
} from './openai-seyeon-structured-provider-v1.js';
import {
  observeSeyeonOfflineR2DbSourceBindingV1,
  type SeyeonOfflineR2DbSourceObservationV1,
} from './seyeon-offline-r2-db-source-set-binding-v1.js';
import {
  observeSeyeonOfflineR2PostPreflightClosureV1,
} from './seyeon-offline-r2-post-preflight-closure-v1.js';
import {
  auditSeyeonOfflineR2ProviderRequestV1,
} from './seyeon-offline-r2-provider-ingress-audit-v1.js';
import type { SeyeonOfflineS0ContextCandidateV1 } from './seyeon-offline-s0-context-admission-v1.js';
import type { SeyeonStructuredProviderRequestV2 } from './seyeon-character-runtime-v2.js';

/**
 * TEST-ONLY correlation: disposable PostgreSQL original-Grant observation
 * + native Seyeon Provider request + the exact serialized OpenAI body.
 *
 * This is deliberately NOT an authorization token: observation is provided
 * by an untrusted test caller; digest is not keyed or DB-signed; no PostgreSQL
 * lock is held by this function and it cannot attest TLS/server receipt.
 * NEVER use to enable a positive Production projector, Provider or Reveal.
 */
export const SEYEON_OFFLINE_R2_DB_WIRE_BINDING_V1 =
  'seyeon-offline-r2-db-wire-binding-v1' as const;

const HELD = Object.freeze({
  state: 'held' as const,
  permitsProductionProvider: false as const,
  permitsProductionReveal: false as const,
});

type Input = Readonly<{
  candidate: SeyeonOfflineS0ContextCandidateV1;
  observation: SeyeonOfflineR2DbSourceObservationV1;
  request: SeyeonStructuredProviderRequestV2;
  serializedRequestBody: string;
  expectedModel: string;
  /** Mandatory for interpreter/renderer/reviewer; not yet returned before classification. */
  preflight?: CharacterGovernedPreflightResultV1;
  actualContext?: SeyeonRuntimeContextV2;
}>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function exactly(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return isObject(value) &&
    Object.keys(value).length === fields.length &&
    fields.every(field => Object.prototype.hasOwnProperty.call(value, field));
}

function eq(a: unknown, b: unknown): boolean {
  try { return canonicalJson(a) === canonicalJson(b); }
  catch { return false; }
}

function digest(bytes: Uint8Array): string {
  return 'sha256:utf8:v1:' +
    createHash('sha256').update(bytes).digest('hex');
}
function bindingDigest(value: unknown): string {
  return 'sha256:v1:' +
    createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function expectedSchemaName(purpose: string): string {
  return ('myeongha_' + purpose + '_v2')
    .replace(/[^A-Za-z0-9_-]/gu, '_').slice(0,64);
}

export function observeSeyeonOfflineR2DbWireBindingV1(input: Input):
  | Readonly<{
      state: 'db_original_grant_to_wire_observed_offline_only';
      observationDigest: string;
      requestDigest: string;
      wireDigest: string;
      wireByteLength: number;
      bindingDigest: string;
      permitsProductionProvider: false;
      permitsProductionReveal: false;
    }>
  | typeof HELD {
  try {
    if (!input || !input.candidate || !input.request ||
        !exactly(input.request, [
          'contractVersion','purpose','instructions','input','responseSchema',
        ]) ||
        typeof input.expectedModel !== 'string' ||
        !/^[a-zA-Z0-9._:/-]{1,128}$/u.test(input.expectedModel) ||
        typeof input.serializedRequestBody !== 'string' ||
        input.serializedRequestBody.length < 1 ||
        input.serializedRequestBody.length > 1_000_000) return HELD;

    const db = observeSeyeonOfflineR2DbSourceBindingV1({
      candidate:input.candidate,observation:input.observation,
    });
    if (db.state !== 'db_source_shape_observed_offline_only' ||
        auditSeyeonOfflineR2ProviderRequestV1({
          candidate:input.candidate,request:input.request,
        }).state !== 'observed_synthetic_only') return HELD;

    const isClassifier =
      input.request.purpose === 'integrity_classification' ||
      input.request.purpose === 'disclosure_classification';
    if (!isClassifier) {
      if (!input.preflight || !input.actualContext ||
          observeSeyeonOfflineR2PostPreflightClosureV1({
            candidate:input.candidate,preflight:input.preflight,
            actualContext:input.actualContext,
          }).state !== 'post_preflight_context_observed_synthetic_only') return HELD;
    } else if (input.preflight !== undefined ||
               input.actualContext !== undefined) {
      // The classifier dispatch must not claim a future post-Preflight receipt.
      return HELD;
    }

    const body = JSON.parse(input.serializedRequestBody) as unknown;
    if (!exactly(body,['model','store','instructions','input','text']) ||
        body.model !== input.expectedModel ||
        body.store !== false ||
        body.instructions !== input.request.instructions +
          '\n\n' + SEYEON_PROVIDER_UNTRUSTED_DATA_BOUNDARY_V1 ||
        !Array.isArray(body.input) || body.input.length !== 1 ||
        !exactly(body.input[0],['role','content'])) return HELD;
    const turn = body.input[0];
    if (turn.role !== 'user' ||
        !Array.isArray(turn.content) || turn.content.length !== 1 ||
        !exactly(turn.content[0],['type','text']) ||
        turn.content[0].type !== 'input_text' ||
        typeof turn.content[0].text !== 'string' ||
        turn.content[0].text !== JSON.stringify(input.request.input) ||
        !eq(JSON.parse(turn.content[0].text),input.request.input)) return HELD;
    if (!exactly(body.text,['format']) ||
        !exactly(body.text.format,['type','name','strict','schema']) ||
        body.text.format.type !== 'json_schema' ||
        body.text.format.strict !== true ||
        body.text.format.name !== expectedSchemaName(input.request.purpose) ||
        !eq(body.text.format.schema,input.request.responseSchema)) return HELD;

    const bytes = new TextEncoder().encode(input.serializedRequestBody);
    const requestDigest = bindingDigest(input.request);
    const wireDigest = digest(bytes);
    const sourceWireBinding = bindingDigest({
      version:SEYEON_OFFLINE_R2_DB_WIRE_BINDING_V1,
      identity:input.candidate.identity,
      originalGrantObservationDigest:db.observationDigest,
      selectedSourcesDigest:input.candidate.selection.selectedSourcesDigest,
      purpose:input.request.purpose,
      requestDigest,
      wireDigest,
      wireByteLength:bytes.byteLength,
      model:input.expectedModel,
    });
    return Object.freeze({
      state:'db_original_grant_to_wire_observed_offline_only' as const,
      observationDigest:db.observationDigest,
      requestDigest,wireDigest,wireByteLength:bytes.byteLength,
      bindingDigest:sourceWireBinding,
      permitsProductionProvider:false as const,
      permitsProductionReveal:false as const,
    });
  } catch {
    return HELD;
  }
}
