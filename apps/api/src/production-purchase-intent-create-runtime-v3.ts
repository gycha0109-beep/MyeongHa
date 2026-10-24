import { randomUUID } from 'node:crypto';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';
import { createProductionPortOneVerifiedAgeAdmissionPortV1 } from './portone-v2-age-enforcement-activation-v1.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import { handlePurchaseIntentCreateRequestV3 } from './purchase-intent-create-http-v3.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

/**
 * Legal L4 sale admission is separate from verified-adult authority.
 * There is no trusted per-offer checkout notice, preview, delivery-proof or
 * refund-remedy binding. Enabling age verification must not enable sales.
 * Replacing this hold requires a Commerce/S7 server-owned, per-offer evidence
 * contract; an environment flag or client checkbox is not sufficient.
 */
export const LEGAL_DIGITAL_READING_PURCHASE_HOLD_V1 = Object.freeze({
  perOfferContractAndPriceNoticeVerified: false,
  preCheckoutPreviewOrInformationVerified: false,
  noticeAcknowledgementEvidenceVerified: false,
  deliveryAndRefundRemedyAuthorityVerified: false,
} as const);

function legalDigitalReadingPurchaseAdmittedV1(): boolean {
  return Object.values(LEGAL_DIGITAL_READING_PURCHASE_HOLD_V1).every((verified) => verified === true);
}

export interface ProductionPurchaseIntentCreateRequestV3 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
}

export interface ProductionPurchaseIntentCreateRuntimeV3 {
  handleRequest(input: ProductionPurchaseIntentCreateRequestV3): Promise<Response>;
  close(): Promise<void>;
}

export interface CreateProductionPurchaseIntentCreateRuntimeInputV3 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  readonly pool?: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}

/**
 * Production dependency composition for Purchase Intent v3.
 * This does not publish a Vercel/API route. Public checkout reachability remains
 * a separate reviewed activation step after the saleable Product/Capability gate.
 */
export function createProductionPurchaseIntentCreateRuntimeV3(
  input: CreateProductionPurchaseIntentCreateRuntimeInputV3,
): ProductionPurchaseIntentCreateRuntimeV3 {
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const poolLease = createProductionPostgresSubjectPoolLeaseV1({
    config,
    ...(input.pool === undefined ? {} : { pool: input.pool }),
  });
  const identityEvidenceVerifier = createProductionRequestIdentityVerifierV1({
    config,
    ...(input.memberFetchImpl === undefined ? {} : { memberFetchImpl: input.memberFetchImpl }),
  });
  const ageAdmissionPort = createProductionPortOneVerifiedAgeAdmissionPortV1({
    env: input.env,
    pool: poolLease.pool,
  });
  const idPort = Object.freeze({ nextPurchaseIntentId: randomUUID });

  return Object.freeze({
    handleRequest(requestInput: ProductionPurchaseIntentCreateRequestV3) {
      // Adult age verification alone is insufficient for a legal sale.
      if (
        requestInput.request.method === 'POST' &&
        (!legalDigitalReadingPurchaseAdmittedV1() || ageAdmissionPort === undefined)
      ) {
        return Promise.resolve(Response.json({
          ok: false,
          error: {
            code: 'PURCHASE_UNAVAILABLE',
            messageKey: 'commerce.purchase_unavailable',
            retryable: false,
          },
        }, { status: 503, headers: { 'Cache-Control': 'no-store' } }));
      }
      return handlePurchaseIntentCreateRequestV3({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityEvidenceVerifier,
        pool: poolLease.pool,
        idPort,
        ...(ageAdmissionPort === undefined ? {} : { ageAdmissionPort }),
      });
    },
    close() {
      return poolLease.close();
    },
  });
}
