export type AdminSection =
  | 'overview'
  | 'users'
  | 'commerce'
  | 'readings'
  | 'analytics'
  | 'issues';

export interface AdminRoute {
  readonly section: AdminSection;
  readonly path: string;
  readonly label: string;
  readonly heading: string;
  readonly description: string;
  readonly shortLabel: string;
}

export const adminRoutes: readonly AdminRoute[] = [
  {
    section: 'overview',
    path: '/admin',
    label: '운영 개요',
    heading: '운영 개요',
    description: '사용자와 서비스 운영 상태를 한곳에서 확인합니다.',
    shortLabel: '01',
  },
  {
    section: 'users',
    path: '/admin/users',
    label: '사용자',
    heading: '사용자 관리',
    description: '계정과 가입 상태, 권한 및 이용 내역을 조회합니다.',
    shortLabel: '02',
  },
  {
    section: 'commerce',
    path: '/admin/commerce',
    label: '결제 · 크레딧',
    heading: '결제 및 크레딧',
    description: '검증된 결제와 크레딧 원장의 상태를 확인합니다.',
    shortLabel: '03',
  },
  {
    section: 'readings',
    path: '/admin/readings',
    label: '사주 · AI',
    heading: '사주 및 AI 운영',
    description: 'Reading 실행과 AI 비용 및 오류를 관측합니다.',
    shortLabel: '04',
  },
  {
    section: 'analytics',
    path: '/admin/analytics',
    label: '베타 분석',
    heading: '베타 분석',
    description: '유입·전환 지표의 이벤트 계약과 실제 측정 가능 여부를 확인합니다.',
    shortLabel: '05',
  },
  {
    section: 'issues',
    path: '/admin/issues',
    label: '운영 이슈',
    heading: '운영 이슈',
    description: '운영 장애와 조치 필요 항목을 추적합니다.',
    shortLabel: '06',
  },
];

export function normalizeAdminPath(pathname: string): string {
  if (!pathname.startsWith('/')) return '';
  if (pathname === '/admin/') return '/admin';
  return pathname.length > 1 ? pathname.replace(/\/+$/u, '') : pathname;
}

export function getAdminRoute(pathname: string): AdminRoute | null {
  const path = normalizeAdminPath(pathname);
  return adminRoutes.find((route) => route.path === path) ?? null;
}
