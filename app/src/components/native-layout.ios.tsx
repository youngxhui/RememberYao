import { TabView } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  controlSize,
  frame,
  tabViewStyle,
} from "@expo/ui/swift-ui/modifiers";
import { Children, isValidElement, type ReactElement } from "react";

import type {
  NativeButtonModifiers,
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
  if (idealWidth) return { $type: "fixedSize", horizontal: true } as const;
  return {
    $type: "frame",
    minWidth: unconstrainedWidth ? 0 : undefined,
    maxWidth: fullWidth || unconstrainedWidth ? Infinity : undefined,
    maxHeight: fullHeight ? Infinity : undefined,
  } as const;
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
