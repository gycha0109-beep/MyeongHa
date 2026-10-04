import * as ImagePicker from 'expo-image-picker';

import {
  normalizeMobileFaceMediaAssetV1,
  type MobileFaceMediaPickerResultV1,
  type MobileFaceMediaSourceV1,
} from './mobile-face-media.js';

const PICK_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: false,
  allowsMultipleSelection: false,
  base64: false,
  exif: false,
  quality: 1,
};

function normalizePickerResult(
  result: ImagePicker.ImagePickerResult,
  source: MobileFaceMediaSourceV1,
): MobileFaceMediaPickerResultV1 {
  if (result.canceled) return Object.freeze({ kind: 'cancelled' });

  const asset = result.assets[0];
  if (asset === undefined || result.assets.length !== 1) {
    return Object.freeze({
      kind: 'invalid_asset',
      reason: '한 장의 사진만 선택할 수 있습니다.',
    });
  }

  try {
    return Object.freeze({
      kind: 'selected',
      asset: normalizeMobileFaceMediaAssetV1(asset, source),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'invalid_asset';
    const reason =
      code === 'asset_too_large'
        ? '16MB 이하의 사진을 선택해 주세요.'
        : code === 'unsupported_mime_type'
          ? 'JPEG, PNG 또는 WebP 사진을 선택해 주세요.'
          : '선택한 사진을 사용할 수 없습니다. 다른 사진을 선택해 주세요.';
    return Object.freeze({ kind: 'invalid_asset', reason });
  }
}

export async function pickMobileFaceMediaFromCameraV1(): Promise<MobileFaceMediaPickerResultV1> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return Object.freeze({ kind: 'permission_denied' });
  }

  const result = await ImagePicker.launchCameraAsync({
    ...PICK_OPTIONS,
    cameraType: ImagePicker.CameraType.front,
  });
  return normalizePickerResult(result, 'camera');
}

export async function pickMobileFaceMediaFromLibraryV1(): Promise<MobileFaceMediaPickerResultV1> {
  const result = await ImagePicker.launchImageLibraryAsync(PICK_OPTIONS);
  return normalizePickerResult(result, 'library');
}
