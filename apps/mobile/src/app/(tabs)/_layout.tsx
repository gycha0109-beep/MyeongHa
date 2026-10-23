import { Tabs } from 'expo-router';
import { StyleSheet, Text, type ColorValue } from 'react-native';

import { useMobileTheme } from '@/ui/mobile-theme';
import { useMobileUiLocale } from '@/ui/mobile-ui-locale';

const iconByRoute = Object.freeze({
  index: '⌂',
  reading: '✦',
  chat: '◌',
  records: '▤',
  my: '♙',
});

function TabIcon({ route, color }: { route: keyof typeof iconByRoute; color: ColorValue }) {
  return <Text style={[styles.icon, { color }]}>{iconByRoute[route]}</Text>;
}

export default function TabLayout() {
  const { colors } = useMobileTheme();
  const { t } = useMobileUiLocale();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: [styles.tabBar, { backgroundColor: colors.surface, borderTopColor: colors.border }],
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('홈'), tabBarIcon: ({ color }) => <TabIcon route="index" color={color} /> }} />
      <Tabs.Screen name="reading" options={{ title: t('사주'), tabBarIcon: ({ color }) => <TabIcon route="reading" color={color} /> }} />
      <Tabs.Screen name="chat" options={{ title: t('대화'), tabBarIcon: ({ color }) => <TabIcon route="chat" color={color} /> }} />
      <Tabs.Screen name="records" options={{ title: t('기록'), tabBarIcon: ({ color }) => <TabIcon route="records" color={color} /> }} />
      <Tabs.Screen name="my" options={{ title: t('마이'), tabBarIcon: ({ color }) => <TabIcon route="my" color={color} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    minHeight: 72,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#DCC9A8',
    backgroundColor: '#FBF7EF',
  },
  label: { fontSize: 12, fontWeight: '700' },
  icon: { fontSize: 23, lineHeight: 26 },
});
