import { TabView } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  clipShape,
  controlSize,
  createModifier,
  fixedSize,
  frame,
  glassEffect,
  listRowInsets,
  tabViewStyle,
} from "@expo/ui/swift-ui/modifiers";
import { Children, isValidElement, type ReactElement } from "react";

import type {
  NativeButtonModifiers,
  NativeChipModifiers,
  NativeContinuousShape,
  NativeConcentricShape,
  NativeFieldModifiers,
  NativeLayoutOptions,
  NativeOnboardingPagerComponent,
  NativeOnboardingPagerProps,
  NativeStrokeBorder,
} from "@/components/native-layout";

export function nativeLayout({
  fullWidth = false,
  fullHeight = false,
  unconstrainedWidth = false,
  idealWidth = false,
}: NativeLayoutOptions) {
  if (idealWidth) return fixedSize({ horizontal: true });
  return frame({
    minWidth: unconstrainedWidth ? 0 : undefined,
    maxWidth: fullWidth || unconstrainedWidth ? Infinity : undefined,
    maxHeight: fullHeight ? Infinity : undefined,
  });
}

export const nativeButtonModifiers: NativeButtonModifiers = ({
  style,
  fullWidth = false,
} = {}) => {
  const modifiers = [controlSize("large")];
  if (style) modifiers.unshift(buttonStyle(style));
  if (fullWidth) modifiers.push(frame({ maxWidth: Infinity }));
  return modifiers;
};

export const nativeFieldModifiers: NativeFieldModifiers = ({
  flush = false,
} = {}) =>
  flush ? [listRowInsets({ leading: 0, trailing: 0, top: 0, bottom: 0 })] : [];

export const nativeConcentricShape: NativeConcentricShape = (
  fallbackRadius: number,
) => [clipShape("containerRelativeShape", fallbackRadius)];

// clipShape('continuous')：JS 侧 helper 没暴露 roundedCornerStyle，直接拼
// modifier 配置 —— 原生 ClipShapeModifier 收 roundedCornerStyle 字段
export const nativeContinuousShape: NativeContinuousShape = (
  radius: number,
) => [
  createModifier("clipShape", {
    shape: "roundedRectangle",
    cornerRadius: radius,
    roundedCornerStyle: "continuous",
  }),
];

/**
 * 连续曲线圆角描边：直接拼 `strokeBorder` 的 modifier 配置。
 *
 * JS 侧 `strokeBorder` factory 同样没暴露 `roundedCornerStyle`（Swift 侧的
 * StrokeBorderModifier 收这个字段），所以和 `nativeContinuousShape` 一样手拼。
 * `style: { lineWidth }` 才是线宽 —— factory 的 `width` 参数不存在。
 */
export const nativeStrokeBorder: NativeStrokeBorder = ({
  color,
  width,
  radius,
}) => [
  createModifier("strokeBorder", {
    content: { type: "color", color },
    style: { lineWidth: width },
    shape: "roundedRectangle",
    cornerRadius: radius,
    roundedCornerStyle: "continuous",
  }),
];

/**
 * iOS 26 液态玻璃 chip。
 *
 * 不套 `GlassEffectContainer`：容器是用来让多个玻璃效果「融合」的，而筛选行的
 * chip 之间有 8pt 间距，本来也融不到一起；单个 `glassEffect` 在容器外同样正常
 * 渲染，少引一个 iOS-only 组件就少一处平台分裂。
 *
 * 不给 `interactive`：它会让玻璃在按压时放大 / 回弹，而筛选 chip 是「看一眼就
 * 点一下」的低调控件，那个形变太抢戏。激活态才给 `tint`：未激活保持透明玻璃，
 * 选中那颗被品牌色染出层次。
 */
export const nativeChipModifiers: NativeChipModifiers = ({ active, tint }) => [
  glassEffect({
    glass: active ? { variant: "regular", tint } : { variant: "regular" },
    shape: "capsule",
  }),
];

function OnboardingPager({
  selection,
  onSelectionChange,
  children,
}: NativeOnboardingPagerProps) {
  const pages = Children.toArray(children).filter(
    isValidElement,
  ) as ReactElement[];
  return (
    <TabView
      selection={selection}
      onSelectionChange={onSelectionChange}
      modifiers={[
        tabViewStyle({ type: "page" }),
        frame({ maxWidth: Infinity, maxHeight: Infinity }),
      ]}
    >
      {pages}
    </TabView>
  );
}

export const NativeOnboardingPager = Object.assign(OnboardingPager, {
  Tab: TabView.Tab,
}) satisfies NativeOnboardingPagerComponent;
