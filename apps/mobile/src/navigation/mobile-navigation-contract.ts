export const MOBILE_NAVIGATION_CONTRACT_VERSION = 'mobile-navigation-v1' as const;

export const MOBILE_PRIMARY_TABS = [
  'home',
  'reading',
  'chat',
  'records',
  'my',
] as const;

export type MobilePrimaryTab = (typeof MOBILE_PRIMARY_TABS)[number];

export const MOBILE_PRIMARY_TAB_LABELS = Object.freeze({
  home: '홈',
  reading: '사주',
  chat: '대화',
  records: '기록',
  my: '마이',
} satisfies Record<MobilePrimaryTab, string>);

export const MOBILE_PRIMARY_TAB_ROUTES = Object.freeze({
  home: '/',
  reading: '/reading',
  chat: '/chat',
  records: '/records',
  my: '/my',
} satisfies Record<MobilePrimaryTab, string>);

export const MOBILE_READING_SUBTABS = ['saju', 'face'] as const;

export type MobileReadingSubtab = (typeof MOBILE_READING_SUBTABS)[number];

export const MOBILE_READING_DEFAULT_SUBTAB: MobileReadingSubtab = 'saju';

export const MOBILE_READING_SUBTAB_ROUTES = Object.freeze({
  saju: '/reading',
  face: '/reading/face',
} satisfies Record<MobileReadingSubtab, string>);

export function resolveMobileReadingSubtab(pathname: string): MobileReadingSubtab {
  return pathname === MOBILE_READING_SUBTAB_ROUTES.face || pathname.startsWith('/reading/face/')
    ? 'face'
    : MOBILE_READING_DEFAULT_SUBTAB;
}

export function resolveMobilePrimaryTab(pathname: string): MobilePrimaryTab {
  if (pathname === '/reading' || pathname.startsWith('/reading/')) return 'reading';
  if (pathname === '/chat' || pathname.startsWith('/chat/')) return 'chat';
  if (pathname === '/records' || pathname.startsWith('/records/')) return 'records';
  if (pathname === '/my' || pathname.startsWith('/my/')) return 'my';
  return 'home';
}

export function primaryTabReselectTarget(tab: MobilePrimaryTab): string {
  return MOBILE_PRIMARY_TAB_ROUTES[tab];
}
