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
  /**
   * 按内容固有宽度排布，且不参与压缩（iOS `fixedSize(horizontal:)`、
   * Compose `wrapContentWidth`）。给「宽度不能被挤、内容不能折行」的胶囊类控件用：
   * 不加的话行内文字会先折行或截断，而不是让同行的可压缩列让位。
   */
  idealWidth?: boolean;
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

/**
 * 同心圆角（iOS 26 Liquid Glass）。
 *
 * 让内嵌卡片的外角半径跟随外层容器：卡片离屏幕边缘越近，圆角越大、与屏幕
 * 弧线同心，而不是所有卡片统一一个写死的圆角值。
 *
 * `fallbackRadius` 必须传「改造前 `borderRadius` 的同一个值」——
 * `ContainerRelativeShape` 依赖「最近的容器提供形状」才能算出半径，
 * 在 `ScrollView` 里未必能解析到屏幕圆角，解析失败时会退化成直角。
 * 带上兜底值，最坏情况也只是回到改造前的圆角，不会变成方角。
 */
export type NativeConcentricShape = (
  fallbackRadius: number,
) => NativeModifier[];

/**
 * 连续曲线圆角：iOS `RoundedRectangle(cornerRadius:, style: .continuous)`，
 * 等价 RN 的 `borderCurve: "continuous"`（AGENTS.md UI 规则 9）。
 *
 * universal style 的 `borderRadius` 只会生成 `.circular` 的
 * RoundedRectangle，圆弧角在 iOS 上比系统卡片「硬」，这就是「圆角不自然」的来源。
 * 这里显式指定半径：`nativeConcentricShape` 的半径由「最近的容器」算出，卡片
 * 处在宽度由 Spacer / Row 决定的容器里时解析不到有限尺寸，会退化成胶囊形
 * （真机实测：三等分统计卡直接变药丸），所以卡片一律用本函数指定死半径。
 */
export type NativeContinuousShape = (radius: number) => NativeModifier[];

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

export const nativeConcentricShape: NativeConcentricShape = () => [];

// web / 兜底实现：不加 modifier，style 里的 borderRadius 照常生效
export const nativeContinuousShape: NativeContinuousShape = () => [];

function OnboardingPager({ children }: NativeOnboardingPagerProps) {
  return createElement(Fragment, null, children);
}

export const NativeOnboardingPager = Object.assign(OnboardingPager, {
  Tab: ({ children }: NativeOnboardingPagerTabProps) =>
    createElement(Fragment, null, children),
}) satisfies NativeOnboardingPagerComponent;
