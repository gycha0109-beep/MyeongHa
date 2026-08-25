export type WorldRelationType = 'placeholder_relation' | 'ally' | 'rival' | 'mentor' | 'ward' | 'debt' | 'unknown';

export interface CharacterRelationDefinition {
  readonly fromCharacterId: string;
  readonly toCharacterId: string;
  readonly relationType: WorldRelationType;
  readonly summary: string;
}

export interface EpisodeParticipantDefinition {
  readonly characterId: string;
  readonly role: 'lead' | 'support' | 'cameo';
}

export interface EpisodeDefinition {
  readonly episodeId: string;
  readonly contentVersion: string;
  readonly title: string;
  readonly synopsis: string;
  readonly participants: readonly EpisodeParticipantDefinition[];
  readonly unlockRuleId: string;
  readonly developmentPlaceholder?: true;
}

export interface WorldContentBundle {
  readonly bundleId: string;
  readonly contentVersion: string;
  readonly characterRelations: readonly CharacterRelationDefinition[];
  readonly episodes: readonly EpisodeDefinition[];
}
