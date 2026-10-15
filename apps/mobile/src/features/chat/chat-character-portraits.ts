import type { ImageSourcePropType } from 'react-native';

/** Fixed, bundled presentation images copied from canonical web portraits.
 * No remote URL, runtime assetRef, or Character publication authority. */
const PORTRAIT_SOURCES = Object.freeze({
  seyeon: require('../../../assets/characters/seyeon-portrait.webp'),
  yeoul: require('../../../assets/characters/yeoul-portrait.webp'),
  rahyeon: require('../../../assets/characters/rahyeon-portrait.webp'),
  taegyeom: require('../../../assets/characters/taegyeom-portrait.webp'),
  yunho: require('../../../assets/characters/yunho-portrait.webp'),
  baekheon: require('../../../assets/characters/baekheon-portrait.webp'),
});

export function resolveMobileChatPortraitV1(
  characterId: string | null,
): ImageSourcePropType | null {
  if (characterId === null || !(characterId in PORTRAIT_SOURCES)) return null;
  return PORTRAIT_SOURCES[characterId as keyof typeof PORTRAIT_SOURCES];
}
