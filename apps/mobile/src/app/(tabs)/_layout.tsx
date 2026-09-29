import { Tabs } from 'expo-router';
import { StyleSheet, Text, type ColorValue } from 'react-native';

import { mobileColors } from '@/ui/mobile-colors';

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
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: mobileColors.navy,
        tabBarInactiveTintColor: mobileColors.muted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tabs.Screen name="index" options={{ title: '홈', tabBarIcon: ({ color }) => <TabIcon route="index" color={color} /> }} />
      <Tabs.Screen name="reading" options={{ title: '사주', tabBarIcon: ({ color }) => <TabIcon route="reading" color={color} /> }} />
      <Tabs.Screen name="chat" options={{ title: '대화', tabBarIcon: ({ color }) => <TabIcon route="chat" color={color} /> }} />
      <Tabs.Screen name="records" options={{ title: '기록', tabBarIcon: ({ color }) => <TabIcon route="records" color={color} /> }} />
      <Tabs.Screen name="my" options={{ title: '마이', tabBarIcon: ({ color }) => <TabIcon route="my" color={color} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    minHeight: 72,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: mobileColors.border,
    backgroundColor: mobileColors.surface,
  },
  label: { fontSize: 12, fontWeight: '700' },
  icon: { fontSize: 23, lineHeight: 26 },
});
