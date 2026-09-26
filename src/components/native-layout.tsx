import {
  createElement,
  Fragment,
  type ReactElement,
  type ReactNode,
} from "react";

export type NativeModifier = {
  $type: string;
  [key: string]: unknown;
};

export type NativeLayoutOptions = {
  fullWidth?: boolean;
  fullHeight?: boolean;
  unconstrainedWidth?: boolean;
};

export type NativeButtonOptions =
  | "glass"
  | "glassProminent"
  | "borderedProminent";

export type NativeButtonModifiers = (options?: {
  style?: NativeButtonOptions;
  fullWidth?: boolean;
}) => NativeModifier[];

export type NativeFieldModifiers = (options?: {
  flush?: boolean;
}) => NativeModifier[];

export type NativeOnboardingPagerTabProps = {
  value: string;
  children: ReactNode;
};

export type NativeOnboardingPagerProps = {
  selection: string;
  onSelectionChange: (selection: string) => void;
  children: ReactNode;
};

export type NativeOnboardingPagerComponent = ((
  props: NativeOnboardingPagerProps,
) => ReactElement) & {
  Tab: (props: NativeOnboardingPagerTabProps) => ReactElement;
};

export function nativeLayout(_options: NativeLayoutOptions): NativeModifier {
  return { $type: "nativeLayoutFallback" };
}

export const nativeButtonModifiers: NativeButtonModifiers = () => [];

export const nativeFieldModifiers: NativeFieldModifiers = () => [];

function OnboardingPager({ children }: NativeOnboardingPagerProps) {
  return createElement(Fragment, null, children);
}

export const NativeOnboardingPager = Object.assign(OnboardingPager, {
  Tab: ({ children }: NativeOnboardingPagerTabProps) =>
    createElement(Fragment, null, children),
}) satisfies NativeOnboardingPagerComponent;
