import type {
  PersistedReadingHandoffParseResultV1,
} from './reading-history-handoff.js';

export class ReaderSceneLaunchInputErrorV1 extends TypeError {
  readonly code:
    | 'READER_SCENE_LAUNCH_INVALID'
    | 'READER_SCENE_READING_HANDOFF_REQUIRED';
}

export function createReaderSceneLaunchRequestV1(input: Readonly<{
  threadId: unknown;
  persistedReadingHandoff: PersistedReadingHandoffParseResultV1;
}>): Readonly<{
  threadId: string;
  officialReadingId: string;
}>;
