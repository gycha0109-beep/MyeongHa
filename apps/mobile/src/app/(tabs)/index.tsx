import { FoundationCard, MobileScreen } from '@/ui/MobileScreen';

export default function HomeScreen() {
  return (
    <MobileScreen
      eyebrow="MYEONGHA"
      title="홈"
      description="오늘의 흐름과 이어지는 이야기를 한곳에서 시작합니다."
    >
      <FoundationCard
        title="오늘의 흐름"
        body="M5에서 서버 projection을 연결합니다. M1에서는 모바일 런타임과 탐색 구조만 확정합니다."
      />
      <FoundationCard
        title="오늘 이야기할 사람"
        body="캐릭터 authority를 임의로 생성하지 않고 서버가 허용한 roster가 준비되면 연결합니다."
      />
    </MobileScreen>
  );
}
