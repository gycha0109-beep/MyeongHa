import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useEffect } from 'react';

import { nativeMobilePushServiceV1 } from '@/core/push/native-mobile-push-service';
import { MobileThemeProvider, useMobileTheme } from '@/ui/mobile-theme';
import { MobileUiLocaleProvider } from '@/ui/mobile-ui-locale';
import { MobilePlannedUiPreviewProviderV1 } from '@/ui/mobile-planned-ui-preview-context-v1';

function ThemedRootLayout() {
  const { theme, colors } = useMobileTheme();
  useEffect(() => {
    void nativeMobilePushServiceV1.syncEnabledNoPrompt().catch(() => undefined);
    return nativeMobilePushServiceV1.startTokenRotationWatch();
  }, []);

  return (
    <>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <SafeAreaProvider>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.canvas }}>
          <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="birth" />
        <Stack.Screen name="auth/callback" />
          </Stack>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}

export default function RootLayout() {
  return <MobileThemeProvider><MobileUiLocaleProvider><MobilePlannedUiPreviewProviderV1><ThemedRootLayout /></MobilePlannedUiPreviewProviderV1></MobileUiLocaleProvider></MobileThemeProvider>;
}
