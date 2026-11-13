import type { ApprovedSajuReaderConsultationFactoryV1 } from './approved-saju-reader-followup-postgres-v1.js';
import {
  createOpenAiSajuConsultationShadowPortV1,
  type OpenAiSajuConsultationShadowConfigV1,
} from './openai-saju-consultation-shadow-port-v1.js';
import {
  createReaderSajuConsultationBudgetGateV1,
  type ReaderSajuConsultationBudgetGateInputV1,
} from './reader-saju-consultation-budget-gate-v1.js';

/** The host supplies a durable budget authority and an approved rate card. */
export function createApprovedSajuReaderOpenAiConsultationV1(input: Readonly<{
  provider: Pick<OpenAiSajuConsultationShadowConfigV1,
    'apiKey' | 'generationModel' | 'reviewModel' | 'timeoutMs' | 'fetchImpl'>;
  budget: Pick<ReaderSajuConsultationBudgetGateInputV1,
    'allowedModels' | 'authority' | 'totalEvaluationLimitMicroUsd'>;
}>): ApprovedSajuReaderConsultationFactoryV1 {
  const { provider, budget } = input;
  const allowedModels = Object.freeze(budget.allowedModels.map(quote => Object.freeze({ ...quote })));
  for (const modelKey of [provider.generationModel, provider.reviewModel]) {
    if (!allowedModels.some(quote => quote.modelKey === modelKey)) {
      throw new Error('Purchased Reader model requires an approved rate card.');
    }
  }
  const config = Object.freeze({ ...provider });
  const budgetConfig = Object.freeze({ ...budget, allowedModels, maximumCalls: 2 });
  return scope => {
    const gate = createReaderSajuConsultationBudgetGateV1({ ...budgetConfig, ...scope });
    return createOpenAiSajuConsultationShadowPortV1({
      ...config, ...gate, multiUnitPilot: true,
    });
  };
}
