import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { nativeMobilePushServiceV1 } from '@/core/push/native-mobile-push-service';
import { MobileThemeProvider, useMobileTheme } from '@/ui/mobile-theme';

function ThemedRootLayout() {
  const { theme, colors } = useMobileTheme();
  useEffect(() => {
    void nativeMobilePushServiceV1.syncEnabledNoPrompt().catch(() => undefined);
    return nativeMobilePushServiceV1.startTokenRotationWatch();
  }, []);

  return (
    <>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
        }}
      >
        <Stack.Screen name="(tabs)" />\n        <Stack.Screen name="birth" />
        <Stack.Screen name="auth/callback" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return <MobileThemeProvider><ThemedRootLayout /></MobileThemeProvider>;
}
