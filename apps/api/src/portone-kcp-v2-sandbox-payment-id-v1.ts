// Watchtower-Track: commerce-payment
// NHN KCP V2 limits paymentId to 40 ASCII characters.
// Preserve the legacy provider-neutral 71-character derivation for historical
// Payment Attempt idempotency. Only NEW PortOne KCP attempts use this variant.
import {createHash} from 'node:crypto';

export const PORTONE_KCP_V2_PAYMENT_ID_V1=Object.freeze({
  provider:'portone_v2',
  pgProvider:'kcp_v2',
  version:'portone-kcp-v2-payment-id-v1',
  prefix:'mha_pa_',
  hashHexCharacters:32,
  maxLength:40,
  sandboxOnly:true,
} as const);

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const IDEMPOTENCY=/^[A-Za-z0-9_-]{8,128}$/u;

/**
 * Derive an opaque, replay-stable 128-bit payment identity for NEW KCP V2
 * sandbox Purchase Intents. Historical derivation is not rewritten, and
 * existing paid provider IDs are never silently changed or truncated.
 */
export function derivePortOneKcpV2SandboxPaymentIdV1(input:Readonly<{
  purchaseIntentId:string;
  idempotencyKey:string;
}>):string{
  if(!input||typeof input.purchaseIntentId!=='string'||
     !UUID.test(input.purchaseIntentId)||
     typeof input.idempotencyKey!=='string'||
     !IDEMPOTENCY.test(input.idempotencyKey)){
    throw new Error('Invalid KCP V2 server-owned Payment Attempt derivation input.');
  }
  const digest=createHash('sha256')
    .update('myeongha:portone-kcp-v2-sandbox-payment:v1\0')
    .update(input.purchaseIntentId.toLowerCase())
    .update('\0')
    .update(input.idempotencyKey)
    .digest('hex');
  return 'mha_pa_'+digest.slice(0,32);
}
