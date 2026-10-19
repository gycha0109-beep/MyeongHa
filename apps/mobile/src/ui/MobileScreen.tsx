import type { PropsWithChildren, ReactNode } from 'react';
import { RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { mobileColors } from '@/ui/mobile-colors';
import { useMobileTheme } from '@/ui/mobile-theme';

type MobileScreenProps = PropsWithChildren<{
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}>;

export function MobileScreen({ title, eyebrow, description, refreshing = false, onRefresh, children }: MobileScreenProps) {
  const { colors } = useMobileTheme();
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.canvas }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={onRefresh === undefined ? undefined : (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.navy}
            colors={[colors.navy]}
          />
        )}
      >
        <View style={styles.header}>
          {eyebrow ? <Text style={[styles.eyebrow, { color: colors.gold }]}>{eyebrow}</Text> : null}
          <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
          {description ? <Text style={[styles.description, { color: colors.muted }]}>{description}</Text> : null}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function FoundationCard({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: mobileColors.canvas },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 36, gap: 22 },
  header: { gap: 8 },
  eyebrow: { color: mobileColors.gold, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: mobileColors.ink, fontSize: 32, fontWeight: '700' },
  description: { color: mobileColors.muted, fontSize: 16, lineHeight: 24 },
  card: { borderWidth: 1, borderColor: mobileColors.border, borderRadius: 18, backgroundColor: mobileColors.surface, padding: 20, gap: 8 },
  cardTitle: { color: mobileColors.ink, fontSize: 20, fontWeight: '700' },
  cardBody: { color: mobileColors.muted, fontSize: 15, lineHeight: 22 },
});
