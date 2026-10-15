import { NativeTabs } from "expo-router/native-tabs";

import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/i18n";

// 由 src/app/(tabs)/_layout.tsx 渲染，trigger name 用组内相对路由名。
// tab 数量以 design/ 设计稿为准：3 个（首页 / 药品 / 我的）。
// playground 是内部调试屏，归入 (tabs) 组后用 NativeTabs.Trigger 直接承载，
// 开发时可见，发布时可通过条件控制隐藏。
export default function AppTabs() {
  // tab 栏与业务区共用同一套 token：激活色走 primary，底色跟页面 canvas 齐平，
  // 否则纯白 tab 栏贴在 canvas 页面上会明显断开（background 是系统级纯白/纯黑）
  const colors = useTheme();
  // Trigger.Label 虽是组件，children 收的是 string，这里 t() 的返回值直接可用
  const t = useTranslation();

  return (
    <NativeTabs
      backgroundColor={colors.canvas}
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

      <NativeTabs.Trigger name="playground" testID="playground-tab">
        <NativeTabs.Trigger.Label>
          {t("tab.playground")}
        </NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "hammer", selected: "hammer.fill" }}
          md="construction"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
