import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  type MobileFaceMediaAssetV1,
  type MobileFaceMediaPickerResultV1,
} from '@/platform/media/mobile-face-media';
import { pickMobileFaceMediaFromLibraryV1 } from '@/platform/media/expo-face-media-picker';
import { MobileFrontCameraV1 } from '@/platform/media/MobileFrontCameraV1';
import { ReadingSubnav } from '@/features/reading/ReadingSubnav';
import { MobileReaderPicker } from '@/features/reading/MobileReaderPicker';
import { FaceEditorialIntro } from '@/features/face/FaceEditorialIntro';
import { findMobileReaderPresentationV1, type MobileReaderPresentationIdV1 } from '@/features/reading/mobile-reader-presentation';
import { MobileScreen } from '@/ui/MobileScreen';
import { MobileUiText } from '@/ui/MobileUiText';
import { mobileColors } from '@/ui/mobile-colors';
import { useMobileThemedStyles } from '@/ui/use-mobile-themed-styles';
import { useMobileTheme } from '@/ui/mobile-theme';
import { useMobilePullRefreshV1 } from '@/ui/use-mobile-pull-refresh';

type FaceMediaStateV1 =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'picking'; source: 'camera' | 'library' }>
  | Readonly<{ kind: 'ready'; asset: MobileFaceMediaAssetV1 }>
  | Readonly<{ kind: 'error'; message: string }>;

function sizeLabel(bytes: number | null): string {
  if (bytes === null) return '파일 크기 확인 안 됨';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function FaceScreen() {
  const styles = useMobileThemedStyles(staticStyles);
  const { colors } = useMobileTheme();
  const [state, setState] = useState<FaceMediaStateV1>({ kind: 'idle' });
  const [frontCameraOpen, setFrontCameraOpen] = useState(false);
  const [presentationReader, setPresentationReader] = useState<MobileReaderPresentationIdV1>('seyeon');
  const readerPresentation = findMobileReaderPresentationV1(presentationReader);
  // The face picker has no server read yet. Refresh only clears a transient
  // picker error; never erase the selected photo or change the reader.
  const refreshLocalMedia = async () => {
    setState((current) => current.kind === 'error' ? { kind: 'idle' } : current);
  };
  const { refreshing, onRefresh } = useMobilePullRefreshV1(refreshLocalMedia);

  async function choose(
    source: 'camera' | 'library',
    operation: () => Promise<MobileFaceMediaPickerResultV1>,
  ) {
    setState({ kind: 'picking', source });
    try {
      const result = await operation();
      if (result.kind === 'selected') {
        setState({ kind: 'ready', asset: result.asset });
        return;
      }
      if (result.kind === 'cancelled') {
        setState({ kind: 'idle' });
        return;
      }
      if (result.kind === 'permission_denied') {
        setState({
          kind: 'error',
          message: '카메라 권한이 필요합니다. 기기 설정에서 카메라 접근을 허용해 주세요.',
        });
        return;
      }
      setState({ kind: 'error', message: result.reason });
    } catch {
      setState({
        kind: 'error',
        message: '사진을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      });
    }
  }

  const ready = state.kind === 'ready' ? state.asset : null;
  const picking = state.kind === 'picking';

  return (
    <MobileScreen
      eyebrow="FACE READING"
      title="관상"
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      description="얼굴에 담긴 이야기를 만나기 위한 첫 단계, 사진부터 준비해 보세요."
    >
      <ReadingSubnav />
      <FaceEditorialIntro readerId={presentationReader} />
      <MobileReaderPicker selected={presentationReader} onChange={setPresentationReader} vertical="face" />

      <View style={styles.hero}>
        <View style={styles.sectionHeading}>
          <View style={styles.numberMark}><Text style={styles.numberText}>01</Text></View>
          <View style={styles.sectionCopy}>
            <MobileUiText style={styles.kicker}>PHOTO · 정면 사진</MobileUiText>
            <Text style={styles.heroTitle}>{readerPresentation.name}에게 보여줄 사진</Text>
          </View>
        </View>
        <MobileUiText style={styles.body}>
          얼굴 전체가 보이도록 정면을 바라봐 주세요. 밝은 조명과 선명한 사진이 좋습니다.
        </MobileUiText>
      </View>

      <View style={styles.preview}>
        {ready !== null ? (
          <Image
            accessibilityLabel="선택한 얼굴 사진 미리보기"
            resizeMode="contain"
            source={{ uri: ready.uri }}
            style={styles.previewImage}
          />
        ) : (
          <View style={styles.placeholder}>
            <View style={styles.placeholderEmblem}>
              <Text style={styles.placeholderMark}>相</Text>
            </View>
            <MobileUiText style={styles.placeholderTitle}>사진을 준비해 주세요</MobileUiText>
            <MobileUiText style={styles.placeholderText}>정면 · 얼굴 전체 · 자연스러운 밝기</MobileUiText>
          </View>
        )}
        <View pointerEvents="none" style={styles.previewFrame}>
          <View style={[styles.frameCorner, styles.cornerTL]} />
          <View style={[styles.frameCorner, styles.cornerTR]} />
          <View style={[styles.frameCorner, styles.cornerBL]} />
          <View style={[styles.frameCorner, styles.cornerBR]} />
        </View>
      </View>

      {ready !== null ? (
        <View style={styles.fileCard}>
          <Text style={styles.fileMark}>▧</Text>
          <View style={styles.fileCopy}>
            <Text style={styles.fileTitle}>
              {ready.source === 'camera' ? '촬영한 사진' : '선택한 사진'}
            </Text>
            <Text style={styles.fileMeta}>
              {ready.width} × {ready.height} · {sizeLabel(ready.fileSize)}
            </Text>
          </View>
          <MobileUiText style={styles.readyBadge}>준비됨</MobileUiText>
        </View>
      ) : null}

      {state.kind === 'error' ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{state.message}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="전면 카메라로 정면 사진 촬영"
          disabled={picking}
          onPress={() => setFrontCameraOpen(true)}
          style={({ pressed }) => [styles.cameraAction, (pressed || picking) && styles.pressed]}
        >
          <MobileUiText style={styles.cameraActionText}>▣  사진 촬영</MobileUiText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="사진첩에서 얼굴 사진 선택"
          disabled={picking}
          onPress={() => void choose('library', pickMobileFaceMediaFromLibraryV1)}
          style={({ pressed }) => [styles.secondary, (pressed || picking) && styles.pressed]}
        >
          <MobileUiText style={styles.secondaryText}>▧  사진 선택</MobileUiText>
        </Pressable>
      </View>

      {picking ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.navy} />
          <MobileUiText style={styles.body}>사진을 준비하는 중입니다…</MobileUiText>
        </View>
      ) : null}

      <View style={styles.statusCard}>
        <Text style={styles.statusMark}>◎</Text>
        <View style={styles.statusCopy}>
          <Text style={styles.statusTitle}>
            {ready === null ? `${readerPresentation.name}과 관상 보기 준비` : '사진 준비 완료'}
          </Text>
          <MobileUiText style={styles.body}>
            현재는 사진 촬영·선택과 미리보기만 가능합니다. 서버 분석은 시작하지 않습니다. 얼굴 분석과 관상 풀이는 아직 제공하지 않습니다.
          </MobileUiText>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        disabled
        style={styles.primaryDisabled}
      >
        <Text style={styles.primaryDisabledText}>
          {ready === null ? '사진을 준비하면 다음 단계가 표시됩니다' : '관상 분석 기능 준비 중'}
        </Text>
      </Pressable>

      {frontCameraOpen ? (
        <MobileFrontCameraV1
          onClose={() => setFrontCameraOpen(false)}
          onCaptured={(photo) => {
            setState({ kind: 'ready', asset: photo });
            setFrontCameraOpen(false);
          }}
        />
      ) : null}

      <MobileUiText style={styles.privacyNote}>
        선택한 사진은 이 화면에서만 일시적으로 사용하며 기기 보안 저장소나 앱 기록에 저장하지 않습니다.
      </MobileUiText>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: 13,
    paddingHorizontal: 3,
    paddingTop: 6,
    paddingBottom: 2,
  },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  numberMark: {
    width: 48, height: 48, borderRadius: 14,
    borderWidth: 1, borderColor: mobileColors.gold,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: mobileColors.surface,
  },
  numberText: { color: mobileColors.navy, fontSize: 17, fontWeight: '900' },
  sectionCopy: { flex: 1, gap: 5 },
  kicker: { color: mobileColors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  heroTitle: { color: mobileColors.ink, fontSize: 21, lineHeight: 29, fontWeight: '900', letterSpacing: -0.4 },
  body: { color: mobileColors.muted, fontSize: 13, lineHeight: 21 },
  preview: {
    height: 360, position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: mobileColors.gold,
    borderRadius: 22,
    backgroundColor: mobileColors.surface,
  },
  previewImage: { width: '100%', height: '100%' },
  placeholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingHorizontal: 28,
  },
  placeholderEmblem: {
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 1, borderColor: mobileColors.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: mobileColors.canvas,
    marginBottom: 4,
  },
  placeholderMark: { color: mobileColors.gold, fontSize: 53, fontWeight: '700' },
  placeholderTitle: { color: mobileColors.ink, fontSize: 18, fontWeight: '900' },
  placeholderText: { color: mobileColors.muted, fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 19 },
  previewFrame: {
    position: 'absolute', top: 15, right: 15, bottom: 15, left: 15,
    borderWidth: 1, borderColor: 'rgba(188,151,100,0.28)', borderRadius: 15,
  },
  frameCorner: { position: 'absolute', width: 30, height: 30, borderColor: mobileColors.gold },
  cornerTL: { top: -1, left: -1, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
  cornerTR: { top: -1, right: -1, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
  cornerBL: { bottom: -1, left: -1, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: -1, right: -1, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },
  fileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: mobileColors.border, borderRadius: 17,
    backgroundColor: mobileColors.surface, padding: 16,
  },
  fileMark: { color: mobileColors.gold, fontSize: 22, fontWeight: '900' },
  fileCopy: { flex: 1, gap: 5 },
  fileTitle: { color: mobileColors.ink, fontSize: 15, fontWeight: '900' },
  fileMeta: { color: mobileColors.muted, fontSize: 12 },
  readyBadge: { color: mobileColors.navy, fontSize: 12, fontWeight: '900' },
  errorCard: { borderWidth: 1, borderColor: mobileColors.seal, borderRadius: 14, padding: 15 },
  errorText: { color: mobileColors.seal, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 10 },
  cameraAction: {
    flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, backgroundColor: mobileColors.navy,
  },
  cameraActionText: { color: mobileColors.surface, fontSize: 14, fontWeight: '900' },
  secondary: {
    flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: mobileColors.border,
    borderRadius: 14, backgroundColor: mobileColors.surface,
  },
  secondaryText: { color: mobileColors.navy, fontSize: 14, fontWeight: '900' },
  pressed: { opacity: 0.72 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  statusCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 13,
    borderWidth: 1, borderColor: mobileColors.border,
    borderRadius: 18, backgroundColor: mobileColors.surface, padding: 18,
  },
  statusMark: { color: mobileColors.gold, fontSize: 21, fontWeight: '900' },
  statusCopy: { flex: 1, gap: 6 },
  statusTitle: { color: mobileColors.ink, fontSize: 16, fontWeight: '900' },
  primaryDisabled: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, backgroundColor: mobileColors.navy, opacity: 0.46,
  },
  primaryDisabledText: { color: mobileColors.surface, fontSize: 14, fontWeight: '900' },
  privacyNote: { color: mobileColors.muted, fontSize: 11, lineHeight: 18 },
});
const staticStyles = styles;
