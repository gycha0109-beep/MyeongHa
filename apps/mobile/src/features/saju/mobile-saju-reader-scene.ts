import {
  MOBILE_SAJU_TOPIC_SECTIONS_V1,
  type MobileSajuTopicV1,
} from './mobile-saju-topic-catalog.js';

export interface MobileSajuSceneAdmissionV1 {
  readonly readerId: 'seyeon';
  readonly topic: MobileSajuTopicV1;
  readonly readingText: Extract<MobileSajuTopicV1['availability'], { kind: 'preview' }>['readingText'];
}

/** Presentation cannot grant Reader Interpretation or expand allowed Saju Preview topics. */
export function resolveMobileSajuSceneAdmissionV1(
  readerId: unknown,
  topicKey: unknown,
): MobileSajuSceneAdmissionV1 | null {
  if (readerId !== 'seyeon' || typeof topicKey !== 'string') return null;
  const topic = MOBILE_SAJU_TOPIC_SECTIONS_V1.flatMap(section => section.topics)
    .find(entry => entry.key === topicKey);
  if (topic === undefined || topic.availability.kind !== 'preview') return null;
  return Object.freeze({
    readerId: 'seyeon',
    topic,
    readingText: topic.availability.readingText,
  });
}
