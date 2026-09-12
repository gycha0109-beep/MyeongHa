const READINESS_ENDPOINT = '/api/readiness';
const BLOCKED_BY_AUTHORITY = 'blocked_by_authority';
const UNAVAILABLE = 'unavailable';

export function resolveProductReadingDisplayState(payload) {
  const capabilities = payload && typeof payload === 'object' ? payload.capabilities : null;
  const capability = capabilities && typeof capabilities === 'object'
    ? capabilities.sajuProductReading
    : null;

  return capability === BLOCKED_BY_AUTHORITY ? BLOCKED_BY_AUTHORITY : UNAVAILABLE;
}

export async function readProductReadingDisplayState(fetchImpl = fetch) {
  try {
    const response = await fetchImpl(READINESS_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    });

    if (!response?.ok) return UNAVAILABLE;

    let payload;
    try {
      payload = await response.json();
    } catch {
      return UNAVAILABLE;
    }

    return resolveProductReadingDisplayState(payload);
  } catch {
    return UNAVAILABLE;
  }
}

export function renderProductReadingDisplayState(root, state) {
  const normalized = state === BLOCKED_BY_AUTHORITY ? BLOCKED_BY_AUTHORITY : UNAVAILABLE;
  if (root?.documentElement) root.documentElement.dataset.productReadingState = normalized;

  for (const chip of root?.querySelectorAll?.('[data-product-reading-chip]') ?? []) {
    chip.textContent = '준비 중';
    chip.dataset.productReadingState = normalized;
    chip.classList.remove('is-green');
  }
}

export async function syncProductReadingDisplayState({ root = document, fetchImpl = fetch } = {}) {
  const state = await readProductReadingDisplayState(fetchImpl);
  renderProductReadingDisplayState(root, state);
  return state;
}

if (typeof document !== 'undefined' && typeof fetch === 'function') {
  void syncProductReadingDisplayState();
}
