import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile local appearance preference', () => {
  it('offers two exclusive choices inside My settings, not in pending placeholders', async () => {
    const components = await source('apps/mobile/src/features/my/MyComponents.tsx');
    const selector = components.slice(
      components.indexOf('function MyThemeSelector()'),
      components.indexOf('export function MyPendingSettings()'),
    );
    expect(selector).toContain("['light', 'dark']");
    expect(selector).toContain('accessibilityRole="radio"');
    expect(selector).toContain('accessibilityState={{ selected: theme === option }}');
    expect(selector).toContain('onPress={() => setTheme(option)}');
    const pending = components.slice(components.indexOf('export function MyPendingSettings()'));
    expect(pending).toContain('<MyThemeSelector />');
  });

  it('persists only the device preference and falls back to light', async () => {
    const provider = await source('apps/mobile/src/ui/mobile-theme.tsx');
    expect(provider).toContain("useState<MobileTheme>('light')");
    expect(provider).toContain('SecureStore.getItemAsync(STORAGE_KEY)');
    expect(provider).toContain("value === 'light' || value === 'dark'");
    expect(provider).toContain('SecureStore.setItemAsync(STORAGE_KEY, value)');
    expect(provider).not.toContain('fetch(');
  });

  it('covers the root status bar, tabs, and shared screen background', async () => {
    const root = await source('apps/mobile/src/app/_layout.tsx');
    const tabs = await source('apps/mobile/src/app/(tabs)/_layout.tsx');
    const screen = await source('apps/mobile/src/ui/MobileScreen.tsx');
    expect(root).toContain('<MobileThemeProvider>');
    expect(root).toContain('theme === "dark" ? "light" : "dark"');
    expect(tabs).toContain('useMobileTheme()');
    expect(tabs).toContain('backgroundColor: colors.surface');
    expect(screen).toContain('backgroundColor: colors.canvas');
  });
});
