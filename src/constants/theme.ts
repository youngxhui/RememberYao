/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from "react-native";

export const Colors = {
  light: {
    text: "#000000",
    background: "#ffffff",
    backgroundElement: "#F0F0F3",
    backgroundSelected: "#E0E1E6",
    textSecondary: "#60646C",
    // 页面底色（design/today.html 的 --bg）：比卡片底色略深的冷调浅绿，
    // 白色卡片靠它与页面拉开层次。background 保留给系统页面底色，不要混用
    canvas: "#F0F4F2",
    // 卡片 / 浮层底色（--surface）
    surface: "#FFFFFF",
    // 描边与分隔线（--border）
    border: "#E2E8E5",
    // 品牌主色：青绿（健康、平静），用于主按钮、激活 tab、强调链接
    primary: "#0F766E",
    onPrimary: "#FFFFFF",
    primarySoft: "#E6F4F1",
    // 液态玻璃 chip 的文字色。玻璃的明暗由背后的页面底色决定，不随明暗模式翻面，
    // 所以两端共用同一组值（同 archive 的「纸与印刷色」是实物）：
    // 选中态底是品牌色玻璃（偏深）配白字，未选中态是透明玻璃（偏亮）配黑字
    onGlassChipActive: "#FFFFFF",
    onGlassChipInactive: "#000000",
    // 服药状态：已服 / 即将到期 / 漏服
    success: "#16A34A",
    successSoft: "#EAF6EE",
    warning: "#D97706",
    warningSoft: "#FDF3E3",
    danger: "#DC2626",
    dangerSoft: "#FDECEC",
    // 实心填充用的深色档（--*-strong）：状态圆点、反色按钮要「填色 + 白字」，
    // 用浅色档会糊。暗色模式沿用同一深色值，与设计稿一致
    successStrong: "#047857",
    warningStrong: "#B45309",
    dangerStrong: "#DC2626",
    // 泡罩铝箔（数字孪生的药板）：铝箔纸是冷银、不随明暗翻面的“实物”，
    // 但暗色下要压暗才不刺眼 —— base 是箔身、highlight 是泡罩受光面、
    // shade 是压圈/暗部、dent 是服后的坑、ring 是热压封边。
    // metal/seal/plastic/hole 是渐变色标：iOS 走 nativeGradientBackground
    // 铺真渐变（Compose 的 modifiers 包没有 background，Android 退化平色，
    // 体积感靠同心圆分层保留）。光源统一在左上（LIGHT），所有渐变中心都按它算
    foil: {
      base: "#E9ECEF",
      highlight: "#F7F8FA",
      shade: "#C3C9D1",
      dent: "#DDE1E6",
      ring: "#AEB5BF",
      // 铝箔的各向异性金属：主高光 + 副高光两道，冷银调
      metal: ["#F5F7F9", "#E7EBEF", "#D4DAE0", "#E4E9ED", "#CBD2D9"],
      // 热封边：比箔身略暗略冷的一圈平环
      seal: ["#DFE4EA", "#CBD2DA", "#BCC5CE"],
      // 泡罩：透明塑料的径向受光，中心偏左上，边缘（泡壁掠射角）压最暗
      plastic: ["#FFFFFF", "#FCFDFE", "#EAEFF4", "#CCD4DD", "#B9C3CE"],
      // 凹坑：顶破的泡罩口，坑底暗、翻卷的箔口亮
      hole: ["#7E8894", "#A9B2BC", "#C9D0D8", "#DDE2E7"],
    },
    // Mini Archive 收藏夹：主题青绿封面 + 米白纸说明书
    archive: {
      coverTop: "#4CC9B9",
      coverBottom: "#0D9488",
      tab: "#2BB0A2",
      back: "#0F766E",
      ink: "#06302B",
      inkMuted: "#3F7D74",
      line: "rgba(6,48,43,0.16)",
      shadow: "rgba(13,148,136,0.30)",
      shadowStrong: "rgba(13,148,136,0.42)",
      paper: "#FFFDF4",
      stampInk: "#4A3417",
      stampMuted: "#8A7440",
      stampEdge: "rgba(74,52,23,0.32)",
      stampShadow: "rgba(60,40,10,0.40)",
      artTop: "#17B8A6",
    },
    // 提醒堆叠卡（design/today.html 的 --promo-*）：独立于语义色的展示 token ——
    // 磨砂卡底 / 墨色 / 副文本 / 玻璃棱线与反色主按钮，暗色模式成组切换
    promo: {
      bg: "#F6F3EA",
      ink: "#14161A",
      sub: "#8B9096",
      line: "rgba(20,22,26,0.08)",
      dot: "#C9CFD4",
      btnBg: "#14161A",
      btnFg: "#FFFFFF",
      edge: "rgba(255,255,255,0.50)",
      hi: "rgba(255,255,255,0.55)",
      sheen: "rgba(255,255,255,0.32)",
    },
  },
  dark: {
    text: "#ffffff",
    background: "#000000",
    backgroundElement: "#212225",
    backgroundSelected: "#2E3135",
    textSecondary: "#B0B4BA",
    primary: "#2DD4BF",
    onPrimary: "#062B27",
    primarySoft: "#14312D",
    // 同 light：玻璃 chip 的文字色不随明暗模式翻面
    onGlassChipActive: "#FFFFFF",
    onGlassChipInactive: "#000000",
    success: "#4ADE80",
    successSoft: "#132B1C",
    warning: "#FBBF24",
    warningSoft: "#33260B",
    danger: "#F87171",
    dangerSoft: "#331616",
    successStrong: "#047857",
    warningStrong: "#B45309",
    dangerStrong: "#DC2626",
    // 同 light 的 foil：暗色下整组压暗，泡罩仍读得出“银箔上的凸起”
    foil: {
      base: "#26282C",
      highlight: "#3A3D43",
      shade: "#17181B",
      dent: "#1F2125",
      ring: "#3F434A",
      metal: ["#3B3E44", "#2F3237", "#282A2E", "#2D3035", "#232529"],
      seal: ["#34373C", "#2B2E32", "#24262A"],
      plastic: ["#9BA4AF", "#87909B", "#727B87", "#5D6570", "#4C535C"],
      hole: ["#0F1114", "#1B1E22", "#25282D", "#2C3035"],
    },
    canvas: "#0A0A0C",
    surface: "#1C1C1E",
    border: "#2C2C2E",
    // Mini Archive 收藏夹：主题青绿封面 + 米白纸说明书。
    // 纸与印刷色是“实物”，不随明暗模式改变；只有封面/墨色/阴影跟随主题
    archive: {
      coverTop: "#14857A",
      coverBottom: "#0F766E",
      tab: "#0E6B62",
      back: "#0B544E",
      ink: "#D9F2EE",
      inkMuted: "#8FC9C0",
      line: "rgba(217,242,238,0.16)",
      shadow: "rgba(0,0,0,0.50)",
      shadowStrong: "rgba(0,0,0,0.62)",
      paper: "#FFFDF4",
      stampInk: "#4A3417",
      stampMuted: "#8A7440",
      stampEdge: "rgba(74,52,23,0.32)",
      stampShadow: "rgba(60,40,10,0.40)",
      artTop: "#17B8A6",
    },
    // 同键异值，取设计稿 dark 覆盖：米白纸底换成墨底，按钮反色
    promo: {
      bg: "#1E1E20",
      ink: "#F5F5F7",
      sub: "#8E8E93",
      line: "rgba(255,255,255,0.10)",
      dot: "#48484A",
      btnBg: "#F5F5F7",
      btnFg: "#14161A",
      edge: "rgba(255,255,255,0.16)",
      hi: "rgba(255,255,255,0.14)",
      sheen: "rgba(255,255,255,0.07)",
    },
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
  /** 屏幕左右边距（design/today.html 的 .pad 20px） */
  screen: 20,
  /** 卡片之间的窄缝（design/profile.html 的 .stats-grid / .family-list gap 10px） */
  cardGap: 10,
  /** 图标 / 徽章与文字之间（design/profile.html 的 .menu-item / .family-card gap 12px） */
  rowGap: 12,
} as const;

/** 圆角档位（design/today.html 的 --radius-card 与各区块内联值） */
export const Radius = {
  /** 图标底块 / 提示条 */
  tile: 10,
  /** 卡片 */
  card: 18,
  /** 提醒卡堆叠 */
  promo: 28,
  /** 胶囊、圆形按钮 */
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
