import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { useEffect } from "react";
import { AppState, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import AppTabs from "@/components/app-tabs";
import {
  addNotificationResponseListener,
  initNotifications,
  syncNotificationsWithStore,
} from "@/lib/notifications";
import { setPostMutationHook } from "@/lib/store";

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    let cancelled = false;
    let responseSub: { remove: () => void } | undefined;

    void (async () => {
      await initNotifications();
      if (cancelled) return;
      // 数据变更后自动重排通知；回前台时兜底同步一次
      setPostMutationHook(() => void syncNotificationsWithStore());
      responseSub = addNotificationResponseListener();
      await syncNotificationsWithStore();
    })();

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncNotificationsWithStore();
    });

    return () => {
      cancelled = true;
      responseSub?.remove();
      appStateSub.remove();
      setPostMutationHook(null);
    };
  }, []);

  return (
    // GestureHandler 的 Pan 需要根视图承载，缺了手势会静默失效
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <AppTabs />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
