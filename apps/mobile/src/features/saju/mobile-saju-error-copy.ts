import type { MobileUiLocale } from '../../ui/mobile-ui-copy.js';
import type { MobileSajuLoadStateV1 } from './mobile-saju-loader.js';

type MobileSajuFailureKindV1 = Extract<MobileSajuLoadStateV1, { retryable: boolean }>['kind'];

/**
 * Fixed, client-authored error guidance only. The failure category and retry
 * eligibility come from the existing source-authoritative Saju loader.
 * Never localize server response bodies, Birth facts, or official readings.
 */
const MOBILE_SAJU_ERROR_COPY_V1: Readonly<
  Record<MobileSajuFailureKindV1, Readonly<Record<MobileUiLocale, string>>>
> = Object.freeze({
  auth_error: Object.freeze({
    'ko-KR': '세션을 다시 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    'ja-JP': 'セッションを再確認できませんでした。しばらくしてからもう一度お試しください。',
    'zh-TW': '無法重新確認工作階段，請稍後再試。',
    'en-US': 'We could not verify your session again. Please try again later.',
    'zh-CN': '无法重新验证会话，请稍后重试。',
  }),
  saju_unavailable: Object.freeze({
    'ko-KR': '현재 명식 계산 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    'ja-JP': '現在、命式計算サービスを利用できません。しばらくしてからもう一度お試しください。',
    'zh-TW': '目前無法使用命盤計算服務，請稍後再試。',
    'en-US': 'The birth chart calculation service is currently unavailable. Please try again later.',
    'zh-CN': '当前无法使用命盘计算服务，请稍后重试。',
  }),
  authority_mismatch: Object.freeze({
    'ko-KR': '출생정보는 등록되어 있지만 현재 명식과 연결하지 못했습니다.',
    'ja-JP': '出生情報は登録されていますが、現在の命式との照合ができませんでした。',
    'zh-TW': '出生資料已登錄，但無法與目前的命盤核對。',
    'en-US': 'Birth details are registered, but they could not be matched to the current birth chart.',
    'zh-CN': '出生信息已登记，但无法与当前命盘匹配。',
  }),
  error: Object.freeze({
    'ko-KR': '현재 사주 정보를 불러오지 못했습니다.',
    'ja-JP': '現在の四柱推命情報を読み込めませんでした。',
    'zh-TW': '無法載入目前的八字資料。',
    'en-US': 'We could not load your current Saju information.',
    'zh-CN': '无法加载当前的八字信息。',
  }),
});

export function mobileSajuErrorCopyV1(
  kind: MobileSajuFailureKindV1,
  locale: MobileUiLocale,
): string {
  return MOBILE_SAJU_ERROR_COPY_V1[kind][locale];
}
