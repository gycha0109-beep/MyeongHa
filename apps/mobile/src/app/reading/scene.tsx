import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, ImageBackground, Pressable,
  SafeAreaView, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import {
  MyeongHaApiClientErrorV1,
  type SajuPreviewReadingResultV1,
} from '@myeongha/api-client';

import { subscribeMobileSubjectCredentialChangesV1 } from '@/core/session/mobile-subject-credential-changes';
import { resolveMobileSajuSceneAdmissionV1 } from '@/features/saju/mobile-saju-reader-scene';
import { mobileSajuPreviewServiceV1 } from '@/features/saju/native-mobile-saju-preview-service';
import { mobileColors } from '@/ui/mobile-colors';

const ROOM_ART = require('../../../assets/characters/chat-themes/seyeon-chat-theme-mobile-v1.webp');
const SEYEON_ART = require('../../../assets/characters/seyeon-portrait.webp');

type SceneResult = Extract<SajuPreviewReadingResultV1, { kind: 'delivered' }>;
type SceneState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly result: SceneResult }
  | { readonly kind: 'unavailable'; readonly message: string };

function unavailableMessage(error: unknown): string {
  if (error instanceof MyeongHaApiClientErrorV1) {
    if (error.code === 'NOT_FOUND') return '현재 출생정보를 확인할 수 없습니다.';
    if (error.code === 'SAJU_PREVIEW_READING_UNAVAILABLE') return '현재 승인된 프리뷰 범위 밖의 읽기입니다.';
    if (error.code === 'API_SAJU_PREVIEW_RESPONSE_INVALID') return '검증되지 않은 사주 해석 응답은 표시하지 않습니다.';
  }
  return '사주 프리뷰를 안전하게 불러오지 못했습니다. 다시 시작해 주세요.';
}

export default function SajuReaderSceneScreen() {
  const params = useLocalSearchParams<{ reader?: string | string[]; topic?: string | string[] }>();
  const readerId = typeof params.reader === 'string' ? params.reader : null;
  const topicKey = typeof params.topic === 'string' ? params.topic : null;
  const admission = resolveMobileSajuSceneAdmissionV1(readerId, topicKey);
  const [state, setState] = useState<SceneState>({ kind: 'loading' });
  const [introFinished, setIntroFinished] = useState(false);
  const [index, setIndex] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const frameProgress = useRef(new Animated.Value(0)).current;
  const stageProgress = useRef(new Animated.Value(0)).current;

  useFocusEffect(useCallback(() => {
    let active = true;
    setState({ kind: 'loading' });
    setIntroFinished(false);
    setIndex(0);
    setDetailsOpen(false);
    frameProgress.setValue(0);
    stageProgress.setValue(0);

    const unsubscribe = subscribeMobileSubjectCredentialChangesV1(() => {
      active = false;
      frameProgress.stopAnimation();
      stageProgress.stopAnimation();
      setIntroFinished(false);
      setState({ kind: 'unavailable', message: '계정 또는 세션이 변경되어 이전 사주 읽기를 종료했습니다.' });
    });

    if (admission !== null) {
      Animated.sequence([
        Animated.timing(frameProgress, { toValue: 1, duration: 1450, useNativeDriver: true }),
        Animated.timing(stageProgress, { toValue: 1, duration: 850, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished && active) setIntroFinished(true);
      });
      void mobileSajuPreviewServiceV1.read(admission.readingText).then(result => {
        if (!active) return;
        if (result.kind === 'delivered' && result.steps.length > 0) {
          setState({ kind: 'ready', result });
        } else {
          setState({ kind: 'unavailable', message: '현재 승인된 근거로 이 사주 프리뷰를 표시할 수 없습니다.' });
        }
      }).catch(error => {
        if (active) setState({ kind: 'unavailable', message: unavailableMessage(error) });
      });
    }
    return () => {
      active = false;
      unsubscribe();
      frameProgress.stopAnimation();
      stageProgress.stopAnimation();
      setState({ kind: 'loading' });
      setIntroFinished(false);
    };
  }, [readerId, topicKey, frameProgress, stageProgress]));

  if (admission === null) {
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.block}>
          <Text style={styles.title}>현재 열 수 없는 사주 읽기입니다</Text>
          <Text style={styles.muted}>승인된 Reader와 프리뷰 주제를 먼저 선택해 주세요.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/reading')} style={styles.action}>
            <Text style={styles.actionText}>사주로 돌아가기</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const currentStep = state.kind === 'ready' ? state.result.steps[index] : undefined;
  const completed = state.kind === 'ready' && index === state.result.steps.length;
  const identityOpacity = stageProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const portraitTranslate = frameProgress.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.back}>‹ 사주로 돌아가기</Text>
        </Pressable>
        <ImageBackground source={ROOM_ART} style={styles.scene} imageStyle={styles.sceneArt} resizeMode="cover">
          <View style={styles.sceneWash}>
            <Animated.Image
              source={SEYEON_ART}
              accessibilityLabel="세연 대리자"
              resizeMode="cover"
              style={[styles.portrait, { opacity: frameProgress, transform: [{ translateY: portraitTranslate }] }]}
            />
            <Animated.View style={[styles.sceneCaption, { opacity: identityOpacity }]}>
              <Text style={styles.sceneName}>세연 · 무녀</Text>
              <Text style={styles.sceneLine}>명식의 흐름을 함께 살펴볼게요.</Text>
            </Animated.View>
          </View>
        </ImageBackground>
        <Text style={styles.sceneNote}>장면 연출 · 실제 해석 내용은 서버의 검증된 사주 프리뷰만 사용합니다.</Text>

        {state.kind === 'unavailable' ? (
          <View style={styles.block}>
            <Text style={styles.title}>읽기를 표시하지 못했습니다</Text>
            <Text style={styles.muted}>{state.message}</Text>
            <Pressable accessibilityRole="button" style={styles.action} onPress={() => router.replace('/reading')}>
              <Text style={styles.actionText}>사주로 돌아가기</Text>
            </Pressable>
          </View>
        ) : !introFinished || state.kind === 'loading' ? (
          <View style={styles.block}>
            <ActivityIndicator color={mobileColors.navy} />
            <Text style={styles.muted}>세연이 명식을 살펴보는 장면입니다…</Text>
          </View>
        ) : completed ? (
          <View style={styles.block}>
            <Text style={styles.eyebrow}>READING COMPLETE</Text>
            <Text style={styles.title}>이번 사주 프리뷰를 마쳤습니다.</Text>
            <Text style={styles.muted}>계속 대화하거나 기존에 저장된 공식 사주 기록을 확인할 수 있습니다.</Text>
            <Pressable accessibilityRole="button" style={styles.action} onPress={() => router.replace('/chat')}>
              <Text style={styles.actionText}>대화로 넘어가기 →</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => router.replace('/records?tab=readings')}>
              <Text style={styles.secondaryText}>기록으로 넘어가기 →</Text>
            </Pressable>
            <Text style={styles.footnote}>이번 무료 프리뷰는 공식 Reading 기록으로 저장되지 않습니다. 대화 화면에서도 이 프리뷰가 자동으로 세연의 지식에 추가되지는 않습니다.</Text>
          </View>
        ) : currentStep !== undefined ? (
          <View style={styles.block}>
            <Text style={styles.eyebrow}>{admission.topic.label} · 읽기 {index + 1} / {state.result.steps.length}</Text>
            <Text style={styles.title}>{currentStep.title}</Text>
            <Text style={styles.body}>{currentStep.primary}</Text>
            <Pressable accessibilityRole="button" onPress={() => setDetailsOpen(v => !v)} style={styles.detailButton}>
              <Text style={styles.secondaryText}>{detailsOpen ? '근거·상세 접기 ▲' : '근거·상세 보기 ▼'}</Text>
            </Pressable>
            {detailsOpen ? (
              <View style={styles.detailBox}>
                {currentStep.structure.map((text, i) => (
                  <Text key={'structure:' + i} style={styles.muted}>근거 · {text}</Text>
                ))}
                {currentStep.supporting.map((text, i) => (
                  <Text key={'support:' + i} style={styles.muted}>{text}</Text>
                ))}
                {currentStep.structure.length === 0 && currentStep.supporting.length === 0 ? (
                  <Text style={styles.muted}>현재 제공된 추가 근거가 없습니다.</Text>
                ) : null}
                {state.result.notices.map((text, i) => (
                  <Text key={'notice:' + i} style={styles.footnote}>{text}</Text>
                ))}
              </View>
            ) : null}
            <View style={styles.buttons}>
              {index > 0 ? (
                <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => { setIndex(i => i - 1); setDetailsOpen(false); }}>
                  <Text style={styles.secondaryText}>이전</Text>
                </Pressable>
              ) : null}
              <Pressable accessibilityRole="button" style={[styles.action, styles.flex]} onPress={() => { setIndex(i => i + 1); setDetailsOpen(false); }}>
                <Text style={styles.actionText}>{index + 1 === state.result.steps.length ? '읽기 마치기 →' : '다음 읽기 →'}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: mobileColors.canvas },
  scroll: { padding: 18, paddingBottom: 36, gap: 14 },
  back: { fontWeight: '800', color: mobileColors.navy, paddingVertical: 7 },
  scene: { height: 345, borderRadius: 20, overflow: 'hidden' },
  sceneArt: { opacity: 0.92 },
  sceneWash: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', padding: 14, backgroundColor: 'rgba(255,248,234,0.15)' },
  portrait: { height: 225, width: 170, borderRadius: 16, borderWidth: 1, borderColor: mobileColors.border },
  sceneCaption: { backgroundColor: 'rgba(255,250,242,0.92)', borderRadius: 12, alignItems: 'center', padding: 10, width: '100%', gap: 4, marginTop: 7 },
  sceneName: { fontSize: 17, fontWeight: '900', color: mobileColors.navy },
  sceneLine: { fontSize: 12, color: mobileColors.ink },
  sceneNote: { fontSize: 11, color: mobileColors.muted, textAlign: 'center' },
  block: { backgroundColor: mobileColors.surface, borderRadius: 18, borderWidth: 1, borderColor: mobileColors.border, padding: 21, gap: 14 },
  eyebrow: { color: mobileColors.gold, fontSize: 12, fontWeight: '800' },
  title: { color: mobileColors.ink, fontSize: 20, lineHeight: 27, fontWeight: '800' },
  body: { color: mobileColors.ink, fontSize: 16, lineHeight: 26 },
  muted: { color: mobileColors.muted, fontSize: 14, lineHeight: 22 },
  action: { minHeight: 48, backgroundColor: mobileColors.navy, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  actionText: { color: mobileColors.surface, fontSize: 14, fontWeight: '800' },
  secondary: { minHeight: 46, borderWidth: 1, borderColor: mobileColors.border, borderRadius: 13, paddingHorizontal: 17, paddingVertical: 10, justifyContent: 'center', alignItems: 'center' },
  secondaryText: { color: mobileColors.navy, fontWeight: '800', fontSize: 14 },
  detailButton: { alignSelf: 'flex-start', paddingVertical: 7 },
  detailBox: { gap: 10, borderTopWidth: 1, borderColor: mobileColors.border, paddingTop: 12 },
  footnote: { color: mobileColors.muted, fontSize: 11, lineHeight: 18 },
  buttons: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
