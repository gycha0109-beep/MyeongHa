import { Text, type TextProps } from 'react-native';

import { localizeMobileLiteralText } from './mobile-ui-copy';
import { useMobileUiLocale } from './mobile-ui-locale';

/**
 * Opt-in ONLY for leaf UI literals. Never replace Text around user messages,
 * account data, dynamic server facts, or official interpretations.
 */
export function MobileUiText({ children, ...props }: TextProps) {
  const { locale } = useMobileUiLocale();
  return (
    <Text {...props}>
      {typeof children === 'string' ? localizeMobileLiteralText(children, locale) : children}
    </Text>
  );
}
