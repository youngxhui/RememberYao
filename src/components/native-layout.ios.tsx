import { TabView } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  clipShape,
  controlSize,
  createModifier,
  fixedSize,
  frame,
  listRowInsets,
  tabViewStyle,
} from "@expo/ui/swift-ui/modifiers";
import { Children, isValidElement, type ReactElement } from "react";

import type {
  NativeButtonModifiers,
  NativeContinuousShape,
  NativeConcentricShape,
  NativeFieldModifiers,
  NativeLayoutOptions,
  NativeOnboardingPagerComponent,
  NativeOnboardingPagerProps,
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
