import type { OfficialReadingRecordV1 } from '@myeongha/api-client';
import { StyleSheet, Text, View } from 'react-native';

import { projectMobileOfficialReadingReaderEntryV1 } from '@/features/reading/mobile-official-reading-reader-entry-view-model';
import {
  MOBILE_READER_PRESENTATIONS_V1,
  isMobileReaderPreviewSelectableV1,
} from '@/features/reading/mobile-reader-presentation';
import { mobileColors } from '@/ui/mobile-colors';

export function MobileOfficialReadingReaderEntry({
  record,
}: Readonly<{ record: OfficialReadingRecordV1 }>) {
  const entry = projectMobileOfficialReadingReaderEntryV1(record, 'seyeon');

  return (
    <View style={styles.panel}>
      <Text style={styles.eyebrow}>READER · 준비 중</Text>
      <Text style={styles.title}>이 공식 사주를 읽어줄 인물</Text>
      <Text style={styles.copy}>공식 Reading 기반의 Reader 소개입니다. 해설 실행 및 후속 대화는 제공되지 않습니다.</Text>
      <View style={styles.grid}>
        {MOBILE_READER_PRESENTATIONS_V1.map((reader) => (
          <View
            key={reader.key}
            style={[
              styles.tile,
              isMobileReaderPreviewSelectableV1(reader.key) && styles.preview,
            ]}
          >
            <Text style={styles.name}>{reader.name}</Text>
            <Text style={styles.sub}>{reader.title}</Text>
            <Text style={styles.sub}>
              {isMobileReaderPreviewSelectableV1(reader.key) ? '프리뷰 소개' : '컨셉 준비 중'}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.name}>해설 진입 상태</Text>
      <Text style={styles.copy}>{entry.statusMessage}</Text>
      <View accessible accessibilityLabel="Reader 해설 진입 비활성" style={styles.disabled}>
        <Text style={styles.disabledText}>해설 서비스 준비 중</Text>
      </View>
      <Text style={styles.copy}>
        Reader 소개 및 기록 연결은 상품 적격성, 구매 접근권, 공개 승인, 공식 Reading 접근 허가의 증명이 아닙니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderColor: mobileColors.border, borderRadius: 18, backgroundColor: mobileColors.surface, padding: 18, gap: 12 },
  eyebrow: { color: mobileColors.gold, fontSize: 11, fontWeight: '900' },
  title: { color: mobileColors.ink, fontSize: 20, fontWeight: '800' },
  copy: { color: mobileColors.muted, fontSize: 13, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31%', minHeight: 88, borderWidth: 1, borderColor: mobileColors.border, borderRadius: 12, padding: 6, alignItems: 'center', justifyContent: 'center', gap: 4 },
  preview: { borderColor: mobileColors.gold, backgroundColor: mobileColors.canvas },
  name: { color: mobileColors.ink, fontSize: 15, fontWeight: '800' },
  sub: { color: mobileColors.muted, fontSize: 10, textAlign: 'center' },
  disabled: { backgroundColor: mobileColors.border, borderRadius: 12, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  disabledText: { color: mobileColors.muted, fontSize: 14, fontWeight: '800' },
});
