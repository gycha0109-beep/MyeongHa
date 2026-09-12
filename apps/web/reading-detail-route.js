const SCOPE_ALIASES = Object.freeze({
  original: 'original',
  natal: 'original',
  year: 'year',
  yearly: 'year',
  month: 'month',
  monthly: 'month',
});

const SCOPE_LABELS = Object.freeze({
  original: '원국',
  year: '올해',
  month: '이번 달',
});

const TOPIC_ROUTES = Object.freeze({
  temperament: Object.freeze({ label: '전체 사주', scopes: Object.freeze(['original']) }),
  career: Object.freeze({ label: '직업 · 커리어', scopes: Object.freeze(['original', 'year', 'month']) }),
  money: Object.freeze({ label: '재물', scopes: Object.freeze(['original', 'year', 'month']) }),
  love: Object.freeze({ label: '연애 · 관계', scopes: Object.freeze(['original']) }),
  business: Object.freeze({ label: '사업', scopes: Object.freeze(['original', 'year', 'month']) }),
  family: Object.freeze({ label: '가족', scopes: Object.freeze(['original']) }),
  'life-stage': Object.freeze({ label: '삶의 단계', scopes: Object.freeze(['original']) }),
  spouse: Object.freeze({ label: '배우자 · 관계', scopes: Object.freeze(['original']) }),
  compatibility: Object.freeze({ label: '궁합', scopes: Object.freeze(['original']) }),
  'question-specific': Object.freeze({ label: '지금 고민으로 보기', scopes: Object.freeze(['original']) }),
});

function normalizeToken(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function invalidRoute(reason, requestedTopic, requestedScope) {
  return Object.freeze({
    valid: false,
    reason,
    requestedTopic: requestedTopic || null,
    requestedScope: requestedScope || null,
  });
}

function validRoute(topic, scope, label) {
  return Object.freeze({
    valid: true,
    topic,
    scope,
    label,
    scopeLabel: SCOPE_LABELS[scope],
    routeKey: `${topic}:${scope}`,
  });
}

/**
 * Resolve only the web product surface route identity.
 *
 * This is deliberately not a Saju ReadingIntent/Product mapper. Semantic intent,
 * profile selection, claims, evidence, and narrative authority remain owned by
 * the governed Saju Product Reading runtime.
 */
export function resolveReadingDetailRoute(search) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  const requestedTopic = normalizeToken(params.get('topic'));
  const requestedScope = normalizeToken(params.get('scope'));

  if (!requestedTopic) {
    if (!requestedScope) return invalidRoute('missing_route', requestedTopic, requestedScope);
    const scope = SCOPE_ALIASES[requestedScope];
    if (scope === 'year') return validRoute('general', 'year', '올해');
    if (scope === 'month') return validRoute('general', 'month', '이번 달');
    return invalidRoute('unsupported_scope', requestedTopic, requestedScope);
  }

  const topicRoute = TOPIC_ROUTES[requestedTopic];
  if (!topicRoute) return invalidRoute('unsupported_topic', requestedTopic, requestedScope);

  const scope = requestedScope ? SCOPE_ALIASES[requestedScope] : 'original';
  if (!scope) return invalidRoute('unsupported_scope', requestedTopic, requestedScope);
  if (!topicRoute.scopes.includes(scope)) {
    return invalidRoute('unsupported_combination', requestedTopic, requestedScope || scope);
  }

  return validRoute(requestedTopic, scope, topicRoute.label);
}
