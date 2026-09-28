import { NativeTabs } from "expo-router/native-tabs";
import { useColorScheme } from "react-native";

import { Colors } from "@/constants/theme";
import { useTranslation } from "@/i18n";

// 由 src/app/(tabs)/_layout.tsx 渲染，trigger name 用组内相对路由名。
// tab 数量以 design/ 设计稿为准：生产 3 个（首页 / 药品 / 我的）。playground 是内部调试屏，
// 用 __DEV__ 包住只在 debug 构建出现；__DEV__ 进程内恒定，不算「运行时增删 tab」。
export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === null ? "light" : scheme];
  // Trigger.Label 虽是组件，children 收的是 string，这里 t() 的返回值直接可用
  const t = useTranslation();

  return (
    <NativeTabs
      backgroundColor={colors.background}
      tintColor={colors.primary}
      indicatorColor={colors.primarySoft}
    >
      <NativeTabs.Trigger name="home" testID="home-tab">
        <NativeTabs.Trigger.Label>{t("tab.home")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "house", selected: "house.fill" }}
          md="home"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="medica" testID="medica-tab">
        <NativeTabs.Trigger.Label>{t("tab.medica")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "pills", selected: "pills.fill" }}
          md="medication"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile" testID="profile-tab">
        <NativeTabs.Trigger.Label>{t("tab.profile")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "person", selected: "person.fill" }}
          md="person"
        />
      </NativeTabs.Trigger>

      {__DEV__ ? (
        <NativeTabs.Trigger name="playground" testID="playground-tab">
          <NativeTabs.Trigger.Label>
            {t("tab.playground")}
          </NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "hammer", selected: "hammer.fill" }}
            md="construction"
          />
        </NativeTabs.Trigger>
      ) : null}
    </NativeTabs>
  );
}
