import { FoundationCard, MobileScreen } from '@/ui/MobileScreen';

export default function ChatHubScreen() {
  return (
    <MobileScreen
      eyebrow="CONVERSATION"
      title="대화"
      description="관계를 이어갈 상대와 최근 대화를 확인하는 모바일 허브입니다."
    >
      <FoundationCard
        title="대화 읽기"
        body="M6에서 서버가 허용한 thread/read 경로를 연결합니다. send authority는 별도 blocker를 우회하지 않습니다."
      />
    </MobileScreen>
  );
}
