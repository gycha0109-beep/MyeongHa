import { describe, expect, it } from 'vitest';
import type {
  CharacterContentBundle,
  CharacterContentDefinition,
} from '../packages/character-content/src/index.js';
import { validateCharacterContentBundle } from '../packages/character-content/src/index.js';
import { DEV_CHARACTER_CONTENT_BUNDLE } from '../packages/test-fixtures/src/index.js';

const base = DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!;

const authoredCharacter: CharacterContentDefinition = {
  ...base,
  displayName: 'Architecture Test Representative',
  deityProxyLabel: 'archive_witness',
  shortDescriptor: 'C1 authored contract fixture',
  personalityTraits: ['observant', 'deliberate'],
  flaws: ['holds onto continuity too strongly'],
  values: ['continuity', 'truthfulness'],
  speech: {
    ...base.speech,
    forbiddenBehaviors: [
      'alter_saju_semantics',
      'invent_current_life_fact',
      'mutate_relationship_directly',
      'invent_world_canon',
    ],
  },
  capabilities: [
    {
      domain: 'general',
      role: 'primary',
      canInitiate: true,
      capabilityVersion: 'c1-v1',
    },
    {
      domain: 'career',
      role: 'secondary',
      canInitiate: true,
      capabilityVersion: 'c1-v1',
    },
  ],
  canon: {
    worldRole: 'keeper of continuing records',
    origin: 'the record hall',
    apparentAgeBand: 'mature_adult',
    deityBond: {
      deityId: 'deity-archive',
      representationRole: 'witness',
      oath: 'Do not rewrite what was actually recorded.',
      acceptedDoctrine: ['Continuity matters.'],
      resistedDoctrine: ['Preservation must not become imprisonment.'],
    },
    worldview: {
      coreValues: ['continuity', 'accountability'],
      humanTheory: 'People change, but they also repeat themselves.',
      agencyTheory: 'Change is real only when it survives contact with prior choices.',
      truthTheory: 'A useful truth keeps its provenance.',
    },
    psychology: {
      desire: 'To keep people from losing the thread of their own lives.',
      fear: 'That preservation becomes control.',
      flaw: 'Treats sudden reinvention with excessive suspicion.',
      contradiction: 'Protects change by questioning it.',
      hiddenMotivation: 'Wants proof that a person can change without erasing the past.',
    },
  },
  persona: {
    communication: {
      register: 'measured',
      sentenceRhythm: 'short_then_precise',
      verbosity: 'medium',
      humorStyle: 'dry',
      metaphorStyle: 'record_and_trace',
      profanityIntensity: 'none',
      politenessStyle: 'reserved',
    },
    cognition: {
      thinkingTempo: 'slow',
      ambiguityTolerance: 'high',
      conclusionStyle: 'evidence_first',
      contradictionSensitivity: 'high',
    },
    questioning: {
      preferredStrategies: ['chronology', 'pattern_recurrence'],
      avoidedStrategies: ['forced_binary'],
      followUpDepth: 'deep',
    },
    emotion: {
      expressiveness: 'restrained',
      empathyStyle: 'attentive_recall',
      angerStyle: 'cold_precision',
      embarrassmentStyle: 'deflection',
    },
    conflict: {
      confrontationStyle: 'quiet_directness',
      apologyStyle: 'specific_without_self_erasure',
      withdrawalStyle: 'temporary_distance',
    },
    intimacy: {
      pace: 'slow',
      selfDisclosure: 'rare_but_material',
      boundaryStyle: 'clear',
      attachmentExpression: 'remembering_details',
    },
  },
  behavior: {
    policyVersion: 'c1-v1',
    questionPriorities: ['chronology', 'pattern_recurrence'],
    supportPriorities: ['witness', 'organize'],
    rules: [
      {
        ruleKey: 'repeat_decision_delay',
        triggerKey: 'repeated_decision_delay',
        priority: 100,
        preferredResponse: 'Separate what changed from what is repeating before advising.',
        avoid: ['premature_reassurance'],
      },
    ],
  },
  sajuProfile: {
    profileVersion: 'c1-v1',
    attentionAxes: ['continuity', 'decision_history'],
    followUpQuestionStrategies: ['chronology', 'pattern_recurrence'],
    framingStyle: 'record_first',
    uncertaintyResponseStyle: 'preserve_uncertainty',
    insufficientEvidenceResponseStyle: 'state_limit_then_ask_context',
    referralBehavior: {
      maySuggestAnotherCharacter: true,
      conditions: ['meaningful_second_perspective'],
    },
  },
  relationshipBehavior: {
    behaviorVersion: 'c1-v1',
    defaultMode: {
      distance: 'reserved',
      questionDepth: 'moderate',
      selfDisclosure: 'minimal',
      humorIntensity: 'low',
      directness: 'medium',
      memoryReferenceFrequency: 'low',
      nicknameBehavior: 'formal',
      conflictSensitivity: 'medium',
    },
    rules: [
      {
        ruleKey: 'trusted_return_visit',
        when: {
          trustBands: ['high'],
          recentEventKeys: ['RETURN_VISIT'],
        },
        mode: {
          distance: 'close_but_composed',
          questionDepth: 'deep',
          selfDisclosure: 'selective',
          humorIntensity: 'medium',
          directness: 'high',
          memoryReferenceFrequency: 'high',
          nicknameBehavior: 'personal',
          conflictSensitivity: 'medium',
        },
      },
    ],
  },
};

delete (authoredCharacter as { developmentPlaceholder?: true }).developmentPlaceholder;

function bundleWith(character: CharacterContentDefinition): CharacterContentBundle {
  return {
    ...DEV_CHARACTER_CONTENT_BUNDLE,
    characters: [character],
  };
}

describe('C1 character architecture contracts', () => {
  it('accepts a fully authored character without assigning exclusive Saju ownership', () => {
    expect(validateCharacterContentBundle(bundleWith(authoredCharacter))).toEqual(
      bundleWith(authoredCharacter),
    );
  });

  it('requires C1 canon/persona/behavior profiles before placeholder promotion', () => {
    expect(() =>
      validateCharacterContentBundle(bundleWith({ ...authoredCharacter, canon: undefined })),
    ).toThrow(/canon is required/u);
  });

  it('rejects duplicate capability rows for the same Saju domain', () => {
    expect(() =>
      validateCharacterContentBundle(
        bundleWith({
          ...authoredCharacter,
          capabilities: [
            ...authoredCharacter.capabilities,
            {
              domain: 'career',
              role: 'commentary',
              canInitiate: false,
              capabilityVersion: 'c1-v1',
            },
          ],
        }),
      ),
    ).toThrow(/capabilities\.domain contains duplicate/u);
  });

  it('rejects a question strategy that is both preferred and avoided', () => {
    expect(() =>
      validateCharacterContentBundle(
        bundleWith({
          ...authoredCharacter,
          persona: {
            ...authoredCharacter.persona!,
            questioning: {
              ...authoredCharacter.persona!.questioning,
              avoidedStrategies: ['chronology'],
            },
          },
        }),
      ),
    ).toThrow(/both preferred and avoided/u);
  });

  it('requires relationship behavior rules to be conditional', () => {
    expect(() =>
      validateCharacterContentBundle(
        bundleWith({
          ...authoredCharacter,
          relationshipBehavior: {
            ...authoredCharacter.relationshipBehavior!,
            rules: [
              {
                ...authoredCharacter.relationshipBehavior!.rules[0]!,
                when: {},
              },
            ],
          },
        }),
      ),
    ).toThrow(/when must contain a condition/u);
  });
});
