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
    // 品牌主色：青绿（健康、平静），用于主按钮、激活 tab、强调链接
    primary: "#0F766E",
    onPrimary: "#FFFFFF",
    primarySoft: "#E6F4F1",
    // 服药状态：已服 / 即将到期 / 漏服
    success: "#16A34A",
    successSoft: "#EAF6EE",
    warning: "#D97706",
    warningSoft: "#FDF3E3",
    danger: "#DC2626",
    dangerSoft: "#FDECEC",
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
    success: "#4ADE80",
    successSoft: "#132B1C",
    warning: "#FBBF24",
    warningSoft: "#33260B",
    danger: "#F87171",
    dangerSoft: "#331616",
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
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
