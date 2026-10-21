// Watchtower-Track: security
// Disposable-only R35. This module never sends a Provider request.
// It is not a Production G1/G2/G3 approval or a private-data release.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../packages/domain/src/index.js';
import {buildSeyeonTurnInterpreterRequestV2} from './seyeon-character-runtime-v2.js';
import {
  OPENAI_SEYEON_STRUCTURED_PROVIDER_KEY_V1,
  SEYEON_PROVIDER_UNTRUSTED_DATA_BOUNDARY_V1,
  type OpenAiSeyeonStructuredProviderConfigV1,
} from './openai-seyeon-structured-provider-v1.js';
import {
  persistSeyeonR20OfflineDigestBoundPinV1,
  type PersistSeyeonR20OfflineDigestBoundInputV1,
  type SeyeonR20OfflineDigestBoundReceiptV1,
} from './seyeon-positive-raw-projection-digest-bind-r20-candidate.js';

const OFFLINE_MODEL='seyeon-r35-offline' as const;
const OFFLINE_FORMAT='myeongha_turn_interpretation_v2' as const;
const digest=(value:unknown)=>'sha256:v1:'+
  createHash('sha256').update(canonicalJson(value)).digest('hex');
const wireDigest=(bytes:string)=>'sha256:wire-utf8:v1:'+
  createHash('sha256').update(bytes,'utf8').digest('hex');

export const SEYEON_R35_OFFLINE_WIRE_PIN_V1=Object.freeze({
  database:'myeongha_seyeon_positive_pin_candidate_test',
  model:OFFLINE_MODEL,
  productionMounted:false,
  permitsProvider:false,
  permitsAtomicCommit:false,
  permitsHttpReveal:false,
} as const);

export class SeyeonR35OfflineWireHoldV1 extends Error {
  readonly code='R35_DISPOSABLE_WIRE_SOURCE_HOLD' as const;
  constructor(){
    super('Disposable pinned sources and final Provider wire bytes were not jointly proven.');
    this.name='SeyeonR35OfflineWireHoldV1';
  }
}

export interface SeyeonR35OfflineWireReceiptV1 {
  readonly status:'disposable_db_pin_and_pre_dispatch_wire_attested';
  readonly attemptId:string;
  readonly selectedSourcesDigest:string;
  readonly finalModelContextDigest:string;
  /** Hash of the actual Provider's serialized UTF-8 request body, not its contents. */
  readonly wireBodyDigest:string;
  readonly permitsProvider:false;
  readonly permitsAtomicCommit:false;
  readonly permitsHttpReveal:false;
}

/**
 * Independent check of EXACT bytes from the real structured Provider's
 * meteredBeforeDispatch hook, not an invented second serializer.
 * The trusted expected packet uses the same exported interpreter request
 * builder as the Character runtime but rejects any extra wire fields, options,
 * tool calls or changed instruction/context/schema bytes.
 *
 * No receipt here is a signed DB right: only R20's own verified Subject
 * transaction can be used to reach this assertion in the R35 adapter.
 */
export function assertSeyeonR35OfflineActualWireV1(input:{
  readonly pinned:SeyeonR20OfflineDigestBoundReceiptV1;
  readonly pinInput:PersistSeyeonR20OfflineDigestBoundInputV1;
  readonly call:Parameters<NonNullable<
    OpenAiSeyeonStructuredProviderConfigV1['meteredBeforeDispatch']
  >>[0];
  readonly requestBody:string;
}):string{
  const {pinned,pinInput,call,requestBody}=input;
  try {
    if(pinned.status!=='disposable_original_and_projection_digests_committed'
      ||pinned.permitsProvider!==false
      ||pinned.permitsAtomicCommit!==false
      ||pinned.permitsHttpReveal!==false
      ||pinned.selectedPersonalRecordCount<1
      ||pinned.selectedPersonalRecordCount>2
      ||pinned.selectedSourcesDigest!==pinInput.selection.selectedSourcesDigest
      ||pinned.finalModelContextDigest!==digest(pinInput.finalModelContext)
      ||call.providerKey!==OPENAI_SEYEON_STRUCTURED_PROVIDER_KEY_V1
      ||call.modelKey!==OFFLINE_MODEL
      ||call.purpose!=='turn_interpretation'
      ||typeof call.callId!=='string'||call.callId.length===0
      ||!Number.isSafeInteger(call.requestBodyBytes)
      ||call.requestBodyBytes!==Buffer.byteLength(requestBody,'utf8')) {
      throw new SeyeonR35OfflineWireHoldV1();
    }
    const expected=buildSeyeonTurnInterpreterRequestV2(pinInput.finalModelContext);
    // The exact field insertion/order is also significant: the same bytes
    // are subsequently passed verbatim to fetch by this Provider adapter.
    const expectedBytes=JSON.stringify({
      model:OFFLINE_MODEL,
      store:false,
      instructions:expected.instructions+'\n\n'+SEYEON_PROVIDER_UNTRUSTED_DATA_BOUNDARY_V1,
      input:[{
        role:'user',
        content:[{type:'input_text',text:JSON.stringify(expected.input)}],
      }],
      text:{format:{
        type:'json_schema',
        name:OFFLINE_FORMAT,
        strict:true,
        schema:expected.responseSchema,
      }},
    });
    if(requestBody!==expectedBytes)throw new SeyeonR35OfflineWireHoldV1();
    return wireDigest(requestBody);
  }catch{
    throw new SeyeonR35OfflineWireHoldV1();
  }
}

/**
 * This binder does NOT construct a Provider, and has NO access to fetch.
 * Only an audited/isolated synthetic harness supplies the actual Provider's
 * meteredBeforeDispatch wire bytes. It must unconditionally deny dispatch
 * whether this operation succeeds or fails. Audited Production Provider
 * callsites/roles are unchanged.
 *
 * Existing named-disposable R20 original Grant/Record locks, immutable Pin,
 * payload readback and COMMIT finish BEFORE wire attestation is returned.
 * This receipt is a test observation, never permission for actual dispatch.
 */
export async function attestSeyeonR35OfflineWireAfterDbPinV1(input:{
  readonly pinInput:PersistSeyeonR20OfflineDigestBoundInputV1;
  readonly call:Parameters<NonNullable<
    OpenAiSeyeonStructuredProviderConfigV1['meteredBeforeDispatch']
  >>[0];
  readonly requestBody:string;
}):Promise<SeyeonR35OfflineWireReceiptV1>{
  try {
    const pinned=await persistSeyeonR20OfflineDigestBoundPinV1(input.pinInput);
    const matched=assertSeyeonR35OfflineActualWireV1({
      pinned,pinInput:input.pinInput,call:input.call,
      requestBody:input.requestBody,
    });
    return Object.freeze({
      status:'disposable_db_pin_and_pre_dispatch_wire_attested' as const,
      attemptId:input.pinInput.attemptId,
      selectedSourcesDigest:pinned.selectedSourcesDigest,
      finalModelContextDigest:pinned.finalModelContextDigest,
      wireBodyDigest:matched,
      permitsProvider:false as const,
      permitsAtomicCommit:false as const,
      permitsHttpReveal:false as const,
    });
  }catch{
    throw new SeyeonR35OfflineWireHoldV1();
  }
}
