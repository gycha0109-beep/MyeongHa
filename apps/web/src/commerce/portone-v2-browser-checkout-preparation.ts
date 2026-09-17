import {
  projectPortOneV2BrowserPaymentCoreV1,
  type PaymentAttemptBrowserHandoffContextV1,
  type PortOneV2ProviderSelectorV1,
} from './portone-v2-browser-handoff.js';
import {
  composePortOneV2BrowserPaymentRequestV1,
  type PortOneV2BrowserPaymentRequestV1,
  type PortOneV2DeferredActivationFieldsV1,
} from './portone-v2-browser-request-composer.js';

export const PORTONE_V2_BROWSER_CHECKOUT_PREPARATION_V1 = Object.freeze({
  active: false,
  publicRoute: null,
  sdkInvocationEnabled: false,
  liveEnvironmentEnabled: false,
  sdkPortAccepted: false,
} as const);

/**
 * Composes the already-governed browser handoff projection and deferred
 * activation slots into an inert PortOne request. The function deliberately
 * exposes no SDK execution port and performs no network or SDK call.
 */
export function preparePortOneV2BrowserCheckoutV1(input: {
  readonly context: PaymentAttemptBrowserHandoffContextV1;
  readonly providerSelector: PortOneV2ProviderSelectorV1;
  readonly activation: PortOneV2DeferredActivationFieldsV1;
}): PortOneV2BrowserPaymentRequestV1 {
  const core = projectPortOneV2BrowserPaymentCoreV1({
    context: input.context,
    providerSelector: input.providerSelector,
  });

  return composePortOneV2BrowserPaymentRequestV1({
    core,
    activation: input.activation,
  });
}
