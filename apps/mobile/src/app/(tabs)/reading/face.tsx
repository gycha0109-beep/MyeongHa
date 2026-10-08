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
import {
  pickMobileFaceMediaFromCameraV1,
  pickMobileFaceMediaFromLibraryV1,
} from '@/platform/media/expo-face-media-picker';
import { ReadingSubnav } from '@/features/reading/ReadingSubnav';
import { MobileReaderPicker } from '@/features/reading/MobileReaderPicker';
import { findMobileReaderPresentationV1, type MobileReaderPresentationIdV1 } from '@/features/reading/mobile-reader-presentation';
import { MobileScreen } from '@/ui/MobileScreen';
import { mobileColors } from '@/ui/mobile-colors';

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
  const [state, setState] = useState<FaceMediaStateV1>({ kind: 'idle' });
  const [presentationReader, setPresentationReader] = useState<MobileReaderPresentationIdV1>('seyeon');
  const readerPresentation = findMobileReaderPresentationV1(presentationReader);

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
      description="정면 사진을 준비하고, 얼굴 구조 확인 단계까지 안전하게 이어갑니다."
    >
      <ReadingSubnav />
      <MobileReaderPicker selected={presentationReader} onChange={setPresentationReader} vertical="face" />

      <View style={styles.hero}>
        <View>
          <Text style={styles.kicker}>01 · 사진 준비</Text>
          <Text style={styles.heroTitle}>{readerPresentation.name}에게 보여줄 정면 사진을 준비해 주세요.</Text>
        </View>
        <Text style={styles.body}>
          얼굴 전체가 프레임 안에 들어오고, 정면에 가깝고, 흔들림과 과도한 필터가 적은 사진이 좋습니다.
        </Text>
      </View>

      <View style={styles.preview}>
        {ready !== null ? (
          <Image
            accessibilityLabel="선택한 얼굴 사진 미리보기"
            resizeMode="cover"
            source={{ uri: ready.uri }}
            style={styles.previewImage}
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderMark}>相</Text>
            <Text style={styles.placeholderText}>정면 사진을 이 안에 맞춰주세요</Text>
          </View>
        )}
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
          <Text style={styles.readyBadge}>준비됨</Text>
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
          disabled={picking}
          onPress={() => void choose('camera', pickMobileFaceMediaFromCameraV1)}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>▣ 사진 촬영</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={picking}
          onPress={() => void choose('library', pickMobileFaceMediaFromLibraryV1)}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>▧ 사진 선택</Text>
        </Pressable>
      </View>

      {picking ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={mobileColors.navy} />
          <Text style={styles.body}>사진을 준비하는 중입니다…</Text>
        </View>
      ) : null}

      <View style={styles.statusCard}>
        <Text style={styles.statusMark}>◇</Text>
        <View style={styles.statusCopy}>
          <Text style={styles.statusTitle}>
            {ready === null ? `${readerPresentation.name}과 관상 보기 준비` : '사진 준비 완료'}
          </Text>
          <Text style={styles.body}>
            현재 모바일에서는 사진 촬영·선택과 기기 내 미리보기까지만 제공합니다. 서버 분석은 시작하지 않습니다.
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        disabled
        style={styles.primaryDisabled}
      >
        <Text style={styles.primaryDisabledText}>
          {ready === null ? '사진을 먼저 준비해 주세요' : '얼굴 구조 확인 연결 준비 중'}
        </Text>
      </Pressable>

      <Text style={styles.privacyNote}>
        선택한 사진은 이 화면에서만 일시적으로 사용하며 기기 보안 저장소나 앱 기록에 저장하지 않습니다.
      </Text>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: mobileColors.border,
    paddingBottom: 18,
    gap: 9,
  },
  kicker: { color: mobileColors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { marginTop: 4, color: mobileColors.ink, fontSize: 21, lineHeight: 29, fontWeight: '800' },
  body: { color: mobileColors.muted, fontSize: 14, lineHeight: 21 },
  preview: {
    height: 360,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 22,
    backgroundColor: mobileColors.surface,
  },
  previewImage: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  placeholderMark: { color: mobileColors.gold, fontSize: 46, fontWeight: '800' },
  placeholderText: { color: mobileColors.muted, fontSize: 13, fontWeight: '700' },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 15,
    backgroundColor: mobileColors.surface,
    padding: 14,
  },
  fileMark: { color: mobileColors.gold, fontSize: 20, fontWeight: '900' },
  fileCopy: { flex: 1, gap: 3 },
  fileTitle: { color: mobileColors.ink, fontSize: 14, fontWeight: '800' },
  fileMeta: { color: mobileColors.muted, fontSize: 11 },
  readyBadge: { color: mobileColors.navy, fontSize: 11, fontWeight: '900' },
  errorCard: {
    borderWidth: 1,
    borderColor: mobileColors.seal,
    borderRadius: 14,
    padding: 13,
  },
  errorText: { color: mobileColors.seal, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 10 },
  secondary: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 14,
    backgroundColor: mobileColors.surface,
  },
  secondaryText: { color: mobileColors.navy, fontSize: 14, fontWeight: '800' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 17,
    backgroundColor: mobileColors.surface,
    padding: 17,
  },
  statusMark: { color: mobileColors.gold, fontSize: 18, fontWeight: '900' },
  statusCopy: { flex: 1, gap: 5 },
  statusTitle: { color: mobileColors.ink, fontSize: 15, fontWeight: '800' },
  primaryDisabled: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: mobileColors.navy,
    opacity: 0.45,
  },
  primaryDisabledText: { color: mobileColors.surface, fontSize: 14, fontWeight: '900' },
  privacyNote: { color: mobileColors.muted, fontSize: 11, lineHeight: 17 },
});
