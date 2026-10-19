import { NativeTabs } from "expo-router/native-tabs";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/i18n";
import { withAlpha } from "@/utils/color";

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

  // 每个 tab 一套「默认 / 选中」位图，按明暗切换。iOS 与 Android 共用同一批
  // require，只是递交方式不同（见下面 unstable_nativeProps 的注释）。
  const homeIcon =
    scheme === "dark"
      ? require("@/assets/images/tab-icons/home-dark.png")
      : require("@/assets/images/tab-icons/home.png");
  const homeSelectedIcon =
    scheme === "dark"
      ? require("@/assets/images/tab-icons/home-selected-dark.png")
      : require("@/assets/images/tab-icons/home-selected.png");
  const medicaIcon =
    scheme === "dark"
      ? require("@/assets/images/tab-icons/medica-dark.png")
      : require("@/assets/images/tab-icons/medica.png");
  const medicaSelectedIcon =
    scheme === "dark"
      ? require("@/assets/images/tab-icons/medica-selected-dark.png")
      : require("@/assets/images/tab-icons/medica-selected.png");
  const profileIcon =
    scheme === "dark"
      ? require("@/assets/images/tab-icons/profile-dark.png")
      : require("@/assets/images/tab-icons/profile.png");
  const profileSelectedIcon =
    scheme === "dark"
      ? require("@/assets/images/tab-icons/profile-selected-dark.png")
      : require("@/assets/images/tab-icons/profile-selected.png");
  const playgroundIcon =
    scheme === "dark"
      ? require("@/assets/images/tab-icons/playground-dark.png")
      : require("@/assets/images/tab-icons/playground.png");
  const playgroundSelectedIcon =
    scheme === "dark"
      ? require("@/assets/images/tab-icons/playground-selected-dark.png")
      : require("@/assets/images/tab-icons/playground-selected.png");

  return (
    <NativeTabs
      backgroundColor={colors.canvas}
      tintColor={colors.primary}
      indicatorColor={colors.primarySoft}
      // Android 点按波纹的默认值是 Color.android.dynamic.primary —— Material You
      // 的壁纸取色，跟品牌色无关，于是换张壁纸波纹就变色。显式给一个 primary 的
      // 浅波纹（与 playground 里 android_ripple 同口径），波纹色才跟主题走
      rippleColor={withAlpha(colors.primary, 0.25)}
    >
      {/* 四个 tab 的图标统一走位图：几何与配色由 scripts/generate-tab-icons.js 从
          Hugeicons SVG 栅成 24/48/72 三倍率（改 theme.ts 的 primary / canvas 后重跑）。

          选中态按参考截图做双色：描边用主题色 primary，封闭区填 primary 混 30% canvas
          的淡色。tab 栏图标由原生渲染，不吃 SVG 也不吃 React 元素，只能走 src；而 iOS 的
          UIImage 只有 template（整图当单色掩码、tab 栏统一染色）和 original（保留图自身
          颜色）两档，react-native-screens 又要求 icon 与 selectedIcon 解析成同一种类型
          —— 双色只能整颗烘进位图，未选中态因此也不跟随 tint，描边按模式照着 UIKit 给
          SF Symbol 的颜色烘（亮 #8E8E93 / 暗 #FFFFFF）。现在四个 tab 全是这套位图，
          这两色就是全部的未选中观感，要调只改脚本里的 UNSELECTED_STROKE。

          Android 与 iOS 共用同一套位图，但递交方式不同：
          - iOS 走 Trigger.Icon 的 src + renderingMode="original"（original 档保留图自身颜色）。
          - Android 不能这么干：expo-router 的 Android 图标转换器只把 src 转成
            imageSource，renderingMode 被整个丢掉，也不透出 react-native-screens 的
            tinting:"original" —— BottomNavigationView 的 itemIconTintList 会把整张图
            染成单色，双色细节（封闭区淡色 vs 描边）全部糊成一片。所以借
            unstable_nativeProps 把图标描述符直接递给原生侧，tinting:"original" 会让
            原生用 NoTintDrawable 包一层、屏蔽 tint，观感与 iOS 一致。
            NativeTabsView.android 里 nativeProps.android 后展开，优先级高于 Icon 的
            src；iOS 侧整个 android 键被忽略（NativeTabsView.ios 只读 nativeProps.ios），
            两边互不干扰。注意这是 unstable API，升级 Expo SDK 后要复验这条链路。 */}
      <NativeTabs.Trigger
        name="home"
        testID="home-tab"
        unstable_nativeProps={{
          android: {
            icon: {
              type: "imageSource",
              imageSource: homeIcon,
              tinting: "original",
            },
            selectedIcon: {
              type: "imageSource",
              imageSource: homeSelectedIcon,
              tinting: "original",
            },
          },
        }}
      >
        <NativeTabs.Trigger.Label>{t("tab.home")}</NativeTabs.Trigger.Label>
        {/* 选中态填房子外形，门用 evenodd 挖成洞，露出后面的 tab 栏底色 */}
        <NativeTabs.Trigger.Icon
          src={{ default: homeIcon, selected: homeSelectedIcon }}
          renderingMode="original"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="medica"
        testID="medica-tab"
        unstable_nativeProps={{
          android: {
            icon: {
              type: "imageSource",
              imageSource: medicaIcon,
              tinting: "original",
            },
            selectedIcon: {
              type: "imageSource",
              imageSource: medicaSelectedIcon,
              tinting: "original",
            },
          },
        }}
      >
        <NativeTabs.Trigger.Label>{t("tab.medica")}</NativeTabs.Trigger.Label>
        {/* 选中态只填箱体：提手是开放路径，填了会多一条贴着箱顶的色带 */}
        <NativeTabs.Trigger.Icon
          src={{ default: medicaIcon, selected: medicaSelectedIcon }}
          renderingMode="original"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="profile"
        testID="profile-tab"
        unstable_nativeProps={{
          android: {
            icon: {
              type: "imageSource",
              imageSource: profileIcon,
              tinting: "original",
            },
            selectedIcon: {
              type: "imageSource",
              imageSource: profileSelectedIcon,
              tinting: "original",
            },
          },
        }}
      >
        <NativeTabs.Trigger.Label>{t("tab.profile")}</NativeTabs.Trigger.Label>
        {/* 选中态填外圆环，头用 evenodd 挖成洞；肩是开放路径，不填 */}
        <NativeTabs.Trigger.Icon
          src={{ default: profileIcon, selected: profileSelectedIcon }}
          renderingMode="original"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="playground"
        testID="playground-tab"
        unstable_nativeProps={{
          android: {
            icon: {
              type: "imageSource",
              imageSource: playgroundIcon,
              tinting: "original",
            },
            selectedIcon: {
              type: "imageSource",
              imageSource: playgroundSelectedIcon,
              tinting: "original",
            },
          },
        }}
      >
        <NativeTabs.Trigger.Label>
          {t("tab.playground")}
        </NativeTabs.Trigger.Label>
        {/* 选中态填六边形轮廓，内部三条棱与顶/底细节画在填充之上 */}
        <NativeTabs.Trigger.Icon
          src={{ default: playgroundIcon, selected: playgroundSelectedIcon }}
          renderingMode="original"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
