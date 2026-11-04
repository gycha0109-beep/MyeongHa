import type { MobileUiLocale } from '../../ui/mobile-ui-copy.js';

/** Informational document outline only, authored to match the current Web Saju report example.
 * Not a personal Reading, not generated, not a sale, and never a server entitlement.
 */
export const MOBILE_SAJU_REPORT_OUTLINE_COPY_V1 = Object.freeze({
  "heading": { "ko-KR": "보고서 구성 미리보기", "ja-JP": "レポート構成のプレビュー", "zh-TW": "報告結構預覽", "en-US": "Report structure preview", "zh-CN": "报告结构预览" },
  "example": { "ko-KR": "구성 예시", "ja-JP": "構成例", "zh-TW": "結構範例", "en-US": "Example structure", "zh-CN": "结构示例" },
  "description": { "ko-KR": "공식 보고서는 구매한 상품의 해석 범위에 따라 목차와 근거가 구성됩니다. 이 영역은 실제 개인별 결과가 아닌 문서 구성 안내입니다.", "ja-JP": "正式レポートの目次と根拠は購入した商品の鑑定範囲に応じて構成されます。ここは個人の結果ではなく文書構成の案内です。", "zh-TW": "正式報告的目錄與依據將依購買商品的解讀範圍組成。此處僅為文件結構示例，並非個人解讀結果。", "en-US": "The official report's sections and supporting details depend on the purchased reading. This is a document outline, not a personal result.", "zh-CN": "正式报告的目录与依据取决于所购买商品的解读范围。此处仅为文档结构说明，并非个人结果。" },
  "notResult": { "ko-KR": "공식 보고서 구성 예시. 개인별 해석이 아닙니다.", "ja-JP": "正式レポートの構成例です。個人向け鑑定ではありません。", "zh-TW": "正式報告結構範例，並非個人化解讀。", "en-US": "Example official report structure; not a personal interpretation.", "zh-CN": "正式报告结构示例，并非个人解读。" },
  "chapter": { "ko-KR": "1. 핵심 해석 및 명식 근거", "ja-JP": "1. 主要な解釈と命式の根拠", "zh-TW": "1. 核心解讀與命盤依據", "en-US": "1. Key findings and chart evidence", "zh-CN": "1. 核心解读与命盘依据" },
  "contents": { "ko-KR": "개인별 공식 해석 · 주제별 상세 내용 · 근거와 한계 · 발행 버전 · 기록 재열람", "ja-JP": "個別の正式鑑定・テーマ別の詳細・根拠と限界・発行版・記録の再閲覧", "zh-TW": "個人正式解讀・主題細節・依據與限制・發行版本・紀錄重閱", "en-US": "Personal reading · Topic details · Evidence and limits · Report version · Reopen saved records", "zh-CN": "个人正式解读 · 主题详情 · 依据与限制 · 发布版本 · 记录重读" },
});

export function mobileSajuReportOutlineCopyV1(locale: MobileUiLocale) {
  return Object.freeze({
    heading: MOBILE_SAJU_REPORT_OUTLINE_COPY_V1.heading[locale],
    example: MOBILE_SAJU_REPORT_OUTLINE_COPY_V1.example[locale],
    description: MOBILE_SAJU_REPORT_OUTLINE_COPY_V1.description[locale],
    notResult: MOBILE_SAJU_REPORT_OUTLINE_COPY_V1.notResult[locale],
    chapter: MOBILE_SAJU_REPORT_OUTLINE_COPY_V1.chapter[locale],
    contents: MOBILE_SAJU_REPORT_OUTLINE_COPY_V1.contents[locale],
  });
}
