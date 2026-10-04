import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { createNativeMobileChatReadControllerV1 } from '@/features/chat/native-mobile-chat-read-controller';

export function useMobileChatThreadV1(threadId: string) {
  const controller = useMemo(
    () => createNativeMobileChatReadControllerV1(threadId),
    [threadId],
  );
  const [snapshot, setSnapshot] = useState(() => controller.getSnapshot());

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const pending = controller.loadInitial();
      setSnapshot(controller.getSnapshot());
      void pending.then((next) => {
        if (active) setSnapshot(next);
      });
      return () => {
        active = false;
      };
    }, [controller]),
  );

  const loadMore = useCallback(async () => {
    const pending = controller.loadMore();
    setSnapshot(controller.getSnapshot());
    const next = await pending;
    setSnapshot(next);
  }, [controller]);

  return Object.freeze({ snapshot, loadMore });
}
