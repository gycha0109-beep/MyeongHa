import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text } from 'react-native';

import { mobileColors } from '@/ui/mobile-colors';
import { MobileUiText } from '@/ui/MobileUiText';
import { useMobileThemedStyles } from '@/ui/use-mobile-themed-styles';

/**
 * React Navigation must recognize the same deep-link path accepted by
 * MOBILE_SOCIAL_AUTH_REDIRECT_URI_V1 (myeongha://auth/callback).
 *
 * Do not read, render, log or forward callback parameters (including bearer
 * fragments). My's existing Linking handler validates pending state and
 * completes the member session. Cold-start Linking.getInitialURL is handled
 * when My mounts; in-app Linking URL events reach My's existing listener.
 *
 * This route is navigation only: arriving here never authenticates a user.
 */
export default function MobileSocialAuthCallbackScreen() {
  const styles = useMobileThemedStyles(staticStyles);
  useEffect(() => {
    router.replace('/my');
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ActivityIndicator color={mobileColors.navy} />
      <MobileUiText style={styles.text}>로그인 결과를 확인하고 있습니다…</MobileUiText>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: mobileColors.canvas, gap: 14,
  },
  text: { color: mobileColors.ink, fontSize: 14 },
});
const staticStyles = styles;
