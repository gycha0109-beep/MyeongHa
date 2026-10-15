import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  normalizeMobileFaceMediaAssetV1,
  type MobileFaceMediaAssetV1,
} from './mobile-face-media.js';

interface MobileFrontCameraPropsV1 {
  readonly onClose: () => void;
  readonly onCaptured: (photo: MobileFaceMediaAssetV1) => void;
}

export function MobileFrontCameraV1({
  onClose,
  onCaptured,
}: MobileFrontCameraPropsV1) {
  const camera = useRef<CameraView | null>(null);
  const askedAutomatically = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Explicit "사진 촬영" opens this modal; no camera or OS prompt on app start.
  useEffect(() => {
    if (permission === null || permission.granted || askedAutomatically.current) return;
    if (!permission.canAskAgain) return;
    askedAutomatically.current = true;
    void requestPermission().catch(() => setError('카메라 권한을 확인하지 못했습니다.'));
  }, [permission, requestPermission]);

  async function capture() {
    if (!ready || capturing || camera.current === null) return;
    setCapturing(true);
    setError(null);
    try {
      const result = await camera.current.takePictureAsync({
        quality: 0.85,
        base64: false,
        exif: false,
        skipProcessing: false,
      });
      if (!result) throw new Error('camera_photo_missing');
      const photo = normalizeMobileFaceMediaAssetV1({
        uri: result.uri,
        width: result.width,
        height: result.height,
        type: 'image',
        mimeType: 'image/jpeg',
      }, 'camera');
      onCaptured(photo);
    } catch {
      setError('사진을 촬영하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setCapturing(false);
    }
  }

  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
            <Text style={styles.text}>닫기</Text>
          </Pressable>
          <Text style={styles.title}>정면 사진 촬영</Text>
          <View style={styles.close} />
        </View>

        {permission?.granted ? (
          <View style={styles.preview}>
            <CameraView
              ref={camera}
              style={StyleSheet.absoluteFill}
              facing="front"
              mode="picture"
              mirror
              onCameraReady={() => setReady(true)}
              onMountError={() => setError('전면 카메라를 열지 못했습니다.')}
            />
            <View pointerEvents="none" style={styles.oval} />
          </View>
        ) : (
          <View style={styles.permission}>
            <Text style={styles.text}>
              정면 사진을 촬영하려면 카메라 권한이 필요합니다.
            </Text>
            {permission === null ? (
              <ActivityIndicator color="#ffffff" />
            ) : permission.canAskAgain ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void requestPermission()}
                style={styles.action}
              >
                <Text style={styles.actionText}>카메라 권한 허용</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => void Linking.openSettings()}
                style={styles.action}
              >
                <Text style={styles.actionText}>기기 설정에서 카메라 허용</Text>
              </Pressable>
            )}
          </View>
        )}

        {error !== null ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.hint}>얼굴 전체가 타원 안에 들어오도록 정면을 바라봐 주세요.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !permission?.granted || !ready || capturing }}
          disabled={!permission?.granted || !ready || capturing}
          onPress={() => void capture()}
          style={[styles.shutter, (!permission?.granted || !ready || capturing) && styles.disabled]}
        >
          <Text style={styles.shutterText}>{capturing ? '촬영 중…' : '사진 촬영'}</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#101827' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 16,
  },
  title: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  close: { width: 48, minHeight: 36, justifyContent: 'center' },
  text: { color: '#ffffff', fontSize: 14, textAlign: 'center' },
  preview: { flex: 1, marginHorizontal: 14, overflow: 'hidden', borderRadius: 20 },
  oval: {
    position: 'absolute', top: '13%', left: '15%', width: '70%', height: '72%',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderRadius: 999,
  },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 20 },
  action: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, backgroundColor: '#ffffff' },
  actionText: { color: '#101827', fontSize: 14, fontWeight: '800' },
  error: { color: '#ffb4a9', fontSize: 13, textAlign: 'center', marginTop: 10 },
  hint: { color: '#ffffff', fontSize: 13, textAlign: 'center', padding: 16 },
  shutter: {
    alignSelf: 'center', width: 180, minHeight: 54, alignItems: 'center',
    justifyContent: 'center', borderRadius: 28, backgroundColor: '#ffffff', marginBottom: 24,
  },
  shutterText: { color: '#101827', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.45 },
});
