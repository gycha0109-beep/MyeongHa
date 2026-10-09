import type { OfficialReadingRecordV1 } from '@myeongha/api-client';
import { Text, View } from 'react-native';

export function MobileOfficialReadingReaderEntry({ record }: Readonly<{ record: OfficialReadingRecordV1 }>) {
  return <View><Text>Reader 해설 준비 중</Text></View>;
}
