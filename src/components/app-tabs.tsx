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
    // 四个 tab 的图标统一走位图：几何与配色由 scripts/generate-tab-icons.js 从
    // Hugeicons SVG 栅成 24/48/72 三倍率（改 theme.ts 的 primary / canvas 后重跑）。
    //
    // 选中态按参考截图做双色：描边用主题色 primary，封闭区填 primary 混 30% canvas
    // 的淡色。tab 栏图标由原生渲染，不吃 SVG 也不吃 React 元素，只能走 src；而 iOS 的
    // UIImage 只有 template（整图当单色掩码、tab 栏统一染色）和 original（保留图自身
    // 颜色）两档，react-native-screens 又要求 icon 与 selectedIcon 解析成同一种类型
    // —— 双色只能整颗烘进位图，未选中态因此也不跟随 tint，描边按模式照着 UIKit 给
    // SF Symbol 的颜色烘（亮 #8E8E93 / 暗 #FFFFFF）。现在四个 tab 全是这套位图，
    // 这两色就是全部的未选中观感，要调只改脚本里的 UNSELECTED_STROKE。
    //
    // md 留着给 Android：那里 md 优先于 src，且图片图标会被 tint 压成单色
    // （tinting: "original" expo-router 没透出），双色只有 iOS 有。
    <NativeTabs
      backgroundColor={colors.canvas}
      tintColor={colors.primary}
      indicatorColor={colors.primarySoft}
    >
      <NativeTabs.Trigger name="home" testID="home-tab">
        <NativeTabs.Trigger.Label>{t("tab.home")}</NativeTabs.Trigger.Label>
        {/* 选中态填房子外形，门用 evenodd 挖成洞，露出后面的 tab 栏底色 */}
        <NativeTabs.Trigger.Icon
          md="home"
          src={{
            default:
              scheme === "dark"
                ? require("@/assets/images/tab-icons/home-dark.png")
                : require("@/assets/images/tab-icons/home.png"),
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
        {/* 选中态只填箱体：提手是开放路径，填了会多一条贴着箱顶的色带 */}
        <NativeTabs.Trigger.Icon
          md="medication"
          src={{
            default:
              scheme === "dark"
                ? require("@/assets/images/tab-icons/medica-dark.png")
                : require("@/assets/images/tab-icons/medica.png"),
            selected:
              scheme === "dark"
                ? require("@/assets/images/tab-icons/medica-selected-dark.png")
                : require("@/assets/images/tab-icons/medica-selected.png"),
          }}
          renderingMode="original"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile" testID="profile-tab">
        <NativeTabs.Trigger.Label>{t("tab.profile")}</NativeTabs.Trigger.Label>
        {/* 选中态填外圆环，头用 evenodd 挖成洞；肩是开放路径，不填 */}
        <NativeTabs.Trigger.Icon
          md="person"
          src={{
            default:
              scheme === "dark"
                ? require("@/assets/images/tab-icons/profile-dark.png")
                : require("@/assets/images/tab-icons/profile.png"),
            selected:
              scheme === "dark"
                ? require("@/assets/images/tab-icons/profile-selected-dark.png")
                : require("@/assets/images/tab-icons/profile-selected.png"),
          }}
          renderingMode="original"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="playground" testID="playground-tab">
        <NativeTabs.Trigger.Label>
          {t("tab.playground")}
        </NativeTabs.Trigger.Label>
        {/* 选中态填六边形轮廓，内部三条棱与顶/底细节画在填充之上 */}
        <NativeTabs.Trigger.Icon
          md="construction"
          src={{
            default:
              scheme === "dark"
                ? require("@/assets/images/tab-icons/playground-dark.png")
                : require("@/assets/images/tab-icons/playground.png"),
            selected:
              scheme === "dark"
                ? require("@/assets/images/tab-icons/playground-selected-dark.png")
                : require("@/assets/images/tab-icons/playground-selected.png"),
          }}
          renderingMode="original"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
