import {
  composeSeyeonProductionContextV1,
  type SeyeonProductionContextSnapshotV1,
  type SeyeonProductionPersonalRecordProjectorV1,
} from './seyeon-production-context-v1.js';
import type {
  SeyeonProductionContextReadAuthorityPortV1,
} from './seyeon-production-context-read-v1.js';
import {
  runSeyeonProductionVerticalSliceV1,
  type RunSeyeonProductionVerticalSliceInputV1,
  type RunSeyeonProductionVerticalSliceResultV1,
  type SeyeonCommittedTurnRelationshipSignalV1,
} from './seyeon-production-vertical-slice-v1.js';
import type {
  SeyeonProductionRelationshipActivationV1,
} from './seyeon-production-relationship-activation-v1.js';
import type {
  SeyeonProductionRelationshipTurnBindingV1,
} from './seyeon-production-relationship-read-v1.js';

export const SEYEON_PRODUCTION_CONTEXT_VERTICAL_SLICE_VERSION_V1 =
  'seyeon-production-context-vertical-slice-v1' as const;

type BaseVerticalSliceInputV1<TTurnResult> = Omit<
  RunSeyeonProductionVerticalSliceInputV1<TTurnResult>,
  'runCommittedTurn'
>;

export interface RunSeyeonProductionContextVerticalSliceInputV1<TTurnResult>
extends BaseVerticalSliceInputV1<TTurnResult> {
  readonly threadId: string;
  readonly currentUserMessageRef: string;
  readonly contextReadPort: SeyeonProductionContextReadAuthorityPortV1;
  readonly serverOwnedPersonalRecordProjectors?:
    readonly SeyeonProductionPersonalRecordProjectorV1[];
  readonly maxRecentMessages?: number;
  readonly maxRelationshipEvents?: number;
  readonly maxPersonalRecords?: number;
  readonly runCommittedTurn: (input: Readonly<{
    readonly turnBinding: SeyeonProductionRelationshipTurnBindingV1;
    readonly activation: SeyeonProductionRelationshipActivationV1;
    readonly productionContext: SeyeonProductionContextSnapshotV1;
  }>) => Promise<Readonly<{
    readonly turnResult: TTurnResult;
    readonly signal: SeyeonCommittedTurnRelationshipSignalV1;
  }>>;
}

export interface RunSeyeonProductionContextVerticalSliceResultV1<TTurnResult>
extends RunSeyeonProductionVerticalSliceResultV1<TTurnResult> {
  readonly contextVersion:
    typeof SEYEON_PRODUCTION_CONTEXT_VERTICAL_SLICE_VERSION_V1;
}

export async function runSeyeonProductionContextVerticalSliceV1<TTurnResult>(
  input: RunSeyeonProductionContextVerticalSliceInputV1<TTurnResult>,
): Promise<RunSeyeonProductionContextVerticalSliceResultV1<TTurnResult>> {
  const result = await runSeyeonProductionVerticalSliceV1({
    mode: input.mode,
    resolvedSubjectId: input.resolvedSubjectId,
    ...(input.bandProjection === undefined
      ? {}
      : { bandProjection: input.bandProjection }),
    ...(input.bandProjector === undefined
      ? {}
      : { bandProjector: input.bandProjector }),
    relationshipReadPort: input.relationshipReadPort,
    productionHistoryRecords: input.productionHistoryRecords,
    productionAuthorityRef: input.productionAuthorityRef,
    idPort: input.idPort,
    contextPort: input.contextPort,
    commitPort: input.commitPort,
    ...(input.durableSync === undefined
      ? {}
      : { durableSync: input.durableSync }),
    runCommittedTurn: async ({ turnBinding, activation }) => {
      const productionContext = await composeSeyeonProductionContextV1({
        resolvedSubjectId: input.resolvedSubjectId,
        threadId: input.threadId,
        currentUserMessageRef: input.currentUserMessageRef,
        relationshipRevisionUsedForTurn:
          turnBinding.relationshipRevisionUsedForTurn,
        authorityPort: input.contextReadPort,
        ...(input.serverOwnedPersonalRecordProjectors === undefined
          ? {}
          : {
              serverOwnedPersonalRecordProjectors:
                input.serverOwnedPersonalRecordProjectors,
            }),
        ...(input.maxRecentMessages === undefined
          ? {}
          : { maxRecentMessages: input.maxRecentMessages }),
        ...(input.maxRelationshipEvents === undefined
          ? {}
          : { maxRelationshipEvents: input.maxRelationshipEvents }),
        ...(input.maxPersonalRecords === undefined
          ? {}
          : { maxPersonalRecords: input.maxPersonalRecords }),
      });

      return input.runCommittedTurn({
        turnBinding,
        activation,
        productionContext,
      });
    },
  });

  return Object.freeze({
    ...result,
    contextVersion:
      SEYEON_PRODUCTION_CONTEXT_VERTICAL_SLICE_VERSION_V1,
  });
}
