// Stage 9 synthetic retries: only public, denied Preview endpoints.
// No users, accounts, valid tokens, payment receipts, AI model invocations
// or provider webhooks. Exact same POST body is reused for payment replay.
// Watchtower-Track: ops
const SYNTHETIC_AUTH_BODY = '{"synthetic":true}';
const SYNTHETIC_WEBHOOK_BODY = '{"synthetic":true,"receipt":"NOT_A_RECEIPT"}';

export const STAGE9_NEGATIVE_REPLAY_PROBES_V1 = Object.freeze([
  Object.freeze({
    id:'auth.sign-in.duplicate',
    path:'/api/auth/sign-in',
    expectedStatus:404,
    body:SYNTHETIC_AUTH_BODY,
  }),
  Object.freeze({
    id:'seyeon.turn-replay.duplicate',
    path:'/api/chat/synthetic-thread-id/turns?replay=1',
    expectedStatus:503,
    body:'',
  }),
  Object.freeze({
    id:'commerce.webhook.first',
    path:'/api/commerce/portone/webhook',
    expectedStatus:404,
    body:SYNTHETIC_WEBHOOK_BODY,
  }),
  Object.freeze({
    id:'commerce.webhook.duplicate',
    path:'/api/commerce/portone/webhook',
    expectedStatus:404,
    body:SYNTHETIC_WEBHOOK_BODY,
  }),
]);
export const STAGE9_NEGATIVE_REPLAY_FENCE_VALUES_V1 = Object.freeze(
  Object.fromEntries(STAGE9_NEGATIVE_REPLAY_PROBES_V1.map(({id,expectedStatus})=>
    [id,expectedStatus===503?'HOLD_503':'DENY_404'])),
);
