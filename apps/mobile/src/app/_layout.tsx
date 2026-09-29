import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { mobileColors } from '@/ui/mobile-colors';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: mobileColors.canvas },
        }}
      >
        <Stack.Screen name="(tabs)" />\n        <Stack.Screen name="birth" />
      </Stack>
    </>
  );
}
