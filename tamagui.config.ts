import { defaultConfig } from "@tamagui/config/v6";
import { createTamagui } from "tamagui";

import { Colors, Fonts, Radius, Spacing } from "@/constants/theme";

/**
 * Tamagui 配置 —— 项目 UI 的基座。
 *
 * 2026-10-19 起 Tamagui 是默认 UI 层：屏幕里直接 `import { View, Text, Button … }
 * from "tamagui"`，不再经过项目自己的封装组件。但**设计 token 仍然只有一份**：
 * 这里的颜色 / 间距 / 圆角全部从 `@/constants/theme` 映射，那仍是唯一权威，
 * 本文件不允许出现任何字面量颜色。
 *
 * 要做三件事：
 * 1. 把 theme.ts 的扁平语义色逐个装进 light / dark 两个 theme —— Tamagui 靠
 *    theme 名切换明暗，`TamaguiProvider` 的 `defaultTheme` 跟着系统配色走；
 * 2. 给 Button 的 sm / md / lg 三档尺寸接上项目的字号、间距与圆角
 *    （默认配置是 tailwind 数字档，与 design/ 的 15/17px、Spacing 对不上）；
 * 3. 补一套项目语义名的 space / radius token，屏幕里写 `three` / `card`。
 *
 * 屏幕里写半透明色（`withAlpha(theme.danger, 0.06)` 那类）仍走
 * `@/utils/color` + `useTheme()`：那是算出来的值，不是设计 token，不往这里塞。
 *
 * 还有一条 native 特有的语义坑：**`Text` 的 `lineHeight` 给裸数字会被当成
 * fontSize 的倍数**（@tamagui/web 的 nativeTextMetrics：`style.lineHeight =
 * fontSize * lineHeight`），只有带 px 后缀的字符串才是绝对像素。要设计稿的
 * 绝对行高一律写 `lineHeight="58px"` —— 首页大日期曾因 `lineHeight={58}`
 * 被撑成 56×58=3248pt、把整屏内容顶出视口（2026-10-20 修复，全仓已统一）。
 */

/** light / dark 两份色表键名一致、取值不同，参数收并集 */
type Scheme = (typeof Colors)["light"] | (typeof Colors)["dark"];

/**
 * theme 键名分两类，都不能改：
 * - 连字符形式（background / border-color / outline-color…）是 Tamagui 内置样式
 *   读的，Button / Input 的底、悬停、按压、焦点环全走它们；
 * - 其余是主题色表，屏幕里写 `primary` / `textSecondary` 这类**裸名**时查的就是这些
 *   （v3 的 token 引用不带 `$`，写 `$primary` 只会拿到一条 warn 且解析不出颜色），
 *   与 `src/constants/theme.ts` 的键一一对应（驼峰保留原样）。
 */
function buildTheme(c: Scheme): Record<string, string> {
  return {
    // ── Tamagui 内置样式消费的键 ──
    background: c.surface,
    "background-hover": c.backgroundElement,
    "background-press": c.backgroundSelected,
    "background-focus": c.backgroundElement,
    color: c.text,
    "color-hover": c.text,
    "color-press": c.textSecondary,
    "border-color": c.border,
    "border-color-hover": c.border,
    "border-color-press": c.border,
    "outline-color": c.primary,
    "placeholder-color": c.textSecondary,
    "accent-background": c.primary,
    "accent-color": c.onPrimary,

    // ── 主题色表（theme.ts 扁平键 1:1） ──
    text: c.text,
    textSecondary: c.textSecondary,
    canvas: c.canvas,
    surface: c.surface,
    border: c.border,
    primary: c.primary,
    onPrimary: c.onPrimary,
    primarySoft: c.primarySoft,
    onFilled: c.onFilled,
    backgroundElement: c.backgroundElement,
    backgroundSelected: c.backgroundSelected,
    success: c.success,
    successSoft: c.successSoft,
    successStrong: c.successStrong,
    warning: c.warning,
    warningSoft: c.warningSoft,
    warningStrong: c.warningStrong,
    danger: c.danger,
    dangerSoft: c.dangerSoft,
    dangerStrong: c.dangerStrong,
    onGlassChipActive: c.onGlassChipActive,
    onGlassChipInactive: c.onGlassChipInactive,
  };
}

/** 间距：保留默认配置的数字档，补一套项目语义名（Spacing 的键） */
const space = {
  ...defaultConfig.tokens.space,
  half: Spacing.half,
  one: Spacing.one,
  two: Spacing.two,
  three: Spacing.three,
  four: Spacing.four,
  five: Spacing.five,
  screen: Spacing.screen,
  cardGap: Spacing.cardGap,
  rowGap: Spacing.rowGap,
};

/** 圆角：默认配置只有 tailwind 数字档，补项目四档 */
const radius = {
  ...defaultConfig.tokens.radius,
  tile: Radius.tile,
  card: Radius.card,
  promo: Radius.promo,
  pill: Radius.pill,
};

/**
 * 按钮字号 / 行高。默认配置的字号表最大到 16，且行高是 tailwind 的比例值，
 * 与项目「15px 正文、17px 强调」的固定字阶对不上，这里显式补三档。
 */
const buttonTypeScale = {
  size: { "14": 14, "15": 15, "17": 17 },
  lineHeight: { "14": 20, "15": 22, "17": 24 },
};

/**
 * 等宽字体：设置页行尾的数值用（design/settings.html 的 .setting-action）。
 * family 直接取 theme.ts 的 Fonts.mono，仍是单一来源。
 */
const monoFont = {
  ...defaultConfig.fonts.body,
  family: Fonts.mono,
};

function withButtonTypeScale(font: { size: object; lineHeight: object }) {
  return {
    ...font,
    size: { ...font.size, ...buttonTypeScale.size },
    lineHeight: { ...font.lineHeight, ...buttonTypeScale.lineHeight },
  };
}

/**
 * 三档尺寸 → 项目的字号 / 间距 / 圆角。
 * paddingVertical 与 GlassHostButton 对齐（md 用 Spacing.three）。
 */
const sizing = {
  ...defaultConfig.sizing,
  sizes: {
    ...defaultConfig.sizing.sizes,
    sm: {
      fontSize: "14",
      controlFontSize: "14",
      paddingInline: "three",
      paddingBlock: "two",
      gap: "two",
      radius: "pill",
    },
    md: {
      fontSize: "15",
      controlFontSize: "15",
      paddingInline: "four",
      paddingBlock: "three",
      gap: "two",
      radius: "card",
    },
    lg: {
      fontSize: "17",
      controlFontSize: "17",
      paddingInline: "five",
      paddingBlock: "three",
      gap: "two",
      radius: "card",
    },
  },
};

// 注意：增强要用「入参类型」而不是 createTamagui 的返回类型 —— 后者带
// parsed / tokensParsed / themeConfig 等内部字段，拿它增强 TamaguiCustomConfig
// 会把整套样式 prop 的类型推导压塌（alignItems / height / borderRadius 全部消失）
const configInput = {
  ...defaultConfig,
  tokens: {
    ...defaultConfig.tokens,
    space,
    radius,
  },
  fonts: {
    body: withButtonTypeScale(defaultConfig.fonts.body),
    heading: withButtonTypeScale(defaultConfig.fonts.heading),
    mono: monoFont,
  },
  sizing,
  // 只保留本项目用得到的 theme。Button 内部会把内容包一层
  // `Theme name="level2"`（嵌套表面），缺了它就退化成外层主题，
  // 这里显式给一份同值的，行为更可预期
  themes: {
    light: buildTheme(Colors.light),
    dark: buildTheme(Colors.dark),
    light_level2: buildTheme(Colors.light),
    dark_level2: buildTheme(Colors.dark),
  },
};

export const tamaguiConfig = createTamagui(configInput);

export default tamaguiConfig;

export type Conf = typeof configInput;

declare module "tamagui" {
  interface TamaguiCustomConfig extends Conf {}
}
