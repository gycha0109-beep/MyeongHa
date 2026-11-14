import { MyeongHaApiClientV1 } from '../../../../packages/api-client/src/http.js';
import { readApprovedSajuPurchaseReadingsV1 } from '../../../../packages/api-client/src/records.js';
import { listTargetPersonsV1 } from '../../../../packages/api-client/src/target-persons.js';
import { APPROVED_SAJU_SANDBOX_ROUTES_V1 as ROUTES } from '../../../../packages/contracts/src/approved-saju-sandbox-routes.js';
import type { ApprovedSajuCheckoutPanelPorts } from './approved-saju-sandbox-checkout.js';
import type { PaymentAttemptHandoffFetchPortV1 } from './payment-attempt-browser-handoff-transport.js';
import type { PortOneV2BrowserSdkPortV1 } from './portone-v2-browser-handoff.js';

type Channel = ApprovedSajuCheckoutPanelPorts['channel'];

function parseChannel(value: unknown): Channel | null {
  if (!value || typeof value !== 'object' || !('ok' in value) || value.ok !== true || !('data' in value)) return null;
  const data = value.data;
  if (!data || typeof data !== 'object' || Object.keys(data).length !== 3
    || !('environment' in data) || data.environment !== 'sandbox'
    || !('storeId' in data) || typeof data.storeId !== 'string'
    || !/^store-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(data.storeId)
    || !('channelKey' in data) || typeof data.channelKey !== 'string'
    || !/^channel-key-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(data.channelKey)) return null;
  return { environment: 'sandbox', storeId: data.storeId, channelKey: data.channelKey };
}

function currentSdk() {
  const sdk = (window as Window & { PortOne?: PortOneV2BrowserSdkPortV1 }).PortOne;
  return typeof sdk?.requestPayment === 'function' ? sdk : undefined;
}

async function loadSdk(): Promise<PortOneV2BrowserSdkPortV1 | undefined> {
  const sdk = currentSdk();
  if (sdk !== undefined) return sdk;
  return new Promise(resolve => {
    const script = document.createElement('script');
    script.src = '/owner-portone-sdk-v2.js';
    script.onload = () => resolve(currentSdk());
    script.onerror = () => resolve(undefined);
    document.head.appendChild(script);
  });
}

/** Used by the web entry only after the member's sandbox access is confirmed by the server. */
export async function loadApprovedSajuSandboxCheckoutPortsV1(
  memberToken: () => Promise<string>,
): Promise<ApprovedSajuCheckoutPanelPorts | null> {
  try {
    const token = await memberToken();
    const response = await fetch(ROUTES.access, {
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
      credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    });
    if (!response.ok) return null;
    const channel = parseChannel(await response.json());
    if (channel === null) return null;
    const client = new MyeongHaApiClientV1({ origin: window.location.origin });
    const [targets, sdk] = await Promise.all([
      listTargetPersonsV1(client, token).catch(() => []),
      loadSdk(),
    ]);
    await memberToken();
    if (sdk === undefined) return null;

    const post = (path: string): PaymentAttemptHandoffFetchPortV1 => ({
      async fetch(input) {
        const token = await memberToken();
        return fetch(path, {
          ...input, headers: { ...input.headers, Authorization: 'Bearer ' + token },
          credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        });
      },
    });
    return {
      channel,
      targets: targets.map((target, index) => ({
        id: target.targetPersonId, label: target.displayLabel ?? target.relationshipLabel ?? `저장한 상대 ${index + 1}`,
      })),
      sdk: { async requestPayment(input) { await memberToken(); return sdk.requestPayment(input); } },
      orders: post(ROUTES.order), attempts: post(ROUTES.attempt),
      handoff: post(ROUTES.handoff), verification: post(ROUTES.verify),
      async readArchive(purchaseIntentId) {
        const readings = await readApprovedSajuPurchaseReadingsV1(
          client, await memberToken(), purchaseIntentId,
        );
        await memberToken();
        return readings;
      },
    };
  } catch {
    return null;
  }
}
