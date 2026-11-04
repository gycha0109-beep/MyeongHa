/**
 * Only author-controlled My-screen error states may be converted into the
 * longer, pre-translated static UX copy. Do not translate runtime/server errors.
 */
export function mobileMySectionStaticErrorV1(message: string): string | null {
  if (message === '현재 내 정보를 불러올 수 없습니다.') {
    return '현재 내 정보를 불러올 수 없습니다. 확인되지 않은 계정 정보를 대신 표시하지 않습니다.';
  }
  if (message === '현재 출생정보를 불러올 수 없습니다.') {
    return '현재 출생 정보를 불러올 수 없습니다. 확인되지 않은 값을 대신 표시하지 않습니다.';
  }
  return null;
}
