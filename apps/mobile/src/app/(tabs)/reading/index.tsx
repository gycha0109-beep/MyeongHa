import { ReadingSubnav } from '@/features/reading/ReadingSubnav';
import { FoundationCard, MobileScreen } from '@/ui/MobileScreen';

export default function SajuScreen() {
  return (
    <MobileScreen
      eyebrow="READING"
      title="사주"
      description="사주 탭의 기본 화면입니다. 관상은 같은 하단 탭 안의 별도 영역으로 이동합니다."
    >
      <ReadingSubnav />
      <FoundationCard
        title="사주"
        body="M3에서 Birth Profile과 현재 사주 계산 API를 연결합니다."
      />
    </MobileScreen>
  );
}
