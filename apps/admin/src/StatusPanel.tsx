import type { ReactNode } from 'react';

export type StatusKind = 'loading' | 'empty' | 'forbidden' | 'error';

interface StatusPanelProps {
  readonly kind: StatusKind;
  readonly title?: string;
  readonly detail?: string;
  readonly action?: ReactNode;
}

const defaults: Record<StatusKind, { title: string; detail: string; symbol: string }> = {
  loading: {
    title: '불러오는 중입니다',
    detail: '요청한 정보를 확인하고 있습니다.',
    symbol: '…',
  },
  empty: {
    title: '표시할 데이터가 없습니다',
    detail: '운영자 인증 및 실제 조회 API가 연결되면 이곳에 표시됩니다.',
    symbol: '∅',
  },
  forbidden: {
    title: '접근 권한이 없습니다',
    detail: '관리자 권한이 확인되지 않았습니다. 이 페이지에서 운영 데이터를 볼 수 없습니다.',
    symbol: '!',
  },
  error: {
    title: '정보를 불러오지 못했습니다',
    detail: '요청을 완료할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    symbol: '×',
  },
};

export function StatusPanel({ kind, title, detail, action }: StatusPanelProps) {
  const content = defaults[kind];
  return (
    <section
      className={'status-panel status-panel--' + kind}
      role={kind === 'error' || kind === 'forbidden' ? 'alert' : 'status'}
      aria-live={kind === 'loading' ? 'polite' : 'off'}
      aria-busy={kind === 'loading'}
    >
      <span className="status-panel__symbol" aria-hidden="true">{content.symbol}</span>
      <h3>{title ?? content.title}</h3>
      <p>{detail ?? content.detail}</p>
      {action}
    </section>
  );
}
