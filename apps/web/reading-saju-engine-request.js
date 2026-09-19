/**
 * Product-route -> Saju public ProductHost request projection.
 *
 * This module does not decide Saju meaning. It serializes the existing MyeongHa
 * product-route identity into the exact frozen consumer grammar currently owned
 * by gycha0109-beep/Saju's Consumer Reading Request Adapter.
 */
export const SAJU_CONSUMER_READING_ADAPTER_VERSION =
  'myeonghwa-consumer-reading-request-adapter-v2';

export const SAJU_BUTTON_REQUEST_MAPPING_VERSION =
  'myeongha-saju-button-request-v1';

const MAX_READING_TEXT_LENGTH = 200;

function invalid(reason) {
  return Object.freeze({ state: 'invalid', reason });
}

function requiresInput(domain, input) {
  return Object.freeze({
    state: 'requires_input',
    domain,
    input,
    adapterVersion: SAJU_CONSUMER_READING_ADAPTER_VERSION,
    mappingVersion: SAJU_BUTTON_REQUEST_MAPPING_VERSION,
  });
}

function ready(domain, readingText, targetPersonRef) {
  const normalizedText = readingText.trim();
  if (normalizedText.length === 0 || normalizedText.length > MAX_READING_TEXT_LENGTH) {
    return invalid('reading_text_out_of_bounds');
  }

  return Object.freeze({
    state: 'ready',
    domain,
    readingText: normalizedText,
    ...(targetPersonRef === undefined ? {} : { targetPersonRef }),
    adapterVersion: SAJU_CONSUMER_READING_ADAPTER_VERSION,
    mappingVersion: SAJU_BUTTON_REQUEST_MAPPING_VERSION,
  });
}

function temporalText(scope, natalText) {
  if (scope === 'original') return natalText;
  if (scope === 'year') return `올해 ${natalText}`;
  if (scope === 'month') return `이번 달 ${natalText}`;
  return null;
}

export function resolveSajuButtonEngineRequest(route, context = {}) {
  if (!route || route.valid !== true) return invalid('invalid_product_route');

  switch (route.topic) {
    case 'temperament':
      return route.scope === 'original'
        ? ready('general', '전체 사주')
        : invalid('unsupported_route_scope');

    case 'general':
      if (route.scope === 'year') return ready('general', '올해 운세');
      if (route.scope === 'month') return ready('general', '이번 달 운세');
      return invalid('unsupported_route_scope');

    case 'career': {
      const text = temporalText(route.scope, '직업운');
      return text === null ? invalid('unsupported_route_scope') : ready('career', text);
    }

    case 'money': {
      const text = temporalText(route.scope, '재물운');
      return text === null ? invalid('unsupported_route_scope') : ready('wealth', text);
    }

    case 'love':
      return route.scope === 'original'
        ? ready('relationship', '연애운')
        : invalid('unsupported_route_scope');

    case 'business': {
      const text = temporalText(route.scope, '사업운');
      return text === null ? invalid('unsupported_route_scope') : ready('business', text);
    }

    case 'family':
      if (route.scope !== 'original') return invalid('unsupported_route_scope');
      if (context.familyScope === 'parents') return ready('family', '부모운');
      if (context.familyScope === 'children') return ready('family', '자녀운');
      return requiresInput('family', 'family_scope');

    case 'life-stage':
      return route.scope === 'original'
        ? ready('life_stage', '인생 흐름')
        : invalid('unsupported_route_scope');

    case 'spouse':
      return route.scope === 'original'
        ? ready('relationship', '배우자운')
        : invalid('unsupported_route_scope');

    case 'compatibility': {
      if (route.scope !== 'original') return invalid('unsupported_route_scope');
      const targetPersonRef =
        typeof context.targetPersonRef === 'string' ? context.targetPersonRef.trim() : '';
      if (targetPersonRef.length === 0) return requiresInput('compatibility', 'target_person');
      return ready('compatibility', '궁합', targetPersonRef);
    }

    case 'question-specific': {
      if (route.scope !== 'original') return invalid('unsupported_route_scope');
      const question = typeof context.question === 'string' ? context.question.trim() : '';
      if (question.length === 0) return requiresInput('question_specific', 'question');
      return ready('question_specific', `질문: ${question}`);
    }

    default:
      return invalid('unsupported_product_topic');
  }
}
