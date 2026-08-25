import type { RelationshipEventCandidate } from '../../contracts/src/index.js';
import type { ImmutableArtifact } from './registry.js';

export interface RelationshipVector {
  readonly closeness: number;
  readonly trust: number;
  readonly friction: number;
}

export interface RelationshipState extends RelationshipVector {
  readonly stage: string;
  readonly revision: number;
  readonly policyVersion: string;
}

export interface RelationshipEventRuleV1 {
  readonly event: RelationshipEventCandidate;
  readonly delta: Partial<RelationshipVector>;
  readonly transitionTo?: string;
}

export interface RelationshipPolicyV1 {
  readonly bounds: {
    readonly closeness: readonly [number, number];
    readonly trust: readonly [number, number];
    readonly friction: readonly [number, number];
  };
  readonly events: readonly RelationshipEventRuleV1[];
}

export interface AppliedRelationshipEvent {
  readonly dedupeKey: string;
  readonly event: RelationshipEventCandidate;
  readonly revisionBefore: number;
  readonly revisionAfter: number;
  readonly policyVersion: string;
  readonly policyContentHash: string;
}

export interface RelationshipApplyResult {
  readonly applied: boolean;
  readonly state: RelationshipState;
  readonly event?: AppliedRelationshipEvent;
}

function clamp(value: number, [min, max]: readonly [number, number]): number {
  return Math.min(max, Math.max(min, value));
}

function addDelta(
  state: RelationshipState,
  rule: RelationshipEventRuleV1,
  policy: RelationshipPolicyV1,
): RelationshipState {
  return Object.freeze({
    closeness: clamp(
      state.closeness + (rule.delta.closeness ?? 0),
      policy.bounds.closeness,
    ),
    trust: clamp(state.trust + (rule.delta.trust ?? 0), policy.bounds.trust),
    friction: clamp(
      state.friction + (rule.delta.friction ?? 0),
      policy.bounds.friction,
    ),
    stage: rule.transitionTo ?? state.stage,
    revision: state.revision + 1,
    policyVersion: state.policyVersion,
  });
}

export class InMemoryRelationshipAggregate {
  #state: RelationshipState;
  readonly #dedupeKeys = new Set<string>();

  constructor(initialState: RelationshipState) {
    this.#state = Object.freeze({ ...initialState });
  }

  get state(): RelationshipState {
    return this.#state;
  }

  apply(
    dedupeKey: string,
    event: RelationshipEventCandidate,
    policyArtifact: ImmutableArtifact<RelationshipPolicyV1>,
  ): RelationshipApplyResult {
    const normalizedDedupeKey = dedupeKey.trim();
    if (normalizedDedupeKey.length === 0) {
      throw new TypeError('Relationship event dedupe key is required.');
    }
    if (this.#dedupeKeys.has(normalizedDedupeKey)) {
      return Object.freeze({ applied: false, state: this.#state });
    }

    const rule = policyArtifact.payload.events.find((candidate) => candidate.event === event);
    if (rule === undefined) {
      throw new TypeError(`Relationship event is not authorized by policy: ${event}`);
    }

    const revisionBefore = this.#state.revision;
    const next = addDelta(this.#state, rule, policyArtifact.payload);
    this.#state = Object.freeze({
      ...next,
      policyVersion: policyArtifact.version,
    });
    this.#dedupeKeys.add(normalizedDedupeKey);

    return Object.freeze({
      applied: true,
      state: this.#state,
      event: Object.freeze({
        dedupeKey: normalizedDedupeKey,
        event,
        revisionBefore,
        revisionAfter: this.#state.revision,
        policyVersion: policyArtifact.version,
        policyContentHash: policyArtifact.contentHash,
      }),
    });
  }
}
