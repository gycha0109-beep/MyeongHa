export interface CharacterRelationDefinition {
  readonly fromCharacterId: string;
  readonly toCharacterId: string;
  readonly relationType: string;
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
}

export interface WorldContentBundle {
  readonly bundleId: string;
  readonly contentVersion: string;
  readonly characterRelations: readonly CharacterRelationDefinition[];
  readonly episodes: readonly EpisodeDefinition[];
}
