// Explicit Cloudflare API path inventory and deny-first dispatcher metadata.
// Route metadata is NEVER an upstream URL or permission to invoke a Vercel API.
// Cloudflare owns this allowlisted route inventory independently of the Vercel standby. No network, auth, DB, or secret access here.
// Watchtower-Track: ops

export const CLOUDFLARE_DIRECT_API_ROUTES = Object.freeze([
  Object.freeze({ id: "api.health", path: "/api/health" }),
  Object.freeze({ id: "api.readiness", path: "/api/readiness" }),
  Object.freeze({ id: "api.session.bootstrap", path: "/api/session/bootstrap" }),
  Object.freeze({ id: "api.auth.sign-in", path: "/api/auth/sign-in" }),
  Object.freeze({ id: "api.auth.sign-up", path: "/api/auth/sign-up" }),
  Object.freeze({ id: "api.auth.sign-out", path: "/api/auth/sign-out" }),
  Object.freeze({ id: "api.auth.refresh", path: "/api/auth/refresh" }),
  Object.freeze({ id: "api.auth.promote-guest", path: "/api/auth/promote-guest" }),
  Object.freeze({ id: "api.birth-profiles", path: "/api/birth-profiles" }),
  Object.freeze({ id: "api.me", path: "/api/me" }),
  Object.freeze({ id: "api.me.birth-profile", path: "/api/me/birth-profile" }),
  Object.freeze({ id: "api.me.saju.calculation", path: "/api/me/saju/calculation" }),
]);

export const CLOUDFLARE_REWRITE_ROUTES = Object.freeze([
  Object.freeze({ id: "rewrite.naver.authorize", source: "/api/auth/social/naver/authorize", destination: "/api/auth/sign-in?__myeongha_naver_oauth_bridge=authorize" }),
  Object.freeze({ id: "rewrite.naver.callback", source: "/api/auth/social/naver/callback", destination: "/api/auth/sign-in?__myeongha_naver_oauth_bridge=callback" }),
  Object.freeze({ id: "rewrite.naver.token", source: "/api/auth/social/naver/token", destination: "/api/auth/sign-in?__myeongha_naver_oauth_bridge=token" }),
  Object.freeze({ id: "rewrite.naver.userinfo", source: "/api/auth/social/naver/userinfo", destination: "/api/auth/sign-in?__myeongha_naver_oauth_bridge=userinfo" }),
  Object.freeze({ id: "rewrite.social.start", source: "/api/auth/social/start", destination: "/api/auth/sign-in?__myeongha_social_auth_start=1" }),
  Object.freeze({ id: "rewrite.contact.inquiry", source: "/api/contact", destination: "/api/me?__myeongha_contact_inquiry=1" }),
  Object.freeze({ id: "rewrite.chat.credit-wallet", source: "/api/me/credits", destination: "/api/me?__myeongha_chat_credit_wallet=1" }),
  Object.freeze({ id: "rewrite.commerce.owner-sandbox-checkout", source: "/api/me/credits/portone/test-checkout", destination: "/api/me?__myeongha_portone_owner_sandbox_checkout=1" }),
  Object.freeze({ id: "rewrite.commerce.owner-sandbox-prepare", source: "/api/me/credits/portone/test-prepare", destination: "/api/me?__myeongha_portone_owner_sandbox_prepare=1" }),
  Object.freeze({ id: "rewrite.commerce.owner-sandbox-verify", source: "/api/me/credits/portone/test-verify", destination: "/api/me?__myeongha_portone_owner_sandbox_verify=1" }),
  Object.freeze({ id: "rewrite.saju.preview", source: "/api/me/saju/preview-reading", destination: "/api/me?__myeongha_saju_preview_reading=1" }),
  Object.freeze({ id: "rewrite.chat.open", source: "/api/chat", destination: "/api/me?__myeongha_chat_open=1" }),
  Object.freeze({ id: "rewrite.chat.turns", source: "/api/chat/:threadId/turns", destination: "/api/me?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id=:threadId" }),
  Object.freeze({ id: "rewrite.chat.thread", source: "/api/chat/:threadId", destination: "/api/me?__myeongha_chat_thread_id=:threadId" }),
  Object.freeze({ id: "rewrite.life-record", source: "/api/life-record", destination: "/api/me?__myeongha_records_read=life-record" }),
  Object.freeze({ id: "rewrite.readings", source: "/api/readings", destination: "/api/me?__myeongha_records_read=readings" }),
  Object.freeze({ id: "rewrite.seyeon.memory.grant.revoke", source: "/api/memories/:memoryItemId/grants/seyeon/revoke", destination: "/api/me?__myeongha_seyeon_memory_grant_revoke_id=:memoryItemId" }),
  Object.freeze({ id: "rewrite.seyeon.memory.grant.status", source: "/api/memories/:memoryItemId/grants/seyeon", destination: "/api/me?__myeongha_seyeon_memory_grant_status_id=:memoryItemId" }),
  Object.freeze({ id: "rewrite.memories", source: "/api/memories", destination: "/api/me?__myeongha_records_read=memories" }),
  Object.freeze({ id: "rewrite.birth-profile.id", source: "/api/birth-profiles/:id", destination: "/api/birth-profiles?__myeongha_birth_profile_id=:id" }),
  Object.freeze({ id: "rewrite.device.register", source: "/api/device-installations/register", destination: "/api/me?__myeongha_device_installation_action=register" }),
  Object.freeze({ id: "rewrite.device.revoke", source: "/api/device-installations/:id/revoke", destination: "/api/me?__myeongha_device_installation_action=revoke&__myeongha_device_installation_id=:id" }),
  Object.freeze({ id: "rewrite.target-persons", source: "/api/target-persons", destination: "/api/me?__myeongha_target_person_read=list" }),
  Object.freeze({ id: "rewrite.target-person.id", source: "/api/target-persons/:id", destination: "/api/me?__myeongha_target_person_read=detail&__myeongha_target_person_id=:id" }),
]);

const compiledRewrites = CLOUDFLARE_REWRITE_ROUTES.map(route => {
  const segments = route.source.split('/').map(segment => {
    if (segment.startsWith(':')) {
      const name = segment.slice(1);
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw Error('Invalid static route param');
      return '(?<' + name + '>[^/]+)';
    }
    if (!/^[A-Za-z0-9/-]*$/.test(segment)) throw Error('Unsafe static route segment');
    return segment;
  });
  return { route, pattern: new RegExp('^' + segments.join('/') + '$') };
});

export function matchCloudflareApiRoute(pathname) {
  if (typeof pathname !== 'string') return null;
  for (const route of CLOUDFLARE_DIRECT_API_ROUTES) {
    if (pathname === route.path) return Object.freeze({ id: route.id, kind: 'direct', params: Object.freeze({}) });
  }
  for (const { route, pattern } of compiledRewrites) {
    const matched = pattern.exec(pathname);
    if (matched) {
      // Match only. Never decode, interpolate, redirect, proxy, or trust marker query params.
      return Object.freeze({
        id: route.id,
        kind: 'rewrite',
        params: Object.freeze({ ...matched.groups }),
      });
    }
  }
  return null;
}
