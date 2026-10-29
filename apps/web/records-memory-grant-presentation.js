export function presentSeyeonMemoryGrantStatusV1(currentlyGranted, withdrawalPending) {
  if (typeof currentlyGranted !== 'boolean' || typeof withdrawalPending !== 'boolean') {
    throw new Error('Current Member Memory Grant state is required.');
  }
  if (withdrawalPending) {
    return Object.freeze({
      kind: 'withdrawal_pending',
      revokeAvailable: false,
      message: currentlyGranted
        ? '철회 요청 이후 현재 권한 조회가 일치하지 않습니다. 철회 완료 여부를 확인할 수 없습니다.'
        : '새로운 기억 사용은 차단되었습니다. 철회 요청은 접수됐지만 최종 완료는 아직 확인되지 않았습니다.',
    });
  }
  return Object.freeze(currentlyGranted
    ? {kind: 'granted', revokeAvailable: true, message: '현재 세연의 접근이 허용되어 있습니다.'}
    : {kind: 'no_access', revokeAvailable: false, message: '현재 세연의 접근 권한이 없습니다.'});
}
