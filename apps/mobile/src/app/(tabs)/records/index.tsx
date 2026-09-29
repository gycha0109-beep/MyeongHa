import { FoundationCard, MobileScreen } from '@/ui/MobileScreen';

export default function RecordsScreen() {
  return (
    <MobileScreen
      eyebrow="MY RECORDS"
      title="기록"
      description="Reading, 삶의 기록, 기억을 한 화면에 모으되 각 authority는 섞지 않습니다."
    >
      <FoundationCard
        title="기록 연결"
        body="M4에서 현재 production user-data read surfaces를 모바일 repository에 연결합니다."
      />
    </MobileScreen>
  );
}
