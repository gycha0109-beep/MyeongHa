import { ReadingSubnav } from '@/features/reading/ReadingSubnav';
import { FoundationCard, MobileScreen } from '@/ui/MobileScreen';

export default function FaceScreen() {
  return (
    <MobileScreen
      eyebrow="READING"
      title="관상"
      description="사주와 같은 탐색 컨테이너를 사용하지만 관상 의미 authority는 독립적으로 유지합니다."
    >
      <ReadingSubnav />
      <FoundationCard
        title="관상"
        body="M7에서 source-approved Face Reading API와 네이티브 미디어 경로가 준비된 범위만 연결합니다."
      />
    </MobileScreen>
  );
}
