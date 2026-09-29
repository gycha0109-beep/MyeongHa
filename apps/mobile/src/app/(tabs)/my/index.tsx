import { FoundationCard, MobileScreen } from '@/ui/MobileScreen';

export default function MyScreen() {
  return (
    <MobileScreen
      eyebrow="MY"
      title="마이"
      description="계정, 명식, 기억, 관계와 이용 상태를 관리하는 모바일 제어 화면입니다."
    >
      <FoundationCard
        title="내 정보"
        body="M4에서 canonical subject와 Birth Profile을 모바일 인증 경계에 연결합니다."
      />
    </MobileScreen>
  );
}
