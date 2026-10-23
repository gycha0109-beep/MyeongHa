import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { mobileColors } from './mobile-colors.js';
import { plannedMobileUiPreviewLocaleV1 } from './mobile-planned-ui-screen-preview-v1.js';
import { useMobilePlannedUiPreviewSelectionV1, resolveMobilePlannedUiPreviewSelectionV1 } from './mobile-planned-ui-preview-context-v1.js';

/**
 * Developer QA only: changes the CURRENT ROUTE'S transient query parameter.
 * It never touches persisted UI preferences, API headers, Saju or Reader output.
 */
export function MobilePlannedUiQaSwitcherV1() {
  const { uiPreview } = useLocalSearchParams<{ uiPreview?: string | string[] }>();
  const selection = useMobilePlannedUiPreviewSelectionV1();
  const routePreviewLocale = plannedMobileUiPreviewLocaleV1(uiPreview, __DEV__);
  const active = resolveMobilePlannedUiPreviewSelectionV1(routePreviewLocale, selection, __DEV__);
  if (!__DEV__) return null;

  const options = [
    { value: '', label: 'Current UI' },
    { value: 'en-US', label: 'English' },
    { value: 'zh-CN', label: '简体中文' },
  ] as const;

  return (
    <View style={styles.container} accessibilityLabel="Developer UI translation preview">
      <Text style={styles.eyebrow}>DEV ONLY · UI COPY QA</Text>
      <View style={styles.buttons}>
        {options.map((option) => {
          const selected = active === (option.value || null);
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              onPress={() => {
                selection.select(option.value);
                router.setParams({ uiPreview: option.value });
              }}
              style={[styles.button, selected && styles.selected]}
            >
              <Text style={[styles.label, selected && styles.selectedLabel]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.note}>Preview this screen only. No saved language or translated reading.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 7, borderWidth: 1, borderColor: mobileColors.border,
    borderRadius: 10, padding: 10, backgroundColor: mobileColors.surface },
  eyebrow: { color: mobileColors.seal, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  buttons: { flexDirection: 'row', gap: 7 },
  button: { flex: 1, paddingVertical: 9, paddingHorizontal: 5, borderWidth: 1,
    borderColor: mobileColors.border, borderRadius: 7, alignItems: 'center' },
  selected: { borderColor: mobileColors.navy, backgroundColor: mobileColors.navy },
  label: { fontSize: 11, fontWeight: '700', color: mobileColors.ink },
  selectedLabel: { color: mobileColors.surface },
  note: { fontSize: 10, color: mobileColors.muted },
});
