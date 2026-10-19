import { Observe, ObserveRoot } from "expo-observe";
import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { Stack } from "expo-router/stack";
import { useEffect, useMemo } from "react";
import { AppState, StatusBar, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ObserveErrorFallback } from "@/components/observe-error-fallback";
import { useTheme } from "@/hooks/use-theme";
import { I18nProvider, useI18n } from "@/i18n";
import {
  addNotificationResponseListener,
  initNotifications,
  registerLocalizedNotificationTexts,
  syncNotificationsWithStore,
} from "@/lib/notifications";
import { configureRevenueCat } from "@/lib/revenuecat";
import { ensureDefaultPerson, setPostMutationHook } from "@/lib/store";

// 按路由分别上报渲染 / 交互耗时。集成开关运行期不能改（挂载后再调 configure 会抛），
// 必须放在模块作用域，且早于任何屏幕挂载
Observe.configure({
  integrations: { "expo-router": true },
  // 开发构建（npx expo run:ios / development profile）默认不上报，验证集成时
  // 打开这个开关。仅影响 debug 构建，release 不受影响 —— 但上线前必须删掉它，
  // 否则开发机的性能数据会污染仪表盘
  dispatchInDebug: true,
});

/**
 * Observe 根包裹：自动测首屏渲染耗时（TTR），并用错误边界兜住渲染期崩溃
 * （错误连同 React 组件栈一起上报）。用组件形式而不是 `ObserveRoot.wrap()`
 * —— wrap() 传不了 props，也就给不了兜底界面。
 */
export default function ObservedRootLayout() {
  return (
    <ObserveRoot errorBoundaryFallback={ObserveErrorFallback}>
      <SafeAreaProvider>
        <RootLayout />
      </SafeAreaProvider>
    </ObserveRoot>
  );
}

function RootLayout() {
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

  // RevenueCat（应用内购买）：尽早配置，早于任何购买入口。幂等，
  // web 上自动跳过；购买状态由 useSubscription 自己拉取
  useEffect(() => {
    void configureRevenueCat();
  }, []);

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
