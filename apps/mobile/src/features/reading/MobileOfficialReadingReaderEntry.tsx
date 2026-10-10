import type { OfficialReadingRecordV1 } from '@myeongha/api-client';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { projectMobileOfficialReadingReaderEntryV1 } from '@/features/reading/mobile-official-reading-reader-entry-view-model';
import {
  MOBILE_READER_PRESENTATIONS_V1,
  findMobileReaderPresentationV1,
  isMobileReaderPreviewSelectableV1,
  type MobileReaderPresentationIdV1,
} from '@/features/reading/mobile-reader-presentation';
import { mobileColors } from '@/ui/mobile-colors';

export function MobileOfficialReadingReaderEntry({
  record,
}: Readonly<{ record: OfficialReadingRecordV1 }>) {
  // Local presentation selection is not a purchase, interpretation or Thread action.
  const [selectedReaderId, setSelectedReaderId] = useState<MobileReaderPresentationIdV1>('seyeon');
  const selectedReader = findMobileReaderPresentationV1(selectedReaderId);
  const entry = projectMobileOfficialReadingReaderEntryV1(record, selectedReaderId);

  return (
    <View style={styles.panel}>
      <Text style={styles.eyebrow}>READER · 준비 중</Text>
      <Text style={styles.title}>이 공식 사주를 읽어줄 인물</Text>
      <Text style={styles.copy}>공식 Reading 기반의 Reader 소개입니다. 해설 실행 및 후속 대화는 제공되지 않습니다.</Text>
      <View style={styles.grid}>
        {MOBILE_READER_PRESENTATIONS_V1.map((reader) => (
          <Pressable
            key={reader.key}
            accessibilityRole="button"
            accessibilityLabel={`${reader.name} 소개 보기`}
            accessibilityHint="인물 소개만 변경하며 유료 해설은 실행하지 않습니다."
            accessibilityState={{ selected: selectedReaderId === reader.key }}
            onPress={() => setSelectedReaderId(reader.key)}
            style={[
              styles.tile,
              isMobileReaderPreviewSelectableV1(reader.key) && styles.preview,
              selectedReaderId === reader.key && styles.selectedTile,
            ]}
          >
            <Text style={styles.name}>{reader.name}</Text>
            <Text style={styles.sub}>{reader.title}</Text>
            <Text style={styles.sub}>
              {isMobileReaderPreviewSelectableV1(reader.key) ? '프리뷰 소개' : '컨셉 준비 중'}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.introduction} accessibilityLiveRegion="polite">
        <Text style={styles.introductionTitle}>{selectedReader.name} · {selectedReader.title}</Text>
        <Text style={styles.copy}>{selectedReader.tone}</Text>
        <Text style={styles.copy}>
          현재 선택은 인물 소개를 보기 위한 것입니다. 이 Reader의 구매 접근권, 공식 Reading 열람 또는 전용 Thread가 생성되지 않습니다.
        </Text>
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
  selectedTile: { borderWidth: 2, borderColor: mobileColors.navy, backgroundColor: mobileColors.canvas },
  introduction: { borderWidth: 1, borderColor: mobileColors.border, borderRadius: 12, backgroundColor: mobileColors.canvas, padding: 14, gap: 7 },
  introductionTitle: { color: mobileColors.navy, fontSize: 16, fontWeight: '800' },
  name: { color: mobileColors.ink, fontSize: 15, fontWeight: '800' },
  sub: { color: mobileColors.muted, fontSize: 10, textAlign: 'center' },
  disabled: { backgroundColor: mobileColors.border, borderRadius: 12, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  disabledText: { color: mobileColors.muted, fontSize: 14, fontWeight: '800' },
});
