import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { Stack } from "expo-router/stack";
import { useEffect, useMemo } from "react";
import { AppState, StatusBar, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useTheme } from "@/hooks/use-theme";
import { I18nProvider, useI18n } from "@/i18n";
import {
  addNotificationResponseListener,
  initNotifications,
  registerLocalizedNotificationTexts,
  syncNotificationsWithStore,
} from "@/lib/notifications";
import { ensureDefaultPerson, setPostMutationHook } from "@/lib/store";

export default function RootLayout() {
  return (
    // GestureHandler 的 Pan 需要根视图承载，缺了手势会静默失效
    <GestureHandlerRootView style={{ flex: 1 }}>
      <I18nProvider>
        <AppShell />
        <StatusBar barStyle="auto" />
      </I18nProvider>
    </GestureHandlerRootView>
  );
}

function AppShell() {
  const colorScheme = useColorScheme();
  const theme = useTheme();
  const { language } = useI18n();

  // 默认用药人（「自己」）兜底：首启动自动建好，用户不必先加成员就能配药。
  // 依赖 language —— 语言偏好是异步解析的，解析完成后重跑一次，把默认名
  // 刷成当前语言（没改过名才刷）
  useEffect(() => {
    void ensureDefaultPerson(language);
  }, [language]);

  // 默认主题的 primary 是系统蓝，header 的返回按钮/标题强调色会跟业务区的青绿脱节，
  // 这里按明暗模式取基础主题再把品牌色与页面底色换成本项目的 token
  const navigationTheme = useMemo(() => {
    const base = colorScheme === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: colorScheme === "dark",
      colors: {
        ...base.colors,
        primary: theme.primary,
        background: theme.canvas,
        card: theme.surface,
        border: theme.border,
        text: theme.text,
        notification: theme.danger,
      },
    };
  }, [colorScheme, theme]);

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
    <ThemeProvider value={navigationTheme}>
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
