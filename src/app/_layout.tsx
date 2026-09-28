import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { Stack } from "expo-router/stack";
import { useEffect } from "react";
import { AppState, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { I18nProvider, useI18n } from "@/i18n";
import {
  addNotificationResponseListener,
  initNotifications,
  registerLocalizedNotificationTexts,
  syncNotificationsWithStore,
} from "@/lib/notifications";
import { setPostMutationHook } from "@/lib/store";

export default function RootLayout() {
  return (
    // GestureHandler 的 Pan 需要根视图承载，缺了手势会静默失效
    <GestureHandlerRootView style={{ flex: 1 }}>
      <I18nProvider>
        <AppShell />
      </I18nProvider>
    </GestureHandlerRootView>
  );
}

function AppShell() {
  const colorScheme = useColorScheme();
  const { language } = useI18n();

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

  // 通知栏的渠道名与「已服用 / 跳过」按钮文案在注册时固化，换语言要重注册
  useEffect(() => {
    void registerLocalizedNotificationTexts();
  }, [language]);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      {/* 根 Stack 只负责分流：引导页必须待在 tab 组之外，否则底部 tab 栏会压在它上面 */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        {/* 服药记录按日期查历史与依从率，tab 组里放不下（要占第 4 个 tab），
            改成从「我的」push 的普通栈页面，路径仍是 /records */}
        <Stack.Screen name="records" options={{ headerShown: true }} />
      </Stack>
    </ThemeProvider>
  );
}
