// Watchtower-Track: security
// Owner-scoped lifecycle is the authority; a filtered active-grant absence
// must never be interpreted as completed withdrawal.
const STATES = new Set(['active', 'withdrawal_pending', 'not_granted', 'unknown']);

export function presentSeyeonMemoryGrantStatusV1(grantState, withdrawalPending) {
  if (!STATES.has(grantState) || typeof withdrawalPending !== 'boolean') {
    throw new Error('Authoritative Member Memory Grant lifecycle is required.');
  }
  if (grantState === 'withdrawal_pending') {
    return Object.freeze({
      kind: 'withdrawal_pending',
      revokeAvailable: false,
      message: '새로운 기억 사용은 차단됐으며 이전 응답의 수신 확인 후 철회 완료를 기다리고 있습니다.',
    });
  }
  if (grantState === 'unknown') {
    return Object.freeze({
      kind: 'unknown',
      revokeAvailable: false,
      message: withdrawalPending
        ? '새로운 기억 사용 차단 요청은 접수됐지만 현재 철회 완료 여부를 확인할 수 없습니다.'
        : '현재 기억 사용 권한이 확인되지 않았고 철회 완료 여부도 확인할 수 없습니다.',
    });
  }
  if (grantState === 'not_granted') {
    return Object.freeze({
      kind: 'no_access',
      revokeAvailable: false,
      message: '현재 세연의 접근 권한이 없습니다.',
    });
  }
  if (withdrawalPending) {
    return Object.freeze({
      kind: 'unknown',
      revokeAvailable: false,
      message: '철회 대기와 현재 접근권한 정보가 일치하지 않습니다. 상태를 확인할 수 없습니다.',
    });
  }
  return Object.freeze({
    kind: 'granted',
    revokeAvailable: true,
    message: '현재 세연의 접근이 허용되어 있습니다.',
  });
}
