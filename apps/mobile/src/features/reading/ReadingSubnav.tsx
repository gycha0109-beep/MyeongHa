import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  MOBILE_READING_SUBTAB_ROUTES,
  resolveMobileReadingSubtab,
  type MobileReadingSubtab,
} from '@/navigation/mobile-navigation-contract';
import { mobileColors } from '@/ui/mobile-colors';

const items = [
  { key: 'saju', label: '사주' },
  { key: 'face', label: '관상' },
] as const satisfies ReadonlyArray<{ key: MobileReadingSubtab; label: string }>;

export function ReadingSubnav() {
  const pathname = usePathname();
  const active = resolveMobileReadingSubtab(pathname);

  return (
    <View style={styles.container} accessibilityRole="tablist">
      {items.map((item) => {
        const selected = item.key === active;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => router.replace(MOBILE_READING_SUBTAB_ROUTES[item.key])}
            style={[styles.tab, selected && styles.tabSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 14,
    backgroundColor: mobileColors.surface,
    padding: 4,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  tabSelected: { backgroundColor: mobileColors.navy },
  label: { color: mobileColors.muted, fontSize: 16, fontWeight: '700' },
  labelSelected: { color: mobileColors.surface },
});
