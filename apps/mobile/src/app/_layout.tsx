import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { nativeMobilePushServiceV1 } from '@/core/push/native-mobile-push-service';
import { mobileColors } from '@/ui/mobile-colors';

export default function RootLayout() {
  useEffect(() => {
    void nativeMobilePushServiceV1.syncEnabledNoPrompt().catch(() => undefined);
    return nativeMobilePushServiceV1.startTokenRotationWatch();
  }, []);

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
