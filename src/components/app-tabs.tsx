import { NativeTabs } from "expo-router/native-tabs";

import { useColorScheme } from "@/hooks/use-color-scheme";
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
  const scheme = useColorScheme();
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
        {/* 试用：首页 tab 换成 Hugeicons 的 Home，选中态按参考截图做双色 ——
            描边用主题色 primary，封闭区填 primary 混 30% canvas 的淡色，门留成「洞」
            露出后面的 tab 栏底色。几何与配色由 scripts/generate-tab-icons.js 栅成
            24/48/72 三倍率位图；改 theme.ts 的 primary / canvas 后重跑那个脚本。

            为什么两个状态共用 renderingMode="original"：iOS 的 UIImage 只有 template
            （整图当单色掩码、tab 栏统一染色）和 original（保留图自身颜色）两档，双色
            只能整颗烘进去；而 react-native-screens 要求 icon 与 selectedIcon 解析成
            同一种类型，所以未选中态也一起保色 —— 它的描边因此固定成 iOS systemGray，
            不再跟随 tintColor。选中态的 label 仍会变 primary，选中感不止靠图标。

            md 留着给 Android：Android 上 md 优先于 src，且那里的图片图标会被 tint
            压成单色（tinting: "original" expo-router 没透出），双色只有 iOS 有。 */}
        <NativeTabs.Trigger.Icon
          md="home"
          src={{
            default: require("@/assets/images/tab-icons/home.png"),
            selected:
              scheme === "dark"
                ? require("@/assets/images/tab-icons/home-selected-dark.png")
                : require("@/assets/images/tab-icons/home-selected.png"),
          }}
          renderingMode="original"
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
