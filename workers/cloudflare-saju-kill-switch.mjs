// Production Cloudflare Saju-only emergency kill switch.
// This controls BOTH calculation and preview-reading; it is independent of
// the broader MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD (Auth/DB/OAuth).
// Absent / explicit 'false' preserve the separately governed mode approvals.
// Exact 'true', malformed values and inaccessible bindings all deny dispatch.
// Watchtower-Track: ops

export const CLOUDFLARE_SAJU_KILL_SWITCH_BINDING_V1 =
  'MYEONGHA_CLOUDFLARE_SAJU_KILL_SWITCH';

export function isCloudflareSajuKilledV1(bindings) {
  try {
    const flag = bindings?.[CLOUDFLARE_SAJU_KILL_SWITCH_BINDING_V1];
    // Fail closed on any explicitly malformed value, without secrets.
    return flag !== undefined && flag !== 'false';
  } catch {
    return true;
  }
}
